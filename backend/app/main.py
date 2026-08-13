import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import text
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from .database import engine
from .sync import run_sync
from .filters import build_filters, where_clause

log = logging.getLogger("api")

DHAKA = ZoneInfo("Asia/Dhaka")

scheduler = AsyncIOScheduler(timezone=DHAKA)

# Three things can start a sync: boot, the daily job, and the hourly catch-up.
# sync.py drops and recreates every table, so two overlapping runs would race on
# the same DROP — this lock is what keeps that from being possible.
_sync_lock = asyncio.Lock()


# create_task() must be kept alive by a strong reference — the event loop only
# holds a weak one, so a bare call can be collected mid-sync.m
_boot_sync: asyncio.Task | None = None


async def run_sync_async():
    """Run the blocking sync in a threadpool so it never blocks the event loop."""
    if _sync_lock.locked():
        log.info("a sync is already running — skipping this trigger")
        return

    async with _sync_lock:
        try:
            await asyncio.to_thread(run_sync)
        except Exception:
            # Without this the failure is invisible: sync.main()'s handler only
            # covers `python -m app.sync`, so on this path the exception just
            # parks on the Task until garbage collection, if it is ever
            # reported at all.
            log.exception("sync FAILED — Postgres left unchanged")


def _warehouse_report_date():
    """The report date currently loaded in Postgres, or None if unreadable.

    Blocking — call it through asyncio.to_thread.
    """
    with engine.connect() as conn:
        latest = conn.execute(
            text("SELECT MAX(reportpreparationdate) FROM litigation_cases")
        ).scalar()

    if latest is None:
        return None
    # The column is a timestamp, but tolerate a plain date too.
    return latest.date() if hasattr(latest, "date") else latest


async def catch_up_if_stale():
    """Hourly: sync when the warehouse is not already on today's report.

    The daily job only fires if the process happens to be running at that
    minute. This is the safety net for the container being down then — it
    reaches today's data within the hour and is a cheap no-op once current.
    """
    try:
        loaded = await asyncio.to_thread(_warehouse_report_date)
    except Exception:
        # An unreadable warehouse is usually an empty or half-built one, which
        # is exactly when a sync is wanted — but say so rather than sync blind.
        log.exception("could not read the warehouse report date; skipping catch-up")
        return

    today = datetime.now(DHAKA).date()

    if loaded == today:
        log.info("warehouse already on today's report (%s) — no sync needed", loaded)
        return

    log.info("warehouse report date is %s, today is %s — syncing", loaded, today)
    await run_sync_async()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _boot_sync

    scheduler.add_job(
        run_sync_async,
        CronTrigger(hour=15, minute=55, second=0),  # 09:20 UTC = 15:20 Dhaka
        id="daily_sync",
        max_instances=1,
        coalesce=True,
        replace_existing=True,
        # APScheduler defaults this to 1 second: a job even a moment late is
        # dropped with only a "run time was missed" line. A sync holds a thread
        # for minutes, so that default silently skips runs.
        misfire_grace_time=3600,
    )

    # Safety net for the daily job, which cannot fire while the container is
    # down. First run is one hour after start — boot has just synced.
    scheduler.add_job(
        catch_up_if_stale,
        IntervalTrigger(hours=1),
        id="hourly_catch_up",
        max_instances=1,
        coalesce=True,
        replace_existing=True,
        misfire_grace_time=1800,
    )

    scheduler.start()
    # Seed once on boot so the API isn't querying empty tables until 6am.
    # NOTE: uvicorn runs with --reload and backend/app is bind-mounted, so every
    # save of a backend file restarts the app and starts this sync over.
    _boot_sync = asyncio.create_task(run_sync_async())
    yield
    _boot_sync.cancel()
    scheduler.shutdown(wait=False)


app = FastAPI(title="Litigation Dashboard API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # tighten for real deployments
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Opening view == "Clear all" view. One definition, served to the client,
# so the two can never drift apart (FILTERING_ALGORITHM.md §6).
DEFAULTS = {
    "branch": "All",
    "upcoming": "All",
    "products": ["SME"],
    "statuses": ["Active"],
    "warrant": False,
    "q": "",
}


def _rows(result):
    """SQLAlchemy result -> (columns, list-of-dicts)."""
    return list(result.keys()), [dict(r._mapping) for r in result]


# Columns pulled from litigation_cases, split into two logical views but fetched
# in ONE query (same row, same WHERE) to avoid a second round-trip.
_CLIENT_COLS = ["cif", "clientname", "branch"]
_LEGAL_COLS = ["caseid", "nature_of_suit","suit_value","suit_filing_date","law_firm",
               "court_no","plaintiff","plaintiffcif","next_hearing_date",
               "cheque_number","litigation_receivable","aging","present_case_status",
               "litigationstatus"]
_LOAN_COLS = ["accountnumber", "product_category", "stmcode", "stmname", "rmcode",
              "rmname", "monitorbycode", "monitorby", "urpa", "mod",
              "overdue_amount", "principal_od", "interest_od", "lpi",
              "netexcisedutytilllastyear", "netexcisedutytillcurrentyear"]


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/filters")
def get_filter_options(suit: str | None = None):
    """Distinct values for the filter controls, scoped to the current suit."""
    # Scope branch options to the selected suit so the dropdown only offers
    # values that can actually match.
    where, params = build_filters(suit=suit)
    wc = where_clause(where + ["branch IS NOT NULL"])
    try:
        with engine.connect() as conn:
            branches = [r[0] for r in conn.execute(
                text(f"SELECT DISTINCT branch FROM litigation_cases {wc} ORDER BY branch"),
                params,
            )]
            statuses = [r[0] for r in conn.execute(text(
                "SELECT DISTINCT litigationstatus FROM litigation_cases "
                "WHERE litigationstatus IS NOT NULL ORDER BY litigationstatus"))]
            products = [r[0] for r in conn.execute(text(
                "SELECT DISTINCT product_category_label FROM litigation_cases "
                "WHERE product_category_label IS NOT NULL "
                "ORDER BY product_category_label"))]
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Data not ready: {e}")

    return {
        "branches": branches,
        "statuses": statuses,
        "products": products,
        # Fixed, ordered by urgency — not data-derived, so empty buckets still show.
        "upcoming": ["No Date", "Not Updated", "Today", "Next 5 Working Days",
                     "This Month", "Next Month", "Later"],
        "defaults": DEFAULTS,
    }


@app.get("/api/cases")
def get_cases(
    suit: str = Query("NI Act"),  # a suit_type value — see filters.build_filters
    branch: str | None = Query(None),
    upcoming: str | None = Query(None),
    products: list[str] | None = Query(None),
    statuses: list[str] | None = Query(None),
    warrant: bool = Query(False),
    q: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=1500),
):
    offset = (page - 1) * page_size
    where, params = build_filters(suit=suit, branch=branch, upcoming=upcoming,
                                  products=products, statuses=statuses,
                                  warrant=warrant, q=q)
    wc = where_clause(where)
    try:
        with engine.connect() as conn:
            # COUNT uses the SAME filters as the page query, or total_pages lies.
            total = conn.execute(
                text(f"SELECT COUNT(*) FROM litigation_cases {wc}"), params
            ).scalar()

            result = conn.execute(
                text(f"""
                    SELECT cif, clientname, accountnumber, caseid, branch, litigationstatus
                    FROM litigation_cases
                    {wc}
                    ORDER BY suit_filing_date DESC, status_rank, cif, caseid
                    LIMIT :limit OFFSET :offset
                """),
                {**params, "limit": page_size, "offset": offset},
            )
            columns, rows = _rows(result)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Data not ready: {e}")

    return {
        "columns": columns,
        "rows": rows,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if total else 0,
    }


@app.get("/api/case")
def get_case_details(caseid: int):
    try:
        with engine.connect() as conn:
            # One query for both legal + loan views (same row in litigation_cases).
            case_res = conn.execute(
                text(f"""
                    SELECT {", ".join(dict.fromkeys(_CLIENT_COLS + _LEGAL_COLS + _LOAN_COLS))}
                    FROM litigation_cases
                    WHERE caseid = :caseid
                """),
                {"caseid": caseid},
            )
            case_rows = [dict(r._mapping) for r in case_res]

            # Inter-hearing aging. LEAD on ASC order => gap to the NEXT hearing;
            # the most recent hearing (no LEAD) falls back to days-since-today
            # when the case is still Active, else 0. Output ordered newest-first.
            history = conn.execute(
                text("""
                    SELECT hearing_date, case_status, makedate, aging
                    FROM (
                        SELECT hearing_date,case_status,makedate,aging
                        FROM litigation_history
                        WHERE caseid = :caseid
                    ) t
                    ORDER BY hearing_date DESC
                """),
                {"caseid": caseid},
            )
            history_columns, history_rows = _rows(history)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Data not ready: {e}")

    if not case_rows and not history_rows:
        raise HTTPException(status_code=404, detail=f"No case found for caseid={caseid}")

    # Project the single fetched row-set into the two views the frontend expects.
    client_rows = [{k: r[k] for k in _CLIENT_COLS} for r in case_rows]
    legal_rows = [{k: r[k] for k in _LEGAL_COLS} for r in case_rows]
    loan_rows = [{k: r[k] for k in _LOAN_COLS} for r in case_rows]

    return {
        "client":  {"columns": _CLIENT_COLS,  "rows": client_rows},
        "legal":   {"columns": _LEGAL_COLS,   "rows": legal_rows},
        "loan":    {"columns": _LOAN_COLS,    "rows": loan_rows},
        "history": {"columns": history_columns, "rows": history_rows},
    }







@app.get("/api/reportdate")
def get_reportdate():
    """Extraction date of the current warehouse contents.

    The column is `reportpreparationdate` — sync.py normalizes the source's
    [ReportPreparationDate] by lowercasing, and the name has no spaces to turn
    into underscores.

    sync.py filters the source on its MAX(ReportPreparationDate), so every row
    carries the same value; MAX keeps this deterministic anyway if a partial
    sync ever leaves more than one behind.
    """
    try:
        with engine.connect() as conn:
            reportdate = conn.execute(
                text("SELECT MAX(reportpreparationdate) FROM litigation_cases")
            ).scalar()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Data not ready: {e}")

    return {"reportdate": reportdate}


# One row per hierarchy level, produced in a single pass by GROUPING SETS:
#   level 0  grand total          (suit_type NULL, present_case_status NULL)
#   level 1  per suit_type        (present_case_status NULL)
#   level 2  per suit_type + present_case_status
#
# litigation_receivable is text in Postgres — sync.py stores it as it arrives —
# so SUM() over it fails outright without the cast below.


@app.get("/api/summary")
def get_summary(
    branch: str | None = Query(None),
    upcoming: str | None = Query(None),
    products: list[str] | None = Query(None),
    statuses: list[str] | None = Query(None),
):
    """Aggregates across every suit type.

    Deliberately takes neither `suit` (the summary groups BY suit_type, so
    constraining to one would collapse the middle level to a single row) nor
    `q`/`warrant` — the client/CIF/account search and the warrant flag pick out
    individual cases, which is the opposite of what this view is for.
    """
    where, params = build_filters(
        branch=branch, upcoming=upcoming, products=products, statuses=statuses
    )
    wc = where_clause(where)

    try:
        with engine.connect() as conn:
            result = conn.execute(text(f"""
                WITH summary_tbs AS (   
                    SELECT suit_type, present_case_status, litigationstatus, suit_value,
                        litigation_receivable, overdue_amount, aging, last_hearing_date,
                        (SELECT aging FROM litigation_history h
                            WHERE h.caseid = c.caseid
                            ORDER BY h.hearing_date DESC, h.makedate DESC
                            LIMIT 1) AS aging_status
                    FROM litigation_cases c
                    {wc} 
                    )
                    SELECT
                        CASE
                            WHEN GROUPING(suit_type) = 1 THEN 0
                            WHEN GROUPING(present_case_status) = 1 THEN 1
                            ELSE 2
                        END AS level,
                        suit_type,
                        CASE WHEN present_case_status IS NULL THEN 'Unspecified' ELSE present_case_status END AS present_case_status,
                        COUNT(*) AS cases,
                        ROUND(SUM(suit_value)::numeric, 0) AS total_suit_value,
                        ROUND(SUM(litigation_receivable)::numeric, 0) AS total_receivable,
                        ROUND(SUM(overdue_amount)::numeric, 0) AS total_overdue,
                        ROUND(AVG(aging)::numeric, 0) AS avg_aging,
                        MIN(aging) AS min_aging,
                        MAX(aging) AS max_aging,
                        ROUND(AVG(aging_status)::numeric, 0)
                            AS avg_aging_status,
                        MIN(aging_status) AS min_aging_status,
                        MAX(aging_status) AS max_aging_status
                    FROM summary_tbs
                    GROUP BY GROUPING SETS ((), (suit_type), (suit_type, present_case_status))
                    ORDER BY
                        CASE WHEN GROUPING(suit_type) = 1 THEN 0 ELSE 1 END,
                        CASE suit_type WHEN 'NI Act' THEN 1 WHEN 'ARA' THEN 2
                                    WHEN 'ARAE' THEN 3 WHEN 'Others' THEN 4 ELSE 5 END,
                        GROUPING(present_case_status) DESC,
                        present_case_status
                """), params)   
            columns, rows = _rows(result)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Data not ready: {e}")

    return {"columns": columns, "rows": rows}


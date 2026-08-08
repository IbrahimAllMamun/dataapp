import asyncio
import logging
from contextlib import asynccontextmanager

from sqlalchemy import text
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from .database import engine
from .sync import run_sync

log = logging.getLogger("api")

scheduler = AsyncIOScheduler(timezone="Asia/Dhaka")


async def run_sync_async():
    """Run the blocking sync in a threadpool so it never blocks the event loop."""
    await asyncio.to_thread(run_sync)


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.add_job(
        run_sync_async,
        CronTrigger(hour=6, minute=0),
        id="daily_sync",
        max_instances=1,
        coalesce=True,
        replace_existing=True,
    )
    scheduler.start()
    # Seed once on boot so the API isn't querying empty tables until 6am.
    asyncio.create_task(run_sync_async())
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title="Litigation Dashboard API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # tighten for real deployments
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _rows(result):
    """SQLAlchemy result -> (columns, list-of-dicts)."""
    return list(result.keys()), [dict(r._mapping) for r in result]


"nature_of_suit","suit_value","suit_filing_date","law_firm",
"court_no","plaintiff","plaintiffcif","next_hearing_date",
"cheque_number","litigation_receivable","aging","present_case_status",
"litigationstatus"

# Columns pulled from litigation_cases, split into two logical views but fetched
# in ONE query (same row, same WHERE) to avoid a second round-trip.
_LEGAL_COLS = ["nature_of_suit","suit_value","suit_filing_date","law_firm",
               "court_no","plaintiff","plaintiffcif","next_hearing_date",
               "cheque_number","litigation_receivable","aging","present_case_status",
               "litigationstatus"]
_LOAN_COLS = ["caseid", "product_category", "stmcode", "stmname", "rmcode",
              "rmname", "monitorbycode", "monitorby", "urpa", "mod",
              "overdue_amount", "principal_od", "interest_od", "lpi",
              "netexcisedutytilllastyear", "netexcisedutytillcurrentyear"]


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/cases")
def get_cases(
    suit: str = Query("Negotiable Instrument Act (NI Act)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=1500),
):
    offset = (page - 1) * page_size
    try:
        with engine.connect() as conn:
            # COUNT uses the SAME filter as the page query, or total_pages lies.
            total = conn.execute(
                text("SELECT COUNT(*) FROM litigation_cases WHERE nature_of_suit = :suit"),
                {"suit": suit},
            ).scalar()

            result = conn.execute(
                text("""
                    SELECT cif, clientname, accountnumber,
                           caseid, branch, litigationstatus
                    FROM litigation_cases
                    WHERE nature_of_suit = :suit
                    ORDER BY cif, caseid
                    LIMIT :limit OFFSET :offset
                """),
                {"suit": suit, "limit": page_size, "offset": offset},
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
                    SELECT {", ".join(dict.fromkeys(_LEGAL_COLS + _LOAN_COLS))}
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
                        SELECT
                            hearing_date,
                            case_status,
                            makedate,
                            COALESCE(
                                LEAD(hearing_date::date)
                                    OVER (ORDER BY hearing_date::date)
                                    - hearing_date::date,
                                CASE
                                    WHEN litigationstatus = 'Active'
                                        THEN CURRENT_DATE - hearing_date::date
                                    ELSE 0
                                END
                            ) AS aging
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
    legal_rows = [{k: r[k] for k in _LEGAL_COLS} for r in case_rows]
    loan_rows = [{k: r[k] for k in _LOAN_COLS} for r in case_rows]

    return {
        "legal":   {"columns": _LEGAL_COLS,   "rows": legal_rows},
        "loan":    {"columns": _LOAN_COLS,    "rows": loan_rows},
        "history": {"columns": history_columns, "rows": history_rows},
    }

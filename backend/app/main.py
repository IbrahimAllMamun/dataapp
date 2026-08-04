import asyncio
import logging
from contextlib import asynccontextmanager

import pandas as pd
from fastapi import FastAPI, HTTPException
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
    # --- startup ---
    scheduler.add_job(
        run_sync_async,
        CronTrigger(hour=6, minute=0),
        id="daily_sync",
        max_instances=1,     # don't overlap if a run is still going
        coalesce=True,       # if runs were missed, fire once, not N times
        replace_existing=True,
    )
    scheduler.start()

    # Seed immediately on boot so the API isn't querying empty tables until 6am.
    # Fire-and-forget: startup doesn't block on the first sync.
    asyncio.create_task(run_sync_async())

    yield

    # --- shutdown ---
    scheduler.shutdown(wait=False)


app = FastAPI(
    title="Litigation Dashboard API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # fine for local/dev; tighten for real deployments
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# The synced `litigation_cases` table holds only the latest report date
# (the sync filters to MAX(ReportPreparationDate) at extract time), so the
# active-case count is the meaningful stat here.
QUERY = """
    SELECT COUNT(DISTINCT caseid) AS total_active_cases
    FROM litigation_cases
    WHERE litigationstatus = 'Active';
"""


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/data")
def get_data():
    """Run the Postgres query and return columns + rows as JSON."""
    try:
        df = pd.read_sql_query(QUERY, con=engine)
        # NaN/NaT -> None so it serializes to valid JSON
        df = df.astype(object).where(pd.notnull(df), None)
        return {
            "columns": list(df.columns),
            "rows": df.to_dict(orient="records"),
        }
    except Exception as e:
        # Most likely cause on a fresh deploy: the first sync hasn't finished,
        # so the table doesn't exist yet. Surface a clear message.
        raise HTTPException(status_code=503, detail=f"Data not ready: {e}")

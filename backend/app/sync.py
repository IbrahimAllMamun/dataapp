import sys
import logging
from datetime import datetime

import pandas as pd
from sqlalchemy import text

from .database import engine_idlc, engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("sync")

query_cases = """
  WITH latest_portfolio AS (
    SELECT ACCOUNT_NUMBER, MONTHSOVERDUE
    FROM SME.Portfolio
    WHERE [Month] = (SELECT MAX([Month]) FROM SME.Portfolio)
  )

  SELECT
      l.AccountNumber,
      l.ClientName,
      l.CaseID,
      l.Branch,
      l.LitigationStatus,
      l.[Nature of Suit],
      l.CIF,
      l.[Present Case Status],
      l.Aging,
      NULLIF(l.[Suit Filing Date], '') AS [Suit Filing Date],
      NULLIF(l.[Suit Value], '') AS [Suit Value],
      NULLIF(l.[Law Firm], '') AS [Law Firm],
      NULLIF(NULLIF(l.[Court No],'N/A'), '') AS [Court No],
      NULLIF(l.[Next Hearing Date], '') AS [Next Hearing Date],
      NULLIF(l.[Last Hearing Date], '') AS [Last Hearing Date],
      NULLIF(NULLIF(l.[Cheque Number], 'N/A'), '') AS [Cheque Number],
      l.Plaintiff,
      l.PlaintiffCIF,
      NULLIF(l.Litigation_Receivable, '') AS Litigation_Receivable,
      a.STMCode,
      a.STMName,
      a.RMCode,
      a.RMName,
      a.MonitorByCode,
      a.MonitorBy,
      l.URPA,
      COALESCE(NULLIF(p.MONTHSOVERDUE, ''), NULLIF(a.MONTHSOVERDUE, '')) AS [MOD],
      l.OVERDUE_AMOUNT,
      a.PRINCIPAL_OD,
      a.INTEREST_OD,
      l.LPI,
      l.NetExciseDutyTillLastYear,
      l.NetExciseDutyTillCurrentYear,
      l.PRODUCT_CATEGORY,
      l.[ReportPreparationDate]
    FROM [dbo].[AnalyticsLitigationAccount] l
    LEFT JOIN [dbo].[AnalyticsCLAccount] a
        ON a.ACCOUNT_NUMBER = l.AccountNumber
    LEFT JOIN latest_portfolio p
        ON p.ACCOUNT_NUMBER = l.AccountNumber
    WHERE l.[ReportPreparationDate] = (SELECT MAX([ReportPreparationDate]) FROM [dbo].[AnalyticsLitigationAccount])
"""

query_history = """
    WITH ranked AS (
          SELECT
              caseid AS CaseID,
              HearingDate AS hearing_date,
              CaseStatus AS case_status,
              MakeDate,
              ROW_NUMBER() OVER (
                  PARTITION BY caseid, HearingDate, CaseStatus
                  ORDER BY MakeDate DESC
              ) AS rn
          FROM [dbo].[AnalyticsLitigationAccountHearing]
      ),
      case_data AS(
        SELECT
          CaseID,
          LitigationStatus
        FROM [dbo].[AnalyticsLitigationAccount]
        WHERE [ReportPreparationDate] = (SELECT MAX([ReportPreparationDate]) FROM [dbo].[AnalyticsLitigationAccount])
      )

      SELECT r.CaseID, r.hearing_date, r.case_status, r.MakeDate, c.LitigationStatus
      FROM ranked r
      LEFT JOIN case_data c
        ON r.CaseID = c.CaseID
      WHERE r.rn = 1
      ORDER BY r.CaseID, r.hearing_date DESC, r.MakeDate DESC;
"""

query_holidays = "SELECT [Serial], [Date], [Day], [Holiday] FROM [SME].[Holiday]"

SYNC_JOBS = [
    ("litigation_cases",   query_cases),
    ("litigation_history", query_history),
    ("holidays",           query_holidays),
]


def _clean_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize MSSQL column names to valid snake_case Postgres identifiers."""
    df.columns = (
        df.columns
        .str.strip()
        .str.replace(r"[ \[\]]", "_", regex=True)
        .str.replace(r"_+", "_", regex=True)
        .str.strip("_")
        .str.lower()
    )
    return df


def run_sync():
    """Read all tables from MSSQL, then replace all Postgres tables in ONE
    transaction so the DB is never left empty or half-loaded."""
    started = datetime.now()
    log.info("sync started")

    # 1. Extract everything FIRST. If a MSSQL read fails, Postgres is untouched.
    frames = {}
    for dest_table, query in SYNC_JOBS:
        df = _clean_columns(pd.read_sql(text(query), engine_idlc))
        frames[dest_table] = df
        log.info("read %s: %d rows", dest_table, len(df))

    # 2. Load everything in a single transaction. Any failure rolls back all.
    with engine.begin() as conn:
        for dest_table, df in frames.items():
            df.to_sql(
                dest_table,
                conn,
                if_exists="replace",
                index=False,
                chunksize=1000,
                method="multi",
            )
            log.info("wrote %s: %d rows", dest_table, len(df))

    log.info("sync finished in %.1fs", (datetime.now() - started).total_seconds())


def main():
    try:
        run_sync()
    except Exception:
        log.exception("sync FAILED — Postgres left unchanged")
        sys.exit(1)   # non-zero so the scheduler/healthcheck sees the failure


if __name__ == "__main__":
    main()

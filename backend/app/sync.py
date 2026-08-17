import sys
import logging
from datetime import datetime

import pandas as pd
from sqlalchemy import text

from .database import engine_idlc, engine
from .derive import derive_case_columns

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
  ),
  all_cases AS (
    SELECT 
      AccountNumber,
      ClientName,
      CaseID,
      Branch,
      LitigationStatus,
      [Nature of Suit],
      CIF,
      COALESCE(
        [Present Case Status],
        (SELECT TOP 1 CaseStatus
         FROM [dbo].[AnalyticsLitigationAccountHearing] h
         WHERE h.caseid = l.CaseID
         ORDER BY h.HearingDate DESC, h.MakeDate DESC)
      ) AS [Present Case Status],
      Aging,
      NULLIF([Suit Filing Date], '') AS [Suit Filing Date],
      NULLIF([Suit Value], '') AS [Suit Value],
      NULLIF([Law Firm], '') AS [Law Firm],
      NULLIF(NULLIF([Court No],'N/A'), '') AS [Court No],
      NULLIF([Next Hearing Date], '') AS [Next Hearing Date],
        COALESCE(
        NULLIF([Last Hearing Date], ''),
        (SELECT TOP 1 HearingDate
         FROM [dbo].[AnalyticsLitigationAccountHearing] h
         WHERE h.caseid = l.CaseID
         ORDER BY h.HearingDate DESC, h.MakeDate DESC)
      ) AS [Last Hearing Date],
      NULLIF(NULLIF([Cheque Number], 'N/A'), '') AS [Cheque Number],
      Plaintiff,
      PlaintiffCIF,
      NULLIF(Litigation_Receivable, '') AS Litigation_Receivable,
      URPA,
      OVERDUE_AMOUNT,
      LPI,
      NetExciseDutyTillLastYear,
      NetExciseDutyTillCurrentYear,
      PRODUCT_CATEGORY,
      [ReportPreparationDate]
    FROM [dbo].[AnalyticsLitigationAccount] l
    WHERE [ReportPreparationDate] = (SELECT MAX([ReportPreparationDate]) FROM [dbo].[AnalyticsLitigationAccount])

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
      COALESCE(
        CASE
            WHEN l.litigationstatus = 'Active'
                THEN DATEDIFF(day, CAST(l.[Suit Filing Date] AS date), CAST(GETDATE() AS date))
            WHEN l.litigationstatus = 'InActive'
                THEN DATEDIFF(day, CAST(l.[Suit Filing Date] AS date), CAST(l.[Last Hearing Date] AS date))
            ELSE NULL
        END, Aging
      ) AS Aging,
      l.[Suit Filing Date],
      l.[Suit Value],
      l.[Law Firm],
      l.[Court No],
      l.[Next Hearing Date],
      l.[Last Hearing Date],
      l.[Cheque Number],
      l.Plaintiff,
      l.PlaintiffCIF,
      l.Litigation_Receivable,
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
    FROM all_cases l
    LEFT JOIN [dbo].[AnalyticsCLAccount] a
        ON a.ACCOUNT_NUMBER = l.AccountNumber
    LEFT JOIN latest_portfolio p
        ON p.ACCOUNT_NUMBER = l.AccountNumber
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
            ) AS rn,
            LEAD(HearingDate) OVER (
                PARTITION BY caseid
                ORDER BY HearingDate
            ) AS last_hearing
        FROM [dbo].[AnalyticsLitigationAccountHearing]
        WHERE HearingDate <= GETDATE()
    ),
    case_data AS (
        SELECT
            CaseID,
            LitigationStatus
        FROM [dbo].[AnalyticsLitigationAccount]
        WHERE [ReportPreparationDate] = (SELECT MAX([ReportPreparationDate]) FROM [dbo].[AnalyticsLitigationAccount])
    )

    SELECT
        r.CaseID,
        r.hearing_date,
        r.case_status,
        r.MakeDate,
        c.LitigationStatus,
        COALESCE(
            DATEDIFF(day, r.hearing_date, r.last_hearing),
            CASE
                WHEN c.LitigationStatus = 'Active'
                    THEN DATEDIFF(day, CAST(r.hearing_date AS date), CAST(GETDATE() AS date))
                ELSE 0
            END
        ) AS aging
    FROM ranked r
    LEFT JOIN case_data c
        ON r.CaseID = c.CaseID
    WHERE r.rn = 1
    ORDER BY r.CaseID, r.hearing_date DESC, r.MakeDate DESC;
"""

query_holidays = "SELECT [Serial], [Date], [Day], [Holiday] FROM [SME].[Holiday]"
query_updated = """
    SELECT 
        GETDATE() AS [GetDate],
        CURRENT_TIMESTAMP AS [CurrentTimestamp],
        SYSDATETIME() AS [SysDateTime],
        GETUTCDATE() AS [GetUtcDate],
        SYSUTCDATETIME() AS [SysUtcDateTime],
        SYSDATETIMEOFFSET() AS [SysDateTimeOffset];
"""
query_error_cases = """
    SELECT
      CaseID,
      Branch,
      PRODUCT_CATEGORY,
      CASE
          WHEN NULLIF([Suit Filing Date], '') IS NULL THEN 'No Suit Filing Date'
          WHEN NULLIF([Suit Filing Date], '') > GETDATE() THEN 'Suit Filing Date After Current Date'
          WHEN NULLIF([Suit Filing Date], '') > [Last Hearing Date] THEN 'Suit Filing Date After Last Hearing Date'
          ELSE NULL
      END
      AS error_type
    FROM [dbo].[AnalyticsLitigationAccount]
    WHERE [ReportPreparationDate] = (SELECT MAX([ReportPreparationDate]) FROM [dbo].[AnalyticsLitigationAccount])
    AND LitigationStatus = 'Active'
    AND (NULLIF([Suit Filing Date], '') IS NULL
    OR NULLIF([Suit Filing Date], '') > [Last Hearing Date]
    OR NULLIF([Suit Filing Date], '') > GETDATE())
"""

SYNC_JOBS = [
    ("litigation_cases",   query_cases),
    ("litigation_history", query_history),
    ("holidays",           query_holidays),
    ("error_cases",        query_error_cases),
    ("updated",            query_updated),
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

    # 1b. Derive the dashboard columns (suit type, warrant flag, hearing
    # buckets, month flags, status rank). Precomputed here so the API only
    # filters. Buckets are relative to the sync run; the daily 06:00 job
    # refreshes them.
    frames["litigation_cases"] = derive_case_columns(
        frames["litigation_cases"], frames["holidays"]
    )
    log.info("derived dashboard columns on litigation_cases")

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

        # Indexes must be (re)created here: if_exists="replace" drops the table
        # each run, so any index made outside the sync would not survive.
        # These back the API's filters: /api/cases (nature_of_suit), /api/case
        # (caseid on both tables), and the ORDER BY on cif/caseid.
        conn.execute(text("CREATE INDEX ix_cases_caseid   ON litigation_cases   (caseid)"))
        # suit_type, matching what /api/cases actually filters on.
        conn.execute(text("CREATE INDEX ix_cases_suit_cif  ON litigation_cases   (suit_type, cif, caseid)"))
        conn.execute(text("CREATE INDEX ix_hist_caseid     ON litigation_history (caseid)"))
        # Filter columns used by /api/cases.
        conn.execute(text("CREATE INDEX ix_cases_branch    ON litigation_cases (branch)"))
        conn.execute(text("CREATE INDEX ix_cases_upcoming  ON litigation_cases (upcoming)"))
        conn.execute(text("CREATE INDEX ix_cases_status    ON litigation_cases (litigationstatus)"))
        conn.execute(text("CREATE INDEX ix_cases_prodlabel ON litigation_cases (product_category_label)"))
        log.info("created indexes")

        # One row per executed warrant: the case, and the YEAR it was executed
        # in. A warrant counts as executed once a hearing that is NOT a warrant
        # follows it — a warrant hearing followed by another warrant hearing is
        # the same warrant still standing, not a second one.
        #
        # Precomputed because it cannot be answered cheaply per request: the
        # window pass over ~180k history rows takes ~500ms and no index helps,
        # since the per-date bool_or has to read every row anyway. Here it is
        # paid once a sync; at query time it is a semi-join against ~12k rows.
        #
        # strpos rather than ILIKE '%warrant%' so no literal % goes anywhere
        # near a parameterised statement.
        conn.execute(text("DROP TABLE IF EXISTS warrant_executions"))
        conn.execute(text("""
            CREATE TABLE warrant_executions AS
            WITH per_date AS (
                -- A date, not a row: a case can carry several statuses on the
                -- same hearing date, and the date is a warrant date if any of
                -- them is.
                SELECT caseid, hearing_date,
                       bool_or(strpos(lower(case_status), 'warrant') > 0) AS is_warrant
                FROM litigation_history
                GROUP BY caseid, hearing_date
            ), seq AS (
                SELECT caseid, is_warrant,
                       LEAD(hearing_date) OVER w AS next_date,
                       LEAD(is_warrant)   OVER w AS next_is_warrant
                FROM per_date
                WINDOW w AS (PARTITION BY caseid ORDER BY hearing_date)
            )
            SELECT DISTINCT caseid,
                   EXTRACT(YEAR FROM next_date)::int AS warrant_year
            FROM seq
            WHERE is_warrant
              AND next_date IS NOT NULL
              AND NOT next_is_warrant
        """))
        conn.execute(text(
            "CREATE INDEX ix_warrexec_year ON warrant_executions (warrant_year, caseid)"))
        conn.execute(text(
            "CREATE INDEX ix_warrexec_case ON warrant_executions (caseid)"))
        log.info("built warrant_executions")

    log.info("sync finished in %.1fs", (datetime.now() - started).total_seconds())


def main():
    try:
        run_sync()
    except Exception:
        log.exception("sync FAILED — Postgres left unchanged")
        sys.exit(1)   # non-zero so the scheduler/healthcheck sees the failure


if __name__ == "__main__":
    main()

"""Derived columns for the litigation dashboard.

Everything here is precomputed during the daily sync and stored as real columns,
so the API only ever filters — it never recomputes. All date-relative buckets are
therefore "as of the sync run"; the daily 06:00 sync refreshes them.
"""
from datetime import date, timedelta

import pandas as pd

# ---------------------------------------------------------------------------
# Suit types. Rows whose nature_of_suit is none of these get suit_type = None.
# ---------------------------------------------------------------------------
SUIT_TYPES = {
    "Negotiable Instrument Act (NI Act)": "NI Act",
    "Artha Rin Aine (ARA)": "ARA",
    "Artha Rin Aine Execution (ARAE)": "ARAE",
    "420": "Others",
    "Bankruptcy Act (BA)": "Others",
    "Other": "Others"
}



# ---------------------------------------------------------------------------
# Procedural (not alphabetical) status ordering, per suit type.
# Statuses absent from a list rank AFTER all known ones; missing/NULL ranks last.
# TODO: fill these with the real sequences from the R dashboard's
# status_order_ni / status_order_ara / status_order_arae vectors.
# ---------------------------------------------------------------------------
STATUS_ORDER = {
    "NI Act": [],
    "ARA": [],
    "ARAE": [],
    "Others": [],
}

# Bangladesh working week is Sunday–Thursday; Friday(4)/Saturday(5) are weekend
# in Python's Monday=0 numbering.
_WEEKEND = {4, 5}


class BizCalendar:
    """Business-day calendar: Sun–Thu working week plus explicit holidays."""

    def __init__(self, holidays=()):
        self.holidays = {self._as_date(h) for h in holidays if h is not None}
        self.holidays.discard(None)

    @staticmethod
    def _as_date(value):
        if value is None or (isinstance(value, float) and pd.isna(value)):
            return None
        ts = pd.Timestamp(value)
        return None if pd.isna(ts) else ts.date()

    def is_bizday(self, d: date) -> bool:
        return d.weekday() not in _WEEKEND and d not in self.holidays

    def add_bizdays(self, start: date, n: int) -> date:
        """Move n business days forward (n>0) or backward (n<0) from start."""
        if n == 0:
            return start
        step = 1 if n > 0 else -1
        remaining, cur = abs(n), start
        while remaining:
            cur += timedelta(days=step)
            if self.is_bizday(cur):
                remaining -= 1
        return cur


def month_end(d: date) -> date:
    return (pd.Timestamp(d) + pd.offsets.MonthEnd(0)).date()


def next_month_end(d: date) -> date:
    # NOTE: MonthEnd(1) from a mid-month date rolls to THIS month's end, not
    # next month's. Step to the 1st of next month first, then take its end.
    first_of_next = pd.Timestamp(month_end(d)) + pd.Timedelta(days=1)
    return (first_of_next + pd.offsets.MonthEnd(0)).date()


def bucket_upcoming(hearing, today: date, five_bizdays: date,
                    this_month_end: date, nxt_month_end: date) -> str:
    """Narrowest-first bucketing — the most urgent applicable label wins."""
    if hearing is None or pd.isna(hearing):
        return "No Date"
    h = pd.Timestamp(hearing).date()
    if h < today:
        return "Not Updated"
    if h == today:
        return "Today"
    if h <= five_bizdays:
        return "Next 5 Working Days"
    if h <= this_month_end:
        return "This Month"
    if h <= nxt_month_end:
        return "Next Month"
    return "Later"


def derive_case_columns(cases: pd.DataFrame, holidays: pd.DataFrame,
                        today: date | None = None) -> pd.DataFrame:
    """Add the dashboard's derived columns to litigation_cases."""
    today = today or date.today()

    holiday_dates = holidays["date"] if "date" in holidays.columns else []
    cal = BizCalendar(holiday_dates)

    five = cal.add_bizdays(today, 5)
    tme = month_end(today)
    nme = next_month_end(today)

    df = cases.copy()

    # Short suit label. Rows outside the three known suits keep suit_type = None
    # (kept rather than dropped, so the warehouse stays a full copy of source).
    df["suit_type"] = df["nature_of_suit"].map(SUIT_TYPES)

    # SME vs everything else.
    df["product_category_label"] = (
        df["product_category"].eq("SME").map({True: "SME", False: "Other"})
    )

    # Warrant cases — derived, since the source has no warrant column.
    df["is_warrant"] = (
        df["present_case_status"].fillna("").str.contains("warrant", case=False, regex=False)
    )

    hearing = pd.to_datetime(df["next_hearing_date"], errors="coerce")

    df["upcoming"] = [
        bucket_upcoming(h, today, five, tme, nme) for h in hearing
    ]

    # Date-accurate month membership, independent of the label above. Needed
    # because the 5-working-day window can spill into next month.
    hd = hearing.dt.date
    df["in_this_month"] = [
        bool(d is not None and not pd.isna(d) and today <= d <= tme) for d in hd
    ]
    df["in_next_month"] = [
        bool(d is not None and not pd.isna(d) and tme < d <= nme) for d in hd
    ]

    # Procedural status rank; unknown statuses after known ones, NULL last.
    def rank(row):
        order = STATUS_ORDER.get(row["suit_type"], [])
        status = row["present_case_status"]
        if status is None or (isinstance(status, float) and pd.isna(status)):
            return 9999
        try:
            return order.index(status)
        except ValueError:
            return 5000
    df["status_rank"] = df.apply(rank, axis=1) if len(df) else pd.Series(dtype=int)

    return df

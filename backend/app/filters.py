"""Filter -> SQL translation for /api/cases.

Semantics follow FILTERING_ALGORITHM.md:
  - dropdowns (branch, upcoming): equality; "All"/None = no constraint
  - checkbox groups (products, statuses): is-among; empty = no constraint
  - warrant: on = only warrant cases; off = no constraint
  - "This Month"/"Next Month" filter on the DATE FLAGS, not the label, so a
    hearing that spilled into the 5-working-day bucket is still reachable
  - all active filters combine with AND
"""

# What /api/summary shows in place of a NULL present_case_status. Shared so the
# drill-down and the summary cannot disagree about the label.
UNSPECIFIED_STATUS = "Unspecified"

# Same idea for a case with no law firm recorded. LAW_FIRM_LABEL is the SQL
# that produces it, so the aggregate and the drill-down normalise identically —
# 71 rows in the current data have a NULL firm.
UNSPECIFIED_FIRM = "Unspecified"
LAW_FIRM_LABEL = "COALESCE(NULLIF(TRIM(law_firm), ''), 'Unspecified')"

# A case only counts once its filing date is present and plausible. Every
# aggregate and every list has to apply the same three guards or their totals
# disagree — the law-firm row would promise more cases than its drill-down can
# show. Kept as conditions rather than a hardcoded "AND ..." tail because with
# no filters at all the WHERE would otherwise open with a bare AND.
VALID_FILING = [
    "suit_filing_date IS NOT NULL",
    "suit_filing_date <= last_hearing_date",
    "suit_filing_date <= CURRENT_DATE",
]

# Buckets that must be matched by date flag rather than by label.
_MONTH_FLAG = {"This Month": "in_this_month", "Next Month": "in_next_month"}


def build_filters(suit=None, branch=None, upcoming=None, products=None,
                  statuses=None, warrant=False, q=None, case_status=None,
                  law_firm=None, firm_q=None):
    """Return (list_of_sql_conditions, params_dict)."""
    where, params = [], {}

    if suit:
        # suit_type, not nature_of_suit: the Others tab is three source values
        # ("420", "Bankruptcy Act (BA)", "Other") collapsed by SUIT_TYPES, which
        # a single equality on the raw column cannot express.
        where.append("suit_type = :suit")
        params["suit"] = suit

    if branch and branch != "All":
        where.append("branch = :branch")
        params["branch"] = branch

    if upcoming and upcoming != "All":
        flag = _MONTH_FLAG.get(upcoming)
        if flag:
            # Date-accurate month membership, independent of the urgency label.
            where.append(f"{flag} IS TRUE")
        else:
            where.append("upcoming = :upcoming")
            params["upcoming"] = upcoming

    if products:
        where.append("product_category_label = ANY(:products)")
        params["products"] = list(products)

    if statuses:
        where.append("litigationstatus = ANY(:statuses)")
        params["statuses"] = list(statuses)

    # Drilling into one cell of the summary. The summary renders a missing
    # status as "Unspecified", so that label has to come back as IS NULL or the
    # drill-down would return nothing for a group the summary counted.
    if case_status:
        if case_status == UNSPECIFIED_STATUS:
            where.append("present_case_status IS NULL")
        else:
            where.append("present_case_status = :case_status")
            params["case_status"] = case_status

    # Drilling into one cell of the law-firm view. Normalised through
    # LAW_FIRM_LABEL so "Unspecified" reaches the rows the aggregate counted
    # under that label, rather than looking for a firm literally so named.
    if law_firm:
        if law_firm == UNSPECIFIED_FIRM:
            where.append("NULLIF(TRIM(law_firm), '') IS NULL")
        else:
            where.append("TRIM(law_firm) = :law_firm")
            params["law_firm"] = law_firm

    # The law-firm search box. Matched against the same normalised label, so
    # typing "unspec" finds the no-firm bucket instead of silently missing it.
    if firm_q:
        where.append(f"{LAW_FIRM_LABEL} ILIKE :firm_q")
        params["firm_q"] = f"%{firm_q}%"

    if warrant:
        where.append("is_warrant IS TRUE")

    if q:
        # Cascading search box: one term matched against client / CIF / account.
        where.append("(clientname ILIKE :q OR cif ILIKE :q OR accountnumber ILIKE :q)")
        params["q"] = f"%{q}%"

    return where, params


def where_clause(conditions):
    return ("WHERE " + " AND ".join(conditions)) if conditions else ""


# error_cases is loaded straight from the source: derive_case_columns() runs on
# litigation_cases only, so none of suit_type / product_category_label /
# upcoming / is_warrant / status_rank exist on it. build_filters() emits those
# column names, so it cannot be reused here — this builds the subset that the
# error table can actually answer.
ERROR_TYPES = [
    "No Suit Filing Date",
    "Suit Filing Date After Current Date",
    "Suit Filing Date After Last Hearing Date",
]


def build_error_filters(branch=None, products=None, error_type=None):
    """Return (list_of_sql_conditions, params_dict) for error_cases."""
    where, params = [], {}

    if branch and branch != "All":
        where.append("branch = :branch")
        params["branch"] = branch

    if products:
        # The raw source column, not the derived label — and trimmed, since the
        # source is fixed-width CHAR.
        where.append("TRIM(product_category) = ANY(:products)")
        params["products"] = list(products)

    if error_type:
        where.append("error_type = :error_type")
        params["error_type"] = error_type

    return where, params

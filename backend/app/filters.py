"""Filter -> SQL translation for /api/cases.

Semantics follow FILTERING_ALGORITHM.md:
  - dropdowns (branch, upcoming): equality; "All"/None = no constraint
  - checkbox groups (products, statuses): is-among; empty = no constraint
  - warrant: on = only warrant cases; off = no constraint
  - "This Month"/"Next Month" filter on the DATE FLAGS, not the label, so a
    hearing that spilled into the 5-working-day bucket is still reachable
  - all active filters combine with AND
"""

# Buckets that must be matched by date flag rather than by label.
_MONTH_FLAG = {"This Month": "in_this_month", "Next Month": "in_next_month"}


def build_filters(suit=None, branch=None, upcoming=None, products=None,
                  statuses=None, warrant=False, q=None):
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

    if warrant:
        where.append("is_warrant IS TRUE")

    if q:
        # Cascading search box: one term matched against client / CIF / account.
        where.append("(clientname ILIKE :q OR cif ILIKE :q OR accountnumber ILIKE :q)")
        params["q"] = f"%{q}%"

    return where, params


def where_clause(conditions):
    return ("WHERE " + " AND ".join(conditions)) if conditions else ""

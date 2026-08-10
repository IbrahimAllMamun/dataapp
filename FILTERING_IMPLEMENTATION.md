# Filtering — implementation notes

Maps `FILTERING_ALGORITHM.md` onto the FastAPI + React architecture.

## Where the logic lives

| Spec concept | Implemented as |
|---|---|
| Suit type (NI/ARA/ARAE) | `suit_type` column, derived in sync |
| Product Category SME/Other | `product_category_label` column |
| Warrant cases | `is_warrant` column (**derived — see caveat**) |
| Upcoming-hearing buckets | `upcoming` column |
| Month accuracy | `in_this_month` / `in_next_month` boolean columns |
| Procedural status order | `status_rank` column (**needs the real orderings**) |
| Filter -> row matching | `app/filters.py` -> SQL WHERE |
| Defaults == "Clear all" | `DEFAULTS` in `main.py`, served via `/api/filters` |

The R version computed these in R at knit time; here they are precomputed by the
daily 06:00 sync and stored as real columns, so the API only ever filters.

## Deliberate differences from the R dashboard

- **Filtering is server-side.** The R build filtered client-side because a static
  file has no backend. Here the DB does it, so the browser never holds 25k rows.
- **Group-parent rule not needed yet.** Spec §4 ("keep the parent if any child
  matches") exists because reactable renders grouped rows. The React table is
  currently flat, so filters apply directly to cases. This rule must be added
  when grouped client -> account -> case rendering lands.
- **Rows outside the three suits are kept**, with `suit_type = NULL`, instead of
  being dropped. The API filters by suit anyway, so the dashboard result is
  identical, but the warehouse stays a faithful copy of the source.

## Caveats needing your input

1. **`is_warrant` is a guess.** The source has no warrant column, so it is
   derived as `present_case_status ILIKE '%warrant%'`. Confirm the real rule.
2. **`STATUS_ORDER` in `derive.py` is empty.** The procedural sequences
   (`status_order_ni/ara/arae`) were not in the docs. Until filled, all known
   statuses tie and sorting falls back to `cif, caseid`.
3. **Buckets are as-of the sync run.** Correct for the day; a container running
   more than 24h without a sync would show stale buckets.

# IDLC Litigation Dashboard (Dockerized)

FastAPI + React + PostgreSQL. A scheduled job copies data from the SQL Server
(IDLC) source into a local Postgres warehouse; the API serves it as filtered
case lists and aggregates; the frontend renders them as five tabs with a
shared filter panel and drill-downs down to a single case.

## Architecture

- **`db`** — PostgreSQL 16, the local warehouse. Fully replaced each sync.
- **`api`** — FastAPI. Runs an in-process scheduler that reads from SQL
  Server and replaces the Postgres tables in one transaction. Also seeds
  once on startup so the DB isn't empty before the first scheduled run.
- **`frontend`** — Vite dev server, proxies `/api` to `api`.

**SQL Server (IDLC) is NOT containerized** — the `api` service connects to
your existing SQL Server over the network (`host.docker.internal` for a DB
on your host machine).

### When the sync runs

Three things can start one, all guarded by a single lock so two can never
overlap:

| Trigger | When |
| --- | --- |
| Boot | Once, on API startup |
| Daily | **06:00 Asia/Dhaka** (`CronTrigger` in `main.py`) |
| Hourly catch-up | Every hour; a no-op unless `MAX(reportpreparationdate)` is behind today |

The catch-up exists because the daily job can only fire if the process
happens to be running at that minute — if the container was down, it reaches
today's data within the hour instead of waiting until tomorrow.

The cron trigger takes its timezone from the container's `TZ`, which
`docker-compose.yml` sets to `Asia/Dhaka` for both `db` and `api`. Change
`TZ` and you change when the sync fires.

## Setup

```bash
cp .env.example .env      # then edit with your real SQL Server + Postgres creds
```

Notes on `.env`:

- **SQL Server** (`DB_*_IDLC`): set `DB_SERVER_IDLC=host.docker.internal` if
  SQL Server runs on your host; otherwise the hostname/IP of the DB server.
- **Postgres** (`POSTGRES_*`): these seed the `db` container. `POSTGRES_PORT`
  is only the **host** port for tools like DBeaver — the API always reaches
  Postgres on 5432 inside the Docker network, so changing it does not affect
  the app.
- **Ports** (`API_PORT`, `FRONTEND_PORT`): used on BOTH sides of their compose
  mapping, because uvicorn and vite each bind them inside the container too.
  Change either and the URLs below move with it; vite proxies to
  `http://api:${API_PORT}`, so the two stay in step.

## Run

```bash
docker compose up --build
```

- Frontend: http://localhost:5173 (`FRONTEND_PORT`)
- API health: http://localhost:8000/api/health (`API_PORT`)
- API docs: http://localhost:8000/docs

On first boot the API kicks off a sync immediately. Until it finishes, the
data endpoints return **503 "Data not ready"** — refresh once the sync logs
`sync finished`. Watch progress with `docker compose logs -f api`.

Both app containers hot-reload (source is bind-mounted). Rebuild only when
dependencies change.

## The warehouse

`sync.py` loads five tables, then `derive.py` adds the dashboard's computed
columns to `litigation_cases` only:

| Table | Contents |
| --- | --- |
| `litigation_cases` | One row per case, latest `ReportPreparationDate` only |
| `litigation_history` | Every hearing, with inter-hearing aging |
| `holidays` | Working-day calendar, used for the hearing buckets |
| `error_cases` | Cases failing the filing-date checks (the Invalid Data tab) |
| `updated` | Source clock, for diagnosing timezone drift |
| `warrant_executions` | Derived in SQL after load: one row per case per year a warrant was executed |

Derived onto `litigation_cases`: `suit_type`, `product_category_label`,
`is_warrant`, `upcoming`, `in_this_month`, `in_next_month`, `status_rank`.

`warrant_executions` is precomputed because it cannot be answered per
request — the window pass over ~180k history rows takes ~500ms and no index
helps, since the per-date check reads every row anyway. As a table it is a
semi-join against ~12k rows.

## The app

Five tabs, sharing one filter panel that offers only the controls each tab
can actually apply. The four suit types collapse into a single chip in the
nav: click it when inactive to return to the last suit, click it when active
to choose another.

| Tab | Shows |
| --- | --- |
| **Summary** | Grand total → suit type → present case status, expandable, with aging as `avg (min, max)` |
| **Law Firms** | Law firm → suit type, ordered busiest first |
| **NI / ARA / ARAE / Others** | The case table for one `suit_type` |
| **Invalid Data** | Error type → the cases failing that filing-date check |

Both aggregate tabs drill down: clicking a leaf row opens the cases behind
it, and clicking one of those opens that case. A case shows its legal and
loan fields, its full hearing history, and every case that client holds —
with the open one marked. Following one of those updates the card in place.

### Filters

Branch, upcoming hearing, product category, litigation status, a client /
CIF / account search, a law-firm search (Law Firms tab only), and warrant:

- **Pending Warrant** — `present_case_status` contains "warrant"
- **Warrant Executed** — a warrant in the case history that a later,
  non-warrant hearing followed; picking this reveals a **Year of Warrant**
  dropdown, the year being that following hearing's

A case can be in both states at once (an old executed warrant and a standing
one), so they are separate predicates rather than a partition.

Every aggregate and every list applies the same three filing-date guards
(`VALID_FILING` in `filters.py`) — present, not after the last hearing, not
in the future. Without that their totals disagree: a summary row would
promise more cases than its drill-down can show.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Liveness |
| `GET /api/filters` | Options + defaults for the filter panel, scoped to a suit |
| `GET /api/cases` | The paged case table; takes every filter |
| `GET /api/case` | One case: fields, hearing history, the client's other cases |
| `GET /api/reportdate` | The report date currently loaded |
| `GET /api/summary` | Suit type → present case status aggregates |
| `GET /api/law_firm` | Law firm → suit type aggregates |
| `GET /api/error_summary` | Counts per error type |
| `GET /api/error_cases` | The cases behind one error type |

## Running a sync manually

The scheduler handles the daily run, but to force one:

```bash
docker compose exec api python -m app.sync
```

(Must be `python -m app.sync`, not `python app/sync.py` — the module uses
package-relative imports.)

## Files

- `docker-compose.yml` — `db`, `api`, `frontend`
- `backend/app/database.py` — both engines: SQL Server (source) + Postgres (warehouse)
- `backend/app/sync.py` — extract-then-replace ETL; source queries live here
- `backend/app/derive.py` — the computed columns added after extract
- `backend/app/filters.py` — filter → SQL translation, shared by every endpoint
- `backend/app/main.py` — endpoints + scheduler wiring
- `frontend/src/App.jsx` — shell: tabs, filter state, data fetching
- `frontend/src/index.css` — the whole design system (tokens, light/dark)
- `frontend/vite.config.js` — proxies `/api` to the `api` container

To change what's synced, edit the queries in `sync.py`. To change a filter's
meaning, edit `build_filters` in `filters.py` — every endpoint goes through
it, so they cannot drift apart.

## Notes / gotchas

- **Single worker only.** The scheduler runs in-process, so uvicorn must stay
  single-worker (the default here). Adding `--workers N` would run the sync N
  times concurrently — move the scheduler to its own service first.
- **Full replace each run.** `sync.py` uses `if_exists="replace"`, which drops
  and recreates each table. Indexes are therefore recreated inside the sync;
  anything you add to the Postgres tables by hand is wiped each run.
- **`misfire_grace_time` is set deliberately.** APScheduler defaults it to 1
  second, which silently drops a job that starts even a moment late. A sync
  holds a thread for minutes, so the defaults here are 3600s (daily) and
  1800s (catch-up).
- **Column types are pandas-inferred.** Values kept as text via `NULLIF` (e.g.
  `Suit Value`, `Litigation_Receivable`) can land as text in Postgres, where
  `SUM()` fails outright — the aggregates cast inside the sum for that reason.
- **`caseid` is not unique** in `litigation_cases` (one fully duplicated row
  in the current data), so anything keyed on it needs `DISTINCT` or a
  composite key.
- **`POSTGRES_HOST` and `POSTGRES_PORT` are not the API's connection.** Inside
  compose the API reaches Postgres at `db:5432` — the service name and the
  container port. `POSTGRES_PORT` is the host-side mapping only, and
  `POSTGRES_INTERNAL_PORT` is the override for running the app outside Docker.
  Pointing the engine at `POSTGRES_PORT` breaks as soon as that is not 5432.
- **Adding the warrant filter needs a sync.** `warrant_executions` is built by
  `sync.py`; on a warehouse loaded before it existed, the filter offers only
  "Pending Warrant" rather than an option that would 503.

## Troubleshooting

- **Endpoints return 503 "Data not ready":** the first sync hasn't finished
  (or failed). Check `docker compose logs -f api` for `sync finished` or a
  traceback.
- **Sync can't reach SQL Server:** confirm it accepts TCP on `DB_PORT_IDLC`
  and allows remote connections, and that `DB_SERVER_IDLC` resolves from the
  container (`host.docker.internal` on Docker Desktop; the `extra_hosts`
  mapping in compose covers Linux).
- **Postgres auth errors:** the `db` container bakes in `POSTGRES_*` on first
  volume creation. If you changed them after the volume existed, remove it:
  `docker compose down -v` (this deletes the warehouse — fine, it re-syncs).
- **Log timestamps look wrong:** they follow the container's `TZ`. Postgres
  also keeps the timezone it was initialised with — `TZ` alone does not move
  an existing volume's `timezone` setting; pass `-c timezone=` to do that.

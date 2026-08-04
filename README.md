# Litigation Dashboard (Dockerized)

FastAPI + React + PostgreSQL. A daily job copies data from the SQL Server
(IDLC) source into a local Postgres warehouse; the API serves it at
`/api/data`; the frontend fetches that and renders a table.

## Architecture

- **`db`** — PostgreSQL 16, the local warehouse. Fully replaced each sync.
- **`api`** — FastAPI. Runs an in-process scheduler that, every day at
  **06:00 Asia/Dhaka**, reads from SQL Server and replaces the Postgres
  tables in one transaction. Also seeds once on startup so the DB isn't
  empty before the first 6am run.
- **`frontend`** — Vite dev server, proxies `/api` to `api`.

**SQL Server (IDLC) is NOT containerized** — the `api` service connects to
your existing SQL Server over the network (`host.docker.internal` for a DB
on your host machine).

## Setup

```bash
cd backend
cp .env.example .env     # then edit with your real SQL Server + Postgres creds
```

Notes on `.env`:

- **SQL Server** (`DB_*_IDLC`): set `DB_SERVER_IDLC=host.docker.internal` if
  SQL Server runs on your host; otherwise the hostname/IP of the DB server.
- **Postgres** (`POSTGRES_*`): these seed the `db` container. `POSTGRES_PORT`
  is only the **host** port for tools like DBeaver — the API always reaches
  Postgres on 5432 inside the Docker network, so changing it does not affect
  the app.

## Run

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- API health: http://localhost:8000/api/health
- API data: http://localhost:8000/api/data

On first boot the API kicks off a sync immediately. Until it finishes,
`/api/data` returns **503 "Data not ready"** — refresh once the sync logs
`sync finished`. Watch progress with `docker compose logs -f api`.

Both app containers hot-reload (source is bind-mounted). Rebuild only when
dependencies change.

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
- `backend/app/sync.py` — extract-then-replace ETL; queries live here
- `backend/app/main.py` — `/api/data` endpoint + scheduler wiring
- `frontend/vite.config.js` — proxies `/api` to the `api` container

To change what's synced, edit the queries in `sync.py`. To change the stat
shown, edit `QUERY` in `main.py`. The frontend renders whatever columns come
back, so no frontend change is needed.

## Notes / gotchas

- **Single worker only.** The scheduler runs in-process, so uvicorn must stay
  single-worker (the default here). Adding `--workers N` would run the sync N
  times concurrently — move the scheduler to its own service first.
- **Daily full replace.** `sync.py` uses `if_exists="replace"`, which drops
  and recreates each table. Any indexes/constraints you add to the Postgres
  tables are wiped each run; add them in the sync if you need them to persist.
- **Column types are pandas-inferred.** Values kept as text via `NULLIF` (e.g.
  `Suit Value`, dates) land as text in Postgres. Cast in `sync.py` before
  `to_sql` if you need numeric/date types.

## Troubleshooting

- **`/api/data` returns 503:** the first sync hasn't finished (or failed).
  Check `docker compose logs -f api` for `sync finished` or a traceback.
- **Sync can't reach SQL Server:** confirm it accepts TCP on `DB_PORT_IDLC`
  and allows remote connections, and that `DB_SERVER_IDLC` resolves from the
  container (`host.docker.internal` on Docker Desktop; the `extra_hosts`
  mapping in compose covers Linux).
- **Postgres auth errors:** the `db` container bakes in `POSTGRES_*` on first
  volume creation. If you changed them after the volume existed, remove it:
  `docker compose down -v` (this deletes the warehouse — fine, it re-syncs).

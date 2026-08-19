# Application Build Plan — Reusable Skeleton

A build plan to instantiate for **any** new application, not a plan for one
application. Copy it into a new project, work through §1, and every phase below
becomes concrete.

It assumes the house stack (§4) and mandates the house design system (§31)
unchanged. Everything else — the domain, the entities, the features — is yours
to fill in.

---

## 0. How to Use This Skeleton

### 0.1 Placeholders

Three placeholders appear throughout. Replace every occurrence when you
instantiate:

| Placeholder | Means | Example |
| --- | --- | --- |
| `<APP>` | The application's name | Litigation Dashboard |
| `<FEATURE>` | One user-facing area, repeated per feature | Summary, Law Firms |
| `<ENTITY>` | One domain object | Case, Order, Patient, Invoice |

### 0.2 Instantiation steps

1. Copy this file into the new repository as `docs/architecture/roadmap.md`.
2. Fill in §1 (product definition). Nothing else can be judged until it exists.
3. Fill in §2 (assumptions) and mark everything unresolved `DECISION REQUIRED`.
4. Delete the phases that genuinely do not apply, **and record why** in §34.
   Deleting silently is how a plan quietly loses its audit or backup phase.
5. Work the phases in the §33 order.

### 0.3 What may not be deleted

Regardless of the app:

- §5 architectural principles
- §7 development rules
- §29 definition of done
- §31 design system
- The auth, audit, testing, backup and production-readiness phases

If one of these looks inapplicable, that is nearly always an app that has not
thought about it yet.

### 0.4 Reading the call-outs

> **EXAMPLE — Litigation Dashboard.** Boxes like this are worked examples from
> the reference implementation this skeleton was distilled from. They are
> illustrations, never requirements. Skip them and the plan still reads whole.

---

# 1. Product Definition — FILL IN

Nothing downstream can be evaluated without this. Write it before Phase 0.

```text
<APP> is a ____________ for ____________.

Primary users:
  - ____________ , who need to ____________
  - ____________ , who need to ____________

The single sentence that justifies building it:
  ____________

A user must be able to:
  1. ____________
  2. ____________
  3. ____________

Explicitly OUT of scope for v1:
  - ____________
  - ____________

The one architectural principle this app cannot violate:
  > ____________
```

That last line matters most. Every app has one invariant that, if broken,
makes it worthless. Name it, then let §5 enforce it.

> **EXAMPLE — Litigation Dashboard.** "Every number displayed must be
> reproducible by drilling into it." An aggregate that promises more records
> than its drill-down can show is worse than no aggregate: it destroys trust in
> every other number on the screen.

---

# 2. Assumptions and Open Decisions — FILL IN

Record what you assumed rather than confirmed. Each row is a thing that, if
wrong, costs rework.

| # | Assumption | Basis | Blocks |
| --- | --- | --- | --- |
| A1 | | | |
| A2 | | | |

Anything unresolved that could materially affect the schema, money, access
control or audit is marked `DECISION REQUIRED` and collected in §34.

The rule: **an assumption is allowed; an undocumented assumption is not.**

---

# 3. Existing Code — FILL IN, or delete

If `<APP>` extends or replaces something, inventory it before proposing
anything. Greenfield projects delete this section.

```text
What exists:        ____________
What must survive:  ____________
What may be broken: ____________
Load-bearing patterns worth carrying forward:
  1. ____________
```

A rewrite that discards a working pattern because it was not invented in this
phase is the most expensive mistake in this document.

---

# 4. Technology Stack

The house stack. It is the default because it is known, it is small, and it has
been carried to production. Swap a component only with an ADR (§7).

## Backend

- **Python 3.11**
- **FastAPI** — async, typed, self-documenting via `/docs`
- **SQLAlchemy 2.0 Core** — `text()` with bound parameters. Add the ORM only if
  the app is genuinely write-heavy and relational; read-heavy apps are clearer
  as SQL
- **PostgreSQL 16**
- **Pydantic v2** — request and response models
- **Alembic** — migrations
- **APScheduler** — if, and only if, the app has scheduled work
- **pytest + httpx**

## Frontend

- **React 18 + Vite**
- **TypeScript** — the default above roughly 1,500 lines of frontend; plain JSX
  is acceptable below it
- **Vanilla CSS with design tokens** — §31. No utility framework, no component
  library
- **Vitest + React Testing Library**
- **Playwright**

## Infrastructure

- **Docker + Docker Compose** — `db`, `api`, `frontend`, plus `nginx` in
  production
- **GitHub Actions**
- **Automated PostgreSQL backups**

## Default answers to recurring proposals

Record the outcome as an ADR so it is not re-litigated every quarter.

| Proposal | Default | Adopt when |
| --- | --- | --- |
| Next.js / SSR | No | The app is public and SEO or first-paint on cold cache matters |
| Tailwind / shadcn/ui | No | Never, while §31 stands — two design systems is worse than either |
| An ORM | No | Writes are the majority of the workload and relations are deep |
| Celery + Redis | No | Jobs must run concurrently, or outlive a request, or the API must scale past one worker |
| Microservices | No | A team boundary, not a code boundary, demands it |
| A component library | No | Never, while §31 stands |

The pattern: **the default is the smaller system.** Each row is a thing to
operate, and the app must earn it.

---

# 5. Architectural Principles

Adapt the wording; do not drop the principle.

## 5.1 One definition per concept

Any rule expressed in more than one place will eventually be expressed two ways.
Filters, permissions, formatting, validation: one module owns each.

## 5.2 The backend owns every rule

The frontend may not compute a business number, enforce a permission, or decide
what a user may see. Client-side arithmetic over a paged list is how two screens
start disagreeing.

## 5.3 Displayed values must be reproducible

Any total, count or summary must be reachable by drilling into it, and the
drill-down must return exactly that. Make it a test, per feature.

## 5.4 Compute expensive things once

If a value costs more than ~100ms per request and does not depend on the
request's inputs, it belongs in a derived column, a materialised view, or a
cache with a stated invalidation rule.

## 5.5 Never hard-delete transactional or financial records

Soft-delete or supersede. Corrections are new rows. History is evidence.

## 5.6 Every consequential action is auditable

Who did what, when, with what inputs. For read-sensitive apps this includes
reads. See §19.

## 5.7 Fail loudly at the boundary

Validate configuration at boot, not at first use. A missing setting must stop
startup with a clear message.

> **EXAMPLE — Litigation Dashboard.** `POSTGRES_HOST` defaulted to `""`, so
> psycopg2 silently fell back to a Unix socket that did not exist in the
> container. Every request returned 503 with a socket error that named nothing
> resembling the cause. A settings object with required fields makes that class
> of bug impossible.

## 5.8 Design for feature *n+1*

A feature is a directory, a route group, a nav entry and a registry row. If
adding one requires editing the shell's logic, the shell is wrong.

---

# 6. Repository Structure

Flat, two services, one compose file. Do **not** start with a monorepo tool —
that is a tooling migration for a problem you do not have yet.

```text
<app>/
│
├── backend/
│   ├── app/
│   │   ├── main.py             # app factory, router registration
│   │   ├── config.py           # settings, validated at boot
│   │   ├── database.py         # engine(s), session management
│   │   │
│   │   ├── core/               # shared, domain-free
│   │   │   ├── filters.py      # query-parameter → SQL translation
│   │   │   ├── paging.py
│   │   │   ├── security.py     # auth dependencies, role checks
│   │   │   └── errors.py
│   │   │
│   │   ├── features/           # one directory per <FEATURE>
│   │   │   └── <feature>/      # routes.py, queries.py, schema.py, service.py
│   │   │
│   │   ├── platform/           # cross-cutting services
│   │   │   ├── audit.py
│   │   │   └── export.py
│   │   │
│   │   └── jobs/               # scheduled work, if any
│   │
│   ├── migrations/
│   ├── tests/
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx             # shell only — no feature knowledge
│   │   ├── shell/              # nav, drawer, theme, layout
│   │   ├── features/           # one directory per <FEATURE>
│   │   ├── components/         # shared, feature-free
│   │   ├── lib/                # api.ts, format.ts, hooks
│   │   ├── icons.tsx
│   │   └── index.css           # the design system (§31)
│   ├── tests/
│   ├── Dockerfile
│   └── vite.config.ts
│
├── docs/
│   ├── architecture/           # roadmap.md (this file), decisions/
│   ├── features/               # one spec per <FEATURE>
│   ├── database/               # schema, business rules
│   └── operations/             # runbooks, backup/restore
│
├── scripts/
├── .github/workflows/
├── CLAUDE.md
├── README.md
├── .env.example
└── docker-compose.yml
```

The load-bearing rule is the `core/` ↔ `features/` split: `core/` may not import
from `features/`, ever. When it needs to, the thing it needs belongs in `core/`.

---

# 7. Development Rules for the AI Agent

The agent must NOT attempt to build the application in one step.

For every phase:

1. Read the existing architecture and current state.
2. Read `CLAUDE.md` and the relevant feature spec.
3. Understand dependencies and what is already implemented.
4. Write or update the design documentation first.
5. Implement the smallest coherent unit.
6. Write tests, including the §5.3 reproducibility test where applicable.
7. Run lint, type checks and the relevant tests.
8. Fix failures — do not report around them.
9. Update documentation.
10. Commit one coherent change.
11. Report what changed and what remains.

Always:

- **Verify against realistic data**, at realistic volume. Ten fixture rows prove
  nothing about a query, a layout, or a page of results
- Do not silently skip tests
- Do not replace working architecture because something newer exists
- Do not add a dependency without stating the benefit — and record it in §4's
  table if it is one of the recurring proposals
- Do not leave placeholder business logic undocumented
- If a requirement is ambiguous and could materially affect the schema, money,
  access control or audit, stop and mark it `DECISION REQUIRED`

---

# 8. Phase 0 — Project Constitution

## Objective

Establish rules, documentation and the safety net before writing feature code.

## Tasks

- `CLAUDE.md`: stack, conventions, invariants, and the commands to run tests
- `docs/architecture/roadmap.md` — this file, instantiated
- `docs/architecture/decisions/` — an ADR per §4 default you are accepting or
  overriding
- A one-command path to a realistic development database (§22.1)
- CI running lint, type check and tests on every push

## Definition of done

```text
[ ] CLAUDE.md written and accurate
[ ] roadmap.md instantiated, placeholders replaced
[ ] ADRs recorded for the stack decisions
[ ] One script produces a working dev database with realistic data
[ ] CI green on an empty project
```

---

# 9. Phase 1 — Domain Model

## Objective

Name the entities, their grain, and their relationships, before any schema.

## Tasks

- List every `<ENTITY>`, its grain (what exactly one row means), and its
  identity
- Identify every natural key and confirm whether it is actually unique
- Document lifecycle: created how, changed by whom, deleted or superseded how
- Note every entity subject to audit or retention rules

## Definition of done

```text
[ ] Every entity documented with its grain in one sentence
[ ] Uniqueness of each natural key verified against real data, not assumed
[ ] Relationships and cardinalities documented
[ ] Lifecycle documented per entity
```

> **EXAMPLE — Litigation Dashboard.** `caseid` looks like a primary key and is
> not: the source contains fully duplicated rows. Anything keyed on it needs
> `DISTINCT` or a composite key. Verifying uniqueness against the real data
> took one query and saved a class of silent double-counting.

---

# 10. Phase 2 — Data Layer

## Objective

Schema, migrations and access, with configuration validated at boot.

## Tasks

- Schema with real constraints — NOT NULL, foreign keys, checks. A constraint
  the database enforces is worth ten the application remembers
- Alembic migrations from the first table, reversible
- `config.py` validating every required setting at startup (§5.7)
- Connection pooling sized deliberately
- Index every column that will be filtered, joined or ordered

## Definition of done

```text
[ ] Migrations create the schema from empty and roll back cleanly
[ ] Constraints enforced in the database, not only in code
[ ] Missing configuration stops startup with a message naming the setting
[ ] Indexes present for every filtered/joined column
[ ] ANALYZE (or equivalent statistics refresh) part of any bulk load
```

> **EXAMPLE — Litigation Dashboard.** A restored database with no statistics
> turned a 200ms aggregate into a query that had not returned in two minutes.
> `ANALYZE` after a bulk load is not optional.

---

# 11. Phase 3 — External Data and Scheduled Work — *delete if not applicable*

## Objective

Bring data in from elsewhere on a schedule, safely.

## Tasks

- A source registry: adding a source means adding one file, never editing the
  orchestrator
- Load in a transaction; a failed load leaves the previous data intact
- A lock so two runs can never overlap
- Record per-run statistics: rows, duration, outcome, source watermark
- Make freshness visible in the UI, not just in logs
- Alert when data goes stale

## Definition of done

```text
[ ] Adding a source = one new file
[ ] Failure leaves the previous data intact — proven by a test
[ ] Concurrent invocation proven impossible
[ ] Freshness visible on every screen that shows the data
[ ] Staleness alerting configured with a runbook
```

> **EXAMPLE — Two scheduling traps.** A cron trigger built without an explicit
> timezone takes the *local* zone at construction — it does not inherit the
> scheduler's. And APScheduler defaults `misfire_grace_time` to **one second**,
> silently dropping a job that starts a moment late; a job holding a thread for
> minutes needs it set deliberately.

---

# 12. Phase 4 — Feature Registry

## Objective

Define what a feature *is*, once, so features 2..n cost a fraction of feature 1.

A feature declares:

```text
key            stable identifier
label          what the nav says
routes         its router
permissions    which roles may reach it
filters        which shared filters it can apply
nav            where it appears, and its order
```

## Definition of done

```text
[ ] A feature is a directory plus a registry entry — no shell edits
[ ] The registry drives nav, routing and permissions
[ ] A stub feature can be added end to end in under an hour
[ ] core/ imports nothing from features/
```

---

# 13. Phase 5 — Query and Filter Layer

## Objective

One vocabulary for narrowing data, shared by every feature.

## Tasks

- A filter declares its parameter name, its predicate, and its bound parameters
- Composition returns the clause and its parameters; **an empty filter set must
  produce a valid statement**
- Guards — predicates a feature may not switch off — are filters too
- Bound parameters everywhere; never interpolate a value into SQL

## Definition of done

```text
[ ] Every filter defined once, used by every feature that offers it
[ ] Empty selections produce valid SQL — with a test that asserts it
[ ] Guards cannot be disabled by a feature
[ ] No value interpolated into a SQL string anywhere
[ ] Adding a filter requires no endpoint changes
```

> **EXAMPLE — Litigation Dashboard.** Deselecting every product *and* every
> status produced `FROM litigation_cases  AND …` — a crash reachable by two
> clicks, because the composer assumed at least one predicate.

---

# 14. Phase 6 — API Surface

## Objective

Consistent, documented, versioned endpoints.

## Tasks

- Uniform response shapes across features
- Uniform error shapes, with a machine-readable code and a human message
- Paging: stable total order, ties broken, `total` computed with **exactly** the
  predicates the page query uses
- Correct status codes; never an empty 200 for a real failure
- OpenAPI accurate enough to be the contract

## Definition of done

```text
[ ] Response and error shapes identical across features
[ ] COUNT and SELECT share one predicate set, structurally
[ ] Paging stable under concurrent writes
[ ] Every endpoint typed with request/response models
[ ] A not-ready dependency returns 503 with a clear message
```

> **EXAMPLE — Litigation Dashboard.** The list `COUNT` omitted the validity
> guards the page query applied, so `total_pages` overstated and a drill-down
> disagreed with the summary that opened it. Both queries must be built from
> one predicate set, not two that look alike.

---

# 15. Phase 7 — Application Shell

## Objective

The frame every feature renders inside.

## Tasks

- Nav from the registry, filtered by permissions
- Routing, deep links, and browser back behaving correctly
- Theme applied **before first paint** — no flash
- Global loading, error and empty states
- Responsive behaviour per §31.9

## Definition of done

```text
[ ] Adding a feature changes no shell code
[ ] Re-selecting the active feature does not blank its data
[ ] Deep links restore full state; back works
[ ] No layout overlap from 360px to 2560px
[ ] Theme pre-paint, no flash
[ ] Fully keyboard navigable, focus always visible
```

> **EXAMPLE — Litigation Dashboard.** Re-selecting the already-active tab
> emptied the list: state was cleared, but the fetch effect never re-ran because
> the tab object's identity was unchanged. The fix was to tag each payload with
> the key it was fetched for and render only on a match — clearing state and
> tagging payloads look equivalent and are not.

---

# 16. Phase 8 — Shared Components

## Objective

The components every feature reuses, so features contain domain logic only.

## Typical inventory

Table with sorting and paging; detail view; form controls with validation
display; modal; filter panel; empty, loading and error states; toast; confirm
dialog.

## Definition of done

```text
[ ] No feature implements its own table, modal or form control
[ ] Every component has loading, empty and error states
[ ] Props contracts documented
[ ] Large lists profiled — no layout thrashing
[ ] Every component checked in both themes and at both breakpoint extremes
```

> **EXAMPLE — Litigation Dashboard.** `position: sticky` belongs on `<td>` and
> `<th>`, never `<tr>`. And 220 elements in one sticky chain cost 454 layout
> reads on every switch, which is what "the tabs feel slow" turned out to mean.

---

# 17. Phase 9 — Features — *repeat per `<FEATURE>`*

No feature may start before Phases 5–8 are done. Each follows the same loop.

1. Write `docs/features/<feature>.md`: what it does, its entities, its
   permissions, its filters
2. Add schema or derivations if needed
3. Declare the feature in the registry
4. Implement queries and routes through the shared layers
5. Implement the UI from shared components
6. Write the reproducibility test (§5.3)
7. Verify against realistic data at realistic volume

## Per-feature definition of done

```text
[ ] Feature spec written
[ ] Implemented through shared layers, nothing reimplemented locally
[ ] Every displayed value reproducible — tested
[ ] Permissions declared and enforced backend-side
[ ] Audit events emitted
[ ] Loading, empty and error states present
[ ] Verified against realistic data
[ ] Documented as complete in the roadmap
```

---

# 18. Phase 10 — Authentication and Authorisation

## Objective

Know who is asking, and what they may do.

## Tasks

- `DECISION REQUIRED`: identity provider. SSO/OIDC beats local accounts wherever
  an organisation already has a directory
- Sessions or tokens with deliberate expiry; cookies `Secure`, `HttpOnly`,
  `SameSite`
- Roles and permissions in the schema, not in code constants
- Enforcement in a dependency on every route
- Row-level scoping where a role should see only part of the data — implemented
  **in the query layer** (§13), never per feature

## Role matrix — FILL IN

| Role | May see | May change |
| --- | --- | --- |
| Administrator | | |
| | | |
| Read-only / auditor | | |

## Definition of done

```text
[ ] No endpoint reachable unauthenticated except health
[ ] Authorisation enforced backend-side on every route
[ ] Row-level scoping in the query layer, not per feature
[ ] A test per role asserting both access and denial
[ ] Session expiry, logout and cookie flags correct
[ ] Passwords (if local) hashed with a current algorithm
```

---

# 19. Phase 11 — Audit

## Objective

Reconstruct who did what.

## Minimum recorded

| Event | Captured |
| --- | --- |
| Login, logout, failure | user, time, address |
| Create / update / delete | user, entity, before, after |
| Permission change | actor, subject, before, after |
| Export | user, filters, row count, format |
| Scheduled job run | trigger, duration, outcome |
| Sensitive read *(if applicable)* | user, entity, filters |

Append-only, enforced by permissions rather than convention. Retention is
`DECISION REQUIRED` — compliance sets it, not engineering.

## Definition of done

```text
[ ] Every event above recorded with enough context to reconstruct intent
[ ] Append-only, enforced by database permissions
[ ] Searchable by an auditor role
[ ] An audit write failure never silently loses the event
[ ] Retention documented and implemented
```

---

# 20. Phase 12 — Import and Export — *delete if not applicable*

## Objective

Move data in and out in the formats users already work in.

## Tasks

- Export the current view **with its filters applied**
- Stamp every export with the filters, the user, the time, and the data's
  as-of date — an undated export is misinformation six weeks later
- A row ceiling, with a message saying what to narrow
- Import: validate fully, report every error at once, apply atomically
- Audit both directions

## Definition of done

```text
[ ] Export reflects the exact filtered view
[ ] Provenance stamped inside the file
[ ] Numbers typed as numbers, dates as dates
[ ] Ceiling enforced with an actionable message
[ ] Import validates before applying anything; partial imports impossible
[ ] Both directions audited
```

---

# 21. Phase 13 — Performance

## Objective

Keep interactions within a stated budget at realistic volume.

## Budgets — FILL IN

| Interaction | Budget |
| --- | --- |
| Primary list / dashboard | < 800ms |
| Detail view | < 400ms |
| Search / autocomplete | < 200ms |
| Write | < 500ms |
| Client-side navigation | < 100ms to first paint |

## Tasks

- `EXPLAIN (ANALYZE, BUFFERS)` for every non-trivial query, committed to `docs/`
- Index, then measure; never the reverse
- Precompute anything over budget that inputs do not affect
- Client side: no layout thrashing, no measurement in a loop
- Load-test the heaviest endpoint

## Definition of done

```text
[ ] Every budget met at realistic volume and recorded
[ ] Query plans committed for the heaviest queries
[ ] A performance regression test in CI
[ ] Frontend profiled on the largest realistic dataset
```

---

# 22. Phase 14 — Testing Strategy

## 22.1 The approach

Test against **realistic data through the real application**. A suite that
passes on ten fixture rows and a mocked API proves the mocks agree with
themselves.

Concretely: one script restores a realistic dataset; the real backend runs
against it; the real frontend is driven against that backend; assertions are on
payloads, counts and geometry rather than screenshots.

> **EXAMPLE — Litigation Dashboard.** This approach found five distinct bugs in
> one aggregate query, a `COUNT` missing its guards, a frozen list, a layout
> that hid the page title, and a suggestion list that silently loaded three
> pages instead of one. None would have survived to production; all of them
> survived unit tests.

## 22.2 Layers

| Layer | Covers |
| --- | --- |
| Unit | Pure logic: filters, formatting, calculations |
| Integration | Queries against a real database |
| Reproducibility | Every displayed value equals its drill-down (§5.3) |
| API | Status codes, auth, paging, error shapes |
| Component | Loading, empty, error states |
| End-to-end | Real app, real data, per feature |
| Visual / geometry | No overlap, breakpoints, both themes |
| Performance | The §21 budgets |

## 22.3 Non-negotiable

- Empty or absent filter selections produce valid queries
- Every role is denied what it must not reach
- A failed bulk load leaves prior data intact
- Every screen renders at 360px and 2560px without overlap
- Every displayed total reconciles

## Definition of done

```text
[ ] Realistic-data harness runs in CI on every push
[ ] Reproducibility test per feature
[ ] Auth denial test per role
[ ] E2E per feature, in both themes
[ ] Coverage reported; business-critical paths covered
```

---

# 23. Phase 15 — Dockerization

## Objective

One command from a clean checkout to a running application.

## Tasks

- `db`, `api`, `frontend`; `nginx` in production
- Multi-stage builds; production ships static assets, not a dev server
- Non-root users, pinned base images, no secrets baked in
- Health checks that test dependencies, not just liveness
- Named volumes for data

## Definition of done

```text
[ ] docker compose up --build works from a clean checkout
[ ] Production images non-root, pinned, secret-free
[ ] Health checks test real dependencies
[ ] .env.example documents every variable and which side it applies to
[ ] Container ports and host ports never conflated
```

> **EXAMPLE — Two compose traps.** Port mapping is `host:container`: the
> postgres image ignores `POSTGRES_PORT` and always listens on 5432 inside, so
> `"${POSTGRES_PORT}:${POSTGRES_PORT}"` points at nothing the moment that is
> not 5432. And a service reaches another by **service name**, not localhost —
> the internal port and the published port deserve different setting names.

---

# 24. Phase 16 — Deployment

## Objective

Repeatable, reversible releases.

## Tasks

- `DECISION REQUIRED`: target environment and who operates it
- CI/CD: build, test, image, deploy
- Migrations as an explicit, reversible release step
- TLS everywhere; HTTP redirects
- **Worker count deliberate.** In-process scheduling forbids more than one
  worker — `--workers N` would run every scheduled job N times. Pin it and
  comment why

## Definition of done

```text
[ ] Deployment is one documented command or pipeline run
[ ] Rollback documented and rehearsed, not theorised
[ ] Migrations automatic and reversible
[ ] TLS enforced; no plaintext listener
[ ] Worker count pinned with its reason in the config
[ ] Zero-downtime, or the downtime window stated
```

---

# 25. Phase 17 — Backup and Disaster Recovery

## Objective

Survive losing the database.

## Tasks

- Classify each dataset: **reproducible** (can be rebuilt from a source) or
  **irreplaceable** (exists nowhere else). Back them up differently and say so
- Automated, offsite, encrypted backups of everything irreplaceable
- **Rehearse a restore.** An untested backup is a hypothesis
- State RTO and RPO, then prove them

## Definition of done

```text
[ ] Every dataset classified reproducible or irreplaceable
[ ] Irreplaceable data backed up on a schedule, offsite, encrypted
[ ] A restore rehearsed end to end and timed
[ ] RTO and RPO stated and met
[ ] Recovery documented step by step in docs/operations/
```

---

# 26. Phase 18 — UAT and Production Readiness

## Acceptance scenarios — FILL IN

One end-to-end narrative per role, written as a task the person actually has —
not a feature list.

```text
<role>: opens ____________, does ____________, and can then ____________
```

## Production readiness checklist

```text
[ ] Every feature's values reconcile
[ ] Every role tested for access and denial
[ ] Backups verified by a real restore
[ ] Performance budgets met at realistic volume
[ ] Runbooks written for each alert
[ ] Accessibility pass: contrast, keyboard, screen reader
[ ] No secrets in the repository or images
[ ] Dependency vulnerability scan clean
[ ] Rollback rehearsed
[ ] Monitoring and alerting live
[ ] Support handover complete
```

---

# 27. Scope and Sequencing — FILL IN

## MVP

The smallest thing that delivers the §1 sentence, plus auth and audit. Not a
feature list — a coherent slice someone can use daily.

```text
MVP:    ____________
V1.1:   ____________
V2:     ____________
Later:  ____________
```

The MVP's purpose is to prove the **second feature is cheap**. If feature 2 is
not markedly faster to build than feature 1, the shared layers are wrong — fix
them before continuing.

---

# 28. Cross-Cutting Rules

## 28.1 API

- Same filter name means the same thing in every feature
- Uniform list and detail response shapes
- Machine-readable error codes alongside human messages
- Version when a response shape changes

## 28.2 Database

- Bound parameters everywhere
- Constraints in the database, not only in the application
- Index every filtered column; measure after
- Money in a decimal type, never a float
- Timestamps with timezone; store UTC, present local

## 28.3 UI/UX

- Every screen opens with something, not an empty search form
- Loading, empty and error states are required, not optional
- Destructive actions confirm and say what will be lost
- Forms show validation errors next to the field, and keep the input
- The page body never scrolls horizontally; wide content scrolls inside itself
- Full keyboard operability

## 28.4 Business rules — FILL IN

Every rule someone will eventually dispute, documented with the code or SQL
that implements it:

```text
- ____________ : defined as ____________ , implemented in ____________
```

---

# 29. Definition of Done for Every Feature

```text
[ ] Schema changes complete and migrated
[ ] Backend logic complete
[ ] API complete and documented
[ ] Frontend complete
[ ] Shared layers used; nothing reimplemented locally
[ ] Displayed values reproducible
[ ] Authorization enforced backend-side
[ ] Audit events emitted
[ ] Validation complete, both sides
[ ] Error, loading and empty states complete
[ ] Tests written and passing
[ ] Verified against realistic data at realistic volume
[ ] Performance budget met
[ ] Accessibility checked
[ ] Documentation updated
```

---

# 30. AI Agent Operating Prompt

> You are the lead architect and senior full-stack engineer for `<APP>`.
>
> Do not implement the whole application in one step. Work phase by phase from
> `docs/architecture/roadmap.md`.
>
> Before modifying code:
>
> 1. Inspect the repository.
> 2. Read `CLAUDE.md` and the relevant feature spec.
> 3. Read the architecture decisions — they record what was already rejected
>    and why.
> 4. Determine dependencies and what already exists.
> 5. Identify the smallest coherent unit.
>
> For every implementation:
>
> - Preserve working functionality.
> - Route every shared concern through its shared module — filters, permissions,
>   formatting, validation.
> - Apply the same predicates to a COUNT as to its SELECT.
> - Use bound parameters; never interpolate values into SQL.
> - Enforce authorization on the backend, never in the frontend.
> - Emit audit events for consequential actions.
> - Validate configuration at boot and fail loudly.
> - Verify against realistic data at realistic volume — not fixtures, not ten
>   rows.
> - Prove every displayed total by drilling into it.
> - Run lint, type checks and tests before declaring completion.
> - Update documentation when architecture or a business definition changes.
>
> Never invent a business rule without documenting the assumption.
>
> If a requirement is ambiguous and could materially affect the schema, money,
> access control, or audit, stop and mark it `DECISION REQUIRED` rather than
> implementing a dangerous assumption.
>
> Prefer the simplest thing that satisfies the invariants. Do not add a
> dependency without a stated benefit.
>
> For every phase report: what was implemented, files changed, schema changes,
> API changes, tests added, tests executed, known limitations, and the next
> recommended task.
>
> Do not claim a feature is complete unless it is implemented, tested, and
> verified against realistic data.

---
# 31. Brand Identity and Design System — FIXED, DO NOT REDESIGN

The design system is **not** to be designed. It exists, it is implemented in
`frontend/src/index.css`, and it was tuned against the IDLC logo and audited for
contrast. This section documents it so new features extend it rather than
inventing beside it.

**This chapter is the house standard and carries into every application built
from this skeleton, unchanged.** A future app with a different brand replaces
the palette source in §31.1 and nothing else — every rule below survives the
swap, because the rules are about contrast, meaning and restraint, not about
one particular red.

## 31.1 Brand source

The IDLC logo is the authoritative reference. It establishes:

1. **Brand red** — `#ED1C24`, the mark's own red
2. **Warm neutrals** — greys carrying a trace of warmth, not the blue-tinted
   greys the UI started with, which sat badly against the red
3. **High-contrast type** on near-white and near-black surfaces

The logo is a brand asset. Render it as the supplied SVG path; never re-create
it from text or substitute a generic icon.

## 31.2 The one rule about the accent

The mark keeps the untouched brand red (`BRAND_RED` in `icons.jsx`). The **UI
accent is not the same colour**: `#ED1C24` reaches only 4.38:1 against white,
so it cannot be what a 12px bold label sits on. The accent is darkened to
`#d11f27` (4.5:1+), and in dark mode lightened well past the brand red to
`#ff6b6b`, because the brand red on a near-black surface is too dark to read as
a selected state.

Do not "correct" either value back to the logo's red.

## 31.3 Personality

The system should read as: precise, calm, institutional, fast, legible under
pressure. A person reconciling a loan book at 6pm is the user.

Avoid: decorative gradients, glassmorphism, heavy shadows, playful rounding,
generic blue SaaS styling, and colour used for anything other than meaning.

## 31.4 Tokens

Defined once on `:root`, redefined for `[data-theme="dark"]`. Never write a raw
hex in a component.

```css
:root {
  /* surfaces — warm neutrals */
  --bg: #f6f5f6;  --surface: #ffffff;
  --surface-2: #fbfafa;  --surface-3: #f2f1f1;  --surface-hover: #faf6f6;

  /* strokes */
  --line: #e7e4e5;  --line-strong: #d6d2d3;

  /* type */
  --text: #171314;  --text-2: #5b5457;  --text-3: #726c6f;

  /* accent — see 31.2 */
  --accent: #d11f27;  --accent-hover: #b81d24;
  --accent-contrast: #ffffff;  --accent-soft: #fdeced;
  --tab-hover: rgba(23, 19, 20, 0.07);

  /* semantic */
  --ok-bg: #e7f7ee;   --ok-fg: #087443;
  --off-bg: #f0efef;  --off-fg: #5f5a5c;
  --danger-bg: #fdf2f5; --danger-fg: #9f1239; --danger-line: #f6cdd8;

  /* geometry, elevation, motion */
  --r-sm: 7px; --r-md: 10px; --r-lg: 14px; --r-xl: 18px; --r-full: 999px;
  --shadow-xs … --shadow-lg;
  --ease: cubic-bezier(0.32, 0.72, 0, 1);

  /* layout */
  --topbar-h: 64px;  --sidebar-w: 276px;  --gutter: 22px;

  --font: "IDLC", "Inter", system-ui, sans-serif;
  --mono: "IDLC", "JetBrains Mono", ui-monospace, monospace;
}
```

Three token choices that carry meaning and must not be flattened:

- `--tab-hover` is **neutral**, not a red tint. Once the selected pill became
  red, a red hover made a merely-hovered tab read as the selected one
- `--danger-*` is a deeper, pinker red than the accent, so an error banner
  cannot be mistaken for a selected control
- `--surface-3`, not `--accent-soft`, backs aggregate sub-rows — accent-soft
  made every summary row read as an alert

## 31.5 Theming

Light and dark via `data-theme` on the root, stamped **before first paint** by
an inline script in `index.html`. Dark mode redefines only the tokens. A new
component that needs a theme conditional is a component that should have used a
token.

## 31.6 Status badges

One vocabulary across every feature:

| Meaning | Tokens |
| --- | --- |
| Active / good | `--ok-bg` / `--ok-fg` |
| Inactive / neutral | `--off-bg` / `--off-fg` |
| Error / invalid | `--danger-bg` / `--danger-fg` / `--danger-line` |
| Identity (CIF, codes) | `.badge.cif` — monospace, subdued |

A status colour means the same thing in every feature or it means nothing.

## 31.7 Motion

- One easing token, `--ease`
- Short and purposeful: 150ms for dismissal, ~300ms for the nav pill
- Motion communicates continuity — the sliding tab pill shows where you came
  from. It is not decoration
- Animate `transform` and `opacity`. Animating a width against snapping grid
  columns leaves the pill trailing its tab by 45px
- Every animation respects `prefers-reduced-motion: reduce`

## 31.8 Accessibility

- **4.5:1** for normal text, **3:1** for large. 12px bold is *not* large — the
  bar that sank the first accent choice
- Visible focus on every interactive element
- Full keyboard operation, including menus, suggestion lists and drill-downs
- Semantic tables with real headers; `aria-current` on the open record
- Never colour alone: pair every status colour with a label

## 31.9 Responsive

| Breakpoint | Behaviour |
| --- | --- |
| > 1150px | Sidebar filters, horizontal nav |
| ≤ 1150px | Filters become a drawer **and** the nav reflows below the title — together, or the nav overlaps the title |
| ≤ 725px | Grouped nav items reveal vertically as a menu instead of spreading horizontally |
| ≤ 600px | Single column; tables scroll inside their own container |

The page body must never scroll horizontally. Wide tables scroll inside
`overflow-x: auto`.

## 31.10 Component inventory

Existing, to be reused:

**Foundation** — tokens, typography, badges, icons, skeletons
**Layout** — topbar, nav with sliding pill, sidebar/drawer, modal
**Filters** — select, `MultiSelect`, `Suggest`, search, clear-all, match count
**Data** — aggregate table with expandable rows, list table with row-click,
paging, field grids, history table, related-records table
**Feedback** — loading bar, skeletons, empty state, error banner, count badges

To be added by this plan:

**Auth** — login, role badge, permission-denied state
**Export** — export button, format picker, ceiling-exceeded message
**Admin** — user table, role editor, audit log viewer with filters
**Charts** — `DECISION REQUIRED`: none exist today. If added, one library, one
palette derived from these tokens, and never colour-only encoding

## 31.11 Rules for agents touching the UI

1. Read `index.css` before adding a style
2. If a value repeats, it is a token
3. New component types extend the system; they do not introduce a second one
4. Check both themes and both extremes of the breakpoint range
5. Verify contrast numerically — do not eyeball it
6. No component library, no utility framework (§4, and the ADR that records it)

---

# 32. Documentation Layout

```text
docs/
├── architecture/
│   ├── roadmap.md              # this plan, instantiated
│   ├── overview.md             # how the pieces fit
│   └── decisions/              # one ADR per significant choice
├── features/
│   └── <feature>.md            # what it does, entities, permissions, filters
├── database/
│   ├── schema.md
│   └── business-rules.md       # §28.4, each with its implementation
└── operations/
    ├── runbooks/               # one per alert
    ├── deployment.md
    └── backup-restore.md
```

An ADR is three paragraphs: what was decided, what was rejected, and why. It
exists so the next person — or the next agent — does not re-propose the
rejected option in six months.

---

# 33. Implementation Order

1. **Phase 0** — constitution, docs, CI, dev-data script
2. **Phase 1–2** — domain model, schema, config validation
3. **Phase 3** — external data and scheduled work *(if applicable)*
4. **Phase 4** — feature registry
5. **Phase 5–6** — query/filter layer, API conventions
6. **Phase 7–8** — shell and shared components
7. **Feature 1** — the first real feature, end to end
8. **Phase 10–11** — auth, authorisation, audit
9. → **MVP**
10. **Feature 2** — the cost test
11. **Phase 12–13** — import/export, performance
12. **Phase 14–15** — testing, Docker hardening
13. **Phase 16–17** — deployment, backup and DR
14. **Remaining features**
15. **Phase 18** — UAT and production readiness

Two checkpoints where stopping to fix beats pressing on:

- **After step 7.** If the first feature fought the shared layers, they are
  wrong. Fix them while there is one feature to migrate, not six.
- **After step 10.** Measure how long feature 2 actually took. If it was not
  markedly cheaper than feature 1, the abstraction is not paying for itself —
  re-plan before building the rest.

---

# 34. Open Decisions — FILL IN

Every `DECISION REQUIRED` in one table, with the phase it blocks. A decision
that blocks nothing is not a decision; delete it.

| # | Decision | Blocks | Owner | Resolved |
| --- | --- | --- | --- | --- |
| D1 | | | | |
| D2 | | | | |

Recurring ones worth asking early, because each reshapes a phase:

- Identity provider — SSO or local accounts? *(Phase 10)*
- Audit retention period, and who sets it *(Phase 11)*
- Deployment target, and who operates it *(Phase 16)*
- Data classification: what is reproducible, what is irreplaceable *(Phase 17)*
- Is any of this data subject to a regulatory regime? *(everything)*

---

# 35. Phases Deliberately Skipped — FILL IN

Recording a skip is how a plan stays honest. An empty table means every phase
applies.

| Phase | Why it does not apply | Decided by |
| --- | --- | --- |
| | | |

Per §0.3, the auth, audit, testing, backup and production-readiness phases
cannot be skipped — only scoped down, and the scoping recorded here.

---

*This skeleton was distilled from a production application. Where a rule seems
excessive, it is usually there because its absence cost something. Adapt the
wording freely; drop a principle only with a reason written down.*

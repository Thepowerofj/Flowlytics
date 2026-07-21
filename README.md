<p align="center">
  <img src="docs/assets/flowlytics-hero.svg" alt="Flowlytics — animated analytics pipeline" width="920" />
</p>

<h1 align="center">Flowlytics</h1>

<p align="center">
  <strong>Visual data analytics flows for small businesses</strong><br />
  Drop a spreadsheet · auto-wire a pipeline · run in the background · get insights
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#product-flows">Product flows</a> ·
  <a href="#docs">Docs</a> ·
  <a href="#stack">Stack</a>
</p>

---

Flowlytics is a modular monolith for building **drag-and-drop analytics pipelines**: ingest CSV/Excel, clean and cast columns, aggregate, chart, forecast, optional AI analyse, and export — with a database-backed job queue so runs keep going after you leave the canvas.

## Features

| Area | What you get |
| --- | --- |
| **Canvas** | Compact activity nodes, In/Out ports, live run progress, history snapshots |
| **Auto pipeline** | Upload data + set a goal → Flowlytics profiles columns, seeds Clean/Map casts, wires Stats/Chart/Forecast/AI, then **auto-aligns** the graph |
| **Clean / Map** | Rename, drop, cast (date / currency / number / boolean), formats that cascade downstream |
| **Analyse** | Stats with key findings, charts (time-series aware), forecast toolkit with confidence bands |
| **AI (opt-in)** | Structure / Explain / Analyse with BYOK; structured insight showcases on the canvas |
| **Jobs** | Separate worker process, fair queue, ETA, schedules, fail-stop retry |
| **Access** | Email + Google auth, EFT + short payment refs (`FL-XXXXXX`), admin activation |
| **Email** | Branded transactional mail (welcome, reset, EFT/access, pipeline failures) |

## Quick start

**Prerequisites:** Node 20+, [pnpm](https://pnpm.io), Docker (Postgres).

```bash
# 1. Configure
cp .env.example .env
# set AUTH_SECRET (and SMTP_PASS / ADMIN_EMAILS / Google OAuth as needed)

# 2. Database
docker compose up -d db

# 3. Install & migrate
pnpm install
pnpm db:migrate

# 4. App + worker (two terminals)
pnpm dev
pnpm worker
```

Health check: `GET http://localhost:3000/api/health`

> **Tip:** If port 3000 is busy, Next.js picks the next free port — check the terminal output.

### Environment highlights

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection (Compose maps host **5433** by default) |
| `AUTH_SECRET` / `AUTH_URL` | Auth.js secret + public URL (needed for email links) |
| `ADMIN_EMAILS` | Comma-separated admin allowlist |
| `SMTP_*` / `MAIL_FROM` | Transactional email (leave `SMTP_PASS` empty to log in dev) |
| `SMTP_TLS_SERVERNAME` | Shared-host TLS cert name when it differs from `SMTP_HOST` |
| `BANK_*` | EFT details shown on Billing |

Never commit `.env` — secrets stay local.

## Product flows

```text
Signup / Login ──► Billing (EFT + payment ref) ──► Home (your flows)
                                                      │
                         ┌────────────────────────────┤
                         ▼                            ▼
                  Auto-build modal              Open canvas
                  (goal + file/notes)           (edit · Run)
                         │                            │
                         └──────────► Worker queue ◄──┘
                                         │
                                         ▼
                              Results · History · Email on failure
```

1. **Home** — saved pipelines first; compact **Auto analysis** strip opens a modal (goal before build).
2. **Canvas** — Ingest → Clean/Map → Aggregate / Stats / Chart / Forecast → AI → Export.
3. **Auto align** — toolbar action (same layout used by the auto-builder) spaces activities without overlap.
4. **Run** — safe to leave; worker continues; reopen for live progress or History.
5. **Schedules** — daily / weekly / custom (early access; uploaded data until connectors ship).

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js 15 · React 19 · TypeScript · Tailwind |
| Data | PostgreSQL · Prisma |
| Auth | Auth.js (email/password + Google) |
| Jobs | DB-backed queue · `pnpm worker` |
| Mail | Nodemailer · SMTP |
| Validation | Zod |

Architecture: **modular monolith** — domain modules under `src/modules/*` with public `index.ts` APIs.

## Docs

| Doc | Role |
| --- | --- |
| [`AGENTS.md`](./AGENTS.md) | Engineering constitution |
| [`BUILD_SPEC.md`](./BUILD_SPEC.md) | Build playbook |
| [`docs/PRODUCT_SPEC.md`](./docs/PRODUCT_SPEC.md) | Capabilities (CAP-*) |
| [`docs/PROJECT_STATE.md`](./docs/PROJECT_STATE.md) | Live status & next steps |
| [`docs/USER_STORIES.md`](./docs/USER_STORIES.md) | Acceptance-oriented stories |
| [`docs/design/`](./docs/design/) | UX / tokens / canvas |
| [`docs/architecture/`](./docs/architecture/) | ADRs |
| [`docs/operations/DEPLOYMENT.md`](./docs/operations/DEPLOYMENT.md) | VPS deploy (**approval required**) |

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Next.js (Turbopack) |
| `pnpm worker` | Background job worker |
| `pnpm test` | Vitest domain/unit suite |
| `pnpm db:migrate` | Prisma migrate (dev) |
| `pnpm build` | Production build |

## Security notes

- No secrets in git (`.env` is ignored).
- Never trust client-supplied `userId` — ownership is resolved server-side.
- AI blocks require per-block opt-in and a user API key (BYOK).
- Production deploy and live payment gateways need explicit approval.

## License

Private / proprietary unless otherwise stated by the repository owner.

---

<p align="center">
  <sub>Built for operators who want answers from spreadsheets — without drowning in BI tooling.</sub>
</p>

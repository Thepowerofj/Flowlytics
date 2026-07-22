# Project State

Last updated: 2026-07-22

# Current goal

Ship Flowlytics vNext locally: PayFast, Ask mode, forecast playground, presentation exports, connectors — with accuracy fixtures.

Public repo: https://github.com/Thepowerofj/Flowlytics

# Current slice

vNext full-scope implementation (accuracy fixtures → forecast playground → PayFast → Ask → PDF/PPTX → URL/email connectors).

# Completed

- Prior v1 canvas, auto-pipeline, AI BYOK, EFT access window, schedules, notify mail
- **Accuracy:** `fixtures/analytics/*` + `accuracy.fixtures.test.ts` / `periodOrder.test.ts`
- **Forecast playground:** period order, ensemble, method compare + holdout MAE, goal prompt, wide/long output
- **PayFast:** checkout + ITN signature verify → `activateAccess`; EFT fallback retained; `Payment` model
- **Ask:** `/ask` chat threads → auto-pipeline + enqueue; Attach CSV/Excel; clarify questions before first build; follow-ups reuse ingest + revise/re-run; styled chat + forecast-first results; full-bleed layout
- **Forecast inference:** measure ranking skips ID-like columns (e.g. pharmacyId); timeseries plans use Forecast chart (orange series) instead of a history-only Chart step
- **Blocks:** client-safe `catalog.ts` (meta/defaultConfig); full `registry.ts` (with `run`) is server/worker-only — fixes nodemailer in client bundles
- **Present:** Polished PDF/PPTX insight packs (cover, KPI cards, findings/actions, evidence table) via `/api/export/presentation`
- **Connectors:** `ingest.url`, `output.email`, `output.presentation` blocks
- Tests: `pnpm test` (149); `tsc --noEmit` clean

# In progress

- None blocking local use

# Next

1. Configure live/sandbox PayFast merchant env + public ITN URL
2. Production VPS deploy (requires approval)
3. Optional IMAP / Google Drive connectors
4. Optional Playwright E2E

# Decisions and assumptions

- PayFast is the primary payment gateway; manual EFT is fallback only
- Ask mode shares the canvas pipeline engine (not a separate agent)
- Forecast stays pure-TS (no ARIMA/Prophet); ensemble averages selected methods
- URL ingest refreshes on every run (including schedules)
- Soft upload limit default is **20MB** (`MAX_UPLOAD_BYTES=20971520`)

# Known risks/blockers

- PayFast ITN needs a publicly reachable `AUTH_URL` notify endpoint
- Prisma generate can EPERM on Windows while Next holds the query engine DLL
- SMTP host must resolve for live outbound email

# Verification status

- types: pass (`pnpm exec tsc --noEmit`)
- tests: pass (`pnpm test` — 143)
- deployment: local Docker Compose Postgres on **5433**; VPS not authorised

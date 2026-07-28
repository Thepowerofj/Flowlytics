# Project State

Last updated: 2026-07-28

# Current goal

Implement the Trusted Analytics Core plan: make Guided Ask the primary spreadsheet workflow, repair execution correctness, and upgrade analytics, forecasting, reports, exports, and Builder data quality.

Public repo: https://github.com/Thepowerofj/Flowlytics

# Current slice

Correctness and release gates for Trusted Analytics Core.

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
- **Ask reliability:** compact JSON/context handling, chat-embedded pipeline progress, auto-heal reruns, chart metadata normalization
- **Correctness gate slice:** retry-from-block hydrates previous successful upstream outputs or replays the graph, worker claims are concurrency-safe with stale-lock reclaim and per-worker heartbeats, Excel reload preserves selected sheet/range, URL ingest is HTTPS-only with private-network and size guards
- Tests: full Vitest suite passing (`npm test` — 45 files / 185 tests); typecheck clean (`npx tsc --noEmit`); production build passing (`npm run build`)

# In progress

- Trusted Analytics Core todo `correctness-gates`; audit canvas created at Cursor canvas `trusted-analytics-audit.canvas.tsx`

# Next

1. Add full CI/E2E harness and remaining realistic fixtures
2. Guided Ask upload/profile/clarify/run workflow upgrades
3. Grain-aware analytics and export routing
4. First-class forecast diagnostics, validation, intervals, scenarios, and trust UI
5. Decision-ready reports and Builder contract/provenance upgrades

# Decisions and assumptions

- PayFast is the primary payment gateway; manual EFT is fallback only
- Ask mode shares the canvas pipeline engine (not a separate agent)
- Forecast stays pure-TS for this phase, with an adapter boundary for a future statistical service
- URL ingest refreshes on every run (including schedules) and is restricted to safe HTTPS public targets
- Soft upload limit default is **20MB** (`MAX_UPLOAD_BYTES=20971520`)

# Known risks/blockers

- PayFast ITN needs a publicly reachable `AUTH_URL` notify endpoint
- Prisma generate can EPERM on Windows while Next holds the query engine DLL
- SMTP host must resolve for live outbound email

# Verification status

- types: pass (`pnpm exec tsc --noEmit`)
- tests: pass (`npm test` — 45 files / 185 tests)
- typecheck: pass (`npx tsc --noEmit`)
- build: pass (`npm run build`; existing non-blocking React hook dependency warnings remain)
- deployment: local Docker Compose Postgres on **5433**; VPS not authorised

# Project State

Last updated: 2026-07-28

# Current goal

Trusted Analytics Core implemented locally: Guided Ask is the primary spreadsheet workflow, execution correctness gates are repaired, and analytics, forecasting, reports, exports, and Builder diagnostics have been upgraded.

Public repo: https://github.com/Thepowerofj/Flowlytics

# Current slice

Post-implementation verification and polish for Trusted Analytics Core.

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
- **Guided Ask:** home primary CTA routes to `/ask`; drag/drop upload, Excel sheet/range reparse, PII acknowledgement, explicit AI opt-in, Go-ahead clarify flow, thread-switch polling cancellation, and resumable run polling
- **Analytics core:** dataset quality profiling, duplicate-period detection, transactional period aggregation before forecasts, table contracts, consistent primary measure/grain metadata, and safer CSV/table preview selection
- **Forecast trust:** month/quarter/week/fiscal labels, readiness diagnostics, eligible method comparison, MAE/RMSE/sMAPE/bias metrics, horizon-widening intervals, scenarios, and Ask Forecast Trust panel
- **Decision results:** richer Ask result metadata, forecast validation/caveat presentation slides, full-data CSV selection from analytical tables, and Builder output contract summaries
- Tests: full Vitest suite passing (`npm test` — 46 files / 190 tests); typecheck clean (`npx tsc --noEmit`); production build passing (`npm run build`)

# In progress

- Trusted Analytics Core implementation complete; final full-suite/typecheck/build checkpoint passing

# Next

1. Run final full test/typecheck/build after this slice
2. Add full Playwright golden paths for browser-level acceptance
3. Production VPS deploy only with explicit approval

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
- tests: pass (`npm test` — 46 files / 190 tests)
- typecheck: pass (`npx tsc --noEmit`)
- build: pass (`npm run build`; existing non-blocking React hook dependency warnings remain)
- deployment: local Docker Compose Postgres on **5433**; VPS not authorised

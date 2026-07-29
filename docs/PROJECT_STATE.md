# Project State

Last updated: 2026-07-29

# Current goal

Improve group forecasting, incomplete-period handling, PDF exports, Ask clarify relevance, and UI type consistency.

# Current slice

Group × period forecasts, partial-month exclusion, richer PDF charts, data-grounded Ask questions, and accessible type scale.

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
- **Builder crash harden:** `tablePreview` requires array columns/rows; `InsightCard` / Stats / Aggregate / Structure / ActivityNode coerce compacted insights/metrics/rows; forecast canvas preview skips full method leaderboard (`compareMethods: []`); run path still auto-compares when compare list omitted
- **Builder crash harden (paint path):** `previewOutputTable`/`sampleTable` reject non-array tables; `autoMapOnConnect` coerces metrics/groupBy/selectedColumns/dropColumns; FlowEditor catches bind failures; ActivityNode + config window error boundaries isolate bad activities
- **Auto-pipeline finalize:** materialize always rebinds chart/forecast/aggregate/export columns from post-clean/post-aggregate tables; `repairAutoPipelineGraph` fixes remaining checkFlow errors (AI opt-in, wiring, dead forecast) before save/view; `buildValidatedAutoPipeline` replans with heal hints while static errors remain; Ask/home/Builder builds all use the validated path; PII is never auto-acked at build time
- **Excel missed-opportunities fix:** Clean/Map casts Excel serial `tx_month` as dates; graph seeds stratify across periods (not first-40-only); forecast measure ranking prefers `total_*` over channel slices; Aggregate/Stats/Chart/CleanMap config + FlowEditor merge paths hardened; editor-level error boundary

# In progress

- Manual smoke: Ask → Go ahead on Missed Opportunities Excel → Open Builder → open Aggregate/Forecast/Stats

# Next

1. Manual smoke: build from spreadsheet + open activities after run with compacted meta
2. Keep Guided Ask as the primary path; treat Builder as advanced
3. Ops: production deploy only with explicit approval

# Blockers / risks

- Legacy flows may still hold compacted string insights in node config until re-run; UI now degrades safely instead of crashing
- Forecast method comparison remains CPU-heavy on large histories during full Run (by design for trust)

# Key decisions

- Guided Ask is the default product path; Advanced Builder remains for power users
- AI uses BYOK only (no wallet gate for AI)
- Builder must tolerate corrupt/compacted run meta without a white-screen crash
- Graph seeds for file-backed Ask builds must preserve period diversity when forecasting

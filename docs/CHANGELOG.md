# Changelog

## Unreleased

### Fixed

- Forecast / chart cards: line plot padding so series and labels stay inside the node; compact axis labels keep currency after Aggregate (e.g. R12.5k instead of bare `12.5k`).
- **AI Structure:** prefers wired upstream input; when the column builder is empty, AI invents columns and auto-fills the builder with typed suggestions after Run; use the builder (or templates) to lock the structure instead.

### Added

- **vNext:** forecast playground (period order, method compare, ensemble), `/ask` chat mode, PDF/PPTX export, `ingest.url` + `output.email` connectors, **PayFast** checkout + ITN auto-activate (EFT fallback). Accuracy fixtures in `fixtures/analytics/`.
- **AI Structure output schema:** configure columns (templates: Sales / Contacts / Expenses, or from upstream); schema previews to Clean/Map/Chart/Stats before Run; JSON-mode LLM + normalized types; quick recipes “→ AI structure” / “→ AI insights”; `scripts/verify-llm.ts` smoke test for BYOK.
- **EFT billing + 30-day access:** `/billing` shows bank details; users declare payment; admin **Activate Nd** on `/admin`; worker `expireDueAccounts` clears paid access when the window ends (login still allowed to renew). See `docs/USER_STORIES.md`.
- **Bring-your-own LLM key** in `/settings` (encrypted); AI blocks no longer debit the wallet.
- **Dataset name** on Clean/Map, Aggregate, and AI activities — shown in the downstream Data source picker and on the canvas card so multiple transforms/aggregates are easy to tell apart.
- Home **Run** on each flow (last saved graph); last-run status chip; soft progress on the list. Runs always execute on the worker — leaving the canvas or home does not cancel them; reopening the canvas resumes live progress and History shows results.
- Quiet amber sample-dot on activities (hover tooltip) plus short config note when showing a preview snippet; full dataset still requires Run. Aggregate/Clean/Map keep configuring against upstream input after Run (output stored separately).
- Clean/Map currency picker (ZAR/USD/EUR/GBP/JPY) and thousand-separator formatting; display formats cascade to charts, stats, structure preview, and aggregate metrics.
- Ancestor **Data source** picker on Chart/Stats/Forecast/Structure/AI (rewires the single In-edge).
- Forecast toolkit: trend, recent average, last value, seasonal cycle, smooth trend, growth rate; history+forecast canvas viz; confidence band columns; recipes; CSV via Results/`byBlockId`.
- Aggregate: count distinct, % of total, read-only result preview.
- Stats: median, stddev, quartiles, null%; richer highlights.
- AI Analyse + AI Chart Suggest; deeper structure/explain; canvas shows latest AI text.
- Run history in the flow editor right rail: past runs with status, duration, runtime/step errors; select a run to load its Results; retry from failed step.
- Live run progress on the canvas (active/done/pending/failed nodes + edge highlight) and a bottom Run log dock while the pipeline executes.
- Schedule management: list/pause/resume/remove per flow; `/schedules` month calendar of upcoming pipeline runs across flows; calendar page can create Daily/Weekly/Custom schedules by picking an existing pipeline.
- Delete flows from the home flows list (API + confirm); cascades runs and schedules.
- After a full pipeline Run, canvas activities (Stats, Chart, Structure, etc.) update from each step’s full-dataset output instead of staying on the preview sample.
- Ingest upload: clear size/type/parse error messages; Excel sheet picker and optional A1 data range.
- Aggregate activity: group-by + sum/avg/count/min/max; charts and other steps consume the aggregated table when wired from Aggregate.
- Historic runs restore the pipeline snapshot from enqueue time (read-only) with an explicit banner and Back to live; execution uses the same snapshot so later edits cannot rewrite a past run.
- Structure output always shows a visual CSV preview (example layout or live sample rows in export column order).
- Flowlytics v1 application: visual flow canvas, queued worker execution, CSV/Excel ingest, clean/map, stats/chart, structured CSV export, projection, opt-in AI blocks with PAYG wallet.
- Auth: email signup/login and optional Google OAuth; admin allowlist.
- Admin: paid/EFT management, wallet credits, ops monitoring and per-user usage.
- Docker Compose (Postgres + web + worker), Prisma schema/migration, design tokens, product control-plane docs.
- Brand mark/favicon and landing `PipelinePreview` (Ingest → Clean → Chart).
- Canvas UX: palette icons + quick-add recipes, labeled In/Out handles, arrow edges, right-rail checks, × / Del delete, Daily/Weekly/Custom schedules.
- Clean/Map master–detail config; stats information block; interactive resizable chart showcase.
- Structure output column/filename controls; CSV download from Structure, config, or Results (`resultJson` + on-device CSV).

### Fixed

- Chart hover/click no longer jumps layout: reserved tooltip footprint, persistent value/x labels, highlight via opacity/ring (not remounted geometry).
- Downstream canvas activities now receive Clean/Map output (renamed/typed columns); editor previews sample rows only — full dataset on Run.

### Changed

- Commercial model: product access via EFT + admin activation; AI uses BYOK; wallet kept for future PAYG only.
- Preview pipeline: `previewOutputTable` + `propagatePreviewFrom` cascade sampled/cleaned tables along edges when ingest uploads or Clean/Map config changes.
- Control-plane honesty pass: module `index.ts` exports for analyse/ingest/identity; jobs export `runGraph`; run `resultJson.byBlockId`; docs/README/rules/test evidence aligned with current Vitest suite.

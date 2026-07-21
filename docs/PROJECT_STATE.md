# Project State

Last updated: 2026-07-21

# Current goal

Ship a stable local v1 of Flowlytics with honest vertical-slice docs; production deploy deferred.

# Current slice

Auto-pipeline selling point: drop CSV/Excel or paste notes → heuristic planner builds a full wired analysis flow (Clean → Stats/Chart → Forecast or Aggregate → AI Analyse → Export). Plus prior analytics usability (forecast bands, AI insight showcases).

# Completed

- Control-plane docs (`BUILD_SPEC.md` playbook + `docs/PRODUCT_SPEC.md` product contract, `AGENTS.md`, architecture/design/ops/testing)
- Scaffold: Next.js 15 + Prisma + Tailwind tokens + Docker Compose (Postgres on host port **5433**)
- Auth: email/password signup + login; Google provider when env configured; admin via `ADMIN_EMAILS`; SMTP transactional mail (`info@flowlytics.co.za`) for welcome, reset, EFT/access, run failures
- Admin commercial: paid toggle, EFT notes, wallet credit; payment gateway stub (`manual_eft`); short unique payment refs (`FL-XXXXXX`) + admin lookup
- Canvas: activity nodes, labeled In/Out handles, arrow edges, palette icons + quick-add (incl. Forecast + AI recipes), right-rail checks, save/load; home flow list with Run + delete + last-run status
- Background runs: worker queue continues if you leave home/canvas; canvas resumes live progress for in-flight runs; History for results
- Ingest: CSV/Excel ≤10MB with explicit upload error reasons; Excel sheet + A1 range; PII heuristic warning + disclaimer; output-only ports
- Clean/Map: auto-map; currency + thousand separators; `_columnFormats` cascade; formatted sample in inspector; quiet ≈ sample marker
- Aggregate: group-by + sum/avg/count/count distinct/min/max/% of total; input-safe pickers + read-only result preview; `_runOutputTable` after Run
- Source picker: choose any ancestor table on Chart/Stats/Forecast/Structure/AI (rewires In-edge)
- Forecast toolkit: trend / moving average / naive / seasonal / smooth / growth; history+forecast viz; **shaded confidence band**; last/next **KPI strip**; outlook narrative; CSV from config
- Stats: median, stddev, quartiles, null%; **business key findings** (`insights.ts`) + suggested next steps
- Charts: time-series suggestion when dates exist; findings under plot; truncation notice
- AI: structure / explain / analyse / chart-suggest; Analyse uses deterministic pre-findings; **insight cards** on canvas; Results lists **per-step** charts + findings
- **Auto pipeline (CAP-02b):** Compact home strip + modal (goal before build); Clean/Map seeded via `suggestCleanMapConfig` (date/currency/number/boolean casts); layout via `alignFlowGraph` (also canvas **Auto align**); `planAutoPipeline` / `POST /api/flows/auto-pipeline`; timeseries / categorical / unstructured archetypes; ✦ Auto analysis quick recipe
- Notify/nodemailer kept off the client: `executeRun` not in jobs barrel; canvas imports `isFlowGraph` from domain; `serverExternalPackages: ["nodemailer"]`
- Runner: DB job queue, fair priority, ETA, worker DAG, fail/retry; live canvas progress + run log; schedules + calendar; historic `graphSnapshotJson`
- Export: `resultJson` + `byBlockId`; per-step Results download; Structure/Forecast CSV
- Module public APIs: `src/modules/{ai,analyse,billing,blocks,flows,identity,ingest,jobs,notify,ops}/index.ts`
- Notify: Flowlytics-branded HTML mail (welcome, password reset/changed, EFT declared, access activated/expired, run failed; optional run success via `MAIL_NOTIFY_RUN_SUCCESS`)
- Tests: Vitest domain/unit suite (`pnpm test`); `pnpm exec tsc --noEmit` clean

# In progress

- None blocking local use

# Next

1. Live payment gateway provider (requires approval)
2. Production VPS deploy (requires approval)
3. Google OAuth client credentials in `.env`
3b. Set `AUTH_URL` to the public site URL in production so email links resolve correctly; rotate mailbox password if it was shared outside `.env`
4. Optional: Playwright happy-path E2E (deferred)
5. Optional: histogram viz on Stats; PNG chart export; LLM-refined auto-pipeline plans (beyond heuristics); PNG share of insight showcase

# Decisions and assumptions

- See `docs/architecture/` ADRs and `docs/PRODUCT_SPEC.md` for product contracts
- Charts: always-mounted tooltip slot + persistent axis/value labels; hover uses opacity/highlight only (no layout jump)
- Forecast uses pure-TS methods (no ARIMA/Prophet) — SMB-common toolkit only
- Source picker keeps one In-edge (rewired) so the worker stays edge-driven
- AI Structure schema is the canvas contract for downstream before Run; full rows arrive after Run
- Mobile “list of steps” canvas mode is deferred — desktop/tablet primary for v1 wiring
- Test strategy target includes Testing Library + Playwright; current gate is Vitest domain/unit tests

# Known risks/blockers

- None for local development
- Production VPS / live payments not authorised
- Some OpenAI-compatible providers ignore `response_format: json_object` — parser still strips fences
- SMTP host `mail.flowlytics.co.za` must resolve in DNS before live mail delivery (app logs outbound mail when SMTP is unreachable / unset)

# Verification status

- lint: not gated in CI for this slice
- types: pass (`pnpm exec tsc --noEmit`)
- tests: pass (`pnpm test`)
- LLM BYOK: `pnpm exec tsx scripts/verify-llm.ts` (requires user key in Settings)
- build: previously succeeding (`pnpm build`); re-run before release
- deployment: local Docker Compose only; VPS not authorised

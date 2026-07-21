# Flowlytics — Product Specification

Status: Approved for BUILD  
Version: 1.0  
Date: 2026-07-20

## 1. Vision

Flowlytics helps small-business owners turn spreadsheets into insights by composing drag-and-drop activity blocks on a visual canvas, running them on a capacity-aware backend queue. Product access is granted after manual EFT and admin activation (fixed-day window). Optional AI steps use the user’s own LLM API key (BYOK); a wallet ledger remains for a future PAYG option.

## 2. Problem and outcome

**Problem:** Non-technical SMB owners struggle to clean, analyse, and explain sales/ops spreadsheet data without hiring analysts or learning notebooks.

**Outcome:** A novice can upload CSV/Excel, connect a short flow, run it (now or on a schedule), see stats/charts, structure output, optionally use AI, and download CSV—without code.

## 3. Users and buyer

| Role | Description |
| --- | --- |
| End user | SMB owner; solo private workspace |
| Operator admin | Product owner; activates access after EFT, disables accounts, monitors ops; optional wallet credits (legacy) |

Buyer for v1: the operator (self-hosted / manually monetised).

## 4. Tenant / access model

- Solo accounts; all flows/files owned by `userId`.
- No sharing in v1.
- Public self-signup + Google OAuth.
- Admin role via allowlist / `role=admin`.
- Schema later-ready for orgs (no org table required in v1).

## 5. Primary journeys

1. Sign up (email or Google) → **Billing** (EFT instructions) → declare payment → wait for admin → Home → create flow.
2. Add ingest → open configure window → upload CSV/Excel (sheet + optional A1 range for Excel; clear errors if too large/invalid) → wire to Clean/Map (and optionally Aggregate) → Stats/Chart → Structure → **Run** → view full-dataset results → download CSV.
3. Schedule from the flow toolbar or `/schedules` (pick any existing pipeline; daily/weekly/custom) → see queued/running status on canvas + calendar.
4. Open Run history → inspect a historic snapshot (read-only) → Back to live.
5. Settings → add LLM API key → Use AI block (opt-in) → structured/explained output (no wallet debit).
6. Admin: activate 30-day access after EFT, disable users, monitor capacity/usage; worker auto-expires access.

## 6. Capabilities (requirements)

| ID | Capability | Acceptance example |
| --- | --- | --- |
| CAP-01 | Email + Google auth | User signs in with email/password or Google; branded transactional email for welcome, password reset, EFT/access, and pipeline failures |
| CAP-01b | Password reset | Forgot-password email with 1-hour link; password-changed confirmation |
| CAP-02 | Private flows | User A cannot read User B flow or files; owner can delete a flow from home (cascades runs & schedules) |
| CAP-02b | Auto pipeline from data | Compact home CTA / empty-canvas action opens a modal: user sets analysis goal, confirms file or notes, then builds (no auto-build on file pick). Creates a wired analysis flow (Clean → Stats → Chart → Forecast when time-like / Aggregate when categorical → AI Analyse → Export); Clean/Map is seeded with inferred casts (date/currency/number/boolean); layout uses shared Auto align spacing; goal steers path; AI blocks opt-in for Run. Saved flows remain the home primary focus. |
| CAP-03b | Auto align | Canvas toolbar Auto align spaces activities left-to-right by DAG rank without overlap; auto-pipeline and quick recipes reuse the same layout |
| CAP-03 | Canvas graph | Compact activity nodes; connect via handles; save/load |
| CAP-04 | Ingest configure window | Open ingest to upload/drop CSV/Excel; preview table; no input handle on ingest |
| CAP-05 | CSV/Excel ingest | File ≤10MB parses into tabular preview; clear errors for size/type/parse failures; Excel sheet (page) + optional A1 range selection |
| CAP-06 | Clean/map in config window | Off-canvas UI; auto-map on connect; rename/drop; per-column clean (trim, case, fill nulls, drop-if-empty), type convert (auto/string/number/currency/boolean/date), formatting (currency code picker, decimals, thousand separators, strip currency, date format); display formats (`_columnFormats`) cascade to Chart/Stats/Structure/Aggregate; every downstream activity is bound to Clean/Map output only — dropped columns cannot be selected later |
| CAP-06b | Aggregate | Group by one or more columns; sum/avg/count/count distinct/min/max/% of total; read-only result preview (pickers always use upstream input); aggregated table offered to wired downstream; metric formats inherit currency/number styling |
| CAP-06c | Upstream source picker | Chart/Stats/Forecast/Structure/AI can pick any ancestor table; Clean/Map, Aggregate, and AI steps can set a **dataset name** shown in the picker and on the canvas; changing source rewires the single In-edge |
| CAP-07 | PII warning + disclaimer | Heuristic hits show warning + proceed; disclaimer visible |
| CAP-08 | Stats + chart | Stats info block (mean/median/stddev/quartiles/null% + **business key findings**); chart bar/line/pie with suggestions (time-series preferred when a date exists); resizable showcase; stable tooltips; chart/insight truncation notices; currency/number formats carry through; quiet ≈ sample marker (tooltip) on preview; after Run, full-dataset outputs applied; can chart Aggregate or Forecast tables |
| CAP-09 | Structure output | User chooses columns/order + filename; always shows a visual CSV preview (example layout until data is wired, then live sample rows); explained save path (flow config + run `resultJson`) |
| CAP-10 | CSV download | Download from Structure, Forecast config, or Results; Results can pick any step table via `resultJson.byBlockId` |
| CAP-11 | Manual run + queue | Run from canvas or home (last saved graph); worker executes in the background if you leave; home shows last-run status; canvas resumes live progress for in-flight runs; queue position/ETA when busy; run log + right-rail history; historic snapshot replay (read-only) with Back to live |
| CAP-12 | Fail-stop retry | Failed block shown; retry from that block |
| CAP-13 | Schedule | Daily / weekly / custom interval schedules create runs; pause/remove schedules; calendar view of upcoming pipeline runs; calendar page can schedule any existing pipeline (picker + frequency) |
| CAP-14 | AI structure (opt-in) | Takes wired upstream table and/or pasted notes → table; empty column builder lets AI invent then auto-fills the builder with typed suggestions; builder/templates lock the schema for the next Run; schema usable downstream before Run; BYOK in Settings |
| CAP-15 | AI explain (opt-in) | Structured explanation report (headline, findings, next steps); **expanded styled showcase** on canvas after Run; Out table is structured findings for downstream; BYOK |
| CAP-15b | AI analyse + chart suggest (opt-in) | Structured JSON insight report + findings table (`section/kind/title/detail/metric`); expanded showcase like Chart nodes; deterministic pre-findings seed the model; chart-suggest for axes; BYOK; `LLM_DEV_STUB`; Results shows **per-step** styled reports |
| CAP-16 | Forecast toolkit | Trend, recent average, last value, seasonal cycle, smooth trend, growth rate; history+forecast canvas viz with **KPI strip** (last / next / % change); optional **shaded confidence band** on chart; plain-language outlook; downloadable series from Forecast config or Results |
| CAP-17 | Access + wallet | EFT + admin activation for N days; each user gets a short unique payment ref (`FL-XXXXXX`, no ambiguous chars); worker expires access; wallet ledger kept (not required for AI) |
| CAP-18 | Admin commercial | Activate/disable users after EFT; **lookup by payment reference**; see declarations; optional wallet credit; gateway stub |
| CAP-19 | Ops monitoring | Queue depth, active runs, worker status, per-user usage |
| CAP-20 | Extensible blocks | New block registers via block registry port |

## 7. Scope

**Must have:** CAP-01–CAP-20 as above.  
**Must not:** Full BI suite, general agent platform, Jupyter replacement, live card gateway (stub only), multi-user sharing.  
**Deferred:** Multi-tenant orgs, Redis/BullMQ, multi-worker horizontal scale-out, PDF report, live payment provider.  
**Future-compatible:** Block registry, wallet/gateway ports, `userId` ownership, separate worker process.

## 8. Data and integrations

- PostgreSQL: users, flows, runs, jobs, wallet ledger, usage.
- File volume for uploads/artifacts.
- LLM provider behind adapter; **per-user encrypted API key** (server `LLM_*` optional fallback/stub).
- Google OAuth.

## 9. Security / privacy

- TLS in transit (Caddy on VPS); DB credentials via env.
- Disclaimer: operator not responsible for personal data users choose to upload.
- Best-effort PII heuristics (email, phone, SA ID-like); warn + proceed; not a guarantee.
- LLM only on opt-in AI blocks with user BYOK (encrypted at rest with `AUTH_SECRET`).

## 10. Commercial

- Manual EFT: bank details from env; user declares payment; admin activates for `ACCESS_PERIOD_DAYS` (default 30).
- Worker job expires access when `accessExpiresAt` passes (login still allowed for renewal).
- Wallet ledger retained for future PAYG; not used to gate AI in v1.
- `PaymentGateway` port stubbed for future integration.
- Detailed journeys: `docs/USER_STORIES.md`.

## 11. Non-functionals

- Scale envelope: ~1–20 users, ≤10MB files, low concurrency; configurable limits.
- Fair scheduling with queue position/ETA.
- Daily DB backup + restore runbook; short downtime acceptable.
- Accessibility: keyboard focus, contrast, meaningful labels on canvas controls.
- Visual: calm/clear; Notion + n8n; light UI; teal/ink accent; no purple-glow AI cliché.

## 12. Technology constraints

Next.js, TypeScript, Tailwind, Prisma, PostgreSQL, Zod, Docker Compose on single VPS; separate worker process.

## 13. Success measures

- Novice completes CSV→chart→download without help docs in one session.
- Concurrent runs queue fairly without crashing the VPS.
- AI usage cannot proceed without the user’s API key (unless `LLM_DEV_STUB`).
- Unpaid/expired users cannot run flows until re-activated.
- Admin can see capacity and per-user usage without opening user file contents.

## 14. Open decisions (post-v1)

- Live payment gateway provider
- Production VPS provider/hostname
- Exact LLM vendor/model SKU

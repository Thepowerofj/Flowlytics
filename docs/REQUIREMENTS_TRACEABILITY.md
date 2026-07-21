# Requirements Traceability

| Requirement | Acceptance criteria | Implementation | Tests | Status |
| --- | --- | --- | --- | --- |
| CAP-01 | Email + Google auth; private home | `src/modules/identity`, auth routes, NextAuth | auth unit + e2e login (manual smoke) | verified (local) |
| CAP-02 | User A cannot read User B flows/files; owner can delete from home | `getFlowForUser` / `assertFlowOwned` / `deleteFlow`, `FlowList`, `DELETE /api/flows/[id]` | `flowOwnership.test.ts` | verified (local) |
| CAP-03 | Compact nodes; connect via handles; save/load | `src/components/flow/*`, flows module | `ports.test.ts`, flow save/load paths | verified (local) |
| CAP-04 | Ingest configure window; upload; no input handle | `ActivityConfigWindow`, upload API, `ports` | `ports.test.ts` | verified (local) |
| CAP-05 | CSV/Excel ≤10MB → preview; upload errors; Excel sheet + range | `src/modules/ingest`, `/api/upload`, ingest UI in `ActivityConfigWindow` | `parseTable.test.ts` | verified (local) |
| CAP-06 | Clean/map off-canvas; auto-map; clean/type/format (currency + grouping); formats cascade via `_columnFormats` | `CleanMapConfig`, `autoMap`, `previewPipeline`, `columnTransform`, `columnFormat` | `autoMap.test.ts`, `columnTransform.test.ts`, `columnFormat.test.ts` | verified (local) |
| CAP-06b | Aggregate group-by + metrics (incl. distinct / % of total); input-safe pickers; formats inherit | `aggregate.ts`, `AggregateConfig.tsx`, `formatsForAggregate`, `applyRunOutputs` | `aggregate.test.ts`, `applyRunOutputs.test.ts`, `autoMap.test.ts` | verified (local) |
| CAP-06c | Ancestor source picker + dataset names on Clean/Aggregate/AI | `upstreamSources.ts`, `SourceDataPicker.tsx`, `DatasetNameField.tsx`, `FlowEditor` | `upstreamSources.test.ts` | verified (local) |
| CAP-07 | PII heuristic warning + disclaimer | PII heuristics + disclaimer UI | `pii.test.ts` | verified (local) |
| CAP-08 | Stats + chart on canvas; quiet sample marker; formats; full data on Run | `src/modules/analyse`, `MiniChart`, `StatsInfoBlock`, `previewPipeline`, `applyRunOutputs` | `stats.test.ts`, `charts.test.ts`, `autoMap.test.ts`, `applyRunOutputs.test.ts` | verified (local) |
| CAP-09 | Structure: columns/order/filename; always-on CSV visual preview; save path explained | `StructureOutputPanel`, run `resultJson` / `byBlockId` | `structurePreview.test.ts` | verified (local) |
| CAP-10 | CSV download from Structure/Forecast/Results step picker | `downloadCsv.ts`, `/api/export/csv`, Results `byBlockId` | export path exercised in UI | verified (local) |
| CAP-11 | Manual run from canvas or home; background worker; resume poll on reopen; history + historic snapshot | `enqueueFlowRun`, worker, `FlowList` Run, `FlowEditor` `startRunPolling`, `RunHistory` | `queue.test.ts`, `runTiming.test.ts`, `runProgress.test.ts`, `runGraph.test.ts` | verified (local) |
| CAP-12 | Fail-stop; retry from block | runner DAG + retry API | `dag.test.ts` | verified (local) |
| CAP-13 | Daily / weekly / custom schedules; manage/pause/delete; calendar; schedule from calendar via flow picker | `scheduleTiming.ts`, `scheduleService`, `/api/schedules`, `ScheduleCreateForm`, `/schedules` UI | `scheduleTiming.test.ts` | verified (local) |
| CAP-14 | AI structure opt-in + BYOK; upstream input; builder lock or auto-suggest schema after Run | `aiStructure`, `structuredOutput`, `AiConfigPanel`, `applyRunOutputs` | `structuredOutput.test.ts`, `aiStructure.test.ts`, `applyRunOutputs.test.ts`, `autoMap.test.ts` | verified (local) |
| CAP-15 | AI explain opt-in + BYOK; canvas text | `aiExplain` | AI key gate + stub | verified (local) |
| CAP-15b | AI analyse + chart suggest + BYOK; chart axes auto-apply | `aiAnalyse`, `aiChart`, autoMap | stub LLM + autoMap AI chart test | verified (local) |
| CAP-16 | Forecast toolkit + canvas viz + CSV | `forecast.ts`, `projection` block, `MiniChart` forecastSplit | `forecast.test.ts` | verified (local) |
| CAP-17 | EFT access window + wallet retained | `accountAccess`, `/billing`, worker expiry; `billing` wallet | `access.test.ts`, `secretBox.test.ts`, `wallet.test.ts` | verified (local) |
| CAP-18 | Admin activate/disable after EFT; optional wallet | `AdminPanel`, `adminUsers`, `/api/admin/users` | activate/revoke paths | verified (local) |
| CAP-19 | Ops: queue, workers, per-user usage | `src/modules/ops` | metrics endpoint | verified (local) |
| CAP-20 | Extensible blocks via registry | `src/modules/blocks` | registry registration | verified (local) |

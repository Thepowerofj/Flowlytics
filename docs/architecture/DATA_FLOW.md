# Data Flow

## Manual / scheduled run

1. User clicks Run (or schedule fires).
2. App creates `FlowRun` + `Job` rows; freezes `graphSnapshotJson` from the live flow graph at enqueue; computes queue position.
3. Worker claims next fair job.
4. Worker executes against the run’s snapshot (not a later-edited live graph).
5. For each block in topological order: load inputs → execute block → persist step `outputJson` → merge into `resultJson` (last-wins keys + `byBlockId` map).
6. On failure: mark step failed; stop; allow retry from failed block id. Canvas may still show full outputs for steps that succeeded.
7. On success: mark run completed; client applies per-step tables to activities (`applyRunOutputs`); usage counters update.
8. Historic inspection: loading a past run restores that snapshot on the canvas (read-only) with Back to live.

## AI block

1. Block config has `aiOptIn=true` (“Use AI on Run”).
2. Worker loads the owner’s encrypted BYOK key (`Settings`); fails clearly if missing (unless `LLM_DEV_STUB`).
3. Call LLM adapter (JSON mode for Structure / Chart Suggest).
4. **AI Structure:** optional `outputColumns` schema is sent to the model and normalized into `TabularData`; canvas preview uses that schema before Run so Clean/Map/Chart/Stats/Structure can wire immediately; full rows land in `config.table` + `_runOutputTable` after Run.
5. **AI Chart Suggest:** `suggestedChart` is applied automatically when a Chart activity is connected.
6. Store step `outputJson` / `resultJson.byBlockId` like any other block. Wallet is not required for AI in v1.

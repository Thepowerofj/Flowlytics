# Design Brief — Flowlytics

## Brand

- **Adjectives:** calm, clear, capable  
- **Anti-adjectives:** neon-AI, dashboard-cluttered, intimidating  
- **Audience:** SMB owners on laptop/desktop first; usable tablet  
- **Mark:** teal rounded square with three nodes on a rising data path + insight spark (`BrandLogo` / `app/icon.svg`)  
- **Landing:** brand-first hero + looping animated pipeline teaser (`PipelinePreview`) to show Ingest → Clean → Chart before signup  

## Art direction

Light, airy product UI inspired by modern node editors such as [React Flow](https://reactflow.dev/) — spacious canvas, crisp custom nodes, obvious handles, and quiet chrome — while remaining distinctly Flowlytics (teal accent, Fraunces brand, soft graph-paper atmosphere).

Notion-like clarity for navigation; n8n/Make-like workspace for the flow. Avoid purple gradients, dark-mode-first defaults, and dense admin chrome on the primary journey.

## Canvas interaction model

1. **Canvas stays readable** — activity cards use the **same fully rounded shape** (no square header corners); compact summaries by default; icons match the left palette.  
2. **Configuration windows** — upload, Clean/Map (currency + thousand separators + formatted sample), Aggregate (group-by/metrics + read-only result preview), Forecast methods, chart/stats, AI opt-in. **Data source** picker chooses any ancestor table (rewires In-edge). Canvas previews use a small row sample marked by a quiet amber ≈/dot (tooltip: Run for full data); **Run** processes the full dataset. Formatting carries through charts, stats, forecast, and structure. Aggregate/Clean/Map always configure against upstream *input*, never their own run output.  
3. **Labeled React Flow handles** — stock connect behaviour with visible **In** / **Out** labels; arrow markers on edges; ingest has **output only** (no input). See `REACT_FLOW_NOTES.md`.  
4. **Palette affordances** — icons per activity; data-direction strip; quick-add recipes that drop a wired chain (incl. ✦ Auto analysis).  
4b. **Auto pipeline** — Compact home strip (saved flows stay primary) + modal: set goal, confirm file/notes, then build. Empty canvas uses the same confirm step. Banner explains the chosen path after materialise. Clean/Map gets inferred column casts; activities are auto-aligned (shared with canvas **Auto align**).  
5. **Right rail** — live checks, then **Run history** (status, duration, runtime errors; click to load historic snapshot), then Results for the selected run as a **mini report**: every step’s charts and written findings (not only the last step).  
6. **Delete** — × on activity cards and Del/Backspace for selected nodes/edges (not in the top toolbar); **Delete** on home flow list removes a pipeline (cascades runs/schedules). Toolbar actions: Run, Daily, Weekly, Custom, Manage schedules. Global **Schedules** page with month calendar + **Schedule a pipeline** (pick existing flow + frequency).  
7. **Historic view** — Opening a past run restores that run’s frozen pipeline (`graphSnapshotJson`) read-only, with an explicit banner and **Back to live**.  
8. **Charts / Forecast on the canvas** — Chart showcase (bar/line/pie) with short findings under the plot; Forecast history+forecast line (dashed future) with shaded likely-range band, last/next KPI strip, and outlook copy. Resizable when selected; stable tooltips; Clean/Map formatting on axes. After **Run**, full-dataset step outputs apply.  
9. **Stats + AI insights on the canvas** — Stats information block with business key findings and field snapshot; AI Analyse/Explain expand into a **styled insight showcase** (headline, kind-tagged finding cards, next steps) like Chart nodes — not plain text. Resizable when selected; Out table is structured for the next activity.  
10. **Structure output** — Always shows a spreadsheet-style CSV preview (example layout until data is wired, then live sample rows in export column order, with column formatting). Column picker + filename; **Download CSV** on the activity and in Results. Shaped table is stored on the flow run (`resultJson`); the CSV file itself is generated in-browser on download (not emailed).  
11. **Ingest upload** — Clear size/type/parse error banner; Excel sheet (page) picker + optional A1 range.  

## Typography

- Display: "Fraunces" for brand moments  
- UI: "Source Sans 3" for body/UI  
- Fallbacks: Georgia, system-ui  

## Signature interaction

Add ingest → open window → upload spreadsheet (Excel: choose sheet/range) → drag from the **right** handle to Clean/Map (optional Aggregate) → mapping window opens with columns prefilled.

## Motion

Subtle and purposeful:

1. Node settle-in when added  
2. Edge connect feedback  
3. Run progress on canvas — active node pulse + badge, completed/pending styling, animated edge into the current step; bottom **Run log** dock while the pipeline executes  

## Primary journey hierarchy

1. **Brand / canvas** as the hero surface  
2. Activities palette as a quiet tool rail  
3. Results as a secondary inspector  
4. Config windows as focused overlays for data work  
5. Wallet balance always visible but quiet  

## UX quality bar

Match the clarity of [reactflow.dev](https://reactflow.dev/): interactivity feels obvious; heavy data UI lives off-canvas; empty states teach the next click.

## Patterns to avoid

Purple-on-white AI cliché; warm-cream + terracotta default; broadsheet dense columns; packing full mapping grids onto nodes; input handles on source-only ingest blocks.

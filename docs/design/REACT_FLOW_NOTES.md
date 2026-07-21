# React Flow reference notes

Sources inspected:

- [Feature Overview](https://reactflow.dev/examples/overview)
- [Easy Connect](https://reactflow.dev/examples/nodes/easy-connect)
- [Labeled Handle](https://reactflow.dev/ui/components/labeled-handle)
- Core: `useNodesState` / `useEdgesState` / `addEdge` / `MiniMap` / `Controls` / `Background`

## Feature Overview — what to steal

The [overview example](https://reactflow.dev/examples/overview) is a showcase of **connection language + peripheral chrome**, not of packing forms into nodes.

| Overview feature | Meaning for Flowlytics |
| --- | --- |
| Custom `nodeTypes` + `edgeTypes` | Activity cards + optional custom edges later; v1 uses typed nodes + default smoothstep edges |
| `useNodesState` / `useEdgesState` | Controlled graph state (we wrap with flow persistence) |
| `onConnect` + `addEdge` | Standard wiring; we add auto-map + arrow markers |
| `MiniMap` (`zoomable` / `pannable`, `nodeClassName`) | Keep; tint by activity role for glanceable orientation |
| `Controls` | Zoom / fit — keep quiet |
| `Background` | Dot grid = “workspace” atmosphere |
| `fitView` | Cap max zoom so cards stay compact (~0.65–0.7) |
| `colorMode` | Prefer light tokens; don’t chase demo dark mode |
| `NodeToolbar` / `NodeResizer` | Optional later — too busy for SMB novices in v1 |
| Sub flows / annotation nodes | Deferred; one flat DAG is enough |
| Button edges | Nice for delete-on-edge later; not required for v1 |

## Hooks & APIs that make the process easier to visualise

| Hook / util | Use |
| --- | --- |
| `useNodesState` / `useEdgesState` | Local editable graph |
| `useReactFlow` | `fitView`, `screenToFlowPosition` (palette drop), programmatic focus |
| `addEdge` + `MarkerType.ArrowClosed` | Directional “data flows this way” |
| `applyNodeChanges` / `applyEdgeChanges` | Persist drag/select without reinventing |
| Handle `id` + node `sourceHandle` / `targetHandle` | Typed ports (`table`) — prevents wrong wiring |
| Labeled handles | Novice-readable **In** / **Out** next to hit targets |

## Connection visuals (our bar)

1. **Handles are the affordance** — larger hit target (12px), teal **Out**, slate **In**.  
2. **Labels beside handles** — pattern from [Labeled Handle](https://reactflow.dev/ui/components/labeled-handle); text is `pointer-events: none`, handle stays clickable.  
3. **Arrow markers on edges** — every new edge gets `MarkerType.ArrowClosed` so direction is obvious without reading labels.  
4. **Ingest = source only** — no left handle; users never try to feed a file node.  
5. **Easy Connect caution** — whole-node connect is powerful but confusing for novices; we keep explicit labeled handles ([Easy Connect](https://reactflow.dev/examples/nodes/easy-connect) is reference only).

## Flowlytics application

| Pattern | Our choice |
| --- | --- |
| Handles | `LabeledHandle` — **In** / **Out**; stock RF connect behaviour |
| Edges | `smoothstep` + closed arrow marker |
| Nodes | Fully rounded activity cards; heavy config in `ActivityConfigWindow` |
| Live previews | Chart/stats on the node from a small cleaned sample + sample badge; interactive hover without layout jump; currency/number formats from Clean/Map; full data only on Run |
| Resize | `NodeResizer` on chart/stats when selected (not every activity) |
| Background | Dotted grid |
| Controls / MiniMap | Enabled, quiet |
| Canvas zoom | Default ~0.65; fitView max ~0.7 |

## Do not copy blindly

- Dark-mode-first / purple accent themes from demos — stay on Flowlytics teal tokens.  
- Dense multi-handle database schemas for v1 — one `table` port is enough.  
- Resizer on every node type — only chart/stats showcases; keep other activities calm.  
- Putting full mapping / cleaning grids on the canvas — belongs in the config window.

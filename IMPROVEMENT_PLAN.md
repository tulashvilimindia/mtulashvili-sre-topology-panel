# E2E Topology Plugin — Master Improvement Plan

## Overview

19 tasks across 5 phases, ordered by impact. Each task follows the project's task template with full context, file plans, implementation specs, and validation checklists.

**Project root:** `C:\Users\MindiaTulashvili\OneDrive\Desktop\m88projects\grafana-topology-plugin`
**Runtime:** Node 24 LTS, React 18.3.1, TypeScript 5.9.3, Grafana SDK 12.0.10
**Build:** Webpack 5.106.1 + SWC 1.15.24 (target: es2020)
**Dev environment:** Docker Grafana Enterprise 12.0.0 on port 13100

---

# PHASE 1: Multi-Datasource Auto-Fetch (CRITICAL)

Fixes the biggest gap: only Prometheus nodes show live data. ALB, Redis, NAT, NLB, EKS, Logs — all dark.

---

## TASK 1.1: Extend useSelfQueries to Support CloudWatch Datasource

### CONTEXT
- `src/components/TopologyPanel.tsx` lines 18-101 — `useSelfQueries` hook
- Currently only queries Prometheus via `/api/datasources/proxy/uid/{dsUid}/api/v1/query`
- CloudWatch metrics (ALB, Redis, NAT, NLB) need `/api/ds/query` with CloudWatch-specific query format
- Production uses CloudWatch UID `efe2zwibgx7ggf` for 8 ALBs, 5 Redis clusters, NAT, NLB

### OBJECTIVE
Extend `useSelfQueries` to detect CloudWatch datasources and query them via Grafana's unified `/api/ds/query` endpoint, so nodes backed by CloudWatch show live metrics.

### FILE PLAN
| File path | Purpose |
|---|---|
| `src/utils/datasourceQuery.ts` | NEW — Datasource-agnostic query abstraction |

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/components/TopologyPanel.tsx` | Replace inline fetch in `useSelfQueries` with `queryDatasource()` from new utility |
| `src/types.ts` | Add `datasourceType?: string` field to `NodeMetricConfig` for query routing |

### IMPLEMENTATION SPEC

```typescript
// src/utils/datasourceQuery.ts
export async function queryDatasource(dsUid: string, query: string, dsType?: string): Promise<number | null>
  - step 1: if dsType is unknown, call getDataSourceSrv().getInstanceSettings(dsUid) to detect type
  - step 2: if type === 'prometheus' → fetch /api/datasources/proxy/uid/{dsUid}/api/v1/query?query={query}
  - step 3: if type === 'cloudwatch' → POST /api/ds/query with CloudWatch query body
  - step 4: if type === 'yesoreyeram-infinity-datasource' → POST /api/ds/query with Infinity query body
  - step 5: parse response, extract numeric value, return number | null
  - edge case: fetch fails → return null (silent, no crash)
  - edge case: response has no results → return null
```

### VALIDATION
```bash
npm run typecheck
npm run build
# Verify: CloudWatch-backed nodes show live data in browser
```

---

## TASK 1.2: Extend useSelfQueries to Support Infinity Datasource (New Relic, Kibana, Cloudflare API)

### CONTEXT
- Same `useSelfQueries` hook as Task 1.1
- Production uses 4 Infinity datasources: NewRelic (`efbmrprl96ry8e`), CLD-Kibana (`cfe2u62s9kkxse`), Cloudflare (`afctzdnavd1j4c`), Graylog (`efe39zfuam0w0f`)
- Infinity queries require POST to `/api/ds/query` with specific body format including `type`, `source`, `url`, `root_selector`, `columns`

### OBJECTIVE
Extend `queryDatasource()` from Task 1.1 to handle Infinity datasource queries for NR GraphQL, Kibana REST, and Cloudflare GraphQL APIs.

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/utils/datasourceQuery.ts` | Add Infinity query path with configurable URL, root_selector, columns |
| `src/types.ts` | Add `queryConfig?: { url?: string; rootSelector?: string; method?: string }` to `NodeMetricConfig` |

### IMPLEMENTATION SPEC
```typescript
// Addition to queryDatasource():
  - if type === 'yesoreyeram-infinity-datasource':
    - POST /api/ds/query with body:
      { queries: [{ refId: 'A', datasource: { uid: dsUid, type }, type: 'json',
        source: 'url', url: metricConfig.queryConfig.url,
        root_selector: metricConfig.queryConfig.rootSelector,
        columns: [{ selector: 'value', text: 'Value', type: 'number' }] }] }
    - parse frames[0].data.values[0][0] as number
```

### VALIDATION
```bash
npm run typecheck && npm run build
# Verify: EKS, Logs, NR-backed nodes show data
```

---

## TASK 1.3: Add Datasource Type Auto-Detection to Editor Discovery

### CONTEXT
- `src/editors/NodesEditor.tsx` BulkImport (lines 30-53) — currently only discovers Prometheus jobs
- `src/editors/components/NodeCard.tsx` useHostDiscovery (lines 20-66) — hardcoded to Prometheus
- Non-Prometheus datasources (CloudWatch, Infinity) have different discovery patterns

### OBJECTIVE
When user selects a non-Prometheus datasource in the editor, show appropriate discovery UI: CloudWatch shows namespaces/dimensions, Infinity shows configured URLs.

### FILE PLAN
| File path | Purpose |
|---|---|
| `src/editors/utils/datasourceDiscovery.ts` | NEW — Datasource-type-specific discovery functions |

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/editors/NodesEditor.tsx` | BulkImport uses datasourceDiscovery instead of hardcoded Prometheus queries |
| `src/editors/components/NodeCard.tsx` | useHostDiscovery delegates to datasourceDiscovery |

### IMPLEMENTATION SPEC
```typescript
// src/editors/utils/datasourceDiscovery.ts
export async function discoverTargets(dsUid: string, dsType: string): Promise<{ jobs: Option[]; instances: (job: string) => Promise<Option[]> }>
  - prometheus: query count by(job)(up), then up{job="..."}
  - cloudwatch: query ListMetrics for namespaces, then dimensions
  - fallback: return empty (user configures manually)
```

---

# PHASE 2: Edge & Status Improvements (HIGH)

---

## TASK 2.1: Add Edge Metric Auto-Fetch to useSelfQueries

### CONTEXT
- `src/components/TopologyPanel.tsx` lines 26-38 — uncoveredMetrics only checks `nodes[].metrics[]`
- `edgeStates` useMemo (lines 239-286) uses `data.series` but never `selfQueryResults`
- Edges with `edge.metric.datasourceUid + edge.metric.query` should also auto-fetch

### OBJECTIVE
Extend `useSelfQueries` to collect edge metrics alongside node metrics, and use results in `edgeStates` computation.

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/components/TopologyPanel.tsx` | Add edge metrics to uncoveredMetrics collection (line ~35). In edgeStates useMemo, check selfQueryResults for edge metric values. |

### IMPLEMENTATION SPEC
```typescript
// In useSelfQueries uncoveredMetrics:
(options.edges || []).forEach(edge => {
  if (edge.metric?.datasourceUid && edge.metric?.query && !covered.has(edge.id)) {
    uncovered.push({ metricId: edge.id, dsUid: edge.metric.datasourceUid, query: edge.metric.query });
  }
});

// In edgeStates useMemo, after panel data check:
if (value === null && selfQueryResults.has(edge.id)) {
  value = selfQueryResults.get(edge.id) ?? null;
}
```

---

## TASK 2.2: Add Health Summary Bar to Toolbar

### CONTEXT
- `src/components/TopologyPanel.tsx` lines 355-371 — toolbar renders title + buttons
- Sauron's Eye dashboard has "Executive Health At-a-Glance" — 9 stats per layer
- Users need one-glance system health without clicking each node

### OBJECTIVE
Add a compact row of colored dots in the toolbar, one per unique `node.type`, showing the worst status across all nodes of that type.

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/components/TopologyPanel.tsx` | Add healthSummary useMemo computing worst status per node type. Render colored dots in toolbar. |
| `src/components/TopologyPanel.css` | Add `.topology-health-bar` styles |

### IMPLEMENTATION SPEC
```typescript
const healthSummary = useMemo(() => {
  const byType = new Map<NodeType, NodeStatus>();
  nodes.forEach(node => {
    const state = nodeStates.get(node.id);
    const current = byType.get(node.type) || 'ok';
    if (isWorse(state?.status, current)) byType.set(node.type, state!.status);
  });
  return byType;
}, [nodes, nodeStates]);

// Render in toolbar:
{Array.from(healthSummary).map(([type, status]) => (
  <span className={`topology-health-dot st-${status}`} title={`${type}: ${status}`} />
))}
```

---

## TASK 2.3: Add Template Variable Support via replaceVariables

### CONTEXT
- `src/components/TopologyPanel.tsx` line 103 — PanelProps includes `replaceVariables` but it's never used
- Production dashboards use `$cf_zone`, `$alb`, `$instance` in queries
- useSelfQueries sends raw queries without variable interpolation

### OBJECTIVE
Call `replaceVariables()` on all metric queries before executing them in useSelfQueries.

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/components/TopologyPanel.tsx` | Pass `replaceVariables` to `useSelfQueries`. Apply it to each query before fetch. |

### IMPLEMENTATION SPEC
```typescript
// Change useSelfQueries signature:
function useSelfQueries(nodes, edges, panelSeries, replaceVariables): Map<string, number | null>

// Before fetching, interpolate:
const interpolatedQuery = replaceVariables(metric.query);
```

---

# PHASE 3: Visual & Layout (MEDIUM)

---

## TASK 3.1: Add 7 New Node Types for Cloud Services

### CONTEXT
- `src/types.ts` line 5 — `NodeType` has 10 types, line 278 `NODE_TYPE_CONFIG` maps them
- Missing: alb, nlb, nat, kubernetes, accelerator, logs, probe
- Currently renders "?" gray icon for unknown types

### OBJECTIVE
Add 7 cloud-native node types with distinct icons and colors.

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/types.ts` | Extend `NodeType` union. Add entries to `NODE_TYPE_CONFIG`. |

### IMPLEMENTATION SPEC
```typescript
// Add to NodeType:
| 'alb' | 'nlb' | 'nat' | 'kubernetes' | 'accelerator' | 'logs' | 'probe'

// Add to NODE_TYPE_CONFIG:
alb:          { icon: 'ALB', color: '#d08770', defaultRole: 'Application LB' },
nlb:          { icon: 'NLB', color: '#d08770', defaultRole: 'Network LB' },
nat:          { icon: 'NAT', color: '#b48ead', defaultRole: 'NAT Gateway' },
kubernetes:   { icon: 'K8s', color: '#326ce5', defaultRole: 'Kubernetes' },
accelerator:  { icon: 'GA',  color: '#ebcb8b', defaultRole: 'Global Accelerator' },
logs:         { icon: 'LOG', color: '#5e81ac', defaultRole: 'Log Aggregator' },
probe:        { icon: 'PRB', color: '#88c0d0', defaultRole: 'Synthetic Probe' },
```

---

## TASK 3.2: Implement Zoom and Pan with Fit-to-View

### CONTEXT
- `src/components/TopologyCanvas.tsx` — canvas has no zoom/pan, fixed position rendering
- Sauron's Eye has 8 vertical tiers (960px), overflows most panels
- E2E Lifecycle has 14 nodes across 7 tiers

### OBJECTIVE
Add mouse wheel zoom, drag-to-pan, and a "Fit to view" toolbar button.

### FILE PLAN
| File path | Purpose |
|---|---|
| `src/utils/viewport.ts` | NEW — Viewport transform calculations (scale, translate, fit-to-view) |

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/components/TopologyCanvas.tsx` | Wrap SVG + nodes in a transform group. Add wheel/drag handlers for zoom/pan. |
| `src/components/TopologyPanel.tsx` | Add "Fit to view" button to toolbar |
| `src/components/TopologyPanel.css` | Add `.topology-canvas-viewport` styles |

### IMPLEMENTATION SPEC
```typescript
// src/utils/viewport.ts
export interface ViewportState { scale: number; translateX: number; translateY: number; }

export function fitToView(nodePositions: Map<string, Point>, canvasW: number, canvasH: number): ViewportState
  - compute bounding box of all node positions
  - calculate scale to fit bbox in canvas with 20px padding
  - center the translated view
  - clamp scale to [0.3, 2.0]

// TopologyCanvas additions:
const [viewport, setViewport] = useState<ViewportState>({ scale: 1, translateX: 0, translateY: 0 });

// Wheel handler:
const handleWheel = (e: WheelEvent) => {
  e.preventDefault();
  const newScale = clamp(viewport.scale * (1 - e.deltaY * 0.001), 0.3, 2.0);
  setViewport(prev => ({ ...prev, scale: newScale }));
};

// Apply transform to container:
<div style={{ transform: `translate(${vp.translateX}px, ${vp.translateY}px) scale(${vp.scale})`, transformOrigin: '0 0' }}>
  {/* SVG + nodes */}
</div>
```

---

## TASK 3.3: Add Response Path Edge Type and Latency Annotations

### CONTEXT
- `src/types.ts` line 78 — `EdgeType` has 5 types
- `src/utils/edges.ts` line 173 — `EDGE_TYPE_STYLES` defines visual per type
- E2E Lifecycle dashboard tracks return path (DB → App → ALB → CF → Client)
- No way to distinguish forward traffic from return response visually

### OBJECTIVE
Add `response` edge type with reverse-arrow visual (blue, dashed). Add optional `latencyLabel` field for p95/p99 display on edges.

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/types.ts` | Add `'response'` to EdgeType. Add `latencyLabel?: string` to TopologyEdge. |
| `src/utils/edges.ts` | Add `response` entry to EDGE_TYPE_STYLES (blue, reversed arrow) |
| `src/components/TopologyCanvas.tsx` | Add blue arrow marker def. Render response edges with reverse path direction. |

---

## TASK 3.4: Improve Auto-Layout for Wide Tiers and Group Awareness

### CONTEXT
- `src/utils/layout.ts` lines 94-148 — autoLayout positions nodes in grid
- 6-node IIS cluster at same tier looks cramped
- Groups (HA pairs) should keep members adjacent

### OBJECTIVE
Improve autoLayout to handle fan-out (wide tiers) and keep group members adjacent.

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/utils/layout.ts` | Sort nodes within each tier: grouped nodes adjacent. Add minimum spacing for wide tiers. Auto-reduce tierSpacing when >6 tiers. |

---

# PHASE 4: Editor UX Polish (MEDIUM)

---

## TASK 4.1: Add Delete Confirmation with Orphan Edge Warning

### CONTEXT
- `src/editors/NodesEditor.tsx` line ~75 — `handleDelete` immediately removes node
- No warning about orphan edges referencing the deleted node

### OBJECTIVE
Show confirmation dialog listing edges that reference the node. Offer to auto-delete orphan edges.

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/editors/NodesEditor.tsx` | Count edges referencing node from `context.options.edges`. Show confirm dialog with count. |

---

## TASK 4.2: Add Node Search/Filter to NodesEditor

### CONTEXT
- `src/editors/NodesEditor.tsx` — flat list of node cards, no filtering
- With 14+ nodes, scrolling is tedious

### OBJECTIVE
Add a search Input at the top of the node list that filters by name, type, or role.

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/editors/NodesEditor.tsx` | Add `filterText` state. Filter nodes by `name.includes(filterText) || role.includes(filterText)` before mapping to NodeCards. |

---

## TASK 4.3: Add Import/Export Topology JSON

### CONTEXT
- Users may want to share topologies or backup configurations
- Currently topology only exists in dashboard JSON panel options

### OBJECTIVE
Add "Export JSON" and "Import JSON" buttons to the NodesEditor header. Export downloads `{ nodes, edges, groups }`. Import reads a JSON file and merges into current topology.

### FILE PLAN
| File path | Purpose |
|---|---|
| `src/editors/utils/topologyIO.ts` | NEW — Export/import functions for topology JSON |

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/editors/NodesEditor.tsx` | Add Export/Import buttons that call topologyIO functions |

---

## TASK 4.4: Add Canvas-Sidebar Sync (Click Node → Open Editor Card)

### CONTEXT
- Users edit nodes in the sidebar but can't see which node they're editing on the canvas
- No way to click a node on canvas to open its editor card

### OBJECTIVE
When user clicks a node on the canvas while in edit mode, auto-scroll and expand the corresponding NodeCard in the sidebar.

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/components/TopologyPanel.tsx` | Detect edit mode (check URL for editPanel param). Pass selectedNodeId to canvas. |
| `src/components/TopologyCanvas.tsx` | On click in edit mode, emit selectedNodeId via callback |
| `src/editors/NodesEditor.tsx` | Accept selectedNodeId prop. Auto-expand matching card, scroll into view. |
| `src/module.ts` | Pass selected node context through options or event bus |

---

# PHASE 5: Advanced Features (LOW)

---

## TASK 5.1: Add Click-Node Timeseries Popup

### CONTEXT
- Topology shows current instant values only
- Users need to see trends (last 1h) for investigating incidents
- Sauron's Eye has full timeseries panels per layer

### OBJECTIVE
When user clicks a node on the canvas (in view mode), show a floating popup with sparkline timeseries for each metric over the last 1h.

### FILE PLAN
| File path | Purpose |
|---|---|
| `src/components/NodePopup.tsx` | NEW — Floating popup with mini timeseries charts |

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/components/TopologyPanel.tsx` | Add popup state. On node click, fetch range query data for that node's metrics. |
| `src/components/TopologyPanel.css` | Add `.topology-popup` positioning and styling |

---

## TASK 5.2: Add Status Propagation (Upstream Edge Coloring)

### CONTEXT
- If a DB node is critical, upstream edges and dependent nodes should visually show impact
- Currently each node/edge is independently colored

### OBJECTIVE
When a node has critical status, propagate warning color to all incoming edges and mark upstream nodes with a subtle indicator.

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/components/TopologyPanel.tsx` | After computing nodeStates, run propagation pass: for each critical node, mark incoming edges as degraded and upstream nodes with propagated warning. |
| `src/utils/edges.ts` | Add `propagateStatus(nodeStates, edges)` function |

---

## TASK 5.3: Add Time Travel Slider for Incident Replay

### CONTEXT
- Topology shows current state. During incident review, users want to see how the topology looked at a specific past time.

### OBJECTIVE
Add a time slider in the toolbar that re-queries all metrics at a historical timestamp.

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/components/TopologyPanel.tsx` | Add `historicalTimestamp` state. When set, useSelfQueries adds `&time={timestamp}` to Prometheus queries. |
| `src/components/TopologyPanel.css` | Add `.topology-time-slider` styles |

---

## TASK 5.4: Add Custom Icon Text Override per Node

### CONTEXT
- `NODE_TYPE_CONFIG` maps type → icon text (e.g., "CF", "PA", "F5")
- Users may want custom icons without creating a new type (e.g., "SB" for Sportsbook, "GA" for Global Accelerator)

### OBJECTIVE
Add optional `iconOverride?: string` field to TopologyNode. If set, renders this text instead of the type's default icon.

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/types.ts` | Add `iconOverride?: string` to TopologyNode |
| `src/components/TopologyCanvas.tsx` | Use `node.iconOverride \|\| NODE_TYPE_CONFIG[node.type].icon` in icon render |
| `src/editors/components/NodeCard.tsx` | Add "Icon override" Input in Advanced section |

---

## TASK 5.5: Add Bidirectional Edge Conflict Detection

### CONTEXT
- Multiple edges between same two nodes overlap visually
- `src/utils/layout.ts` line 39-43 — assignTiers skips bidirectional edges but doesn't handle parallel edges

### OBJECTIVE
Detect parallel edges between same node pair. Offset them vertically so both are visible.

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/components/TopologyCanvas.tsx` | In edge rendering loop, detect parallel edges. Apply vertical offset to bezier control points for the second edge. |

---

# SUMMARY

| Phase | Tasks | Impact | Effort |
|-------|-------|--------|--------|
| **Phase 1** | 1.1, 1.2, 1.3 | Multi-DS auto-fetch: CloudWatch, Infinity, auto-detect | High (3-4 days) |
| **Phase 2** | 2.1, 2.2, 2.3 | Edge metrics, health bar, template variables | High (2-3 days) |
| **Phase 3** | 3.1, 3.2, 3.3, 3.4 | Node types, zoom/pan, response edges, layout | Medium (3-4 days) |
| **Phase 4** | 4.1, 4.2, 4.3, 4.4 | Delete confirm, search, import/export, canvas sync | Medium (2-3 days) |
| **Phase 5** | 5.1, 5.2, 5.3, 5.4, 5.5 | Timeseries popup, propagation, time travel, icons, parallel edges | Low (4-5 days) |
| **Total** | **19 tasks** | | **~15-19 days** |

### VALIDATION CHECKLIST (all tasks)
```bash
npm run typecheck    # 0 errors
npm run lint         # 0 errors (when configured)
npm run build        # webpack compiled successfully
# Browser: open http://localhost:13100 → verify topology renders
# Console: 0 errors from plugin
# Verify: git diff --name-only shows only expected files
```

---

# QA FINDINGS — Post-Implementation (Phase 1-5 Complete)

## Bugs Found

| ID | Severity | Bug | Root Cause |
|----|----------|-----|-----------|
| B1 | MEDIUM | ALB/EKS/NLB nodes show wrong icon (F5/IIS instead of ALB/K8s/NLB) | Dashboard JSON uses old types (loadbalancer, server) instead of new types (alb, kubernetes, nlb) |
| B2 | LOW | Cloudflare shows "warning" at 168 rps — thresholds too low | CF threshold set to 100 yellow, should be 10k+ for production |
| B3 | LOW | 5/11 Sauron nodes show "nodata" | No metrics configured — needs CloudWatch queryConfig |

## UX Gaps Found

| ID | Severity | Gap | Impact |
|----|----------|-----|--------|
| G1 | HIGH | Node popup position ignores zoom/pan viewport transform | Popup appears at wrong position when zoomed |
| G2 | HIGH | Drag-and-drop doesn't inverse-transform pointer coords for zoom/pan | Node doesn't follow cursor when zoomed in/out |
| G3 | MEDIUM | No visual indicator for time travel mode (viewing historical data) | Users may confuse historical values with current |
| G4 | MEDIUM | Parallel edge offset always horizontal, wrong for left-right layout | Edges overlap in left-right direction mode |
| G5 | MEDIUM | No undo/redo for editor actions | Accidental deletes are irreversible |
| G6 | LOW | Node popup doesn't close on canvas background click | Must click "x" explicitly |
| G7 | LOW | Health bar dot doesn't show count per type | "2 nodes" vs "1 node" matters |
| G8 | LOW | Export only exports from NodesEditor path, not full topology | Import reads nodes only, ignores edges/groups |
| G9 | LOW | Fit-to-view doesn't auto-trigger on first render | Large topologies overflow initially |
| G10 | LOW | No loading spinner during auto-fetch | Values show "N/A" briefly before data arrives |

## Functional Gaps

| ID | Gap |
|----|-----|
| F1 | CloudWatch auto-fetch untested with real CW data |
| F2 | Infinity auto-fetch untested with real NR/Kibana data |
| F3 | Status propagation only fires for `critical`, not `degraded`/`down` |
| F4 | Canvas-sidebar sync is one-way only (canvas → sidebar, not reverse) |
| F5 | No edge click/selection/highlighting |

---

# PHASE 6: Bug Fixes & QA Gaps (CRITICAL)

---

## TASK 6.1: Fix Zoom/Pan Coordinate Transform for Drag and Popup

### CONTEXT
- `src/components/TopologyCanvas.tsx` — drag handlers use raw pointer coords
- `src/components/TopologyPanel.tsx` — popup position uses raw node position
- When viewport is zoomed/panned, coordinates are wrong

### OBJECTIVE
Inverse-transform pointer coordinates by viewport state during drag. Transform popup position by viewport state for correct overlay placement.

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/components/TopologyCanvas.tsx` | In `handlePointerDown` and `handleMove`, divide pointer delta by `viewport.scale` and subtract `viewport.translate` |
| `src/components/TopologyPanel.tsx` | Multiply popup position by viewport scale and add viewport translate |

### IMPLEMENTATION SPEC
```typescript
// In drag handleMove:
let x = (e.clientX - rect.left - dragging.offX - viewport.translateX) / viewport.scale;
let y = (e.clientY - rect.top - dragging.offY - viewport.translateY) / viewport.scale;

// In popup position:
position={{ 
  x: popupPos.x * viewport.scale + viewport.translateX + nodeWidth + 10, 
  y: popupPos.y * viewport.scale + viewport.translateY + 36 
}}
```

### VALIDATION
```bash
npm run typecheck && npm run build
# Browser: zoom in, drag a node — must follow cursor correctly
# Browser: zoom in, click a node — popup must appear next to it
```

---

## TASK 6.2: Fix Export/Import to Include Full Topology (nodes + edges + groups)

### CONTEXT
- `src/editors/NodesEditor.tsx` — `exportTopologyJSON()` exports all three arrays correctly
- `importTopologyJSON()` only reads `data.nodes`, ignores edges/groups

### OBJECTIVE
Import function should merge nodes, edges, and groups from the uploaded file.

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/editors/NodesEditor.tsx` | `importTopologyJSON` reads and writes all three arrays. Since NodesEditor can only write to `nodes` path, add a note that full import requires dashboard JSON editor for edges/groups. |

---

## TASK 6.3: Add Time Travel Visual Indicator

### CONTEXT
- `src/components/TopologyPanel.tsx` — `timeOffset` state drives historical queries
- No visual feedback that data is historical

### OBJECTIVE
When time travel is active (not "Live"), show a colored banner in the toolbar: "Viewing data from 1h ago".

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/components/TopologyPanel.tsx` | Add conditional banner below toolbar when `timeOffset !== 0` |
| `src/components/TopologyPanel.css` | Add `.topology-time-banner` styles (amber background) |

---

## TASK 6.4: Add Loading Spinner During Auto-Fetch

### CONTEXT
- `src/components/TopologyPanel.tsx` — `useSelfQueries` fetches data with 500ms debounce
- No loading indicator while fetching

### OBJECTIVE
Show a subtle spinner/text in the toolbar during auto-fetch. Clear when results arrive.

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/components/TopologyPanel.tsx` | Add `isLoading` state to `useSelfQueries`. Render spinner in toolbar when true. |
| `src/components/TopologyPanel.css` | Add `.topology-loading` spinner styles |

---

## TASK 6.5: Fix Status Propagation to Include degraded/down

### CONTEXT
- `src/utils/edges.ts` — `propagateStatus()` only checks for `critical`
- `degraded` and `down` should also propagate upstream

### OBJECTIVE
Propagate any status worse than `ok` to incoming edges.

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/utils/edges.ts` | Change condition from `=== 'critical'` to `isWorseStatus(targetStatus, 'ok')` |

---

## TASK 6.6: Auto Fit-to-View on First Render

### CONTEXT
- `src/components/TopologyCanvas.tsx` — viewport defaults to `DEFAULT_VIEWPORT` (no zoom)
- Large topologies overflow the panel on first load

### OBJECTIVE
On first render (when nodes change from 0 to >0), auto-trigger fit-to-view.

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/components/TopologyCanvas.tsx` | Add `useEffect` watching `nodes.length` — when it transitions from 0 to >0, call `handleFitToView()` |

---

## TASK 6.7: Close Popup on Canvas Background Click

### CONTEXT
- `src/components/TopologyPanel.tsx` — popup stays open until "x" clicked
- Should close when clicking on empty canvas area

### OBJECTIVE
Add click handler on the panel container that closes the popup when clicking outside any node.

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/components/TopologyPanel.tsx` | Add `onClick` on the panel div that calls `setPopupNodeId(null)`. Node click handlers already `stopPropagation`. |

---

## TASK 6.8: Add Health Bar Node Count Per Type

### CONTEXT
- Health dots show "F5 loadbalancer: ok" but not how many nodes of that type
- With 6 PP servers, knowing "6 servers: ok" matters

### OBJECTIVE
Add node count to the health dot title: "IIS server (6): ok".

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/components/TopologyPanel.tsx` | In `healthSummary` useMemo, also count nodes per type. Update title to include count. |

---

# SUMMARY (Updated)

| Phase | Tasks | Status |
|-------|-------|--------|
| Phase 1 | 1.1-1.3 | COMPLETE |
| Phase 2 | 2.1-2.3 | COMPLETE |
| Phase 3 | 3.1-3.4 | COMPLETE |
| Phase 4 | 4.1-4.4 | COMPLETE |
| Phase 5 | 5.1-5.5 | COMPLETE (19/19) |
| **Phase 6** | **6.1-6.8** | **PENDING** (0/8 — QA fixes) |
| **Total** | **27 tasks** | **19 complete, 8 pending** |

---

# QA ROUND 2 — Additional Findings (3 Test Cycles)

## Test Cycle 2: Entry to DB (9 nodes)
| ID | Severity | Finding |
|----|----------|---------|
| B4 | MEDIUM | ALB shows "F5" icon, EKS shows "IIS" — dashboard JSON uses old types |
| B5 | MEDIUM | App Logs, NAT Gateway, Endpoint Probes show "?" icon — uses `custom` type instead of `logs`, `nat`, `probe` |
| G11 | LOW | No "click to expand" hint on nodes with only summary metrics — correct behavior but users may not realize there's nothing to expand |

## Test Cycle 3: E2E Lifecycle (14 nodes)
| ID | Severity | Finding |
|----|----------|---------|
| B6 | MEDIUM | MSPORTSDB1 PLE metric shows "11.5ks" — `formatNumber(11521)` produces "11.5k" then format "${value}s" makes "11.5ks". Should be "3.2h" or "11.5k s" |
| B7 | MEDIUM | Global Accelerator/ALB/EKS/NLB all show wrong icons — same root cause as B1 (JSON uses old types) |
| B8 | LOW | Synthetics node shows "?" icon — should use `probe` type |
| PASS | - | 0 node overlaps, content fits without overflow, groups correctly sized |

## Test Cycle 4: Angular Portal (12 nodes, reference topology)
| ID | Severity | Finding |
|----|----------|---------|
| B9 | LOW | No edge labels rendering — edges in auto-query dashboard don't have `labelTemplate` configured |
| G12 | LOW | Health bar all same color when everything healthy — no visual diversity, consider showing type icon letters |
| PASS | - | 20/20 metrics live, 0 NaN/Infinity/undefined, 0 suspicious values, DOM count reasonable (553) |

## Consolidated Bug + Gap List (All 4 Test Cycles)

### BUGS (need code fix)
| ID | Severity | Description | Fix |
|----|----------|-------------|-----|
| B1-B5,B7,B8 | MEDIUM | Dashboard JSONs use old node types — consolidated fix | Update all 3 Sportsbook topology JSONs to use new types (alb, nlb, nat, kubernetes, probe) |
| B6 | MEDIUM | `formatNumber()` + format template creates "11.5ks" | Add unit-aware formatting: detect if format ends with time unit, format as duration instead |
| G1 | HIGH | Popup position wrong when zoomed/panned | Apply inverse viewport transform |
| G2 | HIGH | Drag-and-drop wrong when zoomed/panned | Apply inverse viewport transform to pointer coords |

### UX GAPS (need design decision)
| ID | Severity | Description |
|----|----------|-------------|
| G3 | MEDIUM | No visual indicator for time travel mode |
| G4 | MEDIUM | Parallel edge offset wrong for left-right layout |
| G5 | MEDIUM | No undo/redo |
| G6 | LOW | Popup doesn't close on background click |
| G7 | LOW | Health dots don't show node count per type |
| G8 | LOW | Import only imports nodes, not edges/groups |
| G9 | LOW | No auto fit-to-view on first render |
| G10 | LOW | No loading spinner during auto-fetch |
| G12 | LOW | Health bar all same color when everything healthy |

### FUNCTIONAL GAPS (need data/config work)
| ID | Description |
|----|-------------|
| F1 | CloudWatch auto-fetch untested with real CW data |
| F2 | Infinity auto-fetch untested with real NR/Kibana data |
| F3 | Status propagation only fires for critical |
| F4 | Canvas-sidebar sync one-way only |
| F5 | No edge click/selection |

---

# QA ROUND 3 — Additional Findings (Test Cycles 5-8)

## Test Cycle 5: Negative / Edge Case Testing (Angular Portal)
| ID | Result | Finding |
|----|--------|---------|
| N1-N10 | ALL PASS | No broken paths (0 NaN/Infinity in SVG), no XSS injection, no empty src/href, no overlapping positions, no React error boundaries, all groups have labels, overflow correctly hidden, 553 DOM nodes (healthy) |

## Test Cycle 6: Time Travel Integrity
| ID | Result | Finding |
|----|--------|---------|
| PASS | - | Time select switches to "-60" correctly via DOM event |
| **G13** | MEDIUM | **No visual feedback when time travel values are loading** — after switching to "1h ago", values stay showing current data until the 500ms debounced fetch completes. User doesn't know if values changed or are still loading. |

## Test Cycle 7: Accessibility Testing
| ID | Severity | Finding |
|----|----------|---------|
| **A1** | HIGH | **Zero aria-labels on nodes** — 0/12 nodes have aria-label or role. Screen readers can't identify topology nodes. |
| **A2** | MEDIUM | **6/12 node names truncated** — `topo-node-name` with `text-overflow: ellipsis` cuts off long names like "iNMANPR-PP01". No tooltip to see full name. |
| **A3** | MEDIUM | **Smallest font is 7px** — `.topo-metric-label` at 7px is below WCAG minimum (9px recommended). Hard to read on standard displays. |
| **A4** | MEDIUM | **Color contrast fails WCAG AA** — nodata status uses #4c566a on #1a1e24 (ratio ~2.5:1, needs 4.5:1). Gray-on-dark-gray is barely visible. |
| **A5** | LOW | **All toolbar buttons below 44px touch target** — 5/5 buttons are too small for mobile/tablet touch (< 44×44px). |

## Test Cycle 8: Edge Cases + Interaction
| ID | Result | Finding |
|----|--------|---------|
| E1-E8 | ALL PASS | No empty names, no duplicate positions, no duplicate SVG IDs, viewport wrapper exists, panel title correct, DOM count stable (553) |
| **G14** | LOW | **Time travel state persists across page navigation** — switching to "1h ago" stays on "-60" when coming back. Should reset to "Live" on dashboard navigation or show the historical state clearly. |

## Consolidated New Findings (Rounds 2+3)

### New Bugs
| ID | Severity | Description |
|----|----------|-------------|
| B6 | MEDIUM | formatNumber + format template creates "11.5ks" for PLE values |

### New UX Gaps
| ID | Severity | Description |
|----|----------|-------------|
| G11 | LOW | No expand hint on nodes with only summary metrics |
| G12 | LOW | Health bar all same color when everything healthy |
| G13 | MEDIUM | No visual feedback during time travel fetch |
| G14 | LOW | Time travel state persists across navigation |

### New Accessibility Gaps
| ID | Severity | Description |
|----|----------|-------------|
| A1 | HIGH | Zero aria-labels on topology nodes |
| A2 | MEDIUM | 6/12 node names truncated, no tooltip for full name |
| A3 | MEDIUM | 7px font size on metric labels, below WCAG minimum |
| A4 | MEDIUM | Color contrast fails WCAG AA for nodata status |
| A5 | LOW | Toolbar buttons below 44px touch target |

---

# PHASE 7: Accessibility & QA Fixes

---

## TASK 7.1: Add ARIA Labels and Roles to Topology Nodes

### CONTEXT
- `src/components/TopologyCanvas.tsx` — node divs have no aria-label or role
- Screen readers cannot identify or describe topology nodes

### OBJECTIVE
Add `role="button"` and `aria-label="{name} ({type}): {status}"` to each node div.

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/components/TopologyCanvas.tsx` | Add `role="button"` and `aria-label` to the `.topology-node` div |

---

## TASK 7.2: Add Tooltips for Truncated Node Names

### CONTEXT
- `src/components/TopologyCanvas.tsx` — node names use CSS `text-overflow: ellipsis`
- 6/12 nodes show truncated names with no way to see full text

### OBJECTIVE
Add `title={node.name}` attribute to the `.topo-node-name` span.

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/components/TopologyCanvas.tsx` | Add `title={node.name}` to `.topo-node-name` span |

---

## TASK 7.3: Fix Minimum Font Size and Color Contrast

### CONTEXT
- `src/components/TopologyPanel.css` — `.topo-metric-label` is 7px, fails WCAG
- `.topo-node-dot.nodata` uses #4c566a on #1a1e24, contrast ratio ~2.5:1

### OBJECTIVE
Increase label font to 9px minimum. Lighten nodata color to #616e88 for better contrast.

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/components/TopologyPanel.css` | Change `.topo-metric-label` font-size from 7px to 9px. Change nodata status text color. |

---

## TASK 7.4: Fix formatNumber Unit Collision ("11.5ks" bug)

### CONTEXT
- `src/components/TopologyPanel.tsx` — `formatNumber()` compresses numbers, then format template appends unit
- PLE value 11521 → "11.5k" + "${value}s" → "11.5ks" (nonsensical)

### OBJECTIVE
When format template ends with a time unit (s, ms, m, h), format as human-readable duration instead of compressed number + raw unit.

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/components/TopologyPanel.tsx` | Add `formatDuration()` helper. In metric formatting, detect if format ends with time unit and use duration format instead. |

### IMPLEMENTATION SPEC
```typescript
function formatDuration(seconds: number): string {
  if (seconds >= 86400) return (seconds / 86400).toFixed(1) + 'd';
  if (seconds >= 3600) return (seconds / 3600).toFixed(1) + 'h';
  if (seconds >= 60) return (seconds / 60).toFixed(1) + 'm';
  return seconds.toFixed(1) + 's';
}

// In metric formatting:
const isTimeFormat = /\$\{value\}(s|ms|m|h)$/.test(metricConfig.format);
const formatted = isTimeFormat 
  ? metricConfig.format.replace('${value}' + timeUnit, formatDuration(raw))
  : metricConfig.format.replace('${value}', formatNumber(raw));
```

---

## TASK 7.5: Add Time Travel Visual Banner

### CONTEXT
- When time travel is active, nothing indicates data is historical
- Users may confuse historical values with live

### OBJECTIVE
Show amber banner "Viewing: 1h ago" below toolbar when timeOffset !== 0. Add pulsing dot to distinguish from live mode.

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/components/TopologyPanel.tsx` | Add conditional banner render |
| `src/components/TopologyPanel.css` | Add `.topology-time-banner` styles |

---

# PHASE 8: Multi-Layer Topology (FEATURE REQUEST)

## Understanding of the Request

The user wants to represent **hierarchical/nested infrastructure** where one node can "expand" into a sub-topology showing its internal components:

### Example 1: F5 Multi-Layer
```
TIER 1 (Current):
  F5 LTM01 (single node showing CPU, Memory)
  
TIER 2 (Drill-down — what user wants):
  F5 LTM01
    ├── VS Angular 443 (connections: 186)
    │     └── Pool Angular (6 members) → PP01-PP06
    └── VS Sportsbook 443 (connections: 3244)
          └── Pool Sportsbook (8 members) → SB01-SB08
```

The user wants **multiple virtual servers as separate nodes** under one F5, each with their own pool and backend cluster. Currently this is modeled as flat nodes but should be visually hierarchical.

### Example 2: Cloudflare Multi-Zone
```
TIER 1 (Current):
  Cloudflare (single node showing aggregate RPS)

TIER 2 (Drill-down — what user wants):
  Cloudflare
    ├── Zone: cnmglobal04.com (rps: 168, cache: 40%)
    └── Zone: mspjlj.com (rps: 5.2k, cache: 85%)
```

Each CF zone becomes a **separate node** with its own metrics, instead of one aggregated node.

### Architectural Analysis

This is NOT about nested/sub-topologies or drill-down views. It's about the **data model flexibility** — users want to:

1. **Create multiple instances of the same service type** with different labels and different metrics
2. **Wire them independently** in the topology (VS1 → Pool1 → Servers1..6, VS2 → Pool2 → Servers7..14)
3. **See per-instance metrics** (connections per VS, not aggregate)

**The plugin already supports this.** The user just needs to:
- Add 2 VS nodes instead of 1 (VS Angular 443, VS Sportsbook 443)
- Add 2 Pool nodes (Pool Angular, Pool Sportsbook)
- Wire edges separately

What's MISSING is a way to **visually indicate hierarchy** — that both VS nodes belong to the same F5 LTM. This is exactly what **groups** do, but groups are currently flat dashed rectangles. The user wants **nested groups** or **visual parent-child** relationships.

### Proposed Solution

Two approaches:

**Approach A: Nested Groups (recommended)**
Extend `NodeGroup` to support `parentGroupId`, creating a visual hierarchy:
```typescript
interface NodeGroup {
  // ...existing fields...
  parentGroupId?: string;  // NEW: nesting support
}
```
Rendering: nested dashed rectangles with indented labels.

**Approach B: Expandable Nodes**
Extend `TopologyNode` to support `childNodeIds`:
```typescript
interface TopologyNode {
  // ...existing fields...
  childNodeIds?: string[];  // NEW: nodes inside this node
  isCollapsed?: boolean;    // NEW: hide/show children
}
```
Rendering: when collapsed, show parent node. When expanded, show parent + children inside a container.

**Recommendation:** Approach A (nested groups) is simpler and works with existing architecture. Users create groups like "F5 LTM01 → Virtual Servers" containing VS Angular + VS Sportsbook nodes.

---

## TASK 8.1: Add Nested Group Support (parentGroupId)

### CONTEXT
- `src/types.ts` — `NodeGroup` has no nesting support
- `src/components/TopologyCanvas.tsx` — groups rendered as flat rectangles

### OBJECTIVE
Allow groups to nest inside other groups. Render nested groups as indented containers.

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/types.ts` | Add `parentGroupId?: string` to NodeGroup |
| `src/components/TopologyCanvas.tsx` | In group rendering, compute nested bounding boxes. Render parent groups first (larger), child groups inside. |
| `src/editors/components/GroupCard.tsx` | Add "Parent group" Select dropdown |

---

## TASK 8.2: Add Cloudflare Multi-Zone Template

### CONTEXT
- Users want separate CF zone nodes with per-zone metrics
- Each zone has different queries: `cloudflare_zone_requests_total{zone="cnmglobal04.com"}` vs `{zone="mspjlj.com"}`

### OBJECTIVE
Add a "CF Zone" node template that auto-generates zone-specific queries when user selects a zone name.

### MODIFICATION PLAN
| File path | Change |
|---|---|
| `src/editors/NodesEditor.tsx` | In BulkImport, add "Cloudflare Zones" discovery option that lists zones from CF exporter and creates per-zone nodes |

---

# UPDATED SUMMARY

| Phase | Tasks | Status |
|-------|-------|--------|
| Phase 1-5 | 19 tasks | COMPLETE (19/19) |
| Phase 6 | 6.1-6.8 | PENDING (QA bug fixes) |
| Phase 7 | 7.1-7.5 | PENDING (accessibility + formatting) |
| Phase 8 | 8.1-8.2 | PENDING (multi-layer feature) |
| **Total** | **34 tasks** | **19 complete, 15 pending** |

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

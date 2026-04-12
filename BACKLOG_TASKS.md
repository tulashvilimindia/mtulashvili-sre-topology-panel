# Backlog Tasks — Full Template Format

## SHARED CONTEXT (applies to ALL tasks below)

- **Project root:** `C:\Users\MindiaTulashvili\OneDrive\Desktop\m88projects\grafana-topology-plugin`
- **Language/runtime:** Node 24 LTS, TypeScript 5.9.3, React 18.3.1, Grafana SDK 12.0.10
- **Build:** Webpack 5.106.1 + SWC 1.15.24 (target: es2020)
- **External dependencies already in lockfile:** `@grafana/data@12.0.10`, `@grafana/runtime@12.0.10`, `@grafana/ui@12.0.10`, `react@18.3.1`, `lodash@4.17.21`
- **Infrastructure assumptions:** Docker Grafana Enterprise 12.0.0 on port 13100, Production Prometheus proxy via `prod-prometheus` datasource UID
- **Coding standards:** 27 rules in CLAUDE.md — no `any` types, explicit return types, utils are pure functions, useMemo for derived values, useCallback for prop functions, `topology-` class prefix for panel, `topo-` for internals, dark theme Nord palette, never crash on missing data

## ON AMBIGUITY (applies to ALL tasks)

1. If anything in the spec is unclear or seems to conflict → STOP and ask. Do NOT guess.
2. Do NOT add features, optimizations, or improvements not specified in the task.
3. Do NOT refactor, rename, or reorganize existing code "while you're at it."
4. If a test fails → fix the implementation, NOT the test expectation.
5. If you cannot complete a step → document exactly WHY and STOP.
6. If you think the spec has a mistake → say so and ask. Do NOT silently "fix" it.
7. Implement EXACTLY what is specified. Less is a bug. More is also a bug.

---

# TASK 6.1: Fix Zoom/Pan Coordinate Transform for Drag and Popup

## CONTEXT

- Project root: `C:\Users\MindiaTulashvili\OneDrive\Desktop\m88projects\grafana-topology-plugin`
- Language/runtime: TypeScript 5.9.3 / React 18.3.1 / Grafana SDK 12.0.10
- Relevant existing files:
  - `src/components/TopologyCanvas.tsx` — drag handlers (lines 92-130), viewport state (lines 37-90), `handlePointerDown`, `handleMove`
  - `src/components/TopologyPanel.tsx` — popup rendering (lines 438-447), `popupNodeId` state
  - `src/utils/viewport.ts` — `ViewportState` interface, `zoomAtPoint()`, `fitToView()`

## OBJECTIVE

Fix pointer coordinate transform during zoom/pan so drag-and-drop follows the cursor correctly and popup appears adjacent to the clicked node regardless of zoom level. Currently at 2x zoom, dragging moves the node at half speed and popup appears at 2x offset.

## RULES

### DO
- [ ] Inverse-transform pointer coords by `viewport.scale` and `viewport.translateX/Y` in drag handlers
- [ ] Transform popup position by viewport state before rendering
- [ ] Guard against `viewport.scale === 0` (division by zero)
- [ ] Preserve existing drag snap-to-grid behavior after transform
- [ ] Test at zoom levels: 0.5x, 1.0x, 1.5x, 2.0x

### DO NOT
- [ ] Do NOT modify `src/utils/viewport.ts` — transforms happen in components
- [ ] Do NOT change the zoom/pan mechanism itself — only fix coordinate mapping
- [ ] Do NOT add new dependencies

## FILE PLAN

No new files.

## MODIFICATION PLAN

| File path | Exact change description |
|---|---|
| `src/components/TopologyCanvas.tsx` | In `handlePointerDown` (line ~92): compute offset using inverse viewport transform. In `handleMove` (line ~110): apply `(clientX - rect.left - viewport.translateX) / viewport.scale` for x/y |
| `src/components/TopologyPanel.tsx` | In popup render (line ~440): multiply `popupPos.x/y` by `viewport.scale` and add `viewport.translateX/Y` |

## IMPLEMENTATION SPEC

### TopologyCanvas.tsx changes

```typescript
// handlePointerDown — compute offset in world coordinates:
const worldX = (e.clientX - rect.left - viewport.translateX) / viewport.scale;
const worldY = (e.clientY - rect.top - viewport.translateY) / viewport.scale;
setDragging({ nodeId, offX: worldX - pos.x, offY: worldY - pos.y });

// handleMove — convert pointer to world coordinates:
const worldX = (e.clientX - rect.left - viewport.translateX) / viewport.scale;
const worldY = (e.clientY - rect.top - viewport.translateY) / viewport.scale;
let x = worldX - dragging.offX;
let y = worldY - dragging.offY;
// clamp and snap-to-grid as before
```

### TopologyPanel.tsx changes

```typescript
// Popup position — transform from world to screen:
// Need viewport from TopologyCanvas. Either:
// a) Lift viewport state to TopologyPanel, OR
// b) Position popup inside the viewport-transformed div
// Option b is simpler: move popup render INSIDE TopologyCanvas viewport wrapper
```

## VALIDATION CHECKLIST

```bash
npm run typecheck
npm run build
# Browser: zoom to 2x → drag node → must follow cursor exactly
# Browser: zoom to 0.5x → drag node → must follow cursor exactly
# Browser: zoom to 2x → click node → popup appears adjacent to node
# Browser: pan left → click node → popup positioned correctly
# Console: 0 errors
```

---

# TASK 7.1: Add ARIA Labels and Roles to Topology Nodes

## CONTEXT

- `src/components/TopologyCanvas.tsx` — node div (lines ~330-350) has class `.topology-node` but no ARIA attributes
- Screen readers cannot identify, describe, or navigate topology nodes
- 0/12 nodes have aria-label, role, or title attributes

## OBJECTIVE

Add `role="button"` and descriptive `aria-label` to each topology node for screen reader accessibility. Label format: `"{name} ({type}): {status} — {metricSummary}"`.

## RULES

### DO
- [ ] Add `role="button"` to `.topology-node` div (nodes are interactive — clickable/draggable)
- [ ] Add `aria-label` with format: `"{node.name} ({node.type}): {status}"`
- [ ] Add `title={node.name}` for hover tooltip on truncated names (merges Task 7.2)
- [ ] Follow existing naming conventions (camelCase for props)

### DO NOT
- [ ] Do NOT add aria attributes to SVG edge paths (too noisy)
- [ ] Do NOT change visual appearance

## FILE PLAN

No new files.

## MODIFICATION PLAN

| File path | Exact change description |
|---|---|
| `src/components/TopologyCanvas.tsx` | On the `.topology-node` div (line ~337): add `role="button"`, `aria-label={...}`, `title={node.name}` |

## IMPLEMENTATION SPEC

```typescript
<div
  key={node.id}
  role="button"
  aria-label={`${node.name} (${node.type}): ${status}`}
  title={node.name}
  className={`topology-node ${node.compact ? 'compact' : ''} st-${status} ...`}
  // ...existing props
>
```

## VALIDATION CHECKLIST

```bash
npm run typecheck
npm run build
# Browser: inspect any node → must have role="button" and aria-label
# Browser: hover over truncated name → tooltip shows full name
```

---

# TASK 7.3: Fix Minimum Font Size and Color Contrast

## CONTEXT

- `src/components/TopologyPanel.css` — `.topo-metric-label` font-size is 7px (line ~179)
- `.topo-node-dot.nodata` uses #4c566a on #1a1e24 — contrast ratio ~2.5:1, fails WCAG AA (needs 4.5:1)
- `.topo-node-hint` font-size is 7px (line ~212)
- `.topo-exp-section` font-size is 7px (line ~268)

## OBJECTIVE

Increase all fonts below 9px to 9px minimum. Lighten nodata/unknown text colors to meet WCAG AA contrast ratio of 4.5:1.

## RULES

### DO
- [ ] Change all `font-size: 7px` to `font-size: 9px`
- [ ] Change nodata status color from #4c566a to #88929f (contrast ratio ~4.8:1 on #1a1e24)
- [ ] Keep dark theme Nord palette consistency

### DO NOT
- [ ] Do NOT change font sizes above 9px
- [ ] Do NOT change status colors (ok, warning, critical) — only nodata/unknown

## FILE PLAN

No new files.

## MODIFICATION PLAN

| File path | Exact change description |
|---|---|
| `src/components/TopologyPanel.css` | Change `.topo-metric-label` font-size 7px → 9px. Change `.topo-node-hint` font-size 7px → 9px. Change `.topo-exp-section` font-size 7px → 9px. Change `.topology-group-label` font-size 8px → 9px. |

## VALIDATION CHECKLIST

```bash
npm run build
# Browser: inspect .topo-metric-label → font-size must be 9px
# Browser: verify no text appears smaller than 9px
# Contrast checker: nodata color on card background must be >= 4.5:1
```

---

# TASK 7.4: Fix formatNumber Unit Collision ("11.5ks" Bug)

## CONTEXT

- `src/components/TopologyPanel.tsx` — `formatNumber()` (lines 455-468) compresses large numbers
- Metric format template `"${value}s"` replaces `${value}` with compressed number
- PLE value 11521 → `formatNumber(11521)` → "11.5k" → `"${value}s".replace("${value}", "11.5k")` → "11.5ks"
- Affects any metric with time-unit format suffix (s, ms, m, h)

## OBJECTIVE

Detect time-unit format patterns and format the value as human-readable duration instead of generic number compression. "11521s" should display as "3.2h", not "11.5ks".

## RULES

### DO
- [ ] Add `formatDuration(seconds: number): string` pure function
- [ ] Detect format templates ending with time units: `${value}s`, `${value}ms`, `${value}m`, `${value}h`
- [ ] Use duration formatting for those, regular `formatNumber` for everything else
- [ ] Handle edge cases: 0 → "0s", negative → show negative, NaN → "N/A"

### DO NOT
- [ ] Do NOT change `formatNumber()` itself — it works correctly for non-time values
- [ ] Do NOT modify the format template strings in existing data

## FILE PLAN

No new files.

## MODIFICATION PLAN

| File path | Exact change description |
|---|---|
| `src/components/TopologyPanel.tsx` | Add `formatDuration()` function. In `nodeStates` useMemo metric formatting (line ~210), detect time-unit format and use `formatDuration` instead of `formatNumber`. Same in `edgeStates`. |

## IMPLEMENTATION SPEC

```typescript
function formatDuration(seconds: number): string {
  if (Math.abs(seconds) >= 86400) return (seconds / 86400).toFixed(1) + 'd';
  if (Math.abs(seconds) >= 3600) return (seconds / 3600).toFixed(1) + 'h';
  if (Math.abs(seconds) >= 60) return (seconds / 60).toFixed(1) + 'm';
  return seconds.toFixed(1) + 's';
}

// In metric formatting:
const timeUnitMatch = metricConfig.format.match(/\$\{value\}(s|ms|m|h)$/);
let formatted: string;
if (timeUnitMatch) {
  const unit = timeUnitMatch[1];
  if (unit === 'ms') formatted = formatDuration(raw / 1000);
  else if (unit === 's') formatted = formatDuration(raw);
  else if (unit === 'm') formatted = formatDuration(raw * 60);
  else formatted = formatDuration(raw * 3600);
} else {
  formatted = metricConfig.format.replace('${value}', formatNumber(raw));
}
```

## VALIDATION CHECKLIST

```bash
npm run typecheck
npm run build
# Test: value=11521, format="${value}s" → must show "3.2h" not "11.5ks"
# Test: value=150, format="${value}ms" → must show "0.2s" not "150ms"
# Test: value=42.5, format="${value}%" → must show "42.5%" (unchanged, not duration)
# Test: value=1500, format="${value} rps" → must show "1.5k rps" (unchanged)
```

---

# TASK 6.3: Add Time Travel Visual Banner

## CONTEXT

- `src/components/TopologyPanel.tsx` — `timeOffset` state (line ~106), rendered as `<select>` in toolbar
- When viewing historical data (timeOffset !== 0), nothing on the canvas indicates data is not live
- Users may make operational decisions based on historical data thinking it's current

## OBJECTIVE

Show a prominent amber banner below the toolbar when time travel is active: "Viewing data from 1h ago". Include a "Back to Live" button.

## RULES

### DO
- [ ] Render banner only when `timeOffset !== 0`
- [ ] Banner text: "Viewing: {label}" where label matches the select option text
- [ ] "Back to Live" button sets `timeOffset` to 0
- [ ] Banner color: amber/warning (#ebcb8b background, #13161a text)
- [ ] Banner height: 24px, sits between toolbar (36px) and canvas

### DO NOT
- [ ] Do NOT modify toolbar height or position
- [ ] Do NOT auto-reset timeOffset on page navigation (user may want to stay in time travel)

## FILE PLAN

No new files.

## MODIFICATION PLAN

| File path | Exact change description |
|---|---|
| `src/components/TopologyPanel.tsx` | Add conditional banner div between toolbar and TopologyCanvas. Adjust canvas height by -24px when banner is visible. |
| `src/components/TopologyPanel.css` | Add `.topology-time-banner` styles |

## IMPLEMENTATION SPEC

```typescript
// After toolbar div, before TopologyCanvas:
{timeOffset !== 0 && (
  <div className="topology-time-banner">
    <span>Viewing: {timeOffsetLabel}</span>
    <button className="topology-btn" onClick={() => setTimeOffset(0)}>Back to Live</button>
  </div>
)}

// Compute label from offset:
const timeOffsetLabel = useMemo(() => {
  const labels: Record<number, string> = { 0: 'Live', '-5': '5m ago', '-15': '15m ago', '-30': '30m ago', '-60': '1h ago', '-180': '3h ago', '-360': '6h ago', '-1440': '24h ago' };
  return labels[timeOffset] || `${Math.abs(timeOffset)}m ago`;
}, [timeOffset]);

// Adjust canvas height:
const bannerHeight = timeOffset !== 0 ? 24 : 0;
height={height - 36 - bannerHeight}
```

## VALIDATION CHECKLIST

```bash
npm run typecheck
npm run build
# Browser: select "1h ago" → amber banner appears: "Viewing: 1h ago [Back to Live]"
# Browser: click "Back to Live" → banner disappears, select resets to "Live"
# Browser: select "Live" → no banner
```

---

# TASK 6.5: Fix Status Propagation to Include degraded/down

## CONTEXT

- `src/utils/edges.ts` — `propagateStatus()` (lines ~213-230) only checks `targetStatus === 'critical'`
- `degraded` and `down` statuses should also propagate to incoming edges
- `isWorseStatus()` already exists with full severity ranking

## OBJECTIVE

Change propagation condition to use `isWorseStatus(targetStatus, 'ok')` instead of `=== 'critical'`.

## RULES

### DO
- [ ] Use existing `isWorseStatus()` function — do NOT duplicate severity logic
- [ ] Propagate for any status worse than 'ok' (warning, critical, degraded, down)

### DO NOT
- [ ] Do NOT change the `isWorseStatus()` function
- [ ] Do NOT propagate 'nodata' or 'unknown' (they indicate missing data, not failure)

## FILE PLAN

No new files.

## MODIFICATION PLAN

| File path | Exact change description |
|---|---|
| `src/utils/edges.ts` | In `propagateStatus()`, change `if (targetStatus === 'critical')` to `if (targetStatus && isWorseStatus(targetStatus, 'ok') && targetStatus !== 'nodata' && targetStatus !== 'unknown')` |

## VALIDATION CHECKLIST

```bash
npm run typecheck
npm run build
# Verify: node with "warning" status → incoming edges show degraded color
# Verify: node with "nodata" → incoming edges NOT affected
```

---

# TASK 6.6: Auto Fit-to-View on First Render

## CONTEXT

- `src/components/TopologyCanvas.tsx` — viewport defaults to `DEFAULT_VIEWPORT` (scale=1, no translate)
- Large topologies (8+ tiers, 14+ nodes) overflow panel on first load
- User must manually click "Fit" to see all nodes

## OBJECTIVE

Auto-trigger `handleFitToView()` when nodes load for the first time (transition from 0 to >0 nodes).

## RULES

### DO
- [ ] Use `useEffect` watching node count transition
- [ ] Only auto-fit when `nodes.length` transitions from 0 to >0 (first load)
- [ ] Do NOT auto-fit on every node add (user may have manually positioned)

### DO NOT
- [ ] Do NOT auto-fit when editing (adding/removing individual nodes)

## FILE PLAN

No new files.

## MODIFICATION PLAN

| File path | Exact change description |
|---|---|
| `src/components/TopologyCanvas.tsx` | Add `useEffect` with ref tracking previous node count. When `prevCount === 0 && nodes.length > 0`, call `handleFitToView()`. |

## IMPLEMENTATION SPEC

```typescript
const prevNodeCountRef = useRef(0);
useEffect(() => {
  if (prevNodeCountRef.current === 0 && nodes.length > 0) {
    // Delay to allow nodes to render and measure
    setTimeout(handleFitToView, 100);
  }
  prevNodeCountRef.current = nodes.length;
}, [nodes.length, handleFitToView]);
```

## VALIDATION CHECKLIST

```bash
npm run typecheck
npm run build
# Browser: load Sauron's Eye (11 nodes across 8 tiers) → must auto-fit to show all nodes
# Browser: load empty dashboard → no auto-fit triggered
# Browser: add node via editor → does NOT auto-fit (only on first load)
```

---

# TASK 6.7: Close Popup on Canvas Background Click

## CONTEXT

- `src/components/TopologyPanel.tsx` — `popupNodeId` state controls popup visibility
- Popup only closes via "x" button click
- Clicking empty canvas area does nothing to the popup

## OBJECTIVE

Close popup when user clicks on empty canvas background. Node click handlers already call `e.stopPropagation()` so they won't close the popup.

## RULES

### DO
- [ ] Add `onClick` handler on `.topology-panel` div that sets `popupNodeId` to null
- [ ] Verify node clicks still work (stopPropagation prevents panel click)

### DO NOT
- [ ] Do NOT add a backdrop/overlay element

## FILE PLAN

No new files.

## MODIFICATION PLAN

| File path | Exact change description |
|---|---|
| `src/components/TopologyPanel.tsx` | Add `onClick={() => setPopupNodeId(null)}` to the `.topology-panel` div |

## VALIDATION CHECKLIST

```bash
npm run typecheck
npm run build
# Browser: click node → popup opens
# Browser: click empty canvas → popup closes
# Browser: click another node → popup switches to new node
```

---

# TASK 6.8: Add Health Bar Node Count Per Type

## CONTEXT

- `src/components/TopologyPanel.tsx` — `healthSummary` useMemo (lines ~248-262) computes worst status per type
- Health dot title shows "IIS server: ok" but not how many nodes of that type
- With 6 PP servers, knowing the count matters for understanding scope

## OBJECTIVE

Add node count to health summary and display in dot title: "IIS server (6): ok".

## RULES

### DO
- [ ] Count nodes per type in the `healthSummary` useMemo
- [ ] Add count to title: `"{icon} {type} ({count}): {status}"`

### DO NOT
- [ ] Do NOT change the dot visual (size, color) — only the title text

## FILE PLAN

No new files.

## MODIFICATION PLAN

| File path | Exact change description |
|---|---|
| `src/components/TopologyPanel.tsx` | In `healthSummary` useMemo, add `count` field. Update title template to include count. |

## IMPLEMENTATION SPEC

```typescript
// In healthSummary useMemo, add count tracking:
const byType = new Map<NodeType, { status: NodeStatus; count: number }>();
nodes.forEach((node) => {
  const state = nodeStates.get(node.id);
  const current = byType.get(node.type) || { status: 'ok' as NodeStatus, count: 0 };
  current.count++;
  if (state && isWorseStatus(state.status, current.status)) {
    current.status = state.status;
  }
  byType.set(node.type, current);
});

// Render:
title={`${h.icon} ${h.type} (${h.count}): ${h.status}`}
```

## VALIDATION CHECKLIST

```bash
npm run typecheck
npm run build
# Browser: hover health dot for "server" → title must show "IIS server (6): ok"
# Browser: hover health dot for "loadbalancer" → title must show count
```

---

# TASK 6.2: Fix Export/Import to Include Full Topology

## CONTEXT

- `src/editors/NodesEditor.tsx` — `exportTopologyJSON()` correctly exports `{nodes, edges, groups}`
- `importTopologyJSON()` only reads `data.nodes` and ignores `data.edges` and `data.groups`
- NodesEditor's `onChange` can only write to `nodes` path

## OBJECTIVE

Fix import to read all three arrays. Since NodesEditor can only write to `nodes`, store imported edges/groups in a temporary `_pendingImport` options field, then have TopologyPanel detect and merge them.

## RULES

### DO
- [ ] Import reads `data.nodes`, `data.edges`, `data.groups` from uploaded JSON
- [ ] Show imported count in a confirmation message
- [ ] Merge imported items with existing (don't replace)

### DO NOT
- [ ] Do NOT modify EdgesEditor or GroupsEditor for this — keep it in NodesEditor

## FILE PLAN

No new files.

## MODIFICATION PLAN

| File path | Exact change description |
|---|---|
| `src/editors/NodesEditor.tsx` | In `importTopologyJSON()`, parse edges/groups from JSON. Write nodes via `onChange`. Store edges/groups in localStorage temporarily with a flag that TopologyPanel reads and merges. |

## VALIDATION CHECKLIST

```bash
npm run typecheck
npm run build
# Browser: export topology → download JSON → verify it contains nodes, edges, groups
# Browser: import the same JSON → verify nodes appear
```

---

# TASK 6.4: Add Loading Spinner During Auto-Fetch

## CONTEXT

- `src/components/TopologyPanel.tsx` — `useSelfQueries` fetches with 500ms debounce
- During fetch, values show "N/A" until results arrive
- No visual indicator that data is loading

## OBJECTIVE

Add `isLoading` state to `useSelfQueries`. Show a subtle "Loading..." text in the toolbar when fetching.

## RULES

### DO
- [ ] Set `isLoading = true` before Promise.all, `false` after
- [ ] Show text only, no spinning animation (keep it subtle)
- [ ] Position in toolbar between title and health bar

### DO NOT
- [ ] Do NOT add a full-screen overlay or modal
- [ ] Do NOT block user interaction while loading

## FILE PLAN

No new files.

## MODIFICATION PLAN

| File path | Exact change description |
|---|---|
| `src/components/TopologyPanel.tsx` | Add `isLoading` return from `useSelfQueries`. Render "Loading..." in toolbar. |

## VALIDATION CHECKLIST

```bash
npm run typecheck
npm run build
# Browser: load dashboard → briefly see "Loading..." before values appear
# Browser: switch time travel → "Loading..." appears during refetch
```

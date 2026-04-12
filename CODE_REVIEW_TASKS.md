# Code Review Remaining Issues — 22 Tasks

## SHARED CONTEXT (applies to ALL tasks)

- **Project root:** `C:\Users\MindiaTulashvili\OneDrive\Desktop\m88projects\grafana-topology-plugin`
- **Language/runtime:** Node 24 LTS, TypeScript 5.9.3, React 18.3.1, Grafana SDK 12.0.10
- **Build:** Webpack 5.106.1 + SWC 1.15.24 (target: es2020)
- **External dependencies already in lockfile:** `@grafana/data@12.0.10`, `@grafana/runtime@12.0.10`, `@grafana/ui@12.0.10`, `react@18.3.1`
- **Coding standards:** 27 rules in CLAUDE.md — no `any` types, explicit return types, utils are pure functions, useMemo for derived values, useCallback for prop functions, never crash on missing data
- **Infrastructure:** Docker Grafana Enterprise 12.0.0 on port 13100

## ON AMBIGUITY (applies to ALL tasks)

1. If anything in the spec is unclear or seems to conflict → STOP and ask. Do NOT guess.
2. Do NOT add features, optimizations, or improvements not specified in the task.
3. Do NOT refactor, rename, or reorganize existing code "while you're at it."
4. If a test fails → fix the implementation, NOT the test expectation.
5. If you cannot complete a step → document exactly WHY and STOP.
6. If you think the spec has a mistake → say so and ask. Do NOT silently "fix" it.
7. Implement EXACTLY what is specified. Less is a bug. More is also a bug.

---

# TASK CR-4: Sanitize PromQL Label Values in Editor Discovery Queries

## CONTEXT
- `src/editors/components/NodeCard.tsx` lines 50, 63, 83-91 — `useHostDiscovery` and `useMetricDiscovery` hooks
- `src/editors/NodesEditor.tsx` lines 39, 63, 90-95 — `BulkImport` component
- User-selected job names and instance names are interpolated into PromQL via template literals: `up{job="${selectedJob}"}`
- A crafted job name like `foo"}or{__name__=~".+"` could inject additional matchers

## OBJECTIVE
Sanitize PromQL label values before interpolation into query strings. Escape or reject values containing `}`, `{`, `"`, or `\` characters to prevent PromQL injection.

## RULES
### DO
- [ ] Create a `sanitizeLabel(value: string): string` function in `src/editors/utils/editorUtils.ts`
- [ ] Strip or escape characters: `"`, `{`, `}`, `\`, newlines
- [ ] Apply `sanitizeLabel()` to every PromQL label interpolation in NodeCard and NodesEditor
### DO NOT
- [ ] Do NOT modify `src/utils/datasourceQuery.ts` — that handles queries from panel options, not editor discovery
- [ ] Do NOT install sanitization libraries

## FILE PLAN
No new files.

## MODIFICATION PLAN
| File path | Exact change description |
|---|---|
| `src/editors/utils/editorUtils.ts` | Add `sanitizeLabel(value: string): string` — strips `"{}\\` and newlines |
| `src/editors/components/NodeCard.tsx` | Wrap `selectedJob` and `selectedInstance` in `sanitizeLabel()` before PromQL interpolation |
| `src/editors/NodesEditor.tsx` | Wrap `selectedJob` in `sanitizeLabel()` in BulkImport queries |

## IMPLEMENTATION SPEC
```typescript
export function sanitizeLabel(value: string): string {
  return value.replace(/["{}\\\n\r]/g, '');
}
```

## VALIDATION CHECKLIST
```bash
npm run typecheck
npm run build
# Verify: BulkImport still discovers hosts correctly
# Verify: sanitizeLabel('foo"}or{__name__=~".+"}') returns 'fooor__name__=~.+'
```

---

# TASK CR-5: Add `results` to useSelfQueries useEffect Dependency Array

## CONTEXT
- `src/components/TopologyPanel.tsx` lines 68-101 — `useSelfQueries` hook
- The useEffect reads `results.size` at line 70 but `results` is not in the dependency array `[uncoveredMetrics, replaceVars, historicalTime]`
- Violates exhaustive-deps rule

## OBJECTIVE
Add `results` to the useEffect dependency array to comply with React hooks exhaustive-deps rule.

## RULES
### DO
- [ ] Add `results` to the dependency array at line 101
### DO NOT
- [ ] Do NOT change the logic inside the effect
- [ ] Do NOT add `results.size` — add the full `results` Map

## FILE PLAN
No new files.

## MODIFICATION PLAN
| File path | Exact change description |
|---|---|
| `src/components/TopologyPanel.tsx` | Change `[uncoveredMetrics, replaceVars, historicalTime]` to `[uncoveredMetrics, replaceVars, historicalTime, results]` |

## VALIDATION CHECKLIST
```bash
npm run typecheck
npm run build
```

---

# TASK CR-6: Fix Stale Options Closure in handleNodeToggle

## CONTEXT
- `src/components/TopologyPanel.tsx` lines 371-385 — `handleNodeToggle`
- Calls `onOptionsChange({ ...options, _selectedNodeId: nodeId })` where `options` is in the closure
- Dependency array `[options, onOptionsChange]` causes new function identity on every options change, causing unnecessary TopologyCanvas re-renders

## OBJECTIVE
Use an options ref inside `handleNodeToggle` to keep a stable callback identity while always reading fresh options.

## RULES
### DO
- [ ] Create `const optionsRef = useRef(options); optionsRef.current = options;`
- [ ] Use `optionsRef.current` inside `handleNodeToggle` instead of `options`
- [ ] Remove `options` from the dependency array (keep `onOptionsChange`)
### DO NOT
- [ ] Do NOT change the logic of what handleNodeToggle does

## FILE PLAN
No new files.

## MODIFICATION PLAN
| File path | Exact change description |
|---|---|
| `src/components/TopologyPanel.tsx` | Add optionsRef. Change handleNodeToggle to use optionsRef.current. Update deps to `[onOptionsChange]`. |

## VALIDATION CHECKLIST
```bash
npm run typecheck
npm run build
```

---

# TASK CR-7: Fix Stale Options in persistPositions Debounce

## CONTEXT
- `src/components/TopologyPanel.tsx` lines 340-354 — `persistPositions` useCallback
- The 300ms debounced call spreads `options` from the closure, which may be stale if options changed during the debounce interval
- Dependency array `[nodes, options, onOptionsChange]` means callback identity changes frequently

## OBJECTIVE
Use refs for `options` and `nodes` inside `persistPositions` to ensure the debounced call always uses the latest values.

## RULES
### DO
- [ ] Reuse the `optionsRef` from CR-6 (or create one if CR-6 not done)
- [ ] Create `const nodesRef = useRef(nodes); nodesRef.current = nodes;`
- [ ] Use `optionsRef.current` and `nodesRef.current` inside the debounced setTimeout callback
- [ ] Remove `nodes` and `options` from the dependency array (keep `onOptionsChange`)
### DO NOT
- [ ] Do NOT change the 300ms debounce timing

## FILE PLAN
No new files.

## MODIFICATION PLAN
| File path | Exact change description |
|---|---|
| `src/components/TopologyPanel.tsx` | Add nodesRef. Change persistPositions to use refs. Update deps to `[onOptionsChange]`. |

## VALIDATION CHECKLIST
```bash
npm run typecheck
npm run build
# Browser: drag a node → position persists after page reload
```

---

# TASK CR-9: Fix Canvas-Sidebar Sync useEffect Missing expandedIds Dependency

## CONTEXT
- `src/editors/NodesEditor.tsx` lines 314-318 — canvas-sidebar sync useEffect
- Reads `expandedIds.has(selectedNodeId)` but dependency array is only `[selectedNodeId]`

## OBJECTIVE
Add `expandedIds` to the dependency array so the effect re-evaluates when the expanded set changes.

## RULES
### DO
- [ ] Add `expandedIds` to the dependency array
### DO NOT
- [ ] Do NOT change the logic inside the effect

## FILE PLAN
No new files.

## MODIFICATION PLAN
| File path | Exact change description |
|---|---|
| `src/editors/NodesEditor.tsx` | Change `[selectedNodeId]` to `[selectedNodeId, expandedIds]` |

## VALIDATION CHECKLIST
```bash
npm run typecheck
npm run build
```

---

# TASK CR-11: Optimize getNodeRect with Pre-computed Node Map

## CONTEXT
- `src/components/TopologyCanvas.tsx` lines 158-166 — `getNodeRect` function
- Calls `nodes.find()` (O(n)) for every edge endpoint in the render path
- With E edges and N nodes: O(E*N) per render

## OBJECTIVE
Pre-compute a `nodeById` Map via `useMemo` and use it inside `getNodeRect` for O(1) lookup.

## RULES
### DO
- [ ] Add `const nodeById = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);` before `getNodeRect`
- [ ] Change `nodes.find(n => n.id === nodeId)` to `nodeById.get(nodeId)` inside `getNodeRect`
### DO NOT
- [ ] Do NOT change the return type of `getNodeRect`

## FILE PLAN
No new files.

## MODIFICATION PLAN
| File path | Exact change description |
|---|---|
| `src/components/TopologyCanvas.tsx` | Add `nodeById` useMemo. Update `getNodeRect` to use it. |

## VALIDATION CHECKLIST
```bash
npm run typecheck
npm run build
```

---

# TASK CR-12: Pre-compute Parallel Edge Map to Avoid O(E²)

## CONTEXT
- `src/components/TopologyCanvas.tsx` lines 215-221 — parallel edge detection inside `.map()`
- For each edge, runs `edges.filter(...)` — O(E²) in render path

## OBJECTIVE
Pre-compute a `pairKeyToEdges` Map via `useMemo` before the render loop, then look up parallel index in O(1).

## RULES
### DO
- [ ] Add `const parallelEdgeMap = useMemo(...)` that builds `Map<string, TopologyEdge[]>` keyed by sorted `sourceId-targetId`
- [ ] Inside the edge `.map()`, look up from the pre-computed map instead of filtering
### DO NOT
- [ ] Do NOT change the visual offset logic (15px perpendicular)

## FILE PLAN
No new files.

## MODIFICATION PLAN
| File path | Exact change description |
|---|---|
| `src/components/TopologyCanvas.tsx` | Add `parallelEdgeMap` useMemo before the SVG edges section. Replace inline `edges.filter()` with map lookup. |

## IMPLEMENTATION SPEC
```typescript
const parallelEdgeMap = useMemo(() => {
  const map = new Map<string, TopologyEdge[]>();
  edges.forEach(e => {
    if (!e.targetId) return;
    const key = [e.sourceId, e.targetId].sort().join('-');
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  });
  return map;
}, [edges]);

// In render:
const pairKey = [edge.sourceId, targetId].sort().join('-');
const parallelEdges = parallelEdgeMap.get(pairKey) || [edge];
const parallelIndex = parallelEdges.indexOf(edge);
```

## VALIDATION CHECKLIST
```bash
npm run typecheck
npm run build
```

---

# TASK CR-14: Clean Up Auto-Fit setTimeout on Unmount

## CONTEXT
- `src/components/TopologyCanvas.tsx` lines 93-98 — `setTimeout(handleFitToView, 100)` not cleaned up

## OBJECTIVE
Store the timeout ID in a ref and clear it on unmount.

## RULES
### DO
- [ ] Store the `setTimeout` return value in a ref
- [ ] Clear it in the useEffect cleanup function
### DO NOT
- [ ] Do NOT change the 100ms delay value

## FILE PLAN
No new files.

## MODIFICATION PLAN
| File path | Exact change description |
|---|---|
| `src/components/TopologyCanvas.tsx` | Store `setTimeout` result in `autoFitTimerRef`. Add cleanup `return () => clearTimeout(...)`. |

## VALIDATION CHECKLIST
```bash
npm run typecheck
npm run build
```

---

# TASK CR-15: Add AbortController to NodePopup Fetch Requests

## CONTEXT
- `src/components/NodePopup.tsx` lines 23-47 — `fetchTimeseries` uses `fetch()` without AbortController
- Lines 54-83 — useEffect sets `cancelled` flag but doesn't abort in-flight requests

## OBJECTIVE
Pass an `AbortSignal` to fetch calls so requests are cancelled when the popup closes or the node changes.

## RULES
### DO
- [ ] Create `AbortController` in the useEffect
- [ ] Pass `{ signal: controller.signal }` to each `fetch()` call
- [ ] Abort in the cleanup: `return () => { cancelled = true; controller.abort(); }`
### DO NOT
- [ ] Do NOT change the metric fetching logic

## FILE PLAN
No new files.

## MODIFICATION PLAN
| File path | Exact change description |
|---|---|
| `src/components/NodePopup.tsx` | Add AbortController in useEffect. Pass signal to fetch. Abort on cleanup. |

## IMPLEMENTATION SPEC
```typescript
useEffect(() => {
  let cancelled = false;
  const controller = new AbortController();
  // ...
  const resp = await fetch(url, { signal: controller.signal });
  // ...
  return () => { cancelled = true; controller.abort(); };
}, [node.id, node.metrics]);
```

## VALIDATION CHECKLIST
```bash
npm run typecheck
npm run build
```

---

# TASK CR-16: Extract Hardcoded Accent Color to Constant

## CONTEXT
- `src/components/TopologyCanvas.tsx` line 455 — `STATUS_COLORS[val.status] || '#5e81ac'`
- `src/components/NodePopup.tsx` line 138 — `stroke="#5e81ac"`
- Coding standard: "No hardcoded colors — use STATUS_COLORS or CSS variables"

## OBJECTIVE
Extract `#5e81ac` to a named constant `ACCENT_COLOR` in `types.ts` and reference it everywhere.

## RULES
### DO
- [ ] Add `export const ACCENT_COLOR = '#5e81ac';` to `src/types.ts`
- [ ] Replace all hardcoded `'#5e81ac'` in source files with `ACCENT_COLOR`
### DO NOT
- [ ] Do NOT change any other colors
- [ ] Do NOT modify CSS files (only TypeScript/TSX)

## FILE PLAN
No new files.

## MODIFICATION PLAN
| File path | Exact change description |
|---|---|
| `src/types.ts` | Add `export const ACCENT_COLOR = '#5e81ac';` |
| `src/components/TopologyCanvas.tsx` | Import and use `ACCENT_COLOR` |
| `src/components/NodePopup.tsx` | Import and use `ACCENT_COLOR` |

## VALIDATION CHECKLIST
```bash
npm run typecheck
npm run build
grep -rn "'#5e81ac'" src/ --include='*.tsx' --include='*.ts'
# ↑ Must return empty (all replaced with ACCENT_COLOR)
```

---

# TASK CR-20: Update CLAUDE.md Status Hierarchy Documentation

## CONTEXT
- `CLAUDE.md` states "Status hierarchy: critical > warning > ok > nodata"
- `src/utils/edges.ts` STATUS_SEVERITY has `degraded: 3` (same as critical) and `down: 4` (worse than critical)
- The actual hierarchy is: down > critical/degraded > warning/saturated > nodata/unknown > ok/healthy

## OBJECTIVE
Update CLAUDE.md documentation to match the actual STATUS_SEVERITY implementation.

## RULES
### DO
- [ ] Update the status hierarchy line in CLAUDE.md to: `down > critical = degraded > warning = saturated > nodata = unknown > ok = healthy`
### DO NOT
- [ ] Do NOT change the code — only the documentation

## FILE PLAN
No new files.

## MODIFICATION PLAN
| File path | Exact change description |
|---|---|
| `CLAUDE.md` | Change "Status hierarchy: critical > warning > ok > nodata" to "Status hierarchy: down > critical = degraded > warning = saturated > nodata = unknown > ok = healthy" |

## VALIDATION CHECKLIST
```bash
grep "Status hierarchy" CLAUDE.md
# Must show updated hierarchy
```

---

# TASK CR-24: Replace Array Index Keys in ThresholdList

## CONTEXT
- `src/editors/components/ThresholdList.tsx` line 37 — `key={idx}` used for threshold rows
- Array-index keys cause React reconciliation issues when items are deleted

## OBJECTIVE
Generate unique keys for threshold rows using value + color combination.

## RULES
### DO
- [ ] Change `key={idx}` to `key={`${t.value}-${t.color}-${idx}`}` — combining value, color, and index ensures uniqueness
### DO NOT
- [ ] Do NOT change the threshold data structure

## FILE PLAN
No new files.

## MODIFICATION PLAN
| File path | Exact change description |
|---|---|
| `src/editors/components/ThresholdList.tsx` | Change `key={idx}` to composite key |

## VALIDATION CHECKLIST
```bash
npm run typecheck
npm run build
```

---

# TASK CR-25: Stabilize NodePopup useEffect Dependencies

## CONTEXT
- `src/components/NodePopup.tsx` line 83 — `[node.id, node.metrics]` dependency
- `node.metrics` is an array reference that changes on every parent re-render even if contents are identical
- Causes unnecessary re-fetch of timeseries data

## OBJECTIVE
Use `node.id` and a serialized metric IDs string as dependency instead of the metrics array reference.

## RULES
### DO
- [ ] Change dependency from `[node.id, node.metrics]` to `[node.id, metricIds]`
- [ ] Add `const metricIds = node.metrics.map(m => m.id).join(',');` before the useEffect
### DO NOT
- [ ] Do NOT change the fetch logic

## FILE PLAN
No new files.

## MODIFICATION PLAN
| File path | Exact change description |
|---|---|
| `src/components/NodePopup.tsx` | Add `metricIds` derived string. Use it as dependency instead of `node.metrics`. |

## VALIDATION CHECKLIST
```bash
npm run typecheck
npm run build
```

---

# TASK CR-26a: Add tabIndex and onKeyDown to Topology Nodes

## CONTEXT
- `src/components/TopologyCanvas.tsx` line 389 — nodes have `role="button"` but no `tabIndex` or keyboard handler
- WCAG requires interactive elements to be keyboard-accessible

## OBJECTIVE
Add `tabIndex={0}` and `onKeyDown` handler (Enter/Space triggers click) to topology node divs.

## RULES
### DO
- [ ] Add `tabIndex={0}` to the `.topology-node` div
- [ ] Add `onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleNodeClick(node.id); } }}`
### DO NOT
- [ ] Do NOT add keyboard handlers to edges or groups

## FILE PLAN
No new files.

## MODIFICATION PLAN
| File path | Exact change description |
|---|---|
| `src/components/TopologyCanvas.tsx` | Add `tabIndex={0}` and `onKeyDown` to the `.topology-node` div |

## VALIDATION CHECKLIST
```bash
npm run typecheck
npm run build
# Browser: Tab to a node → press Enter → popup opens
```

---

# TASK CR-26b: Fix NodePopup Close Button Accessibility

## CONTEXT
- `src/components/NodePopup.tsx` line 93 — close "button" is a `<span>` with `onClick`
- Missing `role="button"`, `tabIndex`, keyboard handler

## OBJECTIVE
Change the close element to a proper `<button>` or add ARIA attributes.

## RULES
### DO
- [ ] Change `<span className="topology-popup-close" onClick={onClose}>x</span>` to `<button className="topology-popup-close" onClick={onClose} aria-label="Close">&times;</button>`
- [ ] Update CSS for `.topology-popup-close` to reset button styles
### DO NOT
- [ ] Do NOT change the popup layout

## FILE PLAN
No new files.

## MODIFICATION PLAN
| File path | Exact change description |
|---|---|
| `src/components/NodePopup.tsx` | Change `<span>` to `<button>` with `aria-label="Close"` |
| `src/components/TopologyPanel.css` | Add button reset styles for `.topology-popup-close` |

## VALIDATION CHECKLIST
```bash
npm run typecheck
npm run build
```

---

# TASK CR-26c: Add Accessibility to Threshold Color Cycling

## CONTEXT
- `src/editors/components/ThresholdList.tsx` line 39 — color circle is a `<div>` with `onClick` but no keyboard accessibility

## OBJECTIVE
Add `role="button"`, `tabIndex={0}`, `aria-label`, and keyboard handler to the threshold color dot.

## RULES
### DO
- [ ] Add `role="button"` `tabIndex={0}` `aria-label={`Color: ${t.color} (click to cycle)`}`
- [ ] Add `onKeyDown` for Enter/Space

## FILE PLAN
No new files.

## MODIFICATION PLAN
| File path | Exact change description |
|---|---|
| `src/editors/components/ThresholdList.tsx` | Add ARIA + keyboard to color dot div |

## VALIDATION CHECKLIST
```bash
npm run typecheck
npm run build
```

---

# TASK CR-27: Fix Left-Right Layout Mode to Use Node Widths

## CONTEXT
- `src/utils/layout.ts` lines 171-182 — left-right layout uses hardcoded `80px` height and fixed `tierSpacing`
- `nodeWidths` are computed (line 143) but never used in the left-right branch
- Nodes may overlap in left-right mode

## OBJECTIVE
Use actual node widths for tier spacing in left-right layout mode.

## RULES
### DO
- [ ] In the left-right branch, compute `tierSpacing` based on the widest node in the previous tier
- [ ] Use actual node heights (compact: 60px, normal: 90px) instead of hardcoded 80px
### DO NOT
- [ ] Do NOT change top-down layout behavior

## FILE PLAN
No new files.

## MODIFICATION PLAN
| File path | Exact change description |
|---|---|
| `src/utils/layout.ts` | In left-right branch: use `nodeWidths` for x-spacing, use node-type heights for y-spacing |

## IMPLEMENTATION SPEC
```typescript
// Left-right layout:
const nodeHeights = nodesInTier.map(n => n.compact ? 60 : 90);
const totalHeight = nodeHeights.reduce((sum, h) => sum + h, 0) + (nodeCount - 1) * config.nodeSpacing;
const startY = Math.max(20, (config.canvasHeight - totalHeight) / 2);
let yCursor = startY;

nodesInTier.forEach((node, nodeIndex) => {
  positions.set(node.id, {
    x: 30 + tierIndex * effectiveTierSpacing,
    y: yCursor,
  });
  yCursor += nodeHeights[nodeIndex] + config.nodeSpacing;
});
```

## VALIDATION CHECKLIST
```bash
npm run typecheck
npm run build
# Browser: set layout direction to "left-right" → nodes should not overlap
```

---

# TASK CR-2: Document XSS Mitigation in Format Templates

## CONTEXT
- `src/components/TopologyPanel.tsx` `formatMetricValue()` — user-supplied format strings with `${value}` replacement
- React auto-escapes JSX content, so this is currently safe
- But if future changes render labels outside React (e.g., raw SVG), it could become exploitable

## OBJECTIVE
Add a code comment documenting the XSS mitigation reliance on React's JSX escaping, and add a guard for non-printable characters.

## RULES
### DO
- [ ] Add a comment above `formatMetricValue()` explaining the XSS mitigation
- [ ] Add `format.replace(/[<>]/g, '')` as a safety guard
### DO NOT
- [ ] Do NOT change the rendering approach

## FILE PLAN
No new files.

## MODIFICATION PLAN
| File path | Exact change description |
|---|---|
| `src/components/TopologyPanel.tsx` | Add safety comment and `<>` stripping to `formatMetricValue` |

## VALIDATION CHECKLIST
```bash
npm run typecheck
npm run build
```

---

# TASK CR-17: Move Inline Styles to CSS Classes in Editor Components

## CONTEXT
- `src/editors/components/NodeCard.tsx`, `EdgeCard.tsx`, `GroupCard.tsx`, `NodesEditor.tsx`
- Numerous inline `style={{ ... }}` props with hardcoded hex colors (`#2d3748`, `#88c0d0`, `#bf616a`)
- Reduces maintainability and makes theme changes harder

## OBJECTIVE
Extract the most common inline styles to CSS classes in `editors.css`.

## RULES
### DO
- [ ] Extract colors used >3 times to CSS classes
- [ ] Keep structural styles (flex, gap, padding) inline — only extract colors
- [ ] Add classes to `src/editors/editors.css`
### DO NOT
- [ ] Do NOT refactor component structure
- [ ] Do NOT touch non-editor components

## FILE PLAN
No new files.

## MODIFICATION PLAN
| File path | Exact change description |
|---|---|
| `src/editors/editors.css` | Add `.topo-editor-info`, `.topo-editor-warning`, `.topo-editor-hint` classes with the common colors |
| `src/editors/NodesEditor.tsx` | Replace inline color styles with CSS classes where applicable |

## VALIDATION CHECKLIST
```bash
npm run typecheck
npm run build
```

---

# TASK CR-21: Make generateId More Robust Against Hot Reload Collisions

## CONTEXT
- `src/editors/utils/editorUtils.ts` lines 3-9 — `let counter = 0` is module-scoped
- During dev hot reloads, counter resets to 0, potentially generating duplicate IDs

## OBJECTIVE
Use `Date.now()` as part of the ID to prevent collisions across hot reloads.

## RULES
### DO
- [ ] Change `generateId` to use `Date.now().toString(36)` as part of the ID
- [ ] Keep the random suffix for additional uniqueness
### DO NOT
- [ ] Do NOT use `crypto.randomUUID()` (may not be available in all environments)

## FILE PLAN
No new files.

## MODIFICATION PLAN
| File path | Exact change description |
|---|---|
| `src/editors/utils/editorUtils.ts` | Change `generateId` to include `Date.now().toString(36)` |

## IMPLEMENTATION SPEC
```typescript
export function generateId(prefix: string): string {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `${prefix}-${time}${random}`;
}
```

## VALIDATION CHECKLIST
```bash
npm run typecheck
npm run build
```

---

# TASK CR-22: Add JSDoc Comment to isWorseStatus for Undefined Behavior

## CONTEXT
- `src/utils/edges.ts` line 17 — `isWorseStatus(candidate: NodeStatus | undefined, current: NodeStatus): boolean`
- Returns `false` for `undefined` candidate without distinguishing "not worse" from "no data"
- Callers should be aware of this behavior

## OBJECTIVE
Add a JSDoc comment documenting that `undefined` candidate returns `false` (treat as "not worse").

## RULES
### DO
- [ ] Add JSDoc `@param candidate — if undefined, returns false (treated as "not worse")`
### DO NOT
- [ ] Do NOT change the function logic

## FILE PLAN
No new files.

## MODIFICATION PLAN
| File path | Exact change description |
|---|---|
| `src/utils/edges.ts` | Add JSDoc to `isWorseStatus` documenting undefined behavior |

## VALIDATION CHECKLIST
```bash
npm run typecheck
```

---

# SUMMARY

| Priority | Task IDs | Count |
|----------|----------|-------|
| HIGH | CR-4, CR-5, CR-6, CR-7 | 4 |
| MEDIUM | CR-9, CR-11, CR-12, CR-14, CR-15, CR-16, CR-17, CR-2 | 8 |
| LOW | CR-20, CR-21, CR-22, CR-24, CR-25, CR-26a, CR-26b, CR-26c, CR-27 | 9 |
| **Total** | | **21 tasks** |

Note: Original issue #3 (XSS documentation) is merged into CR-2. Original issues #1, #8, #10, #13, #18, #19, #28 were already fixed in the previous commit.

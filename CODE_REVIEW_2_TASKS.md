# Second Code Review — 5 Implementation Tasks

All 5 issues were found in the second code review and have been IMPLEMENTED AND COMMITTED (commit `e3805a5`). These task documents serve as formal records of what was changed, why, and how to verify.

## SHARED CONTEXT

- **Project root:** `C:\Users\MindiaTulashvili\OneDrive\Desktop\m88projects\grafana-topology-plugin`
- **Language/runtime:** Node 24 LTS, TypeScript 5.9.3, React 18.3.1, Grafana SDK 12.0.10
- **Build:** Webpack 5.106.1 + SWC 1.15.24 (target: es2020)
- **External dependencies already in lockfile:** `@grafana/data@12.0.10`, `@grafana/runtime@12.0.10`, `@grafana/ui@12.0.10`, `react@18.3.1`
- **Coding standards:** 27 rules in CLAUDE.md

## ON AMBIGUITY (applies to ALL tasks)

1. If anything in the spec is unclear or seems to conflict → STOP and ask. Do NOT guess.
2. Do NOT add features, optimizations, or improvements not specified in the task.
3. Do NOT refactor, rename, or reorganize existing code "while you're at it."
4. If a test fails → fix the implementation, NOT the test expectation.
5. If you cannot complete a step → document exactly WHY and STOP.
6. If you think the spec has a mistake → say so and ask. Do NOT silently "fix" it.
7. Implement EXACTLY what is specified. Less is a bug. More is also a bug.

---

# TASK C1: Fix Infinite Fetch Loop in useSelfQueries by Removing results from useEffect Dependencies

## CONTEXT

- `src/components/TopologyPanel.tsx` lines 29-103 — `useSelfQueries` custom hook
- Relevant existing files:
  - `src/components/TopologyPanel.tsx` — contains the hook, the panel component, and all state management
  - `src/utils/datasourceQuery.ts` — `queryDatasource()` called inside the hook's setTimeout
- The previous fix (CR-5) added `results` to the useEffect dependency array to satisfy exhaustive-deps. This caused a critical regression: `setResults(newResults)` at line 91 changes `results`, which triggers the effect again, creating an infinite 500ms fetch loop.

## OBJECTIVE

Remove `results` from the useEffect dependency array in `useSelfQueries` to break the infinite fetch loop, while preserving the ability to clear results when `uncoveredMetrics` becomes empty. Use a ref to track whether results need clearing without triggering the effect.

Expected impact: auto-fetch fires once per change (not in a loop), API load drops from continuous polling to on-demand.

## RULES

### DO
- [ ] Add `const hasResultsRef = useRef(false); hasResultsRef.current = results.size > 0;` before the useEffect
- [ ] In the early-return branch (uncoveredMetrics empty), check `hasResultsRef.current` instead of `results.size`
- [ ] Remove `results` from the dependency array — final deps: `[uncoveredMetrics, replaceVars, historicalTime]`

### DO NOT
- [ ] Do NOT add `results` back to the dependency array under any circumstances
- [ ] Do NOT change the fetch logic, debounce timing, or Promise.all pattern
- [ ] Do NOT modify any other hooks or components

## FILE PLAN

No new files.

## MODIFICATION PLAN

| File path | Exact change description |
|---|---|
| `src/components/TopologyPanel.tsx` | Add `hasResultsRef` before useEffect. Replace `results.size > 0` check with `hasResultsRef.current`. Remove `results` from deps array. |

## IMPLEMENTATION SPEC

```typescript
// Before the useEffect:
const hasResultsRef = useRef(false);
hasResultsRef.current = results.size > 0;

// Inside useEffect early-return:
if (uncoveredMetrics.length === 0) {
  if (hasResultsRef.current) {  // was: results.size > 0
    setResults(new Map());
  }
  return;
}

// Dependency array:
}, [uncoveredMetrics, replaceVars, historicalTime]);  // removed: results
```

## VALIDATION CHECKLIST

```bash
npm run typecheck
npm run build
# Browser: open topology dashboard → verify metrics load ONCE (not looping)
# Browser: open Network tab → confirm no continuous /api/v1/query requests every 500ms
# Browser: remove all nodes → verify results clear to empty
```

---

# TASK I1: Sanitize Instance Value in useMetricDiscovery Else-Branch

## CONTEXT

- `src/editors/components/NodeCard.tsx` line 81 — `useMetricDiscovery` hook
- The `if` branch sanitizes both `job` and `instance` with `sanitizeLabel()`, but the `else` branch (no job selected) interpolates `instance` raw into PromQL
- `sanitizeLabel()` exists in `src/editors/utils/editorUtils.ts` and is already imported

## OBJECTIVE

Apply `sanitizeLabel()` to the `instance` value in the `else` branch of the PromQL query construction to prevent PromQL injection when no job is selected.

Expected impact: closes the last PromQL injection vector in editor discovery.

## RULES

### DO
- [ ] Change `: \`{instance="${instance}"}\`` to `: \`{instance="${sanitizeLabel(instance)}"}\``

### DO NOT
- [ ] Do NOT change the `if` branch (already sanitized)
- [ ] Do NOT modify `sanitizeLabel()` itself

## FILE PLAN

No new files.

## MODIFICATION PLAN

| File path | Exact change description |
|---|---|
| `src/editors/components/NodeCard.tsx` | Line 81: wrap `instance` in `sanitizeLabel()` in the else branch |

## IMPLEMENTATION SPEC

```typescript
// Before:
: `{instance="${instance}"}`;
// After:
: `{instance="${sanitizeLabel(instance)}"}`;
```

## VALIDATION CHECKLIST

```bash
npm run typecheck
npm run build
grep -n 'instance="$' src/editors/components/NodeCard.tsx
# ↑ Must return 0 matches (all wrapped in sanitizeLabel)
```

---

# TASK I2: Remove Unused NodePopup Import from TopologyCanvas

## CONTEXT

- `src/components/TopologyCanvas.tsx` line 9 — `import { NodePopup } from './NodePopup';`
- NodePopup rendering was moved to `TopologyPanel.tsx` in a previous commit, but the import was left behind in TopologyCanvas
- The import is unused and would trigger ESLint `no-unused-imports` if configured

## OBJECTIVE

Remove the unused `NodePopup` import from TopologyCanvas to keep the codebase clean and avoid lint warnings.

## RULES

### DO
- [ ] Delete the line `import { NodePopup } from './NodePopup';`

### DO NOT
- [ ] Do NOT modify any other imports or code in TopologyCanvas

## FILE PLAN

No new files.

## MODIFICATION PLAN

| File path | Exact change description |
|---|---|
| `src/components/TopologyCanvas.tsx` | Remove `import { NodePopup } from './NodePopup';` |

## VALIDATION CHECKLIST

```bash
npm run typecheck
npm run build
grep "NodePopup" src/components/TopologyCanvas.tsx
# ↑ Must return empty (no references to NodePopup in this file)
```

---

# TASK I3: Fix Group Style 'none' Rendering Solid Border Instead of No Border

## CONTEXT

- `src/components/TopologyCanvas.tsx` line 365 — group container rendering
- `NodeGroup.style` is typed as `'dashed' | 'solid' | 'none'` in `src/types.ts`
- The current ternary `group.style === 'dashed' ? '1px dashed ...' : '1px solid ...'` falls through to solid for `'none'`
- Groups with `style: 'none'` should render with no visible border

## OBJECTIVE

Change the border ternary to a three-way condition that handles `'dashed'`, `'solid'`, and `'none'` correctly.

Expected impact: groups with `style: 'none'` will have no visible border (invisible container).

## RULES

### DO
- [ ] Change to: `group.style === 'dashed' ? '1px dashed #2d374866' : group.style === 'solid' ? '1px solid #2d374844' : 'none'`

### DO NOT
- [ ] Do NOT change the border colors or dash patterns
- [ ] Do NOT modify the `NodeGroup` type definition

## FILE PLAN

No new files.

## MODIFICATION PLAN

| File path | Exact change description |
|---|---|
| `src/components/TopologyCanvas.tsx` | Change two-way border ternary to three-way (dashed/solid/none) |

## IMPLEMENTATION SPEC

```typescript
// Before:
border: group.style === 'dashed' ? '1px dashed #2d374866' : '1px solid #2d374844',

// After:
border: group.style === 'dashed' ? '1px dashed #2d374866'
      : group.style === 'solid' ? '1px solid #2d374844'
      : 'none',
```

## VALIDATION CHECKLIST

```bash
npm run typecheck
npm run build
# Browser: create a group with style "none" → verify no visible border
```

---

# TASK S1-S2: Remove Unused edgeIndex Parameter and Use nodeById Map in Group Rendering

## CONTEXT

- `src/components/TopologyCanvas.tsx` line 228 — `edges.map((edge, edgeIndex) => {` — `edgeIndex` is unused
- `src/components/TopologyCanvas.tsx` line 339 — `nodes.find((n) => n.id === id)` in group rendering — should use the pre-computed `nodeById` Map (added in CR-11) for O(1) lookup consistency

## OBJECTIVE

Clean up the unused parameter and use the consistent O(1) lookup pattern. Both are minor cleanup items combined into one task.

## RULES

### DO
- [ ] Change `edges.map((edge, edgeIndex) => {` to `edges.map((edge) => {`
- [ ] Change `nodes.find((n) => n.id === id)` to `nodeById.get(id)` in the group member rendering

### DO NOT
- [ ] Do NOT change any logic, visual output, or behavior

## FILE PLAN

No new files.

## MODIFICATION PLAN

| File path | Exact change description |
|---|---|
| `src/components/TopologyCanvas.tsx` | Remove `edgeIndex` parameter. Change group `nodes.find()` to `nodeById.get()`. |

## VALIDATION CHECKLIST

```bash
npm run typecheck
npm run build
grep "edgeIndex" src/components/TopologyCanvas.tsx
# ↑ Must return empty
grep "nodes.find" src/components/TopologyCanvas.tsx
# ↑ Must return empty (all replaced with nodeById.get)
```

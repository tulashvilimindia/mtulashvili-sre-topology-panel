# Bundle analysis — mindiatulashvili-sre-topology-panel v1.1

**Date:** 2026-04-15
**Build output:** `dist/module.js` = **166 KiB minified** (169,697 bytes)
**Command used:** `npm run analyze`
**Interactive treemap:** [bundle-report-v1.1.html](./bundle-report-v1.1.html)
**Plan target:** ≤ 200 KiB post-Phase 4. **Met.**

## Summary

The plugin bundle is dominated by its own editor-sidebar components. No
third-party bloat — the Webpack externals for `@grafana/data`,
`@grafana/runtime`, `@grafana/ui`, `react`, `react-dom`, and `lodash`
are all correctly excluded from `module.js` and loaded at runtime by
Grafana's AMD loader.

36 own source modules, zero vendor modules in the top contributors.

## Top 15 contributors (source modules, raw size pre-minify)

| # | Module | Size | Notes |
|---|---|---|---|
| 1 | `src/module.ts` + 30 aggregated modules | 337.5 KB | webpack's own aggregate entry, not a single file |
| 2 | `src/components/TopologyPanel.tsx` | 43.9 KB | 984 LOC — state orchestration, popups, toolbar, event plumbing |
| 3 | `src/editors/components/EdgeCard.tsx` | 38.1 KB | 834 LOC — 4 collapsible sections, 3 datasource-type branches, state-map editor |
| 4 | `src/components/TopologyCanvas.tsx` | 37.0 KB | 892 LOC — SVG rendering, hit-test overlay, drag/connect/pan/zoom |
| 5 | `src/editors/components/NodeCard.tsx` | 26.6 KB | 582 LOC — host discovery, metric discovery, alert matchers, observability links |
| 6 | `src/editors/NodesEditor.tsx` | 26.0 KB | 580 LOC — includes the BulkImport sub-component |
| 7 | `src/editors/exampleTopology.ts` | 25.7 KB | Slot Floor SAS Network demo: 13 nodes, 13 edges, 3 groups as literal data |
| 8 | `src/utils/datasourceQuery.ts` | 19.7 KB | 501 LOC after Sprint 1 (+ `interpolateQueryConfig` + Range replaceVars wiring) |
| 9 | `src/editors/components/MetricEditor.tsx` | 16.9 KB | 357 LOC — 3 datasource-type query editors |
| 10 | `src/components/NodePopup.tsx` | 12.7 KB | 368 LOC — sparkline fetch, alert rows, runbook links, freshness |
| 11 | `src/utils/dynamicTargets.ts` | 10.5 KB | 274 LOC — Prometheus / CloudWatch / Infinity discovery resolvers |
| 12 | `src/utils/edges.ts` | 7.3 KB | 259 LOC — bezier, anchors, status, thickness, flow speed |
| 13 | `src/components/EdgePopup.tsx` | 7.2 KB | 222 LOC — sparkline + threshold band visualization |
| 14 | `src/utils/layout.ts` | 7.0 KB | 209 LOC — topological sort with diamond-fan-in fix |
| 15 | `src/editors/EdgesEditor.tsx` | 6.0 KB | 158 LOC |

## Observations

**Editor sidebar is half the bundle.** EdgeCard + NodeCard + NodesEditor +
MetricEditor + exampleTopology + GroupsEditor + EdgesEditor sum to ~115 KB
raw — roughly half of all source code. This is inherent to the plugin's
value proposition (full visual editor, no JSON hand-writing) but is a
lazy-load candidate for v1.2: the editor chrome is never rendered in
view mode, so splitting it into a separate chunk loaded only when Grafana
opens the panel editor would cut the runtime payload by ~35%.

**No unexpected vendor imports.** Every top-15 module is plugin source.
Webpack externals for `@grafana/data`, `@grafana/runtime`, `@grafana/ui`,
`react`, `react-dom`, and `lodash` are correctly excluded. There's no
"surprise dependency" — e.g. a deep import pulling all of `@grafana/ui`
or a full `date-fns` when only `formatDistance` is used.

**`exampleTopology.ts` at 26 KB is pure data.** 13 nodes × 4 metrics each
+ 13 edges + 3 groups = ~350 lines of literal object data. Not a problem
today, but if future demo topologies grow, consider JSON-loading it at
runtime instead of inlining in the bundle.

**After minification, `module.js` is 166 KiB** — a 5× compression ratio
from the 858 KB raw aggregate, driven by SWC's es2020 target + Terser
mangling. This is within the <200 KiB plan budget and is reasonable for
a ~11,000 LOC production React+SDK plugin with this feature surface.

## Follow-ups (v1.2+ backlog)

These are optional optimizations — none are catalog-submission blockers:

- **Code-split the editor sidebar** into a dynamic `import()` so view-mode
  dashboards don't download ~35% of the bundle they never use. Requires
  Grafana SDK dynamic-import support verification (SDK 12.x should
  support it via the standard webpack `output.chunkFilename`).
- **Externalize `exampleTopology.ts`** as a JSON file loaded via fetch
  from `plugin.json`'s install directory on first "Load example" click.
  Saves ~25 KB off the initial bundle.
- **Review `NodesEditor` BulkImport subcomponent**: the 267-LOC subcomponent
  is currently inside the same file as the main editor. Splitting it would
  let the lazy-load chunk boundary land cleanly between "always needed"
  and "bulk-discovery only" editor code.
- **Strip duplicated CloudWatch-stat constants.** `EdgeCard.tsx` and
  `MetricEditor.tsx` each declare an identical `CLOUDWATCH_STATS` array
  (9 entries). Extract to `editorUtils.ts` — saves <1 KB but removes a
  drift point.

None of these items exceed ~10 KB savings individually; combined they
could bring the bundle down to ~120-130 KiB, which would be the best-
in-class number for a Grafana panel plugin of this complexity.

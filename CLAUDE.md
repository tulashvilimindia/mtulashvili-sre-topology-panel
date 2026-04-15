# Project Guide — E2E Topology Grafana Plugin

## Project overview
This is a custom Grafana panel plugin (`mtulashvili-sre-topology-panel`) that renders interactive E2E topology diagrams with live metrics from any Grafana datasource. It is built for platform engineering teams to visualize infrastructure flows like:
- CDN → Firewall → Load Balancer → Web Server (any tiered frontend)
- Any tiered application architecture

## Technology stack (exact versions and usage)

### Runtime (loaded as Grafana externals — NOT bundled)

| Library | Resolved Version | What It Does In This Plugin | Where Used |
|---------|-----------------|----------------------------|------------|
| **React** | 18.3.1 | UI framework. All nodes, edges, toolbar, editor are React FC with hooks (useState, useEffect, useMemo, useCallback, useRef). Provided by Grafana at runtime via AMD externals. | `TopologyPanel.tsx`, `TopologyCanvas.tsx`, `TopologyEditor.tsx` |
| **React DOM** | 18.3.1 | React renderer for browser DOM. Grafana external. | Implicit via React |
| **@grafana/data** | 12.0.10 | Grafana SDK core. Provides `PanelPlugin` (plugin registration), `PanelProps` (panel component props with options/data/width/height/onOptionsChange), `DataFrames` (query result structure), `FieldType` (data field matching). | `module.ts` — PanelPlugin registration; `TopologyPanel.tsx` — PanelProps, data.series matching |
| **@grafana/runtime** | 12.0.10 | Grafana SDK runtime services. Provides `replaceVariables()` for dashboard template variable interpolation ($cf_zone, $app). Loaded as external. | Reserved for Phase 2 template variable support |
| **@grafana/ui** | 12.0.10 | Grafana SDK React components (Button, Icon, Select, Input). Loaded as external. Currently unused — plugin uses custom CSS for Nord theme consistency. | Available for Phase 3 visual editor |
| **Lodash** | 4.18.1 | Utility library. Grafana external. Currently unused in source but declared as webpack external. | Webpack externals only |

### Build system

| Library | Resolved Version | What It Does In This Plugin | Where Used |
|---------|-----------------|----------------------------|------------|
| **Webpack** | 5.106.1 | Module bundler. Compiles TS+CSS+SVG into single AMD module (`dist/module.js`, 45.8KB). AMD format required by Grafana's plugin loader. Production mode enables Terser minification. Dev mode enables watch + livereload. | `.config/webpack/webpack.config.ts` — full config |
| **webpack-cli** | 5.1.4 | CLI for webpack. Loads TypeScript config via ts-node. Invoked by `npm run build` and `npm run dev`. | `package.json` scripts |
| **@swc/core** | 1.15.24 | Rust-based TS/JS compiler (replaces Babel). 10-20x faster transpilation. Compiles TSX → ES2015 with TypeScript parser, TSX support, decorators disabled. | `.config/webpack/webpack.config.ts` — swc-loader jsc options |
| **swc-loader** | 0.2.7 | Webpack loader that pipes `.ts`/`.tsx` through SWC. Rule: `test: /\.[tj]sx?$/`, excludes node_modules. | `.config/webpack/webpack.config.ts` — module.rules[0] |
| **@swc/helpers** | 0.5.0 | Runtime helpers for SWC output (async/await, class properties). Avoids inlining helpers per file. | Implicit in SWC output |
| **TypeScript** | 5.9.3 | Static type checker only (`noEmit: true`). All source is .ts/.tsx. Compilation done by SWC, not tsc. Strict mode: `alwaysStrict`, `noImplicitAny`, `noImplicitThis`, `strictNullChecks`. | `tsconfig.json`, `npm run typecheck` |
| **ts-node** | 10.9.2 | TS execution engine. Used by webpack-cli to load `.config/webpack/webpack.config.ts` without pre-compilation. **Requires** `TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}'` on Node.js 24+ due to ESM defaults. | webpack-cli config loading |
| **tsconfig-paths** | 4.2.0 | Resolves TS path aliases (`@/*`) at runtime via ts-node. | ts-node integration |
| **css-loader** | 6.11.0 | Resolves `@import`/`url()` in CSS, converts to JS module. Chained after style-loader. | `.config/webpack/webpack.config.ts` — CSS rule |
| **style-loader** | 3.3.4 | Injects CSS into DOM via `<style>` tags at runtime. First in CSS loader chain. | `.config/webpack/webpack.config.ts` — CSS rule |
| **sass** | 1.99.0 | Dart Sass compiler. Available for SCSS support (plugin uses plain CSS). | `.config/webpack/webpack.config.ts` — SCSS rule |
| **sass-loader** | 13.3.3 | Webpack loader for `.scss`/`.sass` → Dart Sass. | `.config/webpack/webpack.config.ts` — SCSS rule |
| **copy-webpack-plugin** | 11.0.0 | Copies static files to `dist/`: plugin.json, README.md, LICENSE, CHANGELOG.md, img/logo.svg. Uses `path.resolve(process.cwd(), ...)` for cross-platform paths. | `.config/webpack/webpack.config.ts` — plugins |
| **replace-in-file-webpack-plugin** | 1.0.6 | Post-build string replacement in `dist/plugin.json`. Replaces `%VERSION%` → package.json version, `%TODAY%` → build date. Only targets plugin.json (not README — race condition fix). | `.config/webpack/webpack.config.ts` — plugins |
| **fork-ts-checker-webpack-plugin** | 9.1.0 | Async TypeScript type checking in separate process. Dev-only — doesn't block compilation. | `.config/webpack/webpack.config.ts` — dev plugins |
| **eslint-webpack-plugin** | 4.2.0 | ESLint during webpack builds. `lintDirtyModulesOnly` = only lint changed files. Dev-only. | `.config/webpack/webpack.config.ts` — dev plugins |
| **webpack-livereload-plugin** | 3.0.2 | Injects livereload script that triggers browser reload when `dist/` changes. Dev-only. | `.config/webpack/webpack.config.ts` — dev plugins |
| **webpack-virtual-modules** | 0.6.2 | Creates virtual in-memory webpack modules. Available for dynamic module generation. | Declared dep, reserved for future use |

### Testing

| Library | Resolved Version | What It Does In This Plugin | Where Used |
|---------|-----------------|----------------------------|------------|
| **Jest** | 29.7.0 | Test runner. jsdom environment for React component testing. SWC transform for speed. | `jest.config.js` extends `.config/jest.config.js` |
| **jest-environment-jsdom** | 29.7.0 | Browser-like DOM (jsdom) for Jest. Enables testing React components without real browser. | `.config/jest.config.js` — testEnvironment |
| **@swc/jest** | 0.2.39 | Jest transformer using SWC. 5-10x faster than ts-jest for TS/TSX compilation in tests. | `.config/jest.config.js` — transform |
| **@testing-library/react** | 14.3.1 | React testing utilities: `render()`, `screen`, `fireEvent`. Tests components from user perspective. | Test files (`*.test.tsx`) |
| **@testing-library/jest-dom** | 6.9.1 | Custom matchers: `toBeInTheDocument()`, `toHaveClass()`, `toBeVisible()`. | `jest-setup.js` → `.config/jest-setup.js` |
| **@grafana/plugin-e2e** | 3.4.12 | Grafana's Playwright-based E2E framework for plugin testing against running Grafana. | Reserved for Phase 2 E2E tests |
| **identity-obj-proxy** | 3.0.0 | Mocks CSS imports in Jest: `import styles from './X.css'` → `{ className: 'className' }`. | `.config/jest.config.js` — moduleNameMapper |

### Code quality

| Library | Resolved Version | What It Does In This Plugin | Where Used |
|---------|-----------------|----------------------------|------------|
| **ESLint** | 8.57.1 | Linter. Enforces: `curly` (braces required), `eqeqeq`, `no-var`, `no-console` (except warn/error), `react-hooks/exhaustive-deps` (error level), `@typescript-eslint/array-type`. | `.eslintrc` extends `.config/_eslintrc` |
| **@grafana/eslint-config** | 7.0.0 | Grafana's shared ESLint ruleset. Includes React recommended, TypeScript strict, import ordering, Grafana-specific rules (no moment imports, no I-prefix on interfaces). | `.config/_eslintrc` |
| **@grafana/tsconfig** | 2.0.1 | Shared TS compiler config. Sets strict mode, ES2021 target, ESNext modules, skipLibCheck, sourceMap. Extended by `.config/tsconfig.json`. | `tsconfig.json` → `.config/tsconfig.json` |
| **Prettier** | 3.8.2 | Code formatter. 120 char lines, 2 spaces, single quotes, trailing commas (ES5), semicolons, auto line endings. | `.prettierrc.js` |
| **glob** | 10.3.0 | File pattern matching. Used internally by build tools. | Build tooling internals |

### Type definitions

| Library | Version | Types For |
|---------|---------|-----------|
| **@types/react** | 18.2.0 | React API (FC, hooks, JSX, events) |
| **@types/react-dom** | 18.2.0 | React DOM API (render, createPortal) |
| **@types/jest** | 29.5.0 | Jest API (describe, it, expect) |
| **@types/lodash** | 4.14.200 | Lodash utilities (debounce, etc.) |
| **@types/node** | 20.0.0 | Node.js built-ins (path, fs — used in webpack config) |

### Development infrastructure

| Tool | Version | What It Does | Configuration |
|------|---------|--------------|--------------|
| **Node.js** | 24.14.0 (>=18 required) | JS runtime for build tools. Requires `TS_NODE_COMPILER_OPTIONS` workaround on v24+. | `package.json` engines |
| **npm** | 11.9.0 | Package manager. Lockfile: `package-lock.json`. | Standard |
| **Docker** | Host system | Runs local Grafana 10.4.0 via `docker-compose.yaml`. Builds from `.config/Dockerfile` (Alpine + supervisord). | `docker-compose.yaml` |
| **Grafana Enterprise** | 12.0.0 | Target host for the panel plugin. Docker image with anonymous auth (Admin role), unsigned plugin allowlist, debug logging. Dev port: **13100**. | `docker-compose.yaml` — build args, environment, ports |
| **supervisord** | Alpine pkg | Process manager inside Docker. Runs Grafana's `/run.sh` with stdout logging to container. | `.config/supervisord/supervisord.conf` |

## Key architecture decisions
- **React + TypeScript** panel plugin using Grafana Plugin SDK
- **No external diagramming libraries** — custom SVG edge renderer + HTML node cards
- **Drag-and-drop** via pointer events, positions persisted in panel JSON
- **Auto-layout** via topological sort + tier-based positioning (no dagre dependency in v1)
- **Relationship model**: hybrid — manual edge definitions enriched by live metric queries
- **Dark theme only** in v1, using Nord-inspired palette (#13161a bg, #1a1e24 card, #2d3748 border)

## File structure
```
src/
  module.ts              — Plugin entry, registers panel + options + editor
  types.ts               — ALL type definitions (nodes, edges, groups, runtime state, options)
  components/
    TopologyPanel.tsx     — Main panel wrapper, data processing, toolbar
    TopologyPanel.css     — All styles (single CSS file, no CSS modules)
    TopologyCanvas.tsx    — Canvas with SVG edges, draggable nodes, groups
  editors/
    TopologyEditor.tsx    — Panel editor UI + example topology loader
  utils/
    edges.ts             — Bezier paths, anchor points, edge state calculation
    layout.ts            — Auto-layout algorithm, snap-to-grid
  img/
    logo.svg             — Plugin icon
```

## Data model (src/types.ts)
- **TopologyNode**: id, name, role, type, metrics[], position, groupId, compact
- **TopologyEdge**: id, sourceId, targetId, type, metric, thresholds, flowAnimation, flowSpeed, anchorSource/Target
- **NodeGroup**: id, label, type (ha_pair|cluster|pool), nodeIds[], style
- **EdgeType**: traffic | ha_sync | failover | monitor | custom
- **DynamicTargetQuery**: for pool-member auto-discovery from metric queries

## Relationship model
Three patterns cover all topologies:
1. **1:1 direct**: CDN → FW — single source, single target, one metric drives edge
2. **1:N fan-out with target_query**: Pool → members — auto-creates edges per pool member from Prometheus query
3. **HA pair bond**: PA1 ↔ PA2 — bidirectional ha_sync edge with state mapping

Edge visual behavior is driven by:
- **type** → base style (solid, dashed, dotted)
- **metric value + thresholds** → color (green/yellow/red)
- **thickness mode** → fixed, proportional to value, or threshold-stepped
- **flow animation** → speed proportional to metric value (auto mode)
- **status** → computed: healthy, saturated, degraded, down, nodata

## Grafana integration
- Panel receives query results via PanelProps.data (DataFrames)
- Each node metric has a datasourceUid + query + refId
- Metric values are matched to nodes by refId or frame name
- Template variables ($cf_zone, $app) are supported via replaceVariables()
- Node positions are stored in panel.options and persisted with the dashboard

## Development setup
```bash
# Install deps
npm install

# Dev mode with watch
npm run dev

# Build for production
npm run build

# In grafana.ini, add:
# [plugins]
# allow_loading_unsigned_plugins = mtulashvili-sre-topology-panel
```

## Grafana instance
- URL: (configure per deployment)
- Org: 1

## Known TODOs (Phase 2+)
- [ ] Visual node/edge editor in panel editor (drag-to-connect)
- [ ] Zoom/pan with mouse wheel
- [ ] Edge hover highlighting (dim others to 20%)
- [ ] Edge click → metric detail overlay
- [ ] Right-click context menu on nodes and edges
- [ ] Dynamic target query (pool member auto-discovery)
- [ ] Multiple datasources per node (Prometheus + New Relic + Cloudflare)
- [ ] Import/export topology JSON
- [ ] Template library (common topologies)
- [ ] Edge grouping (show N pool edges as one thick line that fans on zoom)
- [ ] Latency overlay on edges alongside throughput
- [ ] Light theme support

## Antipatterns to avoid
- Do NOT use localStorage/sessionStorage — Grafana panels don't have access
- Do NOT import dagre/elkjs in v1 — custom layout is sufficient for <50 nodes
- Do NOT use position:fixed — Grafana panels are iframes
- Do NOT hardcode datasource names — always use datasourceUid
- Do NOT modify panel options during render — use state for runtime data
- Do NOT use Angular — Grafana is removing Angular support

## Testing
- Manual: Load example topology via editor button, verify all nodes render, drag works, expand works
- Unit: Jest tests for layout.ts and edges.ts utility functions
- E2E: Playwright tests for drag-and-drop and edge rendering (Phase 2)
- Run before commit: `npm run lint && npm run typecheck && npm run test`

---

## Coding Standards

### TypeScript

#### Strict Typing
- **No `any` type** — use specific types, generics, or `unknown` with type guards
- If unavoidable, add `// eslint-disable-next-line` with explanation
- **Array syntax**: `Type[]` for simple types, `Array<ComplexType>` for generics/unions
- **Interfaces over type aliases** for object shapes (interfaces are extendable)
- **No `I` prefix** on interfaces: `TopologyNode` not `ITopologyNode`
- **Explicit return types** on exported functions
- **Optional fields**: use `field?: Type` (not `field: Type | undefined`)

#### Naming Conventions
| Kind | Convention | Example |
|------|-----------|---------|
| Files (components) | PascalCase.tsx | `TopologyCanvas.tsx` |
| Files (utils) | camelCase.ts | `edges.ts`, `layout.ts` |
| Files (styles) | PascalCase.css | `TopologyPanel.css` |
| Components | PascalCase | `TopologyCanvas` |
| Functions | camelCase | `calculateEdgeStatus` |
| Constants | UPPER_SNAKE_CASE | `STATUS_COLORS`, `NODE_TYPE_CONFIG` |
| Interfaces/Types | PascalCase | `TopologyNode`, `EdgeStatus` |
| Event handlers | handleXyz | `handleNodeDrag`, `handlePointerDown` |
| Refs | xyzRef | `canvasRef`, `hasMovedRef`, `nodeElRefs` |
| Boolean vars | is/has/should prefix | `isExpanded`, `hasMoved`, `needsAutoLayout` |

#### Import Order
```typescript
// 1. React and external libraries
import React, { useState, useCallback, useRef } from 'react';
// 2. Grafana SDK
import { PanelProps } from '@grafana/data';
// 3. Local types and utilities
import { TopologyNode, NodeRuntimeState } from '../types';
import { calculateEdgeStatus } from '../utils/edges';
// 4. Styles (last)
import './TopologyPanel.css';
```

#### Equality and Comparisons
- Always `===` (never `==`), exception: `value == null` to check null/undefined
- No type coercion — explicitly convert before comparing

### React Hooks

#### Rules (enforced by eslint react-hooks/exhaustive-deps)
- **All dependencies must be listed** in useEffect/useMemo/useCallback dep arrays
- **Never call hooks conditionally** — hooks must be at component top level
- **Wrap derived values in useMemo** when used as hook dependencies:
```typescript
// WRONG — creates new array reference on every render, breaks deps
const nodes = options.nodes || [];

// RIGHT — stable reference
const nodes = useMemo(() => options.nodes || [], [options.nodes]);
```

#### State Management Patterns
- **useState** for component-local mutable state (positions, expanded set)
- **useMemo** for computed values from props/data (nodeStates, edgeStates)
- **useRef** for synchronous values that don't trigger re-render (hasMovedRef, onNodeDragRef)
- **useCallback** for all functions passed as props to child components
- **Never mutate state directly** — always create new Map/Set:
```typescript
// WRONG
expandedNodes.add(nodeId);
setExpandedNodes(expandedNodes);

// RIGHT
setExpandedNodes((prev) => {
  const next = new Set(prev);
  next.add(nodeId);
  return next;
});
```

#### useEffect Rules
- Always return cleanup function for subscriptions/listeners
- Use refs to avoid re-registering event listeners on every render:
```typescript
// Store latest callback in ref — doesn't cause re-registration
const onNodeDragRef = useRef(onNodeDrag);
onNodeDragRef.current = onNodeDrag;

useEffect(() => {
  const handler = (e: PointerEvent) => onNodeDragRef.current(...);
  document.addEventListener('pointermove', handler);
  return () => document.removeEventListener('pointermove', handler);
}, [/* no onNodeDrag dep needed */]);
```

### CSS

- **Single CSS file** per component, imported at end of component imports
- **No CSS modules, no styled-components** in v1
- **Dark theme only** — Nord-inspired palette:
  - Background: `#13161a` (canvas), `#1a1e24` (cards)
  - Borders: `#2d3748`
  - Text: `#d8dee9` (primary), `#616e88` (secondary)
  - Status: `#a3be8c` (green/ok), `#ebcb8b` (yellow/warning), `#bf616a` (red/critical), `#4c566a` (gray/unknown/nodata)
- **Class prefix**: `topology-` for panel-level, `topo-` for node internals
- **No position:fixed** — Grafana panels are iframes
- **Use width/height from props** — never hardcode panel dimensions
- **Animations via CSS @keyframes** — no JavaScript animation loops
- **Animation dashoffset must match dasharray cycle**: dasharray `"6 10"` → dashoffset `-16` (6+10)

### SVG Rendering

- **Marker defs**: define per-color markers (topo-arrow-ok/warn/crit/dim), not context-stroke
- **Bezier paths**: compute via utility functions (`getBezierPath`, `getAnchorPoint`), not inline
- **No `document.getElementById`** — use component-scoped `useRef<Map>` for node element refs
- **Edge rendering**: always check sourceRect/targetRect for null before drawing
- **Guard against NaN**: `Math.max(...values, 1)` when dividing by max value (sparklines)

### Grafana SDK Integration

- **Options persistence**: only via `onOptionsChange()`, never during render
- **Debounce position writes**: 300ms debounce on drag to avoid hammering Grafana state
- **Datasource references**: always use `datasourceUid`, never hardcode names
- **Template variables**: use `replaceVariables()` from PanelProps on query strings
- **Metric matching**: match by `frame.refId === metric.id` (primary) or `frame.name === metric.label` (fallback)
- **Threshold evaluation**: sort descending, first match wins

### Error Handling

- **Never crash on missing data** — show "N/A" / nodata status instead
- **Default to empty arrays** for optional array props: `options.nodes || []`
- **Bounds check drag positions**: clamp to canvas width/height
- **Guard sparkline math**: prevent division by zero with `Math.max(denominator, 1)`
- **Status hierarchy**: down > critical = degraded > warning = saturated > nodata = unknown > ok = healthy — track worst status per node

### File Organization

```
src/
  module.ts              — Plugin entry point (PanelPlugin registration, options builder)
  types.ts               — ALL type definitions in one file, organized by domain
  components/
    TopologyPanel.tsx     — Main panel: data processing, state management, toolbar
    TopologyPanel.css     — All styles for the panel
    TopologyCanvas.tsx    — SVG edges + HTML nodes: rendering, drag, click, groups
  editors/
    TopologyEditor.tsx    — Panel editor: config display, example topology loader
  utils/
    edges.ts             — Pure functions: bezier paths, anchors, status, thickness, speed
    layout.ts            — Pure functions: topological sort, tier assignment, auto-positioning
  img/
    logo.svg             — Plugin icon
```

- **One component per file** — no multiple exports of components
- **Utils are pure functions** — no state, no refs, no side effects, no React imports
- **Types in one file** — single source of truth for all interfaces/types/enums/defaults
- **module.ts is minimal** — only plugin registration and options builder, no business logic

### Pre-Commit Checklist

1. `npm run lint` — zero errors
2. `npm run typecheck` — zero errors
3. `npm run test` — all tests pass
4. `npm run build` — successful production build
5. Verify in browser — load dashboard, check console for errors
6. No `any` types introduced
7. All hook dependencies correct (no eslint-disable for exhaustive-deps)
8. No `document.getElementById` — use refs
9. No hardcoded colors — use STATUS_COLORS or CSS variables
10. No panel option mutations during render

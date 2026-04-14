# E2E Topology Panel for Grafana

Interactive end-to-end topology diagram panel for Grafana. Visualize infrastructure flows with live metrics from any datasource, drag-and-drop node positioning, animated traffic connections with neon glow, and multi-metric popups with sparklines and freshness SLO tracking.

Built by SID2 Platform Engineering.

![Grafana 12+](https://img.shields.io/badge/Grafana-12.0%2B-orange)
![License](https://img.shields.io/badge/License-Apache%202.0-blue)
![Plugin Type](https://img.shields.io/badge/Type-Panel-green)
![Tests](https://img.shields.io/badge/tests-216%20passing-green)
![Bundle](https://img.shields.io/badge/bundle-151KB-blue)

---

## Features

### Topology Visualization
- **Draggable nodes** — freely position nodes on a grid canvas; positions persist with the dashboard JSON
- **Animated flow connections** — bezier curve edges with animated dashes showing traffic direction, enhanced with double drop-shadow neon glow that pulses in the edge's status color
- **HA pair & cluster grouping** — dashed/dotted containers visually bracket HA pairs, clusters, and server pools
- **Auto-layout** — topological sort positions nodes in tiers automatically (top-down or left-right) with O(V+E) complexity (no duplicate-enqueue bug on diamond fan-in)
- **Pan/zoom** — mouse wheel zoom, Ctrl+drag pan, "1:1" reset and "Fit" auto-fit-to-view buttons; viewport persists across panel remounts (edit↔view mode toggle)
- **Mobile responsive** — `@media (max-width: 768px)` bottom-sheet popup, wrapped toolbar, touch-action pan/pinch-zoom
- **Reduced motion** — respects `prefers-reduced-motion: reduce` and disables flow animations for users with vestibular disorders

### Multi-Datasource Metric Integration
- **Prometheus** — instant queries via `/api/datasources/proxy/uid/{dsUid}/api/v1/query`
- **CloudWatch** — `namespace` + `metricName` + `dimensions` + `stat` + `period` via unified `/api/ds/query`
- **Infinity (NRQL / GraphQL / REST)** — `url` + `method` + `body` + `rootSelector` for any JSON-returning HTTP API. Verified working end-to-end against New Relic NerdGraph at `api.newrelic.com/graphql`.
- **Auto-fetch via `useSelfQueries`** — each metric polls its own datasource; debounced 500ms with AbortController cancellation and 10-second hard timeout per query
- **Panel-query compatibility** — metrics can also be sourced from the panel's own Grafana queries via `refId` match or `frame.name` fallback
- **Freshness SLO** — every self-queried metric carries a `fetchedAt` timestamp; a toolbar "N stale" pill surfaces metrics that exceed the configurable `metricFreshnessSLOSec` threshold

### Alert Integration
- **Grafana unified alerting** — `useAlertRules` hook polls the Grafana alerting API and matches alerts to nodes via `alertLabelMatchers` (key-value pairs the plugin looks for in alert labels)
- **Configurable poll interval** — `animation.alertPollIntervalMs` panel option, default 30s, clamped to 5s minimum so a user typo can't hammer the API
- **Runbook deep-links** — if a firing alert has a `runbook_url` annotation, the popup exposes it as a clickable link
- **Observability drill-downs** — per-node `observabilityLinks` with `${token}` interpolation (resolves from node fields and `alertLabelMatchers`)

### Dynamic Target Queries
Edges can define a `targetQuery` that resolves at runtime to N virtual edges, one per discovered target value. Supports all three datasource types (Prometheus label values, CloudWatch dimension enumeration, Infinity HTTP discovery). Virtual edges inherit parent metric values via the `parentId::targetValue` id convention. Poll interval: 60s.

### Click-to-expand Popup
Clicking any node opens a popup positioned next to the clicked rect with:
- Up to 4 summary metrics with mini SVG sparklines and "Updated Ns ago" freshness labels that tick live every 15 seconds
- Firing alerts section with state badges, rule links, summary annotations, and optional runbook buttons
- Observability links with `${name}` / `${id}` / matcher-token URL templating
- Edit button (only in edit mode) that scrolls the matching sidebar card into view via a cross-subtree event bus

### Topology Patterns
The plugin supports three relationship patterns that cover all common topologies:

| Pattern | Example | Description |
|---------|---------|-------------|
| **1:1 direct** | CDN → WAF | Single source, single target, one metric drives edge |
| **1:N fan-out** | Pool → Members | One source fans out to multiple targets (optionally dynamic via `targetQuery`) |
| **HA pair bond** | PA1 ↔ PA2 | Bidirectional edge with optional `stateMap` for non-numeric states (e.g. `ha_sync`) |

### Panel Options

| Option | Default | Description |
|--------|---------|-------------|
| Show grid | On | Dot grid background for positioning reference |
| Snap to grid | On | Snap nodes to grid when dragging |
| Grid size | 20px | Grid spacing in pixels |
| Background color | transparent | Canvas background (any CSS color; "transparent" inherits dashboard theme) |
| Flow animation | On | Animate flow dashes on traffic edges (per-edge `flowAnimation` must also be true) |
| Default flow speed | auto | Panel-wide fallback flow speed (`auto`/`slow`/`normal`/`fast`/`none`) for edges that don't override |
| Pulse on critical | On | Pulse status dot when node is in critical state |
| **Alert poll interval (ms)** | 30000 | How often to refresh firing alerts (min 5000) |
| **Metric freshness SLO (s)** | 60 | Mark self-queried metric rows as Stale in the popup when fetchedAt age exceeds this |
| Auto layout | On | Run topological-sort auto-layout when node positions are at default. Off = honor stored positions exactly |
| Layout direction | Top-down | Auto-layout flow direction (`top-down` / `left-right`) |
| Tier spacing | 120px | Space between tiers in auto-layout |
| Node spacing | 20px | Space between nodes in the same tier |
| Show edge labels | On | Display metric values on edges |
| Show status dots | On | Show colored status indicator dots on nodes |
| Show metrics on cards | On | Show summary metric rows in collapsed node view |
| Show node icons | On | Show type-specific icons (CF, FW, LB, SRV, DB, etc.) |
| Max summary metrics | 4 | Number of metrics shown in collapsed node view |

---

## Installation

### Prerequisites

- **Grafana 12.0 or later** (SDK 12.0.10 targeted; earlier 10.x may work but isn't tested)
- **Node.js 18+** (for building from source; Node 24 LTS supported via `cross-env`)

### Build from Source

```bash
git clone https://github.com/tulashvilimindia/sid2-grafana-topology.git
cd grafana-topology-plugin
npm install
npm run build
```

### Install on Grafana

1. Copy the `dist/` folder to your Grafana plugins directory:

```bash
# Linux
sudo cp -r dist/ /var/lib/grafana/plugins/sid2-grafana-topology/

# macOS (Homebrew)
cp -r dist/ /opt/homebrew/var/lib/grafana/plugins/sid2-grafana-topology/

# Windows
xcopy dist\ "C:\Program Files\GrafanaLabs\grafana\data\plugins\sid2-grafana-topology\" /E /I
```

2. Allow the unsigned plugin in `grafana.ini`:

```ini
[plugins]
allow_loading_unsigned_plugins = sid2-grafana-topology
```

Or via environment variable:

```bash
GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=sid2-grafana-topology
```

3. Restart Grafana:

```bash
sudo systemctl restart grafana-server
```

4. Verify: navigate to **Administration > Plugins**, search for "E2E Topology"

### Install via Docker

```bash
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/dist:/var/lib/grafana/plugins/sid2-grafana-topology \
  -e GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=sid2-grafana-topology \
  grafana/grafana-enterprise:12.0.0
```

### Install via Docker Compose

```yaml
services:
  grafana:
    image: grafana/grafana-enterprise:12.0.0
    ports:
      - "3000:3000"
    volumes:
      - ./dist:/var/lib/grafana/plugins/sid2-grafana-topology
      - grafana-storage:/var/lib/grafana
    environment:
      GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS: sid2-grafana-topology
volumes:
  grafana-storage:
```

---

## Quick Start

### 1. Add the Panel

- Create or open a dashboard
- Click **Add > Visualization**
- Search for **"E2E Topology"** in the visualization type list
- Select it

### 2. Load Example Topology

The plugin ships with a built-in example topology (Sample E2E stack):

- Open the panel editor
- Scroll down to the **custom editor section**
- Click **"Load example topology (Sample E2E)"**
- Click **Apply**

This loads a complete topology: **CDN > Firewall (HA) > Load Balancer (HA) > Virtual Server > Pool > 6x Web Servers**

### 3. Interact

- **Drag** any node to reposition it (positions save with the dashboard)
- **Click** a node to expand its metric details
- **"Auto layout"** button recalculates tier-based positions
- **"Expand all" / "Collapse all"** toggles all nodes

---

## Configuration

### Topology Data Model

The topology is configured via the panel's JSON options. Each topology consists of three arrays:

#### Nodes

```json
{
  "id": "n-cf",
  "name": "Cloudflare Edge",
  "role": "CDN / WAF",
  "type": "cloudflare",
  "position": { "x": 245, "y": 20 },
  "compact": false,
  "width": 180,
  "groupId": "grp-ha-pair",
  "metrics": [
    {
      "id": "cf-rps",
      "label": "rps",
      "datasourceUid": "your-datasource-uid",
      "query": "sum(rate(http_requests_total[5m]))",
      "format": "${value} rps",
      "section": "Traffic",
      "isSummary": true,
      "thresholds": [
        { "value": 0, "color": "green" },
        { "value": 15000, "color": "yellow" },
        { "value": 25000, "color": "red" }
      ],
      "showSparkline": true
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique node identifier |
| `name` | string | Display name |
| `role` | string | Short role/description shown below name |
| `type` | enum | Node type: `cloudflare`, `firewall`, `loadbalancer`, `virtualserver`, `pool`, `server`, `database`, `cache`, `queue`, `custom` |
| `position` | {x, y} | Canvas position (auto-calculated if {100, 100}) |
| `compact` | boolean | Compact mini-node style (for server pools) |
| `width` | number | Fixed width in pixels (optional) |
| `groupId` | string | Group this node belongs to (optional) |
| `metrics` | array | Metric configurations (see below) |

#### Node Metrics

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique metric id, matched against DataFrame `refId` |
| `label` | string | Display label (e.g. "cpu", "rps") |
| `datasourceUid` | string | Grafana datasource UID |
| `query` | string | Query expression |
| `format` | string | Value format: `"${value}%"`, `"${value} rps"` |
| `section` | string | Section name for expanded view grouping |
| `isSummary` | boolean | `true` = visible in collapsed view (max 4), `false` = shown only when expanded |
| `thresholds` | array | Color breakpoints: `[{value: 0, color: "green"}, {value: 80, color: "red"}]` |
| `showSparkline` | boolean | Show mini bar chart of recent values in expanded view |

#### Edges

```json
{
  "id": "e-cf-pa1",
  "sourceId": "n-cf",
  "targetId": "n-pa1",
  "type": "traffic",
  "thicknessMode": "proportional",
  "thicknessMin": 1.5,
  "thicknessMax": 4,
  "thresholds": [
    { "value": 0, "color": "green" },
    { "value": 70, "color": "yellow" },
    { "value": 90, "color": "red" }
  ],
  "flowAnimation": true,
  "flowSpeed": "auto",
  "bidirectional": false,
  "anchorSource": "auto",
  "anchorTarget": "auto",
  "labelTemplate": "${value} rps",
  "metric": {
    "datasourceUid": "your-datasource-uid",
    "query": "sum(rate(http_requests_total[5m]))",
    "alias": "cf-to-pa-traffic"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique edge identifier |
| `sourceId` | string | Source node ID |
| `targetId` | string | Target node ID |
| `type` | enum | `traffic`, `ha_sync`, `failover`, `monitor`, `custom` |
| `thicknessMode` | enum | `fixed`, `proportional` (scales with value), `threshold` (step function) |
| `thicknessMin/Max` | number | Thickness range in pixels |
| `thresholds` | array | Color breakpoints (same format as node metrics) |
| `flowAnimation` | boolean | Enable animated flow dashes |
| `flowSpeed` | enum | `auto` (scales with metric), `slow`, `normal`, `fast`, `none` |
| `bidirectional` | boolean | Render arrows in both directions |
| `anchorSource/Target` | enum | `auto`, `top`, `bottom`, `left`, `right` |
| `labelTemplate` | string | Label with `${value}` interpolation |
| `metric` | object | Optional datasource query for this edge |

#### Groups

```json
{
  "id": "grp-pa",
  "label": "HA -- Firewall",
  "type": "ha_pair",
  "nodeIds": ["n-pa1", "n-pa2"],
  "style": "dashed"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique group identifier |
| `label` | string | Display label (shown above group border) |
| `type` | enum | `ha_pair`, `cluster`, `pool`, `custom` |
| `nodeIds` | string[] | IDs of nodes in this group |
| `style` | enum | `dashed`, `solid`, `none` |

### Connecting to Data Sources

Each metric references a Grafana datasource by its UID. The plugin matches query results to metrics by:

1. `frame.refId === metric.id` -- primary match
2. `frame.name === metric.label` -- fallback match

To find datasource UIDs:
```bash
curl -s http://your-grafana/api/datasources | jq '.[].uid'
```

### Node Types and Icons

| Type | Icon | Default Color | Typical Use |
|------|------|---------------|-------------|
| `cloudflare` | CF | Gold | CDN / WAF edge |
| `firewall` | FW | Red | Firewall |
| `loadbalancer` | LB | Orange | Load balancer |
| `virtualserver` | VS | Purple | Virtual server / VIP |
| `pool` | PL | Green | Server pool |
| `server` | SRV | Cyan | Application server |
| `database` | DB | Blue | Database |
| `cache` | RD | Red | Cache (Redis, etc.) |
| `queue` | MQ | Gold | Message queue |
| `custom` | ? | Gray | Custom node type |

### Edge Visual Behavior

| Property | Drives | Details |
|----------|--------|---------|
| `type` | Line style | traffic=solid, ha_sync=dashed, failover=dotted, monitor=fine dots |
| `thresholds + metric` | Color | green/yellow/red based on value vs threshold breakpoints |
| `thicknessMode + metric` | Stroke width | fixed=constant, proportional=linear scale, threshold=step function |
| `flowAnimation + flowSpeed` | Dash animation | auto=faster with higher traffic, or fixed slow/normal/fast |
| `bidirectional` | Arrow direction | false=one-way arrow, true=arrows both directions |

---

## Development

### Local Development Setup

```bash
# Install dependencies
npm install

# Start webpack in watch mode (terminal 1)
npm run dev

# Start local Grafana with plugin mounted (terminal 2)
docker compose up
```

Access Grafana at **http://localhost:13100** (anonymous access enabled, Admin role).

### Project Structure

```
src/
  module.ts              -- Plugin entry, registers panel + options
  types.ts               -- All type definitions (nodes, edges, groups, runtime state)
  components/
    TopologyPanel.tsx     -- Main panel wrapper, data processing, toolbar
    TopologyPanel.css     -- All styles (Nord dark theme)
    TopologyCanvas.tsx    -- Canvas with SVG edges, draggable nodes, groups
  editors/
    TopologyEditor.tsx    -- Panel editor UI + example topology loader
  utils/
    edges.ts             -- Bezier paths, anchor points, edge state calculation
    layout.ts            -- Auto-layout algorithm (topological sort + tier positioning)
  img/
    logo.svg             -- Plugin icon
```

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Webpack watch mode (rebuilds on save) |
| `npm run build` | Production build to `dist/` |
| `npm run test` | Run Jest tests |
| `npm run lint` | ESLint check |
| `npm run typecheck` | TypeScript type check (no emit) |
| `npm run server` | Start Docker Compose Grafana |

### Technology Stack

Every dependency listed with its exact resolved version, what it does in this project, and where it is used.

#### Runtime Dependencies

| Library | Version | Purpose | Used In |
|---------|---------|---------|---------|
| **React** | 18.3.1 | UI component framework. All topology nodes, toolbar, and canvas are React functional components using hooks (`useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`). React is provided as an external by Grafana at runtime -- not bundled. | `TopologyPanel.tsx`, `TopologyCanvas.tsx`, `TopologyEditor.tsx` |
| **React DOM** | 18.3.1 | React renderer for browser DOM. Provided as external by Grafana. | Implicit via React |
| **@grafana/data** | 12.0.10 | Grafana Plugin SDK — core data types. Provides `PanelPlugin` class for plugin registration, `PanelProps` interface for panel component props, `DataFrames` for query result structure, `FieldType` for data matching, and `StandardEditorProps` for custom editors. | `module.ts` (PanelPlugin + setPanelOptions), `TopologyPanel.tsx` (PanelProps, data.series), all editor components |
| **@grafana/runtime** | 12.0.10 | Grafana Plugin SDK — runtime services. Provides `getDataSourceSrv()` for datasource instance lookup (used by `detectDatasourceType`) and `replaceVariables()` for template variable interpolation. | `datasourceQuery.ts`, `useSelfQueries.ts` |
| **@grafana/ui** | 12.0.10 | Grafana Plugin SDK — React component library. Provides themed components (`Button`, `IconButton`, `Input`, `Select`, `TextArea`, `CollapsableSection`, `Checkbox`, `DataSourcePicker`) used throughout editor components. | `NodeCard.tsx`, `EdgeCard.tsx`, `GroupCard.tsx`, `MetricEditor.tsx`, `ThresholdList.tsx`, `NodePopup.tsx` (Icon) |
| **Lodash** | 4.18.1 | Utility library. Loaded as external by Grafana. Currently unused in plugin source but available for future use. | Declared external in webpack |

#### Grafana Plugin SDK (Build & Configuration)

| Library | Version | Purpose | Used In |
|---------|---------|---------|---------|
| **@grafana/tsconfig** | 2.0.1 | Shared TypeScript compiler configuration for Grafana plugins. Extended by `.config/tsconfig.json`. Sets strict mode, ES2021 target, ESNext modules, and all standard Grafana TS conventions. | `tsconfig.json` (extends `.config/tsconfig.json`) |
| **@grafana/eslint-config** | 7.0.0 | Shared ESLint ruleset for Grafana plugins. Configures React, TypeScript, import ordering, and Grafana-specific rules. Extended by `.config/_eslintrc`. | `.eslintrc` (extends `.config/_eslintrc`) |
| **@grafana/plugin-e2e** | 1.0.0 | Grafana's Playwright-based E2E testing framework for plugins. Available for writing end-to-end tests against a running Grafana instance. | Reserved for Phase 2 (E2E test suite) |

#### Build System -- Webpack 5 + SWC

| Library | Version | Purpose | Used In |
|---------|---------|---------|---------|
| **Webpack** | 5.106.1 | Module bundler. Compiles TypeScript + CSS + assets into a single AMD module (`dist/module.js`) that Grafana loads at runtime. Configured for production minification and development watch mode with live reload. | `.config/webpack/webpack.config.ts` |
| **webpack-cli** | 5.1.4 | Command-line interface for Webpack. Invoked via `npm run build` and `npm run dev`. Handles config file loading (TypeScript configs via ts-node). | `package.json` scripts |
| **@swc/core** | 1.15.24 | Rust-based JavaScript/TypeScript compiler. Replaces Babel for 10-20x faster transpilation. Compiles TSX to ES2015 JavaScript with React JSX transform. | `.config/webpack/webpack.config.ts` (swc-loader options) |
| **swc-loader** | 0.2.7 | Webpack loader that pipes `.ts`/`.tsx` files through SWC. Configured with TypeScript parser, TSX support, and ES2015 target. | `.config/webpack/webpack.config.ts` (module.rules) |
| **@swc/helpers** | 0.5.0 | Runtime helpers for SWC-compiled code (async/await transforms, class properties, etc.). Avoids inlining helper code in every file. | Implicitly used by SWC output |
| **css-loader** | 6.11.0 | Webpack loader that resolves `@import` and `url()` in CSS files, converting them to JavaScript modules. | `.config/webpack/webpack.config.ts` (CSS rule) |
| **style-loader** | 3.3.4 | Webpack loader that injects CSS into the DOM via `<style>` tags at runtime. Paired with css-loader. | `.config/webpack/webpack.config.ts` (CSS rule) |
| **sass** | 1.99.0 | Dart Sass compiler. Compiles SCSS/Sass to CSS. Available for SCSS support though the plugin currently uses plain CSS. | `.config/webpack/webpack.config.ts` (SCSS rule) |
| **sass-loader** | 13.3.3 | Webpack loader that pipes `.scss`/`.sass` files through Dart Sass. Configured as the first loader in the SCSS rule chain. | `.config/webpack/webpack.config.ts` (SCSS rule) |
| **copy-webpack-plugin** | 11.0.0 | Copies static files (`plugin.json`, `README.md`, `LICENSE`, `CHANGELOG.md`, `img/`) from source to `dist/` during build. Uses `path.resolve(process.cwd(), ...)` for reliable cross-platform paths. | `.config/webpack/webpack.config.ts` (plugins) |
| **replace-in-file-webpack-plugin** | 1.0.6 | Post-build string replacement in `dist/plugin.json`. Replaces `%VERSION%` with package version and `%TODAY%` with build date. | `.config/webpack/webpack.config.ts` (plugins) |
| **fork-ts-checker-webpack-plugin** | 9.1.0 | Runs TypeScript type checking in a separate process (forked), so it doesn't block webpack compilation. Only active in development mode. | `.config/webpack/webpack.config.ts` (dev plugins) |
| **eslint-webpack-plugin** | 4.2.0 | Runs ESLint during webpack builds. Configured for `.ts`/`.tsx` files with `lintDirtyModulesOnly` (only lints changed files) in development mode. | `.config/webpack/webpack.config.ts` (dev plugins) |
| **webpack-livereload-plugin** | 3.0.2 | Injects a livereload script into the bundle that triggers browser reload when `dist/` changes. Active only in development mode. | `.config/webpack/webpack.config.ts` (dev plugins) |
| **webpack-virtual-modules** | 0.6.2 | Creates virtual (in-memory) webpack modules. Reserved for dynamic module generation (e.g., public path injection). | Available in webpack config |
| **ts-node** | 10.9.2 | TypeScript execution engine. Used by webpack-cli to load `.config/webpack/webpack.config.ts` directly without pre-compilation. Requires `TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}'` on Node.js 24+ due to ESM defaults. | webpack-cli config loading |
| **tsconfig-paths** | 4.2.0 | Resolves TypeScript path aliases (`@/*`) at runtime via ts-node. Enables path mapping from `tsconfig.json` during webpack config loading. | ts-node integration |
| **TypeScript** | 5.9.3 | Static type checker. All source files are TypeScript (`.ts`/`.tsx`). The compiler is used for type checking only (`noEmit: true`) -- actual compilation is handled by SWC. | `tsconfig.json`, `npm run typecheck` |

#### Testing

| Library | Version | Purpose | Used In |
|---------|---------|---------|---------|
| **Jest** | 29.7.0 | Test runner framework. Configured with jsdom environment for React component testing. Uses SWC for fast test transpilation. | `jest.config.js` (extends `.config/jest.config.js`) |
| **jest-environment-jsdom** | 29.7.0 | Jest environment that provides a browser-like DOM (via jsdom) for testing React components without a real browser. | `.config/jest.config.js` (testEnvironment) |
| **@swc/jest** | 0.2.39 | Jest transformer that uses SWC instead of Babel for TypeScript/JSX compilation during test runs. 5-10x faster than ts-jest. | `.config/jest.config.js` (transform) |
| **@testing-library/react** | 14.3.1 | React testing utilities. Provides `render()`, `screen`, and `fireEvent` for testing React components from the user's perspective. | Test files (`*.test.tsx`) |
| **@testing-library/jest-dom** | 6.9.1 | Custom Jest matchers for DOM assertions (`toBeInTheDocument()`, `toHaveClass()`, `toBeVisible()`). Loaded in jest-setup.js. | `jest-setup.js` → `.config/jest-setup.js` |
| **identity-obj-proxy** | 3.0.0 | Jest module mock that returns the property name as a string. Used to mock CSS module imports (`*.css` → `{ className: 'className' }`). | `.config/jest.config.js` (moduleNameMapper for CSS) |

#### Code Quality

| Library | Version | Purpose | Used In |
|---------|---------|---------|---------|
| **ESLint** | 8.57.1 | JavaScript/TypeScript linter. Enforces Grafana coding standards via `@grafana/eslint-config`. Runs during development builds (via eslint-webpack-plugin) and via `npm run lint`. | `.eslintrc`, `npm run lint` |
| **Prettier** | 3.8.2 | Code formatter. Configured for 120 char lines, trailing commas, single quotes, 2-space indent, auto line endings (CRLF/LF). | `.prettierrc.js` |
| **glob** | 10.3.0 | File pattern matching. Used internally by build tools for file discovery. | Build tooling internals |

#### Type Definitions

| Library | Version | Purpose |
|---------|---------|---------|
| **@types/react** | 18.2.0 | TypeScript definitions for React API |
| **@types/react-dom** | 18.2.0 | TypeScript definitions for React DOM API |
| **@types/jest** | 29.5.0 | TypeScript definitions for Jest API |
| **@types/lodash** | 4.14.200 | TypeScript definitions for Lodash utilities |
| **@types/node** | 20.0.0 | TypeScript definitions for Node.js built-ins (used in webpack config) |

#### Development Infrastructure

| Tool | Version | Purpose |
|------|---------|---------|
| **Docker** | (host) | Runs local Grafana 12.0.0 via `docker-compose.yaml` for plugin development and testing |
| **Grafana Enterprise** | 12.0.0 | Target panel host. Docker image `grafana/grafana-enterprise:12.0.0` with anonymous auth (Admin role), unsigned plugin allowlist, debug logging. Dev port 13100 per `docker-compose.yaml`. |
| **supervisord** | Alpine pkg | Process manager inside Docker container. Runs Grafana's `/run.sh` with stdout logging |
| **Node.js** | >= 18 (24.14.0 used) | JavaScript runtime for build tools. Requires `TS_NODE_COMPILER_OPTIONS` workaround on v24+ |
| **npm** | 11.9.0 | Package manager |

### Technical Approach

| Concern | Approach | Rationale |
|---------|----------|-----------|
| **Rendering** | SVG layer for edges (bezier `<path>` elements) + absolutely-positioned HTML `<div>` node cards | Avoids canvas/WebGL complexity. HTML nodes get native CSS animations, text rendering, and accessibility. SVG gives smooth scalable curves. |
| **Drag-and-drop** | `pointerdown` → document-level `pointermove`/`pointerup` listeners via `useEffect` | Pointer events work across mouse/touch. Document-level listeners prevent drag from breaking when cursor moves off the node element. |
| **Click vs drag** | `useRef<boolean>` for `hasMoved` flag, checked synchronously in `onClick` | Avoids React state batching delay that causes stale closure reads. Ref is updated synchronously in pointermove and read synchronously in click. |
| **Position persistence** | Debounced `onOptionsChange()` (300ms) writes positions back to Grafana panel JSON | Positions survive page reload. Debounce prevents hammering Grafana's state system on every mousemove during drag. |
| **Edge geometry** | Cubic bezier curves with auto-calculated anchor points based on relative node positions | `getAnchorPoint()` chooses top/bottom/left/right based on source-to-target angle. `getBezierPath()` generates smooth S-curves. |
| **Layout algorithm** | BFS topological sort → tier assignment → centered X positioning per tier | Handles DAGs. Skips bidirectional edges (HA sync) to prevent cycles. Per-tier width calculation sums actual node widths for correct alignment. |
| **Flow animation** | CSS `@keyframes` with `stroke-dashoffset` on SVG paths | Pure CSS animation -- no JavaScript animation loop. Speed controlled by animation-duration. Dashoffset = -16 matches dasharray cycle (6+10). |
| **Edge data pipeline** | `useMemo` computes `Map<string, EdgeRuntimeState>` from DataFrames | Same pattern as node states. Matches frame.refId or frame.name to edge metric alias. Computes color/thickness/speed/label per edge. |
| **Multi-panel safety** | `useRef<Map<string, HTMLDivElement>>` with ref callbacks instead of `document.getElementById` | Scoped to component instance. No global DOM ID collisions when multiple topology panels exist on one dashboard. |
| **Metric thresholds** | Descending sort → first match wins | `[{value: 0, color: green}, {value: 70, color: yellow}, {value: 90, color: red}]` -- value 85 matches yellow (85 >= 70, checked before 0). |
| **Theme** | Nord-inspired palette in single CSS file | `#13161a` background, `#1a1e24` cards, `#2d3748` borders, `#a3be8c/#ebcb8b/#bf616a` status colors. No CSS modules -- all styles scoped by class prefix. |

### Architecture Decisions

- **No external diagramming libraries** -- custom SVG edge renderer + HTML node cards (no dagre, d3-force, or elkjs). Sufficient for <50 nodes.
- **Drag-and-drop** via pointer events, positions persisted in panel JSON via `onOptionsChange`
- **Auto-layout** via topological sort + tier-based positioning with cycle detection (handles bidirectional HA edges)
- **Dark theme only** in v1, using Nord-inspired palette
- **Single CSS file** -- no CSS modules, no styled-components
- **Scoped DOM refs** -- component-scoped `useRef<Map>` instead of `document.getElementById` (safe for multi-panel dashboards)
- **SWC over Babel** -- Rust-based compiler for 10-20x faster builds
- **AMD module output** -- Grafana's plugin loader uses AMD (`require`/`define`), all `@grafana/*`, `react`, `lodash` are externals provided by the host

---

## Example: Sample E2E Stack

The built-in example topology visualizes this infrastructure flow:

```
Cloudflare Edge (CDN/WAF)
    |
    +-- Firewall_01 (active)  --+  HA Pair
    +-- Firewall_02 (passive) --+
            |
    +-- LB_01 (active)  --+  HA Pair
    +-- LB_02 (standby) --+
            |
        VS Web 443 -- Web Pool
            |
    +---+---+---+---+---+---+
   SRV01 SRV02 SRV03 SRV04 SRV05 SRV06
         Web Server Cluster
```

---

## Roadmap

**Shipped since v1.0.0** (roughly 50+ tasks across Phases 1–6, the PR-review-driven improvement plan, and PMS/Sauron stress-testing):

- [x] **Multi-datasource support** — Prometheus, CloudWatch, and Infinity (any JSON HTTP API including New Relic NerdGraph) via a unified `queryDatasource` abstraction
- [x] **Dynamic target query** — `DynamicTargetQuery` with virtual-edge expansion via `parentId::targetValue` convention, resolvers for all three datasource types
- [x] **Grafana alert rule integration** — `useAlertRules` hook + `alertLabelMatchers` on nodes, configurable poll cadence, runbook deep-links
- [x] **Freshness SLO** — per-metric `fetchedAt` stamping, configurable `metricFreshnessSLOSec`, live-ticking popup freshness labels, toolbar "N stale" indicator
- [x] **Multi-metric popups** — up to 4 summary metrics per popup with mini SVG sparklines and "Updated Ns ago" labels
- [x] **Observability drill-downs** — per-node `observabilityLinks` with `${token}` URL interpolation
- [x] **Import/export topology JSON** — full round-trip including `canvas`, `animation`, `layout`, `display` sub-options via cross-subtree event bus
- [x] **CloudWatch & Infinity editors** — namespace/metricName/dimensions/stat/period and url/method/body/rootSelector fields in `MetricEditor` and `EdgeCard`
- [x] **State map for non-numeric edges** — `stateMap` editor + `calculateEdgeStatus` support for string-valued metrics
- [x] **Zoom/pan with mouse wheel** + Fit-to-view + 1:1 reset + viewport persistence across panel remounts (module-level `viewportStore`)
- [x] **Neon glow animated edges** — double `drop-shadow` SVG filter on flow overlays
- [x] **Search filters** in NodesEditor, EdgesEditor, GroupsEditor
- [x] **Bulk node import** from Prometheus metric discovery
- [x] **Auto-delete orphan edges** when a node is deleted
- [x] **Double-click node** → scroll matching editor card into view
- [x] **Edit Node** button in popup (edit mode only)
- [x] **Example topology explainer banner** — 12s dismissible after "Load example"
- [x] **Mobile responsive layout** — `@media (max-width: 768px)` bottom-sheet popup, wrapped toolbar, `touch-action` pan/pinch-zoom
- [x] **Reduced-motion accessibility** — `@media (prefers-reduced-motion: reduce)` disables flow and pulse animations
- [x] **216 unit tests** across 10 suites (edges, layout, viewport, viewportStore, datasourceQuery, alertRules, dynamicTargets, panelEvents, NodePopup, TopologyPanel)
- [x] **GitHub Actions CI** — typecheck + lint + test + build on every push; tag-triggered signing workflow with env-driven `GRAFANA_ROOT_URLS` secret
- [x] **Cross-platform build** — `cross-env` shim so Windows CMD works with the `TS_NODE_COMPILER_OPTIONS` env var
- [x] **SVG overflow clipping fix** — edges past the layout box now render correctly after Auto Layout + Fit
- [x] **Z-order fix** — groups no longer occlude edges that cross their bounding box
- [x] **AbortController + 10s timeout** on all datasource queries so hung datasources don't freeze the panel

**Still on the roadmap:**

- [ ] Visual node/edge editor (drag-to-connect directly on canvas)
- [ ] Edge hover highlighting (dim others to 20%)
- [ ] Edge click → metric detail overlay
- [ ] Right-click context menu on nodes and edges
- [ ] Template variable support inside NRQL/PromQL via `replaceVariables()`
- [ ] Light theme support
- [ ] Plugin signing for public Grafana plugin catalog submission

---

## License

[Apache License 2.0](LICENSE)

Copyright 2026 SID2 Platform Engineering

---

## Reference dashboards

The `demo-screenshots/` directory ships four reproducible dashboard JSON payloads used to stress-test the plugin against real production data:

- **`angular-portal-dashboard.json`** — 9-node Angular Portal topology wired to a local coroot Prometheus datasource
- **`sauron-topology-dashboard.json`** — 14-node "Sauron's Eye" clone wired to chained `prod-prom-proxy` (real Cloudflare / F5 / IIS data via a dev Grafana that proxies to production Grafana's K8s Prometheus)
- **`sauron-production.json`** — the 200 KB upstream Sauron's Eye dashboard pulled from production Grafana for reference (layer-per-layer stat/timeseries view, pre-topology)
- **`pms-topology-dashboard.json`** — 21-node PMS (Player Management System) service graph wired **100% to New Relic** via a chained Infinity datasource → NerdGraph GraphQL. 63 NRQL queries across 14 APM services + 2 datastores + legacy on-prem + external PSPs + AKS cluster landmark

To deploy any of them to your own dev Grafana with matching datasources, POST the JSON to `/api/dashboards/db`:

```bash
curl -u admin:admin -X POST -H "Content-Type: application/json" \
  --data-binary @demo-screenshots/pms-topology-dashboard.json \
  http://localhost:13100/api/dashboards/db
```

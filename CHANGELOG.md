# Changelog

## 1.0.1 - 2026-04-27

Bug fixes, narrowed status-propagation semantics, and a large test-surface
expansion (267 → 480 Jest tests, + 3 E2E specs).

### Fixed

- **Viewport no longer resets on edit↔view toggle** (`TopologyCanvas.tsx`).
  An unmount-scoped cleanup was clearing the per-panel viewport store on
  every remount, which defeated the store's entire purpose. Pan/zoom now
  survives the remount as originally intended.
- **CloudWatch `region` picker now reaches the API.** `queryDatasource`
  was hardcoding `region: 'default'` in the `/api/ds/query` body, silently
  ignoring the user's editor-side region selection. Both the instant and
  range query paths now forward `config.region || 'default'`.
- **Pan-gesture closure race under React 18 batching.** `handleMove`
  dereferenced `panStartRef.current` inside a `setViewport` updater
  lambda, which could race with `handleUp` nulling the ref between
  scheduling and flush. Now snapshots the ref into primitives before
  calling `setViewport`.
- **`%VERSION%`/`%TODAY%` placeholders** are now substituted at build
  time as the webpack plugin registration intended. `src/plugin.json`
  previously held literal values that made the substitution a no-op.
- **CloudWatch provisioning syntax + response shape** — bash-style
  `${VAR:-default}` doesn't work in Grafana provisioning YAML; switched
  to plain `$VAR` with docker-compose providing the defaults. The
  `/resources/metrics` endpoint nests metric names under
  `value.name`, so the resource fetcher now uses per-endpoint selectors.
- **Generic query fallback for non-specialised datasources.** The
  metric editor previously rendered nothing after the datasource picker
  for testdata / loki / elasticsearch / etc., leaving a dead UI; it now
  renders a plain query textarea with a hint pointing at the panel
  query refId fallback path.
- **CollapsableSection key-based remount** so external `isOpen` prop
  changes (right-click sidebar redirects, Edit-button shortcuts) actually
  propagate. Grafana UI's `useState(initialValue)` snapshot pattern
  ignored prop changes after mount.
- **Documented BFS `queued`-set guard in `assignTiers`** now has a
  dedicated diamond fan-in regression test (A→B, A→C, B→D, C→D) so a
  future cleanup can't silently reintroduce the O(N²) regression.

### Added

- **+20 cloud-native node types** with brand-tinted colours and 2-4 char
  icon badges: `aks`, `eks`, `gke`, `lambda`, `function`, `cloudrun`,
  `afd`, `appgw`, `apigw`, `waf`, `kafka`, `pubsub`, `storage`,
  `elasticsearch`, `warehouse`, `idp`, `secrets`, `dns`, `vpn`, `bastion`.
  Plus per-node `colorOverride` field with hex input + native picker.
- **Hybrid click-ops context menu with submenus and sidebar redirects.**
  Right-click a node or edge → Change type, Compact mode, Bidirectional,
  Flow animation, Flow speed, Anchor source/target — all in-menu
  toggles with checkmarks. Plus Edit metrics / Edit alert matchers /
  Edit thresholds / Edit state map / etc. that open the matching
  sidebar card scrolled to the targeted sub-section.
- **CloudWatch namespace / metric / dimension-key autocomplete.**
  Replace plain text Inputs in the CW editor with Selects populated
  from the datasource resource API (`/resources/namespaces`,
  `/resources/metrics`, `/resources/dimension-keys`). Region picker on
  top, populated from a 28-region AWS list. `allowCustomValue` so
  manual entry still works without AWS credentials.
- **Section-targeted edit requests** via `panelEvents.NodeEditSection`
  and `EdgeEditSection`. The hybrid context menu wires through these to
  open a card and expand the requested sub-section in one click.
- **Pure mutation helpers** in `src/utils/nodeMutations.ts` and
  `src/utils/edgeMutations.ts` for canvas click-ops. Single-field,
  immutable, fully tested. Sidebar-mirror fields like alertLabelMatchers
  and metric.query are out of scope by design (must be edited via the
  sidebar to avoid silent desync with open cards).
- **`node.description` / `edge.description` are now rendered** in
  NodePopup and EdgePopup when set. The `Notes / Annotation` TextArea
  in the editors was previously write-only.
- **Local Prometheus dev sidecar.** `prom/prometheus:v2.54.1` scrapes
  Grafana's own `/metrics` endpoint, giving the plugin ~668 real metric
  names to test autocomplete against without any cloud credentials.
- **E2E scaffolding** via `@grafana/plugin-e2e` + Playwright at the repo
  root. 3 smoke specs in `e2e/` exercise plugin discoverability. Run via
  `npm run e2e` against the Docker dev stack.
- **480-test Jest suite across 30 files** (was 267 across 14). New
  coverage: all 3 hooks (`useSelfQueries`, `useAlertRules` incl. the
  5000ms anti-DoS clamp regression, `useDynamicTargets`), all 9 editor
  components (NodeCard, EdgeCard, MetricEditor, NodesEditor,
  EdgesEditor, GroupCard, GroupsEditor, ThresholdList, editorUtils),
  direct unit tests for `cloudwatchResources`, and gap-fill coverage in
  every existing suite (context-menu clipboard, focus-trap inactive
  path, alertRules undefined branches, dynamicTargets regex-escape,
  datasourceQuery 10s timeout).

### Changed

- **`propagateStatus` narrowed to `critical` / `degraded` / `down` only.**
  `warning` and `saturated` no longer propagate degraded colour upstream.
  Broad propagation flooded dense topologies with yellow edges and
  buried the critical path. Matches the function's documented intent.

### Developer experience

- New npm scripts: `npm run e2e`, `npm run e2e:list`, `npm run analyze`.
- `playwright.config.ts` at repo root with `GRAFANA_URL` env override.
- `docker-compose.yaml` passes through `AWS_ACCESS_KEY`, `AWS_SECRET_KEY`,
  `AWS_REGION`, `GRAFANA_URL`, `GRAFANA_API_TOKEN`, `NR_API_KEY` from
  the host shell or a `.env` file.

## 1.0.0 - 2026-04-24

Initial release of the E2E Topology panel plugin for Grafana 12+.

### Visualization
- Interactive SVG topology canvas with bezier edges and animated flow connections
- Neon drop-shadow glow on flow overlays that pulses in the edge's status color
- Draggable nodes with snap-to-grid; positions persist with the dashboard JSON
- HA pair, cluster, and pool group containers with dashed / dotted visual brackets
- Auto-layout via topological sort (top-down or left-right), O(V+E) with diamond fan-in handling
- Pan/zoom: mouse wheel zoom, Ctrl+drag pan, 1:1 reset, Fit-to-view
- Viewport persists across panel remounts (edit ↔ view toggle)
- Mobile responsive: bottom-sheet popup, wrapped toolbar, touch-action pan/pinch
- Honors `prefers-reduced-motion: reduce` and disables flow animations
- Nord-inspired dark theme

### Canvas interactions
- Edge hover dims other edges to 20% for focus-mode read on dense topologies
- Click edge opens metric popup with sparkline and threshold-band pill strip
- Right-click node or edge: context menu with Duplicate, Copy id, Delete, Edit in sidebar
- Shift+drag between nodes creates a new edge with live rubber-band preview
- Click node opens popup with up to 4 summary metrics, sparklines, alerts, and drill-down links
- Double-click node or Edit button scrolls the matching sidebar card into view

### Multi-datasource metric integration
- Prometheus instant queries via datasource proxy
- CloudWatch with namespace, dimensions, stat, and period
- Infinity datasource for any JSON-returning HTTP API (including GraphQL POST bodies)
- Per-metric self-polling with 500ms debounce, AbortController cancellation, and 10s timeout
- Dashboard template variables (`$var`) interpolated into queries and sparkline fetches via `replaceVariables`
- Panel-query fallback via `refId` or `frame.name` match

### Alert integration
- Grafana unified alerting: `useAlertRules` hook matches alerts to nodes via `alertLabelMatchers`
- Configurable poll interval (`animation.alertPollIntervalMs`, default 30s, min 5s)
- Firing-alert badges, rule links, summary annotations, and `runbook_url` deep-links in the popup
- Toolbar stale pill surfaces datasource query failures
- Per-node observability drill-down links with `${token}` URL templating

### Dynamic target queries
- Runtime resolution of one edge definition into N virtual edges, one per discovered target
- Supported across all three datasource types (Prometheus label values, CloudWatch dimensions, Infinity HTTP discovery)
- 60s poll interval; parent-metric value inheritance via `parentId::targetValue` id convention

### Accessibility
- Focus trap in node popup and edge popup (Tab / Shift+Tab, Escape to close)
- Arrow-key navigation and initial focus management in context menu
- Visually-hidden status text beside each node status dot for screen readers

### Editor
- Visual node, edge, and group editors with inline cards
- Search filter in EdgesEditor and GroupsEditor
- Auto-delete orphan edges when a node is deleted
- Round-trip topology export / import as JSON
- Example topology loader (Slot Floor SAS Network)

### Observability
- Per-metric `fetchedAt` freshness timestamps
- Configurable `metricFreshnessSLOSec` threshold with toolbar "N stale" pill
- Live-ticking "Updated Ns ago" labels in popup (15s cadence)

### Build, test, CI
- 165 Jest unit tests across 7 utility modules (93.7% line coverage)
- Component integration tests for NodePopup, EdgePopup, ContextMenu, TopologyPanel
- TopologyCanvas fixture harness with 10 interaction tests (drag, connect, hit-test, wheel)
- GitHub Actions CI (lint, typecheck, test, build) on push + PR
- Tag-triggered release workflow with env-driven plugin signing
- All 44 dependencies pinned to exact versions
- 19 npm audit advisories patched via `overrides`
- Bundle analyzer + composition report

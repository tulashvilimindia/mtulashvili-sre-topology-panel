# Master prompt — E2E Topology Grafana Plugin development

You are working on `mindiatulashvili-sre-topology-panel`, a custom Grafana panel plugin . Read CLAUDE.md first for full project context, architecture decisions, and antipatterns.

## Current state (v1 scaffold)
The plugin scaffold is complete with:
- Full type system (nodes, edges, groups, relationships, runtime state)
- Main panel component with toolbar (auto-layout, expand all)
- Canvas component with SVG bezier edges, animated flow, drag-and-drop, click-to-expand
- Auto-layout algorithm (topological sort + tier-based positioning)
- Edge utilities (anchor points, bezier paths, status calculation, thickness, flow speed)
- Panel editor with example topology loader (Sample E2E)
- CSS with Nord-inspired dark theme
- Example topology matching the Example: CDN → Firewall (HA) → LB (HA) → VS → Pool → 6x Web Servers

## What needs to happen next

### Immediate (get it running)
1. Set up webpack config — the project needs `.config/webpack/webpack.config.ts` from `@grafana/create-plugin`. Run `npx @grafana/create-plugin@latest` in a temp directory, copy the `.config/` folder into this project, and verify `npm run dev` compiles without errors.
2. Fix any TypeScript errors from the scaffold — the types are complete but some component imports may need adjustment.
3. Build and install on (your Grafana URL) — copy dist/ to the Grafana plugins directory, add `allow_loading_unsigned_plugins = mindiatulashvili-sre-topology-panel` to grafana.ini, restart Grafana.
4. Create a test dashboard with the example topology and verify: nodes render, drag works, edges animate, expand/collapse works.

### Phase 2 — Grafana data integration
5. Wire up actual Prometheus/Cloudflare/New Relic queries to node metrics — update datasourceUid and query fields in the example topology to match real datasources on your Grafana instance.
6. Implement proper DataFrame → MetricValue mapping in TopologyPanel.tsx — currently uses refId matching, may need to use frame.name or field.labels for more precise matching.
7. Add template variable support — use `replaceVariables()` from PanelProps on all query expressions before execution.

### Phase 3 — Visual editor
8. Build a proper panel editor UI where you can add/edit/remove nodes and edges via forms instead of raw JSON.
9. Implement drag-to-connect edge creation in edit mode.
10. Add import/export topology as JSON.

### Phase 4 — Polish
11. Edge hover highlighting (dim others to 20% opacity).
12. Edge click → metric detail overlay with full timeseries.
13. Right-click context menu on nodes (Edit, Delete, View in Explore).
14. Zoom/pan with mouse wheel.
15. Dynamic target query for pool member auto-discovery.

## Rules
- Always read CLAUDE.md before starting work
- Run `npm run dev` after every change to verify compilation
- Test in the browser after every significant change
- Do not add external diagramming libraries (no dagre, no d3-force, no elkjs) unless the custom layout proves insufficient at 50+ nodes
- Keep all styles in TopologyPanel.css — no CSS modules, no styled-components
- Dark theme only in v1
- All node positions must be persisted via panel options, not localStorage

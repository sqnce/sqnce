# renderer library research for downstream projects

Date: 2026-06-09
Companion to: `2026-06-09-output-rendering-design.md`

sqnce itself stays zero-dependency; its built-in renderers are hand-rolled generic shapes. This research is for the downstream project that imports sqnce and registers domain renderers (ERD, swim lanes, flow charts) through the `renderers` prop. Every top pick below was verified against the npm registry and GitHub in June 2026 (version, license, downloads, bundle size, React 19 compatibility); corrections from that verification are folded in.

## Headline recommendation

Standardize on **@xyflow/react (React Flow)** as the single diagram foundation. One MIT dependency covers the three hardest renderers: the ERD (custom nodes are plain React components, so a table node is literally a styled HTML table with a connection handle per column row), the automation flowcharts, and the swim lanes (group nodes as lane containers). Custom nodes can link into the run's cross-reference id namespace, which is where most of the digestibility lives.

## Picks by rendering need

### Node-edge diagrams (ERD, flowcharts, swim lanes)

- **@xyflow/react** v12.11.0, MIT, 6.6M downloads/week, ~58 KB gzip plus CSS. React 19 confirmed. Caveats: bring your own layout engine; transitive zustand v4 (fine alone, do not also bundle zustand v5 elsewhere in the app, open issue xyflow/xyflow#5685); import its stylesheet.
- **Layout engines** (pick per view):
  - **elkjs** v0.11.1, EPL-2.0, ~433 KB gzip. The only JS engine with port support (anchors ERD edges to exact column rows), orthogonal edge routing, and partitioning (auto-assigns nodes to ordered lanes). EPL-2.0 is weak file-level copyleft: unmodified npm consumption in an Apache-2.0 app is broadly accepted as fine; keep it as its own lazy worker chunk with the license notice intact. Vite caveat: the built-in worker autoloading does not survive bundling (kieler/elkjs#142, #272); import `elkjs/lib/elk-api` and supply the worker via `new Worker(new URL('elkjs/lib/elk-worker.min.js', import.meta.url))`.
  - **@dagrejs/dagre** v3.0.0, MIT, ~13 KB gzip. Perfect for the simple layered cases (16 trigger-to-effect automation flows, 6-stage process flow). No ports, no lanes, so not enough for the ERD or swim lanes. Use this package, not the dead `dagre`.
- Avoid: `@projectstorm/react-diagrams` (no release since Feb 2024), `webcola` (last release 2019), original `dagre`. Situational: `cytoscape` (canvas, superb for force-directed exploration of the ~150-item link graph, wrong tool for ERD/lanes; its 8.7M weekly downloads are inflated by mermaid's dependency tree), `@antv/x6` (capable SVG editor engine, Chinese-first docs), `reaflow` (Apache-2.0, bundles elkjs with no isolation, maintenance lukewarm).

### Swim lanes and timelines specifically

- No maintained, permissively licensed, React-native swim-lane library exists (verified by a dedicated search). Build lanes on React Flow group nodes (one group per act or persona, scenes as children with `parentId` and `extent: 'parent'`, geometry computed from the JSON). If scenes never need cross-lane arrows, a plain CSS grid is the honest lighter answer.
- The 23-step click-path is a stepper: hand-rolled CSS, or **react-chrono** v3.3.3 (MIT) only as a linear timeline and only with caveats. Verification refuted its advertised size (real cost ~90 KB gzip including a CSS file the JS does not import, not the ~10 KB bundlephobia reports), it has no lanes mode, and maintenance is stalling (single maintainer, silent since Dec 2025). Lean hand-rolled.
- **bpmn-js** has true pools and lanes but consumes BPMN 2.0 XML (you would write a JSON-to-XML generator) and its license requires a non-removable "Powered by bpmn.io" watermark; check whether that is acceptable in customer-facing artifacts before considering it.

### Markdown documents (narratives, specialist notes, design briefs)

- **react-markdown** v10.1.0 + **remark-gfm** v4.0.1, MIT, ~48 KB gzip together. Renders to real React elements (no innerHTML), safe defaults, and the `components` prop maps internal-id links to app links. Memoize on the markdown string: 30-70 KB documents re-parse on every render otherwise. Maintenance note: last release early 2025; the unified ecosystem treats it as finished software (5 open issues, 23.5M downloads/week).
- **markdown-to-jsx** v9.8.2, MIT, ~25 KB gzip, zero runtime dependencies, GFM tables native, actively released. The credible lighter alternative if dependency count matters more than spec-exact CommonMark.
- For sqnce's own built-in markdown renderer the hand-rolled-subset decision stands: `snarkdown` (the only vendorable-size parser) has no table support, and the docs are full of pipe tables. If hand-rolling ever proves too costly, `marked` (zero-dep, MIT, ~12 KB, but HTML-string output needing DOMPurify) or `markdown-to-jsx` are the fallback discussion.

### Tables and the cross-linked catalog

- **@tanstack/react-table** v8.21.3 (pin v8; v9 is in beta), MIT, ~15 KB gzip, headless. Cells render arbitrary JSX, so cross-links into the id namespace are plain router links; master-detail is free via row expansion (the same feature is Enterprise-only in AG Grid at $999/dev and Pro-only in MUI X). One column-def pattern covers the catalog, KPI tables, and traceability matrices. Caveat: with the React Compiler enabled, v8 tables may not re-render on data changes (issue #5567); use the `'use no memo'` directive or keep the compiler off those components.
- Avoid: `@glideapps/glide-data-grid` (stable is 28 months old, fails npm peer resolution on React 19, canvas cells cannot carry real links).

### JSON tree (raw data fallback, debugging)

- **@uiw/react-json-view** 2.0.0-alpha line (pin the exact version; the alpha tag is the actively released, documented line), MIT, ~9 KB gzip, zero deps, CSS-variable theming.
- **react-inspector** v9.0.0 (pin exactly 9.0.0, never 8.0.0 which was published without source), MIT, ~7 KB gzip, explicit React 19 peers, devtools aesthetic.
- Neither has search or virtualization: collapse to depth 1-2 by default and never expand-all a 135 KB document. Avoid the original `react-json-view` (dead since 2021, React 17 ceiling, still 1.1M downloads/week from legacy lockfiles).

### Text-to-diagram DSLs (optional)

- **mermaid** v11.15.0+, MIT. Pin at or above 11.15.0 (it fixes CVE-2026-41149 and siblings) and keep `securityLevel` strict. Lazy ESM entry is ~153 KB gzip before per-diagram chunks. Honest fit: fine for flowcharts and sequence diagrams arriving inside markdown; weak for a 23-table ERD and rigid for swim lanes (`journey` forces 1-5 scores, actors are labels not lanes). With React Flow already in the stack, mermaid is mostly unnecessary.
- **@viz-js/viz** v3.28.0, MIT, ~468 KB gzip real-world, lazy-loadable. Graphviz DOT with HTML-like table labels is still the most readable zero-custom-code way to render a large ERD; the situational alternative if building React Flow table nodes is deferred. Use this package, not the dead `viz.js` v2.
- Avoid client-side: `@terrastruct/d2` (~6 MB gzip WASM, MPL-2.0, maintenance slowed).

### KPI tiles and small charts

- **chart.js** v4.5.1 + **react-chartjs-2** v5.3.1 (React 19 floor) + **chartjs-chart-matrix** v3.0.4, all MIT. Realistic tree-shaken cost ~53-60 KB gzip for bar/line plus tooltip and legend (verification corrected the optimistic 35-45 KB estimate). Canvas cells cannot hyperlink: use onClick handlers, or better, render the traceability matrix as a plain CSS-grid heatmap whose cells are real anchor links into the id namespace and reserve the chart lib for KPI tiles.
- **recharts** v3.8.1, MIT, ~139 KB gzip (v3 embeds Redux Toolkit and immer). The ecosystem default (shadcn/ui charts build on it) if JSX-composed charts are preferred; no native heatmap.
- Avoid: `visx` (stable is 19 months old, React 19 only via a long-running alpha), `@tremor/react` (frozen since the Jan 2025 Vercel acquisition, React 18 ceiling; its successor is copy-paste Recharts components, not a package).

### Embeddable ERD components (checked, none viable)

`drawdb` is AGPL-3.0 and app-only. `azimutt` is MIT but an Elm/Elixir app; its npm packages are schema parsers, not renderers. `@liam-hq/erd-core` is Apache-2.0 and beautiful but explicitly internal and unstable (the supported surface is a CLI that generates a static site; viable as a linked companion artifact, not an imported component). This confirms the custom React Flow ERD path.

## What this changes for sqnce

Nothing. No package surfaced that justifies a dependency inside `@sqnce/core` or `@sqnce/react`: the built-ins stay hand-rolled generic shapes, and every library above belongs in the importing project behind the `renderers` prop. The one fallback worth recording: if the hand-rolled markdown subset proves too costly, `markdown-to-jsx` (zero-dep) or `marked` are the candidates to revisit, as a deliberate exception to the no-deps preference.

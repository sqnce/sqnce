# sqnce output rendering controls: design

Date: 2026-06-09
Status: approved in brainstorming, pending issue + implementation plan

## Problem

A sqnce definition describes what a step produces (text, fields, file, link) but not how to show it. The rolodex renders every output as a raw editor control: a textarea, labeled inputs, a URL input, or a file-name chip. Rich structured content has no readable presentation at all: a file output's extracted text is stored but never displayed, and an output type the UI does not recognize renders nothing.

Real runs produce exactly that kind of content. The reference example is `.pwf/run` (a presales pursuit run produced by an external swarm tool): a 23-table data model with 18 custom columns, 16 automations with trigger and effect shapes, a 10-scene demo narrative organized by act and persona, a 6-stage business process flow, KPI catalogs, and traceability matrices, all sharing one cross-reference id namespace. Presented as plain text, none of it is digestible. Presented well, the data model is a navigable table list or an ERD, the demo scenario is swim lanes or a flow chart, the narrative is a readable document.

sqnce must stay a light, generic framework. It cannot know about Dataverse tables or demo scenes. A downstream project will import sqnce and supply the domain-specific rendering. sqnce's job is the mechanism: let a definition declare how outputs should be presented, render generic shapes well out of the box, and give downstream projects a clean extension point.

## Decisions made

1. **Presentation is decided at authoring time and recorded as data.** An AI (or human) authoring a definition or downstream project picks the presentation per output and records it in the definition JSON. No LLM in the render path; the engine and UI stay deterministic.
2. **Schema shape: a `render` hint plus one new `data` output type.** Not a vocabulary of presentation-oriented output types, and not hints alone over string-stuffed file content.
3. **sqnce ships generic shape renderers only.** Domain visuals (ERD, swim lanes, flow charts) come from the importing project through a renderer registry prop.
4. **Layout: inline view with expand.** Rendered views appear height-capped in the step body and can expand to a full-screen overlay.
5. **Dependencies stay downstream; knowledge moves upstream.** Adversarially reviewed (see "Renderer ownership" below). sqnce publishes no renderer packages: it owns the kind vocabulary as documentation, ships a demanding vendorable reference renderer in the demo, and defers any published @sqnce/renderers-* package behind an explicit extraction trigger.

## Definition schema

Two additions, both pure JSON:

### `render` hint (optional, on any output spec)

```json
{
  "id": "inventory",
  "type": "data",
  "label": "Build inventory",
  "render": {
    "kind": "cards",
    "options": { "items": "$.dataverse_tables", "title": "name" }
  }
}
```

- `kind`: free string, deliberately not whitelisted. Core cannot know what renderers exist downstream.
- `options`: optional object, opaque renderer-specific config, passed through untouched.
- The hint works on existing types too: `{ "type": "text", "render": { "kind": "markdown" } }` displays the text as rendered markdown; a `file` output with a hint renders its extracted content.

### `data` output type (new, fifth type)

Value is arbitrary JSON (object or array). Structured artifacts (inventories, findings, scene lists) become first-class values instead of strings inside `file` content. Without this, every rich renderer downstream would start by parsing strings back out of the file type (which also truncates attached content).

## Core (`@sqnce/core`)

Smallest possible footprint. Core never renders and never interprets `kind`.

- `validateDefinition`: accept `"data"` in the output type whitelist. If `render` is present: `kind` must be a non-empty string; `options`, when present, must be an object. Nothing else is checked.
- `hasValue` for `data`: non-empty array, object with at least one key, or non-blank primitive.
- `serializeStep` for `data`: label plus `JSON.stringify` of the value, capped like file content, so draft prompts keep working unchanged.
- No other engine function changes. No new dependencies.

## UI (`@sqnce/react`)

### Refactor

Extract the hardcoded output type if-chain (ProcessRolodex.jsx, the `(step.outputs || []).map(...)` switch) into an `OutputView` component. This is the seam the whole feature hangs on.

### Renderer registry prop

New optional `renderers` prop, following the existing injected-capability pattern (`persistence`, `generateDraft`): the component fully works when it is omitted.

```jsx
<ProcessRolodex
  workflows={[presales]}
  renderers={{ erd: ErdView, swimlanes: SwimLanes }}
/>
```

Resolution order for an output with `render.kind`:

1. `renderers` prop (importing project wins)
2. built-in renderers
3. shape-based fallback (JSON tree for data, default editor otherwise)

An unknown kind never renders blank; it falls back.

### Renderer contract

A renderer is a pure presentation component receiving:

- `spec`: the output spec (including `render.options`)
- `value`: the stored output value
- `onChange(value)`: write callback (renderers may be view-only and ignore it)
- `context`: `{ workflowId, stepId, subject, readOnly }`

Two contract rules, both forced by adversarial review:

- `onChange` carries value mutations only. Renderer view state (selection, pan and zoom, expansion) stays internal and must never flow into the value: `serializeStep` serializes values into draft prompts, so leaked view state would silently pollute LLM context.
- The contract is not documented as stable until the demo's reference diagram renderer (see Showcase) has been built against it. Gaps that renderer exposes (likely candidates: an expanded/resize signal in `context` for the inline-to-overlay transition, a portal target so overlays escape the rolodex's transformed ancestors, behavior under async layout of large values) are fixed in `@sqnce/react` within this feature, not after release.

### Built-in generic shape renderers (zero dependencies)

Keyed by content shape, not domain:

- `markdown`: minimal hand-rolled subset (headings, lists, tables, code fences, emphasis)
- `table`: array of uniform objects
- `cards`: navigable item list with a detail pane
- `keyvalue`: flat object
- fallback: collapsible JSON tree for `data` outputs (no hint, or unknown kind); other output types with an unknown kind fall back to their default editor

### Layout and editability

- Rendered views sit inline in the step body, height-capped and scrollable, with an expand control opening a full-screen overlay.
- `data` outputs are view-first with a raw-JSON edit toggle, so hybrid gates can still be satisfied by hand.
- Hinted `text` outputs get a view/edit toggle.

## Showcase and docs

- Extend `definitions/presales.json` with `data` outputs where natural (for example a build-inventory output on the demo stage rendered as `cards`; narrative steps hinted as `markdown`).
- Extend the Pacific Ridge Steel seed in `examples/demo` with trimmed real content from `.pwf/run` (scenes, tables plus columns, automations) so the GitHub Pages demo shows rendering working.
- The demo app registers a real diagram renderer through the `renderers` prop: a React Flow + elkjs (or @dagrejs/dagre for the simple layered case) renderer at `examples/demo/src/renderers/`, rendering the Pacific Ridge automations or scene flow (these, unlike the tables, carry usable relationship data). Its dependencies live in `examples/demo/package.json` only, never in `packages/*`. It is written as clearly marked vendorable reference code: a header stating "copy this file into your project; this is not a published package and carries no semver promise", zero imports from `@sqnce/react` (the layering proof), the Vite worker wiring from the research doc inline with pointers for other bundlers, ELK as a lazy chunk with its EPL-2.0 notice, and the version pins from the research doc. A trivial renderer (the originally planned stage chevron) cannot fail in any of the ways real renderers fail, so it validates nothing; this one is deliberately chosen to stress the contract's hard cases. CI's existing demo build verifies it on every PR and GitHub Pages showcases it.
- A docs-only kind vocabulary, `docs/render-kinds.md` linked from the README: normative value shapes for the built-in kinds (markdown: string; table: array of uniform objects; cards: item array plus a title selector; keyvalue: flat object); reserved names with explicitly provisional, non-normative suggested shapes for `flow` ({nodes, edges}), `lanes` ({lanes, items with laneId}), and `erd` ({entities with attributes, relations}), marked subject to change until two independent consumers exist; and a namespacing rule: bare kind names are reserved for sqnce-documented kinds, app-private kinds take a prefix (for example `pwf:erd`). `validateDefinition` stays unchanged; the vocabulary is convention, not enforcement.
- Promote the renderer library research to a discoverable location (`docs/RENDERERS.md` or equivalent, linked from the README custom-renderers section) so the perishable pins (mermaid at or above 11.15.0 for the CVE, react-inspector exactly 9.0.0, TanStack v8) are public, refreshed when the demo renderer's own pins are bumped.
- Update `examples/claude-artifact/process-rolodex.jsx` to match, per CLAUDE.md.
- README gains a "custom renderers" section (see next section).
- CLAUDE.md: document the `data` type, the rule that renderers never enter core, and the renderer-packages non-goal with its extraction trigger.

## Guidance for downstream renderer authors (to be genericized in the README)

Why domain visuals belong in the importing project, and what to consider when building one:

1. **Data-shape coupling.** There is no universal JSON shape for a data model, a flow, or a scenario. A domain renderer must know its data: in the reference run, tables live in one section, their columns in another (joinable by table name), and relationships are split between id arrays and prose. Only the project that owns the data can render it faithfully.
2. **The dependency decision stays with the importer.** Good diagrams (auto-layout, pan and zoom, edge routing) usually justify a library. Keeping diagram renderers downstream keeps that choice downstream; sqnce stays dependency-free and imposes nothing on other users.
3. **Domain affordances are the value.** What makes content digestible is domain-specific: status badges, citation popovers, cross-links between items sharing an id namespace, highlight markers. A generic diagram renders boxes and misses the parts that matter.
4. **Renderers are pure presentation.** Take `spec`, `value`, `onChange`, `context`; no fetching, no engine calls, no side effects. View-only renderers are normal and expected.
5. **Fail soft.** sqnce falls back to a generic view for unknown kinds; renderers should likewise tolerate missing or partial data (render what is there, never throw on shape drift).
6. **Maintenance.** Every renderer is API surface its owner must test and document. Ship a renderer where its data lives.

Verified library recommendations for downstream renderer authors (diagrams, markdown, tables, JSON trees, charts) are in `2026-06-09-renderer-library-research.md`.

## Renderer ownership: why sqnce publishes no renderer packages

The assumption that downstream projects should manage rendering dependencies, rather than sqnce shipping optional packages like @sqnce/renderers-diagrams, was adversarially reviewed (three advocates, three defenders, three independent judges). All three judges converged on the same resolution: dependency ownership stays downstream, knowledge ownership moves upstream. The record, so the decision is not re-litigated casually:

What the challenge got right (absorbed above):

1. **The contract had no demanding consumer.** Built-ins plus a stage chevron are synchronous, stateless, and small; they validate the registry lookup and nothing else. The contract's hard cases would have shipped untested and surfaced downstream as breaking changes. Fixed: the demo's custom renderer is now a real React Flow + elkjs diagram, built before the contract is documented as stable.
2. **Vocabulary neutrality was already forfeit.** The built-in kinds (markdown, table, cards, keyvalue) are sqnce-named kinds with sqnce-implied shapes. Refusing to name flow, lanes, and erd would not have kept sqnce generic; it would have guaranteed per-app fragmentation that the fail-soft fallback converts into silent loss of authoring intent. Fixed: the docs-only kind vocabulary with a namespacing rule.

Why publishing renderer packages still loses:

1. **The prerequisite is falsified by the founding dataset.** A packaged ERD renderer needs a normalized value contract, and the reference run cannot fill one mechanically: zero of the 23 inventory tables carry a relationships key (edges live in prose plus domain knowledge), and columns join to tables by fuzzy display name. Freezing a shape from a sample of one that cannot produce it is invented standardization; the escape hatch is a JSONPath options mini-language (the inner-platform effect). The hard 80 percent (domain extraction) is downstream work either way.
2. **The genuinely shared glue is the least packageable part.** The elkjs worker wiring is bundler-specific and behaves differently inside node_modules than in app source (pdfjs and monaco are the standing precedent for worker-shipping packages drowning in bundler issues), and sqnce distributes raw untranspiled ESM with no build step. Vendored code lets each project adapt one bundler-coupled line it had to understand anyway.
3. **Maintenance economics.** One maintainer, no publish pipeline, no UI test harness, zero external consumers. The library research doc is itself a census of identically resourced renderer wrappers dying (reaflow, which is structurally the proposed package, sits on its avoid list; a dead published package keeps stranding users, see react-json-view at 1.1M weekly downloads five years after abandonment, while a stale example file inconveniences nobody). Even funded teams distribute this layer as copy-paste templates (xyflow's Pro templates, shadcn).
4. **House pattern.** Renderers are the third injected capability after `persistence` and `generateDraft`, and sqnce ships a provider package for neither; reference implementations live in examples. Publishing renderer packages would change the product from a workflow engine with a headless extension contract into a component vendor.

**Extraction trigger** (record in CLAUDE.md as a non-goal with a condition): a published @sqnce/renderers-diagrams may be extracted from the proven vendored reference only when at least two independent downstream projects have vendored the glue, the provisional value shapes have survived both without options creep, and there is maintainer capacity for the React Flow and elkjs upgrade treadmill. Until then, the absence of an official renderers package is a documented decision, not an omission.

## Tests

Core tests (`node:test`, no new frameworks):

- `validateDefinition`: `data` type accepted; `render` without `kind` rejected; non-object `options` rejected; all bundled definitions still validate.
- `hasValue` for `data`: empty object, empty array, null, populated cases.
- `serializeStep` for `data`: serialization and cap.

UI verification via the demo build (CI already runs `npm run build -w examples/demo`) and the JSX syntax check.

## Out of scope

- Runtime AI renderer selection (an injected classify-and-present capability). Authoring time only.
- sqnce reading `.pwf/` or any external run format directly. Downstream projects map artifacts into run state (seeds, persistence, or their own import code).
- Diagram primitives (node-edge graph, lanes, chevron) inside `@sqnce/react`.
- Published @sqnce/renderers-* packages. Deferred behind the extraction trigger in the Renderer ownership section.
- Any new npm dependency in `packages/*`. `examples/demo` may carry renderer dependencies as vendorable reference code; that is a deliberate, named exception.
- Editing experiences for rich structured data beyond the raw-JSON toggle.

## Key behaviors to preserve

- All existing definitions remain valid; outputs without `render` hints render exactly as today.
- `persistence` and `generateDraft` omission behavior is unchanged; `renderers` omission behaves the same way.
- Hybrid and strict gate semantics are untouched; `data` outputs participate in gates through `hasValue` like any other output.
- Draft prompt serialization keeps working for definitions that predate this change.

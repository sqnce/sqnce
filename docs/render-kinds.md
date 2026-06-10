# render kinds

A definition's output spec may carry a render hint:

```json
{ "id": "inventory", "type": "data", "label": "Build inventory",
  "render": { "kind": "cards", "options": { "title": "name", "subtitle": "purpose" } } }
```

`kind` selects how the output is presented. The engine never interprets it; `@sqnce/react` resolves it against the `renderers` prop first, then the built-ins below, then falls back. `options` is opaque renderer-specific configuration, passed through untouched.

## Built-in kinds (normative value shapes)

These ship in `@sqnce/react` with zero dependencies. The value shapes are normative: a definition using these kinds commits to these shapes.

| kind | value shape | notes |
| --- | --- | --- |
| `markdown` | string | subset: ATX headings, paragraphs, lists, blockquotes, fenced code, horizontal rules, pipe tables, inline code/bold/italic/links. React elements only, no innerHTML; link hrefs limited to http(s), mailto, fragment |
| `table` | array of uniform objects | columns are the union of keys over the first 50 rows |
| `cards` | array of objects | navigable list plus detail pane; `options.title` and `options.subtitle` name the item keys used as labels (defaults probe `name`/`title`/`id` and `purpose`/`description`) |
| `keyvalue` | flat object | one row per key; row labels resolve per key: `options.labels` wins, then a `fields` output's declared `{ key, label }` pairs, then the raw key |

Hints work on every output type. On `text` outputs the value string is rendered (view/edit toggle); on `file` outputs the extracted `content` text is rendered (a file value with no extracted text falls back to the attachment display); `data` outputs are view-first with a raw JSON editor behind an Edit toggle.

`keyvalue` labels: `"render": { "kind": "keyvalue", "options": { "labels": { "dealSize": "Deal size" } } }` relabels keys on plain `data` objects. A `fields` output's declared labels apply automatically with no options; `options.labels` overrides them per key; unmapped keys display as-is.

## Fallback (fail soft)

An unknown `kind` never renders blank: `data` outputs fall back to a collapsible JSON tree, every other type falls back to its default editor. A definition using a custom kind stays fully usable in an app that has no renderer for it; the chosen presentation just does not appear.

## Reserved kinds (provisional shapes)

These names are reserved with suggested minimal value shapes so definitions stay portable as data. The shapes are provisional and explicitly subject to change until two independent consumers exist; implement them via the `renderers` prop (see the reference implementation for `flow` at `examples/demo/src/renderers/FlowDiagram.jsx`).

| kind | suggested value shape |
| --- | --- |
| `flow` | `{ nodes: [{ id, label, group? }], edges: [{ from, to, label? }] }` |
| `lanes` | `{ lanes: [{ id, label }], items: [{ id, laneId, title }] }` |
| `erd` | `{ entities: [{ name, attributes: [] }], relations: [{ from, to, cardinality? }] }` |

## Namespacing rule

Bare kind names are reserved for sqnce-documented kinds (built-in or reserved above). App-private kinds take a prefix so collisions are impossible rather than coordinated: `pwf:erd`, `myapp:org-chart`. A prefixed kind is a private contract between a definition and the app that registers its renderer.

## The renderer contract

A renderer is a pure presentation component receiving `{ spec, value, onChange, context }`:

- `spec`: the output spec, including `render.options`.
- `value`: the stored output value.
- `onChange(value)`: value mutations only. Renderer view state (selection, pan, zoom, expansion) stays internal; values feed `serializeStep`, which feeds LLM draft prompts, so leaked view state pollutes prompt context. View-only renderers that never call `onChange` are normal.
- `context`: `{ workflowId, stepId, subject, readOnly, expanded }`. `expanded` is true inside the full-screen overlay; re-fit or re-measure on its change.

Renderers should fail soft on shape drift: render what is there, never throw.

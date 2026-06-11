# CLAUDE.md

## What this is

sqnce (pronounced "sequence") is a reusable framework for staged, gated workflows. A process is defined as data (a "sqnce"), executed by a pure engine, and visualized as a rolodex UI that centers the active sub-stage and feeds each stage's outputs into the next. Repo: github.com/sqnce/sqnce.

## Architecture (do not blur these layers)

1. **Definitions** (`/definitions/*.json`): pure JSON trees. MainStage > SubStage > Step > Output spec. Output types: `text | fields | file | link | data` (`data` values are arbitrary JSON). Any output spec may carry an optional `render: { kind, options }` hint; `kind` is a free string validated loosely (non-empty), never whitelisted, and `options` is opaque renderer config. The kind vocabulary lives in `docs/render-kinds.md`. Steps with no outputs are checklist steps. Each sub-stage has `gate: { type: "hybrid" | "strict" }`. Each definition declares a `subject` (which field names the thing the process is about). Step ids must be unique across a definition. `validateDefinition` must pass; the test suite checks all bundled definitions. Ownership (#35, option a): `definitions/` is the single shared content library, consumed by the README quickstart, the demo app, and core's validation test; the framework's relationship to it is validate-only (engine behavior tests run on a core-owned fixture under `packages/core/test/fixtures/`, never on bundled content). Revisit a split (neutral examples at root, demo content under `examples/demo/definitions/`) if demo-specific tuning keeps accreting. The demo-repo split is deferred until after #2 (npm publish); once published, a cheaper intermediate is a CI job that packs both packages and installs the tarballs into the demo build.
2. **Engine** (`packages/core`, `@sqnce/core`): pure functions, zero dependencies, no UI, no provider coupling. State in, new state out. Run shape: `{ idx, frontier, stepState }`. `idx` is the flat sub-stage index of the centered card; `frontier` is the furthest committed main stage; browsing moves freely within committed main stages; `advance` commits the next main stage at its boundary gate, the aggregate of the stage's sub-stage gates (with `force` override). `buildDraftPrompt` returns a string; the engine never calls an LLM.
3. **UI** (`packages/react`, `@sqnce/react`): the rolodex component. `persistence`, `generateDraft`, and `renderers` are injected props; the component must keep working when any is omitted. Renderer resolution order: `renderers` prop, then built-ins (markdown, table, cards, keyvalue), then fallback. Renderers never enter core.

## Key behaviors to preserve

- Hybrid gate: a step is complete when it has any output OR is marked done. Strict gate: explicit done only.
- The hard gate sits at main-stage boundaries: the boundary gate aggregates the stage's sub-stage gates, and sub-stages within a main stage are freely navigable with no commit between them.
- Advancing past an unmet gate must always remain possible via the explicit override (guide, never hard-block).
- Browsing history never moves the frontier; advancing while browsing a committed main stage is a no-op.
- Completed prior outputs are serialized into draft prompts (fields as labeled lines, files as name plus extracted text, data as capped JSON).
- Run state lives in a versioned run store (multiple named runs per workflow); switching workflows or runs is non-destructive. Archiving is manual only and archived runs open read-only; nothing archives a run automatically.
- Unknown render kinds never render blank: JSON tree fallback for data outputs, default editor otherwise.
- Renderer onChange carries value mutations only; renderer view state (selection, pan, zoom) never enters the value, because serializeStep leaks values into LLM draft prompts.

## Conventions

- Never use em dashes anywhere: code, comments, docs, commit messages, UI copy. Use commas, parentheses, colons, or sentence breaks.
- Brand is lowercase `sqnce` everywhere, including headings.
- Plain ESM JavaScript, no build step in `core`. Tests use Node's built-in runner (`node:test`, Node 20+).
- License is Apache-2.0.
- Keep `@sqnce/core` dependency-free. New UI work goes in `@sqnce/react` or a new package, never into core.
- Renderer packages are a non-goal: reference renderers live in examples (`examples/demo/src/renderers/`) and are meant to be copied, not depended on. Extract a published @sqnce/renderers-* package only when at least two independent downstream projects have vendored the glue, the provisional value shapes survived both, and there is capacity for the React Flow and elkjs upgrade treadmill.

## Commands

- `npm install` (workspaces: packages/*, examples/demo)
- `npm test` (runs packages/core/test/engine.test.js)
- `npm run build -w examples/demo` (build the demo app; CI runs this on every PR)
- `npm run types` (generate .d.ts from JSDoc into packages/*/types; prepack runs it, CI checks it)
- Syntax check for JSX: `npx esbuild <file> --bundle --format=esm --external:react --external:@sqnce/core --outfile=/dev/null`

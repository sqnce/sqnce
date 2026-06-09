# CLAUDE.md

## What this is

sqnce (pronounced "sequence") is a reusable framework for staged, gated workflows. A process is defined as data (a "sqnce"), executed by a pure engine, and visualized as a rolodex UI that centers the active sub-stage and feeds each stage's outputs into the next. Repo: github.com/sqnce/sqnce.

## Architecture (do not blur these layers)

1. **Definitions** (`/definitions/*.json`): pure JSON trees. MainStage > SubStage > Step > Output spec. Output types: `text | fields | file | link`. Steps with no outputs are checklist steps. Each sub-stage has `gate: { type: "hybrid" | "strict" }`. Each definition declares a `subject` (which field names the thing the process is about). Step ids must be unique across a definition. `validateDefinition` must pass; the test suite checks all bundled definitions.
2. **Engine** (`packages/core`, `@sqnce/core`): pure functions, zero dependencies, no UI, no provider coupling. State in, new state out. Run shape: `{ idx, frontier, stepState }`. `frontier` is the furthest committed sub-stage; browsing moves within `[0, frontier]`; `advance` commits the frontier (with `force` override). `buildDraftPrompt` returns a string; the engine never calls an LLM.
3. **UI** (`packages/react`, `@sqnce/react`): the rolodex component. `persistence` and `generateDraft` are injected props; the component must keep working when either is omitted.
4. **Artifact example** (`examples/claude-artifact/process-rolodex.jsx`): a self-contained copy that runs in claude.ai with inlined configs, the Anthropic API for drafts, and `window.storage` persistence. When engine or UI behavior changes, update this file to match.

## Key behaviors to preserve

- Hybrid gate: a step is complete when it has any output OR is marked done. Strict gate: explicit done only.
- Advancing past an unmet gate must always remain possible via the explicit override (guide, never hard-block).
- Browsing history never moves the frontier; advancing from a non-frontier position is a no-op.
- Completed prior outputs are serialized into draft prompts (fields as labeled lines, files as name plus extracted text).
- Per-workflow run state is namespaced by workflow id; switching workflows is non-destructive.

## Conventions

- Never use em dashes anywhere: code, comments, docs, commit messages, UI copy. Use commas, parentheses, colons, or sentence breaks.
- Brand is lowercase `sqnce` everywhere, including headings.
- Plain ESM JavaScript, no build step in `core`. Tests use Node's built-in runner (`node:test`, Node 20+).
- License is Apache-2.0.
- Keep `@sqnce/core` dependency-free. New UI work goes in `@sqnce/react` or a new package, never into core.

## Commands

- `npm install` (workspaces: packages/*, examples/demo)
- `npm test` (runs packages/core/test/engine.test.js)
- `npm run build -w examples/demo` (build the demo app; CI runs this on every PR)
- Syntax check for JSX: `npx esbuild <file> --bundle --format=esm --external:react --external:@sqnce/core --outfile=/dev/null`

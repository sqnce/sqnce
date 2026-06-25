# spec: expose the active runId in the renderer context

Issue: #94 (expose the active run id to custom output renderers). Milestone: consumer extension points.

A custom output renderer receives a `context` object describing where it is rendering, but not which run it belongs to. The engine already computes the active run id and passes it to `generateDraft`'s context (`{ workflowId, stepId, subject, runId }`); renderers have no equivalent. This spec adds `runId`, the active run entry id, to the renderer `context`, mirroring the draft context that already carries it. The change is generic, additive, and backward-compatible: existing renderers ignore the new field and nothing else changes.

Layer: pure `@sqnce/react`. No `@sqnce/core` change. Motivated by presales-sqnce #135 (a source-citation side panel), but the affordance is product-agnostic.

## Current behavior

A renderer is a consumer-supplied React component resolved by render kind. It receives `{ spec, value, onChange, context }`. The `context` today is `{ workflowId, stepId, subject, readOnly, expanded }`. The `runId` is absent.

The renderer `context` is built at two sites, both passing an object literal to `OutputView`, which then spreads it through to the resolved renderer (adding `expanded` per view branch):

- `packages/react/src/ProcessRolodex.jsx` (the editing / rolodex view): `{ workflowId: def.id, stepId: step.id, subject: subjectName, readOnly }`. The active run entry is in scope here as `entry` (it can be null for a brand-new workflow that has no run yet); `run` falls back to a placeholder when `entry` is null.
- `packages/react/src/ReadingView.jsx` (the reading view for a finished run): `{ workflowId: def.id, stepId: step.id, subject: subjectName, readOnly: true, expanded: false }`. The active run id is already a prop here (`runId`, passed down from `ProcessRolodex` as `entry ? entry.id : null`). (The `expanded: false` it sets is overridden by `OutputView` per branch, so it carries no behavior.)

The active run entry id is already available at both sites. The `generateDraft` context next to the first site already uses it as `runId: entry.id`.

## Problem

A host that needs run-wide data while rendering a per-step output cannot reliably tell which run a renderer belongs to. The concrete case (presales-sqnce #135): resolving a citation in one step's output back to another step's output of the *same* run. The host's only run-wide source is the persisted run store, but the store's active-run pointer lags a live run switch by the 500ms save debounce, so during that window the host resolves against the previously active run.

With `context.runId` the host looks the run up directly in the store's `entries[runId]` (every saved run's data is already present there), bypassing the lagged active-run pointer, so it resolves against the correct run with no debounce window.

## Change

Add `runId` (the active run entry id, type `string | null`) to the renderer `context` at both build sites, and document it.

1. **Editing / rolodex view** (`ProcessRolodex.jsx`): add `runId: entry ? entry.id : null` to the `OutputView` context. The nullable form matches how the existing `renderRunHeader` and `runStatus` props already type `runId` (the active entry can be absent), and matches the `entry ? entry.id : null` already passed to `ReadingView`.
2. **Reading view** (`ReadingView.jsx`): add `runId` (the existing nullable prop) to the `OutputView` context. The issue names only the first site, but the reading view renders the same outputs through the same `OutputView`, and the issue's own motivating scenario (a citation panel on a *finished* run) is viewed in reading mode. Leaving reading mode out would make the affordance unreliable exactly where it is most needed, so both sites get `runId`.
3. **Typedef**: add `@property {string | null} runId` to the `RendererContext` typedef in `ProcessRolodex.jsx`.
4. **Renderer-contract comment**: the authoritative contract comment that enumerates the context fields is in `packages/react/src/OutputView.jsx` (its header comment ends with the line `context = { workflowId, stepId, subject, readOnly, expanded }`). Add `runId` to that enumeration so it does not go stale. (The `renderers` prop prose comment in `ProcessRolodex.jsx` does not enumerate the fields, so it needs no change; touch it only if a one-line mention reads naturally.)
5. **Consumer docs**: the root `README.md` "Custom renderers" section documents the renderer `context` for consumers. Add a one-line mention of `context.runId` (the active run entry id, for hosts that resolve run-wide data from a shared store), mirroring how `README.md` already documents the `generateDraft` context's `runId`. Without it, the new affordance is undocumented for the consumers it is built for.
6. **Types**: `RendererContext` feeds `RendererProps`, part of the public prop surface, so run `npm run types` and confirm it succeeds (`tsc` emits no error). The generated `.d.ts` are gitignored (`.gitignore` ignores `packages/*/types/`), so nothing is committed; CI's `test` job runs `npm run types`, and its `pack` job verifies each packed tarball contains `types/index.d.ts` (produced by `prepack`).

### Single source for the renderer context (enabling the test)

The two build sites duplicate the context shape, and that duplication is why the drift this issue fixes exists: `generateDraft`'s context gained `runId` while the renderer context did not. The repo's React tests are pure-function unit tests of extracted helpers (`packages/react/src/badge.js`, `packages/react/src/runStatus.js`); there is no DOM-render harness, and adding one is out of step with the repo.

So extract a tiny pure helper, `buildRendererContext({ workflowId, stepId, subject, readOnly, runId })`, into its own module under `packages/react/src/`, returning `{ workflowId, stepId, subject, readOnly, runId }`. Both build sites call it (each still supplies its own `readOnly` and its `runId`). This is behavior-preserving (the emitted object is identical to today plus the new `runId` field) and it removes the duplication that allowed the drift. The `expanded` field stays where it is set today, in `OutputView` per view branch, since `OutputView` already overrides it.

## Testing

A new React-layer unit test (`packages/react/test/rendererContext.test.js`), following the `badge.test.js` / `runStatus.test.js` pure-function pattern, asserting that `buildRendererContext`:

- includes `runId` equal to the value passed in (the active entry id),
- yields `runId: null` when no active entry id is supplied (the brand-new-workflow case),
- carries the existing fields (`workflowId`, `stepId`, `subject`, `readOnly`) unchanged.

Existing tests must stay green. Per-PR gates: `npm test`, `npm run build -w examples/demo`, `npm run types` (the last must exit cleanly; the `.d.ts` it emits are gitignored and not committed).

## Out of scope

- Any `@sqnce/core` change. The engine already carries `runId` in the draft context; this spec only touches the React renderer context.
- The consumer's citation-resolution logic itself (presales-sqnce #135).
- Changing `generateDraft`'s context (it already carries `runId`).
- Adding a DOM-render test harness to the React package.

## Acceptance

- A custom renderer's `context` carries `runId`, the active run entry id, in both the editing and reading views.
- `runId` is `null` when there is no active run entry (a brand-new workflow with no run yet).
- Existing renderers are unaffected (they ignore the new field); no behavior change to any existing renderer or view.
- The renderer-contract comment in `OutputView.jsx` and the root README "Custom renderers" section both document `runId` in the context, so neither goes stale.
- `npm test`, `npm run build -w examples/demo`, and `npm run types` all pass (the `.d.ts` that `npm run types` emits are gitignored, so none are committed).

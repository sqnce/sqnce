# spec: run-aware drafts and validation, manual steps

Issues: #62, #63, #64, bundled into one PR because all three harden the same surface (server-side draft generation across multiple runs, with cross-step validation and human-only steps) and all three are blocked work for the same downstream consumer, presales-sqnce (dawtips/presales-sqnce#2). #63 extends the validator concept introduced by #52/#53/#54; #62 and #64 finish the draft affordance the same consumer drives.

Driving need: presales-sqnce rebuilds draft prompts server-side from the shared run store (the recommended pattern when an API key must stay out of the browser). That pattern needs three things the framework does not yet give it: the run identity in the draft call (#62), validators that can see other steps in the run (#63), and no Generate button on steps that must only ever be human-entered (#64). Each gap currently forces a downstream workaround documented in dawtips/presales-sqnce#2; the parts only the framework can fix are below.

## #62 react: run id in the generateDraft context

`generate()` (`packages/react/src/ProcessRolodex.jsx` ~394) calls the injected generator with a context carrying no run identity:

```js
const text = await generateDraft(prompt, {
  workflowId: def.id,
  stepId: step.id,
  subject: subjectName,
});
```

A server-side generator that resolves "the active run" from the persisted store races the 500 ms save debounce (`saveTimer`, ~282): switch or create a run, click Generate before the flush, and the server builds the prompt from the previous active run (or, for a brand-new run, from a store that has never seen it).

Fix has two parts, because `runId` alone only disambiguates a run the store already holds:

- Pass the active run entry id in the context. The active run entry is already in hand at the component scope (`const entry = activeRunEntry(store, activeId)`, ~208) and is the entry `generate()` closes over. Pass `runId: entry.id`. The context becomes `{ workflowId, stepId, subject, runId }`. Backward compatible: existing consumers ignore the extra key.
- Flush pending persistence before generating. In `generate()`, before calling `generateDraft`, clear the debounce and `await persistence.save(store)` when `persistence` is present, so the shared store reflects the current run (including a newly created entry and unsaved intake edits) before the server rebuilds from it. This closes the race for switch, create, and edit-before-flush; `runId` then tells the server which of the now-current runs to use. When `persistence` is omitted there is no shared store and nothing to flush.
- Update the `generateDraft` JSDoc context type (~64, ~155) to include `runId: string`.

The flush is best-effort and must not block generation on a transient save error: a failed flush is swallowed (the existing save effect already only logs), and generation proceeds; the server then rebuilds from whatever the store last held, the same as today.

Scope note: where the returned draft lands in the browser is unchanged. `setRun` already re-checks the entry inside the updater and only writes to a still-active entry (~244), so the browser-side landing is out of scope here.

## #63 core: run-aware validators (third argument)

The validator contract from #52/#53/#54 is `(value, spec) => string | null` (`firstInvalidOutput`, core `index.js` ~453). A check that relates one step's output to another step's output cannot be expressed, so it cannot participate in gates or in ProcessRolodex's native draft rejection. Concrete case (presales-sqnce): findings carry `source_refs` that must resolve to ids defined by an earlier intake step; a value hand-pasted into the rolodex editor runs only the single-output validator, which cannot see the other step, so an untraceable ref is accepted by exactly one surface while every other path rejects it.

Fix (option 1 from the issue): extend the contract with a third argument carrying run context.

- New contract: `(value, spec, { run, stepId }) => string | null`. The engine always passes the third argument; existing two-argument validators ignore it. `run` is the run state the validator can read other steps from (via the exported `getStepEntry`); `stepId` is the step whose output is being validated.
- `firstInvalidOutput(step, entry, validators)` gains a `run` parameter and calls `fn(val, spec, { run, stepId: step.id })`.
- `isStepComplete(step, entry, gateType, validators)` gains an optional 5th parameter `run`, forwarded to `firstInvalidOutput`. Public API; additive, so omitting it keeps today's behavior (the third arg is then `{ run: undefined, stepId }`, which a run-aware validator treats as no run context).
- `gateProgress(subStage, run, { validators })` already holds `run`; it forwards `run` to both `isStepComplete` (~511) and the direct `firstInvalidOutput` call that builds the missing message (~512).
- `buildContext` (the completion filter at ~769) already holds `run`; it forwards `run` to `isStepComplete`, so a run-aware rejection excludes the step from generated draft prompts.
- `mainGateProgress`, `runSummary`, and `advance` reach validation only through `gateProgress`, to which they already pass `run`, so they need no signature change.

Net engine surface change: `firstInvalidOutput` (internal) and `isStepComplete` (exported) gain a `run` argument; no other exported signature changes. Validation stays pure, computed, never persisted, and unresolved or absent validators stay unvalidated, exactly as #54 established.

ProcessRolodex reaches validators four ways, all of which must carry the run so a run-aware validator resolves consistently (otherwise a value can be gate-valid while its step status reads draft and is dropped from the inputs panel). Two are direct validator calls:

- the post-generation draft rejection (`generate()`, ~406): `fn(parsed.value, target, { run, stepId: step.id })`.
- the per-output invalid line feeding `OutputView` (~741): `checkFn(outVal, spec, { run, stepId: step.id })`.

Two are indirect, through `isStepComplete`, which now takes `run` as its trailing argument:

- `prevDoneBlocks` (~448): `isStepComplete(step, entry, gateTypeOf(prevSub), validators, run)`.
- `statusOf` (~463): `isStepComplete(step, entry, gateTypeOf(sub), validators, run)`.

All four already have `run` in scope. This is what closes the hand-paste hole: a pasted value's run-aware validator now rejects an untraceable ref in the inline error, the step status, the inputs panel, and the boundary gate together.

## #64 react: suppress Generate on manual steps

`ProcessRolodex` renders Generate for any step with a draft target, including steps with no `aiPrompt` whose draft is therefore the generic fallback task (`buildDraftPrompt` ~806). For a human-only step (ingested source material whose integrity an audit chain depends on) the button invites a meaningless, possibly metered, generation.

Fix: an explicit `manual: true` step flag suppresses both Generate affordances. Chosen over inferring suppression from a missing `aiPrompt` because the inferred rule is not behavior-neutral: 28 steps across bundled definitions (hiring, launch, onboarding, presales) have a draft target and no `aiPrompt` and currently offer the generic-fallback draft, and inferring would silently strip Generate from all of them. The explicit flag is opt-in per step, changes nothing for any existing definition, and matches what presales-sqnce already marks up. It also keeps "no custom task" (generic fallback still offered) distinct from "never generate" (manual).

React:

- Compute a per-step `canGenerate = !!generateDraft && !!target && !step.manual`.
- The generate-invite block gate (`isGenTarget`, ~703) and the action-row Generate/Regenerate gate (~767) both key off `canGenerate`. When `step.manual` is true, neither affordance renders and the output falls through to the normal `OutputView` editor, so the value is human-entered.

Core (schema only, no behavior):

- Document `manual?: boolean` on the `Step` typedef (near `aiPrompt`, ~74).
- `validateDefinition` adds one step-level check: when `manual` is present it must be a boolean (mirrors the existing `skippable` and `validate` checks). This catches a truthy-string typo (`manual: "false"`) that would otherwise suppress Generate incorrectly. No whitelist, no other behavior.

`buildDraftPrompt` is unchanged: it remains callable on any step. #64 is a UI affordance fix; core never decided whether to show a button.

## Demo and definitions

The demo exercises both new behaviors end to end; engine tests are the primary proof for #63 (see Acceptance).

- `definitions/presales.json`: mark `demo-data` (a data-target step with no `aiPrompt`, conceptually human-provided) `manual: true`, demonstrating #64 by removing a spurious generic-fallback button. No other bundled definition changes.
- `examples/demo/src/App.jsx`: extend the existing `validators` map so the `win-themes` validator is run-aware, resolving each win theme's referenced requirement against the `requirements` step's output via `getStepEntry(run, "requirements")` and rejecting a reference that does not resolve. The two-argument `requirements` validator stays as is, showing both contracts coexisting.
- `examples/demo/src/drafts.js`: the canned `win-themes` draft references a requirement that the canned `requirements` draft produces (valid). The demo doc notes that editing the reference to a non-existent id blocks the boundary gate with the validator message, exercising the run-aware path through both the inline error and the gate.

Exact field names for the win-themes-to-requirements reference are pinned in the plan; they follow the shapes the existing demo renderers already expect.

## Docs

Same-PR updates:

- core file header comment: the validator third argument `{ run, stepId }` and `manual` on steps.
- root `README.md` and `packages/react/README.md`: `runId` in the generateDraft context; run-aware validators; `manual` steps.
- `CLAUDE.md`: architecture note that output validators receive `(value, spec, { run, stepId })`; key-behavior notes that the generateDraft context carries the active `runId`, that a step may be marked `manual: true` to suppress the Generate affordance, and that run-aware validators read other steps via the run.
- `npm run types` regenerates the `.d.ts`.

## Out of scope

- Browser-side draft landing semantics (which run a returned draft writes into); #62 is the context payload only, and `setRun`'s active-entry re-check already guards the write.
- `runId` (or other run context) in the `OutputView` renderer context; renderers are a separate channel from generation and no consumer needs it yet.
- Async validators, validators that throw, built-in validators, or validator functions in definitions (all still excluded, per #54).
- Persisting validation results.
- Core refusing to build a draft prompt for a `manual` step; the flag is a UI affordance only.
- Inferring `manual` from a missing `aiPrompt`.

## Acceptance

- `npm test` passes with new engine tests: a run-aware validator receives `{ run, stepId }` and can reject based on another step's output; the third argument is present (with `run` undefined) when `isStepComplete` is called without a run; a run-aware rejection makes the step incomplete in `isStepComplete`, surfaces `"<step>: <message>"` in `gateProgress`/`mainGateProgress` missing, excludes the step from `buildContext`, and a forced advance past it records `forces`; existing two-argument validators behave exactly as before; `validateDefinition` rejects a non-boolean `manual` and accepts `manual: true`/absent; all bundled definitions still pass `validateDefinition`.
- In the demo: the presales `demo-data` step shows no Generate affordance (neither the invite nor the action-row button) and its output is editable directly; every step that still has `aiPrompt` or a generic-fallback target keeps its button. The `win-themes` Generate lands a value whose references resolve; hand-editing a win theme to reference a non-existent requirement shows the inline validator error and blocks the boundary gate with the message, and force-advance still works.
- `npm run build -w examples/demo` and `npm run types` pass; the esbuild syntax check passes on `ProcessRolodex.jsx`.

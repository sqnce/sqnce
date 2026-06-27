# spec: consumer run-reconcile hook on the rolodex

Issue: #103 (a `reconcileRun` hook so a consumer can post-process the run the rolodex renders, reflecting policy-derived run state live without a page reload). Milestone: "UI shell: reading mode, renderers & theming".

The rolodex (`ProcessRolodex`, `@sqnce/react`) owns the client run state. It loads that state from `persistence.load()` only on mount, auto-saves it on change, and never reads what `persistence.save` returns. So a consumer whose run state is partly derived from a policy (for example an auto-skip of a specialist lane computed from upstream content) has no way to push a freshly derived run into the live client between mounts. It can reconcile on the read path, so every fresh page load is correct, but the already-loaded deck keeps its stale run until the page reloads. This spec adds a single injected hook that closes that gap: a pure function the consumer supplies, which the component applies to the run on load and after each run-state transition, before the run is used to select and render a card.

This follows the same split every other consumer hook on the component already uses (`persistence`, `generateDraft`, `renderers`, `validators`, `generatedBadge`, `renderRunHeader`, `runStatus`, `renderStageStatus`): sqnce decides where and when the hook fires, the consumer decides what it does. The engine stays domain-agnostic. It knows nothing about why the consumer changes the run; it only applies the function and renders the result.

## Layer

Pure `@sqnce/react`. The change touches `packages/react/src/ProcessRolodex.jsx` (the new-entry factory, the mount-load effect, and the `setRun` transition path) and adds one pure, React-free helper module, `packages/react/src/reconcile.js`, with a unit test (`packages/react/test/reconcile.test.js`). It wires a reference `reconcileRun` into the demo consumer, `examples/demo/src/App.jsx`, and adds the prop to the `ProcessRolodexProps` typedef so `npm run types` regenerates the declaration. No `@sqnce/core` change: the existing auto-skip provenance primitives (`autoSkipSubStage`, `clearAutoSkipSubStage`) are all the reference consumer needs, and they are already exported.

## Current behavior

`ProcessRolodex` holds the versioned run store in component state. Two effects matter here.

- The mount-load effect (`ProcessRolodex.jsx:307`) calls `persistence.load()` once, and if the result is a version 3 store it commits it verbatim with `setStore(saved)`. There is no transform between load and commit.
- The debounced-save effect (`ProcessRolodex.jsx:325`) writes the store back through `persistence.save` and discards its return value.

Run mutations route through `setRun` (`ProcessRolodex.jsx:283`), which writes the next run into the active entry through `updateRunState`. Navigation routes through `setNav` (`ProcessRolodex.jsx:295`), which writes with the entry's own timestamp and stays available on archived runs. There is no point at which a consumer-supplied function sees or rewrites the run.

## Problem

A consumer (presales-sqnce #108, merged) auto-skips a conditional specialist lane from a signal it computes from the accepted narrative. It reconciles each run on its store's read path, so every fresh page load is correct, and it declines generation server-side with a "reload and Restore" message. But a mid-session auto-skip only surfaces on the next reload, because there is no consumer hook to reflect it in the live deck. That consumer has a working mitigation (reconcile on read, plus reload), so this is a polish capability, not a blocker. The gap is precisely that the component never offers the consumer a chance to post-process the run it already holds.

## Change

Add one optional injected prop, `reconcileRun`, defaulting to absent. When it is omitted the component behaves exactly as today. When it is present the component applies it wherever a run first enters the rendered state, always before the run is used to select or render a card:

1. at entry creation, to the seeded run of every newly created entry (the initial pre-load store and every later new run or workflow switch),
2. on load, to every entry's run in the store returned by `persistence.load()`, and
3. after each `setRun` transition, to the run that the transition produced.

### The prop

`reconcileRun`: a pure function `(run, { def, runId }) => run`. It receives the run to reconcile and a small context, and it returns a run. The context carries the two things a consumer needs to reconcile correctly and nothing more:

- `def`: the workflow definition that the run belongs to. The consumer needs this to branch by workflow and to resolve sub-stage ids (for example by flattening the definition's sub-stages, which is what the auto-skip primitives take). The run object itself carries no workflow id, and the store holds runs for many workflows, so without the definition a single reconcile function applied across every entry could not tell which workflow a run is for. Passing the definition is what makes the hook safe in a multi-workflow store.
- `runId`: the run entry id, matching the `runId` the other hooks already receive, so a consumer that resolves anything per-run from a shared store has the id at hand.

The context extends the issue's stated `(run) => run` signature to `(run, { def, runId }) => run`. The extension is backward compatible: a consumer that ignores the second argument is exactly the `(run) => run` the issue describes, the same way `generateDraft`'s single-argument implementations keep working. The context is informational; the return value is the only thing the component uses. The signature change is the first open question for approval, below.

The contract on the consumer's function is that it is pure and idempotent: applying it once and applying it twice yield the same run, so the component can apply it freely on load and after every transition without compounding. The component does not enforce idempotence; it relies on it. The function must change only policy-derived run state (for the motivating case, an auto-skip). It must not move navigation: it must not change `idx`. It must not invent run shape the engine does not understand. A consumer that derives an auto-skip should derive it through the existing auto-skip provenance primitives, which record the skip as `source: "auto"` and defer to any user skip or keep-in, so a policy projection never clobbers a person's own decision.

### Where the hook fires

On load, the component applies `reconcileRun` to every entry's run in the loaded store, then commits the reconciled store. Reconciling every entry (not only the active one) matches the issue's "each entry's run after load," so switching to any run shows its policy-reconciled state immediately, not only the run that happened to be active at load. The reconciled store is what the save effect then persists, so the locally persisted store and a server that also reconciles on read stay consistent; because the function is idempotent, persisting the reconciled store and reconciling it again on the next load is stable. Reconciling on load uses the prop as of mount, which is correct for a once-on-load transform; live updates come through the transition path.

After each `setRun` transition, the component applies `reconcileRun` to the run the transition produced, before committing it. This is the live path: when the user edits and commits the upstream content a policy depends on, the transition runs the reconcile against the new content, so a derived auto-skip surfaces in the same render, without a reload. `setRun` is the content-mutation path and is already blocked on archived runs, so reconciling there never touches a frozen run.

At entry creation, the component reconciles the seeded run before the entry is added to the store. Every new entry is born through one factory (`newEntryFor`), which the initial pre-load store, the ensure-an-active-entry effect, a workflow switch that seeds a first run, and an explicit new run all go through, so reconciling once in the factory covers every seeded run. This matters because a seeded run is not necessarily blank: a consumer's `initialRunFor` can seed a non-empty run (the demo does), and a policy may derive a skip from that seeded content. Reconciling at creation means such a seed is reconciled before it is rendered, not left stale until the user's first edit. The reconcile uses the entry's own new id and its workflow definition as context.

Navigation (`setNav`) does not reconcile. Navigation changes only `idx`, which a reconcile must not touch, so reconciling on navigation could only be a no-op or a contract violation; and `setNav` stays available on archived runs, which must not be rewritten. Excluding navigation keeps the hook scoped to entry creation, load, and content transitions, which is exactly the issue's "on load and after each run-state transition," extended to creation so a seeded run is never rendered unreconciled.

Reset (`resetRun`) reseeds through the `setRun` path, so a reset run is reconciled by the transition point, not the factory; the two paths agree because the reconcile function is idempotent.

### Internal structure

Extract the application decision into a new pure, React-free helper, `packages/react/src/reconcile.js`, mirroring `stageStatus.js`, `runStatus.js`, and `badge.js`. Keeping it React-free is what lets it run under `node:test`; `@sqnce/react` has no DOM render harness, and every existing test in the package tests an extracted pure module, never a rendered component. The module exports two functions.

- `applyReconcile(reconcileFn, run, context)`: when `reconcileFn` is not a function, returns `run` unchanged (the absent-prop no-op, same reference). Otherwise returns `reconcileFn(run, context)`, with one guard: if the function returns anything that is not a non-null object (a consumer bug), the original run is returned unchanged so a faulty reconcile degrades to a no-op rather than emptying the deck.
- `applyReconcileToStore(reconcileFn, store, workflows)`: when `reconcileFn` is not a function, returns `store` unchanged (same reference), so the load path behaves exactly as today when the prop is absent. Otherwise returns a new store, structurally identical to the input (same `version`, `activeWorkflowId`, `activeRunByWorkflow`, and per-entry metadata, including `updatedAt`, which a load-time projection must not bump), with each entry's `run` replaced by `applyReconcile(reconcileFn, entry.run, { def, runId: entry.id })` where `def` is the entry's workflow resolved from `workflows`. An entry whose workflow is not in `workflows` keeps its run unchanged, because the context cannot be built. The input store is never mutated.

`ProcessRolodex` imports the helper and wires it at three call sites. The new-entry factory (`newEntryFor`) reconciles the seeded run with `applyReconcile(reconcileRun, seed, { def, runId })`, where `def` is the new entry's workflow resolved from `workflows` and `runId` is the entry's new id, before handing the run to `createRunEntry`; `reconcileRun` and `workflows` join the factory's dependency list. The mount-load effect commits `applyReconcileToStore(reconcileRun, saved, workflows)` instead of `saved`. `setRun` commits `applyReconcile(reconcileRun, next, { def, runId: entry.id })` instead of `next`, and `reconcileRun` (and the active `def`) join its dependency list. No other call site changes.

### Demo wiring

Wire a reference `reconcileRun` into `examples/demo/src/App.jsx`, the same way the demo wires `runStatus`, `renderRunHeader`, and `renderStageStatus` today. The demo's presales workflow has the one skippable sub-stage in the bundled content, the Orals Prep lane, which makes it the natural demonstration. The reference function branches to the presales workflow, reads the accepted solution narrative text, and, when that text signals a written-only pursuit (a keyword match), auto-skips the Orals Prep lane through `autoSkipSubStage`; otherwise it clears the auto-skip through `clearAutoSkipSubStage`. Both primitives are no-ops when the lane is beyond the committed frontier or when the user has made a manual decision, so the reference both demonstrates the live auto-skip and shows the right way to derive one: through provenance, deferring to the user. It exercises the new prop in the demo build, which is the CI build gate, and serves as the copy-paste reference for downstream consumers.

### Types

Add the `reconcileRun` property to the `ProcessRolodexProps` typedef and to the prop documentation block in `ProcessRolodex.jsx`. `npm run types` regenerates the `.d.ts` so consumer editors see the new prop.

## Surfaces

This affects how the rolodex obtains the run it renders, on both the authoring deck and the reading view, because both read the same active run derived from the store. The hook changes the run's policy-derived state (the motivating case is an auto-skip), so a reconciled skip is reflected wherever a skip already shows: excluded from the boundary gate aggregate, the run summary, and draft context, per the existing skip semantics. The hook does not add any new surface or visual element; it only changes which run those existing surfaces draw.

## Out of scope

- Any `@sqnce/core` change. The engine already exposes the auto-skip provenance primitives the reference consumer uses; the reconcile policy itself lives entirely in consumer code.
- Consuming the `persistence.save` return value. The issue frames the gap partly as the component ignoring the save response, but the hook closes the gap on the client without a server round trip, so no save-response channel is added.
- Reconciling navigation transitions (`setNav`). Navigation never changes the run's policy-derived state, so it is a deliberate boundary, covered above.
- The actual policy a consumer derives (the keyword or signal that drives a skip). The demo ships an illustrative one; a real consumer derives its own.

## Acceptance

- `ProcessRolodex` accepts an optional `reconcileRun(run, { def, runId }) => run` prop.
- It is applied at entry creation to every newly seeded run, on load to every entry's run, and after each `setRun` transition to the run that transition produced, always before the run is used to select or render a card. A non-empty `initialRunFor` seed is reconciled before it is first rendered, not left stale until a later edit.
- With `reconcileRun` omitted, `ProcessRolodex` renders exactly as today: the load path commits the loaded store unchanged and transitions commit their run unchanged (verified by the helper returning the same reference when the prop is absent).
- A present `reconcileRun` reflects a derived run change live, without a reload: a content transition that changes the signal a policy depends on surfaces the reconciled run in the same render.
- The application decision lives in a pure `reconcile.js` helper with a unit test (`packages/react/test/reconcile.test.js`) covering: absent prop is a no-op returning the same run and the same store reference; load-time application reconciles every entry's run while preserving store shape and entry metadata; post-transition application reconciles a single run; idempotence (applying the helper twice with an idempotent function yields a result deep-equal to applying it once); a function returning a non-object degrades to a no-op; an entry whose workflow is absent from `workflows` keeps its run unchanged.
- The demo wires `reconcileRun` so the prop is exercised by the demo build.
- `npm test`, `npm run build -w examples/demo`, and `npm run types` pass.

## Verification note

`@sqnce/react` has no DOM render harness, so the JSX wiring is verified manually in the demo, the established pattern. The decision logic is verified by the `reconcile.js` unit test. All three wiring points are verified by driving the demo on the presales workflow, whose seeded run already commits the proposal-demo stage, so the Orals Prep lane is reachable:

- Creation path: confirm that a presales run whose seeded or just-entered solution narrative matches the keyword shows the Orals Prep lane skipped on first render, before any edit.
- Transition path: edit the narrative so the keyword no longer matches, commit, and confirm the lane returns in the same session without a reload (the auto-skip clears), while a manual skip the user set themselves is left untouched.
- Load path: reload the page and confirm the deck shows the reconciled skip state immediately, with no visible flash of the unreconciled lane.

## Open questions for approval

1. The context argument. The spec extends the issue's `(run) => run` to `(run, { def, runId }) => run`. The extension is what makes the hook usable and safe: the run carries no workflow id, the store holds runs for many workflows, and the motivating auto-skip use needs the definition to resolve sub-stage ids. It is backward compatible, since a `(run) => run` consumer simply ignores the second argument. Recommendation: include the context argument, matching the `{ def, run, runId }` context the other hooks already pass.

2. Archived runs on load. The load-time reconcile applies to every entry, including archived (read-only) runs, matching the issue's "each entry's run." An archived run's human decisions are preserved because the auto-skip provenance primitives defer to any user skip or keep-in and the reconcile changes only policy-derived state, so an archived run reflects current policy on its auto-derived fields while every user choice and output stays frozen. The transition path never touches archived runs, so they are only ever reconciled once per load. Recommendation: apply to all entries on load. The alternative (exempt archived runs from load-time reconcile) is a one-line change if the owner prefers frozen archives, but it complicates the simple "reconcile every entry" rule and is not needed given provenance already protects user decisions.

# spec: run clone primitive in @sqnce/core

Issue: #67. Closes #67.

Driving need: a consumer (the presales-sqnce #74 grounding-ablation study) needs to fork a run, branching a run's accepted upstream state into a new run with a distinct run-id, so two run records share upstream artifacts but diverge downstream. `@sqnce/core` owns the run-entry and store model (`createRunEntry`, `addRun`, `renameRun`, `updateRunState`, `createRunStore`) but exposes no clone primitive, so consumers hand-roll one against the store JSON.

Hand-rolling is fragile. The store keys an entry by `entry.id`, but `entry.id` is also a field on the entry, so the two can drift. `withEntry` (`packages/core/src/index.js` ~856) writes back at `entry.id`, not at the store key passed in: `updateRunState(store, runId, ...)` looks up `store.entries[runId]` then re-inserts at that entry's `id`. Cloning by copying the entry under a new store key while leaving `entry.id` stale therefore makes every later `setOutput`/`updateRunState` against the clone write to the *source* key instead, a silent no-op against the clone. This is the failure that surfaced in the live pilot. (The issue also notes a second, consumer-side failure: artifact renumbering deleting upstream artifacts when a manifest is absent at clone time. That is presales-side, tracked in dawtips/presales-sqnce#97, and out of scope here.)

## What we add

One exported function in the run-store section of core:

```js
cloneRun(store, { fromId, newId, name, now, uptoStageId, definition }) => RunStore
```

It forks the run `fromId` into a new run keyed `newId`, returning a new store (pure; the input store is untouched). The clone shares the source's same `workflowId`. Two modes:

- **Full fork** (`uptoStageId` omitted): the clone's run is a deep, isolated copy of the source's run exactly as it stands (`idx`, `frontier`, `stepState`, and the optional `skips`/`forces` maps), via `structuredClone` (available in the supported runtimes; verified).
- **Truncated fork** (`uptoStageId` given, with `definition`): the clone keeps accepted work only up to and including a chosen completed main stage; everything after that stage is blank, ready to diverge.

The new entry is built as `{ id: newId, workflowId: source.workflowId, name: String(name||"").trim(), status: "active", createdAt: now, updatedAt: now, run: <cloned run> }`. `now` is caller-supplied (core never reads the clock, matching `createRunEntry`/`renameRun`/`updateRunState`). The clone is always `status: "active"`, even when the source is archived (a fork starts new work).

### The structural invariant

The new entry's `id`, its store key, and the `newId` argument are one and the same value by construction: the function inserts `entries[newId] = { id: newId, ... }`. There is no path through this function that produces an entry whose `id` differs from its key, so the silent no-op trap above is structurally impossible for forks. `cloneRun` must **not** route through `addRun` (which would also flip the active-run mapping); it inserts the entry directly and leaves `activeWorkflowId` and `activeRunByWorkflow` byte-identical. The original run stays the open one; a consumer that wants the fork open calls `setActiveRun(store, newId)` itself.

### Fail loud at the boundary

`cloneRun` deliberately breaks from the store convention that an unknown id is a silent no-op, because the whole reason this primitive exists is to kill a silent failure. It throws on:

- `newId` that is not a non-empty string (an empty key would be unreachable).
- unknown `fromId` (nothing to fork).
- `newId` already present in `store.entries` (forking must never overwrite or merge into an existing run).
- `uptoStageId` given without a `definition`.
- a `definition` whose `id` is not the source entry's `workflowId` (the definition must be the run's own workflow; otherwise `frontier`, `idx`, step retention, skips, and forces would be computed against another workflow's stages, silently dropping or mis-accepting state in a multi-workflow store).
- `uptoStageId` that matches no main stage in `definition`, or that matches more than one (an ambiguous fork point). `cloneRun` enforces a unique main-stage match itself rather than trusting the definition was validated, because `validateDefinition` checks sub-stage and step id uniqueness but does not currently reject duplicate main-stage ids.
- `uptoStageId` resolving to a main-stage index `k` greater than the source run's `frontier` (cannot share state that was never accepted).
- a truncated fork whose source run holds a `stepState` step id absent from the supplied `definition`, or a `skips` sub-stage id that is absent from the definition, or a kept skip (main-stage index `<= k`) whose sub-stage the definition does not mark `skippable`. The definition must currently describe every accepted artifact and every kept skip as legal: we never silently drop accepted state we cannot classify, and (because the engine's `isSubStageSkipped` never re-checks `skippable`) a stale skip on a now-required sub-stage would otherwise silently exclude it from the clone's gates.

Each throw is a clear `Error` naming the cause.

### Truncation semantics

`uptoStageId` is a **main-stage id**, resolved against `definition` to a main-stage index `k`. The fork point is a main stage because the engine only ever marks progress accepted at main-stage boundaries (`frontier` is a main-stage index; there is no per-sub-stage commit). Given the guards above, `k <= source.frontier`. The cloned run is:

- `frontier = k`.
- `stepState`: keep an entry iff its step's main-stage index is `<= k`; drop the rest. Step-to-stage is resolved from `flattenSubStages(definition)` (each flattened sub-stage carries `mainIndex` and its `steps`).
- `skips`: every skip's sub-stage must resolve in the definition, and a kept skip's sub-stage must be `skippable` (else throw, above). Keep a skip iff its main-stage index is `<= k`; drop the rest. (A skip at the fork stage itself is content within a kept stage, so it is kept.)
- `forces`: keep `forces[i]` iff numeric `i < k`; drop the rest. The force at the fork stage's own outgoing boundary (`forces[k]`, if any) is dropped, because that `k -> k+1` advance is exactly what the rewind undoes.
- `idx`: set to the flat index of the first sub-stage whose `mainIndex === k`, matching the engine's own convention (`advance` lands the cursor on the first sub-stage of the newly committed stage). The source's browse position is not preserved; the fork is defined by its truncation point.

Within the kept prefix, per-step flags (`reopened`, `generated`) ride along verbatim as part of their entries; they are accepted upstream state. `forces`/`skips` that end up empty are omitted (the maps are absent when empty, per the existing run shape).

Forking up to the source's current `frontier` (`k === frontier`) is allowed and keeps the whole committed prefix; it differs from a full fork only in resetting `idx` to the first card of that stage.

## Files

- `packages/core/src/index.js`: add `cloneRun` in the run-store section (near `updateRunState`, ~941), with JSDoc so `npm run types` emits its declaration. Extend the run-store block comment (~823) to record the fork primitive and its `id === key` invariant. No existing function's behavior or signature changes.
- `packages/core/test/runstore.test.js`: new tests (see Acceptance). The existing fixture has one main stage; truncation tests need a small multi-main-stage fixture, added locally in the test file.

## Docs

Same-PR updates:

- `CLAUDE.md`: a key-behavior note that `cloneRun(store, { fromId, newId, name, now, uptoStageId, definition })` forks a run into a distinct run-id, deep-copying the accepted run (full, or truncated to a main stage) with `entry.id === store key` by construction so state updates never silently no-op; it throws on bad, colliding, or too-far input and never changes the active run.
- `npm run types` regenerates the `.d.ts`.

The root `README.md` and `packages/react/README.md` do not enumerate the run-store API (verified), so they need no change.

## Out of scope

- Engine sub-branching with independent terminal stages (#66). The engine stays strictly linear; this produces two independent run *records* sharing a prefix, nothing more.
- Sub-stage-granular fork points. The fork point is a main stage, the engine's only accepted-progress boundary.
- A fork-lineage field (`forkedFrom` or similar). Runs are told apart by their distinct id, per the acceptance; lineage is not required and a consumer that wants it tracks it via the ids it chose.
- Switching the active run to the fork. `cloneRun` only inserts; the consumer calls `setActiveRun` if it wants the fork open.
- The consumer-side artifact-renumbering failure and any CLI surfacing of fork (presales-sqnce#97).
- Any persistence version bump, migration, or compat shim. The function is purely additive; older stores are already discarded by loaders, and the pre-publish stance ships breaking changes clean without shims.
- Any demo/UI affordance for forking. `cloneRun` is a pure core primitive; engine tests are its proof.

## Acceptance

- `npm test` passes with new engine tests covering:
  - **Full fork:** the clone's run equals the source's run; the new entry has `id === newId`, the same `workflowId`, `status: "active"`, `createdAt === updatedAt === now`, and the supplied (trimmed) name; the store gains exactly one entry at key `newId`.
  - **The no-op trap regression (core acceptance):** after a full fork, `updateRunState(store, newId, setOutput(clone.run, ...))` changes `entries[newId].run` and leaves `entries[fromId]` untouched, with no stray key created. A `setOutput` driven into the clone advances the clone's own state, proving it is indistinguishable from a native run.
  - **Isolation:** the clone and source do not alias; driving one does not mutate the other.
  - **Active pointer untouched:** `activeWorkflowId` and `activeRunByWorkflow` are identical before and after a fork; forking an archived run yields an `active` clone.
  - **Fail loud:** throws on unknown `fromId`, on an existing `newId`, on a non-string/empty `newId`, on `uptoStageId` without `definition`, on a `definition` whose `id` is not the source `workflowId`, on an unknown `uptoStageId`, on an `uptoStageId` matching more than one main stage (duplicate-id definition), on `uptoStageId` beyond the source frontier, on a truncated fork whose run references a step or skip sub-stage absent from `definition`, and on a truncated fork whose kept skip names a sub-stage the definition does not mark `skippable`.
  - **Truncated fork:** with `uptoStageId` naming an earlier main stage, the clone keeps `stepState` for steps in stages `<= k` and drops the rest; `frontier === k`; `idx` is the first sub-stage of stage `k`; `forces` are kept for `i < k` and dropped otherwise; `skips` are kept for stages `<= k` and dropped otherwise; the truncated clone is drivable (a `setOutput` advances its own state). Truncating to the current frontier keeps the whole committed prefix.
- `npm run types` passes and the generated declaration includes `cloneRun`.
- No existing test is modified (additive surface); all bundled definitions still pass `validateDefinition` (suite unchanged).

# #114 follow-up: useRunStore extraction and RolodexView prop-grouping

> **For agentic workers:** behavior-preserving refactor. No behavior change; the gates are the existing tests plus runtime verification in the demo.

**Goal:** Finish the two deferred shell-decomposition items of #114: extract the run-store lifecycle into a `useRunStore` hook, and group the wide `RolodexView` prop set into cohesive objects.

**Architecture:** `@sqnce/core` is untouched. Both changes are in `@sqnce/react` and are purely structural. The design was approved as part of the bundled spec (`docs/specs/109-111-112-113-114-115-project-review-cleanup.md`, Section D).

## Global constraints

- No em dashes anywhere; lowercase `sqnce`.
- No behavior change: the linear byte-identical guarantee and all documented behavior hold.
- Gates: `npm test` (all suites), `npm run types` (core directly; react verified against the worktree core via a temp tsconfig with a `paths` override, since the worktree node_modules symlink resolves `@sqnce/core` to main), and runtime verification of the demo via an aliased Vite server driven with Playwright. `npm run build -w examples/demo` is the CI gate.
- The react test suite has no jsdom, so these React-structural changes are verified by syntax checks (esbuild), the existing pure-function unit tests, and the demo runtime, plus CI.

## Task A: extract `useRunStore`

**Files:**
- Create: `packages/react/src/useRunStore.js`
- Modify: `packages/react/src/Sqnce.jsx`

**Interface (Produces):**
`useRunStore({ persistence, workflows, reconcileRun, newEntryFor, view }) -> { store, setStore, loaded, activeId, entry, staleActiveId, cancelPendingSave }`

The hook owns: `store`/`setStore` (initial value `addRun(createRunStore(), newEntryFor(createRunStore(), workflows[0].id))`), `loaded` (`useState(!persistence)`), the `saveTimer` ref; it derives `activeId`, `entry`, `staleActiveId`; and it runs three effects, moved verbatim from the shell:
1. The persistence **load** effect (one-shot: `persistence.load()`, version-3 guard, `applyReconcileToStore(reconcileRun, saved, workflows)`, then `setLoaded(true)`). Keep the empty dependency array and the eslint-disable line.
2. The debounced **save** effect (`clearTimeout`/`setTimeout(persistence.save(store), 500)`, deps `[store, loaded, persistence]`).
3. The **repair** effect (ensure an active entry exists / normalize a stale `activeWorkflowId`), deps `[loaded, entry, staleActiveId, activeId, view, newEntryFor]`.

`cancelPendingSave()` is `clearTimeout(saveTimer.current)`, exposed so the shell's draft-generation flush can cancel the pending debounce before its manual save.

**Stays in the shell (by design):** the one-shot initial-view **route** effect (`setView(viewForRun(entry))` guarded by the `routedOnLoad` ref). It is a view-routing concern that depends on `viewForRun`/`setView`, not run-store persistence, so it belongs with the view logic. `def` and `viewForRun` also stay in the shell (view-derived).

- [ ] **Step 1: Write `useRunStore.js`** with the three effects moved verbatim (same guards, same dependency arrays, same comments). Import the core/run-store helpers it needs (`createRunStore`, `addRun`, `activeRunEntry`, `coreSetActiveRun`, `applyReconcileToStore`).
- [ ] **Step 2: Rewire `Sqnce.jsx`** to call the hook and destructure its returns, deleting the moved state/refs/effects. The shell keeps `view`/`setView`, `routedOnLoad`, the route effect, `def`, `viewForRun`, and every handler (they use the returned `store`/`setStore`). Replace the generate-flush `clearTimeout(saveTimer.current)` with `cancelPendingSave()`.
- [ ] **Step 3: Verify** `npm test` (all pass), esbuild syntax check on `Sqnce.jsx` and `useRunStore.js`, react types via the temp tsconfig, then the demo runtime: load a persisted run (it appears), make an edit (it persists after the debounce), open it (it routes to the right view). Commit.

## Task B: group the `RolodexView` prop set

**Files:**
- Modify: `packages/react/src/Sqnce.jsx` (the `<RolodexView ... />` call site)
- Modify: `packages/react/src/RolodexView.jsx` (the destructure and internal references)

**Approach:** group the ~34 individual props into a small number of cohesive objects passed from the shell, and destructure them back inside `RolodexView`. Proposed groups (final names confirmed against the actual prop list during implementation):
- `view`: `def, run, subs, idx, frontier, subjectName, activeRunId, readOnly, complete`-adjacent render inputs.
- `ui`: `expanded, setExpanded, showInputs, setShowInputs, manualEdit, setManualEdit, generating, genError`.
- `ops`: `setNav, clearTransients, reopen, toggleDone, generate, writeOutput, toggleSkip, doBrowse, doAdvance`.
- `slots`: `renderers, validators, generateDraft, generatedBadge, renderStageStatus`.
- pass-through: `fileRef, attachFor, onOverlayOpenChange`.

Behavior must not change; this is purely how props are bundled.

- [ ] **Step 1:** At the `Sqnce.jsx` call site, build the grouped objects (memoize the stable ones with `useMemo`/`useCallback` where it avoids needless churn, but correctness first) and pass them to `RolodexView`.
- [ ] **Step 2:** In `RolodexView`, change the function signature to destructure the groups, then destructure each group's fields at the top of the body so the rest of the component is unchanged.
- [ ] **Step 3: Verify** `npm test`, esbuild syntax check, react types via temp tsconfig, and the demo runtime: deck navigation, advance, skip, mark-done, expand a step, generate a draft, open an output overlay. Commit.

## Self-review

- Coverage: both deferred #114 items (useRunStore, prop-grouping) have a task.
- No placeholders: the hook contract and the prop groups are specified; the only "confirm during implementation" is the exact group membership, bounded by the real prop list.
- Risk: the `useRunStore` move touches the persistence/load path; mitigated by moving effects verbatim (same deps/guards) and runtime-verifying load/save/route in the demo. The route effect deliberately stays in the shell to keep the hook a clean persistence-plus-store unit rather than a leaky view-coupled one.

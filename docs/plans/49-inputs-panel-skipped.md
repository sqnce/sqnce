# inputs panel skipped sub-stage fix, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the "Inputs from" panel on the centered card shows nothing from a previous sub-stage that is skipped (marked not applicable), matching what `buildContext` feeds draft prompts.

**Architecture:** one condition added to the `prevDoneBlocks` memo source in `packages/react/src/ProcessRolodex.jsx`. The panel renders only when `prevDoneBlocks.length > 0`, so an empty list removes the panel. No engine changes, no new files.

**Tech Stack:** plain ESM JSX (`@sqnce/react`), esbuild syntax check, Vite demo build. `packages/react` has no test suite (per spec, verification is syntax check, demo build, and manual demo confirmation).

Spec: `docs/specs/49-inputs-panel-skipped.md`. Worktree: `.worktrees/49-inputs-panel-skipped`.

---

### Task 1: guard prevDoneBlocks on a skipped previous sub-stage (inline)

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx:415-422`

`isSubStageSkipped` is already imported from `@sqnce/core` at the top of the file. There is no react test runner in this repo, so this task is edit, syntax check, build, commit (no TDD step; the spec's verification section defines the checks).

- [ ] **Step 1: add the skip guard**

Current code at `packages/react/src/ProcessRolodex.jsx:415-422`:

```jsx
  const prevDoneBlocks = prevSub
    ? prevSub.steps
        .map((s) => ({ step: s, entry: getStepEntry(run, s.id) }))
        .filter(
          ({ step, entry }) =>
            isStepComplete(step, entry, gateTypeOf(prevSub)) && stepHasAnyOutput(step, entry)
        )
    : [];
```

Replace with:

```jsx
  const prevDoneBlocks = prevSub && !isSubStageSkipped(run, prevSub.id)
    ? prevSub.steps
        .map((s) => ({ step: s, entry: getStepEntry(run, s.id) }))
        .filter(
          ({ step, entry }) =>
            isStepComplete(step, entry, gateTypeOf(prevSub)) && stepHasAnyOutput(step, entry)
        )
    : [];
```

- [ ] **Step 2: syntax check**

Run (from the worktree root):

```bash
npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null
```

Expected: exits 0, no errors.

- [ ] **Step 3: build the demo**

```bash
npm run build -w examples/demo
```

Expected: Vite build completes with exit 0.

- [ ] **Step 4: run the core test suite (regression guard, untouched by this change)**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: commit and push**

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "inputs panel: hide a skipped sub-stage's outputs (#49)"
git push
```

### Task 2: manual demo verification (inline)

**Files:** none modified.

Walk the acceptance criteria in the running demo (`npm run dev -w examples/demo`, headless browser via the playwright-core + system Chrome setup):

- [ ] **Step 1: outputs then skip hides the panel**

In a run, enter an output in a skippable sub-stage, advance or browse to the next card, confirm the "Inputs from" panel shows the output, then mark the sub-stage not applicable and confirm the next card shows no "Inputs from" panel.

- [ ] **Step 2: restore brings the panel back unchanged**

Unskip the sub-stage, confirm the panel reappears with the same content (skip and unskip never touch `stepState`).

- [ ] **Step 3: non-skipped sub-stages unchanged**

Confirm a card whose previous sub-stage is not skipped still shows its panel exactly as before.

No commit from this task; findings that require code changes loop back to Task 1.

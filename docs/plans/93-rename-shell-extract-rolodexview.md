# Rename @sqnce/react shell to Sqnce and extract RolodexView Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the public `@sqnce/react` component from `ProcessRolodex` to `Sqnce`, and extract the still-inlined card-deck view into its own `RolodexView.jsx`, so the shell becomes a thin view-switcher over three sibling views.

**Architecture:** Two tasks. Task 1 is a pure mechanical rename across every site (the component file and its in-file identifiers, the package re-export, the demo, the README, the CI pack-job smoke test, and internal comments). Task 2 is a behavior-preserving extraction: the deck-only derived values and presentational helpers move into a new `RolodexView.jsx`, the verbatim deck JSX moves with them unchanged (it reads the same names, now as props and imports instead of closures), and the shell renders `<RolodexView .../>` in place of the inlined block.

**Tech Stack:** Plain ESM JavaScript and JSX, React, no build step in `core`. The repo's React tests are pure-function unit tests (`node:test`); there is no DOM-render harness, so the gates are the tests staying green, the demo build, the types generation, and a manual demo smoke.

## Global Constraints

- No em dashes anywhere (code, comments, docs, commit messages). Use commas, parentheses, colons, or sentence breaks.
- Brand is lowercase `sqnce` everywhere except the React component identifier `Sqnce`, which React requires to be PascalCase.
- Plain ESM JavaScript, no TypeScript. `@sqnce/core` stays dependency-free; this change is `@sqnce/react` only and adds no dependency.
- Behavior-preserving: no user-visible behavior, layout, gate, or copy change. The `pf-` CSS prefix and the `.pf-root` element are left untouched.
- Per-PR gates, all must pass: `npm test`, `npm run build -w examples/demo`, `npm run types` (must exit cleanly; the `.d.ts` it emits are gitignored and not committed).
- Generated `.d.ts` are gitignored (`.gitignore` line 15: `packages/*/types/`); never commit them. The types gate is "`npm run types` exits clean", not a committed declaration.
- Work happens in the worktree at `~/dev/sqnce-worktrees/93-rename-shell-extract-rolodexview` on branch `93-rename-shell-extract-rolodexview`. Stage files explicitly so the `node_modules` symlink stays out of commits.

---

## File structure

- Modify, then it becomes the shell: `packages/react/src/ProcessRolodex.jsx` is renamed to `packages/react/src/Sqnce.jsx` (Task 1), then has the deck block removed and replaced by `<RolodexView .../>` (Task 2).
- Create: `packages/react/src/RolodexView.jsx`, the extracted card-deck authoring view (Task 2).
- Modify (rename sites, Task 1): `packages/react/src/index.js`, `examples/demo/src/App.jsx`, `README.md`, `.github/workflows/ci.yml`, `packages/react/src/rendererContext.js`, `packages/react/src/reconcile.js`, `packages/react/src/themeScope.jsx`, `packages/react/src/stageStatus.js`.

---

## Task 1: Rename ProcessRolodex to Sqnce across all sites

**Files:**
- Rename: `packages/react/src/ProcessRolodex.jsx` to `packages/react/src/Sqnce.jsx` (with `git mv`)
- Modify: `packages/react/src/Sqnce.jsx` (in-file identifiers, after the move)
- Modify: `packages/react/src/index.js:1`
- Modify: `examples/demo/src/App.jsx:2,112`
- Modify: `README.md:66,72,167,171`
- Modify: `.github/workflows/ci.yml:62`
- Modify: `packages/react/src/rendererContext.js:5`, `packages/react/src/reconcile.js:3`, `packages/react/src/themeScope.jsx:4`, `packages/react/src/stageStatus.js:6,11`

**Interfaces:**
- Produces: the public named export `Sqnce` from `@sqnce/react` (replacing `ProcessRolodex`), defined in `packages/react/src/Sqnce.jsx` as `export default function Sqnce(props)` with the typedef `SqnceProps`. Task 2 adds `RolodexView` to this same file's imports and render.

- [ ] **Step 1: Rename the component file, preserving history**

Run (from the worktree root):
```bash
git mv packages/react/src/ProcessRolodex.jsx packages/react/src/Sqnce.jsx
```

- [ ] **Step 2: Rename the in-file identifiers in `Sqnce.jsx`**

There are exactly four occurrences of the old name in the file. Apply these exact replacements:

Line 64 (lead JSDoc example):
```
 * <ProcessRolodex />
```
becomes
```
 * <Sqnce />
```

Line 197 (props typedef):
```
 * @typedef {Object} ProcessRolodexProps
```
becomes
```
 * @typedef {Object} SqnceProps
```

Line 212 (param annotation):
```
/** @param {ProcessRolodexProps} props */
```
becomes
```
/** @param {SqnceProps} props */
```

Line 213 (the export):
```
export default function ProcessRolodex({ workflows, persistence, generateDraft, workflowGroups, initialRunFor, renderers, validators, generatedBadge, renderRunHeader, runStatus, renderStageStatus, reconcileRun }) {
```
becomes (only the function name changes):
```
export default function Sqnce({ workflows, persistence, generateDraft, workflowGroups, initialRunFor, renderers, validators, generatedBadge, renderRunHeader, runStatus, renderStageStatus, reconcileRun }) {
```

- [ ] **Step 3: Update the package re-export**

`packages/react/src/index.js` (the only export line):
```js
export { default as ProcessRolodex } from "./ProcessRolodex.jsx";
```
becomes
```js
export { default as Sqnce } from "./Sqnce.jsx";
```

- [ ] **Step 4: Update the demo app**

`examples/demo/src/App.jsx` line 2 (import):
```js
import { ProcessRolodex } from "@sqnce/react";
```
becomes
```js
import { Sqnce } from "@sqnce/react";
```

`examples/demo/src/App.jsx` line 112 (rendered element opening tag):
```jsx
      <ProcessRolodex
```
becomes
```jsx
      <Sqnce
```

Then find the matching closing tag for that element and update it. Run:
```bash
grep -n '</ProcessRolodex>\|ProcessRolodex' examples/demo/src/App.jsx
```
If a `</ProcessRolodex>` closing tag exists, change it to `</Sqnce>`. (If the element self-closes with `/>`, there is no closing tag to change.)

- [ ] **Step 5: Update the README**

`README.md` has four occurrences at lines 66, 72, 167, 171. Apply:
```js
import { ProcessRolodex } from "@sqnce/react";
```
becomes (both import lines, 66 and 167):
```js
import { Sqnce } from "@sqnce/react";
```

Line 72:
```jsx
    <ProcessRolodex
```
becomes
```jsx
    <Sqnce
```

Line 171:
```jsx
<ProcessRolodex workflows={[presales]} renderers={{ flow: FlowDiagram }} />
```
becomes
```jsx
<Sqnce workflows={[presales]} renderers={{ flow: FlowDiagram }} />
```

Then check for a closing tag for the line-72 element:
```bash
grep -n '</ProcessRolodex>\|ProcessRolodex' README.md
```
If a `</ProcessRolodex>` exists, change it to `</Sqnce>`.

- [ ] **Step 6: Update the CI pack-job smoke test**

`.github/workflows/ci.yml` line 62:
```yaml
          printf 'import { ProcessRolodex } from "@sqnce/react";\nconsole.log(typeof ProcessRolodex);\n' > entry.jsx
```
becomes
```yaml
          printf 'import { Sqnce } from "@sqnce/react";\nconsole.log(typeof Sqnce);\n' > entry.jsx
```

- [ ] **Step 7: Update internal comments in sibling files**

`packages/react/src/rendererContext.js` line 5 (mentions the file): change `ProcessRolodex.jsx` to `Sqnce.jsx`.

`packages/react/src/reconcile.js` line 3 (mentions the component): change `ProcessRolodex` to `Sqnce`.

`packages/react/src/themeScope.jsx` line 4 (mentions the component): change `provided by ProcessRolodex` to `provided by Sqnce`.

`packages/react/src/stageStatus.js` lines 6 and 11 (mention the component): change `ProcessRolodex renders` to `Sqnce renders` (line 6) and `inline in ProcessRolodex` to `inline in Sqnce` (line 11).

- [ ] **Step 8: Verify no stale references remain (outside immutable history)**

Run:
```bash
grep -rn 'ProcessRolodex' --include='*.js' --include='*.jsx' --include='*.yml' --include='*.md' . | grep -v 'docs/specs/' | grep -v 'docs/superpowers/' | grep -v 'docs/spikes/' | grep -v 'docs/plans/' | grep -v node_modules
```
Expected: no output. (The only remaining `ProcessRolodex` mentions are in `docs/specs/*`, `docs/superpowers/specs/2026-06-09-output-rendering-design.md`, `docs/spikes/80-theming-design-tokens.md`, and this plan, all immutable history or working artifacts left unchanged.)

- [ ] **Step 9: Run the gates**

Run:
```bash
npm test
```
Expected: all suites pass (engine plus the React helper suites; exit code 0).

Run:
```bash
npm run types
```
Expected: exits clean (exit code 0, no `tsc` error). Note: the demo build in the worktree resolves `@sqnce/react` through the symlinked `node_modules` to main's build, so `npm run build -w examples/demo` does not exercise this rename locally; CI's build job exercises it. Confirm the build command still succeeds (it builds main's `@sqnce/react`, which is expected):
```bash
npm run build -w examples/demo
```
Expected: build succeeds (exit code 0).

- [ ] **Step 10: Commit**

```bash
git add packages/react/src/Sqnce.jsx packages/react/src/index.js examples/demo/src/App.jsx README.md .github/workflows/ci.yml packages/react/src/rendererContext.js packages/react/src/reconcile.js packages/react/src/themeScope.jsx packages/react/src/stageStatus.js
git commit -m "refactor(react): rename ProcessRolodex export to Sqnce"
```

---

## Task 2: Extract the card-deck view into RolodexView.jsx

**Files:**
- Create: `packages/react/src/RolodexView.jsx`
- Modify: `packages/react/src/Sqnce.jsx` (add the import, remove the deck-only derived values and helpers, replace the inlined deck block with `<RolodexView .../>`)

**Interfaces:**
- Consumes: the public export `Sqnce` from Task 1.
- Produces: `export default function RolodexView(props)` in `packages/react/src/RolodexView.jsx`, rendering the card deck and bottom navigation. It receives this exact prop set (all names identical to the shell's existing variables, so the moved JSX needs no internal edits): `def, run, subs, idx, frontier, validators, renderers, subjectName, activeRunId, readOnly, generateDraft, generatedBadge, renderStageStatus, expanded, setExpanded, showInputs, setShowInputs, manualEdit, setManualEdit, generating, genError, setNav, clearTransients, reopen, toggleDone, generate, writeOutput, toggleSkip, doBrowse, doAdvance, fileRef, attachFor`.

- [ ] **Step 1: Create `RolodexView.jsx` with its imports, signature, and moved derivations**

Create `packages/react/src/RolodexView.jsx`. Start with the import block (the same core and local helpers the deck uses today, plus React):

```jsx
import React from "react";
import {
  getStepEntry,
  isStepComplete,
  stepHasAnyOutput,
  gateTypeOf,
  gateProgress,
  mainGateProgress,
  jumpTo,
  isSubStageSkipped,
  wasAdvanceForced,
  serializeStep,
  draftTarget,
  isOutputGenerated,
  hasValue,
} from "@sqnce/core";
import OutputView from "./OutputView.jsx";
import { buildRendererContext } from "./rendererContext.js";
import { OutputTypeIcon } from "./icons.jsx";
import { resolveGeneratedBadge } from "./badge.js";
import { resolveStageStatus } from "./stageStatus.js";

/*
 * The card-deck authoring view: the rotating deck of stage cards (centered
 * active card plus side cards) and the bottom navigation row (prev/next and
 * pip dots). Extracted from the shell (Sqnce.jsx) so the shell is a thin
 * switch over three sibling views (RolodexView, RunsScreen, ReadingView).
 * Behavior-preserving: the shell still owns the run-store state, the
 * mutation handlers, and the transient UI state with its reset; this view
 * receives them as props and owns only the deck's own derived view-model.
 */
export default function RolodexView({
  def,
  run,
  subs,
  idx,
  frontier,
  validators,
  renderers,
  subjectName,
  activeRunId,
  readOnly,
  generateDraft,
  generatedBadge,
  renderStageStatus,
  expanded,
  setExpanded,
  showInputs,
  setShowInputs,
  manualEdit,
  setManualEdit,
  generating,
  genError,
  setNav,
  clearTransients,
  reopen,
  toggleDone,
  generate,
  writeOutput,
  toggleSkip,
  doBrowse,
  doAdvance,
  fileRef,
  attachFor,
}) {
  /* ---------- deck-only derived view-model (moved verbatim from the shell) ---------- */
  const current = subs[idx];
  const inFrontierStage = current.mainIndex === frontier;
  const maxBrowse = subs.reduce((acc, s, i) => (s.mainIndex <= frontier ? i : acc), 0);
  const stageProg = mainGateProgress(def.mainStages[frontier], run, { validators });
  const nextMain = frontier < def.mainStages.length - 1 ? def.mainStages[frontier + 1] : null;
  const nextSub = idx < subs.length - 1 ? subs[idx + 1] : null;
  const prevSub = idx > 0 ? subs[idx - 1] : null;

  const prevDoneBlocks = prevSub && !isSubStageSkipped(run, prevSub.id)
    ? prevSub.steps
        .map((s) => ({ step: s, entry: getStepEntry(run, s.id) }))
        .filter(
          ({ step, entry }) =>
            isStepComplete(step, entry, gateTypeOf(prevSub), validators, run) && stepHasAnyOutput(step, entry)
        )
    : [];

  const typesWithValue = (step) => {
    const entry = getStepEntry(run, step.id);
    const types = [];
    (step.outputs || []).forEach((spec) => {
      if (hasValue(spec, (entry.outputs || {})[spec.id]) && !types.includes(spec.type)) types.push(spec.type);
    });
    return types;
  };

  const statusOf = (sub, step) => {
    const entry = getStepEntry(run, step.id);
    if (isStepComplete(step, entry, gateTypeOf(sub), validators, run)) return "done";
    if (stepHasAnyOutput(step, entry)) return "draft";
    return "open";
  };

  return (
    <>
      {/* MOVED-VERBATIM-DECK */}
    </>
  );
}
```

- [ ] **Step 2: Move the deck JSX verbatim into the return**

In `Sqnce.jsx`, the inlined deck currently sits in the final render branch as a fragment, from the line `<div className="pf-deck">` through the closing `</div>` of the `pf-nav` block (the block that today spans roughly lines 748 to 1078, inside the `: (` / `<>` ... `</>` / `)` of the `view === ... ? ... : ...` ternary). Cut that exact JSX (the `<div className="pf-deck">...</div>` and the following `<div className="pf-nav">...</div>`, with everything between and inside them) and paste it verbatim into `RolodexView.jsx` in place of the `{/* MOVED-VERBATIM-DECK */}` marker. Do not edit a single character of the moved JSX: every name it references (`subs`, `idx`, `frontier`, `run`, `def`, `validators`, `renderers`, `subjectName`, `activeRunId`, `readOnly`, `expanded`, `setExpanded`, `showInputs`, `setShowInputs`, `manualEdit`, `setManualEdit`, `generating`, `genError`, `generateDraft`, `generatedBadge`, `renderStageStatus`, `setNav`, `clearTransients`, `reopen`, `toggleDone`, `generate`, `writeOutput`, `toggleSkip`, `doBrowse`, `doAdvance`, `fileRef`, `attachFor`, and the helpers `gateProgress`, `isSubStageSkipped`, `jumpTo`, `getStepEntry`, `statusOf`, `draftTarget`, `serializeStep`, `typesWithValue`, `resolveStageStatus`, `resolveGeneratedBadge`, `isOutputGenerated`, `hasValue`, `buildRendererContext`, `OutputView`, `OutputTypeIcon`, `mainGateProgress`, `wasAdvanceForced`) is now either a prop, a moved derivation/helper, or an import of the same name.

- [ ] **Step 3: Wire `RolodexView` into the shell render**

In `Sqnce.jsx`, add the import near the other view imports (next to `import ReadingView from "./ReadingView.jsx";`):
```jsx
import RolodexView from "./RolodexView.jsx";
```

Replace the now-empty final ternary branch (where the deck JSX used to be) so the three views read symmetrically. The branch that was `: (` `<>` ...deck... `</>` `)` becomes:
```jsx
      ) : (
        <RolodexView
          def={def}
          run={run}
          subs={subs}
          idx={idx}
          frontier={frontier}
          validators={validators}
          renderers={renderers}
          subjectName={subjectName}
          activeRunId={activeRunId}
          readOnly={readOnly}
          generateDraft={generateDraft}
          generatedBadge={generatedBadge}
          renderStageStatus={renderStageStatus}
          expanded={expanded}
          setExpanded={setExpanded}
          showInputs={showInputs}
          setShowInputs={setShowInputs}
          manualEdit={manualEdit}
          setManualEdit={setManualEdit}
          generating={generating}
          genError={genError}
          setNav={setNav}
          clearTransients={clearTransients}
          reopen={reopen}
          toggleDone={toggleDone}
          generate={generate}
          writeOutput={writeOutput}
          toggleSkip={toggleSkip}
          doBrowse={doBrowse}
          doAdvance={doAdvance}
          fileRef={fileRef}
          attachFor={attachFor}
        />
      )}
```

- [ ] **Step 4: Remove the deck-only derivations and helpers now duplicated in the shell**

In `Sqnce.jsx`, delete the lines that only the deck used (they now live in `RolodexView`). In the `/* ---------- derived ---------- */` block, remove these lines but keep `subjectName` (the header still uses it):
```js
  const current = subs[idx];
  const inFrontierStage = current.mainIndex === frontier;
  const maxBrowse = subs.reduce((acc, s, i) => (s.mainIndex <= frontier ? i : acc), 0);
  const stageProg = mainGateProgress(def.mainStages[frontier], run, { validators });
  const nextMain = frontier < def.mainStages.length - 1 ? def.mainStages[frontier + 1] : null;
  const nextSub = idx < subs.length - 1 ? subs[idx + 1] : null;
  const prevSub = idx > 0 ? subs[idx - 1] : null;
```
And remove the `prevDoneBlocks` block, the `typesWithValue` function, and the `statusOf` function (the three definitions captured in Step 1, currently at roughly lines 553 to 576 of the shell).

- [ ] **Step 5: Remove imports the shell no longer uses, deterministically**

After the extraction, some `@sqnce/core` and local imports in `Sqnce.jsx` may be referenced only by the moved deck. For each candidate name, check whether the shell still references it (definition line excluded). Run this check:
```bash
cd ~/dev/sqnce-worktrees/93-rename-shell-extract-rolodexview
for name in OutputView OutputTypeIcon buildRendererContext resolveStageStatus resolveGeneratedBadge draftTarget isOutputGenerated serializeStep gateProgress stepHasAnyOutput gateTypeOf isStepComplete; do
  n=$(grep -c "\b$name\b" packages/react/src/Sqnce.jsx)
  echo "$name: $n"
done
```
For any name whose count is 1 (only its own import line remains) or 0, remove it from the `Sqnce.jsx` import list (the named import from `@sqnce/core`, or the whole `import` line for a default/named local import whose only symbol is now unused). Do not remove a name still referenced elsewhere in the shell (count 2 or more). Names known to remain in the shell regardless (used by the header, sidebar, run management, or other views) are not in the candidate list above, so leave the rest of the imports untouched.

- [ ] **Step 6: Syntax-check both changed files**

Run:
```bash
npx esbuild packages/react/src/RolodexView.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null
npx esbuild packages/react/src/Sqnce.jsx --bundle --format=esm --external:react --external:react-dom --external:@sqnce/core --outfile=/dev/null
```
Expected: both exit clean (exit code 0, no parse or unresolved-import errors). An unresolved local import (for example if an import was removed that the deck still needs, or a needed import is missing from `RolodexView`) fails here.

- [ ] **Step 7: Run the gates**

Run:
```bash
npm test
```
Expected: all suites pass (the extraction touches no tested helper module; exit code 0).

Run:
```bash
npm run types
```
Expected: exits clean (exit code 0).

Run:
```bash
npm run build -w examples/demo
```
Expected: build succeeds (exit code 0). Note: the worktree symlink makes this build main's `@sqnce/react`, so it does not exercise the extracted view; the manual smoke in Step 8 and CI's build job cover the real change.

- [ ] **Step 8: Manual demo smoke (the real behavior check)**

The repo has no DOM-render test, so verify the extraction by hand. Add a temporary alias in `examples/demo/vite.config.js` so the demo resolves `@sqnce/react` to the worktree source:
```js
resolve: { alias: { "@sqnce/react": new URL("../../packages/react/src/index.js", import.meta.url).pathname } }
```
Run the demo (`npm run dev -w examples/demo`), then confirm, in a finished and an in-progress run:
- all three views render and switch: the authoring deck, the runs list (Runs button), and reading mode (Read button on a finished run, then back to edit),
- the deck navigates: prev/next buttons, the pip dots, and clicking a side card,
- a step expands and collapses, and collapses on navigation,
- Generate draft produces a draft (with a generator wired) and a manual step has no Generate affordance,
- a stage advances when its gate is met, and "Advance anyway" forces past an unmet gate,
- a skippable sub-stage marks not-applicable and restores.
Then revert the temporary vite alias:
```bash
git checkout examples/demo/vite.config.js
```
(Trust CI for the real packaged build gate.)

- [ ] **Step 9: Commit**

```bash
git add packages/react/src/RolodexView.jsx packages/react/src/Sqnce.jsx
git commit -m "refactor(react): extract RolodexView from the shell"
```

---

## Self-review

**Spec coverage:**
- Spec change A (rename to `Sqnce`): Task 1, all sites including the CI pack-job smoke test (A item 5) and internal comments (A item 6). Covered.
- Spec change B (extract `RolodexView`): Task 2. Covered.
- Spec change C (leave `pf-` untouched): no task touches a `pf-` class; the moved JSX keeps every class verbatim. Covered by omission, as intended.
- Spec "The RolodexView boundary" (what stays, moves, is passed): Task 2 Steps 1-5 implement exactly that split; the prop list matches the spec's enumeration. Covered.
- Spec testing (gates plus manual smoke, no new unit test): Task 1 Step 9, Task 2 Steps 6-8. Covered.
- Spec out-of-scope (no core change, no `pf-` sweep, no behavior change, no DOM-render harness, historical docs untouched): no task violates these; Step 8 of Task 1 confirms historical docs are the only remaining old-name mentions. Covered.

**Placeholder scan:** No "TBD"/"TODO"/"handle edge cases". The one referenced-by-range move (Task 2 Step 2) names the exact source block, the exact destination marker, and asserts zero internal edits, with the full list of names it relies on; the import-cleanup step (Task 2 Step 5) is a deterministic grep procedure with an explicit keep/remove rule, not a "figure it out".

**Type/name consistency:** The prop set in Task 2's Interfaces block, the destructuring in Step 1, and the `<RolodexView .../>` attributes in Step 3 are the same 32 names in the same spelling. The export name `Sqnce` and typedef `SqnceProps` from Task 1 are used consistently. `subjectName` is explicitly retained in the shell (Step 4) and passed as a prop (Step 3), matching its dual use (header plus deck).

# spec: rename the @sqnce/react shell to Sqnce and extract RolodexView

Issue: #93 (rename the `@sqnce/react` shell (ProcessRolodex) and extract RolodexView). Milestone: none (chore, P3).

The single public component of `@sqnce/react` is named `ProcessRolodex`, but it is no longer a rolodex. It is a shell that switches between three views: the card-deck authoring view, the runs list, and reading mode. So the top-level name advertises one of the views the shell hosts, not the shell itself. This spec renames the public component to `Sqnce` (the single entry component, named after the framework) and extracts the still-inlined card-deck view into its own `RolodexView.jsx`, so the shell becomes a thin switch over three sibling view components. The runs list (`RunsScreen.jsx`) and reading mode (`ReadingView.jsx`) are already their own files; the authoring deck is the last view still inlined in the shell.

No user-visible behavior changes: this is a rename plus a behavior-preserving extraction. No layout, copy, gate, or engine change.

Layer: pure `@sqnce/react`. No `@sqnce/core` change. No new dependency.

## Current behavior

`packages/react/src/ProcessRolodex.jsx` (1664 lines) is the public component. It is re-exported as the package's only named export (`packages/react/src/index.js:1`), and it is the component consumers import: the README quickstart and renderer example, and the demo app (`examples/demo/src/App.jsx`).

Inside, the component holds `const [view, setView] = useState("rolodex")` and branches on `view` across three values: `"rolodex"` (the card deck), `"runs"` (the runs screen), and `"reading"` (reading mode for a finished run). Two of those three branches already render extracted components: `<RunsScreen .../>` and `<ReadingView .../>` (`ProcessRolodex.jsx:719, 731`). The third, the `"rolodex"` branch, still inlines its markup directly: the rotating card deck (`pf-deck`, `ProcessRolodex.jsx:748`) and the bottom navigation row with the prev/next buttons and pip dots (`pf-nav`, `ProcessRolodex.jsx:1047`), closing at `ProcessRolodex.jsx:1078`.

The component's CSS classes all use a `pf-` prefix (almost certainly an earlier "ProcessFlow" name), the prefix the component carried before an earlier rename to `ProcessRolodex`.

The repo's React tests are pure-function unit tests of extracted helper modules (for example `packages/react/test/badge.test.js`, `packages/react/test/runStatus.test.js`). There is no DOM-render harness, so no test imports `ProcessRolodex` or renders any view; the suite covers helpers only.

## Problem

A public top-level name that names one of its own sub-views is misleading: `rolodex` is one of three views the shell hosts, not the shell. The drift started when the runs screen landed (#11) and became clear once reading mode landed (#78). The fix has two parts that belong together, because the new shell name only reads correctly once `rolodex` finally names a view file rather than the shell:

1. The public component is renamed away from `ProcessRolodex` to a name that does not claim to be a single view.
2. The card-deck view is extracted into `RolodexView.jsx`, so `rolodex` names the view it describes (mirroring the already-extracted `ReadingView.jsx`), leaving the shell a thin view-switcher over `RolodexView`, `RunsScreen`, and `ReadingView`.

This was raised during #78 and deliberately deferred there: a public-API rename is a different category of change from that feature, and folding it in would have broadened a diff the review had just tightened. This issue follows #78, so it extracts `RolodexView` alongside the already-extracted `ReadingView`.

This is a clean one-shot breaking change with no compat shim: per `CLAUDE.md`, the packages are unpublished and consumers use local link dependencies, so there are no registry consumers and no deprecation cycle to honor.

## Change

### A. Rename the public component to `Sqnce`

The chosen name is `Sqnce`: the single component a consumer imports, named after the framework itself (the way `<ReactFlow>` comes from reactflow or `<Tldraw>` from tldraw). It names none of the internal views, which is the cleanest fix for a name that was wrong precisely because it named one view. `Sqnce` is the PascalCase that React requires of any component; the brand stays lowercase `sqnce` everywhere else (prose, headings, package names).

1. **Component file**: rename `packages/react/src/ProcessRolodex.jsx` to `packages/react/src/Sqnce.jsx` (use `git mv` so history follows). Inside it:
   - the `<ProcessRolodex />` example in the file's lead JSDoc (`ProcessRolodex.jsx:64`) becomes `<Sqnce />`,
   - the `@typedef {Object} ProcessRolodexProps` (`ProcessRolodex.jsx:197`) becomes `SqnceProps`,
   - the `@param {ProcessRolodexProps} props` annotation (`ProcessRolodex.jsx:212`) becomes `@param {SqnceProps} props`,
   - the `export default function ProcessRolodex(...)` (`ProcessRolodex.jsx:213`) becomes `export default function Sqnce(...)`.
2. **Package re-export** (`packages/react/src/index.js:1`): export `Sqnce` from `./Sqnce.jsx`. This is the package's only export; the public import becomes `import { Sqnce } from "@sqnce/react"`.
3. **Demo app** (`examples/demo/src/App.jsx`): the import (`App.jsx:2`) and the rendered element (`App.jsx:112`) become `Sqnce`.
4. **README** (`README.md`): the two imports and two rendered elements (`README.md:66, 72, 167, 171`) become `Sqnce`, in both the quickstart and the renderer example.
5. **CI pack-job smoke test** (`.github/workflows/ci.yml:62`): the `pack` job packs both tarballs and runs a scratch consumer that imports the public export to confirm the packed package resolves: `printf 'import { ProcessRolodex } from "@sqnce/react";\nconsole.log(typeof ProcessRolodex);\n' > entry.jsx`. The rename removes the `ProcessRolodex` export, so this import (and the `typeof` log) must become `{ Sqnce }`, or the pack job fails at module evaluation on a missing named export. This is the only rename site outside source, docs, and the README, and missing it leaves CI red even when `npm test` and the demo build pass locally.
6. **Internal comments**: sibling helper files mention the old component name in prose comments. Update them to `Sqnce` so they do not go stale: `packages/react/src/rendererContext.js:5`, `packages/react/src/reconcile.js:3`, `packages/react/src/themeScope.jsx:4`, and `packages/react/src/stageStatus.js:6, 11`. These are comment-only edits with no behavior effect.
7. **Types**: `SqnceProps` feeds the public prop surface, so run `npm run types` and confirm it succeeds (`tsc` emits no error and the regenerated declaration names `Sqnce`). The generated `.d.ts` are gitignored (`.gitignore` ignores `packages/*/types/`), so nothing is committed; CI's `test` job runs `npm run types`, and its `pack` job verifies each packed tarball contains `types/index.d.ts` (produced by `prepack`).

The many historical mentions of `ProcessRolodex` across `docs/specs/*` (over sixty occurrences, spread across roughly twenty specs) and the one in `docs/spikes/80-theming-design-tokens.md` are immutable historical design records and are left unchanged.

### B. Extract the card-deck view into `RolodexView.jsx`

Move the `"rolodex"` branch's markup (the `pf-deck` block and the `pf-nav` block, `Sqnce.jsx:748` through `:1078`) into a new `packages/react/src/RolodexView.jsx`, a component shaped like the existing `ReadingView.jsx`: it receives what it needs as props and renders the deck. The shell then renders `<RolodexView .../>` in that branch, so the three view branches read as three symmetric component renders (`RunsScreen`, `ReadingView`, `RolodexView`).

The extraction is behavior-preserving by construction: it is a move of markup into a component plus an explicit prop list where there used to be closed-over variables. No timing, reset, or layout behavior changes.

### C. The `pf-` CSS prefix is left untouched (explicit non-change)

The issue floats sweeping the `pf-` prefix as optional. This spec leaves it untouched, with no follow-up issue. The reason is scope and risk: `pf-` appears 444 times in the shell file alone and over 600 times across roughly 14 source files (the views, the renderer components, the theme helpers), plus the demo's own `examples/demo/src/demo.css`. The class `pf-root` is a structural contract: `themeScope.jsx` holds a ref to the `.pf-root` element, and the demo's copied CSS targets `pf-` classes, which the repo treats as consumer-facing reference glue. Sweeping it would be a second, larger, breakage-prone change bundled into a rename the issue wants kept tight (the same scope-broadening that got #93 split out of #78). The prefix stays as an accepted internal detail. Every `pf-` class, the `.pf-root` element, and the theme-scope ref are unchanged.

## The RolodexView boundary

The boundary is chosen to guarantee zero behavior change. The shell keeps ownership of everything it owns today; `RolodexView` is a render of the deck given that state and those callbacks as props, and it owns the deck's own derived view-model.

**Stays in the shell** (`Sqnce.jsx`): the run-store state and persistence, the active run and `view` selection, all navigation and mutation handlers (advance, browse, jump-to, mark-done/reopen, generate, write-output, attach-file, skip/unskip), the hidden file input used for attachments, the deck's transient UI state (which step is `expanded`, `generating`, the inline `genError`, the `manualEdit` list, the `showInputs` toggle) together with the `clearTransients` helper that resets them on navigation, the header (brand, stage rail, counter, workflow switcher, About/Read/Runs/Reset buttons), the run sidebar, the overview modal, and the large CSS block. Keeping the transient state and its reset in the shell, wired to navigation exactly as today, is what makes the extraction incapable of changing any timing or reset behavior.

**Moves into `RolodexView.jsx`**: the `pf-deck` and `pf-nav` markup; the deck-only presentational helpers `typesWithValue` and `statusOf` (defined today at `Sqnce.jsx:562, 571` and used only inside the deck); and the deck-only derived view-model the shell computes today only for the deck and uses nowhere else: `inFrontierStage`, `maxBrowse`, `stageProg`, `nextMain`, `nextSub`, `prevSub`, and `prevDoneBlocks` (`Sqnce.jsx:367-372, 553`). `RolodexView` recomputes these from its base props (they are cheap derivations over `def`, `run`, `subs`, `idx`, `frontier`, `validators`, using only core helpers), so the shell body gets thinner and the derivations sit next to their use.

**Passed as props** to `RolodexView`: the base data (`def`, `run`, `subs`, `idx`, `frontier`, `validators`, `renderers`, `subjectName`, `activeRunId`, `readOnly`); the injected props the deck consumes (`generateDraft`, `generatedBadge`, `renderStageStatus`); the transient state values and their setters (`expanded`/`setExpanded`, `showInputs`/`setShowInputs`, `manualEdit`/`setManualEdit`, `generating`, `genError`); the file-attachment refs (`fileRef`, `attachFor`); and the navigation and mutation callbacks the deck invokes (for example `setNav`, `clearTransients`, `toggleDone`, `reopen`, `generate`, `writeOutput`, `toggleSkip`, `doBrowse`, `doAdvance`). `RolodexView` imports the pure core functions it needs directly from `@sqnce/core` (for example `getStepEntry`, `hasValue`, `isSubStageSkipped`, `jumpTo`, `serializeStep`, `gateProgress`, `mainGateProgress`, `wasAdvanceForced`, `isOutputGenerated`, `draftTarget`, `isStepComplete`, `stepHasAnyOutput`, `gateTypeOf`), and the React-layer helpers it needs (`OutputView`, `buildRendererContext`, `OutputTypeIcon`, `resolveStageStatus`, `resolveGeneratedBadge`), the same imports the shell uses today.

The deck genuinely depends on a wide surface, so `RolodexView` takes on the order of two dozen props. That is faithful to what the deck needs. If the list reads as unwieldy during implementation, the plan may group related props into a small number of plain objects (for example one bundle for navigation callbacks and one for generation state); that grouping is a plan-level detail and not a behavior change. The exact final prop list is settled in the plan.

## Testing

No test imports the public component or renders any view (the React suite covers helper modules only), so the existing tests pass by construction and will not catch a regression in the extracted deck. Verification is therefore:

- The three per-PR gates: `npm test` (engine plus React helper suites all green), `npm run build -w examples/demo` (the demo, which imports the renamed `Sqnce`, builds), and `npm run types` (must exit cleanly; the `.d.ts` it emits are gitignored and not committed, and the regenerated declaration names `Sqnce`).
- CI additionally runs the `pack` job, which packs both tarballs and evaluates a scratch consumer that imports the public export (change A item 5). Its import is renamed to `{ Sqnce }`, and the job must go green; this is the one rename site the local gates do not exercise, so CI is where it is confirmed.
- A manual smoke of the demo confirming no behavior changed: all three views still render and switch (authoring deck, runs list, reading mode), and the deck still navigates (prev/next, pip dots, side-card click), expands and collapses steps, generates a draft, advances a stage (met and forced), and marks a sub-stage not applicable. Because the worktree's symlinked modules resolve `@sqnce/react` to main's build, drive this by aliasing the demo's `@sqnce/react` to the worktree's `packages/react/src` in the demo's vite config locally (revert before commit); trust CI for the real packaged build gate.

No new unit test is added: the change introduces no new pure helper to test (the moved helpers and derived values are unchanged in behavior), and the repo has no DOM-render harness, so adding one is out of scope for a rename-and-extract chore.

## Out of scope

- Any `@sqnce/core` change. This is `@sqnce/react` only.
- The `pf-` CSS prefix sweep (see change C): left untouched, no follow-up.
- Reading mode (#78) and the runs screen, beyond the symmetry they gain by sitting next to a now-extracted `RolodexView`. No change to `ReadingView.jsx` or `RunsScreen.jsx`.
- Any behavior, layout, gate, or copy change.
- Adding a DOM-render test harness to the React package.
- Rewriting historical `docs/specs/*` and `docs/spikes/*` mentions of the old name.

## Acceptance

- The public export and the component file are renamed from `ProcessRolodex` to `Sqnce`; the package re-export, the README quickstart and renderer example, and the demo app all import and render `Sqnce`.
- The card-deck authoring view lives in its own `packages/react/src/RolodexView.jsx`; the shell renders it as `<RolodexView .../>` alongside `<RunsScreen .../>` and `<ReadingView .../>`, so the shell is a thin view-switcher.
- No user-visible behavior changes: all three views render and switch as before, and the deck navigates, expands steps, generates, advances (met and forced), and skips exactly as today.
- The `pf-` prefix and the `.pf-root` contract are unchanged.
- `npm test`, `npm run build -w examples/demo`, and `npm run types` all pass (the `.d.ts` that `npm run types` emits are gitignored, so none are committed; the regenerated declaration names `Sqnce`).
- CI is green, including the `pack` job's scratch-consumer smoke test, which imports `{ Sqnce }` from the packed tarball.

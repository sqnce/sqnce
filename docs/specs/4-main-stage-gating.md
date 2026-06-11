# spec: per-main-stage gating

Issue: #4. Today the engine flattens all sub-stages into one linear chain and every adjacent pair has a gate. This spec implements the decision recorded on the issue (evaluated 2026-06-11, Option A): sub-stages within a main stage become freely navigable, and the hard commit happens only at main-stage boundaries. The main-stage gate is the aggregate of its sub-stage gates; no schema change.

Key structural fact: `stepState` already tracks completion independently of position, and `frontier` only encodes the commit line. This change moves the commit line; progress tracking is untouched.

## Run state

Run shape stays `{ idx, frontier, stepState }`:

- `idx` is unchanged: the flat sub-stage index of the centered card.
- `frontier` changes unit: it is now the index of the furthest committed main stage.
- `createRun()` is unchanged (`{ idx: 0, frontier: 0, stepState: {} }`) and stays definition-independent.

The run store shape is unchanged, but persisted runs would misread the new `frontier` unit, so `createRunStore()` bumps to `version: 3` and the rolodex loader accepts only version 3 stores. Older stores are discarded on load. No migration, pre-launch.

## Core (`@sqnce/core`)

Changed functions (signatures noted where they change):

- `browse(run, subStages, direction)` / `jumpTo(run, subStages, index)`: the browsable range becomes `[0, last flat index of the frontier main stage]` (clamped to the definition). Moving forward between sibling sub-stages is plain browsing, no commit.
- `advance(run, subStages, { force })`: commits the next main stage. Legal from any card whose `mainIndex` equals `frontier` (requiring the last card would be arbitrary when order inside is free); a no-op when browsing a committed stage or when the frontier stage is the last. The gate is the stage aggregate (below); `force` overrides exactly as today and remains unrecorded in run state (#5 owns recording). On success: `frontier + 1`, and `idx` jumps to the first sub-stage of the newly committed stage.
- `buildContext(subStages, run, flatIdx, excludeStepId?)`: rule changes from "everything strictly before the current card" to: all completed steps in main stages before the current card's main stage, plus completed sibling steps within the current main stage (any card, including the current one), excluding `excludeStepId`. Free order makes "completed sibling after the current card" common; the old positional rule would silently drop it. `buildDraftPrompt` passes the drafted step's id; its own signature is unchanged.

New function:

- `mainGateProgress(mainStage, run)`: `{ met, done, total, missing }` aggregated across the stage's sub-stages. `met` requires every sub-stage's `gateProgress(...).met`; `done`/`total` count required steps across the stage; `missing` lists step names, qualified as `"<sub-stage>: <step>"` when the stage has more than one sub-stage, plain step names otherwise (keeps single-sub-stage stages reading exactly as today).

Untouched: `gateProgress` (per-sub-stage, still drives card displays, the rail, and `runSummary`), `isStepComplete` and all hybrid/strict semantics, `gate.type`'s job (step-completion semantics; a strict sub-stage mid-stage still blocks the boundary until its steps are explicitly done), `runSummary`, `validateDefinition`, all run store functions except the version constant.

TDD for all engine changes. Navigation and gating tests in `packages/core/test/engine.test.js` are rewritten to the new semantics against the core-owned fixture (which has multiple main stages, including a multi-sub-stage one).

## UI (`@sqnce/react`, rolodex)

`frontier` clamps against `def.mainStages.length - 1`. "In the frontier stage" replaces "at the frontier" (`subs[idx].mainIndex === frontier`).

- **Gate footer** (centered card): cards in the frontier main stage show the stage aggregate from `mainGateProgress` ("Stage gate met, ready to advance" / "N required steps left in this stage" plus the qualified missing list) and the advance affordance: "Advance to <next main stage name>" when met, "Advance anyway" override when not, none when the frontier stage is the last. Committed (historical) cards keep today's per-card gate line with no button.
- **Cards**: per-step display and the per-card `done/total` eyebrow are unchanged. Locked cards and pips are those beyond the frontier main stage; everything inside it is clickable and editable.
- **Navigation**: forward nav disables at the last card of the frontier main stage; the browsing-history hint shows only on committed stages and names the frontier main stage.
- **Rail**: unchanged logic, now reading `frontier` directly as the main index (it already derives `frontierMain` today); fills through the frontier main stage.
- Keyboard navigation, read-only mode, draft generation flow, renderers: unchanged behavior, new range rules apply automatically through `browse`/`advance`.

## Demo (`examples/demo`)

- `seeds.js` converts each seeded `frontier` from a flat sub-stage index to its main-stage index (car-buying 3 to 2, presales 4 to 1, moving 1 to 1, trip 1 to 1, meal 1 to 0). `idx` values stay flat and unchanged.
- Side effect to accept: some previously locked cards become browsable because their main stage is now open (for example presales Orals Prep). They open empty; no new seed content.
- The version 3 store check discards existing localStorage; the demo reseeds. Storage key unchanged.

## Docs

Same-PR updates: core file header comment, `README.md` (run shape and frontier bullets), `packages/react/README.md` (locked-beyond-frontier line), `CLAUDE.md` (run shape in Architecture, "Key behaviors to preserve" bullets that state frontier and browsing semantics).

## Out of scope

- Skippable sub-stages and recording skips or forced advances (#5).
- Per-definition or per-main-stage gating modes, any schema change, renaming `gate`.
- Auto-advance when a gate becomes met; advancing stays explicit.
- Visual regrouping of pips by main stage or any rail redesign.
- Definition content changes (all eight bundled definitions are untouched).

## Acceptance

- `npm test` passes with rewritten navigation/gating tests covering: browse and jumpTo across the whole frontier main stage and not past it; advance legal from any frontier-stage card and a no-op from committed stages; the aggregate gate unmet while any sub-stage gate (including a strict one) is unmet, met when all are; force override; `idx` landing on the first card of the committed stage; `buildContext` including a completed sibling that sits after the current card and excluding the drafted step; `createRunStore().version === 3`.
- In the demo: at the presales seed, all four Proposal & Demo cards are browsable and editable with no gate between them; the footer shows stage aggregate progress and "Advance to SOW" only once the whole stage's required steps are done (override available before); advancing lands on Scope Definition and fills the rail; pips beyond Proposal & Demo are locked before the advance; a stored version 2 state is discarded and reseeds.
- Single-sub-stage main stages read exactly as today (plain missing names, same footer rhythm).
- `npm run build -w examples/demo` and `npm run types` pass.

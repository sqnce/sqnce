# spec: engine sub-branching in @sqnce/core

Issue: #66. Closes #66.

Driving need: today the engine is strictly linear. A `Run` carries a single integer `frontier` over a flat `mainStages[]` list, and `advance` only ever does `frontier + 1` when the current stage's gate is met. There is no track / branch concept. The presales-sqnce "RFP response drafting" epic needs one pursuit that shares an upstream spine, then **forks into independent tracks that each finish at their own terminal**, with no requirement to rejoin. This issue adds that capability to the pure engine only.

## The shape, by example

```
spine:  S0 Intake  ->  S1 Findings
                          |  fork (after the last spine stage)
            track "demo"      (optional):  D0 Script -> D1 Build  -> D2 demo-QA*
            track "response"  (required):  R0 Draft  -> R1 Review -> R2 Sign-off*

(* = terminal: the track's last main stage)
mainStages[] order: [S0, S1, D0, D1, D2, R0, R1, R2]
```

- Each track advances and gates **on its own**: advancing demo never waits on response.
- **Optional** track (demo) can be marked not-applicable for a run; **required** (response) cannot.
- A run is **complete** when every required track (plus any optional track the run kept) has reached its terminal, meaning that terminal stage's boundary gate is met.
- A definition with no fork behaves **exactly** as today (one implicit track).

## Scope (confirmed during intent gate)

Engine + validation only: core logic, `validateDefinition`, JSDoc type declarations, and a new forked test fixture. **No UI**, no bundled-definition migration. One fork boundary, N parallel linear tracks, **no nesting, no rejoin, no multiple fork points**. The "clearing / cascade-invalidation" line from the issue body is **dropped** (owner decision): editing an upstream value never auto-wipes downstream outputs, here or anywhere.

## Definition schema (additive)

Two new optional fields; absence means a linear definition, validated and run exactly as today.

```js
Definition.tracks?: Array<{ id: string, name: string, optional?: boolean }>
MainStage.track?: string   // track id; absent = shared spine
```

The fork is **derived**, not a separate node: the **spine** is the untagged main stages (a non-empty contiguous prefix); the fork sits after the last spine stage; each **track** is the contiguous run of main stages tagged with its id; a track's **terminal** is its last main stage (implicit, no explicit field). `optional: true` marks a track skippable per run; absent/`false` means required. Sub-stages inherit their main stage's track; track membership lives at main-stage grain because that is the engine's only gate boundary (`frontier` is a main-stage index).

### Validation (`validateDefinition`, only when `tracks` is present)

Rejections (each a clear problem string), covering the issue's named cases and the boundaries pinned in the intent gate:

1. fewer than 2 tracks (a fork needs at least two); a track missing a non-empty `id`/`name`; duplicate track ids.
2. a `mainStage.track` referencing an undeclared track.
3. an **empty spine** (stage 0 already tagged: the fork would have nothing shared before it; AC says "fork after a shared stage").
4. a **shared stage after the fork** (an untagged main stage appearing after the first tagged stage = an implicit rejoin).
5. a **non-contiguous track** (a track's stages interleaved with another's), so each track is a single linear run.
6. a declared track that **owns no main stage** (unreachable track / no terminal).
7. the `subject` step (when `subject` is declared) living **outside the spine**, which would let a not-applicable track strand subject resolution.

Existing rules are unchanged (global step-id uniqueness, sub-stage id uniqueness, gate types, output specs, render/validate hints). All 8 bundled definitions and the existing linear fixture must keep validating with zero edits.

## Run state (additive)

```js
Run.trackFrontier?: { [trackId: string]: number }   // furthest committed main-stage index within each track
Run.skippedTracks?: { [trackId: string]: true }      // optional tracks marked not-applicable this run
```

`frontier` keeps its exact meaning: the furthest committed **spine** stage. For a linear definition the spine is the whole process, so `frontier` ranges over every stage exactly as today and **neither new field ever appears** (a linear run is byte-identical to a current run). For a forked definition, `frontier` tops out at the last spine stage; `trackFrontier` appears the moment the fork opens.

**Representation choice.** Keep `frontier` as the spine pointer and add a per-track frontier map (chosen), versus replacing `frontier` with a single lane->index map covering spine and tracks uniformly (rejected: it changes the linear run shape, breaking "linear unchanged" and the demo seeds, which use a plain integer `frontier`). The chosen shape is purely additive and leaves the untouched UI and seeds working for every linear definition. Active / complete / skipped track status is **derived** from `trackFrontier` + gates + `skippedTracks`, never stored (single source of truth).

## Engine behavior

`flattenSubStages` annotates each flat sub-stage with its `track` (from its main stage; absent = spine). `advance(run, subStages, { force, validators })` reads the centered card's region from that annotation:

- **Spine, not the last spine stage:** advance the spine as today (gate = the spine stage aggregate; on success `frontier + 1`, `idx` to the first sub of the next spine stage; a forced advance records `forces[frontier]`). Unchanged path, and the only path a linear definition can take.
- **Last spine stage (the fork boundary):** advancing **opens the fork**. On a met (or forced) gate, set `trackFrontier[t]` to track `t`'s first main-stage index for **every** track, and land `idx` on the first sub-stage of the first track. `frontier` stays at the last spine index. A forced open records `forces[lastSpineIndex]` as usual.
- **Inside a track, not at its terminal:** advance that track only (gate = the current track-stage aggregate; on success `trackFrontier[t]` to the next stage in `t`, `idx` to its first sub; a forced advance records `forces[currentStageIndex]`).
- **At a track terminal, or while browsing a committed stage:** no-op (nothing commits past a terminal), matching today's last-stage behavior.

`browse` / `jumpTo` / `lastIndexInMain` bound movement by the committed region: the spine prefix `<= frontier`, plus, for each open track, that track's committed flat range `<= trackFrontier[t]`. Navigation can move back into the committed spine and across to another open track. For a linear definition this collapses to today's single `<= frontier` prefix exactly.

`buildContext` becomes track-scoped: for a card in track `t`, include completed steps from the spine and from `t`'s own earlier stages, and **exclude sibling tracks** and any skipped sub-stage or skipped track. For a card in the spine, include completed spine steps up to the card. For a linear definition the spine is everything, so context is identical to today (every earlier stage). This is the one place the cross-track non-leak guarantee is enforced: a demo draft never sees response outputs.

New pure helpers (all derived, none persisted):

- `isRunComplete(definition, run, opts)`: true iff every required, non-skipped track has its terminal stage's boundary gate met (a forced or unmet terminal does **not** count). For a linear definition this is the last stage's gate being met, a new but inert signal.
- `trackStatus(definition, run, trackId)`: `"not-open" | "active" | "complete" | "skipped"`, derived for "active / complete-track tracking".
- `skipTrack(run, definition, trackId)` / `unskipTrack(run, definition, trackId)` / `isTrackSkipped(run, trackId)`: mirror the sub-stage skip API. `skipTrack` is a no-op unless the track exists and is declared `optional` (required tracks cannot be skipped, exactly as non-skippable sub-stages cannot); it sets `skippedTracks[trackId]` and never touches `stepState`. `unskipTrack` removes the entry and drops the map when empty. Gates, `runSummary`, `buildContext`, and `isRunComplete` exclude a skipped track's sub-stages by extending the existing skipped-sub-stage exclusion to also test the sub-stage's track.

`runSummary` excludes skipped tracks' sub-stages from both counts (it already excludes skipped sub-stages). `resolveSubject` / `runDisplayName` are unaffected because the subject is validated into the spine. `forces` stays keyed by main-stage index (a stage belongs to exactly one track and indices stay globally unique), so the untouched UI's `wasAdvanceForced(run, sub.mainIndex)` reads keep working.

`cloneRun` fail-fast: a full clone deep-copies the whole run including `trackFrontier` / `skippedTracks` (still via `structuredClone`). `uptoStageId` truncation that resolves to a **tracked (post-fork) stage throws** a clear error (fork-aware truncation is deferred until a consumer needs it); truncation to a **spine** stage works as today and drops the track maps (they are entirely past the cut). This converts the silent index-order corruption a fork would otherwise cause into a loud boundary error.

## Backward compatibility

A definition with no `tracks` (and no `track` on any stage) takes the existing code path through every function above; the new run fields never materialize; the run shape is byte-identical to today. The regression bar is positive, not just "files unedited": the existing engine + run-store suites, the "all bundled definitions validate" test, and `npm run build -w examples/demo` all stay green unchanged. No persistence version bump, migration, or compat shim (pre-publish stance: ship breaking changes clean; here the surface is additive anyway).

## Files

- `packages/core/src/index.js`: new typedefs (`Track`, `MainStage.track`, `Run.trackFrontier`, `Run.skippedTracks`); fork rules in `validateDefinition`; track annotation in `flattenSubStages`; track-aware `advance`, `browse`, `jumpTo`, `lastIndexInMain`, `buildContext`, `runSummary`; new `isRunComplete`, `trackStatus`, `skipTrack`, `unskipTrack`, `isTrackSkipped`; `cloneRun` fail-fast. JSDoc throughout so `npm run types` emits declarations. No linear-path behavior or signature changes.
- `packages/core/test/fixtures/`: a **new forked fixture** (non-empty spine, two tracks one optional and one required, both gate types present, a terminal per track, subject in the spine, a skippable sub-stage). The existing linear `workflow.js` fixture is untouched.
- `packages/core/test/engine.test.js`: new fork suites; existing linear tests unchanged.
- `packages/core/test/runstore.test.js`: a `cloneRun` fork fail-fast test.

## Docs

- `CLAUDE.md`: key-behavior notes for sub-branching (the `tracks` / `track` schema, the derived spine-and-fork model, the additive `trackFrontier` / `skippedTracks` run fields, independent per-track advancement, the run-complete signal, track skip mirroring sub-stage skip, cross-track context non-leak, and `cloneRun` fail-fast on a forked truncation).
- `npm run types` regenerates the `.d.ts`.
- Root `README.md` / `packages/react/README.md`: verify; the engine API list there does not currently enumerate these helpers, so likely no change.

## Out of scope

- Any UI / rolodex branch rendering or layout; forked definitions are driven only in code and tests this issue. The UI keeps working because no forked definition is fed to it.
- Migrating `presales.json` or any bundled definition to a fork (the genuinely-forked presales lives in presales-sqnce; `definitions/` stays validate-only).
- Active cascade-invalidation / "editing a shared stage clears downstream tracks" (dropped by owner; not built here or as a follow-up unless re-raised).
- Nested forks, multiple fork points, rejoin / merge, cross-track step dependencies; an explicit terminal field; sub-stage-granular track membership.
- Fork-aware `cloneRun` truncation (fail-fast only).
- Per-run override of a track's requiredness (the run-level lever is only "skip an optional track").
- Persistence version bump, migration, or compat shim.

## Acceptance

`npm test` passes with new tests covering:

- **Validation:** rejects each malformed topology in the list above (fewer than 2 tracks, empty spine, shared stage after the fork, non-contiguous track, undeclared track reference, track with no stage, subject outside the spine) and accepts a well-formed fork. All 8 bundled definitions and the linear fixture still validate (suite unchanged).
- **Flatten:** annotates each flat sub-stage with its track (spine entries carry none).
- **Advance:** the spine advances as today; advancing past the last spine stage opens the fork with every track at its first stage and `frontier` unchanged; advancing one track moves only that track's frontier (the sibling is untouched); a track terminal is a no-op; a forced advance records `forces` by stage index.
- **Navigation:** `browse` / `jumpTo` are bounded per region, move between the spine and an open track, and are identical to today for the linear fixture.
- **Context scoping:** a draft for a step in one track includes the spine and that track, and excludes the sibling track; linear context is unchanged.
- **Optional / required:** `skipTrack` works only on an optional track and is a no-op on a required or unknown track; a skipped track is excluded from `runSummary`, context, and `isRunComplete`; `unskipTrack` restores it; neither touches `stepState`.
- **Run-complete:** false until every required (plus kept optional) track's terminal gate is met; true when they are; a forced or gate-unmet terminal does not count; a skipped optional track is excluded; a linear run is complete when its last stage's gate is met.
- **cloneRun:** a full clone deep-copies `trackFrontier` / `skippedTracks` (distinct objects, drivable); truncating at a tracked stage throws; truncating at a spine stage works and drops the track maps.
- **Regression:** the existing engine and run-store suites pass unmodified; `npm run types` includes the new exports; `npm run build -w examples/demo` is green.

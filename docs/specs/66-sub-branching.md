# spec: engine sub-branching in @sqnce/core

Issue: #66. (The closing keyword lives in the PR body, the merge vehicle; this file does not carry it.)

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

### Validation (`validateDefinition`)

When `tracks` is **absent**, the definition is linear and validated exactly as today, with one addition: a `mainStage.track` present without a `tracks` declaration is **rejected** (a stray track tag with no fork is a misconfiguration, not a silent linear run; track fields and the `tracks` declaration must both be present or both absent). When `tracks` is **present**, the following must hold, each rejection a clear problem string, covering the issue's named cases and the boundaries pinned in the intent gate:

1. fewer than 2 tracks (a fork needs at least two); a track missing a non-empty `id`/`name`; duplicate track ids; a track's `optional` present and not a boolean (mirrors the existing `skippable` boolean check); a track `id` that is a reserved object-prototype key (`__proto__`, `constructor`, `prototype`), since track ids become run-state map keys and such a key cannot be written as an own data property.
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

Read paths use the **effective** skipped-track set, not the raw map: a `trackId` in `skippedTracks` is honored only when the definition declares that track and marks it `optional`. A required or unknown id (reachable through stale, imported, or corrupted persisted state) is ignored everywhere, so bad state can never drop required work, hide it from gates, or let a run complete without it. The requiredness guard therefore lives at every read, not only on the `skipTrack` write, because runs are JSON-persisted and a write-time guard alone is insufficient.

`validateDefinition` rejects a track id that is a reserved object-prototype key (`__proto__`, `constructor`, `prototype`), so a valid definition never writes such a key (assigning `trackFrontier["__proto__"]` would not even create an own property). Reads of `trackFrontier` and `skippedTracks` additionally use own-property checks (`Object.prototype.hasOwnProperty.call`, as `cloneRun` already does for store entries), never bare key truthiness, so even a corrupted persisted run cannot have an inherited property name read as a real frontier or skip entry. The broader run-id hardening of this class is tracked in #69; this spec simply does not add a new instance of the hole.

`frontier` keeps its exact meaning: the furthest committed **spine** stage. For a linear definition the spine is the whole process, so `frontier` ranges over every stage exactly as today and **neither new field ever appears** (a linear run is byte-identical to a current run). For a forked definition, `frontier` tops out at the last spine stage; `trackFrontier` appears the moment the fork opens.

**Representation choice.** Keep `frontier` as the spine pointer and add a per-track frontier map (chosen), versus replacing `frontier` with a single lane->index map covering spine and tracks uniformly (rejected: it changes the linear run shape, breaking "linear unchanged" and the demo seeds, which use a plain integer `frontier`). The chosen shape is purely additive and leaves the untouched UI and seeds working for every linear definition. Active / complete / skipped track status is **derived** from `trackFrontier` + gates + `skippedTracks`, never stored (single source of truth).

## Engine behavior

`flattenSubStages` annotates each flat sub-stage with its `track` (from its main stage; absent = spine). `advance(run, subStages, { force, validators })` reads the centered card's region from that annotation:

- **Spine, not the last spine stage:** advance the spine as today (gate = the spine stage aggregate; on success `frontier + 1`, `idx` to the first sub of the next spine stage; a forced advance records `forces[frontier]`). Unchanged path, and the only path a linear definition can take.
- **Last spine stage (the fork boundary):** advancing **opens the fork**, but only when it is not already open (no `trackFrontier` present). On a met (or forced) gate, set `trackFrontier[t]` to track `t`'s first main-stage index for **every** track, and land `idx` on the first sub-stage of the first **non-skipped** track (skipping over any optional track already marked not-applicable); if every track is skipped, `idx` stays on the last spine sub-stage. `frontier` stays at the last spine index. A forced open records `forces[lastSpineIndex]` as usual. Opening is **idempotent**: once the fork is open, advancing again from the last spine stage (reached by browsing back) is a no-op that preserves every per-track frontier, never resetting track progress.
- **Inside a track, not at its terminal:** advance that track only (gate = the current track-stage aggregate; on success `trackFrontier[t]` to the next stage in `t`, `idx` to its first sub; a forced advance records `forces[currentStageIndex]`).
- **At a track terminal, while browsing a committed stage, or centered in a skipped track:** no-op (nothing commits past a terminal, and a not-applicable track is never progressed), matching today's last-stage behavior.

`browse` / `jumpTo` / `lastIndexInMain` bound movement by the committed region: the spine prefix `<= frontier`, plus, for each open **non-skipped** track, that track's committed flat range `<= trackFrontier[t]`. A track in `skippedTracks` is **excluded from the navigable region**: `browse` / `jumpTo` cannot enter it (a not-applicable branch is off the table; un-skip is by `trackId`, not by navigating in). Navigation can move back into the committed spine and across to another open non-skipped track. For a linear definition this collapses to today's single `<= frontier` prefix exactly.

**Invariant:** `idx` is always inside the reachable region (the committed spine plus open non-skipped tracks). The two transitions that could violate it preserve it: opening the fork lands `idx` on the first non-skipped track (or the last spine sub-stage when every track is skipped), and `skipTrack` recenters `idx` out of a track it just made non-navigable.

`buildContext` becomes track-scoped: for a card in track `t`, include completed steps from the spine and from `t`'s own earlier stages, and **exclude sibling tracks** and any skipped sub-stage or skipped track. For a card in the spine, include completed spine steps up to the card. For a linear definition the spine is everything, so context is identical to today (every earlier stage). A demo draft never sees response outputs.

The **same reachable set** (spine plus the step's own track) scopes the run view passed to **validators** for a forked definition: a validator evaluating a track step receives a **sanitized** `run` whose `stepState`, `skips`, `forces`, `trackFrontier`, and `skippedTracks` are all filtered to the reachable set, while the shared spine `frontier` is preserved. So neither `getStepEntry` nor a direct field read can reach a sibling track's outputs, progress, skip, or force markers, and a validator's pass/fail decision or problem message can never depend on or surface sibling-track state. A spine step's validator sees spine only. For a linear definition the reachable set is the whole run, so the view equals the run exactly as today (the run-aware #62-64 contract is unchanged for intra-track and spine relation; only the illegitimate cross-track reach is removed). One reachability rule thus closes the non-leak guarantee for both draft context and gating, making independent per-track gating structural rather than conventional.

New pure helpers (all derived, none persisted):

- `isRunComplete(definition, run, opts)`: true iff (a) every non-skipped sub-stage gate along the **kept path** (the committed spine plus every track not in `skippedTracks`) is met, so a stage forced past with an unmet gate keeps the run incomplete, and (b) every kept track (required, since required tracks cannot be skipped, plus any optional track not in `skippedTracks`) has reached its terminal, meaning its `trackFrontier` equals the track's terminal stage index (for a linear definition, `frontier` at the last main stage). The reached check stops a prefilled or imported output (`stepState` is independent of `frontier` / `trackFrontier`) from reporting completion before the run advanced there; the all-gates-met check stops a forced advance past unmet intermediate or terminal work from doing so. A new but inert signal for linear definitions.
- `trackStatus(definition, run, trackId, opts)`: `"not-open" | "active" | "complete" | "skipped"`, derived for "active / complete-track tracking". It takes the same `opts` (`validators`) as `isRunComplete` / `runSummary` / `advance`, so a validator-rejected gate is seen consistently: a track whose terminal output is rejected by its validator reports `active`, never `complete`.
- `skipTrack(run, definition, trackId)` / `unskipTrack(run, definition, trackId)` / `isTrackSkipped(run, definition, trackId)`: mirror the sub-stage skip API. `isTrackSkipped` takes the definition and returns the **effective** skip state (true only when the definition declares the track `optional` and it is in `skippedTracks`; a required or unknown id reads as not-skipped), so no consumer can treat corrupted raw state as authoritative. `skipTrack` is a no-op unless the track exists and is declared `optional` (required tracks cannot be skipped, exactly as non-skippable sub-stages cannot); it sets `skippedTracks[trackId]` and never touches `stepState`. Skipping the track currently under `idx` **recenters** `idx` to the last committed spine sub-stage (always present and reachable), preserving the reachability invariant; skipping a track `idx` is not in leaves `idx` unmoved. This differs from `skipSubStage` (which never moves `idx`, because a skipped sub-stage stays navigable, while a skipped track does not). `unskipTrack` removes the entry and drops the map when empty. Gates, navigation, `advance`, `runSummary`, `buildContext`, and `isRunComplete` exclude an effectively-skipped track's sub-stages (the effective set above) by extending the existing skipped-sub-stage exclusion to also test the sub-stage's track.

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

- **Validation:** rejects each malformed topology in the list above (a stray `mainStage.track` with no `tracks` declaration, fewer than 2 tracks, a non-boolean `track.optional`, a reserved-prototype track id such as `__proto__`, empty spine, shared stage after the fork, non-contiguous track, undeclared track reference, track with no stage, subject outside the spine) and accepts a well-formed fork. All 8 bundled definitions and the linear fixture still validate (suite unchanged).
- **Flatten:** annotates each flat sub-stage with its track (spine entries carry none).
- **Advance:** the spine advances as today; advancing past the last spine stage opens the fork with every track at its first stage and `frontier` unchanged; opening is idempotent (browsing back to the fork boundary and advancing again is a no-op that preserves every per-track frontier); advancing one track moves only that track's frontier (the sibling is untouched); a track terminal is a no-op; a forced advance records `forces` by stage index.
- **Navigation:** `browse` / `jumpTo` are bounded per region, move between the spine and an open track, and are identical to today for the linear fixture; the `idx` reachability invariant holds across transitions: opening the fork with the first track already skipped lands `idx` on the first non-skipped track, skipping the track under `idx` recenters it to the last spine sub-stage, and `idx` is never left on a non-navigable card.
- **Context scoping:** a draft for a step in one track includes the spine and that track, and excludes the sibling track; a validator on a track step sees a sanitized run view (`stepState`, `skips`, `forces`, `trackFrontier`, `skippedTracks` filtered to spine plus its own track), so a validator that inspects a sibling step's output or a sibling track's `trackFrontier` / `skippedTracks` / `skips` / `forces` finds none and cannot affect the gate result or its problem message; linear context and the full-run validator view are unchanged.
- **Optional / required:** `skipTrack` works only on an optional track and is a no-op on a required or unknown track; a skipped track is excluded from `runSummary`, context, and `isRunComplete`; `browse` / `jumpTo` cannot enter a skipped track and `advance` is a no-op while centered in one (asserted for skipping both before and after the fork opens); a required or unknown track id present in `run.skippedTracks` is ignored by every read path (gates, navigation, `runSummary`, context, `isRunComplete`), so corrupted state cannot drop required work, and `isTrackSkipped(run, definition, trackId)` returns the effective state (false for such an id); `unskipTrack` restores it; neither touches `stepState`.
- **Run-complete:** false until every kept track (required plus any unskipped optional) has reached its terminal and every non-skipped gate along the kept path (committed spine plus kept tracks) is met; true when they are; a kept (unskipped) optional track blocks completion until its own terminal is reached and gated, while a skipped optional track is excluded; a stage forced past with an unmet gate (intermediate spine or track stage, not just the terminal) keeps the run incomplete; completion stays false when a terminal's outputs are prefilled but the frontier has not reached that terminal (`stepState` present, `trackFrontier` / `frontier` still earlier); a validator-rejected terminal output keeps both `isRunComplete` and `trackStatus` incomplete; a linear run is complete when `frontier` is at the last main stage with its gate met.
- **cloneRun:** a full clone deep-copies `trackFrontier` / `skippedTracks` (distinct objects, drivable); truncating at a tracked stage throws; truncating at a spine stage works and drops the track maps.
- **Robustness:** a reserved-prototype track id is rejected at validation; and even a corrupted persisted run carrying such a key in `trackFrontier` / `skippedTracks` is never read as opened, skipped, or complete (own-property checks).
- **Regression:** the existing engine and run-store suites pass unmodified; `npm run types` includes the new exports; `npm run build -w examples/demo` is green.

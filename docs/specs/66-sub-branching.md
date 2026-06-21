# spec: engine sub-branching in @sqnce/core

Issue: #66.

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

`flattenSubStages` annotates each flat sub-stage with its `track` (from its main stage; absent = spine) and that track's `optional` flag (from `definition.tracks`), so every `subStages`-based read path can compute the effective skipped-track set without separately threading the definition. `advance(run, subStages, { force, validators })` reads the centered card's region from that annotation:

- **Spine, not the last spine stage:** advance the spine as today (gate = the spine stage aggregate; on success `frontier + 1`, `idx` to the first sub of the next spine stage; a forced advance records `forces[frontier]`). Unchanged path, and the only path a linear definition can take.
- **Last spine stage (the fork boundary):** advancing **opens or repairs the fork**, computed per declared track rather than on map presence. On a met (or forced) gate, for every declared track that lacks a valid `trackFrontier` entry set it to that track's first main-stage index, and preserve every existing valid frontier; so a fresh open initializes all tracks, a repeated advance never resets progress (browsing back is safe), and a partially corrupted run missing a required track self-repairs instead of dead-ending. If this advance initialized at least one track (fresh open or repair), `idx` lands on the first sub-stage of the first **non-skipped** track (skipping any optional track already marked not-applicable), or the last spine sub-stage when every track is skipped; if nothing needed initializing, the advance is a no-op and `idx` is unchanged. `frontier` stays at the last spine index. A forced open records `forces[lastSpineIndex]` as usual. A persisted `trackFrontier` value outside its track's stage range is treated conservatively as not-yet-at-terminal (completion stays false), never trusted.
- **Inside a track, not at its terminal:** advance that track only (gate = the current track-stage aggregate; on success `trackFrontier[t]` to the next stage in `t`, `idx` to its first sub; a forced advance records `forces[currentStageIndex]`).
- **At a track terminal, while browsing a committed stage, or centered in a skipped track:** no-op (nothing commits past a terminal, and a not-applicable track is never progressed), matching today's last-stage behavior.

`browse` / `jumpTo` / `lastIndexInMain` bound movement by the committed region: the spine prefix `<= frontier`, plus, for each open **non-skipped** track, that track's committed flat range `<= trackFrontier[t]`. A track in `skippedTracks` is **excluded from the navigable region**: `browse` / `jumpTo` cannot enter it (a not-applicable branch is off the table; un-skip is by `trackId`, not by navigating in). Navigation can move back into the committed spine and across to another open non-skipped track. For a linear definition this collapses to today's single `<= frontier` prefix exactly.

**Invariant:** `idx` is always inside the reachable region (the committed spine plus open non-skipped tracks). The two transitions that could violate it preserve it: opening the fork lands `idx` on the first non-skipped track (or the last spine sub-stage when every track is skipped), and `skipTrack` recenters `idx` out of a track it just made non-navigable.

`buildContext` becomes track-scoped: for a card in track `t`, include completed steps from the spine and from `t`'s own earlier stages, and **exclude sibling tracks** and any skipped sub-stage or skipped track. For a card in the spine, include completed spine steps up to the card. For a linear definition the spine is everything, so context is identical to today (every earlier stage). A demo draft never sees response outputs.

Validators keep their documented run-aware contract (#62-64): they receive the full `run` (via `{ run, stepId }`) for both linear and forked definitions, and the gate helpers' signatures do not change (`gateProgress`, `mainGateProgress`, `isStepComplete`). The engine's cross-track isolation is structural where the engine owns the logic: a track's boundary gate aggregates only that track's sub-stages, navigation and the force/skip markers are track-scoped, and `buildContext` (the draft-prompt path, the owner's stated leak concern) never serializes a sibling track. A consumer-authored validator retains full-run reach by design, so a forked definition must not author a validator that reads a sibling track; enforcing that (scoping the validator's run view) is an explicit non-goal here, because it would require threading fork topology through the public gate helpers, changing their contract and exceeding the confirmed minimal scope. Revisit only if a real consumer needs enforced validator isolation.

New pure helpers (all derived, none persisted):

- `isRunComplete(definition, run, opts)`: true iff (a) every non-skipped sub-stage gate along the **kept path** (the committed spine plus every track not in `skippedTracks`) is met, so a stage forced past with an unmet gate keeps the run incomplete, and (b) every kept track (required, since required tracks cannot be skipped, plus any optional track not in `skippedTracks`) has reached its terminal, meaning its `trackFrontier` equals the track's terminal stage index (for a linear definition, `frontier` at the last main stage). The reached check stops a prefilled or imported output (`stepState` is independent of `frontier` / `trackFrontier`) from reporting completion before the run advanced there; the all-gates-met check stops a forced advance past unmet intermediate or terminal work from doing so. A new but inert signal for linear definitions.
- `trackStatus(definition, run, trackId, opts)`: `"not-open" | "active" | "complete" | "skipped"`, derived for "active / complete-track tracking". It takes the same `opts` (`validators`) as `isRunComplete` / `runSummary` / `advance`, so a validator-rejected gate is seen consistently: a track whose terminal output is rejected by its validator reports `active`, never `complete`.
- `skipTrack(run, definition, trackId)` / `unskipTrack(run, definition, trackId)` / `isTrackSkipped(run, definition, trackId)`: mirror the sub-stage skip API. `isTrackSkipped` takes the definition and returns the **effective** skip state (true only when the definition declares the track `optional` and it is in `skippedTracks`; a required or unknown id reads as not-skipped), so no consumer can treat corrupted raw state as authoritative. `skipTrack` is a no-op unless the track exists and is declared `optional` (required tracks cannot be skipped, exactly as non-skippable sub-stages cannot); it sets `skippedTracks[trackId]` and never touches `stepState`. Skipping the track currently under `idx` **recenters** `idx` to the last committed spine sub-stage (always present and reachable), preserving the reachability invariant; skipping a track `idx` is not in leaves `idx` unmoved. This differs from `skipSubStage` (which never moves `idx`, because a skipped sub-stage stays navigable, while a skipped track does not). `unskipTrack` removes the entry and drops the map when empty. The read paths that **aggregate across tracks** (`runSummary`, `isRunComplete`, `buildContext`, navigation, and `advance`'s no-op-in-skipped-track check) exclude an effectively-skipped track's sub-stages, extending the existing skipped-sub-stage exclusion to also test the sub-stage's track; they have the topology to do so (`definition.tracks`, or the `flattenSubStages` optional annotation). The single-stage gate helpers `gateProgress(subStage, run, opts)` and `mainGateProgress(mainStage, run, opts)` are **unchanged**: they report one stage's gate from its (non-sub-stage-skipped) steps and do not consult `skippedTracks`, because whether a whole track participates is the aggregating caller's concern, not a single stage's. Their signatures stay stable while the corruption guard still holds everywhere track participation is actually decided. The existing **sub-stage** skip API also becomes region-aware: `skipSubStage`'s beyond-the-frontier guard accepts a sub-stage committed in its own region (within the spine `<= frontier`, or within its track's `trackFrontier`), so a skippable sub-stage inside a kept track can be marked not-applicable instead of being permanently un-skippable; `unskipSubStage` is unchanged, and tracked sub-stage skips feed gates, `runSummary`, `buildContext`, and completion exactly as spine sub-stage skips do.

`runSummary` excludes skipped tracks' sub-stages from both counts (it already excludes skipped sub-stages). `resolveSubject` / `runDisplayName` are unaffected because the subject is validated into the spine. `forces` stays keyed by main-stage index (a stage belongs to exactly one track and indices stay globally unique), so the untouched UI's `wasAdvanceForced(run, sub.mainIndex)` reads keep working.

`cloneRun` fail-fast: a full clone deep-copies the whole run including `trackFrontier` / `skippedTracks` (still via `structuredClone`). `uptoStageId` truncation that resolves to a **tracked (post-fork) stage throws** a clear error (fork-aware truncation is deferred until a consumer needs it); truncation to a **spine** stage works as today and drops the track maps (they are entirely past the cut). This converts the silent index-order corruption a fork would otherwise cause into a loud boundary error.

## Backward compatibility

A definition with no `tracks` (and no `track` on any stage) takes the existing code path through every function above; the new run fields never materialize; the run shape is byte-identical to today. The regression bar is positive, not just "files unedited": the existing engine + run-store suites, the "all bundled definitions validate" test, and `npm run build -w examples/demo` all stay green unchanged. No persistence version bump, migration, or compat shim (pre-publish stance: ship breaking changes clean; here the surface is additive anyway).

## Files

- `packages/core/src/index.js`: new typedefs (`Track`, `MainStage.track`, `Run.trackFrontier`, `Run.skippedTracks`); fork rules in `validateDefinition`; track + optional annotation in `flattenSubStages`; track-aware `advance`, `browse`, `jumpTo`, `lastIndexInMain`, `buildContext`, `runSummary`, and region-aware `skipSubStage`; new `isRunComplete`, `trackStatus`, `skipTrack`, `unskipTrack`, `isTrackSkipped`; `cloneRun` fail-fast. JSDoc throughout so `npm run types` emits declarations. No linear-path behavior or signature changes.
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
- Enforced validator view-scoping per track. Validators keep full-run access (#62-64); cross-track validator dependencies in a forked definition are a documented consumer responsibility, not engine-policed, because scoping would change the public gate-helper contract. The owner's draft-prompt leak concern is fully closed by the track-scoped `buildContext`.
- Persistence version bump, migration, or compat shim.

## Acceptance

`npm test` passes with new tests covering:

- **Validation:** rejects each malformed topology in the list above (a stray `mainStage.track` with no `tracks` declaration, fewer than 2 tracks, a non-boolean `track.optional`, a reserved-prototype track id such as `__proto__`, empty spine, shared stage after the fork, non-contiguous track, undeclared track reference, track with no stage, subject outside the spine) and accepts a well-formed fork. All 8 bundled definitions and the linear fixture still validate (suite unchanged).
- **Flatten:** annotates each flat sub-stage with its track (spine entries carry none).
- **Advance:** the spine advances as today; advancing past the last spine stage opens the fork with every track at its first stage and `frontier` unchanged; opening is idempotent and per-track (browsing back and advancing again preserves every present frontier and initializes any declared track missing from `trackFrontier`, so a partially corrupted run self-repairs rather than dead-ends); advancing one track moves only that track's frontier (the sibling is untouched); a track terminal is a no-op; a forced advance records `forces` by stage index.
- **Navigation:** `browse` / `jumpTo` are bounded per region, move between the spine and an open track, and are identical to today for the linear fixture; the `idx` reachability invariant holds across transitions: opening the fork with the first track already skipped lands `idx` on the first non-skipped track, skipping the track under `idx` recenters it to the last spine sub-stage, and `idx` is never left on a non-navigable card.
- **Context scoping:** a draft for a step in one track includes the spine and that track, and excludes the sibling track; linear context is unchanged. Validators receive the full run unchanged (the #62-64 contract) and the gate-helper signatures do not change.
- **Optional / required:** `skipTrack` works only on an optional track and is a no-op on a required or unknown track; a skipped track is excluded from `runSummary`, context, and `isRunComplete`; `browse` / `jumpTo` cannot enter a skipped track and `advance` is a no-op while centered in one (asserted for skipping both before and after the fork opens); a required or unknown track id present in `run.skippedTracks` is ignored by every read path (gates, navigation, `runSummary`, context, `isRunComplete`), so corrupted state cannot drop required work, and `isTrackSkipped(run, definition, trackId)` returns the effective state (false for such an id); `unskipTrack` restores it; neither touches `stepState`. A skippable sub-stage inside a kept track can be marked not-applicable (region-aware `skipSubStage`) and is then excluded from its track's gate, `runSummary`, context, and completion.
- **Run-complete:** false until every kept track (required plus any unskipped optional) has reached its terminal and every non-skipped gate along the kept path (committed spine plus kept tracks) is met; true when they are; a kept (unskipped) optional track blocks completion until its own terminal is reached and gated, while a skipped optional track is excluded; a stage forced past with an unmet gate (intermediate spine or track stage, not just the terminal) keeps the run incomplete; completion stays false when a terminal's outputs are prefilled but the frontier has not reached that terminal (`stepState` present, `trackFrontier` / `frontier` still earlier); a validator-rejected terminal output keeps both `isRunComplete` and `trackStatus` incomplete; a linear run is complete when `frontier` is at the last main stage with its gate met.
- **cloneRun:** a full clone deep-copies `trackFrontier` / `skippedTracks` (distinct objects, drivable); truncating at a tracked stage throws; truncating at a spine stage works and drops the track maps.
- **Gate helpers:** `gateProgress` / `mainGateProgress` keep their signatures and report a single stage's gate (sub-stage skips honored as today), never consulting `skippedTracks`; the aggregating paths (`runSummary`, `isRunComplete`) apply effective track-skip, excluding a skipped optional track and ignoring a required or unknown id in `skippedTracks`.
- **Robustness:** a reserved-prototype track id is rejected at validation; and even a corrupted persisted run carrying such a key in `trackFrontier` / `skippedTracks` is never read as opened, skipped, or complete (own-property checks).
- **Regression:** the existing engine and run-store suites pass unmodified; `npm run types` includes the new exports; `npm run build -w examples/demo` is green.

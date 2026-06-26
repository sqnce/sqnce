# spec: sub-stage skip provenance (auto vs user) with user-over-auto precedence

Issue: #74. Extends the skip primitive from #5 (`5-skippable-substages.md`), which deliberately left "skip reasons or source" and "auto-skip heuristics" out of scope. This spec adds exactly that: a skip now records who set it (a person or an orchestration policy) and resolves conflicts by a fixed rule, the person always wins.

The engine stays generic. It learns to tell two sources of a skip apart and a precedence rule; it knows nothing about any consumer's domain signal.

Decision recorded on the issue and in design (2026-06-26): separate automated entry points, not a source argument on the existing operations. The two manual operations keep their exact current signatures, so every existing caller in `@sqnce/react` and the demo is untouched by construction; the orchestration layer gets its own two clearly named operations.

## Driving need

Today a skip is a single boolean per sub-stage with no source. An orchestration layer that auto-skips a sub-stage on a signal cannot re-evaluate that signal safely: when the signal still reads "skip" on the next entry but a person has manually kept the sub-stage in, re-applying the auto-skip silently overwrites the person's choice, and recovery is circular (unskip, re-enter, re-auto-skip, stuck). Motivating consumer: presales-sqnce #108, whose runner wants to auto-skip a conditional specialist lane on a no-external-actor signal, with a manual override that survives re-evaluation.

This mirrors the engine's existing `forces` map, a status map that records a historical fact and is never auto-cleared (its value today is a bare `true`). Skip provenance applies that same never-auto-cleared status-map idea to skips, but with a richer value (a source) and a precedence rule on top.

## The four representable states

Per sub-stage, the engine now distinguishes four states instead of two:

- **no decision**: nobody has decided; an automated skip may govern it.
- **user skip**: a person marked it not applicable; durably skipped.
- **user keep-in**: a person chose to keep it in; durably not-skipped.
- **auto skip**: an orchestration policy skipped it; skipped, but yields to any user decision.

There is no "auto keep-in" state: clearing an automated skip returns the sub-stage to "no decision", never to a durable keep-in.

The precedence rule, in one line: a user decision (skip or keep-in) always wins, and an automated operation only ever affects a sub-stage that has no user decision recorded.

## Run state

The run shape is unchanged at the top level: `{ idx, frontier, stepState }` plus the optional maps, `skips` still absent when empty. Only the **value** in `skips` grows. A `skips` entry, keyed by sub-stage id, is one of:

- absent: no decision recorded.
- `true`: a user skip. This is what both legacy runs and new manual skips store, so a run that only ever uses manual skips stays byte-identical to today.
- `{ "source": "auto", "skipped": true }`: an automated skip.
- `{ "source": "user", "skipped": false }`: a user keep-in (durable not-skipped).

`true` is read as equivalent to `{ source: "user", skipped: true }`; it is kept as the canonical shorthand for a user skip so the common case does not churn the persisted JSON. The object form appears only for the two states a bare boolean cannot express (an automated skip, and a user keep-in).

Because a user keep-in is a recorded decision, the `skips` map is no longer "only the skipped sub-stages"; it is "the sub-stages with a recorded decision". A keep-in entry resolves as not-skipped everywhere (see below), so every read path that already asks "is this skipped?" behaves as if the entry were absent. The map still drops to absent only when it holds no entries at all.

The run store stays `version: 3`. The value-shape growth is backward-compatible: a legacy `skips[id] = true` loads unchanged and resolves as a user skip, so no migration and no version bump (consistent with the repo's pre-publish, no-migrations stance).

## Core (`@sqnce/core`)

### Resolved read (unchanged signature)

- `isSubStageSkipped(run, subStageId)`: returns the resolved effective state. `true` for a legacy `true` entry or an object whose `skipped === true`; `false` for an absent entry, an object whose `skipped === false` (a keep-in), or any unrecognized shape. This is the single point every existing caller uses: `aggregateGate`'s active filter, the subject fallback in `resolveSubject`, the draft-context builder `buildContext`, `runSummary`, and the React layer, so all of them keep working with no change. Every path that reads whether a sub-stage is skipped goes through `isSubStageSkipped`; no read path checks skip-map key presence directly. (The write operations, the relation-set sanitizer, and `cloneRun` do touch `run.skips` raw, but none of them branch on a key being merely present; they read and preserve the entry value.) So a keep-in entry, present but resolving as not-skipped, is invisible to every skip read, exactly as an absent entry would be.

### Manual operations (unchanged signatures, durable semantics)

- `skipSubStage(run, subStages, subStageId)`: a manual skip. Same guards as today (the id must be known, declared `skippable`, and reachable within the committed region); returns the normalized run on a no-op. Writes `true` (a durable user skip). It overrides a prior automated skip or user keep-in, because the user now owns the decision. Idempotent: when the entry is already `true`, it returns the same run reference (preserving the existing `===` idempotence contract). Never touches `stepState`.
- `unskipSubStage(run, subStages, subStageId)`: a manual keep-in. **Behavior change from #5**: it no longer deletes the entry; it records `{ source: "user", skipped: false }`, a durable not-skipped decision, so a subsequent automated re-evaluation cannot re-skip it. Same guards as `skipSubStage` (known, `skippable`, reachable), which also aligns unskip's guard set to skip's: today unskip guards only on the current skip state, so adding the `skippable` and reachable checks is a small second behavior change (harmless, since a non-skippable or unreachable sub-stage can never be skipped anyway). Returns the normalized run on a no-op. It overrides a prior automated skip or user skip. Idempotent: when the entry is already a user keep-in, it returns the same run reference. Never touches `stepState`; outputs and done flags survive untouched, exactly as before.

### Automated operations (new)

- `autoSkipSubStage(run, subStages, subStageId)`: apply an automated skip. Same guards (known, `skippable`, reachable). If a user decision is recorded (the entry is `true` or any `{ source: "user" }` object), it is a no-op (the user wins), returning the normalized run. Otherwise it writes `{ source: "auto", skipped: true }`. Idempotent: when the entry is already an automated skip, it returns the same run reference. Never touches `stepState`.
- `clearAutoSkipSubStage(run, subStages, subStageId)`: clear an automated skip. Removes the entry only when it is an automated skip (`{ source: "auto" }`), dropping the `skips` field when it empties. A user decision or an absent entry is a no-op (it never touches a user choice), returning the normalized run. Idempotent. Never touches `stepState`.

Together these give the orchestration layer a safe, repeatable apply/clear pair: re-running the policy on a re-read signal never accumulates and never overwrites a person's choice.

Idempotence note: "returns the same run reference" above means the normalized run, which is reference-equal to the input when the input is already normalized (the existing `skipSubStage` no-op contract that the engine tests assert with `===`). All five operations follow this pattern.

### JSDoc types (the `npm run types` gate)

The engine is type-checked with checkJs and `npm run types` is a CI gate, so the `skips` value type must widen alongside the runtime change or the gate fails. Three annotations move from `Object<string, true>` to the new union (`true | { source: "user" | "auto", skipped: boolean }`): the `Run` typedef's `skips` property, and the two local `@type {Object<string, true>}` annotations on the skip maps built by the relation-set sanitizer and by `cloneRun` truncation.

### Unchanged

`aggregateGate` / `mainGateProgress` / `advance` (gate math reads through `isSubStageSkipped`, so an auto skip is excluded and a keep-in is included automatically), `buildContext` and draft serialization (steps of a resolved-skipped sub-stage stay excluded; a keep-in's steps stay included), `runSummary`, `browse` / `jumpTo`, all hybrid/strict semantics, the track maps (`skippedTracks` is a separate concern, untouched, so track-level skipping has no provenance and is out of scope here), and the run store functions.

## cloneRun and the relation-set sanitizer

Two internal sites copy `skips` entries and currently coerce them to `true`. Both must preserve the entry value so provenance survives:

- The relation-set sanitizer (used to build the run a forked-gate validator sees) copies in-scope skip entries; it must copy the value, not hardcode `true`. Gating itself is unaffected (it reads `isSubStageSkipped`), but the validator-visible run stays faithful.
- `cloneRun` truncation (`uptoStageId`) copies in-scope skip entries; it must copy the value, not hardcode `true`. The existing invariant is preserved: it still throws when a retained entry's sub-stage is unknown to the definition or no longer declared `skippable` (a recorded decision, skip or keep-in, only makes sense on a skippable sub-stage). A full clone uses `structuredClone`, which already carries the object values, so it needs no change.

So a cloned or forked run keeps an automated skip as automated and a user keep-in as a keep-in.

## Tests

Extend the skip suite in `packages/core/test/engine.test.js`. The existing test "unskip restores state and drops the empty map" is rewritten to the new durable-keep-in contract (a manual unskip now records a user keep-in rather than deleting the entry; `stepState` still survives untouched). New tests cover:

- **Legacy shape**: a run with `skips[id] = true` reads as skipped via `isSubStageSkipped`, and a subsequent `autoSkipSubStage` is a no-op on it (legacy reads as a user-owned skip).
- **User skip wins over auto**: `autoSkipSubStage` is a no-op on a user-skipped sub-stage; the user skip is unchanged across repeated auto re-evaluation.
- **User keep-in wins over auto (the core fix)**: auto-skip, then manual keep-in, then auto-skip again leaves the sub-stage not skipped; the manual choice survives repeated re-evaluation.
- **Manual overrides auto**: a manual skip or keep-in applied over a prior auto skip takes ownership (the entry becomes user-sourced).
- **Idempotent auto-apply**: `autoSkipSubStage` twice returns the same run reference and has no cumulative effect.
- **Idempotent auto-clear**: `clearAutoSkipSubStage` returns a sub-stage to no-decision, drops the empty map, and a second clear is a no-op; clearing never removes a user decision.
- **Guards**: the automated operations are no-ops on unknown, non-`skippable`, and beyond-frontier ids, matching `skipSubStage`.
- **Resolved reads downstream**: an auto skip is excluded from the boundary aggregate and `runSummary` and draft context (skipped), while a user keep-in is included (not skipped), confirming the gate/summary/draft paths read provenance correctly through `isSubStageSkipped`.
- **Clone and relation-set preserve provenance**: a full clone and an `uptoStageId` truncation carry an auto skip and a user keep-in through unchanged; truncation still throws when a retained entry's sub-stage is no longer `skippable`.

The full existing engine suite must stay green (manual skip still writes `true`, so the unchanged skip tests other than the rewritten one pass as-is).

## Docs (same PR)

- Core file header comment (`packages/core/src/index.js`): the run-shape note for `skips` grows to describe the value carrying a source and the four states.
- `README.md`: the run-shape bullet for `skips`.
- `CLAUDE.md`: the Architecture run-shape line, and a "Key behaviors to preserve" entry for skip provenance and user-over-auto precedence.

No `@sqnce/react` or demo changes: the React shell keeps calling the two manual operations and reading `isSubStageSkipped`, all unchanged in signature; the demo has no orchestration layer, so it exercises no automated skip. This is a core-only change, consistent with the layer separation in `CLAUDE.md`.

## Out of scope

- Per-step skippability (the issue's secondary item). Skip stays sub-stage granularity; making a single step skippable is not cheap to add alongside this and is deferred.
- A "reset to no decision" manual operation. A user keep-in is the override; nothing needs a third manual verb, and a user decision is durable (it is never auto-cleared, mirroring `forces`).
- Skip reasons, notes, or timestamps in run state (still out, as in #5). Provenance is source only.
- Track-level skip provenance: `skippedTracks` is a separate map and keeps its current boolean shape.
- Any UI or demo surface for automated skipping; run store version bump or migrations.

## Acceptance

- `npm test` passes with the new and rewritten engine tests above.
- A run that auto-skips a sub-stage, is manually kept in, and is auto-skipped again ends not skipped; the manual choice survives repeated automated re-evaluation.
- `autoSkipSubStage` and `clearAutoSkipSubStage` are safe to re-run: repeated application has no cumulative effect and never overwrites a user decision.
- A legacy run with `skips[id] = true` still reads as skipped.
- `npm run build -w examples/demo` and `npm run types` pass.

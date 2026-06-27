# spec: engine correctness bundle (#107, #108, #110)

This is the design spec only. No engine or test code is changed by this commit;
the implementation lands in later commits on this branch after the spec is
approved, following the repo's spec-first lifecycle. The sections below describe
the planned change so it can be reviewed before any code is written.

Three engine correctness issues found in the project review, all in
`packages/core/src/index.js`, bundled into one change because they share a file
and a theme (the engine telling the truth about run and definition state). The
engine stays pure and dependency-free; no UI, no new package surface. Five
sub-fixes across three issues: four are engine code fixes, and the fifth
(#110.3) is a contract-docs clarification with no behavior change (owner
decision: `cloneRun` keeps failing loudly).

A de-risking check ran every bundled definition and both core test fixtures
against the two stricter validations below (#108 output ids, #110.2 linear
subject resolution): all pass, so the "all bundled definitions validate" test
and the fixture checks stay green, and no content or existing-test fixups are
needed beyond the new cases this spec adds.

## #107: trackStatus must agree with isRunComplete

### Current behavior

`trackStatus` (around line 1795) returns `"complete"` for a track as soon as its
`trackFrontier` reaches the track's terminal stage and that terminal stage's own
gate is met (line 1818). It never re-checks the earlier stages in the same
track.

### Problem

`isRunComplete` (1747) re-checks every main-stage gate along the kept path
(1778-1782). Advancing past an unmet gate is the supported explicit override
(`force`). So a track whose intermediate stage was force-advanced past an unmet
gate has its frontier at the terminal with the terminal gate met, and
`trackStatus` returns `"complete"` while `isRunComplete` returns `false` for the
same run. The per-track display says done while a stage inside it is not.
`isRunComplete` stays authoritative for whole-run completion, so gating and
completion are unaffected; the impact is a wrong per-track display status.

Reachable on the bundled forked fixture: the demo track has three stages
(demo-script, demo-build, demo-qa). Force-advance past demo-script with its gate
unmet, then meet demo-build and demo-qa. `trackFrontier` sits at the terminal
with the QA gate met, `trackStatus(demo)` returns `"complete"`, `isRunComplete`
returns `false`.

### Fix

Require every gate along this track's full path to be met, matching the gates
`isRunComplete` checks: the shared spine stages (indices 0 through the last spine
index) plus this track's own stages. Checking only the track's own stages is not
enough, because the fork can be force-opened past an unmet spine gate (the spine
is committed but a spine gate is unmet), and then a track with all its own gates
met would still report `"complete"` while `isRunComplete` is `false`. The
track-map entry carries `indices`, the list of that track's main-stage indices;
the spine indices are `0..lastSpineIndex(definition)`. After the skip check, the
complete branch becomes:

```js
const spineEnd = lastSpineIndex(definition);
const gateMet = (i) => mainGateProgress(definition.mainStages[i], r, o).met;
let pathMet = v === tm.terminal;
for (let i = 0; pathMet && i <= spineEnd; i++) pathMet = gateMet(i);
for (const i of tm.indices) if (pathMet) pathMet = gateMet(i);
return pathMet ? "complete" : "active";
```

So a track reports `"complete"` only when its frontier is at the terminal and
every gate from the start of the spine through the track's terminal is met,
which can never contradict `isRunComplete`.

## #108: validateDefinition must validate output ids

### Current behavior

The output loop in `validateDefinition` (around lines 411-436) validates an
output's `type`, `fields`, `render`, and `validate`, but never its `id`.

### Problem

`OutputSpec.id` is the storage key in every read and write of an output value
(`setOutput`, `stepHasAnyOutput`, `firstInvalidOutput`, `serializeStep`,
`resolveSubject`). An output with no `id` and a second id-less output in the same
step collide on the `undefined` key; two outputs sharing an `id` collapse to one
storage slot, and a validator on one silently checks the other's value.
`validateDefinition` is the authoring gate, so this is a malformed-definition
passes gap (definitions are author-controlled, not user input). Step ids
(406-408) and sub-stage ids (397-399) already get exactly this
presence-plus-uniqueness check, so the omission is an internal inconsistency.

### Fix

In the output loop, track a per-step `Set` of output ids. Push a problem when an
output's `id` is missing or not a non-empty string, and a problem when an id
repeats within the step, mirroring the existing step-id and sub-stage-id checks.
Uniqueness is per step (the storage key is namespaced under the step), not
global.

```js
const outputIds = new Set();
(st.outputs || []).forEach((o) => {
  if (typeof o.id !== "string" || !o.id.trim())
    problems.push(`step "${st.id}": an output is missing an id`);
  else if (outputIds.has(o.id))
    problems.push(`step "${st.id}": duplicate output id "${o.id}"`);
  else outputIds.add(o.id);
  // ...existing type / fields / render / validate checks unchanged...
});
```

## #110.1: buildDraftPrompt linear path needs an out-of-range idx guard

### Current behavior

In `buildDraftPrompt` (1347), the forked path collapses a stale or unreachable
requested index to the last committed spine sub-stage. The linear path has no
equivalent guard: it uses `subStages[idx]` directly (line 1385), and reads
`subStage.mainName` (1395).

### Problem

`normalizeFlat` returns a linear run unchanged, so for a corrupted or stale
persisted index `subStages[idx]` is `undefined` and `subStage.mainName` throws a
TypeError. It requires stale or corrupted persisted state, but it crashes
opaquely where the forked path degrades gracefully.

### Fix

When `subStages[idx]` is undefined on the linear path, fall back to
`lastIndexInMain(subStages, r.frontier)` (the last committed sub-stage),
mirroring the forked fallback, before reading the sub-stage:

```js
let subStage = subStages[idx];
if (!subStage) {
  idx = lastIndexInMain(subStages, r.frontier);
  subStage = subStages[idx];
}
```

The passed-in `step` is unchanged: this guards only the index-to-sub-stage read
that crashes. (`r` is the already-normalized run; for a linear run it equals the
input run.)

## #110.2: linear definitions need subject validation

### Current behavior

In `validateDefinition`, the deep subject resolution (the subject's `stepId`
resolves to exactly one step, its `outputId` exists on that step, the output is a
`fields` output, the `field` is a declared key) is gated behind
`else if (isForked(definition))` (around lines 504-525). For a linear definition
none of it runs.

### Problem

A linear definition whose subject points at a missing step or a misspelled field
passes validation with zero problems, and `resolveSubject` then silently falls
back at runtime to the configured fallback string. The authoring gate misses a
real authoring error.

### Fix

Lift the base resolution out of the forked-only branch so it runs for every
definition: the exactly-one-step check, the outputId-on-step check, the
fields-type check, and the field-key check. Keep only the spine-membership check
(`mi > spineEnd`, "subject step must live in the spine, not a track") inside the
forked-specific branch, since it is meaningful only for a forked definition. The
existing presence check (`stepId`, `outputId`, `field` all present) stays first.

## #110.3: cloneRun truncation must match its contract

### Current behavior

When `cloneRun` truncates to a chosen stage (`uptoStageId`), it walks the run's
step state and skips. For each step (around lines 1622-1626) it throws "step is
not in definition" for any step the definition no longer describes; the skip loop
(1630-1637) throws "skip sub-stage is not in definition" the same way, and throws
"no longer skippable" for a retained skip whose sub-stage the definition no
longer allows to be skipped.

### Problem

The issue proposed relaxing the not-in-definition throw so truncating to an early
stage would not fail on state belonging to a later, discarded stage. But a step
or skip the definition no longer describes has no resolvable stage index, so it
cannot be proven to belong to the discarded tail rather than to the kept prefix.
Relaxing the throw would therefore silently drop unrecognized state, including
accepted work, with no error. That is a data-loss path, and two existing
`runstore.test.js` tests already pin the loud failure (a clone over a run holding
a step, or a kept skip, absent from the definition throws). Owner decision
(2026-06-27): `cloneRun` must keep failing loudly; the behavior does not change.

The only real defect is the contract wording. The JSDoc (around line 1570) and
CLAUDE.md both say the clone must describe "every retained step and kept skip,"
and that word "retained" is what made the throw look stricter than the contract.
In fact the code throws on any unrecognized step or skip, retained or not, which
is the safe behavior.

### Fix

No `cloneRun` code change: it keeps throwing loudly on any unrecognized step or
skip, and the two existing `runstore.test.js` tests stay as the pin. Resolve the
issue by removing the ambiguous "retained" wording from the contract so the docs
match the loud-failure behavior:

- The `cloneRun` JSDoc line "must currently describe every retained step and kept
  skip" becomes wording that says the clone must describe every step and kept
  skip the run carries, that any unrecognized step or skip throws (even one a
  truncation would otherwise discard), and that a retained kept skip's sub-stage
  must still be skippable.
- The matching CLAUDE.md `cloneRun` sentence ("...or a retained step or kept skip
  the definition no longer describes") is reworded the same way.

The earlier `uptoStageId` guards (unknown stage, ambiguous stage, tracked stage,
beyond-frontier) are unchanged.

## Files to change (during implementation, not in this spec commit)

- `packages/core/src/index.js`: the four engine fixes (#107, #108, #110.1,
  #110.2), plus the reworded `cloneRun` JSDoc (#110.3 docs only; no `cloneRun`
  logic change).
- `CLAUDE.md`: the reworded `cloneRun` contract sentence (#110.3 docs only).
- `packages/core/test/engine.test.js`: new test cases for the four engine fixes
  (below). No `runstore.test.js` change: its two cloneRun not-in-definition tests
  already pin the loud failure #110.3 preserves.

## Testing

New cases in `packages/core/test/engine.test.js`, using the existing fixtures
(`workflow.js` linear, `forked.js` forked) and small inline definitions:

- **#107:** on the forked fixture, (a) force-advance past an intermediate track
  stage with its gate unmet, meet the remaining track stages, and assert
  `trackStatus(track)` is `"active"` (not `"complete"`) while `isRunComplete` is
  `false`; (b) force-open the fork past an unmet spine gate, then fully meet a
  track, and assert that track is still `"active"` (not `"complete"`) while
  `isRunComplete` is `false`, covering the spine-gate path; and (c) assert a
  genuinely complete track (spine and track gates all met) still reports
  `"complete"`.
- **#108:** `validateDefinition` reports a problem for a step with an output
  missing its `id`, and for a step with two outputs sharing an `id`; a step with
  distinct ids reports none. Mirror the existing duplicate-step-id test shape.
- **#110.1:** `buildDraftPrompt` on a linear definition with an out-of-range
  `idx` returns a prompt string (falling back to the last committed sub-stage)
  instead of throwing.
- **#110.2:** `validateDefinition` reports a problem for a linear definition with
  a present-but-wrong subject, using a valid `stepId` and `outputId` but a
  misspelled `field` (so the new deep resolution is what catches it, not the
  pre-existing presence check); a linear definition with a fully correct subject
  reports none. Keep a separate case for an entirely missing step id if useful,
  but the misspelled-field case is the one that protects the lift. A forked
  definition keeps the spine-membership check.
- **#110.3:** no new test. The two existing `runstore.test.js` tests (a clone
  over a run holding a step, or a kept skip, absent from the definition throws)
  already pin the loud-failure behavior this preserves, and they must stay green.

Gates: `npm test` (all core and react suites, including "all bundled definitions
validate"), `npm run build -w examples/demo`, `npm run types`.

## Out of scope

- Issue #111 (forked draft-target validation scoping): related but separate, a
  cross-layer change; not in this bundle.
- Changing `cloneRun`'s behavior: explicitly rejected. The issue proposed
  relaxing the not-in-definition throw; the owner decision is to keep failing
  loudly, so #110.3 is a docs-only clarification.
- Fork-aware `cloneRun` truncation to a tracked stage: still unsupported and
  still throws; unchanged.
- Any UI or renderer change: none. `trackStatus` is consumed by the UI, but the
  fix is entirely in the engine.

## Acceptance

- `trackStatus` returns `"complete"` only when every stage in the track has a met
  gate, agreeing with `isRunComplete`.
- `validateDefinition` reports a missing or empty output id and a duplicate
  output id within a step.
- `buildDraftPrompt` on a linear definition degrades gracefully on an
  out-of-range index instead of throwing.
- `validateDefinition` validates the subject for linear definitions, not only
  forked ones.
- `cloneRun` behavior is unchanged (it still fails loudly on any unrecognized
  step or skip); the `cloneRun` JSDoc and the CLAUDE.md `cloneRun` sentence no
  longer say "retained," so the docs match the loud-failure behavior.
- New `engine.test.js` cases cover the four engine fixes; the two existing
  `runstore.test.js` cloneRun tests stay green; `npm test`, `npm run build -w
  examples/demo`, and `npm run types` pass.

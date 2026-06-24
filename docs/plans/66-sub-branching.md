# Engine sub-branching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sub-branching to the pure engine `@sqnce/core`: a definition can fork after a shared linear spine into N independent linear tracks, each ending at its own terminal, with optional tracks skippable per run and a derived run-complete signal.

**Architecture:** Two additive optional definition fields (`Definition.tracks`, `MainStage.track`) and two additive optional run fields (`Run.trackFrontier`, `Run.skippedTracks`). The fork is derived, not a node: the spine is the untagged prefix, each track is a contiguous tagged block, a track's terminal is its last stage. All engine functions branch on the presence of `definition.tracks`; a linear definition takes the existing code path unchanged and the new run fields never materialize. The work is engine + validation only; no UI, no bundled-definition migration.

**Tech Stack:** Plain ESM JavaScript, no build step in core. Tests use Node's built-in runner (`node:test`, Node 20+). JSDoc drives `npm run types`.

## Global Constraints

- Engine `@sqnce/core` stays pure and dependency-free; no UI, no provider coupling. (CLAUDE.md)
- Never use em dashes anywhere (code, comments, docs, commit messages). Use commas, parentheses, colons, or sentence breaks. (CLAUDE.md)
- Brand is lowercase `sqnce`. License Apache-2.0.
- No breaking signature changes to existing exports. Validator scoping rides the existing `opts` object via a new optional `opts.subStages`; `gateProgress` / `mainGateProgress` / `isStepComplete` keep their signatures.
- A linear definition (no `tracks`, no `track` on any stage) must stay byte-identical: the existing engine + run-store suites, the "all bundled definitions validate" test, and `npm run build -w examples/demo` all stay green unmodified.
- Pre-publish stance: no migration, version bump, or compat shim; the surface is additive anyway.
- JSDoc throughout so `npm run types` emits declarations.
- Source of truth: `docs/specs/66-sub-branching.md`. Every rule below is from that spec; when in doubt, the spec wins.

**Repo gates (run after each task and at the end):**
- `npm test` (Node runner over `packages/core/test/*.test.js`)
- `npm run build -w examples/demo` (CI runs it on every PR)
- `npm run types` (regenerate `.d.ts`; CI checks they are committed; `tsc` may be absent locally, in which case confirm the diff touches no exported signature and let CI run it)

---

## File map

- **Modify** `packages/core/src/index.js`: new typedefs; fork rules in `validateDefinition`; track + optional annotation in `flattenSubStages`; internal topology + normalization helpers; track-aware `advance`, `browse`, `jumpTo`, `lastIndexInMain`, `buildContext`, `buildDraftPrompt`, `runSummary`; region-aware `skipSubStage`; new `isRunComplete`, `trackStatus`, `skipTrack`, `unskipTrack`, `isTrackSkipped`; validator scoping via `opts.subStages`; `cloneRun` fork fail-fast.
- **Create** `packages/core/test/fixtures/forked.js`: the forked fixture (Task 1).
- **Modify** `packages/core/test/engine.test.js`: new fork suites; existing linear tests unchanged.
- **Modify** `packages/core/test/runstore.test.js`: `cloneRun` fork fail-fast tests.
- **Modify** `CLAUDE.md`: key-behavior notes for sub-branching.
- **Modify** `packages/core/README.md`: add the new public helpers to the `Exports:` line.
- **Regenerate** `packages/core/types/index.d.ts` via `npm run types`.

## Internal helper inventory (added to `index.js`, not exported)

These back the public functions. Defined in Task 2, used thereafter.

- `isForked(definition)` -> boolean: `!!(definition.tracks && definition.tracks.length)`.
- `lastSpineIndex(definition)` -> number: index of the last untagged main stage. For a linear definition, `mainStages.length - 1`.
- `trackMap(definition)` -> `Map<trackId, { name, optional, first, terminal, indices: number[] }>`: derived from `mainStages` order (flat-stage order), so `first`/`terminal` are flat indices.
- `trackIdOfStage(definition, mainIndex)` -> string | null (null = spine).
- `firstNonSkippedTrack(definition, run)` -> trackId | null: the flat-first track not effectively skipped, or null when all are skipped.
- `hasOwn(obj, key)` -> boolean: `Object.prototype.hasOwnProperty.call(obj || {}, key)`.
- `isTrackSkippedEffective(definition, run, trackId)` -> boolean: declared, `optional`, and `hasOwn(run.skippedTracks, trackId)`.
- `effectiveSkippedTrackIds(definition, run)` -> `Set<string>`.
- `normalizeFlat(subStages, run)` -> Run: for a forked flat list, clamp `frontier` to the last spine index, and if `idx` lands outside the reachable region, recenter `idx` to the last spine sub-stage. For a linear flat list, return `run` unchanged (same reference). Topology is read from the flat `track`/`optional` annotations, so no definition argument is needed.
- `reachableFlat(subStages, run)` -> sorted `number[]` of reachable flat indices: the spine prefix (`mainIndex <= frontier`) plus, for each open non-skipped track, its flat range up to `trackFrontier[t]`. Linear collapses to the contiguous prefix.
- `scopeValidatorRun(definition, subStages, run, stepFlatIdx)` -> Run: the sanitized relation-set allowlist run (Task 9), built from the normalized run.

---

## Task 1: Typedefs and the forked test fixture

**Files:**
- Modify: `packages/core/src/index.js` (typedef block near lines 96-132)
- Create: `packages/core/test/fixtures/forked.js`
- Test: `packages/core/test/engine.test.js`

**Interfaces:**
- Produces: typedefs `Track`, `MainStage.track`, `Run.trackFrontier`, `Run.skippedTracks`; `FORKED` fixture export with spine indices 0,1, demo track indices 2,3,4 (terminal 4), response track indices 5,6,7 (terminal 7).

- [ ] **Step 1: Add typedefs.** In `packages/core/src/index.js`, add a `Track` typedef and extend `MainStage` and `Run`:

```js
/**
 * @typedef {Object} Track
 * @property {string} id
 * @property {string} name
 * @property {boolean} [optional] When true, the track can be marked not-applicable per run; absent/false means required.
 */
```

Add to the `MainStage` typedef block:
```js
 * @property {string} [track] Track id; absent means the stage is shared spine. Present only with Definition.tracks.
```
Add to the `Definition` typedef block:
```js
 * @property {Track[]} [tracks] Declares a fork; absent means a linear definition.
```
Add to the `Run` typedef block:
```js
 * @property {Object<string, number>} [trackFrontier] Furthest committed main-stage index within each track; appears when the fork opens.
 * @property {Object<string, true>} [skippedTracks] Optional tracks marked not-applicable this run.
```

- [ ] **Step 2: Create the forked fixture** `packages/core/test/fixtures/forked.js`:

```js
/*
 * Forked fixture owned by core's test suite, per
 * docs/specs/66-sub-branching.md. Coverage: a non-empty two-stage spine,
 * two tracks (demo optional, response required), both gate types, a
 * terminal per track, the subject in the spine, and a skippable sub-stage
 * inside a track. mainStages order: spine 0,1; demo 2,3,4 (terminal 4);
 * response 5,6,7 (terminal 7).
 */
export const FORKED = {
  id: "forked",
  name: "Forked Process",
  subject: { stepId: "intake", outputId: "facts", field: "client", fallback: "the account" },
  tracks: [
    { id: "demo", name: "Demo", optional: true },
    { id: "response", name: "Response" },
  ],
  mainStages: [
    { id: "intake-stage", name: "Intake", subStages: [
      { id: "intake-sub", name: "Intake", gate: { type: "hybrid" }, steps: [
        { id: "intake", name: "Intake", required: true, outputs: [
          { id: "facts", type: "fields", label: "Facts", fields: [
            { key: "client", label: "Client" }, { key: "industry", label: "Industry" }] }] }] }] },
    { id: "findings-stage", name: "Findings", subStages: [
      { id: "findings-sub", name: "Findings", gate: { type: "hybrid" }, steps: [
        { id: "findings", name: "Findings", required: true, outputs: [
          { id: "notes", type: "text", label: "Notes" }] }] }] },
    { id: "demo-script", name: "Script", track: "demo", subStages: [
      { id: "demo-script-sub", name: "Script", gate: { type: "hybrid" }, steps: [
        { id: "demoScript", name: "Script", required: true, outputs: [
          { id: "s", type: "text", label: "Script" }] }] }] },
    { id: "demo-build", name: "Build", track: "demo", subStages: [
      { id: "demo-build-sub", name: "Build", skippable: true, gate: { type: "hybrid" }, steps: [
        { id: "demoBuild", name: "Build", outputs: [{ id: "b", type: "text", label: "Build" }] }] }] },
    { id: "demo-qa", name: "Demo QA", track: "demo", subStages: [
      { id: "demo-qa-sub", name: "Demo QA", gate: { type: "strict" }, steps: [
        { id: "demoQa", name: "QA", required: true, outputs: [{ id: "q", type: "text", label: "QA" }] }] }] },
    { id: "resp-draft", name: "Draft", track: "response", subStages: [
      { id: "resp-draft-sub", name: "Draft", gate: { type: "hybrid" }, steps: [
        { id: "respDraft", name: "Draft", required: true, outputs: [{ id: "d", type: "text", label: "Draft" }] }] }] },
    { id: "resp-review", name: "Review", track: "response", subStages: [
      { id: "resp-review-sub", name: "Review", gate: { type: "hybrid" }, steps: [
        { id: "respReview", name: "Review", required: true, outputs: [{ id: "r", type: "text", label: "Review" }] }] }] },
    { id: "resp-signoff", name: "Sign-off", track: "response", subStages: [
      { id: "resp-signoff-sub", name: "Sign-off", gate: { type: "strict" }, steps: [
        { id: "respSignoff", name: "Sign-off", required: true, outputs: [{ id: "so", type: "text", label: "Sign-off" }] }] }] },
  ],
};
```

- [ ] **Step 3: Write a structural test** in `engine.test.js` (import `FORKED` at top: `import { FORKED } from "./fixtures/forked.js";`). This asserts the fixture's exact shape (it fails with an import error until the fixture exists); the "does it validate" assertion belongs in Task 3, where `validateDefinition` actually gains fork rules:

```js
test("the forked fixture has the expected fork shape", () => {
  assert.equal(FORKED.mainStages.length, 8);
  assert.equal(FORKED.tracks.length, 2);
  // spine 0,1; demo 2,3,4 (terminal 4); response 5,6,7 (terminal 7)
  assert.equal(FORKED.mainStages[1].track, undefined);
  assert.equal(FORKED.mainStages[2].track, "demo");
  assert.equal(FORKED.mainStages[5].track, "response");
});
```

- [ ] **Step 4: Run.** `npm test`, Expected: FAIL before the fixture file exists (import error), PASS once it does. The validation assertion (`validateDefinition(FORKED)` returns `[]`) is the first test in Task 3, where it is meaningfully fail-then-pass.

- [ ] **Step 5: Commit.**
```bash
git add packages/core/src/index.js packages/core/test/fixtures/forked.js packages/core/test/engine.test.js
git commit -m "feat(core): add track/forked typedefs and forked test fixture (#66)"
```

---

## Task 2: Internal topology and normalization helpers

**Files:**
- Modify: `packages/core/src/index.js` (add helpers after `flattenSubStages`, near line 192)
- Test: `packages/core/test/engine.test.js`

**Interfaces:**
- Produces: `isForked`, `lastSpineIndex`, `trackMap`, `trackIdOfStage`, `hasOwn`, `isTrackSkippedEffective`, `effectiveSkippedTrackIds`, `firstNonSkippedTrack`, `normalizeFlat`, `reachableFlat`. These are internal (not exported), exercised through the public functions in later tasks. None are exported; the spec's exported helpers are added in Tasks 5 and 10.

- [ ] **Step 1: Add the helpers.** Insert after `flattenSubStages`:

```js
function hasOwn(obj, key) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

/** @param {Definition} definition */
function isForked(definition) {
  return !!(definition && Array.isArray(definition.tracks) && definition.tracks.length);
}

/** Last untagged main-stage index (the spine end). @param {Definition} definition @returns {number} */
function lastSpineIndex(definition) {
  const stages = definition.mainStages || [];
  let last = -1;
  for (let i = 0; i < stages.length; i++) {
    if (stages[i].track === undefined) last = i;
    else break;
  }
  return last;
}

/**
 * Derived per-track topology in flat mainStages order.
 * @param {Definition} definition
 * @returns {Map<string, { name: string, optional: boolean, first: number, terminal: number, indices: number[] }>}
 */
function trackMap(definition) {
  const out = new Map();
  if (!isForked(definition)) return out;
  const declared = new Map(definition.tracks.map((t) => [t.id, t]));
  (definition.mainStages || []).forEach((ms, i) => {
    if (ms.track === undefined) return;
    const t = declared.get(ms.track);
    if (!t) return;
    const e = out.get(ms.track) || { name: t.name, optional: !!t.optional, first: i, terminal: i, indices: [] };
    e.first = Math.min(e.first, i);
    e.terminal = Math.max(e.terminal, i);
    e.indices.push(i);
    out.set(ms.track, e);
  });
  return out;
}

/** @param {Definition} definition @param {number} mainIndex @returns {string|null} */
function trackIdOfStage(definition, mainIndex) {
  const ms = (definition.mainStages || [])[mainIndex];
  return ms && ms.track !== undefined ? ms.track : null;
}

/** @param {Definition} definition @param {Run} run @param {string} trackId */
function isTrackSkippedEffective(definition, run, trackId) {
  const tm = trackMap(definition).get(trackId);
  return !!(tm && tm.optional && hasOwn(run.skippedTracks, trackId));
}

/** @param {Definition} definition @param {Run} run @returns {Set<string>} */
function effectiveSkippedTrackIds(definition, run) {
  const set = new Set();
  trackMap(definition).forEach((tm, id) => {
    if (tm.optional && hasOwn(run.skippedTracks, id)) set.add(id);
  });
  return set;
}

/** Flat-first track not effectively skipped, or null. @returns {string|null} */
function firstNonSkippedTrack(definition, run) {
  const skipped = effectiveSkippedTrackIds(definition, run);
  let best = null;
  let bestFirst = Infinity;
  trackMap(definition).forEach((tm, id) => {
    if (skipped.has(id)) return;
    if (tm.first < bestFirst) { bestFirst = tm.first; best = id; }
  });
  return best;
}
```

- [ ] **Step 2: Add `reachableFlat` and `normalizeFlat`.** Append:

```js
/**
 * Sorted reachable flat indices: the spine prefix plus each open
 * non-skipped track's committed range. For a linear definition this is
 * the single contiguous prefix [0..lastIndexInMain(frontier)].
 * @param {Definition} definition @param {FlatSubStage[]} subStages @param {Run} run @returns {number[]}
 */
function reachableFlat(subStages, run) {
  const forked = subStages.some((s) => s.track !== undefined);
  if (!forked) {
    const last = lastIndexInMain(subStages, run.frontier);
    const out = [];
    for (let i = 0; i <= last; i++) out.push(i);
    return out;
  }
  let spineEnd = -1;
  subStages.forEach((s) => { if (s.track === undefined) spineEnd = Math.max(spineEnd, s.mainIndex); });
  const ranges = new Map();
  subStages.forEach((s) => {
    if (s.track === undefined) return;
    const e = ranges.get(s.track) || { first: s.mainIndex, terminal: s.mainIndex, optional: !!s.optional };
    e.first = Math.min(e.first, s.mainIndex); e.terminal = Math.max(e.terminal, s.mainIndex);
    ranges.set(s.track, e);
  });
  const skipped = new Set();
  ranges.forEach((r, id) => { if (r.optional && hasOwn(run.skippedTracks, id)) skipped.add(id); });
  const tf = run.trackFrontier || {};
  const out = [];
  subStages.forEach((s, i) => {
    if (s.track === undefined) { if (s.mainIndex <= Math.min(run.frontier, spineEnd)) out.push(i); return; }
    if (skipped.has(s.track) || !hasOwn(tf, s.track)) return;
    const r = ranges.get(s.track);
    const committed = typeof tf[s.track] === "number" && tf[s.track] >= r.first && tf[s.track] <= r.terminal ? tf[s.track] : -1;
    if (committed >= s.mainIndex) out.push(i);
  });
  return out;
}

/**
 * Clamp a stale frontier to the spine and recenter a now-unreachable idx,
 * derived purely from the flat annotations. A linear flat list is returned
 * unchanged (same reference), so linear callers stay byte-identical.
 * @param {FlatSubStage[]} subStages @param {Run} run @returns {Run}
 */
function normalizeFlat(subStages, run) {
  const forked = subStages.some((s) => s.track !== undefined);
  if (!forked) return run;
  let spineEnd = -1;
  subStages.forEach((s) => { if (s.track === undefined) spineEnd = Math.max(spineEnd, s.mainIndex); });
  let next = run;
  if (run.frontier > spineEnd) next = { ...next, frontier: spineEnd };
  const reach = reachableFlat(subStages, next);
  if (!reach.includes(next.idx)) next = { ...next, idx: lastIndexInMain(subStages, spineEnd) };
  return next;
}
```

These two are `subStages`-driven (topology read from the flat `track`/`optional` annotations added in Task 4), so there is a single canonical pair: `advance` (Task 6), `browse`/`jumpTo` (Task 7), `skipSubStage` (Task 8), `buildContext`/`buildDraftPrompt` (Task 9) call them directly; the definition-holding callers (`runSummary`, `isRunComplete`, `trackStatus` in Task 10) call `flattenSubStages(definition)` first and pass the result. No second definition-driven copy exists.

- [ ] **Step 3: No standalone test.** These helpers carry no behavior a caller cannot observe; each is exercised by the first task that consumes it (`reachableFlat`/`normalizeFlat` by Task 6's advance and Task 7's navigation tests, the topology helpers by Task 3's validation tests). This commit is deliberate internal scaffolding, not untested production logic.

- [ ] **Step 4: Run** `npm test`, Expected: PASS (helpers are unused so far; existing tests unaffected). They are consumed from Task 3 onward. Note: `flattenSubStages` does not yet annotate tracks (Task 4), so on a forked definition before Task 4 these helpers see no `track` field and treat it as linear; no forked test runs before Task 6, so the ordering is safe.

- [ ] **Step 5: Commit.**
```bash
git add packages/core/src/index.js
git commit -m "feat(core): internal fork topology and run-normalization helpers (#66)"
```

---

## Task 3: Fork validation in `validateDefinition`

**Files:**
- Modify: `packages/core/src/index.js` (`validateDefinition`, lines 200-265)
- Test: `packages/core/test/engine.test.js`

**Interfaces:**
- Consumes: `isForked`, `trackMap`, `lastSpineIndex`, `trackIdOfStage` (Task 2).
- Produces: `validateDefinition` rejects every malformed fork topology and accepts a well-formed one; linear definitions validated exactly as today.

- [ ] **Step 1: Write failing tests.** Add to `engine.test.js`:

```js
const RESERVED = ["__proto__", "constructor", "prototype"];
function clone(def) { return JSON.parse(JSON.stringify(def)); }

test("validateDefinition accepts a well-formed fork", () => {
  assert.deepEqual(validateDefinition(FORKED), []);
});

test("validateDefinition rejects a stray track tag with no tracks declaration", () => {
  const d = clone(FORKED); delete d.tracks;
  assert.ok(validateDefinition(d).some((p) => /track/i.test(p)));
});

test("validateDefinition rejects tracks that is not an array", () => {
  const d = clone(FORKED); d.tracks = { demo: true };
  assert.ok(validateDefinition(d).some((p) => /tracks.*array/i.test(p)));
});

test("validateDefinition rejects fewer than 2 tracks", () => {
  const d = clone(FORKED); d.tracks = [{ id: "demo", name: "Demo", optional: true }];
  d.mainStages = d.mainStages.filter((m) => m.track !== "response");
  assert.ok(validateDefinition(d).some((p) => /at least two|fewer than 2/i.test(p)));
});

test("validateDefinition rejects a non-boolean track.optional", () => {
  const d = clone(FORKED); d.tracks[0].optional = "yes";
  assert.ok(validateDefinition(d).some((p) => /optional.*boolean/i.test(p)));
});

test("validateDefinition rejects a whitespace-only or non-string track id/name", () => {
  const blankId = clone(FORKED); blankId.tracks[0].id = "   ";
  assert.ok(validateDefinition(blankId).some((p) => /id must be a non-empty string/i.test(p)));
  const numId = clone(FORKED); numId.tracks[0].id = 7;
  assert.ok(validateDefinition(numId).some((p) => /id must be a non-empty string/i.test(p)));
  const blankName = clone(FORKED); blankName.tracks[0].name = "  ";
  assert.ok(validateDefinition(blankName).some((p) => /name must be a non-empty string/i.test(p)));
});

test("validateDefinition rejects a non-string mainStage.track", () => {
  const d = clone(FORKED); d.mainStages[2].track = 7;
  assert.ok(validateDefinition(d).some((p) => /track.*string/i.test(p)));
});

test("validateDefinition rejects a duplicate track id", () => {
  const d = clone(FORKED); d.tracks[1].id = "demo";
  assert.ok(validateDefinition(d).some((p) => /duplicate track/i.test(p)));
});

for (const key of RESERVED) {
  test(`validateDefinition rejects reserved track id ${key}`, () => {
    const d = clone(FORKED); d.tracks[0].id = key; d.mainStages[2].track = key;
    d.mainStages[3].track = key; d.mainStages[4].track = key;
    assert.ok(validateDefinition(d).some((p) => /reserved/i.test(p)));
  });
}

test("validateDefinition rejects an undeclared track reference", () => {
  const d = clone(FORKED); d.mainStages[2].track = "ghost";
  assert.ok(validateDefinition(d).some((p) => /undeclared|unknown track/i.test(p)));
});

test("validateDefinition rejects an empty spine (stage 0 tagged)", () => {
  const d = clone(FORKED); d.mainStages[0].track = "response";
  assert.ok(validateDefinition(d).some((p) => /spine/i.test(p)));
});

test("validateDefinition rejects a shared stage after the fork", () => {
  const d = clone(FORKED); delete d.mainStages[5].track; // untagged after first tagged
  assert.ok(validateDefinition(d).some((p) => /shared stage|rejoin/i.test(p)));
});

test("validateDefinition rejects a non-contiguous track", () => {
  const d = clone(FORKED);
  // swap a demo stage with a response stage so demo's block is interleaved
  const tmp = d.mainStages[4]; d.mainStages[4] = d.mainStages[5]; d.mainStages[5] = tmp;
  assert.ok(validateDefinition(d).some((p) => /contiguous/i.test(p)));
});

test("validateDefinition rejects a track that owns no main stage", () => {
  const d = clone(FORKED); d.tracks.push({ id: "extra", name: "Extra" });
  assert.ok(validateDefinition(d).some((p) => /owns no|no main stage|no terminal/i.test(p)));
});

test("validateDefinition rejects a subject outside the spine", () => {
  const d = clone(FORKED);
  d.subject = { stepId: "demoScript", outputId: "s", field: "x" };
  assert.ok(validateDefinition(d).some((p) => /subject/i.test(p)));
});

test("validateDefinition rejects a subject pointing at a non-fields output", () => {
  const d = clone(FORKED);
  d.subject = { stepId: "findings", outputId: "notes", field: "x" }; // notes is text
  assert.ok(validateDefinition(d).some((p) => /subject/i.test(p)));
});
```

- [ ] **Step 2: Run** `npm test`, Expected: FAIL (rules not implemented).

- [ ] **Step 3: Implement the fork rules.** In `validateDefinition`, after the existing `mainStages` loop and before the `subject` block, branch on `tracks`:

```js
  const stageTracks = (definition.mainStages || []).filter((m) => m.track !== undefined);
  if (definition.tracks === undefined) {
    if (stageTracks.length)
      problems.push("a mainStage.track is present without a definition.tracks declaration");
  } else if (!Array.isArray(definition.tracks)) {
    problems.push("definition.tracks must be an array");
  } else {
    const reserved = new Set(["__proto__", "constructor", "prototype"]);
    const ids = new Set();
    if (definition.tracks.length < 2) problems.push("definition.tracks needs at least two tracks");
    definition.tracks.forEach((t, ti) => {
      const idOk = t && typeof t.id === "string" && t.id.trim();
      if (!idOk) problems.push(`tracks[${ti}].id must be a non-empty string`);
      if (!(t && typeof t.name === "string" && t.name.trim()))
        problems.push(`tracks[${ti}].name must be a non-empty string`);
      if (t && t.optional !== undefined && typeof t.optional !== "boolean")
        problems.push(`track "${t && t.id}": optional must be a boolean`);
      if (idOk && reserved.has(t.id))
        problems.push(`track id "${t.id}" is a reserved object-prototype key`);
      if (idOk && ids.has(t.id)) problems.push(`duplicate track id "${t.id}"`);
      if (idOk) ids.add(t.id);
    });
    // stage track references must be non-empty strings naming a declared track
    (definition.mainStages || []).forEach((ms, mi) => {
      if (ms.track === undefined) return;
      if (typeof ms.track !== "string" || !ms.track.trim())
        problems.push(`mainStages[${mi}].track must be a non-empty string`);
      else if (!ids.has(ms.track))
        problems.push(`mainStages[${mi}].track "${ms.track}" references an undeclared track`);
    });
    // spine non-empty: stage 0 must be untagged
    const stages = definition.mainStages || [];
    if (stages.length && stages[0].track !== undefined)
      problems.push("the spine is empty: stage 0 must be a shared (untagged) stage");
    // no shared stage after the fork: once a tagged stage appears, every later stage is tagged
    let seenTagged = false;
    let contiguityBroken = false;
    const order = [];
    stages.forEach((ms) => {
      if (ms.track !== undefined) { seenTagged = true; order.push(ms.track); }
      else if (seenTagged) problems.push("a shared (untagged) stage appears after the fork (implicit rejoin)");
    });
    // contiguity: each track id forms a single contiguous run in `order`
    const seenRuns = new Set();
    let prev = null;
    order.forEach((tid) => {
      if (tid !== prev) {
        if (seenRuns.has(tid)) contiguityBroken = true;
        seenRuns.add(tid);
        prev = tid;
      }
    });
    if (contiguityBroken) problems.push("a track's stages are non-contiguous (interleaved with another track)");
    // every declared track owns at least one stage
    ids.forEach((id) => {
      if (!order.includes(id)) problems.push(`track "${id}" owns no main stage (unreachable / no terminal)`);
    });
  }
```

- [ ] **Step 4: Tighten the subject check** for forked definitions. Replace the existing `subject` block (lines 259-263) with:

```js
  if (definition.subject) {
    const s = definition.subject;
    if (!s.stepId || !s.outputId || !s.field) {
      problems.push("definition.subject requires stepId, outputId, and field");
    } else if (isForked(definition)) {
      const spineEnd = lastSpineIndex(definition);
      const owners = [];
      (definition.mainStages || []).forEach((ms, mi) => {
        (ms.subStages || []).forEach((ss) =>
          (ss.steps || []).forEach((st) => {
            if (st.id === s.stepId) owners.push({ mi, step: st });
          })
        );
      });
      if (owners.length !== 1) {
        problems.push(`definition.subject.stepId "${s.stepId}" must resolve to exactly one step`);
      } else {
        const { mi, step } = owners[0];
        if (mi > spineEnd) problems.push("definition.subject step must live in the spine, not a track");
        const out = (step.outputs || []).find((o) => o.id === s.outputId);
        if (!out) problems.push(`definition.subject.outputId "${s.outputId}" is not on step "${s.stepId}"`);
        else if (out.type !== "fields")
          problems.push("definition.subject must point at a fields output");
        else if (!(out.fields || []).some((f) => f.key === s.field))
          problems.push(`definition.subject.field "${s.field}" is not a field of "${s.outputId}"`);
      }
    }
  }
```

- [ ] **Step 5: Run** `npm test`, Expected: PASS (all Task 3 tests, and the existing "all bundled definitions validate" + "the test fixture validates" stay green).

- [ ] **Step 6: Commit.**
```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "feat(core): fork-topology validation in validateDefinition (#66)"
```

---

## Task 4: `flattenSubStages` track annotation

**Files:**
- Modify: `packages/core/src/index.js` (`flattenSubStages`, lines 183-192; `FlatSubStage` typedef line 117)
- Test: `packages/core/test/engine.test.js`

**Interfaces:**
- Produces: for a forked definition, each tracked flat sub-stage carries `track` (id) and `optional` (boolean); spine sub-stages and every sub-stage of a linear definition carry neither.

- [ ] **Step 1: Write failing tests.**

```js
test("flatten annotates tracked sub-stages and leaves spine and linear bare", () => {
  const subs = flattenSubStages(FORKED);
  const spine = subs.find((s) => s.id === "intake-sub");
  assert.equal("track" in spine, false);
  assert.equal("optional" in spine, false);
  const demo = subs.find((s) => s.id === "demo-build-sub");
  assert.equal(demo.track, "demo");
  assert.equal(demo.optional, true);
  const resp = subs.find((s) => s.id === "resp-draft-sub");
  assert.equal(resp.track, "response");
  assert.equal(resp.optional, false);
});

test("flatten of a linear definition adds no track/optional fields", () => {
  const subs = flattenSubStages(FIXTURE);
  for (const s of subs) {
    assert.equal("track" in s, false);
    assert.equal("optional" in s, false);
  }
});
```

- [ ] **Step 2: Run** `npm test`, Expected: FAIL.

- [ ] **Step 3: Implement.** Replace `flattenSubStages` body:

```js
export function flattenSubStages(definition) {
  /** @type {FlatSubStage[]} */
  const out = [];
  const tm = isForked(definition) ? trackMap(definition) : null;
  definition.mainStages.forEach((ms, mainIndex) =>
    ms.subStages.forEach((ss, subIndex) => {
      const base = { ...ss, mainId: ms.id, mainName: ms.name, mainIndex, subIndex };
      if (tm && ms.track !== undefined && tm.has(ms.track)) {
        base.track = ms.track;
        base.optional = tm.get(ms.track).optional;
      }
      out.push(base);
    })
  );
  return out;
}
```

Note: `flattenSubStages` is defined before `isForked`/`trackMap` in source order. Move the Task 2 helper block to sit immediately above `flattenSubStages`, or hoist via function declarations (they are `function` declarations, so they hoist within the module). Verify no temporal-dead-zone issue: `function` declarations hoist, so calling `isForked` inside `flattenSubStages` is safe regardless of textual order.

Update the `FlatSubStage` typedef (line 117) to:
```js
 * @typedef {SubStage & { mainId: string, mainName: string, mainIndex: number, subIndex: number, track?: string, optional?: boolean }} FlatSubStage
```

- [ ] **Step 4: Run** `npm test`, Expected: PASS, including the existing "flatten produces an ordered sequence" test (linear, unchanged).

- [ ] **Step 5: Commit.**
```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "feat(core): annotate tracked flat sub-stages in flattenSubStages (#66)"
```

---

## Task 5: Track skip API (`skipTrack`, `unskipTrack`, `isTrackSkipped`)

**Files:**
- Modify: `packages/core/src/index.js` (add after `unskipSubStage`, near line 414)
- Test: `packages/core/test/engine.test.js`

**Interfaces:**
- Consumes: `trackMap`, `isTrackSkippedEffective`, `hasOwn`, `lastIndexInMain`, `lastSpineIndex` (Task 2).
- Produces:
  - `isTrackSkipped(run, definition, trackId)` -> boolean (effective).
  - `skipTrack(run, definition, trackId)` -> Run (no-op unless declared+optional; recenters idx out of the skipped track).
  - `unskipTrack(run, definition, trackId)` -> Run (drops the map when empty).

- [ ] **Step 1: Write failing tests.**

```js
import { skipTrack, unskipTrack, isTrackSkipped } from "../src/index.js"; // add to the top import block

test("skipTrack marks an optional track and is a no-op on required/unknown", () => {
  const base = createRun();
  const skipped = skipTrack(base, FORKED, "demo");
  assert.equal(isTrackSkipped(skipped, FORKED, "demo"), true);
  assert.equal(skipTrack(base, FORKED, "response"), base); // required: no-op
  assert.equal(skipTrack(base, FORKED, "ghost"), base); // unknown: no-op
});

test("isTrackSkipped ignores a required or unknown id present in skippedTracks", () => {
  const run = { ...createRun(), skippedTracks: { response: true, ghost: true } };
  assert.equal(isTrackSkipped(run, FORKED, "response"), false);
  assert.equal(isTrackSkipped(run, FORKED, "ghost"), false);
});

test("unskipTrack restores and drops the map when empty", () => {
  const run = skipTrack(createRun(), FORKED, "demo");
  const back = unskipTrack(run, FORKED, "demo");
  assert.equal(isTrackSkipped(back, FORKED, "demo"), false);
  assert.equal("skippedTracks" in back, false);
});

test("skipTrack and unskipTrack never touch stepState", () => {
  const run = setOutput(createRun(), "intake", "facts", { client: "Acme" });
  const skipped = skipTrack(run, FORKED, "demo");
  assert.deepEqual(skipped.stepState, run.stepState);
});
```

- [ ] **Step 2: Run** `npm test`, Expected: FAIL (functions undefined).

- [ ] **Step 3: Implement.**

```js
/**
 * Effective track-skip state: true only when the definition declares the
 * track optional and it is in run.skippedTracks (own-property checked).
 * @param {Run} run @param {Definition} definition @param {string} trackId @returns {boolean}
 */
export function isTrackSkipped(run, definition, trackId) {
  return isTrackSkippedEffective(definition, run, trackId);
}

/**
 * Mark an optional track not-applicable. No-op unless the track exists and
 * is declared optional. Recenters idx out of the skipped track to the last
 * committed spine sub-stage. Never touches stepState.
 * @param {Run} run @param {Definition} definition @param {string} trackId @returns {Run}
 */
export function skipTrack(run, definition, trackId) {
  const tm = trackMap(definition).get(trackId);
  if (!tm || !tm.optional) return run;
  if (hasOwn(run.skippedTracks, trackId)) return run;
  const next = { ...run, skippedTracks: { ...run.skippedTracks, [trackId]: true } };
  const subs = flattenSubStages(definition);
  const cur = subs[run.idx];
  if (cur && trackIdOfStage(definition, cur.mainIndex) === trackId) {
    next.idx = lastIndexInMain(subs, lastSpineIndex(definition));
  }
  return next;
}

/**
 * Remove a track skip; drop the map when empty.
 * @param {Run} run @param {Definition} definition @param {string} trackId @returns {Run}
 */
export function unskipTrack(run, definition, trackId) {
  if (!hasOwn(run.skippedTracks, trackId)) return run;
  const skippedTracks = { ...run.skippedTracks };
  delete skippedTracks[trackId];
  const next = { ...run, skippedTracks };
  if (!Object.keys(skippedTracks).length) delete next.skippedTracks;
  return next;
}
```

- [ ] **Step 4: Run** `npm test`, Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "feat(core): track skip API (skipTrack/unskipTrack/isTrackSkipped) (#66)"
```

---

## Task 6: Fork-aware `advance`

**Files:**
- Modify: `packages/core/src/index.js` (`advance`, lines 631-653)
- Test: `packages/core/test/engine.test.js`

**Interfaces:**
- Consumes: `isForked`, `lastSpineIndex`, `trackMap`, `trackIdOfStage`, `firstNonSkippedTrack`, `effectiveSkippedTrackIds`, `hasOwn`, `normalizeFlat` (Task 2), `aggregateGate` (existing).
- Produces: `advance` opens/repairs the fork at the last spine stage, advances within a track, no-ops at terminals/skipped tracks; `frontier` stays at the spine; track progress in `trackFrontier`.

- [ ] **Step 1: Write failing tests.** Helper to drive the spine to the fork:

```js
function fillStep(run, stepId, outputId, value) { return setOutput(run, stepId, outputId, value); }
function commitSpine(run, subs) {
  // commit intake then findings, landing frontier at the last spine stage (1)
  let r = setOutput(run, "intake", "facts", { client: "Acme" });
  r = setCheckedDone(r, "intake", true); // hybrid; ensure gate met
  r = advance(r, subs).run; // commit stage 0 -> frontier 1
  r = setOutput(r, "findings", "notes", "n");
  return r;
}

test("advancing past the last spine stage opens the fork with frontier unchanged", () => {
  const subs = flattenSubStages(FORKED);
  let r = commitSpine(createRun(), subs); // frontier == 1 == lastSpineIndex
  const res = advance(r, subs);
  assert.equal(res.run.frontier, 1); // spine pointer unchanged
  assert.equal(res.run.trackFrontier.demo, 2); // demo first stage
  assert.equal(res.run.trackFrontier.response, 5); // response first stage
  // idx lands on the first non-skipped track in flat order (demo)
  assert.equal(subs[res.run.idx].track, "demo");
});

test("fork-open is idempotent and per-track (browsing back and advancing preserves frontiers)", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run;
  // advance demo one stage
  r = setOutput(r, "demoScript", "s", "x");
  r = jumpTo(r, subs, subs.findIndex((s) => s.id === "demo-script-sub"));
  r = advance(r, subs).run;
  const demoBefore = r.trackFrontier.demo;
  // browse back to last spine stage and advance again: no reset
  r = jumpTo(r, subs, subs.findIndex((s) => s.id === "findings-sub"));
  const res = advance(r, subs);
  assert.equal(res.run.trackFrontier.demo, demoBefore);
  assert.equal(res.run.trackFrontier.response, 5);
});

test("advancing inside one track moves only that track's frontier", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run;
  r = setOutput(r, "demoScript", "s", "x");
  r = jumpTo(r, subs, subs.findIndex((s) => s.id === "demo-script-sub"));
  const res = advance(r, subs);
  assert.equal(res.run.trackFrontier.demo, 3);
  assert.equal(res.run.trackFrontier.response, 5); // untouched
});

test("a track terminal is a no-op", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run;
  r = { ...r, trackFrontier: { ...r.trackFrontier, demo: 4 } }; // demo at terminal
  r = jumpTo(r, subs, subs.findIndex((s) => s.id === "demo-qa-sub"));
  const res = advance(r, subs);
  assert.equal(res.advanced, false);
  assert.equal(res.run.trackFrontier.demo, 4);
});

test("a forced advance past an unmet track gate records forces; a met gate records nothing", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run;
  r = jumpTo(r, subs, subs.findIndex((s) => s.id === "demo-script-sub"));
  const forced = advance(r, subs, { force: true }); // demoScript output missing
  assert.equal(forced.run.forces[2], true);
});

test("fork-open with the first track skipped lands idx on the next non-skipped track", () => {
  const subs = flattenSubStages(FORKED);
  let r = commitSpine(createRun(), subs);
  r = skipTrack(r, FORKED, "demo");
  const res = advance(r, subs);
  assert.equal(subs[res.run.idx].track, "response");
});

test("a stale forked run normalizes before the boundary advance opens the fork", () => {
  const subs = flattenSubStages(FORKED);
  // a run persisted when the definition was still linear: frontier and idx point
  // past the new spine (last spine index is 1)
  let r = setOutput(createRun(), "intake", "facts", { client: "Acme" });
  r = setOutput(r, "findings", "notes", "n");
  r = { ...r, frontier: 5, idx: subs.findIndex((s) => s.mainIndex === 5) };
  const res = advance(r, subs);
  assert.equal(res.advanced, true);
  assert.equal(res.run.frontier, 1); // clamped to the spine before opening
  assert.equal(res.run.trackFrontier.demo, 2);
  assert.equal(res.run.trackFrontier.response, 5);
});

test("the linear fixture advances exactly as before (regression)", () => {
  const subs = flattenSubStages(FIXTURE);
  // mirror the existing passing advance test: stage 0 (alpha) has start + collect,
  // so the boundary gate needs intake + kickoff + evidence.
  let r = setOutput(createRun(), "intake", "facts", { client: "Acme" });
  r = setCheckedDone(r, "kickoff", true);
  r = setOutput(r, "evidence", "doc", { name: "report.pdf", content: "" });
  const res = advance(r, subs);
  assert.equal(res.advanced, true);
  assert.equal(res.run.frontier, 1);
  assert.equal("trackFrontier" in res.run, false);
});
```

- [ ] **Step 2: Run** `npm test`, Expected: FAIL.

- [ ] **Step 3: Implement.** Replace `advance` with a version that normalizes first and branches on region:

```js
export function advance(run, subStages, { force = false, validators } = {}) {
  // Infer the definition-less topology from the flat list: a tracked card
  // carries `track`; the spine end is the last untracked mainIndex.
  const forked = subStages.some((s) => s.track !== undefined);
  // Normalize a stale run before consuming idx/frontier. For a linear flat
  // list normalizeFlat returns the same reference, so this path is byte-identical.
  const r = normalizeFlat(subStages, run);
  if (!forked) {
    // unchanged linear path (r === run)
    const cur = subStages[r.idx];
    const maxMain = subStages.length ? subStages[subStages.length - 1].mainIndex : 0;
    if (!cur || cur.mainIndex !== r.frontier || r.frontier >= maxMain)
      return { run, advanced: false, missing: [] };
    const progress = aggregateGate(subStages.filter((s) => s.mainIndex === r.frontier), r, { validators });
    if (!progress.met && !force) return { run, advanced: false, missing: progress.missing };
    const next = { ...r, idx: subStages.findIndex((s) => s.mainIndex === r.frontier + 1), frontier: r.frontier + 1 };
    if (!progress.met) next.forces = { ...r.forces, [r.frontier]: true };
    return { run: next, advanced: true, missing: [] };
  }
  return advanceForked(r, subStages, { force, validators });
}
```

Add `advanceForked` (uses the definition reconstructed from `subStages`, since `advance` keeps its signature; topology is derivable from the flat annotations):

```js
function advanceForked(run, subStages, { force, validators }) {
  // spine end = last untracked mainIndex
  let spineEnd = -1;
  subStages.forEach((s) => { if (s.track === undefined) spineEnd = Math.max(spineEnd, s.mainIndex); });
  // track ranges from the flat annotations
  const ranges = new Map(); // trackId -> { first, terminal, optional }
  subStages.forEach((s) => {
    if (s.track === undefined) return;
    const e = ranges.get(s.track) || { first: s.mainIndex, terminal: s.mainIndex, optional: !!s.optional };
    e.first = Math.min(e.first, s.mainIndex); e.terminal = Math.max(e.terminal, s.mainIndex);
    ranges.set(s.track, e);
  });
  const skipped = new Set();
  ranges.forEach((r, id) => { if (r.optional && hasOwn(run.skippedTracks, id)) skipped.add(id); });
  const cur = subStages[run.idx];
  if (!cur) return { run, advanced: false, missing: [] };
  const curTrack = cur.track === undefined ? null : cur.track;

  // browsing a committed spine stage that is not the fork boundary: spine advance
  if (curTrack === null && cur.mainIndex < spineEnd) {
    if (cur.mainIndex !== run.frontier) return { run, advanced: false, missing: [] };
    const progress = aggregateGate(subStages.filter((s) => s.mainIndex === run.frontier), run, { validators });
    if (!progress.met && !force) return { run, advanced: false, missing: progress.missing };
    const next = { ...run, idx: subStages.findIndex((s) => s.mainIndex === run.frontier + 1), frontier: run.frontier + 1 };
    if (!progress.met) next.forces = { ...run.forces, [run.frontier]: true };
    return { run: next, advanced: true, missing: [] };
  }

  // at the last spine stage: open or repair the fork
  if (curTrack === null && cur.mainIndex === spineEnd) {
    if (run.frontier !== spineEnd) return { run, advanced: false, missing: [] };
    const progress = aggregateGate(subStages.filter((s) => s.mainIndex === spineEnd), run, { validators });
    if (!progress.met && !force) return { run, advanced: false, missing: progress.missing };
    const tf = { ...run.trackFrontier };
    let initialized = false;
    ranges.forEach((r, id) => {
      const v = tf[id];
      if (!(typeof v === "number" && v >= r.first && v <= r.terminal)) { tf[id] = r.first; initialized = true; }
    });
    if (!initialized) return { run, advanced: false, missing: [] }; // already open: no-op
    const next = { ...run, trackFrontier: tf };
    if (!progress.met) next.forces = { ...run.forces, [spineEnd]: true };
    // idx -> first non-skipped track's first sub, else last spine sub
    let target = null, targetFirst = Infinity;
    ranges.forEach((r, id) => { if (!skipped.has(id) && r.first < targetFirst) { targetFirst = r.first; target = id; } });
    next.idx = target === null
      ? subStages.reduce((acc, s, i) => (s.mainIndex === spineEnd ? i : acc), run.idx)
      : subStages.findIndex((s) => s.track === target && s.mainIndex === ranges.get(target).first);
    return { run: next, advanced: true, missing: [] };
  }

  // inside a track
  if (curTrack !== null) {
    if (skipped.has(curTrack)) return { run, advanced: false, missing: [] };
    const r = ranges.get(curTrack);
    const tfv = run.trackFrontier && run.trackFrontier[curTrack];
    if (cur.mainIndex !== tfv || tfv >= r.terminal) return { run, advanced: false, missing: [] };
    const progress = aggregateGate(subStages.filter((s) => s.mainIndex === tfv), run, { validators });
    if (!progress.met && !force) return { run, advanced: false, missing: progress.missing };
    const next = {
      ...run,
      trackFrontier: { ...run.trackFrontier, [curTrack]: tfv + 1 },
      idx: subStages.findIndex((s) => s.mainIndex === tfv + 1),
    };
    if (!progress.met) next.forces = { ...run.forces, [tfv]: true };
    return { run: next, advanced: true, missing: [] };
  }
  return { run, advanced: false, missing: [] };
}
```

Note: `advanceForked` derives topology from `subStages` (the flat annotations), so `advance` keeps its `(run, subStages, opts)` signature with no definition argument. This matches the spec's "reads the centered card's region from that annotation."

- [ ] **Step 4: Run** `npm test`, Expected: PASS, including the linear regression test.

- [ ] **Step 5: Commit.**
```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "feat(core): fork-aware advance (open/repair, per-track, terminals) (#66)"
```

---

## Task 7: Fork-aware navigation (`browse`, `jumpTo`, stale-run normalization)

**Files:**
- Modify: `packages/core/src/index.js` (`browse` 601-605, `jumpTo` 614-617)
- Test: `packages/core/test/engine.test.js`

**Interfaces:**
- Consumes: `reachableFlat`, `normalizeFlat` (Task 2).
- Produces: `browse` moves `|direction|` reachable positions in the sign direction, skipping gaps; `jumpTo` accepts only reachable members; both no-op out of range; linear behavior unchanged. Stale-run normalization recenters idx and clamps frontier.

- [ ] **Step 1: Write failing tests.**

```js
test("browse moves across an uncommitted track tail between two open tracks", () => {
  const subs = flattenSubStages(FORKED);
  // open the fork, commit demo only partway (demo at stage 3, response at 5)
  let r = advance(commitSpine(createRun(), subs), subs).run; // demo=2, response=5
  r = { ...r, trackFrontier: { demo: 3, response: 5 } };
  // center on demo's last reachable sub (mainIndex 3), browse +1 should skip demo-qa (4, unreachable) to response (5)
  r = jumpTo(r, subs, subs.findIndex((s) => s.mainIndex === 3));
  const moved = browse(r, subs, 1);
  assert.equal(subs[moved.idx].mainIndex, 5); // landed on response's first stage, skipping the gap
});

test("jumpTo rejects an unreachable gap index and accepts a reachable one", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run;
  r = { ...r, trackFrontier: { demo: 3, response: 5 } };
  const gap = subs.findIndex((s) => s.mainIndex === 4); // demo-qa, uncommitted
  assert.equal(jumpTo(r, subs, gap), r); // no-op
  const ok = subs.findIndex((s) => s.mainIndex === 5);
  assert.equal(jumpTo(r, subs, ok).idx, ok);
});

test("browse/jumpTo on the linear fixture are identical to today", () => {
  const subs = flattenSubStages(FIXTURE);
  const r = { ...createRun(), frontier: 1, idx: 0 }; // FIXTURE has flat indices 0,1,2
  assert.equal(browse(r, subs, 2).idx, 2); // magnitude preserved on contiguous prefix
  assert.equal(jumpTo(r, subs, 2).idx, 2); // reachable target
  assert.equal(jumpTo(r, subs, 3), r); // index 3 is out of range: no-op (same reference)
});
```

(Stale-run normalization assertions live in Task 10 alongside completion, where they are observable; Task 7 wires the normalization into browse/jumpTo so those tests pass.)

- [ ] **Step 2: Run** `npm test`, Expected: FAIL.

- [ ] **Step 3: Implement.** `browse`/`jumpTo` already receive `subStages`; rewrite them to use the canonical `reachableFlat`/`normalizeFlat` helpers added in Task 2 (no redefinition here):

```js
export function browse(run, subStages, direction) {
  const r = normalizeFlat(subStages, run);
  const reach = reachableFlat(subStages, r);
  const pos = reach.indexOf(r.idx);
  if (pos === -1) return r === run ? run : r;
  const step = direction === 0 ? 0 : direction > 0 ? 1 : -1;
  const target = pos + step * Math.abs(direction);
  if (target < 0 || target >= reach.length) return r === run ? run : r;
  return { ...r, idx: reach[target] };
}

export function jumpTo(run, subStages, index) {
  const r = normalizeFlat(subStages, run);
  const reach = reachableFlat(subStages, r);
  if (!reach.includes(index)) return r === run ? run : r;
  return { ...r, idx: index };
}
```

`browse` and `jumpTo` call the single canonical `reachableFlat`/`normalizeFlat` from Task 2; there is no second copy. The `r === run ? run : r` guards preserve the existing same-reference no-op contract for an out-of-range linear move.

- [ ] **Step 4: Run** `npm test`, Expected: PASS, including the linear browse/jumpTo regression.

- [ ] **Step 5: Commit.**
```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "feat(core): fork-aware browse/jumpTo with non-contiguous reachable set (#66)"
```

---

## Task 8: Region-aware `skipSubStage`

**Files:**
- Modify: `packages/core/src/index.js` (`skipSubStage`, lines 390-405)
- Test: `packages/core/test/engine.test.js`

**Interfaces:**
- Produces: `skipSubStage` accepts a sub-stage committed in its own region (spine `<= frontier`, or within its track's `trackFrontier`), normalizing a stale run first; `unskipSubStage` unchanged.

- [ ] **Step 1: Write failing test.**

```js
test("skipSubStage marks a skippable sub-stage committed inside a kept track", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run; // fork open, demo=2
  r = setOutput(r, "demoScript", "s", "x");
  r = jumpTo(r, subs, subs.findIndex((s) => s.id === "demo-script-sub"));
  r = advance(r, subs).run; // demo=3 (demo-build-sub, skippable)
  const skipped = skipSubStage(r, subs, "demo-build-sub");
  assert.equal(isSubStageSkipped(skipped, "demo-build-sub"), true);
});

test("skipSubStage still rejects a beyond-region sub-stage", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run; // demo=2 only
  // demo-qa-sub (mainIndex 4) is beyond demo's frontier (2): no-op
  const same = skipSubStage(r, subs, "demo-qa-sub");
  assert.equal(same, r);
});
```

- [ ] **Step 2: Run** `npm test`, Expected: FAIL (the first test; current guard `sub.mainIndex > run.frontier` rejects mainIndex 3 because frontier stays at 1).

- [ ] **Step 3: Implement.** Rewrite the guard to be region-aware:

```js
export function skipSubStage(run, subStages, subStageId) {
  const r = normalizeFlat(subStages, run);
  const sub = subStages.find((s) => s.id === subStageId);
  if (!sub || !sub.skippable) return run;
  // committed-in-region check
  let committed;
  if (sub.track === undefined) {
    committed = sub.mainIndex <= r.frontier;
  } else {
    const tfv = r.trackFrontier && r.trackFrontier[sub.track];
    committed = typeof tfv === "number" && sub.mainIndex <= tfv;
  }
  if (!committed) return run;
  if (isSubStageSkipped(r, subStageId)) return run;
  return { ...r, skips: { ...r.skips, [subStageId]: true } };
}
```

- [ ] **Step 4: Run** `npm test`, Expected: PASS, including the existing linear `skipSubStage` tests (for a linear definition `normalizeFlat` returns the run unchanged and the spine branch reproduces the old `mainIndex > frontier` guard).

- [ ] **Step 5: Commit.**
```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "feat(core): region-aware skipSubStage for tracked sub-stages (#66)"
```

---

## Task 9: Track-scoped `buildContext`, validator relation-set, `buildDraftPrompt`

**Files:**
- Modify: `packages/core/src/index.js` (`buildContext` 768-784, `buildDraftPrompt` 800-818; thread `opts.subStages` into `gateProgress`/`mainGateProgress`/`aggregateGate`)
- Test: `packages/core/test/engine.test.js`

**Interfaces:**
- Consumes: `trackIdOfStage`-style flat topology, `normalizeFlat`, `scopeValidatorRun`.
- Produces: `buildContext` excludes sibling tracks; validators on a forked gate receive a sanitized relation-set run (allowlist) built from the normalized run; gate-helper signatures unchanged (scoping rides `opts.subStages`).

- [ ] **Step 1: Write failing tests.**

```js
test("buildContext for a track step excludes the sibling track", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run;
  r = setOutput(r, "demoScript", "s", "DEMO-ONLY");
  r = setOutput(r, "respDraft", "d", "RESPONSE-ONLY");
  // draft a response step; context must not include the demo output
  const respIdx = subs.findIndex((s) => s.id === "resp-review-sub");
  const ctx = buildContext(subs, r, respIdx, "respReview");
  assert.equal(/DEMO-ONLY/.test(ctx), false);
  assert.equal(/RESPONSE-ONLY/.test(ctx), true);
});

test("buildContext ignores a corrupted required-track entry in skippedTracks", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run;
  r = setOutput(r, "respDraft", "d", "RESPONSE-ONLY");
  r = { ...r, skippedTracks: { response: true } }; // response is required: not an effective skip
  const respIdx = subs.findIndex((s) => s.id === "resp-review-sub");
  const ctx = buildContext(subs, r, respIdx, "respReview");
  assert.equal(/RESPONSE-ONLY/.test(ctx), true); // still present: required-track skip is ignored
});

test("buildContext for a linear definition is unchanged", () => {
  const subs = flattenSubStages(FIXTURE);
  let r = setOutput(createRun(), "intake", "facts", { client: "Acme" });
  const ctx = buildContext(subs, r, 1, null);
  assert.ok(/Client: Acme/.test(ctx));
});

test("a forked validator cannot read a sibling track's output via ctx.run", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run;
  r = setOutput(r, "demoScript", "s", "SECRET");
  r = setOutput(r, "respDraft", "d", "ok");
  let sawSibling = false;
  const validators = {
    check: (_value, _spec, ctx) => {
      if (JSON.stringify(ctx.run.stepState).includes("SECRET")) sawSibling = true;
      return null;
    },
  };
  // attach validate to respDraft's output dynamically for the test
  const def = clone(FORKED);
  def.mainStages[5].subStages[0].steps[0].outputs[0].validate = "check";
  const dsubs = flattenSubStages(def);
  gateProgress(dsubs.find((s) => s.id === "resp-draft-sub"), r, { validators, subStages: dsubs });
  assert.equal(sawSibling, false);
});
```

- [ ] **Step 2: Run** `npm test`, Expected: FAIL.

- [ ] **Step 3: Implement `scopeValidatorRun`** and thread `opts.subStages`:

```js
/**
 * Sanitized relation-set run for a forked validator: spine plus the step's
 * own track, built from the normalized run, as an allowlist.
 * @param {FlatSubStage[]} subStages @param {Run} run @param {number} stepFlatIdx @returns {Run}
 */
function scopeValidatorRun(subStages, run, stepFlatIdx) {
  const forked = subStages.some((s) => s.track !== undefined);
  if (!forked) return run;
  const r = normalizeFlat(subStages, run);
  const cur = subStages[stepFlatIdx];
  const ownTrack = cur && cur.track !== undefined ? cur.track : null;
  const inScope = (mainIndex) => {
    const tid = (subStages.find((s) => s.mainIndex === mainIndex) || {}).track;
    return tid === undefined || tid === ownTrack;
  };
  const stepStage = new Map(); // stepId -> mainIndex
  subStages.forEach((s) => (s.steps || []).forEach((st) => stepStage.set(st.id, s.mainIndex)));
  const stepState = {};
  Object.keys(r.stepState || {}).forEach((sid) => {
    const mi = stepStage.get(sid);
    // allowlist: keep only known, in-scope steps; drop foreign/stale ids entirely
    if (mi !== undefined && inScope(mi)) stepState[sid] = r.stepState[sid];
  });
  const skips = {};
  Object.keys(r.skips || {}).forEach((sub) => {
    const s = subStages.find((x) => x.id === sub);
    // allowlist: keep only known, in-scope sub-stage skips
    if (s && inScope(s.mainIndex)) skips[sub] = true;
  });
  const forces = {};
  Object.keys(r.forces || {}).forEach((mi) => { if (inScope(Number(mi))) forces[mi] = true; });
  const scoped = { idx: stepFlatIdx, frontier: r.frontier, stepState };
  if (Object.keys(skips).length) scoped.skips = skips;
  if (Object.keys(forces).length) scoped.forces = forces;
  if (ownTrack !== null && r.trackFrontier && hasOwn(r.trackFrontier, ownTrack))
    scoped.trackFrontier = { [ownTrack]: r.trackFrontier[ownTrack] };
  return scoped;
}
```

Thread the scoped run into validator evaluation. In `gateProgress`, when `opts.subStages` is present and forked, replace the `run` passed to `isStepComplete`/`firstInvalidOutput` with the scoped run for each step:

```js
export function gateProgress(subStage, run, { validators, subStages } = {}) {
  const gateType = gateTypeOf(subStage);
  const required = (subStage.steps || []).filter((s) => s.required);
  const forked = !!(subStages && subStages.some((s) => s.track !== undefined));
  const missing = [];
  required.forEach((s) => {
    const flatIdx = forked ? subStages.findIndex((x) => (x.steps || []).some((st) => st.id === s.id)) : -1;
    const evalRun = forked ? scopeValidatorRun(subStages, run, flatIdx) : run;
    const entry = getStepEntry(evalRun, s.id);
    if (isStepComplete(s, entry, gateType, validators, evalRun)) return;
    const invalid = firstInvalidOutput(s, entry, validators, evalRun);
    missing.push(invalid ? `${s.name}: ${invalid.message}` : s.name);
  });
  return { met: missing.length === 0, done: required.length - missing.length, total: required.length, gateType, missing };
}
```

`mainGateProgress` and `aggregateGate` already forward `opts`; ensure `opts.subStages` reaches them (pass `{ validators, subStages }` through `aggregateGate`). Update `aggregateGate` signature comment accordingly. `advance` passes `{ validators }` today; add `subStages` there too: change its `aggregateGate(..., { validators })` calls to `aggregateGate(..., { validators, subStages })`.

- [ ] **Step 4: Implement `buildContext` track filter and `normalizeFlat`:**

```js
export function buildContext(subStages, run, flatIdx, excludeStepId, { maxCharsPerStep, validators } = {}) {
  const forked = subStages.some((s) => s.track !== undefined);
  const r = normalizeFlat(subStages, run);
  // a stale or unreachable requested index falls back to the last spine sub-stage,
  // so a stale run.idx passed straight through cannot draft a tracked card or leak track context
  let idx = flatIdx;
  if (forked) {
    const reach = reachableFlat(subStages, r);
    if (!reach.includes(flatIdx)) {
      let spineEnd = -1;
      subStages.forEach((s) => { if (s.track === undefined) spineEnd = Math.max(spineEnd, s.mainIndex); });
      idx = lastIndexInMain(subStages, spineEnd);
    }
  }
  const cur = subStages[idx];
  const curMain = cur ? cur.mainIndex : 0;
  const ownTrack = cur && cur.track !== undefined ? cur.track : null;
  const blocks = [];
  subStages.forEach((sub) => {
    if (sub.mainIndex > curMain) return;
    if (forked) {
      const tid = sub.track === undefined ? null : sub.track;
      if (tid !== null && tid !== ownTrack) return; // exclude sibling tracks
      // effective skip only: a corrupted required/unknown id in skippedTracks must not suppress context
      if (tid !== null && sub.optional === true && hasOwn(r.skippedTracks, tid)) return;
    }
    if (isSubStageSkipped(r, sub.id)) return;
    const gateType = gateTypeOf(sub);
    (sub.steps || []).forEach((step) => {
      if (step.id === excludeStepId) return;
      const evalRun = forked ? scopeValidatorRun(subStages, r, subStages.indexOf(sub)) : r;
      if (!isStepComplete(step, getStepEntry(evalRun, step.id), gateType, validators, evalRun)) return;
      const block = serializeStep(sub, step, r, { maxChars: maxCharsPerStep });
      if (block) blocks.push(block);
    });
  });
  return blocks.join("\n\n");
}
```

`buildDraftPrompt` calls `buildContext` and `resolveSubject`; add a normalization pass at its entry so a stale `subIdx` is treated as the spine fallback:

```js
export function buildDraftPrompt(definition, subStages, run, subIdx, step, opts = {}) {
  const r = normalizeFlat(subStages, run);
  const reach = reachableFlat(subStages, r);
  const idx = reach.includes(subIdx) ? subIdx : lastIndexInMain(subStages, (function () {
    let e = -1; subStages.forEach((s) => { if (s.track === undefined) e = Math.max(e, s.mainIndex); }); return e;
  })());
  const subStage = subStages[idx];
  const subject = resolveSubject(definition, r);
  const ctx = buildContext(subStages, r, idx, step.id, opts);
  // ...rest unchanged, using subStage and subject...
}
```

(Keep the remaining `buildDraftPrompt` body unchanged.)

- [ ] **Step 5: Run** `npm test`, Expected: PASS (forked context scoping, validator isolation, and the unchanged linear context).

- [ ] **Step 6: Commit.**
```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "feat(core): track-scoped context and validator relation-set isolation (#66)"
```

---

## Task 10: `isRunComplete`, `trackStatus`, and `runSummary` track-skip

**Files:**
- Modify: `packages/core/src/index.js` (add `isRunComplete`, `trackStatus` near the other gate helpers; `runSummary` 1137-1140)
- Test: `packages/core/test/engine.test.js`

**Interfaces:**
- Consumes: `isForked`, `lastSpineIndex`, `trackMap`, `trackIdOfStage`, `effectiveSkippedTrackIds`, `isTrackSkippedEffective`, `normalizeFlat`, `mainGateProgress`/`aggregateGate` with `opts.subStages`.
- Produces:
  - `isRunComplete(definition, run, opts)` -> boolean.
  - `trackStatus(definition, run, trackId, opts)` -> `"not-open" | "active" | "complete" | "skipped"`.
  - `runSummary` excludes effectively-skipped tracks' sub-stages.

- [ ] **Step 1: Write failing tests.**

```js
import { isRunComplete, trackStatus } from "../src/index.js"; // add to import block

function driveTrackToTerminal(r, subs, track, stepIds) {
  // fill + advance every stage of a track to its terminal
  for (const [stepId, outId, idSub] of stepIds) {
    r = setOutput(r, stepId, outId, "x");
    if (idSub) r = setCheckedDone(r, stepId, true);
    r = jumpTo(r, subs, subs.findIndex((s) => trackIdOfStageById(subs, s) === track && s.mainIndex === r.trackFrontier[track]));
    r = advance(r, subs).run;
  }
  return r;
}

test("isRunComplete is false before the fork opens even with terminal trackFrontier", () => {
  const subs = flattenSubStages(FORKED);
  const r = { ...createRun(), frontier: 0, trackFrontier: { demo: 4, response: 7 } };
  assert.equal(isRunComplete(FORKED, r), false);
  assert.equal(trackStatus(FORKED, r, "response"), "not-open");
});

test("trackStatus is not-open at the last spine stage before the boundary advance", () => {
  const subs = flattenSubStages(FORKED);
  const r = commitSpine(createRun(), subs); // frontier == 1, no trackFrontier
  assert.equal(trackStatus(FORKED, r, "demo"), "not-open");
  assert.equal(isRunComplete(FORKED, r), false);
});

test("trackStatus reports unknown id and linear definition as not-open without throwing", () => {
  assert.equal(trackStatus(FORKED, createRun(), "ghost"), "not-open");
  assert.equal(trackStatus(FIXTURE, createRun(), "any"), "not-open");
});

test("a skipped optional track is excluded; an all-required-complete run completes", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run; // fork open
  r = skipTrack(r, FORKED, "demo");
  // drive response to its terminal with all gates met
  r = setOutput(r, "respDraft", "d", "x"); r = setCheckedDone(r, "respDraft", true);
  r = jumpTo(r, subs, subs.findIndex((s) => s.id === "resp-draft-sub")); r = advance(r, subs).run;
  r = setOutput(r, "respReview", "r", "x"); r = setCheckedDone(r, "respReview", true);
  r = jumpTo(r, subs, subs.findIndex((s) => s.id === "resp-review-sub")); r = advance(r, subs).run;
  r = setCheckedDone(r, "respSignoff", true); // strict terminal
  assert.equal(trackStatus(FORKED, r, "response"), "complete");
  assert.equal(trackStatus(FORKED, r, "demo"), "skipped");
  assert.equal(isRunComplete(FORKED, r), true);
});

test("runSummary excludes a skipped track's sub-stages", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run;
  const before = runSummary(FORKED, r, { subStages: subs }).total;
  const after = runSummary(FORKED, skipTrack(r, FORKED, "demo"), { subStages: subs }).total;
  assert.ok(after < before);
});
```

(Add a small test helper `trackIdOfStageById` in the test file: `const trackIdOfStageById = (subs, s) => s.track === undefined ? null : s.track;` or inline. The driver above is illustrative; the implementer may simplify by setting `trackFrontier` directly where a test only needs a terminal state.)

- [ ] **Step 2: Run** `npm test`, Expected: FAIL.

- [ ] **Step 3: Implement.**

```js
/**
 * Is the whole run complete?
 * @param {Definition} definition @param {Run} run
 * @param {{ validators?: Object }} [opts]
 * @returns {boolean}
 */
export function isRunComplete(definition, run, opts = {}) {
  const subs = flattenSubStages(definition);
  const o = { ...opts, subStages: subs };
  if (!isForked(definition)) {
    const last = definition.mainStages.length - 1;
    if (run.frontier !== last) return false;
    return mainGateProgress(definition.mainStages[last], run, o).met &&
      definition.mainStages.every((ms) => mainGateProgress(ms, run, o).met);
  }
  const r = normalizeFlat(subs, run);
  const spineEnd = lastSpineIndex(definition);
  if (r.frontier !== spineEnd) return false; // spine fully committed
  const tm = trackMap(definition);
  const skipped = effectiveSkippedTrackIds(definition, r);
  // fork OPENED: the boundary advance initialized a valid in-range trackFrontier
  // entry for EVERY declared track, including skipped ones. Without this, a run
  // sitting at the last spine stage is only ready-to-open, not complete; this is
  // also what stops an all-optional, all-skipped run from completing before the
  // boundary advance ever ran.
  for (const [id, t] of tm) {
    const v = r.trackFrontier && r.trackFrontier[id];
    if (!(typeof v === "number" && v >= t.first && v <= t.terminal)) return false;
  }
  // every KEPT track has reached its terminal
  for (const [id, t] of tm) {
    if (skipped.has(id)) continue;
    if (r.trackFrontier[id] !== t.terminal) return false;
  }
  // every non-skipped gate along the kept path is met (spine + kept tracks)
  for (let i = 0; i < definition.mainStages.length; i++) {
    const tid = trackIdOfStage(definition, i);
    if (tid !== null && skipped.has(tid)) continue;
    if (!mainGateProgress(definition.mainStages[i], r, o).met) return false;
  }
  return true;
}

/**
 * @param {Definition} definition @param {Run} run @param {string} trackId
 * @param {{ validators?: Object }} [opts]
 * @returns {"not-open"|"active"|"complete"|"skipped"}
 */
export function trackStatus(definition, run, trackId, opts = {}) {
  if (!isForked(definition)) return "not-open";
  const subs = flattenSubStages(definition);
  const o = { ...opts, subStages: subs };
  const tm = trackMap(definition).get(trackId);
  if (!tm) return "not-open";
  const r = normalizeFlat(subs, run);
  // the fork must be OPEN before any other status: spine committed AND a valid
  // in-range trackFrontier entry for this track (so a skipped track still reads
  // not-open until the boundary advance has run).
  if (r.frontier !== lastSpineIndex(definition)) return "not-open";
  const v = r.trackFrontier && r.trackFrontier[trackId];
  if (!(typeof v === "number" && v >= tm.first && v <= tm.terminal)) return "not-open";
  if (isTrackSkippedEffective(definition, r, trackId)) return "skipped";
  if (v === tm.terminal && mainGateProgress(definition.mainStages[tm.terminal], r, o).met) return "complete";
  return "active";
}
```

Update `runSummary` to exclude effectively-skipped tracks' sub-stages and pass `subStages`:

```js
export function runSummary(definition, run, opts = {}) {
  const subs = flattenSubStages(definition);
  const o = { ...opts, subStages: subs };
  const skipped = isForked(definition) ? effectiveSkippedTrackIds(definition, run) : new Set();
  const active = subs.filter((ss) => !isSubStageSkipped(run, ss.id) && !(ss.track !== undefined && skipped.has(ss.track)));
  return { met: active.filter((ss) => gateProgress(ss, run, o).met).length, total: active.length };
}
```

- [ ] **Step 4: Run** `npm test`, Expected: PASS. Also confirm the existing linear `runSummary` test still passes (linear: `skipped` is empty, behavior unchanged; new `o.subStages` is ignored by linear `gateProgress`).

- [ ] **Step 5: Commit.**
```bash
git add packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "feat(core): isRunComplete, trackStatus, runSummary track-skip (#66)"
```

---

## Task 11: `cloneRun` fork fail-fast

**Files:**
- Modify: `packages/core/src/index.js` (`cloneRun`, lines 993-...)
- Test: `packages/core/test/runstore.test.js`

**Interfaces:**
- Produces: a full clone deep-copies `trackFrontier`/`skippedTracks` (already via `structuredClone`); `uptoStageId` truncation that resolves to a tracked (post-fork) stage throws; truncation to a spine stage works and drops the track maps.

- [ ] **Step 1: Write failing tests** in `runstore.test.js` (import `FORKED`):

```js
import { FORKED } from "./fixtures/forked.js";

test("cloneRun full clone deep-copies trackFrontier/skippedTracks", () => {
  const run = { idx: 5, frontier: 1, stepState: {}, trackFrontier: { demo: 2, response: 5 }, skippedTracks: { demo: true } };
  let s = addRun(createRunStore(), { id: "r1", workflowId: "forked", name: "", status: "active", createdAt: 1, updatedAt: 1, run });
  s = cloneRun(s, { fromId: "r1", newId: "r2", now: 2 });
  const c = s.entries["r2"].run;
  assert.notEqual(c.trackFrontier, run.trackFrontier);
  assert.deepEqual(c.trackFrontier, run.trackFrontier);
  assert.deepEqual(c.skippedTracks, run.skippedTracks);
});

test("cloneRun truncating at a tracked stage throws", () => {
  const run = { idx: 5, frontier: 1, stepState: {}, trackFrontier: { demo: 4, response: 7 } };
  let s = addRun(createRunStore(), { id: "r1", workflowId: "forked", name: "", status: "active", createdAt: 1, updatedAt: 1, run });
  assert.throws(
    () => cloneRun(s, { fromId: "r1", newId: "r2", now: 2, uptoStageId: "demo-qa", definition: FORKED }),
    /tracked|fork/i
  );
});

test("cloneRun truncating at a spine stage works and drops track maps", () => {
  const run = { idx: 5, frontier: 1, stepState: { intake: { checkedDone: true, outputs: {} } }, trackFrontier: { demo: 4 }, skippedTracks: { demo: true } };
  let s = addRun(createRunStore(), { id: "r1", workflowId: "forked", name: "", status: "active", createdAt: 1, updatedAt: 1, run });
  s = cloneRun(s, { fromId: "r1", newId: "r2", now: 2, uptoStageId: "findings-stage", definition: FORKED });
  const c = s.entries["r2"].run;
  assert.equal("trackFrontier" in c, false);
  assert.equal("skippedTracks" in c, false);
  assert.equal(c.frontier, 1);
});
```

- [ ] **Step 2: Run** `npm test`, Expected: FAIL (the tracked-stage throw is not implemented).

- [ ] **Step 3: Implement.** In `cloneRun`, the tracked-stage guard must go immediately after `k` is resolved (after the ambiguity check) and **before** the existing `if (k > run.frontier)` beyond-frontier throw (packages/core/src/index.js, the `if (k > run.frontier) throw ...` line). Placing it before matters: a tracked stage with `frontier: 1` and `uptoStageId: "demo-qa"` (stage 4) is both tracked and beyond the frontier; the tracked error is the intended, more specific one and must win, so the test asserting a `tracked|fork` error passes rather than getting "beyond the run frontier" first.

```js
    // ...matches/ambiguity checks resolve k...
    if (definition.mainStages[k] && definition.mainStages[k].track !== undefined)
      throw new Error(`cloneRun: uptoStageId "${uptoStageId}" is a tracked (post-fork) stage; fork-aware truncation is not supported`);
    // ...existing `if (k > run.frontier) throw ...` and the rebuild follow unchanged...
```

The existing truncation already rebuilds `run = { idx, frontier: k, stepState }` (a fresh object without `trackFrontier`/`skippedTracks`), so a spine truncation naturally drops the track maps. The full-clone path uses `structuredClone(source.run)`, which deep-copies the track maps. No further change.

- [ ] **Step 4: Run** `npm test`, Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add packages/core/src/index.js packages/core/test/runstore.test.js
git commit -m "feat(core): cloneRun fork fail-fast on tracked truncation (#66)"
```

---

## Task 12: Docs and type generation

**Files:**
- Modify: `CLAUDE.md` (Key behaviors to preserve)
- Modify: `packages/core/README.md` (Exports line)
- Regenerate: `packages/core/types/index.d.ts`

**Interfaces:**
- Produces: committed `.d.ts`, README export list, and CLAUDE.md notes.

- [ ] **Step 1: Add a CLAUDE.md key-behavior bullet** under "Key behaviors to preserve":

```markdown
- Sub-branching (#66): a `Definition` may declare `tracks` and tag main stages with `track`, forking after a non-empty shared spine into contiguous, independent linear tracks, each ending at its own terminal (its last stage). The spine and fork are derived from stage tagging, not stored as nodes. Run state gains optional `trackFrontier` (furthest committed stage per track) and `skippedTracks` (optional tracks marked not-applicable); both absent for a linear run, which stays byte-identical. Read paths honor a track skip only for a declared optional track (effective skip), ignoring required or unknown ids in `skippedTracks`. The fork opens on advancing past the last spine stage (initializing `trackFrontier`); `frontier` at the last spine index alone is only ready-to-open. Each track advances and gates independently; `isRunComplete` is true once the spine is committed, the fork has opened, every kept track has reached its terminal, and every non-skipped gate along the kept path is met. `trackStatus` is `not-open | active | complete | skipped`. Validators on a forked gate see a sanitized relation-set run (spine plus the step's own track), so cross-track state never leaks into gating, completion, status, or draft context. `cloneRun` deep-copies the track maps on a full clone and throws on truncation to a tracked stage (fork-aware truncation is out of scope).
```

- [ ] **Step 2: Update `packages/core/README.md`** Exports line to add the new helpers (and reconcile known omissions per the spec):

```markdown
Exports: `flattenSubStages`, `validateDefinition`, `createRun`, `setOutput`, `setCheckedDone`, `getStepEntry`, `hasValue`, `stepHasAnyOutput`, `isStepComplete`, `gateTypeOf`, `gateProgress`, `mainGateProgress`, `browse`, `jumpTo`, `advance`, `resolveSubject`, `serializeStep`, `buildContext`, `buildDraftPrompt`, `runSummary`, `cloneRun`, `isRunComplete`, `trackStatus`, `skipTrack`, `unskipTrack`, `isTrackSkipped`.
```

- [ ] **Step 3: Regenerate types.** Run `npm run types`. Expected: `packages/core/types/index.d.ts` updates with the new typedefs and exports.
  - If `tsc` is unavailable locally, skip generation and note that CI runs it; confirm no exported signature changed except the additive new exports. The new exports (`isRunComplete`, `trackStatus`, `skipTrack`, `unskipTrack`, `isTrackSkipped`) are additive; `gateProgress`/`mainGateProgress`/`isStepComplete`/`advance`/`browse`/`jumpTo`/`buildContext`/`buildDraftPrompt`/`runSummary` keep their parameter lists (new behavior rides `opts`/annotations).

- [ ] **Step 4: Commit.**
```bash
git add CLAUDE.md packages/core/README.md packages/core/types/index.d.ts
git commit -m "docs(core): sub-branching notes, exports, and regenerated types (#66)"
```

---

## Task 13: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the engine suite.** `npm test`, Expected: all tests PASS (the new fork suites plus the unmodified linear and run-store suites). Confirm the "all bundled definitions validate" and "the test fixture validates" tests are green.

- [ ] **Step 2: Run the demo build.** `npm run build -w examples/demo`, Expected: build succeeds (no forked definition is fed to the UI; the additive engine surface does not break the demo).

- [ ] **Step 3: Confirm types.** `npm run types` then `git status`, Expected: no uncommitted changes to `packages/core/types/` (the `.d.ts` committed in Task 12 is current). If local `tsc` is unavailable, state that CI runs it and confirm the diff added only the new exports.

- [ ] **Step 4: Confirm no em dashes and clean tree.**
```bash
grep -rnP "\xe2\x80\x94" packages/core/src/index.js packages/core/test docs/specs/66-sub-branching.md CLAUDE.md && echo "FOUND em dash" || echo "clean"
git status --short
```

- [ ] **Step 5: No commit** (verification only). The branch is ready for the Codex pre-PR code-review loop (step 10).

---

## Self-review checklist (run before execution)

1. **Spec coverage:** every spec section maps to a task, validation (Task 3), flatten (Task 4), track skip API (Task 5), advance (Task 6), navigation + normalization (Task 7), region-aware skipSubStage (Task 8), context + validator scoping + draft prompt (Task 9), isRunComplete + trackStatus + runSummary (Task 10), cloneRun (Task 11), docs + types (Task 12), backward-compat regression (Tasks 6/7/8/10 linear assertions + Task 13).
2. **Placeholder scan:** no "TBD"/"add validation"/"similar to", every step shows real code or an exact command.
3. **Type consistency:** the helper names (`isForked`, `lastSpineIndex`, `trackMap`, `trackIdOfStage`, `effectiveSkippedTrackIds`, `isTrackSkippedEffective`, `firstNonSkippedTrack`, `normalizeFlat`, `reachableFlat`, `scopeValidatorRun`) and public signatures (`isRunComplete(definition, run, opts)`, `trackStatus(definition, run, trackId, opts)`, `skipTrack(run, definition, trackId)`, `unskipTrack(run, definition, trackId)`, `isTrackSkipped(run, definition, trackId)`) are used consistently across tasks. There is a single canonical `subStages`-driven normalization pair (`normalizeFlat`/`reachableFlat`) defined in Task 2; definition-holding callers (`runSummary`, `isRunComplete`, `trackStatus`) call `flattenSubStages(definition)` and pass the result. No definition-driven copy exists.

## Known implementation risks (resolve with systematic-debugging, not guessing)

- **Source ordering / hoisting:** `function` declarations hoist, so helper-before-use is safe; if any helper is written as `const = () =>`, it must precede its first use. Prefer `function` declarations for the helpers.
- **`advance` keeps no definition argument:** topology is reconstructed from the flat `subStages` annotations inside `advanceForked`. Verify the reconstruction (spine end, track ranges, optional flags) matches `trackMap(definition)` on the fixture before trusting it.
- **Validator scoping reaching `isStepComplete`:** the scoping happens in `gateProgress` (and `buildContext`) by substituting the scoped run; `isStepComplete` stays unchanged. A direct UI `isStepComplete` call is intentionally outside the guarantee (spec).
- **`normalizeFlat` idempotence:** normalizing an already-normalized run returns an equal (ideally identical-reference for linear) run; the `r === run ? run : r` guards in browse/jumpTo preserve the existing no-op-returns-same-reference contract for out-of-range linear moves.

/**
 * @sqnce/core
 *
 * Pure, dependency-free engine for staged, gated workflows.
 *
 * Two layers, deliberately separate:
 *
 * 1) DEFINITION (a plain JSON-compatible object, see /definitions)
 *    MainStage -> SubStage -> Step -> Output spec[]
 *    - Output spec types: "text" | "fields" | "file" | "link" | "data"
 *      (steps with no outputs are checklist steps)
 *    - Any output spec may carry an optional render hint:
 *      render: { kind, options }. kind is a free string resolved by the
 *      UI layer's renderer registry; the engine never interprets it.
 *    - Any output spec may carry an optional validate: "<name>", a
 *      free string resolved against a consumer-supplied validators map
 *      { [name]: (value, spec, { run, stepId }) => string | null }. The
 *      third argument carries the run (read other steps via
 *      getStepEntry) and the stepId. A returned string
 *      is the problem message. Validators are pure, never persisted,
 *      and unresolvable names mean unvalidated.
 *    - SubStage gate: { type: "hybrid" | "strict" }
 *      hybrid: a step is complete when it has any output OR is marked
 *      done. strict: it must be explicitly marked done.
 *    - definition.subject points at the field that names the thing
 *      the process is about, so generated drafts can reference it.
 *    - A step may carry an optional manual: true; the engine ignores it,
 *      the UI layer suppresses the draft action on that step.
 *
 * 2) RUN (runtime state, also JSON-compatible)
 *    { idx, frontier, stepState: { [stepId]: { checkedDone, outputs,
 *      reopened?, generated? } }, skips?, forces? }
 *    `idx` is the flat sub-stage index of the centered card. `frontier`
 *    is the index of the furthest committed MAIN stage: browsing moves
 *    freely through committed main stages (no commit between sibling
 *    sub-stages); advancing commits the next main stage at its boundary
 *    gate, the aggregate of the stage's sub-stage gates.
 *    `reopened` suppresses hybrid content-completion until the step is
 *    touched again. `generated` maps outputId -> true for values
 *    written by draft generation; any hand edit clears the mark.
 *    `skips` maps sub-stage id -> a skip entry recording who set it:
 *    `true` (a user skip, also the legacy shape) or
 *    { source: "user" | "auto", skipped } telling a person's decision
 *    from an orchestration policy's. A user decision wins: an auto
 *    operation never overrides it. isSubStageSkipped resolves an entry
 *    to its effective boolean; a skipped sub-stage is excluded from
 *    boundary gates, runSummary, and draft context. `forces` maps main-stage index -> true when the
 *    run advanced past that stage's unmet gate with the override.
 *    Both maps are optional and absent when empty.
 *    For a forked definition (one declaring `tracks`) the run also
 *    carries optional `trackFrontier` (furthest committed main-stage
 *    index per track, present once the fork opens past the last spine
 *    stage) and `skippedTracks` (optional tracks marked not-applicable).
 *    Both are absent for a linear run, which stays byte-identical.
 *    Draft generation targets draftTarget(step): the first text
 *    output, else the first data output; parseDraft turns the raw
 *    reply into a storable value (strict JSON for data targets).
 *
 * Every function here is pure: state in, new state out.
 */

/**
 * @typedef {Object} RenderHint
 * @property {string} kind
 * @property {Object<string, any>} [options]
 */
/**
 * @typedef {Object} FieldSpec
 * @property {string} key
 * @property {string} label
 */
/**
 * @typedef {Object} OutputSpec
 * @property {string} id
 * @property {"text"|"fields"|"file"|"link"|"data"} type
 * @property {string} [label]
 * @property {FieldSpec[]} [fields]
 * @property {RenderHint} [render]
 * @property {string} [validate] Validator name resolved against a consumer-supplied validators map.
 */
/**
 * @typedef {Object} Step
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {boolean} [required]
 * @property {string} [aiPrompt]
 * @property {boolean} [manual] When true, the UI suppresses the Generate affordance; the step is human-entered.
 * @property {OutputSpec[]} [outputs]
 */
/**
 * @typedef {Object} Gate
 * @property {"hybrid"|"strict"} type
 */
/**
 * @typedef {Object} SubStage
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {boolean} [skippable]
 * @property {Gate} [gate]
 * @property {Step[]} [steps]
 */
/**
 * @typedef {Object} MainStage
 * @property {string} id
 * @property {string} name
 * @property {string} [track] Track id; absent means the stage is shared spine. Present only with Definition.tracks.
 * @property {SubStage[]} subStages
 */
/**
 * @typedef {Object} Track
 * @property {string} id
 * @property {string} name
 * @property {boolean} [optional] When true, the track can be marked not-applicable per run; absent/false means required.
 */
/**
 * @typedef {Object} SubjectSpec
 * @property {string} stepId
 * @property {string} outputId
 * @property {string} field
 * @property {string} [fallback]
 */
/**
 * @typedef {Object} Definition
 * @property {string} id
 * @property {string} name
 * @property {string} [short]
 * @property {SubjectSpec} [subject]
 * @property {Track[]} [tracks] Declares a fork; absent means a linear definition.
 * @property {MainStage[]} mainStages
 */
/**
 * @typedef {SubStage & { mainId: string, mainName: string, mainIndex: number, subIndex: number, track?: string, optional?: boolean }} FlatSubStage
 */
/**
 * @typedef {Object} StepEntry
 * @property {boolean} checkedDone
 * @property {Object<string, any>} outputs
 * @property {boolean} [reopened]
 * @property {Object<string, true>} [generated]
 */
/**
 * A skip entry records who set a sub-stage's skip. `true` is the legacy and
 * canonical shape for a user skip; the object form distinguishes an
 * orchestration policy's skip (`source: "auto"`) from a person's keep-in
 * (`source: "user", skipped: false`).
 * @typedef {true | { source: "user" | "auto", skipped: boolean }} SkipEntry
 */
/**
 * @typedef {Object} Run
 * @property {number} idx
 * @property {number} frontier
 * @property {Object<string, StepEntry>} stepState
 * @property {Object<string, SkipEntry>} [skips]
 * @property {Object<string, true>} [forces]
 * @property {Object<string, number>} [trackFrontier] Furthest committed main-stage index within each track; appears when the fork opens.
 * @property {Object<string, true>} [skippedTracks] Optional tracks marked not-applicable this run.
 */
/**
 * @typedef {Object} GateProgress
 * @property {boolean} met
 * @property {number} done
 * @property {number} total
 * @property {"hybrid"|"strict"} gateType
 * @property {string[]} missing
 */
/**
 * @typedef {Object} MainGateProgress
 * @property {boolean} met
 * @property {number} done
 * @property {number} total
 * @property {string[]} missing
 */
/**
 * @typedef {Object} AdvanceResult
 * @property {Run} run
 * @property {boolean} advanced
 * @property {string[]} missing
 */
/**
 * @typedef {Object} RunEntry
 * @property {string} id
 * @property {string} workflowId
 * @property {string} name
 * @property {"active"|"archived"} status
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {Run} run
 */
/**
 * @typedef {Object} RunStore
 * @property {number} version
 * @property {string|null} activeWorkflowId
 * @property {Object<string, string>} activeRunByWorkflow
 * @property {Object<string, RunEntry>} entries
 */

/* ------------------------------------------------------------------ */
/* Definition helpers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Flatten a definition's sub-stages into a single navigable sequence,
 * annotating each with its parent main stage.
 * @param {Definition} definition
 * @returns {FlatSubStage[]}
 */
export function flattenSubStages(definition) {
  /** @type {FlatSubStage[]} */
  const out = [];
  const tm = isForked(definition) ? trackMap(definition) : null;
  definition.mainStages.forEach((ms, mainIndex) =>
    ms.subStages.forEach((ss, subIndex) => {
      // Annotate the local as FlatSubStage so checkJs accepts the later
      // base.track / base.optional assignments (the object literal alone would
      // infer a narrower type without those optional fields).
      /** @type {FlatSubStage} */
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

/* ------------------------------------------------------------------ */
/* Sub-branching topology and run-normalization helpers (#66)          */
/* ------------------------------------------------------------------ */

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
 * Derived per-track topology in mainStages order. first/terminal/indices are
 * MAIN-STAGE indices (the unit of frontier and trackFrontier), not flat indices.
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

/* ------------------------------------------------------------------ */
/* Flat-list-derived topology helpers (#114): one source for the spine */
/* end, per-track ranges, and the fork-open check, previously inlined  */
/* in several places.                                                  */
/* ------------------------------------------------------------------ */

/** Spine end as a main-stage index, derived from the flat annotations. */
function flatSpineEnd(subStages) {
  let spineEnd = -1;
  subStages.forEach((s) => { if (s.track === undefined) spineEnd = Math.max(spineEnd, s.mainIndex); });
  return spineEnd;
}

/** Per-track main-index ranges, derived from the flat annotations. */
function flatTrackRanges(subStages) {
  const ranges = new Map();
  subStages.forEach((s) => {
    if (s.track === undefined) return;
    const e = ranges.get(s.track) || { first: s.mainIndex, terminal: s.mainIndex, optional: !!s.optional };
    e.first = Math.min(e.first, s.mainIndex);
    e.terminal = Math.max(e.terminal, s.mainIndex);
    ranges.set(s.track, e);
  });
  return ranges;
}

/** Every declared track has a valid in-range OWN trackFrontier entry. `ranges`
 * is a Map<id,{first,terminal}> (from flatTrackRanges or trackMap). Own-property
 * read: an inherited key must not count as an opened track. */
function allTrackFrontiersInRange(run, ranges) {
  const tf = run.trackFrontier || {};
  for (const [id, rg] of ranges) {
    const v = hasOwn(tf, id) ? tf[id] : undefined;
    if (!(typeof v === "number" && v >= rg.first && v <= rg.terminal)) return false;
  }
  return true;
}

/** The fork is open only when the spine is committed and every declared track
 * has a valid in-range own trackFrontier entry. Mirrors the inline check. */
function flatForkOpen(run, ranges, spineEnd) {
  return run.frontier >= spineEnd && allTrackFrontiersInRange(run, ranges);
}

/**
 * Sorted reachable flat indices: the spine prefix plus each open
 * non-skipped track's committed range. For a linear definition this is
 * the single contiguous prefix [0..lastIndexInMain(frontier)].
 * @param {FlatSubStage[]} subStages
 * @param {Run} run
 * @returns {number[]}
 */
function reachableFlat(subStages, run) {
  const forked = subStages.some((s) => s.track !== undefined);
  if (!forked) {
    const last = lastIndexInMain(subStages, run.frontier);
    const out = [];
    for (let i = 0; i <= last; i++) out.push(i);
    return out;
  }
  const spineEnd = flatSpineEnd(subStages);
  const ranges = flatTrackRanges(subStages);
  const skipped = new Set();
  ranges.forEach((r, id) => { if (r.optional && hasOwn(run.skippedTracks, id)) skipped.add(id); });
  const tf = run.trackFrontier || {};
  // The fork is open (its tracks navigable) only when the whole spine is
  // committed AND EVERY declared track has a valid in-range, own trackFrontier
  // entry, matching the "fork opened" check in isRunComplete / trackStatus. A
  // partially-initialized run (any track missing or out of range, even a
  // skipped one) is NOT open: no track is navigable until the boundary advance
  // repairs every entry. Without the all-tracks requirement, a corrupted run
  // like { frontier: 1, idx: <demo card>, trackFrontier: { demo: 2 } } would
  // let demo advance while the required response entry stays missing, instead of
  // recentering to the spine so the boundary advance repairs both.
  const forkOpen = flatForkOpen(run, ranges, spineEnd);
  const out = [];
  subStages.forEach((s, i) => {
    if (s.track === undefined) { if (s.mainIndex <= Math.min(run.frontier, spineEnd)) out.push(i); return; }
    if (!forkOpen || skipped.has(s.track) || !hasOwn(tf, s.track)) return;
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
  const spineEnd = flatSpineEnd(subStages);
  let next = run;
  if (run.frontier > spineEnd) next = { ...next, frontier: spineEnd };
  const reach = reachableFlat(subStages, next);
  // Recenter to the last committed spine sub-stage. After the clamp above,
  // next.frontier <= spineEnd, so Math.min keeps the target inside the
  // committed spine even for a corrupted run whose frontier sits before the
  // spine end (it must not land idx on an un-committed spine stage).
  if (!reach.includes(next.idx))
    next = { ...next, idx: lastIndexInMain(subStages, Math.min(next.frontier, spineEnd)) };
  return next;
}

/**
 * Validate a definition's basic shape. Returns an array of problem
 * strings; an empty array means the definition is usable.
 * @param {Definition} definition
 * @returns {string[]}
 */
export function validateDefinition(definition) {
  const problems = [];
  if (!definition || typeof definition !== "object") return ["definition is not an object"];
  if (!definition.id) problems.push("definition.id is required");
  if (!definition.name) problems.push("definition.name is required");
  if (!Array.isArray(definition.mainStages) || !definition.mainStages.length)
    problems.push("definition.mainStages must be a non-empty array");

  const stepIds = new Set();
  const subStageIds = new Set();
  (definition.mainStages || []).forEach((ms, mi) => {
    if (!ms.id) problems.push(`mainStages[${mi}].id is required`);
    if (!Array.isArray(ms.subStages) || !ms.subStages.length)
      problems.push(`mainStages[${mi}].subStages must be a non-empty array`);
    (ms.subStages || []).forEach((ss, si) => {
      if (!ss.id) problems.push(`mainStages[${mi}].subStages[${si}].id is required`);
      if (ss.id && subStageIds.has(ss.id)) problems.push(`duplicate sub-stage id "${ss.id}"`);
      subStageIds.add(ss.id);
      if (ss.skippable !== undefined && typeof ss.skippable !== "boolean")
        problems.push(`sub-stage "${ss.id}": skippable must be a boolean`);
      const gt = ss.gate && ss.gate.type;
      if (gt && gt !== "hybrid" && gt !== "strict")
        problems.push(`sub-stage "${ss.id}": gate.type must be "hybrid" or "strict"`);
      (ss.steps || []).forEach((st) => {
        if (!st.id) problems.push(`a step in sub-stage "${ss.id}" is missing an id`);
        if (st.id && stepIds.has(st.id)) problems.push(`duplicate step id "${st.id}"`);
        stepIds.add(st.id);
        if (st.manual !== undefined && typeof st.manual !== "boolean")
          problems.push(`step "${st.id}": manual must be a boolean`);
        const outputIds = new Set();
        (st.outputs || []).forEach((o) => {
          if (typeof o.id !== "string" || !o.id.trim())
            problems.push(`step "${st.id}": an output is missing an id`);
          else if (outputIds.has(o.id))
            problems.push(`step "${st.id}": duplicate output id "${o.id}"`);
          else outputIds.add(o.id);
          if (!["text", "fields", "file", "link", "data"].includes(o.type))
            problems.push(`step "${st.id}": unknown output type "${o.type}"`);
          if (o.type === "fields" && (!Array.isArray(o.fields) || !o.fields.length))
            problems.push(`step "${st.id}": fields output requires a fields array`);
          if (o.render !== undefined) {
            if (!o.render || typeof o.render !== "object" || Array.isArray(o.render)) {
              problems.push(`step "${st.id}": render must be an object`);
            } else {
              if (typeof o.render.kind !== "string" || !o.render.kind.trim())
                problems.push(`step "${st.id}": render.kind must be a non-empty string`);
              if (
                o.render.options !== undefined &&
                (typeof o.render.options !== "object" ||
                  o.render.options === null ||
                  Array.isArray(o.render.options))
              )
                problems.push(`step "${st.id}": render.options must be an object`);
            }
          }
          if (
            o.validate !== undefined &&
            (typeof o.validate !== "string" || !o.validate.trim())
          )
            problems.push(`step "${st.id}": validate must be a non-empty string`);
        });
      });
    });
  });

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

  if (definition.subject) {
    const s = definition.subject;
    if (!s.stepId || !s.outputId || !s.field) {
      problems.push("definition.subject requires stepId, outputId, and field");
    } else {
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
        // spine-membership is the only forked-specific constraint
        if (isForked(definition) && mi > lastSpineIndex(definition))
          problems.push("definition.subject step must live in the spine, not a track");
        const out = (step.outputs || []).find((o) => o.id === s.outputId);
        if (!out) problems.push(`definition.subject.outputId "${s.outputId}" is not on step "${s.stepId}"`);
        else if (out.type !== "fields")
          problems.push("definition.subject must point at a fields output");
        else if (!(out.fields || []).some((f) => f.key === s.field))
          problems.push(`definition.subject.field "${s.field}" is not a field of "${s.outputId}"`);
      }
    }
  }
  return problems;
}

/* ------------------------------------------------------------------ */
/* Run state                                                           */
/* ------------------------------------------------------------------ */

/** @returns {Run} */
export function createRun() {
  return { idx: 0, frontier: 0, stepState: {} };
}

/** @returns {StepEntry} */
export function emptyStepEntry() {
  return { checkedDone: false, outputs: {} };
}

/**
 * @param {Run} run
 * @param {string} stepId
 * @returns {StepEntry}
 */
export function getStepEntry(run, stepId) {
  return run.stepState[stepId] || emptyStepEntry();
}

/**
 * Set one output value on a step. Returns a new run.
 * Any write counts as touching the step and clears `reopened`.
 * `generated: true` marks the value as written by draft generation;
 * the default (a hand edit) clears the mark for that output.
 * @param {Run} run
 * @param {string} stepId
 * @param {string} outputId
 * @param {any} value
 * @param {{ generated?: boolean }} [opts]
 * @returns {Run}
 */
export function setOutput(run, stepId, outputId, value, { generated = false } = {}) {
  const cur = run.stepState[stepId] || emptyStepEntry();
  const next = { ...cur, outputs: { ...cur.outputs, [outputId]: value } };
  delete next.reopened;
  /** @type {Object<string, true>} */
  const gen = { ...cur.generated };
  if (generated) gen[outputId] = true;
  else delete gen[outputId];
  if (Object.keys(gen).length) next.generated = gen;
  else delete next.generated;
  return { ...run, stepState: { ...run.stepState, [stepId]: next } };
}

/**
 * Was this output written by draft generation (and not hand-edited since)?
 * @param {Run} run
 * @param {string} stepId
 * @param {string} outputId
 * @returns {boolean}
 */
export function isOutputGenerated(run, stepId, outputId) {
  const entry = run.stepState[stepId];
  return !!(entry && entry.generated && entry.generated[outputId]);
}

/**
 * Set or clear a step's explicit done flag. Returns a new run.
 * Re-marking done clears `reopened`.
 * @param {Run} run
 * @param {string} stepId
 * @param {boolean} checkedDone
 * @returns {Run}
 */
export function setCheckedDone(run, stepId, checkedDone) {
  const cur = run.stepState[stepId] || emptyStepEntry();
  const next = { ...cur, checkedDone };
  if (checkedDone) delete next.reopened;
  return { ...run, stepState: { ...run.stepState, [stepId]: next } };
}

/**
 * Explicitly reopen a step. Clears the done flag and sets `reopened`,
 * which suppresses hybrid content-completion until the step is touched
 * again (an output write or a re-mark done). Strict gates ignore the
 * flag; they already require explicit done.
 * @param {Run} run
 * @param {string} stepId
 * @returns {Run}
 */
export function reopenStep(run, stepId) {
  const cur = run.stepState[stepId] || emptyStepEntry();
  return {
    ...run,
    stepState: { ...run.stepState, [stepId]: { ...cur, checkedDone: false, reopened: true } },
  };
}

/**
 * Was this sub-stage marked not applicable in this run?
 * @param {Run} run
 * @param {string} subStageId
 * @returns {boolean}
 */
export function isSubStageSkipped(run, subStageId) {
  const entry = run.skips ? run.skips[subStageId] : undefined;
  if (entry === true) return true;
  return !!(entry && entry.skipped === true);
}

/**
 * Did this run advance past mainIndex's boundary while its gate was
 * unmet? A historical fact: never auto-cleared.
 * @param {Run} run
 * @param {number} mainIndex
 * @returns {boolean}
 */
export function wasAdvanceForced(run, mainIndex) {
  return !!(run.forces && run.forces[mainIndex]);
}

/**
 * Mark a sub-stage not applicable. Returns a new run (the normalized run on a
 * no-op). No-op when the id is unknown, the sub-stage is not declared
 * skippable, it lies outside the committed reachable region, or it is already
 * skipped. Skipping never touches stepState.
 * @param {Run} run
 * @param {FlatSubStage[]} subStages
 * @param {string} subStageId
 * @returns {Run}
 */
export function skipSubStage(run, subStages, subStageId) {
  const r = normalizeFlat(subStages, run);
  const idx = subStages.findIndex((s) => s.id === subStageId);
  const sub = idx === -1 ? null : subStages[idx];
  if (!sub || !sub.skippable) return r;
  // committed-in-region: the card must be inside the reachable set (the spine
  // prefix up to frontier, or an open non-skipped track's committed range).
  // reachableFlat already rejects an unopened fork and a missing or
  // out-of-range track frontier (and reads trackFrontier own-property only), so
  // a corrupted run such as { trackFrontier: { demo: 99 } } cannot make a
  // tracked sub-stage look committed. Return r (the normalized run) on every
  // no-op path, matching browse/jumpTo, so a stale frontier/idx is normalized
  // even when nothing is skipped.
  if (!reachableFlat(subStages, r).includes(idx)) return r;
  if (r.skips && r.skips[subStageId] === true) return r; // already a user skip (idempotent)
  return { ...r, skips: { ...r.skips, [subStageId]: true } };
}

/**
 * Record a durable manual keep-in: the person wants this sub-stage in, and a
 * later automated re-evaluation cannot re-skip it. Returns a new run with
 * skips[subStageId] = { source: "user", skipped: false }. No-op (the normalized
 * run) when the id is unknown, not declared skippable, beyond the committed
 * region, or already a keep-in. Never touches stepState.
 * @param {Run} run
 * @param {FlatSubStage[]} subStages
 * @param {string} subStageId
 * @returns {Run}
 */
export function unskipSubStage(run, subStages, subStageId) {
  const r = normalizeFlat(subStages, run);
  const idx = subStages.findIndex((s) => s.id === subStageId);
  const sub = idx === -1 ? null : subStages[idx];
  if (!sub || !sub.skippable) return r;
  if (!reachableFlat(subStages, r).includes(idx)) return r;
  const entry = r.skips && r.skips[subStageId];
  if (entry && entry !== true && entry.source === "user" && entry.skipped === false) return r; // already a keep-in
  return { ...r, skips: { ...r.skips, [subStageId]: { source: "user", skipped: false } } };
}

/**
 * Apply an automated skip (orchestration policy). No-op (the normalized run)
 * when the id is unknown, not declared skippable, beyond the committed region,
 * when a user decision is already recorded (the user wins), or when an
 * automated skip is already set (idempotent). Never touches stepState.
 * @param {Run} run
 * @param {FlatSubStage[]} subStages
 * @param {string} subStageId
 * @returns {Run}
 */
export function autoSkipSubStage(run, subStages, subStageId) {
  const r = normalizeFlat(subStages, run);
  const idx = subStages.findIndex((s) => s.id === subStageId);
  const sub = idx === -1 ? null : subStages[idx];
  if (!sub || !sub.skippable) return r;
  if (!reachableFlat(subStages, r).includes(idx)) return r;
  const entry = r.skips && r.skips[subStageId];
  if (entry === true || (entry && entry.source === "user")) return r; // user wins
  if (entry && entry.source === "auto" && entry.skipped === true) return r; // already auto-skipped
  return { ...r, skips: { ...r.skips, [subStageId]: { source: "auto", skipped: true } } };
}

/**
 * Clear an automated skip. Removes the entry only when it is an automated skip,
 * dropping the skips field when it empties. A user decision or an absent entry
 * is a no-op (a user choice is never touched). Idempotent. Never touches
 * stepState.
 * @param {Run} run
 * @param {FlatSubStage[]} subStages
 * @param {string} subStageId
 * @returns {Run}
 */
export function clearAutoSkipSubStage(run, subStages, subStageId) {
  const r = normalizeFlat(subStages, run);
  const entry = r.skips && r.skips[subStageId];
  if (!entry || entry === true || entry.source !== "auto") return r;
  const skips = { ...r.skips };
  delete skips[subStageId];
  const next = { ...r, skips };
  if (!Object.keys(skips).length) delete next.skips;
  return next;
}

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
  /** @type {Run} */
  const next = { ...run, skippedTracks: { ...run.skippedTracks, [trackId]: true } };
  const subs = flattenSubStages(definition);
  const cur = subs[run.idx];
  if (cur && trackIdOfStage(definition, cur.mainIndex) === trackId) {
    // recenter to the last COMMITTED spine sub-stage. Math.min keeps the target
    // inside the committed spine for a run whose frontier sits before the spine
    // end (a corrupted run could otherwise land idx on an un-committed spine
    // card and break the reachable-region invariant); when frontier sits at or
    // past the spine end this is just the last spine sub-stage, as before.
    const spineEnd = lastSpineIndex(definition);
    next.idx = lastIndexInMain(subs, Math.min(run.frontier, spineEnd));
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

/* ------------------------------------------------------------------ */
/* Completion and gating                                               */
/* ------------------------------------------------------------------ */

/**
 * Does an output spec hold a meaningful value?
 * @param {OutputSpec} spec
 * @param {any} val
 * @returns {boolean}
 */
export function hasValue(spec, val) {
  if (val == null) return false;
  if (spec.type === "text" || spec.type === "link") return String(val).trim().length > 0;
  if (spec.type === "fields")
    return Object.values(val).some((v) => String(v || "").trim().length > 0);
  if (spec.type === "file") return !!val.name;
  if (spec.type === "data") {
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === "object") return Object.keys(val).length > 0;
    return String(val).trim().length > 0;
  }
  return false;
}

/**
 * @param {Step} step
 * @param {StepEntry} entry
 * @returns {boolean}
 */
export function stepHasAnyOutput(step, entry) {
  return (step.outputs || []).some((spec) => hasValue(spec, (entry.outputs || {})[spec.id]));
}

/**
 * First invalid present output of a step, or null. An output is invalid
 * when it names a validator (`spec.validate`), the validators map
 * resolves the name, the value is present (`hasValue`), and the
 * validator returns a string message. Validators must be pure and must
 * not throw; the engine does not catch.
 * @param {Step} step
 * @param {StepEntry} entry
 * @param {Object<string, (value: any, spec: OutputSpec, ctx: { run?: Run, stepId: string }) => (string|null)>} [validators]
 * @param {Run} [run] Threaded to validators as ctx.run for run-aware checks.
 * @returns {{ spec: OutputSpec, message: string } | null}
 */
function firstInvalidOutput(step, entry, validators, run) {
  if (!validators) return null;
  for (const spec of step.outputs || []) {
    const fn = spec.validate && validators[spec.validate];
    if (!fn) continue;
    const val = (entry.outputs || {})[spec.id];
    if (!hasValue(spec, val)) continue;
    const message = fn(val, spec, { run, stepId: step.id });
    if (typeof message === "string") return { spec, message };
  }
  return null;
}

/**
 * Is a step complete under a gate type?
 * hybrid: explicit done OR (not reopened AND any output value).
 * strict: explicit done only.
 * Either way, a present output value whose named validator rejects it
 * makes the step incomplete; a done flag cannot bless invalid data
 * (the advance force override remains the escape hatch).
 * @param {Step} step
 * @param {StepEntry} entry
 * @param {"hybrid"|"strict"} [gateType]
 * @param {Object<string, (value: any, spec: OutputSpec, ctx: { run?: Run, stepId: string }) => (string|null)>} [validators]
 * @param {Run} [run] Threaded to validators as ctx.run for run-aware checks.
 * @returns {boolean}
 */
export function isStepComplete(step, entry, gateType = "hybrid", validators, run) {
  if (firstInvalidOutput(step, entry, validators, run)) return false;
  if (gateType === "strict") return !!entry.checkedDone;
  if (entry.checkedDone) return true;
  return !entry.reopened && stepHasAnyOutput(step, entry);
}

/**
 * @param {SubStage} subStage
 * @returns {"hybrid"|"strict"}
 */
export function gateTypeOf(subStage) {
  return (subStage.gate && subStage.gate.type) || "hybrid";
}

/**
 * Sanitized relation-set run for a forked validator: the spine plus the step's
 * own track, built from the normalized run, as an allowlist so a future field
 * cannot silently leak. Returns the run unchanged for a linear flat list.
 * @param {FlatSubStage[]} subStages @param {Run} run @param {number} stepFlatIdx @returns {Run}
 */
function scopeValidatorRun(subStages, run, stepFlatIdx) {
  const forked = subStages.some((s) => s.track !== undefined);
  if (!forked) return run;
  const r = normalizeFlat(subStages, run);
  const cur = subStages[stepFlatIdx];
  const ownTrack = cur && cur.track !== undefined ? cur.track : null;
  const inScope = (mainIndex) => {
    // allowlist: an index that names no real stage (for example a corrupted
    // forces key like 999) is in NO relation set and must be dropped, not
    // treated as spine. Only a real spine stage or the step's own track passes.
    const found = subStages.find((s) => s.mainIndex === mainIndex);
    if (!found) return false;
    return found.track === undefined || found.track === ownTrack;
  };
  const stepStage = new Map(); // stepId -> mainIndex
  subStages.forEach((s) => (s.steps || []).forEach((st) => stepStage.set(st.id, s.mainIndex)));
  /** @type {Object<string, StepEntry>} */
  const stepState = {};
  Object.keys(r.stepState || {}).forEach((sid) => {
    const mi = stepStage.get(sid);
    // allowlist: keep only known, in-scope steps; drop foreign/stale ids entirely
    if (mi !== undefined && inScope(mi)) stepState[sid] = r.stepState[sid];
  });
  /** @type {Object<string, SkipEntry>} */
  const skips = {};
  Object.keys(r.skips || {}).forEach((sub) => {
    const s = subStages.find((x) => x.id === sub);
    // allowlist: keep only known, in-scope sub-stage skips, preserving provenance
    if (s && inScope(s.mainIndex)) skips[sub] = r.skips[sub];
  });
  /** @type {Object<string, true>} */
  const forces = {};
  Object.keys(r.forces || {}).forEach((mi) => { if (inScope(Number(mi))) forces[mi] = true; });
  // Annotate as Run so checkJs accepts the later optional-field assignments.
  /** @type {Run} */
  const scoped = { idx: stepFlatIdx, frontier: r.frontier, stepState };
  if (Object.keys(skips).length) scoped.skips = skips;
  if (Object.keys(forces).length) scoped.forces = forces;
  if (ownTrack !== null && r.trackFrontier && hasOwn(r.trackFrontier, ownTrack))
    scoped.trackFrontier = { [ownTrack]: r.trackFrontier[ownTrack] };
  return scoped;
}

/**
 * Progress of a sub-stage's gate.
 * Returns { met, done, total, gateType, missing }. A missing entry is
 * the step name, or "name: message" when the step is incomplete
 * because a present output failed its named validator.
 * @param {SubStage} subStage
 * @param {Run} run
 * @param {{ validators?: Object<string, (value: any, spec: OutputSpec, ctx: { run?: Run, stepId: string }) => (string|null)>, subStages?: FlatSubStage[] }} [opts]
 *   When subStages describes a forked topology, validators are evaluated
 *   against the step's spine-plus-own-track relation set (cross-track isolation);
 *   for a linear definition the run is passed through unchanged.
 * @returns {GateProgress}
 */
export function gateProgress(subStage, run, { validators, subStages } = {}) {
  const gateType = gateTypeOf(subStage);
  const required = (subStage.steps || []).filter((s) => s.required);
  const forked = !!(subStages && subStages.some((s) => s.track !== undefined));
  /** @type {string[]} */
  const missing = [];
  required.forEach((s) => {
    const flatIdx = forked ? subStages.findIndex((x) => (x.steps || []).some((st) => st.id === s.id)) : -1;
    const evalRun = forked ? scopeValidatorRun(subStages, run, flatIdx) : run;
    const entry = getStepEntry(evalRun, s.id);
    if (isStepComplete(s, entry, gateType, validators, evalRun)) return;
    const invalid = firstInvalidOutput(s, entry, validators, evalRun);
    missing.push(invalid ? `${s.name}: ${invalid.message}` : s.name);
  });
  return {
    met: missing.length === 0,
    done: required.length - missing.length,
    total: required.length,
    gateType,
    missing,
  };
}

/**
 * Validate one output value with the same spine-plus-own-track relation-set
 * scoping the gate uses, so a draft-time check matches the boundary gate. For
 * a linear definition the scoping is a pass-through. Returns the validator's
 * message string when invalid, else null (also null when no validator resolves).
 * @param {FlatSubStage[]} subStages
 * @param {Run} run
 * @param {number} flatIdx flat sub-stage index of the drafted step's sub-stage
 * @param {string} stepId
 * @param {OutputSpec} spec
 * @param {any} value
 * @param {Object<string, (value: any, spec: OutputSpec, ctx: { run?: Run, stepId: string }) => (string|null)>} [validators]
 * @returns {string|null}
 */
export function validateOutputValue(subStages, run, flatIdx, stepId, spec, value, validators) {
  const fn = spec && spec.validate && validators && validators[spec.validate];
  if (typeof fn !== "function") return null;
  const forked = subStages.some((s) => s.track !== undefined);
  const evalRun = forked ? scopeValidatorRun(subStages, run, flatIdx) : run;
  const message = fn(value, spec, { run: evalRun, stepId });
  return typeof message === "string" ? message : null;
}

/**
 * Aggregate gate over one main stage's sub-stages. Missing step names
 * are qualified by sub-stage when the stage has more than one, so
 * single-sub-stage main stages read as before.
 * @param {SubStage[]} subStagesOfMain
 * @param {Run} run
 * @param {{ validators?: Object<string, (value: any, spec: OutputSpec, ctx: { run?: Run, stepId: string }) => (string|null)>, subStages?: FlatSubStage[] }} [opts]
 * @returns {MainGateProgress}
 */
function aggregateGate(subStagesOfMain, run, opts) {
  const multi = subStagesOfMain.length > 1;
  const active = subStagesOfMain.filter((ss) => !isSubStageSkipped(run, ss.id));
  let met = true;
  let done = 0;
  let total = 0;
  /** @type {string[]} */
  const missing = [];
  active.forEach((ss) => {
    const p = gateProgress(ss, run, opts);
    met = met && p.met;
    done += p.done;
    total += p.total;
    p.missing.forEach((name) => missing.push(multi ? `${ss.name}: ${name}` : name));
  });
  return { met, done, total, missing };
}

/**
 * Progress of a main stage's boundary gate: the aggregate of its
 * sub-stage gates. Skipped sub-stages are excluded.
 * @param {MainStage} mainStage
 * @param {Run} run
 * @param {{ validators?: Object<string, (value: any, spec: OutputSpec, ctx: { run?: Run, stepId: string }) => (string|null)>, subStages?: FlatSubStage[] }} [opts]
 * @returns {MainGateProgress}
 */
export function mainGateProgress(mainStage, run, opts) {
  return aggregateGate(mainStage.subStages, run, opts);
}

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

/**
 * Last flat index belonging to a main stage or any stage before it.
 * The comparison is <=, so a frontier past the last main stage clamps
 * to the final sub-stage.
 * @param {FlatSubStage[]} subStages
 * @param {number} mainIndex
 * @returns {number}
 */
function lastIndexInMain(subStages, mainIndex) {
  let last = -1;
  subStages.forEach((s, i) => {
    if (s.mainIndex <= mainIndex) last = i;
  });
  return last;
}

/**
 * Browse within the committed reachable set. Moves |direction| reachable
 * positions in the sign of direction, skipping any unreachable gap (an
 * uncommitted track tail), and is a no-op out of range. For a linear
 * definition the reachable set is the contiguous committed prefix, so this
 * collapses to today's idx + direction step.
 * @param {Run} run
 * @param {FlatSubStage[]} subStages
 * @param {number} direction
 * @returns {Run}
 */
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

/**
 * Jump to a sub-stage; accepts a target only when it is a member of the
 * committed reachable set (an unreachable gap index is a no-op). For a linear
 * definition the reachable set is the contiguous committed prefix.
 * @param {Run} run
 * @param {FlatSubStage[]} subStages
 * @param {number} index
 * @returns {Run}
 */
export function jumpTo(run, subStages, index) {
  const r = normalizeFlat(subStages, run);
  const reach = reachableFlat(subStages, r);
  if (!reach.includes(index)) return r === run ? run : r;
  return { ...r, idx: index };
}

/**
 * Commit the next main stage. Legal from any card within the frontier
 * main stage; a no-op while browsing a committed stage or at the last
 * main stage. The gate is the stage aggregate; force overrides it.
 * On success, idx lands on the first sub-stage of the committed stage.
 * A forced commit past an unmet gate records forces[old frontier];
 * a met gate records nothing.
 * @param {Run} run
 * @param {FlatSubStage[]} subStages
 * @param {{ force?: boolean, validators?: Object<string, (value: any, spec: OutputSpec, ctx: { run?: Run, stepId: string }) => (string|null)> }} [opts]
 * @returns {AdvanceResult}
 */
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
    /** @type {Run} */
    const next = { ...r, idx: subStages.findIndex((s) => s.mainIndex === r.frontier + 1), frontier: r.frontier + 1 };
    if (!progress.met) next.forces = { ...r.forces, [r.frontier]: true };
    return { run: next, advanced: true, missing: [] };
  }
  return advanceForked(r, subStages, { force, validators });
}

/**
 * Fork-aware advance: derives the spine end, per-track ranges, and the
 * effectively-skipped set inline from the flat `subStages` annotations, so
 * `advance` keeps its `(run, subStages, opts)` signature. `run` here is already
 * normalized by `advance`.
 * @param {Run} run
 * @param {FlatSubStage[]} subStages
 * @param {{ force?: boolean, validators?: Object }} opts
 * @returns {AdvanceResult}
 */
function advanceForked(run, subStages, { force, validators }) {
  // spine end = last untracked mainIndex
  const spineEnd = flatSpineEnd(subStages);
  const ranges = flatTrackRanges(subStages);
  const skipped = new Set();
  ranges.forEach((r, id) => { if (r.optional && hasOwn(run.skippedTracks, id)) skipped.add(id); });
  const cur = subStages[run.idx];
  if (!cur) return { run, advanced: false, missing: [] };
  const curTrack = cur.track === undefined ? null : cur.track;

  // browsing a committed spine stage that is not the fork boundary: spine advance
  if (curTrack === null && cur.mainIndex < spineEnd) {
    if (cur.mainIndex !== run.frontier) return { run, advanced: false, missing: [] };
    const progress = aggregateGate(subStages.filter((s) => s.mainIndex === run.frontier), run, { validators, subStages });
    if (!progress.met && !force) return { run, advanced: false, missing: progress.missing };
    const next = { ...run, idx: subStages.findIndex((s) => s.mainIndex === run.frontier + 1), frontier: run.frontier + 1 };
    if (!progress.met) next.forces = { ...run.forces, [run.frontier]: true };
    return { run: next, advanced: true, missing: [] };
  }

  // at the last spine stage: open or repair the fork
  if (curTrack === null && cur.mainIndex === spineEnd) {
    if (run.frontier !== spineEnd) return { run, advanced: false, missing: [] };
    const progress = aggregateGate(subStages.filter((s) => s.mainIndex === spineEnd), run, { validators, subStages });
    if (!progress.met && !force) return { run, advanced: false, missing: progress.missing };
    const tf = { ...run.trackFrontier };
    let initialized = false;
    ranges.forEach((r, id) => {
      // own-property read: a corrupted run must not have an inherited key
      // counted as an already-committed track frontier (spec: never bare key reads).
      const v = hasOwn(run.trackFrontier, id) ? run.trackFrontier[id] : undefined;
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

  // inside a track. `run` here is the normalized run (advance passed
  // normalizeFlat's result), and normalizeFlat recenters idx onto a reachable
  // card. With reachableFlat's fork-open guard, a track card is reachable only
  // when the fork is open (frontier === spineEnd), so reaching this branch
  // already implies the fork is open; no separate frontier-vs-spineEnd check is
  // needed (and an explicit one would be dead code).
  if (curTrack !== null) {
    if (skipped.has(curTrack)) return { run, advanced: false, missing: [] };
    const r = ranges.get(curTrack);
    const tfv = hasOwn(run.trackFrontier, curTrack) ? run.trackFrontier[curTrack] : undefined;
    if (cur.mainIndex !== tfv || tfv >= r.terminal) return { run, advanced: false, missing: [] };
    const progress = aggregateGate(subStages.filter((s) => s.mainIndex === tfv), run, { validators, subStages });
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

/* ------------------------------------------------------------------ */
/* Subject and draft-generation support                                */
/* ------------------------------------------------------------------ */

/**
 * Resolve the human-readable subject of the process ("Contoso", "the client").
 * Falls back when the subject step's sub-stage is skipped: not-applicable
 * content never feeds draft prompts.
 * @param {Definition} definition
 * @param {Run} run
 * @returns {string}
 */
export function resolveSubject(definition, run) {
  const s = definition.subject;
  if (!s) return "the subject";
  const owner = (definition.mainStages || [])
    .flatMap((ms) => ms.subStages || [])
    .find((ss) => (ss.steps || []).some((st) => st.id === s.stepId));
  if (owner && isSubStageSkipped(run, owner.id)) return s.fallback || "the subject";
  const entry = run.stepState[s.stepId];
  const val = entry && entry.outputs && entry.outputs[s.outputId];
  return (val && String(val[s.field] || "").trim()) || s.fallback || "the subject";
}

/**
 * The output spec draft generation writes into: the first "text"
 * output, else the first "data" output, else null. The UI and the
 * prompt builder share this single definition of the target.
 * @param {Step} step
 * @returns {OutputSpec|null}
 */
export function draftTarget(step) {
  const outputs = step.outputs || [];
  return outputs.find((o) => o.type === "text") || outputs.find((o) => o.type === "data") || null;
}

/**
 * Turn a raw LLM reply into a storable value for a draft target.
 * Text targets pass through unchanged. Data targets are trimmed,
 * stripped of one surrounding markdown code fence when present, then
 * parsed as strict JSON. Success: { ok: true, value }. Failure:
 * { ok: false, error } and no value.
 * @param {OutputSpec} spec
 * @param {string} text
 * @returns {{ ok: boolean, value?: any, error?: string }}
 */
export function parseDraft(spec, text) {
  if (spec.type !== "data") return { ok: true, value: text };
  let body = String(text).trim();
  const fence = body.match(/^```[A-Za-z0-9_-]*\s*\n([\s\S]*?)\n?```$/);
  if (fence) body = fence[1].trim();
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch (e) {
    return { ok: false, error: `Draft is not valid JSON: ${e.message}` };
  }
}

/**
 * Serialize one step's outputs into a labeled text block, or null if empty.
 * @param {FlatSubStage} subStage
 * @param {Step} step
 * @param {Run} run
 * @param {{ maxChars?: number }} [opts] Block budget in characters,
 *   default 2500; Infinity disables truncation. The budget is the
 *   single truncation point (no per-part caps); a truncated block ends
 *   with a "[truncated]" line.
 * @returns {string|null}
 */
export function serializeStep(subStage, step, run, { maxChars = 2500 } = {}) {
  const entry = getStepEntry(run, step.id);
  const parts = [];
  (step.outputs || []).forEach((spec) => {
    const val = (entry.outputs || {})[spec.id];
    if (!hasValue(spec, val)) return;
    if (spec.type === "text") parts.push(val);
    if (spec.type === "link") parts.push(`Link: ${val}`);
    if (spec.type === "fields")
      parts.push(
        spec.fields
          .map((f) => `${f.label}: ${val[f.key] || ""}`)
          .filter((line) => !line.endsWith(": "))
          .join("\n")
      );
    if (spec.type === "file")
      parts.push(`Attached file: ${val.name}\n${val.content || ""}`);
    if (spec.type === "data")
      parts.push(`${spec.label || "Data"}:\n${JSON.stringify(val)}`);
  });
  if (!parts.length) return null;
  const joined = parts.join("\n");
  const body =
    joined.length > maxChars ? `${joined.slice(0, maxChars)}\n[truncated]` : joined;
  return `### ${subStage.mainName} / ${subStage.name} / ${step.name}\n${body}`;
}

/**
 * Compile completed outputs into one context string for the card at
 * flatIdx: every completed step in main stages before the card's main
 * stage, plus completed sibling steps within that main stage (any
 * card, including the current one), excluding excludeStepId (the step
 * being drafted).
 * Skipped sub-stages are excluded entirely: not-applicable content
 * never feeds draft prompts, even if outputs were entered before the
 * skip.
 * @param {FlatSubStage[]} subStages
 * @param {Run} run
 * @param {number} flatIdx
 * @param {string} [excludeStepId]
 * @param {{ maxCharsPerStep?: number, validators?: Object<string, (value: any, spec: OutputSpec, ctx: { run?: Run, stepId: string }) => (string|null)> }} [opts]
 *   maxCharsPerStep forwards as serializeStep's maxChars (default 2500).
 * @returns {string}
 */
export function buildContext(subStages, run, flatIdx, excludeStepId, { maxCharsPerStep, validators } = {}) {
  const forked = subStages.some((s) => s.track !== undefined);
  const r = normalizeFlat(subStages, run);
  // a stale or unreachable requested index falls back to the last spine sub-stage,
  // so a stale run.idx passed straight through cannot draft a tracked card or leak track context
  let idx = flatIdx;
  if (forked) {
    const reach = reachableFlat(subStages, r);
    if (!reach.includes(flatIdx)) {
      // Math.min keeps the fallback inside the committed spine, matching
      // normalizeFlat and buildDraftPrompt (a corrupted frontier below spineEnd
      // must not land the card on an un-committed spine stage).
      const spineEnd = flatSpineEnd(subStages);
      idx = lastIndexInMain(subStages, Math.min(r.frontier, spineEnd));
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

/**
 * Build a provider-agnostic prompt for drafting a step's output (the
 * draftTarget: first text output, else first data output, whose type
 * shapes the closing response instruction).
 * Pass the result to any LLM; the engine does not call one itself.
 * @param {Definition} definition
 * @param {FlatSubStage[]} subStages
 * @param {Run} run
 * @param {number} subIdx
 * @param {Step} step
 * @param {{ maxCharsPerStep?: number, validators?: Object<string, (value: any, spec: OutputSpec, ctx: { run?: Run, stepId: string }) => (string|null)> }} [opts]
 *   Forwarded to buildContext.
 * @returns {string}
 */
export function buildDraftPrompt(definition, subStages, run, subIdx, step, opts = {}) {
  const r = normalizeFlat(subStages, run);
  const forked = subStages.some((s) => s.track !== undefined);
  let idx = subIdx;
  let effStep = step;
  if (forked && !reachableFlat(subStages, r).includes(subIdx)) {
    // A stale or unreachable requested index (a tracked card surviving from a
    // stale run.idx) collapses to the last committed spine sub-stage, and the
    // tracked step collapses with it: the engine refuses to draft a tracked
    // card from stale state, so neither a tracked-card draft nor track context
    // can leak. Target the fallback sub-stage's draft-eligible step (the first
    // step with a draftTarget), else its first step. If that spine sub-stage is
    // a stepless checklist, walk earlier reachable spine sub-stages for one that
    // has a step, so the tracked step is never retained (every flat index at or
    // below the last spine sub-stage is itself spine). The subject is optional,
    // so a forked definition is not guaranteed a spine step: if the committed
    // spine has no step at all, this loop finds none and the synthetic fallback
    // below applies (it never reuses the tracked step).
    const spineEnd = flatSpineEnd(subStages);
    idx = lastIndexInMain(subStages, Math.min(r.frontier, spineEnd));
    effStep = undefined;
    for (let j = idx; j >= 0 && !effStep; j--) {
      const cand = subStages[j];
      if (cand && cand.track === undefined && (cand.steps || []).length) {
        effStep = cand.steps.find((st) => draftTarget(st)) || cand.steps[0];
        idx = j;
      }
    }
    // Last resort for a degenerate fork whose committed spine has no step at all
    // (the subject is optional, so a forked definition is not guaranteed a spine
    // step): use a benign synthetic step, never the stale tracked `step`, so the
    // tracked-card identity and task text can never leak. The empty `id`
    // satisfies the required Step.id type and makes excludeStepId a harmless
    // no-op (no real step has an empty id), and draftTarget tolerates the
    // empty outputs.
    if (!effStep) effStep = { id: "", name: "this step", outputs: [] };
  }
  let subStage = subStages[idx];
  if (!subStage) {
    // A stale or corrupted persisted index has no sub-stage on the linear path
    // (normalizeFlat leaves a linear run unchanged), so fall back to the last
    // committed sub-stage, mirroring the forked fallback, instead of throwing.
    idx = lastIndexInMain(subStages, r.frontier);
    subStage = subStages[idx];
  }
  const subject = resolveSubject(definition, r);
  const ctx = buildContext(subStages, r, idx, effStep.id, opts);
  const target = draftTarget(effStep);
  const closing =
    target && target.type === "data"
      ? "Respond with valid JSON only: no preamble, no code fences, no commentary."
      : `Refer to ${subject} by name where natural. Respond with the draft output only, concise and usable. No preamble.`;
  return [
    `You are assisting inside a staged workflow named "${definition.name}". This process concerns ${subject}.`,
    `Current stage: ${subStage.mainName} > ${subStage.name}. Current step: ${effStep.name} (${effStep.description || ""}).`,
    ctx
      ? `Outputs produced so far:\n\n${ctx}`
      : `No prior outputs exist yet; produce a strong first draft from general best practice.`,
    `Task: ${effStep.aiPrompt || `Draft the output for the step "${effStep.name}".`}`,
    closing,
  ].join("\n\n");
}

/* ------------------------------------------------------------------ */
/* Run store: multiple named runs per workflow                         */
/* ------------------------------------------------------------------ */
/*
 * A run entry wraps an engine run with identity:
 *   { id, workflowId, name, status: "active" | "archived",
 *     createdAt, updatedAt, run }
 * The store is the versioned persisted shape:
 *   { version: 3, activeWorkflowId, activeRunByWorkflow, entries }
 * Version 3 marks the frontier unit change (main-stage index); older
 * stores are discarded by loaders.
 * Ids and timestamps are supplied by the caller; nothing here reads
 * the clock or generates randomness. "Live" means status "active";
 * entry.name holds manual renames only (display names are derived by
 * runDisplayName). Every function taking a runId returns the store
 * unchanged when the id is unknown.
 * cloneRun forks an entry into a new id: the new entry's id, its store key,
 * and the newId argument are one value by construction, so updates never
 * silently no-op against a clone, and cloning never changes the active-run
 * mapping (it does not route through addRun).
 */

/** @returns {RunStore} */
export function createRunStore() {
  return { version: 3, activeWorkflowId: null, activeRunByWorkflow: {}, entries: {} };
}

/**
 * @param {{ id: string, workflowId: string, run: Run, now: number }} init
 * @returns {RunEntry}
 */
export function createRunEntry({ id, workflowId, run, now }) {
  return { id, workflowId, name: "", status: "active", createdAt: now, updatedAt: now, run };
}

/**
 * @param {RunStore} store
 * @param {RunEntry} entry
 * @returns {RunStore}
 */
function withEntry(store, entry) {
  return { ...store, entries: { ...store.entries, [entry.id]: entry } };
}

/*
 * store.entries is a plain object, so a run id equal to an inherited
 * prototype name ("toString", "constructor", "valueOf", ...) resolves to
 * the inherited member under a bare lookup. Run ids are only constrained to
 * non-empty strings, so route every membership/lookup by id through an
 * own-property check (#67 hardened cloneRun; #69 the rest).
 */
/**
 * @param {RunStore} store
 * @param {string} id
 * @returns {boolean}
 */
function hasEntry(store, id) {
  return Object.prototype.hasOwnProperty.call(store.entries, id);
}

/**
 * @param {RunStore} store
 * @param {string} id
 * @returns {RunEntry|undefined}
 */
function getEntry(store, id) {
  return hasEntry(store, id) ? store.entries[id] : undefined;
}

/**
 * Insert an entry and make it the active run of its workflow.
 * @param {RunStore} store
 * @param {RunEntry} entry
 * @returns {RunStore}
 */
export function addRun(store, entry) {
  return {
    ...withEntry(store, entry),
    activeWorkflowId: entry.workflowId,
    activeRunByWorkflow: { ...store.activeRunByWorkflow, [entry.workflowId]: entry.id },
  };
}

/**
 * @param {RunStore} store
 * @param {string} runId
 * @param {string} name
 * @param {number} now
 * @returns {RunStore}
 */
export function renameRun(store, runId, name, now) {
  const entry = getEntry(store, runId);
  if (!entry) return store;
  return withEntry(store, { ...entry, name: String(name || "").trim(), updatedAt: now });
}

/*
 * Archiving is manual only and does not touch active-run mappings: an
 * archived active run stays open and renders read-only in the UI.
 */
/**
 * @param {RunStore} store
 * @param {string} runId
 * @param {number} now
 * @returns {RunStore}
 */
export function archiveRun(store, runId, now) {
  const entry = getEntry(store, runId);
  if (!entry) return store;
  return withEntry(store, { ...entry, status: "archived", updatedAt: now });
}

/**
 * @param {RunStore} store
 * @param {string} runId
 * @param {number} now
 * @returns {RunStore}
 */
export function unarchiveRun(store, runId, now) {
  const entry = getEntry(store, runId);
  if (!entry) return store;
  return withEntry(store, { ...entry, status: "active", updatedAt: now });
}

/**
 * @param {RunStore} store
 * @param {string} runId
 * @returns {RunStore}
 */
export function setActiveRun(store, runId) {
  const entry = getEntry(store, runId);
  if (!entry) return store;
  return {
    ...store,
    activeWorkflowId: entry.workflowId,
    activeRunByWorkflow: { ...store.activeRunByWorkflow, [entry.workflowId]: runId },
  };
}

/**
 * @param {RunStore} store
 * @param {string} runId
 * @param {Run} run
 * @param {number} now
 * @returns {RunStore}
 */
export function updateRunState(store, runId, run, now) {
  const entry = getEntry(store, runId);
  if (!entry) return store;
  return withEntry(store, { ...entry, run, updatedAt: now });
}

/**
 * Fork a run into a new run-id. Deep-copies the source run under newId and
 * returns a new store the caller can drive normally. The new entry's id,
 * its store key, and newId are one value by construction, so the silent
 * no-op trap (updates landing on the wrong record because entry.id drifted
 * from its key) is impossible. The clone is always active (even from an
 * archived source) and the active-run mapping is left untouched: a consumer
 * that wants the fork open calls setActiveRun itself.
 *
 * With uptoStageId (a main-stage id, requires definition), the clone keeps
 * accepted work only up to and including that main stage; later stages are
 * blank, idx lands on the first sub-stage of the fork stage, the force at
 * the fork stage's own outgoing boundary is dropped, and skips/forces past
 * the fork stage are dropped. The supplied definition must be the run's own
 * workflow and must currently describe every step and kept skip the run
 * carries: any step or skip the definition no longer describes throws (even one
 * a truncation would otherwise discard), and a retained kept skip's sub-stage
 * must still be skippable.
 * Throws rather than silently producing a broken store on bad, colliding,
 * mismatched, or too-far input.
 * @param {RunStore} store
 * @param {{ fromId: string, newId: string, name?: string, now: number, uptoStageId?: string, definition?: Definition }} opts
 * @returns {RunStore}
 */
export function cloneRun(store, { fromId, newId, name = "", now, uptoStageId, definition }) {
  if (typeof newId !== "string" || !newId.trim())
    throw new Error("cloneRun: newId must be a non-empty string");
  if (newId === fromId) throw new Error(`cloneRun: newId must differ from fromId ("${fromId}")`);
  if (!hasEntry(store, fromId)) throw new Error(`cloneRun: no run with id "${fromId}"`);
  const source = store.entries[fromId];
  if (hasEntry(store, newId)) throw new Error(`cloneRun: a run with id "${newId}" already exists`);

  let run = structuredClone(source.run);

  if (uptoStageId !== undefined) {
    if (!definition) throw new Error("cloneRun: uptoStageId requires a definition");
    if (definition.id !== source.workflowId)
      throw new Error(
        `cloneRun: definition "${definition.id}" is not the run's workflow "${source.workflowId}"`
      );
    const matches = (definition.mainStages || []).reduce(
      (acc, ms, i) => (ms.id === uptoStageId ? [...acc, i] : acc),
      []
    );
    if (matches.length === 0) throw new Error(`cloneRun: no main stage "${uptoStageId}"`);
    if (matches.length > 1)
      throw new Error(`cloneRun: main stage "${uptoStageId}" is ambiguous (${matches.length} matches)`);
    const k = matches[0];
    // Fork-aware truncation is not supported: truncating to a tracked (post-fork)
    // stage would corrupt the index-order rebuild, so fail loudly. This more
    // specific error must win over the beyond-frontier throw below (a tracked
    // stage is typically also beyond a spine frontier).
    if (definition.mainStages[k] && definition.mainStages[k].track !== undefined)
      throw new Error(
        `cloneRun: uptoStageId "${uptoStageId}" is a tracked (post-fork) stage; fork-aware truncation is not supported`
      );
    if (k > run.frontier)
      throw new Error(
        `cloneRun: uptoStageId "${uptoStageId}" (stage ${k}) is beyond the run frontier ${run.frontier}`
      );

    const subs = flattenSubStages(definition);
    const stepMain = new Map();
    subs.forEach((ss) => (ss.steps || []).forEach((st) => stepMain.set(st.id, ss.mainIndex)));
    const subMain = new Map(subs.map((ss) => [ss.id, ss.mainIndex]));
    const skippable = new Map(subs.map((ss) => [ss.id, !!ss.skippable]));

    /** @type {Object<string, StepEntry>} */
    const stepState = {};
    for (const [stepId, entry] of Object.entries(run.stepState)) {
      if (!stepMain.has(stepId))
        throw new Error(`cloneRun: step "${stepId}" is not in definition "${definition.id}"`);
      if (stepMain.get(stepId) <= k) stepState[stepId] = entry;
    }

    /** @type {Object<string, SkipEntry>} */
    const skips = {};
    for (const subId of Object.keys(run.skips || {})) {
      if (!subMain.has(subId))
        throw new Error(`cloneRun: skip sub-stage "${subId}" is not in definition "${definition.id}"`);
      if (subMain.get(subId) <= k) {
        if (!skippable.get(subId)) throw new Error(`cloneRun: sub-stage "${subId}" is no longer skippable`);
        skips[subId] = run.skips[subId];
      }
    }

    /** @type {Object<string, true>} */
    const forces = {};
    for (const i of Object.keys(run.forces || {})) {
      if (Number(i) < k) forces[i] = true;
    }

    run = { idx: subs.findIndex((ss) => ss.mainIndex === k), frontier: k, stepState };
    if (Object.keys(skips).length) run.skips = skips;
    if (Object.keys(forces).length) run.forces = forces;
  }

  /** @type {RunEntry} */
  const entry = {
    id: newId,
    workflowId: source.workflowId,
    name: String(name || "").trim(),
    status: "active",
    createdAt: now,
    updatedAt: now,
    run,
  };
  return { ...store, entries: { ...store.entries, [newId]: entry } };
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareIds(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * All of a workflow's entries, live and archived, oldest first.
 * @param {RunStore} store
 * @param {string} workflowId
 * @returns {RunEntry[]}
 */
export function runsForWorkflow(store, workflowId) {
  return Object.values(store.entries)
    .filter((e) => e.workflowId === workflowId)
    .sort((a, b) => a.createdAt - b.createdAt || compareIds(a.id, b.id));
}

/**
 * @param {RunStore} store
 * @param {string} workflowId
 * @returns {RunEntry|null}
 */
export function activeRunEntry(store, workflowId) {
  const id = store.activeRunByWorkflow[workflowId];
  return (id && getEntry(store, id)) || null;
}

/*
 * Delete an entry. If it was its workflow's active run, fall back to
 * the workflow's most recently updated live run; with none left, the
 * workflow loses its active-run mapping (the UI creates a fresh entry
 * on demand).
 */
/**
 * @param {RunStore} store
 * @param {string} runId
 * @returns {RunStore}
 */
export function deleteRun(store, runId) {
  const entry = getEntry(store, runId);
  if (!entry) return store;
  const entries = { ...store.entries };
  delete entries[runId];
  const next = { ...store, entries };
  if (store.activeRunByWorkflow[entry.workflowId] !== runId) return next;
  const live = Object.values(entries)
    .filter((e) => e.workflowId === entry.workflowId && e.status === "active")
    .sort((a, b) => b.updatedAt - a.updatedAt || compareIds(a.id, b.id));
  const map = { ...next.activeRunByWorkflow };
  if (live.length) map[entry.workflowId] = live[0].id;
  else delete map[entry.workflowId];
  return { ...next, activeRunByWorkflow: map };
}

/**
 * Progress over a definition: how many flattened sub-stage gates are
 * met. Skipped sub-stages are excluded from both counts; for a forked
 * definition, an effectively-skipped track's sub-stages are excluded too.
 * @param {Definition} definition
 * @param {Run} run
 * @param {{ validators?: Object<string, (value: any, spec: OutputSpec, ctx: { run?: Run, stepId: string }) => (string|null)> }} [opts]
 * @returns {{ met: number, total: number }}
 */
export function runSummary(definition, run, opts = {}) {
  const subs = flattenSubStages(definition);
  const o = { ...opts, subStages: subs };
  const skipped = isForked(definition) ? effectiveSkippedTrackIds(definition, run) : new Set();
  const active = subs.filter((ss) => !isSubStageSkipped(run, ss.id) && !(ss.track !== undefined && skipped.has(ss.track)));
  return { met: active.filter((ss) => gateProgress(ss, run, o).met).length, total: active.length };
}

/**
 * Is the whole run complete? For a forked definition: the spine is committed,
 * the fork has opened, every kept track has reached its terminal, and every
 * non-skipped gate along the kept path is met.
 * @param {Definition} definition
 * @param {Run} run
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
    // own-property read (spec: never bare key reads on trackFrontier); an
    // inherited key must not be counted as an opened track.
    const v = hasOwn(r.trackFrontier, id) ? r.trackFrontier[id] : undefined;
    if (!(typeof v === "number" && v >= t.first && v <= t.terminal)) return false;
  }
  // every KEPT track has reached its terminal
  for (const [id, t] of tm) {
    if (skipped.has(id)) continue;
    if (!(hasOwn(r.trackFrontier, id) && r.trackFrontier[id] === t.terminal)) return false;
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
 * Derived per-track status: "not-open" | "active" | "complete" | "skipped".
 * An unknown track id, and any call on a linear definition, returns "not-open".
 * @param {Definition} definition
 * @param {Run} run
 * @param {string} trackId
 * @param {{ validators?: Object }} [opts]
 * @returns {"not-open"|"active"|"complete"|"skipped"}
 */
export function trackStatus(definition, run, trackId, opts = {}) {
  if (!isForked(definition)) return "not-open";
  const subs = flattenSubStages(definition);
  const o = { ...opts, subStages: subs };
  const tmap = trackMap(definition);
  const tm = tmap.get(trackId);
  if (!tm) return "not-open";
  const r = normalizeFlat(subs, run);
  // the fork must be OPEN before any other status: the spine is committed AND
  // EVERY declared track has a valid in-range own trackFrontier entry. This
  // matches reachableFlat and isRunComplete's open check: a partially
  // initialized or corrupted run (any track missing or out of range) is
  // not-open for ANY track, including a skipped one, until the boundary advance
  // repairs every entry, so trackStatus never reports a track active/complete
  // while navigation treats the fork as unopened.
  if (r.frontier !== lastSpineIndex(definition)) return "not-open";
  for (const [id, t] of tmap) {
    // own-property read (spec: never bare key reads on trackFrontier).
    const ev = hasOwn(r.trackFrontier, id) ? r.trackFrontier[id] : undefined;
    if (!(typeof ev === "number" && ev >= t.first && ev <= t.terminal)) return "not-open";
  }
  const v = r.trackFrontier[trackId]; // own + in-range, verified by the loop above
  if (isTrackSkippedEffective(definition, r, trackId)) return "skipped";
  // "complete" must mean every gate along this track's path is met (the shared
  // spine plus the track's own stages), matching the gates isRunComplete checks.
  // Checking only the track's own stages would still report complete when the
  // fork was force-opened past an unmet spine gate.
  const spineEnd = lastSpineIndex(definition);
  const gateMet = (i) => mainGateProgress(definition.mainStages[i], r, o).met;
  if (v !== tm.terminal) return "active";
  for (let i = 0; i <= spineEnd; i++) if (!gateMet(i)) return "active";
  for (const i of tm.indices) if (!gateMet(i)) return "active";
  return "complete";
}

/*
 * Display name: manual name, else the resolved subject (only when the
 * subject output field actually holds a value; the configured fallback
 * string never becomes a display name), else "Run N" by creation order
 * among the workflow's entries. N can shift after deletions; accepted
 * pre-launch.
 * Deliberate asymmetry with resolveSubject (#50): a skipped subject
 * sub-stage makes resolveSubject fall back (content channels must not
 * leak not-applicable values), but the display name keeps the typed
 * subject; it identifies the run, and renaming runs on skip would
 * destabilize the runs list.
 */
/**
 * @param {Definition} definition
 * @param {RunStore} store
 * @param {string} runId
 * @returns {string}
 */
export function runDisplayName(definition, store, runId) {
  const entry = getEntry(store, runId);
  if (!entry) return "";
  if (entry.name) return entry.name;
  const s = definition.subject;
  if (s) {
    const se = entry.run.stepState[s.stepId];
    const val = se && se.outputs && se.outputs[s.outputId];
    const subject = val && String(val[s.field] || "").trim();
    if (subject) return subject;
  }
  const n = runsForWorkflow(store, entry.workflowId).findIndex((e) => e.id === runId) + 1;
  return `Run ${n}`;
}

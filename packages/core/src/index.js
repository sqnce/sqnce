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
 *    `skips` maps sub-stage id -> true for sub-stages this run marked
 *    not applicable: excluded from boundary gates, runSummary, and
 *    draft context. `forces` maps main-stage index -> true when the
 *    run advanced past that stage's unmet gate with the override.
 *    Both maps are optional and absent when empty.
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
 * @property {SubStage[]} subStages
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
 * @property {MainStage[]} mainStages
 */
/**
 * @typedef {SubStage & { mainId: string, mainName: string, mainIndex: number, subIndex: number }} FlatSubStage
 */
/**
 * @typedef {Object} StepEntry
 * @property {boolean} checkedDone
 * @property {Object<string, any>} outputs
 * @property {boolean} [reopened]
 * @property {Object<string, true>} [generated]
 */
/**
 * @typedef {Object} Run
 * @property {number} idx
 * @property {number} frontier
 * @property {Object<string, StepEntry>} stepState
 * @property {Object<string, true>} [skips]
 * @property {Object<string, true>} [forces]
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
  definition.mainStages.forEach((ms, mainIndex) =>
    ms.subStages.forEach((ss, subIndex) =>
      out.push({ ...ss, mainId: ms.id, mainName: ms.name, mainIndex, subIndex })
    )
  );
  return out;
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
        (st.outputs || []).forEach((o) => {
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

  if (definition.subject) {
    const s = definition.subject;
    if (!s.stepId || !s.outputId || !s.field)
      problems.push("definition.subject requires stepId, outputId, and field");
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
  return !!(run.skips && run.skips[subStageId]);
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
 * Mark a sub-stage not applicable. Returns a new run. No-op (the same
 * run back) when the id is unknown, the sub-stage is not declared
 * skippable, it lies beyond the frontier, or it is already skipped.
 * Skipping never touches stepState.
 * @param {Run} run
 * @param {FlatSubStage[]} subStages
 * @param {string} subStageId
 * @returns {Run}
 */
export function skipSubStage(run, subStages, subStageId) {
  const sub = subStages.find((s) => s.id === subStageId);
  if (!sub || !sub.skippable || sub.mainIndex > run.frontier) return run;
  if (isSubStageSkipped(run, subStageId)) return run;
  return { ...run, skips: { ...run.skips, [subStageId]: true } };
}

/**
 * Undo a skip. Returns a new run with the entry removed; the skips
 * field is dropped entirely when it empties. No-op when the id is not
 * currently skipped. Outputs and done flags survive untouched.
 * @param {Run} run
 * @param {FlatSubStage[]} subStages
 * @param {string} subStageId
 * @returns {Run}
 */
export function unskipSubStage(run, subStages, subStageId) {
  if (!isSubStageSkipped(run, subStageId)) return run;
  /** @type {Object<string, true>} */
  const skips = { ...run.skips };
  delete skips[subStageId];
  const next = { ...run, skips };
  if (!Object.keys(skips).length) delete next.skips;
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
 * Progress of a sub-stage's gate.
 * Returns { met, done, total, gateType, missing }. A missing entry is
 * the step name, or "name: message" when the step is incomplete
 * because a present output failed its named validator.
 * @param {SubStage} subStage
 * @param {Run} run
 * @param {{ validators?: Object<string, (value: any, spec: OutputSpec, ctx: { run?: Run, stepId: string }) => (string|null)> }} [opts]
 * @returns {GateProgress}
 */
export function gateProgress(subStage, run, { validators } = {}) {
  const gateType = gateTypeOf(subStage);
  const required = (subStage.steps || []).filter((s) => s.required);
  /** @type {string[]} */
  const missing = [];
  required.forEach((s) => {
    const entry = getStepEntry(run, s.id);
    if (isStepComplete(s, entry, gateType, validators, run)) return;
    const invalid = firstInvalidOutput(s, entry, validators, run);
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
 * Aggregate gate over one main stage's sub-stages. Missing step names
 * are qualified by sub-stage when the stage has more than one, so
 * single-sub-stage main stages read as before.
 * @param {SubStage[]} subStagesOfMain
 * @param {Run} run
 * @param {{ validators?: Object<string, (value: any, spec: OutputSpec, ctx: { run?: Run, stepId: string }) => (string|null)> }} [opts]
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
 * @param {{ validators?: Object<string, (value: any, spec: OutputSpec, ctx: { run?: Run, stepId: string }) => (string|null)> }} [opts]
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
 * Browse within committed main stages. Returns a new run (or the same
 * run if out of range). Movement between sibling sub-stages is plain
 * browsing; nothing commits.
 * @param {Run} run
 * @param {FlatSubStage[]} subStages
 * @param {number} direction
 * @returns {Run}
 */
export function browse(run, subStages, direction) {
  const target = run.idx + direction;
  if (target < 0 || target > lastIndexInMain(subStages, run.frontier)) return run;
  return { ...run, idx: target };
}

/**
 * Jump to any sub-stage within the committed main stages.
 * @param {Run} run
 * @param {FlatSubStage[]} subStages
 * @param {number} index
 * @returns {Run}
 */
export function jumpTo(run, subStages, index) {
  if (index < 0 || index > lastIndexInMain(subStages, run.frontier)) return run;
  return { ...run, idx: index };
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
  const cur = subStages[run.idx];
  const maxMain = subStages.length ? subStages[subStages.length - 1].mainIndex : 0;
  if (!cur || cur.mainIndex !== run.frontier || run.frontier >= maxMain) {
    return { run, advanced: false, missing: [] };
  }
  const progress = aggregateGate(
    subStages.filter((s) => s.mainIndex === run.frontier),
    run,
    { validators }
  );
  if (!progress.met && !force) {
    return { run, advanced: false, missing: progress.missing };
  }
  /** @type {Run} */
  const next = {
    ...run,
    idx: subStages.findIndex((s) => s.mainIndex === run.frontier + 1),
    frontier: run.frontier + 1,
  };
  if (!progress.met) next.forces = { ...run.forces, [run.frontier]: true };
  return { run: next, advanced: true, missing: [] };
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
  const cur = subStages[flatIdx];
  const curMain = cur ? cur.mainIndex : 0;
  const blocks = [];
  subStages.forEach((sub) => {
    if (sub.mainIndex > curMain) return;
    if (isSubStageSkipped(run, sub.id)) return;
    const gateType = gateTypeOf(sub);
    (sub.steps || []).forEach((step) => {
      if (step.id === excludeStepId) return;
      if (!isStepComplete(step, getStepEntry(run, step.id), gateType, validators, run)) return;
      const block = serializeStep(sub, step, run, { maxChars: maxCharsPerStep });
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
  const subStage = subStages[subIdx];
  const subject = resolveSubject(definition, run);
  const ctx = buildContext(subStages, run, subIdx, step.id, opts);
  const target = draftTarget(step);
  const closing =
    target && target.type === "data"
      ? "Respond with valid JSON only: no preamble, no code fences, no commentary."
      : `Refer to ${subject} by name where natural. Respond with the draft output only, concise and usable. No preamble.`;
  return [
    `You are assisting inside a staged workflow named "${definition.name}". This process concerns ${subject}.`,
    `Current stage: ${subStage.mainName} > ${subStage.name}. Current step: ${step.name} (${step.description || ""}).`,
    ctx
      ? `Outputs produced so far:\n\n${ctx}`
      : `No prior outputs exist yet; produce a strong first draft from general best practice.`,
    `Task: ${step.aiPrompt || `Draft the output for the step "${step.name}".`}`,
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
 * workflow and must currently describe every retained step and kept skip.
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

    /** @type {Object<string, true>} */
    const skips = {};
    for (const subId of Object.keys(run.skips || {})) {
      if (!subMain.has(subId))
        throw new Error(`cloneRun: skip sub-stage "${subId}" is not in definition "${definition.id}"`);
      if (subMain.get(subId) <= k) {
        if (!skippable.get(subId)) throw new Error(`cloneRun: sub-stage "${subId}" is no longer skippable`);
        skips[subId] = true;
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
  return getEntry(store, id) || null;
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
 * met. Skipped sub-stages are excluded from both counts.
 * @param {Definition} definition
 * @param {Run} run
 * @param {{ validators?: Object<string, (value: any, spec: OutputSpec, ctx: { run?: Run, stepId: string }) => (string|null)> }} [opts]
 * @returns {{ met: number, total: number }}
 */
export function runSummary(definition, run, opts) {
  const subs = flattenSubStages(definition).filter((ss) => !isSubStageSkipped(run, ss.id));
  return { met: subs.filter((ss) => gateProgress(ss, run, opts).met).length, total: subs.length };
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

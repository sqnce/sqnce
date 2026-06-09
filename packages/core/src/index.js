/**
 * @sqnce/core
 *
 * Pure, dependency-free engine for staged, gated workflows.
 *
 * Two layers, deliberately separate:
 *
 * 1) DEFINITION (a plain JSON-compatible object, see /definitions)
 *    MainStage -> SubStage -> Step -> Output spec[]
 *    - Output spec types: "text" | "fields" | "file" | "link"
 *      (steps with no outputs are checklist steps)
 *    - SubStage gate: { type: "hybrid" | "strict" }
 *      hybrid: a step is complete when it has any output OR is marked
 *      done. strict: it must be explicitly marked done.
 *    - definition.subject points at the field that names the thing
 *      the process is about, so generated drafts can reference it.
 *
 * 2) RUN (runtime state, also JSON-compatible)
 *    { idx, frontier, stepState: { [stepId]: { checkedDone, outputs } } }
 *    `frontier` is the furthest committed sub-stage. Browsing moves
 *    within [0, frontier]; advancing commits the frontier forward.
 *
 * Every function here is pure: state in, new state out.
 */

/* ------------------------------------------------------------------ */
/* Definition helpers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Flatten a definition's sub-stages into a single navigable sequence,
 * annotating each with its parent main stage.
 */
export function flattenSubStages(definition) {
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
 */
export function validateDefinition(definition) {
  const problems = [];
  if (!definition || typeof definition !== "object") return ["definition is not an object"];
  if (!definition.id) problems.push("definition.id is required");
  if (!definition.name) problems.push("definition.name is required");
  if (!Array.isArray(definition.mainStages) || !definition.mainStages.length)
    problems.push("definition.mainStages must be a non-empty array");

  const stepIds = new Set();
  (definition.mainStages || []).forEach((ms, mi) => {
    if (!ms.id) problems.push(`mainStages[${mi}].id is required`);
    if (!Array.isArray(ms.subStages) || !ms.subStages.length)
      problems.push(`mainStages[${mi}].subStages must be a non-empty array`);
    (ms.subStages || []).forEach((ss, si) => {
      if (!ss.id) problems.push(`mainStages[${mi}].subStages[${si}].id is required`);
      const gt = ss.gate && ss.gate.type;
      if (gt && gt !== "hybrid" && gt !== "strict")
        problems.push(`sub-stage "${ss.id}": gate.type must be "hybrid" or "strict"`);
      (ss.steps || []).forEach((st) => {
        if (!st.id) problems.push(`a step in sub-stage "${ss.id}" is missing an id`);
        if (st.id && stepIds.has(st.id)) problems.push(`duplicate step id "${st.id}"`);
        stepIds.add(st.id);
        (st.outputs || []).forEach((o) => {
          if (!["text", "fields", "file", "link"].includes(o.type))
            problems.push(`step "${st.id}": unknown output type "${o.type}"`);
          if (o.type === "fields" && (!Array.isArray(o.fields) || !o.fields.length))
            problems.push(`step "${st.id}": fields output requires a fields array`);
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

export function createRun() {
  return { idx: 0, frontier: 0, stepState: {} };
}

export function emptyStepEntry() {
  return { checkedDone: false, outputs: {} };
}

export function getStepEntry(run, stepId) {
  return run.stepState[stepId] || emptyStepEntry();
}

/** Set one output value on a step. Returns a new run. */
export function setOutput(run, stepId, outputId, value) {
  const cur = run.stepState[stepId] || emptyStepEntry();
  return {
    ...run,
    stepState: {
      ...run.stepState,
      [stepId]: { ...cur, outputs: { ...cur.outputs, [outputId]: value } },
    },
  };
}

/** Set or clear a step's explicit done flag. Returns a new run. */
export function setCheckedDone(run, stepId, checkedDone) {
  const cur = run.stepState[stepId] || emptyStepEntry();
  return { ...run, stepState: { ...run.stepState, [stepId]: { ...cur, checkedDone } } };
}

/* ------------------------------------------------------------------ */
/* Completion and gating                                               */
/* ------------------------------------------------------------------ */

/** Does an output spec hold a meaningful value? */
export function hasValue(spec, val) {
  if (val == null) return false;
  if (spec.type === "text" || spec.type === "link") return String(val).trim().length > 0;
  if (spec.type === "fields")
    return Object.values(val).some((v) => String(v || "").trim().length > 0);
  if (spec.type === "file") return !!val.name;
  return false;
}

export function stepHasAnyOutput(step, entry) {
  return (step.outputs || []).some((spec) => hasValue(spec, (entry.outputs || {})[spec.id]));
}

/**
 * Is a step complete under a gate type?
 * hybrid: explicit done OR any output value. strict: explicit done only.
 */
export function isStepComplete(step, entry, gateType = "hybrid") {
  if (gateType === "strict") return !!entry.checkedDone;
  return !!entry.checkedDone || stepHasAnyOutput(step, entry);
}

export function gateTypeOf(subStage) {
  return (subStage.gate && subStage.gate.type) || "hybrid";
}

/**
 * Progress of a sub-stage's gate.
 * Returns { met, done, total, gateType, missing: [step names] }.
 */
export function gateProgress(subStage, run) {
  const gateType = gateTypeOf(subStage);
  const required = (subStage.steps || []).filter((s) => s.required);
  const missing = required.filter((s) => !isStepComplete(s, getStepEntry(run, s.id), gateType));
  return {
    met: missing.length === 0,
    done: required.length - missing.length,
    total: required.length,
    gateType,
    missing: missing.map((s) => s.name),
  };
}

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

/** Browse within committed territory. Returns a new run (or the same run if out of range). */
export function browse(run, subStages, direction) {
  const target = run.idx + direction;
  if (target < 0 || target > run.frontier || target >= subStages.length) return run;
  return { ...run, idx: target };
}

/** Jump to any already-committed sub-stage index. */
export function jumpTo(run, subStages, index) {
  if (index < 0 || index > run.frontier || index >= subStages.length) return run;
  return { ...run, idx: index };
}

/**
 * Commit the frontier forward. Only legal at the frontier.
 * Returns { run, advanced, missing }. If the gate is unmet and
 * force is false, the run is returned unchanged with advanced: false.
 */
export function advance(run, subStages, { force = false } = {}) {
  if (run.idx !== run.frontier || run.frontier >= subStages.length - 1) {
    return { run, advanced: false, missing: [] };
  }
  const progress = gateProgress(subStages[run.idx], run);
  if (!progress.met && !force) {
    return { run, advanced: false, missing: progress.missing };
  }
  return {
    run: { ...run, idx: run.idx + 1, frontier: run.frontier + 1 },
    advanced: true,
    missing: [],
  };
}

/* ------------------------------------------------------------------ */
/* Subject and draft-generation support                                */
/* ------------------------------------------------------------------ */

/** Resolve the human-readable subject of the process ("Contoso", "the client"). */
export function resolveSubject(definition, run) {
  const s = definition.subject;
  if (!s) return "the subject";
  const entry = run.stepState[s.stepId];
  const val = entry && entry.outputs && entry.outputs[s.outputId];
  return (val && String(val[s.field] || "").trim()) || s.fallback || "the subject";
}

/** Serialize one step's outputs into a labeled text block, or null if empty. */
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
      parts.push(`Attached file: ${val.name}\n${(val.content || "").slice(0, 2000)}`);
  });
  if (!parts.length) return null;
  return `### ${subStage.mainName} / ${subStage.name} / ${step.name}\n${parts
    .join("\n")
    .slice(0, maxChars)}`;
}

/** Compile all completed outputs from sub-stages before uptoIdx into one context string. */
export function buildContext(subStages, run, uptoIdx) {
  const blocks = [];
  for (let i = 0; i < uptoIdx; i++) {
    const gateType = gateTypeOf(subStages[i]);
    (subStages[i].steps || []).forEach((step) => {
      if (!isStepComplete(step, getStepEntry(run, step.id), gateType)) return;
      const block = serializeStep(subStages[i], step, run);
      if (block) blocks.push(block);
    });
  }
  return blocks.join("\n\n");
}

/**
 * Build a provider-agnostic prompt for drafting a step's text output.
 * Pass the result to any LLM; the engine does not call one itself.
 */
export function buildDraftPrompt(definition, subStages, run, subIdx, step) {
  const subStage = subStages[subIdx];
  const subject = resolveSubject(definition, run);
  const ctx = buildContext(subStages, run, subIdx);
  return [
    `You are assisting inside a staged workflow named "${definition.name}". This process concerns ${subject}.`,
    `Current stage: ${subStage.mainName} > ${subStage.name}. Current step: ${step.name} (${step.description || ""}).`,
    ctx
      ? `Outputs produced so far:\n\n${ctx}`
      : `No prior outputs exist yet; produce a strong first draft from general best practice.`,
    `Task: ${step.aiPrompt || `Draft the output for the step "${step.name}".`}`,
    `Refer to ${subject} by name where natural. Respond with the draft output only, concise and usable. No preamble.`,
  ].join("\n\n");
}

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  flattenSubStages,
  validateDefinition,
  createRun,
  setOutput,
  getStepEntry,
  isStepComplete,
  buildContext,
  buildDraftPrompt,
  serializeStep,
} from "../src/index.js";
import { FIXTURE } from "./fixtures/workflow.js";

// ---- shared helpers (consumer-style, proving core never needs the format) ----
const MATERIALS =
  "=== [input-001] a.md ===\n\nalpha body\n\n=== [input-002] b.md ===\n\nbeta body";
function splitByHeader(text) {
  const re = /^=== \[(input-\d{3})\] .*$/gm;
  const marks = [];
  let m;
  while ((m = re.exec(text))) marks.push({ id: m[1], start: m.index });
  return marks.map((mk, i) => ({
    id: mk.id,
    slice: text.slice(mk.start, i + 1 < marks.length ? marks[i + 1].start : text.length),
  }));
}
const keepOnly = (text, ids) =>
  splitByHeader(text)
    .filter((s) => ids.has(s.id))
    .map((s) => s.slice)
    .join("")
    .trimEnd();

test("validateDefinition accepts a non-empty contextView on a step", () => {
  // FIXTURE's approve step carries contextView: "select" (added in this task's fixture edit).
  assert.deepEqual(validateDefinition(FIXTURE), []);
});

test("validateDefinition rejects an empty or non-string contextView", () => {
  const bad = structuredClone(FIXTURE);
  // approve is the single step in omega/signoff
  bad.mainStages[1].subStages[0].steps[0].contextView = "  ";
  assert.ok(
    validateDefinition(bad).some((p) => /contextView must be a non-empty string/.test(p)),
    "empty contextView must be reported"
  );
  const bad2 = structuredClone(FIXTURE);
  bad2.mainStages[1].subStages[0].steps[0].contextView = 5;
  assert.ok(validateDefinition(bad2).some((p) => /contextView must be a non-empty string/.test(p)));
});

test("serializeStep applies a view to each output value before formatting", () => {
  const subs = flattenSubStages(FIXTURE);
  const collect = subs.find((s) => (s.steps || []).some((st) => st.id === "summary"));
  const summary = collect.steps.find((st) => st.id === "summary");
  let run = createRun();
  run = setOutput(run, "summary", "out", MATERIALS);

  // no view -> full materials, both inputs present
  const full = serializeStep(collect, summary, run, { maxChars: Infinity });
  assert.match(full, /\[input-001\]/);
  assert.match(full, /\[input-002\]/);

  // view keeping only input-001
  const view = (value, spec, ctx) =>
    ctx.sourceStepId === "summary" ? keepOnly(value, new Set(["input-001"])) : value;
  const trimmed = serializeStep(collect, summary, run, { maxChars: Infinity, view, targetStepId: "approve" });
  assert.match(trimmed, /\[input-001\] a\.md/); // header bytes preserved
  assert.doesNotMatch(trimmed, /\[input-002\]/); // dropped
  assert.match(trimmed, /alpha body/);
  assert.doesNotMatch(trimmed, /beta body/);
});

test("serializeStep view receives sourceStepId and targetStepId", () => {
  const subs = flattenSubStages(FIXTURE);
  const collect = subs.find((s) => (s.steps || []).some((st) => st.id === "summary"));
  const summary = collect.steps.find((st) => st.id === "summary");
  let run = createRun();
  run = setOutput(run, "summary", "out", "x");
  let seen = null;
  const view = (value, spec, ctx) => {
    seen = ctx;
    return value;
  };
  serializeStep(collect, summary, run, { view, targetStepId: "approve" });
  assert.equal(seen.sourceStepId, "summary");
  assert.equal(seen.targetStepId, "approve");
  assert.equal(seen.run, run);
});

test("serializeStep view returning an empty value drops the block", () => {
  const subs = flattenSubStages(FIXTURE);
  const collect = subs.find((s) => (s.steps || []).some((st) => st.id === "summary"));
  const summary = collect.steps.find((st) => st.id === "summary");
  let run = createRun();
  run = setOutput(run, "summary", "out", MATERIALS);
  const view = () => ""; // suppress
  assert.equal(serializeStep(collect, summary, run, { view, targetStepId: "approve" }), null);
});

test("serializeStep selection runs before the maxChars truncation", () => {
  const subs = flattenSubStages(FIXTURE);
  const collect = subs.find((s) => (s.steps || []).some((st) => st.id === "summary"));
  const summary = collect.steps.find((st) => st.id === "summary");
  let run = createRun();
  run = setOutput(run, "summary", "out", MATERIALS);
  // a view that returns a 40-char string; budget of 10 must still truncate the SELECTED text
  const view = () => "0123456789abcdefghijklmnopqrstuvwxyzABCD";
  const block = serializeStep(collect, summary, run, { maxChars: 10, view, targetStepId: "approve" });
  assert.match(block, /\n\[truncated\]$/);
  assert.match(block, /0123456789\n\[truncated\]$/);
});

test("serializeStep without a view is unchanged", () => {
  const subs = flattenSubStages(FIXTURE);
  const collect = subs.find((s) => (s.steps || []).some((st) => st.id === "summary"));
  const summary = collect.steps.find((st) => st.id === "summary");
  let run = createRun();
  run = setOutput(run, "summary", "out", MATERIALS);
  assert.equal(
    serializeStep(collect, summary, run, { maxChars: Infinity }),
    serializeStep(collect, summary, run, { maxChars: Infinity, view: undefined, targetStepId: "approve" })
  );
});

// helper: flat index of the sub-stage containing a step
const idxOf = (subs, stepId) => subs.findIndex((s) => (s.steps || []).some((st) => st.id === stepId));
const views = {
  select: (value, spec, ctx) =>
    ctx.sourceStepId === "summary" ? keepOnly(value, new Set(["input-001"])) : value,
  suppress: (value, spec, ctx) => (ctx.sourceStepId === "summary" ? "" : value),
};

test("buildContext resolves the target's contextView and trims that source", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "summary", "out", MATERIALS);
  const ai = idxOf(subs, "approve");

  // no contextViews -> full materials (today's behavior)
  const full = buildContext(subs, run, ai, "approve");
  assert.match(full, /\[input-001\]/);
  assert.match(full, /\[input-002\]/);

  // contextViews + approve.contextView "select" -> only input-001
  const selected = buildContext(subs, run, ai, "approve", { contextViews: views });
  assert.match(selected, /\[input-001\] a\.md/);
  assert.doesNotMatch(selected, /\[input-002\]/);
});

test("buildContext view is a no-op when the name is unresolvable or absent", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "summary", "out", MATERIALS);
  const ai = idxOf(subs, "approve");
  const full = buildContext(subs, run, ai, "approve");

  // contextViews present but the name "select" missing from the map
  assert.equal(buildContext(subs, run, ai, "approve", { contextViews: {} }), full);
  // a step without a contextView (evidence) is unaffected even with a map present
  const ei = idxOf(subs, "evidence");
  assert.equal(
    buildContext(subs, run, ei, "evidence", { contextViews: views }),
    buildContext(subs, run, ei, "evidence")
  );
  // empty excludeStepId resolves no view
  assert.equal(buildContext(subs, run, ai, "", { contextViews: views }), buildContext(subs, run, ai, ""));
});

test("buildContext suppress view drops the materials block entirely", () => {
  let run = createRun();
  run = setOutput(run, "summary", "out", MATERIALS);
  // re-target approve's contextView to "suppress" via a cloned definition
  const def = structuredClone(FIXTURE);
  def.mainStages[1].subStages[0].steps[0].contextView = "suppress";
  const subs2 = flattenSubStages(def);
  const ai = idxOf(subs2, "approve");
  const ctx = buildContext(subs2, run, ai, "approve", { contextViews: views });
  assert.doesNotMatch(ctx, /Summary/); // the summary block (its only content was materials) is gone
  assert.doesNotMatch(ctx, /input-001/);
});

test("buildContext non-targeted prior outputs pass through unchanged under a view", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "summary", "out", MATERIALS);
  run = setOutput(run, "inventory", "data", [{ note: "keep me" }]);
  const ai = idxOf(subs, "approve");
  const ctx = buildContext(subs, run, ai, "approve", { contextViews: views });
  // summary trimmed, but inventory (sourceStepId !== "summary") is untouched
  assert.match(ctx, /keep me/);
  assert.doesNotMatch(ctx, /\[input-002\]/);
});

test("a view trimming a source does not change run state or validator-gated completion", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "summary", "out", MATERIALS);
  run = setOutput(run, "inventory", "data", [{ ref: "input-002" }]);
  const before = structuredClone(run);
  // traceable: each inventory ref must appear in summary's FULL materials, read via ctx.run
  const validators = {
    traceable: (value, spec, { run }) => {
      const mat = getStepEntry(run, "summary").outputs.out || "";
      return value.every((it) => mat.includes(`[${it.ref}]`)) ? null : "ref not in materials";
    },
  };
  const ai = idxOf(subs, "approve");
  const ctx = buildContext(subs, run, ai, "approve", { contextViews: views, validators });

  // the view never mutates the run
  assert.deepEqual(run, before);
  // inventory cites input-002, which the view dropped from summary's serialized slice...
  assert.doesNotMatch(ctx, /\[input-002\] b\.md/);
  // ...but inventory is still complete & included, because the validator reads run state (full materials)
  const inv = subs.flatMap((s) => s.steps || []).find((st) => st.id === "inventory");
  assert.equal(isStepComplete(inv, getStepEntry(run, "inventory"), "hybrid", validators, run), true);
  assert.match(ctx, /Inventory/); // inventory block present (its validator passed on the intact run)
});

test("buildDraftPrompt threads contextViews end-to-end", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "summary", "out", MATERIALS);
  const approve = subs.flatMap((s) => s.steps || []).find((st) => st.id === "approve");
  const ai = idxOf(subs, "approve");
  const prompt = buildDraftPrompt(FIXTURE, subs, run, ai, approve, { contextViews: views });
  assert.match(prompt, /\[input-001\]/);
  assert.doesNotMatch(prompt, /\[input-002\]/);
  // omitted contextViews -> full materials in the prompt
  const fullPrompt = buildDraftPrompt(FIXTURE, subs, run, ai, approve);
  assert.match(fullPrompt, /\[input-002\]/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  flattenSubStages,
  validateDefinition,
  createRun,
  setOutput,
  setCheckedDone,
  isStepComplete,
  getStepEntry,
  gateProgress,
  mainGateProgress,
  browse,
  jumpTo,
  advance,
  resolveSubject,
  buildContext,
  buildDraftPrompt,
  hasValue,
  serializeStep,
  reopenStep,
  isOutputGenerated,
  stepHasAnyOutput,
  skipSubStage,
  unskipSubStage,
  isSubStageSkipped,
  runSummary,
} from "../src/index.js";
import { FIXTURE } from "./fixtures/workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const defsDir = join(here, "..", "..", "..", "definitions");

test("all bundled definitions validate", () => {
  const names = readdirSync(defsDir).filter((n) => n.endsWith(".json"));
  assert.ok(names.length > 0, "definitions/ contains no .json files");
  for (const name of names) {
    const def = JSON.parse(readFileSync(join(defsDir, name), "utf8"));
    const problems = validateDefinition(def);
    assert.deepEqual(problems, [], `${name}: ${problems.join("; ")}`);
  }
});

test("the test fixture validates", () => {
  assert.deepEqual(validateDefinition(FIXTURE), []);
});

test("flatten produces an ordered sequence with main stage annotations", () => {
  const subs = flattenSubStages(FIXTURE);
  assert.equal(subs.length, 3);
  assert.equal(subs[0].id, "start");
  assert.equal(subs[0].mainName, "Alpha");
  assert.equal(subs[subs.length - 1].mainName, "Omega");
});

test("hybrid gate: output alone completes a step; strict requires explicit done", () => {
  const subs = flattenSubStages(FIXTURE);
  const collect = subs.find((s) => s.id === "collect");
  const summary = collect.steps.find((s) => s.id === "summary");
  const evidence = collect.steps.find((s) => s.id === "evidence");

  let run = createRun();
  run = setOutput(run, "summary", "out", "Evidence points one way.");
  assert.equal(isStepComplete(summary, getStepEntry(run, "summary"), "hybrid"), true);
  assert.equal(isStepComplete(summary, getStepEntry(run, "summary"), "strict"), false);

  run = setOutput(run, "evidence", "doc", { name: "report.pdf", content: "" });
  assert.equal(isStepComplete(evidence, getStepEntry(run, "evidence"), "hybrid"), true);

  run = setCheckedDone(run, "summary", true);
  assert.equal(isStepComplete(summary, getStepEntry(run, "summary"), "strict"), true);
});

test("gateProgress reports missing required steps by name", () => {
  const subs = flattenSubStages(FIXTURE);
  const start = subs[0];
  let run = createRun();
  let p = gateProgress(start, run);
  assert.equal(p.met, false);
  assert.equal(p.total, 2);
  assert.ok(p.missing.includes("Intake"));
  assert.ok(p.missing.includes("Kickoff"));

  run = setOutput(run, "intake", "facts", { client: "Vexel Tools" });
  run = setCheckedDone(run, "kickoff", true);
  p = gateProgress(start, run);
  assert.equal(p.met, true);
  assert.deepEqual(p.missing, []);
});

test("browse moves freely within the frontier main stage", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = browse(run, subs, 1); // Collect, same main stage: free
  assert.equal(run.idx, 1);
  assert.equal(run.frontier, 0);
  run = browse(run, subs, 1); // Sign-off is the next main stage: no-op
  assert.equal(run.idx, 1);
  run = browse(run, subs, -1);
  assert.equal(run.idx, 0);
  run = browse(run, subs, -1); // below zero: no-op
  assert.equal(run.idx, 0);
});

test("jumpTo respects the frontier main stage boundary", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = jumpTo(run, subs, 1);
  assert.equal(run.idx, 1);
  run = jumpTo(run, subs, 2); // beyond the frontier main stage: no-op
  assert.equal(run.idx, 1);
  run = jumpTo(run, subs, 0);
  assert.equal(run.idx, 0);
});

test("advance gates on the whole stage and reports qualified missing names", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "intake", "facts", { client: "Vexel Tools" });
  run = setCheckedDone(run, "kickoff", true);

  let result = advance(run, subs); // Evidence (on the Collect card) still missing
  assert.equal(result.advanced, false);
  assert.deepEqual(result.missing, ["Collect: Evidence"]);

  run = setOutput(run, "evidence", "doc", { name: "report.pdf", content: "" });
  result = advance(run, subs);
  assert.equal(result.advanced, true);
  assert.equal(result.run.frontier, 1);
  assert.equal(result.run.idx, 2); // first card of the committed stage
});

test("advance is legal from any card within the frontier stage", () => {
  const subs = flattenSubStages(FIXTURE);
  const run = createRun(); // idx 0 is not the stage's last card
  const result = advance(run, subs, { force: true });
  assert.equal(result.advanced, true);
  assert.equal(result.run.idx, 2);
  assert.equal(result.run.frontier, 1);
});

test("advancing while browsing a committed stage is a no-op", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = advance(run, subs, { force: true }).run;
  run = jumpTo(run, subs, 1); // back into committed Alpha
  const result = advance(run, subs, { force: true });
  assert.equal(result.advanced, false);
  assert.equal(result.run.frontier, 1);
});

test("advance at the last main stage is a no-op", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = advance(run, subs, { force: true }).run;
  const result = advance(run, subs, { force: true });
  assert.equal(result.advanced, false);
  assert.equal(result.run.frontier, 1);
});

test("mainGateProgress aggregates across sub-stages; single-sub stages read plain", () => {
  let run = createRun();
  let p = mainGateProgress(FIXTURE.mainStages[0], run);
  assert.equal(p.met, false);
  assert.equal(p.total, 3); // Intake, Kickoff, Evidence
  assert.deepEqual(p.missing, ["Start: Intake", "Start: Kickoff", "Collect: Evidence"]);

  run = setOutput(run, "intake", "facts", { client: "Vexel Tools" });
  run = setCheckedDone(run, "kickoff", true);
  run = setOutput(run, "evidence", "doc", { name: "report.pdf", content: "" });
  p = mainGateProgress(FIXTURE.mainStages[0], run);
  assert.equal(p.met, true);
  assert.equal(p.done, 3);
  assert.deepEqual(p.missing, []);

  p = mainGateProgress(FIXTURE.mainStages[1], run);
  assert.equal(p.met, false);
  assert.deepEqual(p.missing, ["Approve"]); // unqualified: one sub-stage
});

test("a strict sub-stage blocks its stage boundary until explicitly done", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = advance(run, subs, { force: true }).run; // commit to Omega
  run = setOutput(run, "approve", "memo", "Looks good.");
  assert.equal(mainGateProgress(FIXTURE.mainStages[1], run).met, false);
  run = setCheckedDone(run, "approve", true);
  assert.equal(mainGateProgress(FIXTURE.mainStages[1], run).met, true);
});

test("subject resolves from the configured field with fallback", () => {
  let run = createRun();
  assert.equal(resolveSubject(FIXTURE, run), "the account");
  run = setOutput(run, "intake", "facts", { client: "Vexel Tools" });
  assert.equal(resolveSubject(FIXTURE, run), "Vexel Tools");
});

test("buildContext includes completed siblings in the current stage, excluding the drafted step", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "intake", "facts", { client: "Vexel Tools", industry: "Tooling" });
  run = setOutput(run, "summary", "out", "Evidence points one way.");

  // From the first card, the completed Summary on a LATER sibling card is context.
  const ctx = buildContext(subs, run, 0);
  assert.match(ctx, /Vexel Tools/);
  assert.match(ctx, /Evidence points one way\./);

  // Drafting Summary itself excludes it but keeps its siblings.
  const forSummary = buildContext(subs, run, 1, "summary");
  assert.match(forSummary, /Vexel Tools/);
  assert.doesNotMatch(forSummary, /Evidence points one way\./);
});

test("buildContext excludes later main stages", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "approve", "memo", "Looks good.");
  run = setCheckedDone(run, "approve", true); // strict gate: now complete
  assert.doesNotMatch(buildContext(subs, run, 0), /Looks good\./);
  assert.match(buildContext(subs, run, 2), /Looks good\./);
});

test("buildDraftPrompt carries sibling context and the step task", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "intake", "facts", { client: "Vexel Tools", industry: "Tooling" });
  const summary = subs[1].steps.find((s) => s.id === "summary");
  const prompt = buildDraftPrompt(FIXTURE, subs, run, 1, summary);
  assert.match(prompt, /Vexel Tools/);
  assert.match(prompt, /Summarize the evidence\./);
});

test("hasValue treats empty values as absent across output types", () => {
  assert.equal(hasValue({ type: "text" }, "   "), false);
  assert.equal(hasValue({ type: "text" }, "x"), true);
  assert.equal(hasValue({ type: "link" }, ""), false);
  assert.equal(hasValue({ type: "fields" }, { a: "", b: " " }), false);
  assert.equal(hasValue({ type: "fields" }, { a: "v" }), true);
  assert.equal(hasValue({ type: "file" }, {}), false);
  assert.equal(hasValue({ type: "file" }, { name: "f.pdf" }), true);
});

test("validateDefinition catches structural problems", () => {
  const bad = {
    id: "x",
    name: "X",
    mainStages: [
      {
        id: "m",
        name: "M",
        subStages: [
          {
            id: "s",
            name: "S",
            gate: { type: "loose" },
            steps: [
              { id: "a", name: "A", outputs: [{ id: "o", type: "blob" }] },
              { id: "a", name: "A dup" },
            ],
          },
        ],
      },
    ],
  };
  const problems = validateDefinition(bad);
  assert.ok(problems.some((p) => p.includes("gate.type")));
  assert.ok(problems.some((p) => p.includes("unknown output type")));
  assert.ok(problems.some((p) => p.includes("duplicate step id")));
});

test("validateDefinition accepts the data output type", () => {
  const def = {
    id: "d", name: "D",
    mainStages: [{ id: "m", subStages: [{ id: "s", steps: [
      { id: "st", outputs: [{ id: "o", type: "data", label: "Payload" }] },
    ] }] }],
  };
  assert.deepEqual(validateDefinition(def), []);
});

test("validateDefinition checks render hints", () => {
  const mk = (render) => ({
    id: "d", name: "D",
    mainStages: [{ id: "m", subStages: [{ id: "s", steps: [
      { id: "st", outputs: [{ id: "o", type: "text", label: "T", render }] },
    ] }] }],
  });
  assert.deepEqual(validateDefinition(mk({ kind: "markdown" })), []);
  assert.deepEqual(validateDefinition(mk({ kind: "erd", options: { tables: "x" } })), []);
  assert.ok(validateDefinition(mk({})).some((p) => p.includes("render.kind")));
  assert.ok(validateDefinition(mk({ kind: "" })).some((p) => p.includes("render.kind")));
  assert.ok(validateDefinition(mk({ kind: "x", options: "nope" })).some((p) => p.includes("render.options")));
  assert.ok(validateDefinition(mk("markdown")).some((p) => p.includes("render")));
});

test("hasValue for data outputs", () => {
  const spec = { id: "o", type: "data" };
  assert.equal(hasValue(spec, null), false);
  assert.equal(hasValue(spec, undefined), false);
  assert.equal(hasValue(spec, []), false);
  assert.equal(hasValue(spec, {}), false);
  assert.equal(hasValue(spec, ""), false);
  assert.equal(hasValue(spec, "  "), false);
  assert.equal(hasValue(spec, [1]), true);
  assert.equal(hasValue(spec, { a: 1 }), true);
  assert.equal(hasValue(spec, "x"), true);
  assert.equal(hasValue(spec, 0), true);
});

test("serializeStep serializes data outputs as capped JSON", () => {
  const sub = { mainName: "M", name: "S" };
  const step = { id: "st", name: "Step", outputs: [{ id: "o", type: "data", label: "Inventory" }] };
  let run = createRun();
  run = setOutput(run, "st", "o", { tables: [{ name: "Account" }] });
  const block = serializeStep(sub, step, run);
  assert.ok(block.includes("Inventory:"));
  assert.ok(block.includes('{"tables":[{"name":"Account"}]}'));
  run = setOutput(run, "st", "o", { big: "x".repeat(5000) });
  const capped = serializeStep(sub, step, run);
  assert.ok(capped.length < 2700);
});

test("reopenStep suppresses content completion under a hybrid gate", () => {
  const subs = flattenSubStages(FIXTURE);
  const collect = subs.find((s) => s.id === "collect");
  const summary = collect.steps.find((s) => s.id === "summary");

  let run = createRun();
  run = setOutput(run, "summary", "out", "A summary.");
  assert.equal(isStepComplete(summary, getStepEntry(run, "summary"), "hybrid"), true);

  run = reopenStep(run, "summary");
  assert.equal(isStepComplete(summary, getStepEntry(run, "summary"), "hybrid"), false);
});

test("editing an output clears the reopened flag", () => {
  const subs = flattenSubStages(FIXTURE);
  const summary = subs.find((s) => s.id === "collect").steps.find((s) => s.id === "summary");

  let run = createRun();
  run = setOutput(run, "summary", "out", "A summary.");
  run = reopenStep(run, "summary");
  run = setOutput(run, "summary", "out", "A better summary.");
  assert.equal(getStepEntry(run, "summary").reopened, undefined);
  assert.equal(isStepComplete(summary, getStepEntry(run, "summary"), "hybrid"), true);
});

test("re-marking done clears the reopened flag", () => {
  const subs = flattenSubStages(FIXTURE);
  const summary = subs.find((s) => s.id === "collect").steps.find((s) => s.id === "summary");

  let run = createRun();
  run = setOutput(run, "summary", "out", "A summary.");
  run = reopenStep(run, "summary");
  run = setCheckedDone(run, "summary", true);
  assert.equal(getStepEntry(run, "summary").reopened, undefined);
  assert.equal(isStepComplete(summary, getStepEntry(run, "summary"), "hybrid"), true);
  assert.equal(isStepComplete(summary, getStepEntry(run, "summary"), "strict"), true);
});

test("strict gates ignore the reopened flag", () => {
  const subs = flattenSubStages(FIXTURE);
  const approve = subs.find((s) => s.id === "signoff").steps.find((s) => s.id === "approve");

  let run = createRun();
  run = setOutput(run, "approve", "memo", "Looks good.");
  assert.equal(isStepComplete(approve, getStepEntry(run, "approve"), "strict"), false);

  run = reopenStep(run, "approve");
  assert.equal(isStepComplete(approve, getStepEntry(run, "approve"), "strict"), false);

  run = setCheckedDone(run, "approve", true);
  assert.equal(isStepComplete(approve, getStepEntry(run, "approve"), "strict"), true);
});

test("gateProgress counts a reopened required step as missing", () => {
  const subs = flattenSubStages(FIXTURE);
  const collect = subs.find((s) => s.id === "collect");

  let run = createRun();
  run = setOutput(run, "evidence", "doc", { name: "report.pdf", content: "" });
  assert.equal(gateProgress(collect, run).met, true);

  run = reopenStep(run, "evidence");
  const p = gateProgress(collect, run);
  assert.equal(p.met, false);
  assert.ok(p.missing.includes("Evidence"));
});

test("buildContext excludes a reopened step's outputs", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "intake", "facts", { client: "Vexel Tools" });
  assert.match(buildContext(subs, run, 0), /Vexel Tools/);

  run = reopenStep(run, "intake");
  assert.doesNotMatch(buildContext(subs, run, 0), /Vexel Tools/);
});

test("reopenStep on an untouched step creates a safe entry", () => {
  const subs = flattenSubStages(FIXTURE);
  const summary = subs.find((s) => s.id === "collect").steps.find((s) => s.id === "summary");

  const run = reopenStep(createRun(), "summary");
  const entry = getStepEntry(run, "summary");
  assert.equal(entry.checkedDone, false);
  assert.equal(entry.reopened, true);
  assert.deepEqual(entry.outputs, {});
  assert.equal(isStepComplete(summary, entry, "hybrid"), false);
});

test("a generated write marks the output; a plain write clears it", () => {
  let run = createRun();
  run = setOutput(run, "summary", "out", "Draft.", { generated: true });
  assert.equal(isOutputGenerated(run, "summary", "out"), true);

  run = setOutput(run, "summary", "out", "Edited by hand.");
  assert.equal(isOutputGenerated(run, "summary", "out"), false);
});

test("regenerating after a hand edit re-marks the output", () => {
  let run = createRun();
  run = setOutput(run, "summary", "out", "Draft.", { generated: true });
  run = setOutput(run, "summary", "out", "Edited.");
  run = setOutput(run, "summary", "out", "Draft two.", { generated: true });
  assert.equal(isOutputGenerated(run, "summary", "out"), true);
});

test("the generated mark does not change serialization", () => {
  const subs = flattenSubStages(FIXTURE);
  const collect = subs.find((s) => s.id === "collect");
  const summary = collect.steps.find((s) => s.id === "summary");

  let typed = createRun();
  typed = setOutput(typed, "summary", "out", "Same text.");
  let generated = createRun();
  generated = setOutput(generated, "summary", "out", "Same text.", { generated: true });

  assert.equal(serializeStep(collect, summary, typed), serializeStep(collect, summary, generated));
  assert.equal(buildContext(subs, typed, 2), buildContext(subs, generated, 2));
});

test("a generated write clears the reopened flag", () => {
  const subs = flattenSubStages(FIXTURE);
  const summary = subs.find((s) => s.id === "collect").steps.find((s) => s.id === "summary");

  let run = createRun();
  run = setOutput(run, "summary", "out", "A summary.");
  run = reopenStep(run, "summary");
  run = setOutput(run, "summary", "out", "Regenerated.", { generated: true });
  assert.equal(getStepEntry(run, "summary").reopened, undefined);
  assert.equal(isStepComplete(summary, getStepEntry(run, "summary"), "hybrid"), true);
});

test("skipSubStage records only legal skips", () => {
  const subs = flattenSubStages(FIXTURE);
  const run = createRun();
  assert.equal(skipSubStage(run, subs, "nope"), run); // unknown id
  assert.equal(skipSubStage(run, subs, "start"), run); // not skippable
  const skipped = skipSubStage(run, subs, "collect");
  assert.equal(isSubStageSkipped(skipped, "collect"), true);
  assert.equal(isSubStageSkipped(skipped, "start"), false);
  assert.equal(skipSubStage(skipped, subs, "collect"), skipped); // idempotent
});

test("skipping beyond the frontier is a no-op", () => {
  const def = {
    id: "d", name: "D",
    mainStages: [
      { id: "m1", subStages: [{ id: "a", name: "A", steps: [] }] },
      { id: "m2", subStages: [{ id: "b", name: "B", skippable: true, steps: [] }] },
    ],
  };
  const subs = flattenSubStages(def);
  const run = createRun();
  assert.equal(skipSubStage(run, subs, "b"), run); // m2 not committed yet
  const committed = advance(run, subs, { force: true }).run;
  assert.equal(isSubStageSkipped(skipSubStage(committed, subs, "b"), "b"), true);
});

test("unskip restores state and drops the empty map", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "evidence", "doc", { name: "report.pdf", content: "" });
  assert.equal(unskipSubStage(run, subs, "collect"), run); // not skipped: no-op
  run = skipSubStage(run, subs, "collect");
  assert.equal(getStepEntry(run, "evidence").outputs.doc.name, "report.pdf"); // skip never touches stepState
  run = unskipSubStage(run, subs, "collect");
  assert.equal(isSubStageSkipped(run, "collect"), false);
  assert.equal(run.skips, undefined); // absent when empty
  const collect = subs.find((s) => s.id === "collect");
  const evidence = collect.steps.find((s) => s.id === "evidence");
  assert.equal(stepHasAnyOutput(evidence, getStepEntry(run, "evidence")), true);
});

test("a skipped sub-stage is excluded from the stage boundary gate", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "intake", "facts", { client: "Vexel Tools" });
  run = setCheckedDone(run, "kickoff", true);
  assert.equal(mainGateProgress(FIXTURE.mainStages[0], run).met, false); // Evidence missing

  run = skipSubStage(run, subs, "collect");
  const p = mainGateProgress(FIXTURE.mainStages[0], run);
  assert.equal(p.met, true);
  assert.equal(p.total, 2); // Intake, Kickoff only
  assert.deepEqual(p.missing, []);

  const result = advance(run, subs); // no force needed
  assert.equal(result.advanced, true);
  assert.equal(result.run.frontier, 1);
});

test("a skipped strict sub-stage no longer blocks the boundary", () => {
  const def = {
    id: "d", name: "D",
    mainStages: [
      {
        id: "m1",
        subStages: [
          { id: "a", name: "A", steps: [] },
          {
            id: "b", name: "B", skippable: true, gate: { type: "strict" },
            steps: [{ id: "s1", name: "S1", required: true }],
          },
        ],
      },
      { id: "m2", subStages: [{ id: "c", name: "C", steps: [] }] },
    ],
  };
  const subs = flattenSubStages(def);
  let run = createRun();
  assert.equal(mainGateProgress(def.mainStages[0], run).met, false);
  run = skipSubStage(run, subs, "b");
  assert.equal(mainGateProgress(def.mainStages[0], run).met, true);
  assert.equal(advance(run, subs).advanced, true);
});

test("missing names stay qualified by the stage's total sub-stage count", () => {
  const def = {
    id: "d", name: "D",
    mainStages: [
      {
        id: "m1",
        subStages: [
          { id: "a", name: "A", steps: [{ id: "s1", name: "S1", required: true }] },
          { id: "b", name: "B", skippable: true, steps: [{ id: "s2", name: "S2", required: true }] },
        ],
      },
    ],
  };
  const subs = flattenSubStages(def);
  const run = skipSubStage(createRun(), subs, "b");
  assert.deepEqual(mainGateProgress(def.mainStages[0], run).missing, ["A: S1"]);
});

test("a stage with every sub-stage skipped is trivially met", () => {
  const def = {
    id: "d", name: "D",
    mainStages: [
      {
        id: "m1",
        subStages: [
          { id: "a", name: "A", skippable: true, steps: [{ id: "s1", name: "S1", required: true }] },
        ],
      },
      { id: "m2", subStages: [{ id: "c", name: "C", steps: [] }] },
    ],
  };
  const subs = flattenSubStages(def);
  const run = skipSubStage(createRun(), subs, "a");
  const p = mainGateProgress(def.mainStages[0], run);
  assert.deepEqual(p, { met: true, done: 0, total: 0, missing: [] });
  assert.equal(advance(run, subs).advanced, true);
});

test("runSummary excludes skipped sub-stages", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  assert.deepEqual(runSummary(FIXTURE, run), { met: 0, total: 3 });
  run = skipSubStage(run, subs, "collect");
  assert.deepEqual(runSummary(FIXTURE, run), { met: 0, total: 2 });
});

test("validateDefinition checks skippable and duplicate sub-stage ids", () => {
  const mk = (subStages) => ({ id: "d", name: "D", mainStages: [{ id: "m", subStages }] });
  assert.deepEqual(validateDefinition(mk([{ id: "s", skippable: true, steps: [] }])), []);
  assert.ok(
    validateDefinition(mk([{ id: "s", skippable: "yes", steps: [] }])).some((p) =>
      p.includes("skippable")
    )
  );
  assert.ok(
    validateDefinition(mk([{ id: "s", steps: [] }, { id: "s", steps: [] }])).some((p) =>
      p.includes('duplicate sub-stage id "s"')
    )
  );
});

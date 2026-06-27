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
  draftTarget,
  parseDraft,
  hasValue,
  serializeStep,
  reopenStep,
  isOutputGenerated,
  stepHasAnyOutput,
  skipSubStage,
  unskipSubStage,
  autoSkipSubStage,
  clearAutoSkipSubStage,
  isSubStageSkipped,
  runSummary,
  wasAdvanceForced,
  skipTrack,
  unskipTrack,
  isTrackSkipped,
  isRunComplete,
  trackStatus,
  validateOutputValue,
} from "../src/index.js";
import { FIXTURE } from "./fixtures/workflow.js";
import { FORKED } from "./fixtures/forked.js";

const here = dirname(fileURLToPath(import.meta.url));
const defsDir = join(here, "..", "..", "..", "definitions");

/* Resolves the fixture's validate: "facts" name in validator tests. */
const FACTS_VALIDATORS = {
  facts: (value) => (String(value.client || "").trim() ? null : "Client name missing"),
};

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

test("maxCharsPerStep threads from buildDraftPrompt and buildContext to serializeStep", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "intake", "facts", { client: "Acme", industry: "x".repeat(4000) });
  const summary = subs[1].steps.find((s) => s.id === "summary");

  const capped = buildContext(subs, run, 1, "summary");
  assert.ok(capped.includes("[truncated]"), "default budget truncates the long block");

  const full = buildContext(subs, run, 1, "summary", { maxCharsPerStep: Infinity });
  assert.ok(full.includes("x".repeat(4000)), "Infinity budget passes the block whole");
  assert.ok(!full.includes("[truncated]"));

  const prompt = buildDraftPrompt(FIXTURE, subs, run, 1, summary, { maxCharsPerStep: Infinity });
  assert.ok(prompt.includes("x".repeat(4000)), "the option reaches the prompt");

  const defaultPrompt = buildDraftPrompt(FIXTURE, subs, run, 1, summary);
  assert.ok(defaultPrompt.includes("[truncated]"), "omitting the option keeps the default budget");
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

test("serializeStep truncates at maxChars with a marker, inner caps removed", () => {
  const sub = { mainName: "M", name: "S" };
  const step = { id: "st", name: "Step", outputs: [{ id: "o", type: "data", label: "Inventory" }] };
  let run = createRun();
  run = setOutput(run, "st", "o", { tables: [{ name: "Account" }] });
  const block = serializeStep(sub, step, run);
  assert.ok(block.includes("Inventory:"));
  assert.ok(block.includes('{"tables":[{"name":"Account"}]}'));
  assert.ok(!block.includes("[truncated]"));

  run = setOutput(run, "st", "o", { big: "x".repeat(5000) });
  const capped = serializeStep(sub, step, run);
  assert.ok(capped.endsWith("\n[truncated]"));
  assert.ok(capped.length < 2600);

  const unlimited = serializeStep(sub, step, run, { maxChars: Infinity });
  assert.ok(unlimited.includes("x".repeat(5000)), "Infinity disables truncation entirely");
  assert.ok(!unlimited.includes("[truncated]"));

  const tight = serializeStep(sub, step, run, { maxChars: 10 });
  assert.ok(tight.endsWith("\n[truncated]"));
});

test("serializeStep no longer inner-caps file content", () => {
  const sub = { mainName: "M", name: "S" };
  const step = { id: "st", name: "Step", outputs: [{ id: "f", type: "file", label: "Doc" }] };
  let run = createRun();
  run = setOutput(run, "st", "f", { name: "big.txt", content: "y".repeat(3000) });
  const block = serializeStep(sub, step, run, { maxChars: Infinity });
  assert.ok(block.includes("y".repeat(3000)), "file content above 2000 chars survives a big budget");
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

test("isSubStageSkipped resolves legacy, object, and absent skip entries", () => {
  const base = createRun();
  assert.equal(isSubStageSkipped(base, "collect"), false); // absent
  assert.equal(isSubStageSkipped({ ...base, skips: { collect: true } }, "collect"), true); // legacy user skip
  assert.equal(
    isSubStageSkipped({ ...base, skips: { collect: { source: "auto", skipped: true } } }, "collect"),
    true
  );
  assert.equal(
    isSubStageSkipped({ ...base, skips: { collect: { source: "user", skipped: false } } }, "collect"),
    false // a keep-in resolves as not skipped
  );
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

test("a manual keep-in is durable and never touches stepState", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "evidence", "doc", { name: "report.pdf", content: "" });
  run = skipSubStage(run, subs, "collect"); // user skip
  assert.equal(isSubStageSkipped(run, "collect"), true);
  assert.equal(getStepEntry(run, "evidence").outputs.doc.name, "report.pdf"); // skip never touches stepState
  run = unskipSubStage(run, subs, "collect"); // manual keep-in: records, does not delete
  assert.equal(isSubStageSkipped(run, "collect"), false);
  assert.deepEqual(run.skips.collect, { source: "user", skipped: false });
  const collect = subs.find((s) => s.id === "collect");
  const evidence = collect.steps.find((s) => s.id === "evidence");
  assert.equal(stepHasAnyOutput(evidence, getStepEntry(run, "evidence")), true); // outputs survive
});

test("a manual keep-in on a never-decided sub-stage records a durable include", () => {
  const subs = flattenSubStages(FIXTURE);
  const run = unskipSubStage(createRun(), subs, "collect");
  assert.deepEqual(run.skips.collect, { source: "user", skipped: false });
  assert.equal(isSubStageSkipped(run, "collect"), false);
});

test("a manual skip takes ownership of an auto-skipped sub-stage", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = { ...createRun(), skips: { collect: { source: "auto", skipped: true } } };
  run = skipSubStage(run, subs, "collect"); // manual skip overrides the auto entry
  assert.equal(run.skips.collect, true);
});

test("autoSkipSubStage applies, is idempotent, and yields to a user decision", () => {
  const subs = flattenSubStages(FIXTURE);
  const once = autoSkipSubStage(createRun(), subs, "collect");
  assert.deepEqual(once.skips.collect, { source: "auto", skipped: true });
  assert.equal(isSubStageSkipped(once, "collect"), true);
  const twice = autoSkipSubStage(once, subs, "collect");
  assert.equal(twice, once); // idempotent: same reference, no cumulative effect

  const userSkip = skipSubStage(createRun(), subs, "collect"); // user skip -> true
  assert.equal(autoSkipSubStage(userSkip, subs, "collect").skips.collect, true); // user wins
});

test("a manual keep-in survives repeated auto re-evaluation", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = autoSkipSubStage(createRun(), subs, "collect");
  run = unskipSubStage(run, subs, "collect"); // person keeps it in
  assert.deepEqual(run.skips.collect, { source: "user", skipped: false });
  run = autoSkipSubStage(run, subs, "collect"); // signal still says skip; re-evaluate
  assert.equal(isSubStageSkipped(run, "collect"), false); // keep-in wins
  assert.deepEqual(run.skips.collect, { source: "user", skipped: false });
});

test("clearAutoSkipSubStage clears only an auto skip and never a user decision", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = autoSkipSubStage(createRun(), subs, "collect");
  run = clearAutoSkipSubStage(run, subs, "collect");
  assert.equal(isSubStageSkipped(run, "collect"), false);
  assert.equal(run.skips, undefined); // map dropped when empty
  assert.equal(clearAutoSkipSubStage(run, subs, "collect"), run); // idempotent no-op

  const userSkip = skipSubStage(createRun(), subs, "collect");
  assert.equal(clearAutoSkipSubStage(userSkip, subs, "collect").skips.collect, true); // user skip untouched
});

test("the automated operations respect the skip guards", () => {
  const subs = flattenSubStages(FIXTURE);
  const run = createRun();
  assert.equal(autoSkipSubStage(run, subs, "nope"), run); // unknown id
  assert.equal(autoSkipSubStage(run, subs, "start"), run); // not skippable
  const def = {
    id: "d", name: "D",
    mainStages: [
      { id: "m1", subStages: [{ id: "a", name: "A", steps: [] }] },
      { id: "m2", subStages: [{ id: "b", name: "B", skippable: true, steps: [] }] },
    ],
  };
  const subs2 = flattenSubStages(def);
  const fresh = createRun();
  assert.equal(autoSkipSubStage(fresh, subs2, "b"), fresh); // m2 beyond frontier
});

test("an auto skip is excluded from the boundary gate; a keep-in is included", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "intake", "facts", { client: "Vexel Tools" });
  run = setCheckedDone(run, "kickoff", true);
  assert.equal(mainGateProgress(FIXTURE.mainStages[0], run).met, false); // collect still open
  const autoRun = autoSkipSubStage(run, subs, "collect");
  assert.equal(mainGateProgress(FIXTURE.mainStages[0], autoRun).met, true); // auto skip excludes collect
  const keptRun = unskipSubStage(autoRun, subs, "collect");
  assert.equal(mainGateProgress(FIXTURE.mainStages[0], keptRun).met, false); // keep-in re-includes collect
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

test("a forced advance past an unmet gate is recorded", () => {
  const subs = flattenSubStages(FIXTURE);
  const result = advance(createRun(), subs, { force: true });
  assert.equal(result.advanced, true);
  assert.equal(wasAdvanceForced(result.run, 0), true);
  assert.equal(wasAdvanceForced(result.run, 1), false);
});

test("a met gate records no force, with or without the flag", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "intake", "facts", { client: "Vexel Tools" });
  run = setCheckedDone(run, "kickoff", true);
  run = setOutput(run, "evidence", "doc", { name: "report.pdf", content: "" });
  assert.equal(advance(run, subs).run.forces, undefined);
  assert.equal(advance(run, subs, { force: true }).run.forces, undefined);
});

test("resolveSubject falls back when the subject's sub-stage is skipped", () => {
  const def = {
    id: "d", name: "D",
    subject: { stepId: "s1", outputId: "o", field: "client", fallback: "the account" },
    mainStages: [
      {
        id: "m1",
        subStages: [
          {
            id: "a", name: "A", skippable: true,
            steps: [{
              id: "s1", name: "S1",
              outputs: [{ id: "o", type: "fields", fields: [{ key: "client", label: "Client" }] }],
            }],
          },
          { id: "b", name: "B", steps: [] },
        ],
      },
    ],
  };
  const subs = flattenSubStages(def);
  let run = createRun();
  run = setOutput(run, "s1", "o", { client: "Vexel Tools" });
  assert.equal(resolveSubject(def, run), "Vexel Tools");
  run = skipSubStage(run, subs, "a");
  assert.equal(resolveSubject(def, run), "the account");
  run = unskipSubStage(run, subs, "a");
  assert.equal(resolveSubject(def, run), "Vexel Tools");
});

test("buildContext excludes a skipped sub-stage's completed steps", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "summary", "out", "Evidence points one way.");
  assert.match(buildContext(subs, run, 0), /Evidence points one way\./);

  run = skipSubStage(run, subs, "collect");
  assert.doesNotMatch(buildContext(subs, run, 0), /Evidence points one way\./);

  run = unskipSubStage(run, subs, "collect");
  assert.match(buildContext(subs, run, 0), /Evidence points one way\./);
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

test("an invalid present output makes its step incomplete, done flag included", () => {
  const step = FIXTURE.mainStages[0].subStages[0].steps[0]; // intake
  let run = createRun();
  run = setOutput(run, "intake", "facts", { industry: "Retail" });
  const entry = getStepEntry(run, "intake");
  assert.equal(isStepComplete(step, entry, "hybrid"), true, "without validators: unchanged");
  assert.equal(isStepComplete(step, entry, "hybrid", FACTS_VALIDATORS), false);

  run = setCheckedDone(run, "intake", true);
  const done = getStepEntry(run, "intake");
  assert.equal(isStepComplete(step, done, "hybrid", FACTS_VALIDATORS), false, "done cannot bless invalid");
  assert.equal(isStepComplete(step, done, "strict", FACTS_VALIDATORS), false, "strict too");

  run = setOutput(run, "intake", "facts", { client: "Acme" });
  const fixed = getStepEntry(run, "intake");
  assert.equal(isStepComplete(step, fixed, "hybrid", FACTS_VALIDATORS), true);
});

test("validators run only on present values and only when resolvable", () => {
  const step = FIXTURE.mainStages[0].subStages[0].steps[0]; // intake
  let calls = 0;
  const counting = { facts: () => { calls += 1; return "always invalid"; } };

  const empty = getStepEntry(createRun(), "intake");
  assert.equal(isStepComplete(step, empty, "hybrid", counting), false, "incomplete for emptiness, not validity");
  assert.equal(calls, 0, "no value, validator never runs");

  const run = setOutput(createRun(), "intake", "facts", { client: "Acme" });
  const entry = getStepEntry(run, "intake");
  assert.equal(isStepComplete(step, entry, "hybrid", { other: () => "nope" }), true, "unresolvable name: unvalidated");
  assert.equal(isStepComplete(step, entry, "hybrid", {}), true, "empty map: unvalidated");
});

test("gateProgress reports invalid outputs as unmet with the validator message", () => {
  const start = FIXTURE.mainStages[0].subStages[0];
  let run = createRun();
  run = setOutput(run, "intake", "facts", { industry: "Retail" });
  run = setCheckedDone(run, "kickoff", true);

  const without = gateProgress(start, run);
  assert.equal(without.met, true, "no validators: unchanged");

  const p = gateProgress(start, run, { validators: FACTS_VALIDATORS });
  assert.equal(p.met, false);
  assert.equal(p.done, 1);
  assert.deepEqual(p.missing, ["Intake: Client name missing"]);
});

test("validators thread through the boundary gate, advance, and runSummary", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "intake", "facts", { industry: "Retail" });
  run = setCheckedDone(run, "kickoff", true);
  run = skipSubStage(run, subs, "collect");

  const main = mainGateProgress(FIXTURE.mainStages[0], run, { validators: FACTS_VALIDATORS });
  assert.equal(main.met, false);
  assert.deepEqual(main.missing, ["Start: Intake: Client name missing"]);

  const blocked = advance(run, subs, { validators: FACTS_VALIDATORS });
  assert.equal(blocked.advanced, false);
  assert.deepEqual(blocked.missing, ["Start: Intake: Client name missing"]);

  const forced = advance(run, subs, { force: true, validators: FACTS_VALIDATORS });
  assert.equal(forced.advanced, true);
  assert.equal(wasAdvanceForced(forced.run, 0), true, "force past invalid records the marker");

  const plain = advance(run, subs, {});
  assert.equal(plain.advanced, true, "without validators the gate is met");
  assert.equal(wasAdvanceForced(plain.run, 0), false);

  const sum = runSummary(FIXTURE, run, { validators: FACTS_VALIDATORS });
  assert.equal(sum.met, 0);
  assert.equal(runSummary(FIXTURE, run).met, 1, "no validators: unchanged");
});

test("buildContext excludes steps made incomplete by invalid outputs", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "intake", "facts", { client: "Acme" });
  assert.ok(buildContext(subs, run, 0, "kickoff", { validators: FACTS_VALIDATORS }).includes("Acme"));

  run = setOutput(run, "intake", "facts", { industry: "Retail" });
  assert.equal(buildContext(subs, run, 0, "kickoff", { validators: FACTS_VALIDATORS }), "");
  assert.ok(buildContext(subs, run, 0, "kickoff").includes("Retail"), "no validators: included");
});

test("validateDefinition checks the validate field", () => {
  const def = JSON.parse(JSON.stringify(FIXTURE));
  def.mainStages[0].subStages[0].steps[0].outputs[0].validate = "";
  assert.ok(validateDefinition(def).some((p) => p.includes("validate")));
  def.mainStages[0].subStages[0].steps[0].outputs[0].validate = 7;
  assert.ok(validateDefinition(def).some((p) => p.includes("validate")));
  def.mainStages[0].subStages[0].steps[0].outputs[0].validate = "anything-goes";
  assert.deepEqual(validateDefinition(def), [], "names are never whitelisted");
});

test("draftTarget picks the first text output, else the first data output", () => {
  assert.equal(draftTarget({ id: "s", outputs: [{ id: "a", type: "data" }, { id: "b", type: "text" }] }).id, "b");
  assert.equal(draftTarget({ id: "s", outputs: [{ id: "a", type: "data" }, { id: "c", type: "data" }] }).id, "a");
  assert.equal(draftTarget({ id: "s", outputs: [{ id: "a", type: "fields", fields: [] }] }), null);
  assert.equal(draftTarget({ id: "s" }), null);
});

test("parseDraft passes text through and parses data strictly with fence tolerance", () => {
  const text = { id: "o", type: "text" };
  assert.deepEqual(parseDraft(text, "  raw draft  "), { ok: true, value: "  raw draft  " });

  const data = { id: "o", type: "data" };
  assert.deepEqual(parseDraft(data, '[{"a":1}]'), { ok: true, value: [{ a: 1 }] });
  assert.deepEqual(parseDraft(data, '```json\n[{"a":1}]\n```'), { ok: true, value: [{ a: 1 }] });
  assert.deepEqual(parseDraft(data, '```\n{"a":1}\n```'), { ok: true, value: { a: 1 } });

  const bad = parseDraft(data, "here is your JSON: [1]");
  assert.equal(bad.ok, false);
  assert.ok(bad.error.startsWith("Draft is not valid JSON:"));
});

test("buildDraftPrompt instructs JSON-only replies for data targets", () => {
  const subs = flattenSubStages(FIXTURE);
  const run = createRun();
  const inventory = subs[1].steps.find((s) => s.id === "inventory");
  const summary = subs[1].steps.find((s) => s.id === "summary");
  assert.ok(buildDraftPrompt(FIXTURE, subs, run, 1, inventory).includes("Respond with valid JSON only"));
  assert.ok(buildDraftPrompt(FIXTURE, subs, run, 1, summary).includes("Respond with the draft output only"));
});

test("validators receive { run, stepId } as a third argument", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "intake", "facts", { client: "Vexel Tools" });
  let seen = null;
  const validators = {
    facts: (value, spec, ctx) => {
      seen = ctx;
      return null;
    },
  };
  gateProgress(subs[0], run, { validators });
  assert.equal(seen.stepId, "intake");
  assert.equal(seen.run, run);
});

test("validators omitted run is undefined, not missing", () => {
  let captured = "absent";
  const entry = { outputs: { facts: { client: "x" } } };
  const step = { id: "intake", outputs: [{ id: "facts", type: "fields", validate: "facts" }] };
  const validators = {
    facts: (value, spec, ctx) => {
      captured = ctx;
      return null;
    },
  };
  isStepComplete(step, entry, "hybrid", validators);
  assert.equal(captured.run, undefined);
  assert.equal(captured.stepId, "intake");
});

test("a run-aware validator rejects based on another step's output", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "intake", "facts", { client: "Vexel Tools" });
  run = setOutput(run, "inventory", "data", [{ item: "laptop" }]);
  // traceable passes only when the run's intake step names a client.
  const traceable = {
    traceable: (value, spec, { run }) => {
      const facts = getStepEntry(run, "intake").outputs.facts;
      return facts && String(facts.client || "").trim() ? null : "Inventory is untraceable: intake has no client.";
    },
  };
  const inv = FIXTURE.mainStages[0].subStages[1].steps[2];
  assert.equal(isStepComplete(inv, getStepEntry(run, "inventory"), "hybrid", traceable, run), true);

  // Clear the client: the same inventory value now fails its run-aware check.
  let run2 = createRun();
  run2 = setOutput(run2, "inventory", "data", [{ item: "laptop" }]);
  assert.equal(isStepComplete(inv, getStepEntry(run2, "inventory"), "hybrid", traceable, run2), false);
  assert.equal(buildContext(subs, run2, subs.length - 1, null, { validators: traceable }).includes("Inventory"), false);
});

test("a run-aware rejection blocks the gate and force still advances", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  // industry is present so hasValue(facts) is true and the validator runs;
  // client is blank so the run-aware check rejects.
  run = setOutput(run, "intake", "facts", { client: "", industry: "Tools" });
  run = setCheckedDone(run, "kickoff", true);
  // facts rejects when the run-derived client is blank.
  const validators = {
    facts: (value, spec, { run }) => {
      const facts = getStepEntry(run, "intake").outputs.facts;
      return facts && String(facts.client || "").trim() ? null : "Client name missing";
    },
  };
  const gp = gateProgress(subs[0], run, { validators });
  assert.equal(gp.met, false);
  assert.ok(gp.missing.some((m) => m.includes("Intake: Client name missing")));
  // advance returns { run, advanced, missing }, not the Run itself.
  const forced = advance(run, subs, { force: true, validators });
  assert.equal(forced.advanced, true);
  assert.equal(forced.run.frontier, 1);
  assert.equal(wasAdvanceForced(forced.run, 0), true);
});

test("validateDefinition checks the manual step flag", () => {
  const mk = (manual) => ({
    id: "d", name: "D",
    mainStages: [{ id: "m", subStages: [{ id: "s", steps: [
      { id: "st", manual, outputs: [{ id: "o", type: "text", label: "T" }] },
    ] }] }],
  });
  assert.deepEqual(validateDefinition(mk(true)), []);
  assert.deepEqual(validateDefinition(mk(undefined)), []);
  assert.ok(validateDefinition(mk("false")).some((p) => p.includes("manual must be a boolean")));
  assert.ok(validateDefinition(mk(1)).some((p) => p.includes("manual must be a boolean")));
});

/* ------------------------------------------------------------------ */
/* Sub-branching (#66)                                                 */
/* ------------------------------------------------------------------ */

test("the forked fixture has the expected fork shape", () => {
  assert.equal(FORKED.mainStages.length, 8);
  assert.equal(FORKED.tracks.length, 2);
  // spine 0,1; demo 2,3,4 (terminal 4); response 5,6,7 (terminal 7)
  assert.equal(FORKED.mainStages[1].track, undefined);
  assert.equal(FORKED.mainStages[2].track, "demo");
  assert.equal(FORKED.mainStages[5].track, "response");
});

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

test("validateDefinition rejects a subject that resolves to no step", () => {
  const d = clone(FORKED);
  d.subject = { stepId: "ghost", outputId: "facts", field: "client" }; // no such step
  assert.ok(validateDefinition(d).some((p) => /subject/i.test(p)));
});

test("validateDefinition rejects a subject that resolves to more than one step", () => {
  const d = clone(FORKED);
  // duplicate the subject step id onto a second spine sub-stage so it resolves twice
  d.mainStages[1].subStages[0].steps.push({ id: "intake", name: "Dup", outputs: [] });
  assert.ok(validateDefinition(d).some((p) => /subject/i.test(p)));
});

test("validateDefinition rejects a subject outputId not on the step", () => {
  const d = clone(FORKED);
  d.subject = { stepId: "intake", outputId: "ghost", field: "client" }; // intake has no "ghost" output
  assert.ok(validateDefinition(d).some((p) => /subject/i.test(p)));
});

test("validateDefinition rejects a subject field that is not a field of the fields output", () => {
  const d = clone(FORKED);
  d.subject = { stepId: "intake", outputId: "facts", field: "ghost" }; // facts has no "ghost" field
  assert.ok(validateDefinition(d).some((p) => /subject/i.test(p)));
});

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
  // demo at its terminal (stage 4), centered on the terminal card. Set idx
  // directly rather than via jumpTo: fork-aware navigation only lands in
  // Task 7, so a jumpTo to mainIndex 4 here would be a linear no-op and leave
  // idx on demo's first stage, exercising the not-at-frontier guard instead of
  // the terminal guard this test is asserting.
  r = {
    ...r,
    trackFrontier: { ...r.trackFrontier, demo: 4 },
    idx: subs.findIndex((s) => s.id === "demo-qa-sub"),
  };
  const res = advance(r, subs);
  assert.equal(res.advanced, false);
  assert.equal(res.run.trackFrontier.demo, 4);
});

test("a forced advance past an unmet track gate records forces; a met track gate records nothing", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run;
  r = jumpTo(r, subs, subs.findIndex((s) => s.id === "demo-script-sub"));
  const forced = advance(r, subs, { force: true }); // demoScript output missing -> unmet
  assert.equal(forced.run.forces[2], true);
  // met track gate with force: nothing recorded
  let r2 = advance(commitSpine(createRun(), subs), subs).run;
  r2 = setOutput(r2, "demoScript", "s", "x"); // demo-script gate now met
  r2 = jumpTo(r2, subs, subs.findIndex((s) => s.id === "demo-script-sub"));
  const ok = advance(r2, subs, { force: true });
  assert.equal(ok.advanced, true);
  assert.equal(ok.run.trackFrontier.demo, 3); // advanced
  assert.equal(ok.run.forces && ok.run.forces[2], undefined); // met gate records nothing
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

test("fork-open repairs missing and out-of-range trackFrontier entries", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run; // demo=2, response=5
  // a partially corrupted run: demo out of range (99), response missing entirely.
  // Center back on the boundary (last spine stage) and re-advance to repair.
  r = { ...r, trackFrontier: { demo: 99 }, idx: subs.findIndex((s) => s.id === "findings-sub") };
  const res = advance(r, subs);
  assert.equal(res.advanced, true);
  assert.equal(res.run.trackFrontier.demo, 2); // out-of-range -> reinitialized to first
  assert.equal(res.run.trackFrontier.response, 5); // missing -> reinitialized to first
});

test("a partially-initialized fork is not navigable: advance repairs at the boundary, it does not advance one track", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run; // demo=2, response=5
  // corrupt: drop the required response entry, with idx centered inside demo.
  // The fork is not fully open, so demo is not navigable; normalizeFlat
  // recenters idx to the spine and the boundary advance repairs response
  // instead of advancing demo to 3 (which the old fork-open check would do).
  const demoIdx = subs.findIndex((s) => s.id === "demo-script-sub");
  r = { ...r, trackFrontier: { demo: 2 }, idx: demoIdx };
  const res = advance(r, subs);
  assert.equal(res.run.trackFrontier.demo, 2); // demo preserved, NOT advanced to 3
  assert.equal(res.run.trackFrontier.response, 5); // missing required entry repaired
  assert.equal(res.run.frontier, 1);
});

test("a forced open past an unmet boundary gate records forces at the last spine index", () => {
  const subs = flattenSubStages(FORKED);
  let r = setOutput(createRun(), "intake", "facts", { client: "Acme" });
  r = setCheckedDone(r, "intake", true);
  r = advance(r, subs).run; // commit stage 0 -> frontier 1 (findings), whose gate is unmet
  const res = advance(r, subs, { force: true });
  assert.equal(res.advanced, true);
  assert.equal(res.run.forces[1], true); // lastSpineIndex == 1
  assert.equal(res.run.trackFrontier.demo, 2); // fork opened despite the unmet gate
});

test("opening a met boundary gate with force records no forces marker", () => {
  const subs = flattenSubStages(FORKED);
  const r = commitSpine(createRun(), subs); // findings has a note: the boundary gate is met
  const res = advance(r, subs, { force: true });
  assert.equal(res.advanced, true);
  assert.equal("forces" in res.run, false); // met gate records nothing, even with force
});

test("opening lands idx on the flat-first track, not the declaration-first track", () => {
  const def = clone(FORKED);
  // declare response first while its stage block still follows demo in flat order
  def.tracks = [{ id: "response", name: "Response" }, { id: "demo", name: "Demo", optional: true }];
  const subs = flattenSubStages(def);
  const res = advance(commitSpine(createRun(), subs), subs);
  assert.equal(subs[res.run.idx].track, "demo"); // flat-first wins over declaration order
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

test("skipTrack recenters idx out of the skipped track to the last spine sub-stage", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run; // fork open: idx on demo (mainIndex 2)
  assert.equal(subs[r.idx].track, "demo"); // centered inside the demo track
  const skipped = skipTrack(r, FORKED, "demo");
  assert.equal(subs[skipped.idx].track, undefined); // recentered into the spine
  assert.equal(skipped.idx, subs.findIndex((s) => s.id === "findings-sub")); // last committed spine sub
});

test("a skipped track is unreachable: browse/jumpTo cannot enter it and advance is a no-op centered in it", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run; // demo=2, response=5
  r = skipTrack(r, FORKED, "demo"); // idx recentered to the spine; demo leaves the reachable set
  const demoIdx = subs.findIndex((s) => s.id === "demo-script-sub");
  assert.equal(jumpTo(r, subs, demoIdx).idx, r.idx); // jumpTo cannot enter the skipped track
  // even with idx forced onto a skipped-track card, advance does not progress it
  const res = advance({ ...r, idx: demoIdx }, subs);
  assert.equal(res.advanced, false);
  assert.equal(res.run.trackFrontier.demo, 2); // skipped track frontier untouched
});

test("skipSubStage marks a skippable sub-stage committed inside a kept track", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run; // fork open, demo=2
  r = setOutput(r, "demoScript", "s", "x");
  r = jumpTo(r, subs, subs.findIndex((s) => s.id === "demo-script-sub"));
  r = advance(r, subs).run; // demo=3 (demo-build-sub, skippable)
  const skipped = skipSubStage(r, subs, "demo-build-sub");
  assert.equal(isSubStageSkipped(skipped, "demo-build-sub"), true);
});

test("skipSubStage rejects a skippable tracked sub-stage beyond the committed region", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run; // demo frontier = 2 only
  // demo-build-sub (mainIndex 3) IS skippable but lies beyond demo's frontier
  // (2), so the region guard (not the skippable guard) must reject it.
  const same = skipSubStage(r, subs, "demo-build-sub");
  assert.equal(isSubStageSkipped(same, "demo-build-sub"), false);
});

test("skipSubStage rejects a tracked sub-stage when the track frontier is out of range", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run;
  // a corrupted run: demo's frontier is out of its [2,4] range. demo-build-sub
  // must not be treated as committed, so it cannot be skipped.
  r = { ...r, trackFrontier: { ...r.trackFrontier, demo: 99 } };
  const same = skipSubStage(r, subs, "demo-build-sub");
  assert.equal(isSubStageSkipped(same, "demo-build-sub"), false);
});

test("buildContext for a track step excludes the sibling track", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run; // fork open: demo=2, response=5
  r = setOutput(r, "demoScript", "s", "DEMO-ONLY");
  r = setOutput(r, "respDraft", "d", "RESPONSE-ONLY");
  // Advance response one stage so resp-review-sub is reachable and respDraft is
  // an earlier (committed) response output. Without this the card would be
  // unreachable and buildContext would fall back to the spine, dropping the
  // response output entirely (the assertion under test would then be vacuous).
  r = jumpTo(r, subs, subs.findIndex((s) => s.id === "resp-draft-sub"));
  r = advance(r, subs).run; // response = 6 (resp-review-sub)
  const respIdx = subs.findIndex((s) => s.id === "resp-review-sub");
  const ctx = buildContext(subs, r, respIdx, "respReview");
  assert.equal(/DEMO-ONLY/.test(ctx), false);
  assert.equal(/RESPONSE-ONLY/.test(ctx), true);
});

test("buildContext ignores a corrupted required-track entry in skippedTracks", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run;
  r = setOutput(r, "respDraft", "d", "RESPONSE-ONLY");
  r = jumpTo(r, subs, subs.findIndex((s) => s.id === "resp-draft-sub"));
  r = advance(r, subs).run; // response = 6, so resp-review-sub is reachable
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

test("a scoped validator run drops out-of-relation-set forces keys", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run;
  r = setOutput(r, "respDraft", "d", "ok");
  // a corrupted forces key naming no real stage (999) plus a sibling demo-stage
  // force (2): a validator on a response step must see neither.
  r = { ...r, forces: { 999: true, 2: true } };
  let seenForce = false;
  const validators = {
    check: (_value, _spec, ctx) => {
      const f = (ctx.run && ctx.run.forces) || {};
      if (f["999"] || f["2"]) seenForce = true;
      return null;
    },
  };
  const def = clone(FORKED);
  def.mainStages[5].subStages[0].steps[0].outputs[0].validate = "check"; // respDraft (response)
  const dsubs = flattenSubStages(def);
  gateProgress(dsubs.find((s) => s.id === "resp-draft-sub"), r, { validators, subStages: dsubs });
  assert.equal(seenForce, false);
});

test("a scoped validator run hides sibling trackFrontier/skips, omits skippedTracks, and sets idx to the step", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run; // fork open: demo=2, response=5
  r = setOutput(r, "respDraft", "d", "ok");
  // sibling-track skip, a track-skip map, and a stale idx that must all be scoped away
  r = { ...r, skips: { "demo-build-sub": true }, skippedTracks: { demo: true }, idx: 0 };
  let seen = {};
  const validators = {
    inspect: (_v, _spec, ctx) => {
      const run = ctx.run || {};
      seen = {
        demoFrontier: run.trackFrontier ? run.trackFrontier.demo : undefined,
        responseFrontier: run.trackFrontier ? run.trackFrontier.response : undefined,
        demoSkip: run.skips ? run.skips["demo-build-sub"] : undefined,
        skippedTracks: run.skippedTracks,
        idx: run.idx,
      };
      return null;
    },
  };
  const def = clone(FORKED);
  def.mainStages[5].subStages[0].steps[0].outputs[0].validate = "inspect"; // respDraft (response)
  const dsubs = flattenSubStages(def);
  const respIdx = dsubs.findIndex((s) => s.id === "resp-draft-sub");
  gateProgress(dsubs.find((s) => s.id === "resp-draft-sub"), r, { validators, subStages: dsubs });
  assert.equal(seen.demoFrontier, undefined); // sibling track frontier hidden
  assert.equal(seen.responseFrontier, 5); // own track frontier present
  assert.equal(seen.demoSkip, undefined); // sibling-track sub-stage skip hidden
  assert.equal(seen.skippedTracks, undefined); // skippedTracks omitted entirely
  assert.equal(seen.idx, respIdx); // idx is the validated step's flat index, not the stale 0
});

test("a scoped validator run preserves an in-scope skip's provenance value", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run; // fork open
  r = setOutput(r, "respDraft", "d", "ok");
  // an in-scope spine skip carrying provenance must reach the validator intact
  r = { ...r, skips: { "intake-sub": { source: "auto", skipped: true } } };
  let seen;
  const validators = {
    inspect: (_v, _spec, ctx) => {
      seen = ctx.run && ctx.run.skips && ctx.run.skips["intake-sub"];
      return null;
    },
  };
  const def = clone(FORKED);
  def.mainStages[5].subStages[0].steps[0].outputs[0].validate = "inspect"; // respDraft (response track)
  const dsubs = flattenSubStages(def);
  gateProgress(dsubs.find((s) => s.id === "resp-draft-sub"), r, { validators, subStages: dsubs });
  assert.deepEqual(seen, { source: "auto", skipped: true }); // value preserved, not coerced to true
});

test("buildDraftPrompt with a stale tracked idx falls back to the spine, not a tracked-card draft", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run; // fork open: demo committed to 2 only
  r = setOutput(r, "demoScript", "s", "DEMO-SECRET");
  // a stale run.idx pointing at an un-committed tracked card (demo-qa, mainIndex 4)
  const staleIdx = subs.findIndex((s) => s.id === "demo-qa-sub");
  const demoQaStep = FORKED.mainStages[4].subStages[0].steps[0];
  const prompt = buildDraftPrompt(FORKED, subs, r, staleIdx, demoQaStep);
  // the prompt is scoped to the last committed spine sub-stage (Findings), not
  // the tracked demo-qa card, and it neither names the tracked step nor leaks
  // the sibling demo output
  assert.equal(/Demo QA/.test(prompt), false);
  assert.equal(/DEMO-SECRET/.test(prompt), false);
  assert.ok(/Findings/.test(prompt));
});

test("buildDraftPrompt with a stale tracked idx never reintroduces the tracked step, even with a stepless spine", () => {
  // a degenerate fork whose committed spine has no step at all (subject dropped)
  const def = clone(FORKED);
  delete def.subject;
  def.mainStages[0].subStages[0].steps = [];
  def.mainStages[1].subStages[0].steps = [];
  const subs = flattenSubStages(def);
  let r = advance(createRun(), subs).run; // stepless stage 0 gate vacuously met -> frontier 1
  r = advance(r, subs).run; // boundary advance opens the fork
  const demoQaIdx = subs.findIndex((s) => s.id === "demo-qa-sub"); // un-committed tracked card
  const demoQaStep = def.mainStages[4].subStages[0].steps[0];
  const prompt = buildDraftPrompt(def, subs, r, demoQaIdx, demoQaStep);
  assert.equal(/Demo QA/.test(prompt), false); // the tracked step identity never leaks
  assert.equal(/QA/.test(prompt), false);
});

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
  const before = runSummary(FORKED, r).total;
  const after = runSummary(FORKED, skipTrack(r, FORKED, "demo")).total;
  assert.ok(after < before);
});

test("inherited-only trackFrontier entries are never read as opened or complete", () => {
  // A corrupted run whose `demo`/`response` are inherited, not own, properties:
  // own-property reads must ignore them (spec robustness), so the fork reads as
  // not-open and the run as incomplete. A bare key read would wrongly see the
  // terminal values and report "active"/opened. Object.create keeps the
  // pollution local to this object (no global prototype mutation).
  const inherited = Object.create({ demo: 4, response: 7 });
  const r = { ...createRun(), frontier: 1, trackFrontier: inherited }; // frontier at spine end
  assert.equal(trackStatus(FORKED, r, "demo"), "not-open");
  assert.equal(trackStatus(FORKED, r, "response"), "not-open");
  assert.equal(isRunComplete(FORKED, r), false);
});

// Drive the response track to its terminal with every gate met.
function driveResponseToTerminal(run, subs) {
  let r = run;
  r = setOutput(r, "respDraft", "d", "x");
  r = jumpTo(r, subs, subs.findIndex((s) => s.id === "resp-draft-sub"));
  r = advance(r, subs).run; // response = 6
  r = setOutput(r, "respReview", "r", "x");
  r = jumpTo(r, subs, subs.findIndex((s) => s.id === "resp-review-sub"));
  r = advance(r, subs).run; // response = 7 (terminal)
  r = setCheckedDone(r, "respSignoff", true); // strict terminal gate met
  return r;
}

test("a stage forced past an unmet gate keeps the run incomplete", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run;
  r = skipTrack(r, FORKED, "demo"); // keep only response
  r = jumpTo(r, subs, subs.findIndex((s) => s.id === "resp-draft-sub"));
  r = advance(r, subs, { force: true }).run; // respDraft missing: forced past, response = 6
  r = setOutput(r, "respReview", "r", "x");
  r = jumpTo(r, subs, subs.findIndex((s) => s.id === "resp-review-sub"));
  r = advance(r, subs).run; // response = 7 (terminal)
  r = setCheckedDone(r, "respSignoff", true);
  // response is at its terminal, but the forced-unmet draft gate keeps the run incomplete
  assert.equal(isRunComplete(FORKED, r), false);
});

test("a validator-rejected terminal output keeps isRunComplete and trackStatus incomplete", () => {
  const def = clone(FORKED);
  def.mainStages[7].subStages[0].steps[0].outputs[0].validate = "reject"; // respSignoff output
  const subs = flattenSubStages(def);
  const validators = { reject: () => "nope" };
  let r = advance(commitSpine(createRun(), subs), subs).run;
  r = skipTrack(r, def, "demo");
  r = driveResponseToTerminal(r, subs);
  r = setOutput(r, "respSignoff", "so", "x"); // terminal output present but the validator rejects it
  assert.equal(trackStatus(def, r, "response", { validators }), "active");
  assert.equal(isRunComplete(def, r, { validators }), false);
});

test("isRunComplete stays false when terminal outputs are prefilled but the frontier has not reached them", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run; // demo=2, response=5
  r = skipTrack(r, FORKED, "demo");
  // prefill every response output (including the terminal) without advancing the frontier
  r = setOutput(r, "respDraft", "d", "x");
  r = setOutput(r, "respReview", "r", "x");
  r = setOutput(r, "respSignoff", "so", "x");
  r = setCheckedDone(r, "respSignoff", true);
  assert.equal(r.trackFrontier.response, 5); // frontier still at the first response stage
  assert.equal(isRunComplete(FORKED, r), false); // prefilled stepState does not complete the run
});

test("a kept (unskipped) optional track blocks completion until its own terminal is reached", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run; // demo kept, at its first stage
  r = driveResponseToTerminal(r, subs); // response fully complete
  assert.equal(trackStatus(FORKED, r, "response"), "complete");
  assert.equal(trackStatus(FORKED, r, "demo"), "active"); // kept optional, not at terminal
  assert.equal(isRunComplete(FORKED, r), false); // demo blocks completion
});

test("a stale frontier is normalized before isRunComplete and trackStatus", () => {
  const subs = flattenSubStages(FORKED);
  // a run persisted when the definition was linear: frontier/idx point past the new spine,
  // with no trackFrontier. After normalization the fork is not open: incomplete, tracks not-open.
  let r = setOutput(createRun(), "intake", "facts", { client: "Acme" });
  r = setOutput(r, "findings", "notes", "n");
  r = { ...r, frontier: 7, idx: subs.length - 1 };
  assert.equal(isRunComplete(FORKED, r), false);
  assert.equal(trackStatus(FORKED, r, "demo"), "not-open");
});

test("gateProgress reports a single stage's gate and never consults skippedTracks", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run;
  r = setOutput(r, "demoScript", "s", "x"); // demo-script gate met
  const sub = subs.find((s) => s.id === "demo-script-sub");
  const skipped = { ...r, skippedTracks: { demo: true } };
  assert.equal(gateProgress(sub, r, { subStages: subs }).met, true);
  assert.equal(gateProgress(sub, skipped, { subStages: subs }).met, true); // a whole-track skip is not its concern
});

test("a linear run is complete when the frontier is at the last main stage with its gate met", () => {
  const subs = flattenSubStages(FIXTURE);
  let r = setOutput(createRun(), "intake", "facts", { client: "Acme" });
  r = setCheckedDone(r, "kickoff", true); // required checklist step in the start sub-stage
  r = setCheckedDone(r, "evidence", true); // required step in the (skippable) collect sub-stage
  r = advance(r, subs).run; // alpha boundary gate met -> frontier 1 (omega)
  assert.equal(r.frontier, 1);
  r = setCheckedDone(r, "approve", true); // strict signoff gate
  assert.equal(isRunComplete(FIXTURE, r), true);
});

test("trackStatus is not-open for a partially-initialized fork (a required track missing)", () => {
  const subs = flattenSubStages(FORKED);
  // demo has a valid entry but the required response entry is missing: the fork
  // is not fully open, so NO track is active, matching navigation/isRunComplete.
  const r = { ...createRun(), frontier: 1, trackFrontier: { demo: 2 } };
  assert.equal(trackStatus(FORKED, r, "demo"), "not-open");
  assert.equal(isRunComplete(FORKED, r), false);
});

test("a corrupted required-track skip is ignored by runSummary and isRunComplete", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run; // fork open: demo=2, response=5
  const cleanTotal = runSummary(FORKED, r).total;
  // response is REQUIRED: a skippedTracks entry for it (and an unknown id) must be
  // ignored by every read path, so runSummary does not drop response's sub-stages.
  const corrupt = { ...r, skippedTracks: { response: true, ghost: true } };
  assert.equal(runSummary(FORKED, corrupt).total, cleanTotal);
  // and isRunComplete still requires response to reach its terminal: demo (optional)
  // is effectively skipped, response (required) is not, so the run is incomplete.
  const r2 = { ...r, skippedTracks: { demo: true, response: true } };
  assert.equal(isRunComplete(FORKED, r2), false);
});

/* ---- engine correctness bundle (#107, #108, #110) ---- */

test("validateDefinition catches a missing or duplicate output id", () => {
  const mk = (outputs) => ({
    id: "d", name: "D",
    mainStages: [{ id: "m", name: "M", subStages: [{ id: "s", name: "S",
      steps: [{ id: "st", name: "St", outputs }] }] }],
  });
  assert.ok(validateDefinition(mk([{ type: "text" }])).some((p) => /output is missing an id/.test(p)));
  assert.ok(validateDefinition(mk([{ id: "  ", type: "text" }])).some((p) => /output is missing an id/.test(p)));
  assert.ok(
    validateDefinition(mk([{ id: "o", type: "text" }, { id: "o", type: "text" }]))
      .some((p) => /duplicate output id "o"/.test(p))
  );
  assert.deepEqual(validateDefinition(mk([{ id: "a", type: "text" }, { id: "b", type: "text" }])), []);
});

test("validateDefinition validates the subject for a linear definition", () => {
  const mk = (subject) => ({
    id: "d", name: "D", subject,
    mainStages: [{ id: "m", name: "M", subStages: [{ id: "s", name: "S",
      steps: [{ id: "st", name: "St", outputs: [
        { id: "o", type: "fields", fields: [{ key: "client", label: "Client" }] }] }] }] }],
  });
  assert.ok(validateDefinition(mk({ stepId: "st", outputId: "o", field: "nope" }))
    .some((p) => /field "nope" is not a field/.test(p)));
  assert.ok(validateDefinition(mk({ stepId: "ghost", outputId: "o", field: "client" }))
    .some((p) => /must resolve to exactly one step/.test(p)));
  assert.deepEqual(validateDefinition(mk({ stepId: "st", outputId: "o", field: "client" })), []);
});

test("trackStatus is active (not complete) when an intermediate track gate was forced", () => {
  const subs = flattenSubStages(FORKED);
  let r = advance(commitSpine(createRun(), subs), subs).run; // fork open
  r = skipTrack(r, FORKED, "demo"); // keep only response
  r = jumpTo(r, subs, subs.findIndex((s) => s.id === "resp-draft-sub"));
  r = advance(r, subs, { force: true }).run; // respDraft missing: forced, response = 6
  r = setOutput(r, "respReview", "r", "x");
  r = jumpTo(r, subs, subs.findIndex((s) => s.id === "resp-review-sub"));
  r = advance(r, subs).run; // response = 7 (terminal)
  r = setCheckedDone(r, "respSignoff", true);
  assert.equal(trackStatus(FORKED, r, "response"), "active");
  assert.equal(isRunComplete(FORKED, r), false);
});

test("trackStatus is active (not complete) when a spine gate was forced open", () => {
  const subs = flattenSubStages(FORKED);
  let r = setOutput(createRun(), "intake", "facts", { client: "Acme" });
  r = setCheckedDone(r, "intake", true);
  r = advance(r, subs).run; // frontier at findings (1), findings gate NOT met
  r = advance(r, subs, { force: true }).run; // force-open the fork past the unmet findings gate
  r = skipTrack(r, FORKED, "demo");
  r = driveResponseToTerminal(r, subs); // response fully met
  assert.equal(trackStatus(FORKED, r, "response"), "active"); // unmet spine gate keeps it incomplete
  assert.equal(isRunComplete(FORKED, r), false);
});

test("buildDraftPrompt falls back on an out-of-range idx instead of throwing", () => {
  const subs = flattenSubStages(FIXTURE);
  const step = subs[0].steps[0];
  const prompt = buildDraftPrompt(FIXTURE, subs, createRun(), 999, step);
  assert.equal(typeof prompt, "string");
  assert.ok(prompt.length > 0);
});

test("validateOutputValue: a forked draft value that passes unscoped fails under the gate's scoping", () => {
  // spine s0; tracks A (a1) and B (b1). The validator on a1 REQUIRES b1's output
  // (cross-track). Unscoped it sees b1 and passes; scoped, a1 never sees track B,
  // so it fails, matching the boundary gate.
  const def = {
    id: "vf", name: "VF",
    tracks: [ { id: "A", name: "A" }, { id: "B", name: "B" } ],
    mainStages: [
      { id: "m0", name: "M0", subStages: [ { id: "s0", name: "S0", gate: { type: "hybrid" }, steps: [ { id: "st0", name: "St0" } ] } ] },
      { id: "mA", name: "MA", track: "A", subStages: [ { id: "a1", name: "A1", gate: { type: "hybrid" }, steps: [ { id: "stA", name: "StA", required: true, outputs: [ { id: "oA", type: "text", validate: "requireSibling" } ] } ] } ] },
      { id: "mB", name: "MB", track: "B", subStages: [ { id: "b1", name: "B1", gate: { type: "hybrid" }, steps: [ { id: "stB", name: "StB", outputs: [ { id: "oB", type: "text" } ] } ] } ] },
    ],
  };
  assert.deepEqual(validateDefinition(def), []);
  const subs = flattenSubStages(def);
  const validators = {
    requireSibling: (_v, _spec, ctx) => (getStepEntry(ctx.run, "stB").outputs.oB ? null : "needs the sibling track"),
  };
  const run = {
    idx: subs.findIndex((s) => s.id === "a1"),
    frontier: 0,
    trackFrontier: { A: 1, B: 2 },
    stepState: { stB: { checkedDone: false, outputs: { oB: "x" } } },
  };
  const flatIdx = subs.findIndex((s) => s.id === "a1");
  // Unscoped, the raw validator sees stB and PASSES (this is the latent draft-time bug):
  assert.equal(validators.requireSibling("draft", subs[flatIdx].steps[0].outputs[0], { run, stepId: "stA" }), null);
  // Scoped through the helper, A1 cannot see track B, so it FAILS, as the gate does:
  assert.equal(validateOutputValue(subs, run, flatIdx, "stA", subs[flatIdx].steps[0].outputs[0], "draft", validators), "needs the sibling track");
});

test("validateOutputValue: linear definition is a pass-through (no scoping)", () => {
  const subs = flattenSubStages(FIXTURE);
  const spec = { id: "o", type: "text", validate: "nonEmpty" };
  const validators = { nonEmpty: (v) => (v && v.trim() ? null : "empty") };
  const r = createRun();
  assert.equal(validateOutputValue(subs, r, 0, "anyStep", spec, "", validators), "empty");
  assert.equal(validateOutputValue(subs, r, 0, "anyStep", spec, "ok", validators), null);
});

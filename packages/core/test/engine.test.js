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
  browse,
  jumpTo,
  advance,
  resolveSubject,
  buildContext,
  buildDraftPrompt,
  hasValue,
  serializeStep,
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

test("advance is blocked at an unmet gate, allowed when met, and forceable", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();

  let result = advance(run, subs);
  assert.equal(result.advanced, false);
  assert.ok(result.missing.length > 0);

  result = advance(run, subs, { force: true });
  assert.equal(result.advanced, true);
  assert.equal(result.run.idx, 1);
  assert.equal(result.run.frontier, 1);
});

test("browse stays within [0, frontier]; jumpTo respects the frontier", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = advance(run, subs, { force: true }).run;
  assert.equal(run.frontier, 1);

  run = jumpTo(run, subs, 2); // beyond frontier: no-op
  assert.equal(run.idx, 1);

  run = advance(run, subs, { force: true }).run;
  assert.equal(run.frontier, 2);

  run = browse(run, subs, -1);
  assert.equal(run.idx, 1);
  run = browse(run, subs, 1);
  assert.equal(run.idx, 2);
  run = browse(run, subs, 1); // beyond frontier: no-op
  assert.equal(run.idx, 2);

  run = jumpTo(run, subs, 0);
  assert.equal(run.idx, 0);
});

test("advancing from a non-frontier (browsing) position is a no-op", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = advance(run, subs, { force: true }).run;
  run = browse(run, subs, -1);
  const result = advance(run, subs, { force: true });
  assert.equal(result.advanced, false);
  assert.equal(result.run.frontier, 1);
});

test("subject resolves from the configured field with fallback", () => {
  let run = createRun();
  assert.equal(resolveSubject(FIXTURE, run), "the account");
  run = setOutput(run, "intake", "facts", { client: "Vexel Tools" });
  assert.equal(resolveSubject(FIXTURE, run), "Vexel Tools");
});

test("buildContext only includes completed prior outputs; prompt references the subject", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "intake", "facts", { client: "Vexel Tools", industry: "Tooling" });
  run = setCheckedDone(run, "kickoff", true);
  run = advance(run, subs).run;
  assert.equal(run.idx, 1);

  const ctx = buildContext(subs, run, run.idx);
  assert.match(ctx, /Vexel Tools/);
  assert.doesNotMatch(ctx, /Summary/);

  const summary = subs[1].steps.find((s) => s.id === "summary");
  const prompt = buildDraftPrompt(FIXTURE, subs, run, run.idx, summary);
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

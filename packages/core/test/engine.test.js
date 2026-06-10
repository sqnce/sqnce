import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const here = dirname(fileURLToPath(import.meta.url));
const defsDir = join(here, "..", "..", "..", "definitions");
const load = (name) => JSON.parse(readFileSync(join(defsDir, name), "utf8"));

const PRESALES = load("presales.json");

test("all bundled definitions validate", () => {
  for (const name of [
    "presales.json",
    "hiring.json",
    "onboarding.json",
    "launch.json",
    "car-buying.json",
    "moving.json",
    "trip-planning.json",
    "meal-planning.json",
  ]) {
    const problems = validateDefinition(load(name));
    assert.deepEqual(problems, [], `${name}: ${problems.join("; ")}`);
  }
});

test("flatten produces an ordered sequence with main stage annotations", () => {
  const subs = flattenSubStages(PRESALES);
  assert.equal(subs.length, 10);
  assert.equal(subs[0].id, "start");
  assert.equal(subs[0].mainName, "RFP");
  assert.equal(subs[subs.length - 1].mainName, "SOW");
});

test("hybrid gate: output alone completes a step; strict requires explicit done", () => {
  const subs = flattenSubStages(PRESALES);
  const review = subs.find((s) => s.id === "review");
  const painPoints = review.steps.find((s) => s.id === "pain-points");

  let run = createRun();
  run = setOutput(run, "pain-points", "out", "Siloed sales data across BUs");
  assert.equal(isStepComplete(painPoints, getStepEntry(run, "pain-points"), "hybrid"), true);
  assert.equal(isStepComplete(painPoints, getStepEntry(run, "pain-points"), "strict"), false);

  run = setCheckedDone(run, "pain-points", true);
  assert.equal(isStepComplete(painPoints, getStepEntry(run, "pain-points"), "strict"), true);
});

test("gateProgress reports missing required steps by name", () => {
  const subs = flattenSubStages(PRESALES);
  const start = subs[0];
  let run = createRun();
  let p = gateProgress(start, run);
  assert.equal(p.met, false);
  assert.equal(p.total, 3);
  assert.ok(p.missing.includes("Opportunity Intake"));

  run = setOutput(run, "intake", "facts", { client: "Ironclad Industries" });
  run = setOutput(run, "rfp-upload", "doc", { name: "rfp.pdf", content: "" });
  run = setOutput(run, "qualify", "out", "Go. Strong fit.");
  p = gateProgress(start, run);
  assert.equal(p.met, true);
  assert.deepEqual(p.missing, []);
});

test("advance is blocked at an unmet gate, allowed when met, and forceable", () => {
  const subs = flattenSubStages(PRESALES);
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
  const subs = flattenSubStages(PRESALES);
  let run = createRun();
  run = advance(run, subs, { force: true }).run;
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
  run = jumpTo(run, subs, 5); // beyond frontier: no-op
  assert.equal(run.idx, 0);
});

test("advancing from a non-frontier (browsing) position is a no-op", () => {
  const subs = flattenSubStages(PRESALES);
  let run = createRun();
  run = advance(run, subs, { force: true }).run;
  run = browse(run, subs, -1);
  const result = advance(run, subs, { force: true });
  assert.equal(result.advanced, false);
  assert.equal(result.run.frontier, 1);
});

test("subject resolves from the configured field with fallback", () => {
  let run = createRun();
  assert.equal(resolveSubject(PRESALES, run), "the client");
  run = setOutput(run, "intake", "facts", { client: "Ironclad Industries" });
  assert.equal(resolveSubject(PRESALES, run), "Ironclad Industries");
});

test("buildContext only includes completed prior outputs; prompt references the subject", () => {
  const subs = flattenSubStages(PRESALES);
  let run = createRun();
  run = setOutput(run, "intake", "facts", { client: "Ironclad Industries", industry: "Steel" });
  run = setOutput(run, "qualify", "out", "Go. Strong fit.");
  run = advance(run, subs, { force: true }).run;

  const ctx = buildContext(subs, run, run.idx);
  assert.match(ctx, /Ironclad Industries/);
  assert.match(ctx, /Go\. Strong fit\./);
  assert.doesNotMatch(ctx, /Pain points/i);

  const step = subs[1].steps.find((s) => s.id === "pain-points");
  const prompt = buildDraftPrompt(PRESALES, subs, run, run.idx, step);
  assert.match(prompt, /Ironclad Industries/);
  assert.match(prompt, /Pain Points/);
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

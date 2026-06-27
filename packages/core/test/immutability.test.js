import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRun,
  flattenSubStages,
  setOutput,
  setCheckedDone,
  advance,
  skipSubStage,
  unskipSubStage,
  autoSkipSubStage,
  createRunStore,
  createRunEntry,
  addRun,
  cloneRun,
} from "../src/index.js";

// Deep-freeze so any in-place write throws in strict mode (ESM is strict).
// The engine's promise is "state in, new state out"; a frozen input proves it.
function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

const linearDef = {
  id: "imm",
  name: "Imm",
  mainStages: [
    { id: "m0", name: "M0", subStages: [
      { id: "s0", name: "S0", skippable: true, gate: { type: "hybrid" }, steps: [
        { id: "st0", name: "St0", required: true, outputs: [{ id: "o0", type: "text" }] },
      ] },
    ] },
    { id: "m1", name: "M1", subStages: [
      { id: "s1", name: "S1", gate: { type: "hybrid" }, steps: [{ id: "st1", name: "St1" }] },
    ] },
  ],
};

test("setOutput does not mutate the input run", () => {
  const run = deepFreeze(createRun());
  assert.doesNotThrow(() => setOutput(run, "st0", "o0", "hello"));
});

test("setCheckedDone does not mutate the input run", () => {
  const run = deepFreeze(createRun());
  assert.doesNotThrow(() => setCheckedDone(run, "st0", true));
});

test("advance does not mutate the input run", () => {
  const subs = flattenSubStages(linearDef);
  const run = deepFreeze(setOutput(createRun(), "st0", "o0", "hello"));
  assert.doesNotThrow(() => advance(run, subs, {}));
});

test("skipSubStage does not mutate the input run", () => {
  const subs = flattenSubStages(linearDef);
  const run = deepFreeze(createRun());
  assert.doesNotThrow(() => skipSubStage(run, subs, "s0"));
});

test("unskipSubStage does not mutate the input run", () => {
  const subs = flattenSubStages(linearDef);
  const run = deepFreeze(createRun());
  assert.doesNotThrow(() => unskipSubStage(run, subs, "s0"));
});

test("autoSkipSubStage does not mutate the input run", () => {
  const subs = flattenSubStages(linearDef);
  const run = deepFreeze(createRun());
  assert.doesNotThrow(() => autoSkipSubStage(run, subs, "s0"));
});

test("cloneRun does not mutate the input store", () => {
  const store = addRun(
    createRunStore(),
    createRunEntry({ id: "r1", workflowId: "imm", run: createRun(), now: 100 })
  );
  deepFreeze(store);
  assert.doesNotThrow(() =>
    cloneRun(store, { fromId: "r1", newId: "r2", now: 200, definition: linearDef })
  );
});

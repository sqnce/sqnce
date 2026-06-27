import { test } from "node:test";
import assert from "node:assert/strict";
import { setOutput } from "@sqnce/core";
import { applyRunWrite } from "../src/runWrite.js";

const run = (over = {}) => ({ idx: 0, frontier: 0, stepState: {}, ...over });

const store = (entryOver = {}) => ({
  version: 3,
  activeWorkflowId: "w1",
  activeRunByWorkflow: { w1: "e1" },
  entries: {
    e1: { id: "e1", workflowId: "w1", name: "A", status: "active", createdAt: 1, updatedAt: 5, run: run(), ...entryOver },
  },
});

const def = { id: "w1" };
const opts = (over = {}) => ({ reconcileRun: undefined, def, now: 100, ...over });

test("applyRunWrite: value form is written and stamps updatedAt with now", () => {
  const s = store();
  const value = run({ frontier: 2 });
  const out = applyRunWrite(s, "e1", value, opts({ now: 777 }));
  assert.equal(out.entries.e1.run, value);
  assert.equal(out.entries.e1.updatedAt, 777);
});

test("applyRunWrite: functional form resolves against the entry's current run", () => {
  const seeded = store();
  seeded.entries.e1.run = setOutput(run(), "s1", "o", "one");
  const out = applyRunWrite(seeded, "e1", (prev) => setOutput(prev, "s2", "o", "two"), opts());
  assert.equal(out.entries.e1.run.stepState.s1.outputs.o, "one");
  assert.equal(out.entries.e1.run.stepState.s2.outputs.o, "two");
});

test("applyRunWrite: an async functional write keeps edits made during its wait (the bug)", () => {
  const run0 = run();
  let s = store();
  s.entries.e1.run = run0;
  // A sync edit marks step B while the async write is in flight.
  s = applyRunWrite(s, "e1", (prev) => setOutput(prev, "stepB", "o", "B"), opts());
  // The async write lands as a function, recomputing against the current run.
  s = applyRunWrite(s, "e1", (prev) => setOutput(prev, "stepA", "o", "A"), opts());
  assert.equal(s.entries.e1.run.stepState.stepA.outputs.o, "A");
  assert.equal(s.entries.e1.run.stepState.stepB.outputs.o, "B");

  // Contrast: the old value form, computed from the captured run0, drops step B.
  let bug = store();
  bug.entries.e1.run = run0;
  bug = applyRunWrite(bug, "e1", setOutput(run0, "stepB", "o", "B"), opts());
  bug = applyRunWrite(bug, "e1", setOutput(run0, "stepA", "o", "A"), opts());
  assert.equal(bug.entries.e1.run.stepState.stepA.outputs.o, "A");
  assert.equal(bug.entries.e1.run.stepState.stepB, undefined);
});

test("applyRunWrite: a write onto a non-active entry returns the store unchanged", () => {
  const s = store({ status: "archived" });
  assert.equal(applyRunWrite(s, "e1", run({ frontier: 9 }), opts()), s);
});

test("applyRunWrite: a write onto a missing entry returns the store unchanged", () => {
  const s = store();
  assert.equal(applyRunWrite(s, "nope", run({ frontier: 9 }), opts()), s);
});

test("applyRunWrite: the load-path reconcile is applied to the written run", () => {
  const s = store();
  const reconcileRun = (rr, ctx) => ({ ...rr, mark: ctx.def.id + ":" + ctx.runId });
  const out = applyRunWrite(s, "e1", run({ frontier: 1 }), opts({ reconcileRun }));
  assert.equal(out.entries.e1.run.mark, "w1:e1");
  assert.equal(out.entries.e1.run.frontier, 1);
});

test("applyRunWrite: a functional write composes with the reconcile", () => {
  const s = store();
  const reconcileRun = (rr) => ({ ...rr, reconciled: true });
  const out = applyRunWrite(s, "e1", (prev) => setOutput(prev, "s1", "o", "x"), opts({ reconcileRun }));
  assert.equal(out.entries.e1.run.reconciled, true);
  assert.equal(out.entries.e1.run.stepState.s1.outputs.o, "x");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyReconcile, applyReconcileToStore } from "../src/reconcile.js";

const run = (over = {}) => ({ idx: 0, frontier: 0, stepState: {}, ...over });

test("applyReconcile: absent fn returns the same run reference", () => {
  const r = run();
  assert.equal(applyReconcile(undefined, r), r);
  assert.equal(applyReconcile(null, r), r);
});

test("applyReconcile: applies the fn and returns its result", () => {
  const r = run();
  const out = run({ frontier: 1 });
  assert.equal(applyReconcile(() => out, r), out);
});

test("applyReconcile: a non-object return degrades to a no-op", () => {
  const r = run();
  assert.equal(applyReconcile(() => null, r), r);
  assert.equal(applyReconcile(() => undefined, r), r);
  assert.equal(applyReconcile(() => "nope", r), r);
  assert.equal(applyReconcile(() => 42, r), r);
});

test("applyReconcile: passes the context to the fn", () => {
  const r = run();
  let seen = null;
  const ctx = { def: { id: "w" }, runId: "r1" };
  applyReconcile((_run, c) => { seen = c; return _run; }, r, ctx);
  assert.deepEqual(seen, ctx);
});

test("applyReconcile: an idempotent fn applied twice equals applied once", () => {
  const fn = (rr) => (rr.frontier === 1 ? rr : { ...rr, frontier: 1 });
  const once = applyReconcile(fn, run());
  const twice = applyReconcile(fn, once);
  assert.deepEqual(twice, once);
});

const store = () => ({
  version: 3,
  activeWorkflowId: "w1",
  activeRunByWorkflow: { w1: "e1" },
  entries: {
    e1: { id: "e1", workflowId: "w1", name: "A", status: "active", createdAt: 1, updatedAt: 5, run: run() },
    e2: { id: "e2", workflowId: "w2", name: "B", status: "active", createdAt: 2, updatedAt: 6, run: run({ idx: 2 }) },
  },
});
const workflows = [{ id: "w1" }, { id: "w2" }];

test("applyReconcileToStore: absent fn returns the same store reference", () => {
  const s = store();
  assert.equal(applyReconcileToStore(undefined, s, workflows), s);
});

test("applyReconcileToStore: reconciles every entry's run, preserving store shape and entry metadata", () => {
  const s = store();
  const fn = (rr, ctx) => ({ ...rr, mark: ctx.def.id + ":" + ctx.runId });
  const out = applyReconcileToStore(fn, s, workflows);
  assert.equal(out.version, 3);
  assert.equal(out.activeWorkflowId, "w1");
  assert.deepEqual(out.activeRunByWorkflow, { w1: "e1" });
  assert.equal(out.entries.e1.updatedAt, 5);
  assert.equal(out.entries.e1.name, "A");
  assert.equal(out.entries.e1.run.mark, "w1:e1");
  assert.equal(out.entries.e2.run.mark, "w2:e2");
});

test("applyReconcileToStore: an entry whose workflow is absent keeps its run unchanged", () => {
  const s = store();
  const fn = (rr) => ({ ...rr, mark: true });
  const out = applyReconcileToStore(fn, s, [{ id: "w1" }]);
  assert.equal(out.entries.e2.run, s.entries.e2.run);
  assert.equal(out.entries.e1.run.mark, true);
});

test("applyReconcileToStore: does not mutate the input store", () => {
  const s = store();
  const before = JSON.stringify(s);
  applyReconcileToStore((rr) => ({ ...rr, mark: 1 }), s, workflows);
  assert.equal(JSON.stringify(s), before);
});

test("applyReconcileToStore: an idempotent fn applied twice deep-equals once", () => {
  const fn = (rr) => (rr.frontier === 1 ? rr : { ...rr, frontier: 1 });
  const once = applyReconcileToStore(fn, store(), workflows);
  const twice = applyReconcileToStore(fn, once, workflows);
  assert.deepEqual(twice, once);
});

test("applyReconcileToStore: a prototype-key entry id stays an own entry, not prototype pollution", () => {
  // A persisted store (JSON.parse) can carry an own "__proto__" entry id.
  const protoStore = {
    version: 3,
    activeWorkflowId: "w1",
    activeRunByWorkflow: { w1: "__proto__" },
    entries: JSON.parse(
      '{"__proto__":{"id":"__proto__","workflowId":"w1","name":"P","status":"active","createdAt":1,"updatedAt":2,"run":{"idx":0,"frontier":0,"stepState":{}}}}'
    ),
  };
  const out = applyReconcileToStore((rr) => ({ ...rr, mark: true }), protoStore, [{ id: "w1" }]);
  // The reconciled entry must be an own property the active mapping can resolve.
  assert.ok(Object.prototype.hasOwnProperty.call(out.entries, "__proto__"));
  assert.equal(out.entries["__proto__"].run.mark, true);
  // No global prototype pollution.
  assert.equal({}.mark, undefined);
});

test("applyReconcileToStore: a workflow id matching a prototype key is not a definition", () => {
  // entry.workflowId "toString" must not resolve to Object.prototype.toString.
  const s = {
    version: 3,
    activeWorkflowId: "toString",
    activeRunByWorkflow: { toString: "e1" },
    entries: {
      e1: { id: "e1", workflowId: "toString", name: "X", status: "active", createdAt: 1, updatedAt: 2, run: run() },
    },
  };
  let called = false;
  const fn = (rr) => { called = true; return { ...rr, mark: true }; };
  const out = applyReconcileToStore(fn, s, [{ id: "w1" }]); // "toString" not in workflows
  assert.equal(called, false);
  assert.equal(out.entries.e1.run, s.entries.e1.run);
});

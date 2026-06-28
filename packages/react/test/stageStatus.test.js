import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultStageStatusWord, resolveStageStatus } from "../src/stageStatus.js";

const ctx = { def: { id: "w" }, run: {}, runId: "r1", stepId: "s1", status: "done" };
const NODE = { sentinel: true };

test("defaultStageStatusWord: maps each lifecycle to its word", () => {
  assert.equal(defaultStageStatusWord("done"), "Done");
  assert.equal(defaultStageStatusWord("draft"), "Draft");
  assert.equal(defaultStageStatusWord("open"), "");
});

test("resolveStageStatus: no render slot falls back to the generic word", () => {
  assert.deepEqual(resolveStageStatus({ render: undefined, ctx, status: "done" }), { word: "Done" });
  assert.deepEqual(resolveStageStatus({ render: undefined, ctx, status: "draft" }), { word: "Draft" });
  assert.deepEqual(resolveStageStatus({ render: undefined, ctx, status: "open" }), { word: "" });
});

test("resolveStageStatus: a returned node is shown", () => {
  assert.deepEqual(resolveStageStatus({ render: () => NODE, ctx, status: "done" }), { node: NODE });
});

test("resolveStageStatus: a null or undefined return falls back to the generic word", () => {
  assert.deepEqual(resolveStageStatus({ render: () => null, ctx, status: "draft" }), { word: "Draft" });
  assert.deepEqual(resolveStageStatus({ render: () => undefined, ctx, status: "open" }), { word: "" });
});

test("resolveStageStatus: only nullish falls back; a falsy non-nullish node is shown", () => {
  assert.deepEqual(resolveStageStatus({ render: () => false, ctx, status: "done" }), { node: false });
});

test("resolveStageStatus: the render slot receives the context", () => {
  let seen = null;
  resolveStageStatus({ render: (c) => { seen = c; return NODE; }, ctx, status: "done" });
  assert.deepEqual(seen, ctx);
});

test("resolveStageStatus: a throwing render slot degrades to the default word", () => {
  assert.deepEqual(resolveStageStatus({ render: () => { throw new Error("boom"); }, ctx, status: "done" }), { word: "Done" });
});

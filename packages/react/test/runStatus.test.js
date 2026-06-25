import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRunStatus } from "../src/runStatus.js";

const ctx = { def: { id: "w" }, run: {}, runId: "r1" };

test("resolveRunStatus: no resolver yields null", () => {
  assert.equal(resolveRunStatus(undefined, ctx), null);
});

test("resolveRunStatus: a bare string becomes { word }", () => {
  assert.deepEqual(resolveRunStatus(() => "ACCEPT", ctx), { word: "ACCEPT" });
});

test("resolveRunStatus: a { word, tone } passes through", () => {
  assert.deepEqual(resolveRunStatus(() => ({ word: "REVISE", tone: "revise" }), ctx), { word: "REVISE", tone: "revise" });
});

test("resolveRunStatus: a { word } with no tone omits tone", () => {
  assert.deepEqual(resolveRunStatus(() => ({ word: "DONE" }), ctx), { word: "DONE" });
});

test("resolveRunStatus: a resolver returning null yields null", () => {
  assert.equal(resolveRunStatus(() => null, ctx), null);
});

test("resolveRunStatus: an empty or whitespace word yields null", () => {
  assert.equal(resolveRunStatus(() => "   ", ctx), null);
  assert.equal(resolveRunStatus(() => ({ word: "" }), ctx), null);
});

test("resolveRunStatus: the resolver receives the run context", () => {
  let seen = null;
  resolveRunStatus((c) => { seen = c; return "X"; }, ctx);
  assert.deepEqual(seen, ctx);
});

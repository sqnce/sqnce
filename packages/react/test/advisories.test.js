import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAdvisories } from "../src/advisories.js";

const ctx = { def: { id: "w" }, run: {}, runId: "r1", subStageId: "sub-1" };

test("resolveAdvisories: no function returns an empty list", () => {
  assert.deepEqual(resolveAdvisories({ advisories: undefined, ctx }), []);
});

test("resolveAdvisories: a throwing function degrades to an empty list", () => {
  assert.deepEqual(
    resolveAdvisories({ advisories: () => { throw new Error("boom"); }, ctx }),
    []
  );
});

test("resolveAdvisories: a non-array return degrades to an empty list", () => {
  assert.deepEqual(resolveAdvisories({ advisories: () => "nope", ctx }), []);
  assert.deepEqual(resolveAdvisories({ advisories: () => null, ctx }), []);
  assert.deepEqual(resolveAdvisories({ advisories: () => ({ message: "x" }), ctx }), []);
});

test("resolveAdvisories: items without a non-empty message are dropped", () => {
  const out = resolveAdvisories({
    advisories: () => [
      { message: "" },
      { message: "   " },
      { severity: "warning" },
      null,
      "string-item",
      { message: "kept" },
    ],
    ctx,
  });
  assert.deepEqual(out, [{ message: "kept", severity: "info" }]);
});

test("resolveAdvisories: recognized severities pass through, message is trimmed", () => {
  const out = resolveAdvisories({
    advisories: () => [
      { message: "  warn me  ", severity: "warning" },
      { message: "fyi", severity: "info" },
    ],
    ctx,
  });
  assert.deepEqual(out, [
    { message: "warn me", severity: "warning" },
    { message: "fyi", severity: "info" },
  ]);
});

test("resolveAdvisories: absent or unrecognized severity normalizes to info", () => {
  const out = resolveAdvisories({
    advisories: () => [
      { message: "a" },
      { message: "b", severity: "danger" },
      { message: "c", severity: 5 },
    ],
    ctx,
  });
  assert.deepEqual(out, [
    { message: "a", severity: "info" },
    { message: "b", severity: "info" },
    { message: "c", severity: "info" },
  ]);
});

test("resolveAdvisories: the function receives the context unchanged", () => {
  let seen = null;
  resolveAdvisories({ advisories: (c) => { seen = c; return []; }, ctx });
  assert.equal(seen, ctx);
});

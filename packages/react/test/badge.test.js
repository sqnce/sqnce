import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultGeneratedBadge, resolveGeneratedBadge } from "../src/badge.js";

test("defaultGeneratedBadge: a done step reads 'AI generated'", () => {
  assert.equal(defaultGeneratedBadge("done"), "AI generated");
});

test("defaultGeneratedBadge: draft and open keep 'AI draft'", () => {
  assert.equal(defaultGeneratedBadge("draft"), "AI draft");
  assert.equal(defaultGeneratedBadge("open"), "AI draft");
});

test("resolveGeneratedBadge: a non-generated output shows no badge", () => {
  assert.equal(resolveGeneratedBadge({ generated: false, lifecycle: "done", spec: {} }), null);
});

test("resolveGeneratedBadge: a generated done output uses the lifecycle default", () => {
  assert.equal(resolveGeneratedBadge({ generated: true, lifecycle: "done", spec: {} }), "AI generated");
});

test("resolveGeneratedBadge: a generated draft output keeps 'AI draft'", () => {
  assert.equal(resolveGeneratedBadge({ generated: true, lifecycle: "draft", spec: {} }), "AI draft");
});

test("resolveGeneratedBadge: a consumer resolver overrides the label", () => {
  const resolver = (lifecycle) => (lifecycle === "done" ? "ACCEPTED" : "DRAFT");
  assert.equal(resolveGeneratedBadge({ generated: true, lifecycle: "done", spec: {}, resolver }), "ACCEPTED");
});

test("resolveGeneratedBadge: a resolver returning null hides the badge", () => {
  assert.equal(resolveGeneratedBadge({ generated: true, lifecycle: "done", spec: {}, resolver: () => null }), null);
});

test("resolveGeneratedBadge: a resolver is never consulted for a non-generated output", () => {
  let called = false;
  const resolver = () => { called = true; return "X"; };
  assert.equal(resolveGeneratedBadge({ generated: false, lifecycle: "open", spec: {}, resolver }), null);
  assert.equal(called, false);
});

test("resolveGeneratedBadge: returns the trimmed label", () => {
  assert.equal(resolveGeneratedBadge({ generated: true, lifecycle: "done", spec: {}, resolver: () => "  Custom  " }), "Custom");
});

test("resolveGeneratedBadge: a throwing resolver degrades to no badge", () => {
  assert.equal(resolveGeneratedBadge({ generated: true, lifecycle: "done", spec: {}, resolver: () => { throw new Error("boom"); } }), null);
});

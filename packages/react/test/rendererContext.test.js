import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRendererContext } from "../src/rendererContext.js";

test("buildRendererContext: carries runId through", () => {
  const ctx = buildRendererContext({ workflowId: "w", stepId: "s", subject: "X", readOnly: false, runId: "r1" });
  assert.equal(ctx.runId, "r1");
});

test("buildRendererContext: runId is null when supplied as null (no active entry)", () => {
  const ctx = buildRendererContext({ workflowId: "w", stepId: "s", subject: "X", readOnly: false, runId: null });
  assert.equal(ctx.runId, null);
});

test("buildRendererContext: runId defaults to null when omitted", () => {
  const ctx = buildRendererContext({ workflowId: "w", stepId: "s", subject: "X", readOnly: false });
  assert.equal(ctx.runId, null);
});

test("buildRendererContext: carries the existing fields unchanged and adds no others", () => {
  const ctx = buildRendererContext({ workflowId: "w", stepId: "s", subject: "Subject", readOnly: true, runId: "r9" });
  assert.deepEqual(ctx, { workflowId: "w", stepId: "s", subject: "Subject", readOnly: true, runId: "r9" });
});

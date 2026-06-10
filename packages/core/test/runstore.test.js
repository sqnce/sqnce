import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRun,
  setOutput,
  setCheckedDone,
  createRunStore,
  createRunEntry,
  addRun,
} from "../src/index.js";

/* Minimal two-sub-stage definition: "a" is hybrid (one required fields
   step that doubles as the subject source), "b" is strict. */
export const DEF = {
  id: "wf",
  name: "Test Workflow",
  subject: { stepId: "s1", outputId: "facts", field: "client", fallback: "the client" },
  mainStages: [
    {
      id: "m1",
      name: "M1",
      subStages: [
        {
          id: "a",
          name: "A",
          gate: { type: "hybrid" },
          steps: [
            {
              id: "s1",
              name: "S1",
              required: true,
              outputs: [{ id: "facts", type: "fields", fields: [{ key: "client", label: "Client" }] }],
            },
          ],
        },
        { id: "b", name: "B", gate: { type: "strict" }, steps: [{ id: "s2", name: "S2", required: true }] },
      ],
    },
  ],
};

export const entryAt = (id, workflowId, now) =>
  createRunEntry({ id, workflowId, run: createRun(), now });

test("createRunStore returns an empty version 2 store", () => {
  assert.deepEqual(createRunStore(), {
    version: 2,
    activeWorkflowId: null,
    activeRunByWorkflow: {},
    entries: {},
  });
});

test("createRunEntry wraps a run with identity", () => {
  const run = createRun();
  const e = createRunEntry({ id: "r1", workflowId: "wf", run, now: 100 });
  assert.deepEqual(e, {
    id: "r1",
    workflowId: "wf",
    name: "",
    status: "active",
    createdAt: 100,
    updatedAt: 100,
    run,
  });
});

test("addRun inserts the entry and activates it without mutating the input", () => {
  const s0 = createRunStore();
  const s1 = addRun(s0, entryAt("r1", "wf", 100));
  assert.equal(s1.activeWorkflowId, "wf");
  assert.equal(s1.activeRunByWorkflow.wf, "r1");
  assert.equal(s1.entries.r1.id, "r1");
  assert.deepEqual(s0, createRunStore());
});

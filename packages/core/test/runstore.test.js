import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRun,
  setOutput,
  setCheckedDone,
  createRunStore,
  createRunEntry,
  addRun,
  renameRun,
  archiveRun,
  unarchiveRun,
  setActiveRun,
  updateRunState,
  runsForWorkflow,
  activeRunEntry,
  deleteRun,
  runSummary,
  runDisplayName,
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

test("createRunStore returns an empty version 3 store", () => {
  assert.deepEqual(createRunStore(), {
    version: 3,
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

test("renameRun sets a trimmed name and bumps updatedAt", () => {
  const s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  const s2 = renameRun(s, "r1", "  Acme pursuit  ", 200);
  assert.equal(s2.entries.r1.name, "Acme pursuit");
  assert.equal(s2.entries.r1.updatedAt, 200);
  assert.equal(s.entries.r1.name, "");
});

test("renameRun with an unknown id returns the store unchanged", () => {
  const s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  assert.equal(renameRun(s, "nope", "X", 200), s);
});

test("archiveRun flips status and keeps active mappings", () => {
  const s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  const s2 = archiveRun(s, "r1", 200);
  assert.equal(s2.entries.r1.status, "archived");
  assert.equal(s2.entries.r1.updatedAt, 200);
  assert.equal(s2.activeRunByWorkflow.wf, "r1");
  assert.equal(s2.activeWorkflowId, "wf");
});

test("unarchiveRun restores status active", () => {
  const s = archiveRun(addRun(createRunStore(), entryAt("r1", "wf", 100)), "r1", 200);
  const s2 = unarchiveRun(s, "r1", 300);
  assert.equal(s2.entries.r1.status, "active");
  assert.equal(s2.entries.r1.updatedAt, 300);
});

test("setActiveRun activates the run and its workflow", () => {
  let s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  s = addRun(s, entryAt("h1", "hiring", 200));
  const s2 = setActiveRun(s, "r1");
  assert.equal(s2.activeWorkflowId, "wf");
  assert.equal(s2.activeRunByWorkflow.wf, "r1");
  assert.equal(s2.activeRunByWorkflow.hiring, "h1");
});

test("setActiveRun works for archived entries and ignores unknown ids", () => {
  let s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  s = addRun(s, entryAt("r2", "wf", 200));
  s = archiveRun(s, "r1", 300);
  const s2 = setActiveRun(s, "r1");
  assert.equal(s2.activeRunByWorkflow.wf, "r1");
  assert.equal(setActiveRun(s, "nope"), s);
});

test("updateRunState replaces the inner run and bumps updatedAt", () => {
  const s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  const run = setOutput(createRun(), "s1", "facts", { client: "Acme" });
  const s2 = updateRunState(s, "r1", run, 200);
  assert.equal(s2.entries.r1.run, run);
  assert.equal(s2.entries.r1.updatedAt, 200);
  assert.equal(updateRunState(s, "nope", run, 200), s);
});

test("runsForWorkflow filters by workflow and orders by createdAt then id", () => {
  let s = addRun(createRunStore(), entryAt("b2", "wf", 200));
  s = addRun(s, entryAt("a1", "wf", 100));
  s = addRun(s, entryAt("a2", "wf", 200));
  s = addRun(s, entryAt("h1", "hiring", 50));
  s = archiveRun(s, "a1", 300);
  assert.deepEqual(
    runsForWorkflow(s, "wf").map((e) => e.id),
    ["a1", "a2", "b2"]
  );
});

test("activeRunEntry returns the active entry or null", () => {
  const s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  assert.equal(activeRunEntry(s, "wf").id, "r1");
  assert.equal(activeRunEntry(s, "hiring"), null);
});

test("deleteRun removes a non-active entry without touching mappings", () => {
  let s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  s = addRun(s, entryAt("r2", "wf", 200));
  const s2 = deleteRun(s, "r1");
  assert.equal(s2.entries.r1, undefined);
  assert.equal(s2.activeRunByWorkflow.wf, "r2");
});

test("deleteRun on the active run falls back to the most recently updated live run", () => {
  let s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  s = addRun(s, entryAt("r2", "wf", 300));
  s = addRun(s, entryAt("r3", "wf", 200));
  const s2 = deleteRun(s, "r3");
  assert.equal(s2.activeRunByWorkflow.wf, "r2");
});

test("deleteRun ignores archived runs when picking the fallback", () => {
  let s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  s = addRun(s, entryAt("r2", "wf", 200));
  s = addRun(s, entryAt("r3", "wf", 300));
  s = archiveRun(s, "r2", 400);
  const s2 = deleteRun(s, "r3");
  assert.equal(s2.activeRunByWorkflow.wf, "r1");
});

test("deleteRun on the last live run removes the workflow mapping", () => {
  let s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  s = addRun(s, entryAt("r2", "wf", 200));
  s = archiveRun(s, "r1", 300);
  const s2 = deleteRun(s, "r2");
  assert.equal(s2.activeRunByWorkflow.wf, undefined);
  assert.equal(s2.entries.r1.status, "archived");
  assert.equal(deleteRun(s2, "nope"), s2);
});

test("runSummary counts met sub-stage gates over the flattened total", () => {
  let run = createRun();
  assert.deepEqual(runSummary(DEF, run), { met: 0, total: 2 });
  run = setOutput(run, "s1", "facts", { client: "Acme" });
  assert.deepEqual(runSummary(DEF, run), { met: 1, total: 2 });
  run = setCheckedDone(run, "s2", true);
  assert.deepEqual(runSummary(DEF, run), { met: 2, total: 2 });
});

test("runDisplayName prefers the manual name", () => {
  let s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  s = renameRun(s, "r1", "Named", 200);
  s = updateRunState(s, "r1", setOutput(createRun(), "s1", "facts", { client: "Acme" }), 300);
  assert.equal(runDisplayName(DEF, s, "r1"), "Named");
});

test("runDisplayName falls back to the resolved subject", () => {
  let s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  s = updateRunState(s, "r1", setOutput(createRun(), "s1", "facts", { client: " Acme Logistics " }), 200);
  assert.equal(runDisplayName(DEF, s, "r1"), "Acme Logistics");
});

test("runDisplayName never uses the subject fallback string", () => {
  const s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  assert.equal(runDisplayName(DEF, s, "r1"), "Run 1");
});

test("runDisplayName numbers unnamed runs by creation order and ignores unknown ids", () => {
  let s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  s = addRun(s, entryAt("r2", "wf", 200));
  assert.equal(runDisplayName(DEF, s, "r2"), "Run 2");
  const s2 = deleteRun(s, "r1");
  assert.equal(runDisplayName(DEF, s2, "r2"), "Run 1");
  assert.equal(runDisplayName(DEF, s, "nope"), "");
});

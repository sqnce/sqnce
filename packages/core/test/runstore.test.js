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
  getStepEntry,
  cloneRun,
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

test("cloneRun full fork copies the run under a new id with id === key", () => {
  let s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  s = updateRunState(s, "r1", setOutput(createRun(), "s1", "facts", { client: "Acme" }), 150);
  s = cloneRun(s, { fromId: "r1", newId: "r2", name: "  variant-a  ", now: 200 });
  const c = s.entries["r2"];
  assert.equal(c.id, "r2");
  assert.equal(c.workflowId, "wf");
  assert.equal(c.status, "active");
  assert.equal(c.name, "variant-a");
  assert.equal(c.createdAt, 200);
  assert.equal(c.updatedAt, 200);
  assert.deepEqual(c.run, s.entries["r1"].run);
  assert.equal(Object.keys(s.entries).length, 2);
});

test("cloneRun leaves the active-run mapping untouched", () => {
  let s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  const beforeActive = { ...s.activeRunByWorkflow };
  const beforeWf = s.activeWorkflowId;
  s = cloneRun(s, { fromId: "r1", newId: "r2", now: 200 });
  assert.equal(s.activeWorkflowId, beforeWf);
  assert.deepEqual(s.activeRunByWorkflow, beforeActive);
  assert.equal(s.activeRunByWorkflow["wf"], "r1");
});

test("cloneRun clone is a native run: setOutput advances its own state, not the source", () => {
  let s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  s = cloneRun(s, { fromId: "r1", newId: "r2", now: 200 });
  const driven = setOutput(s.entries["r2"].run, "s1", "facts", { client: "Beta" });
  s = updateRunState(s, "r2", driven, 300);
  assert.deepEqual(getStepEntry(s.entries["r2"].run, "s1").outputs, { facts: { client: "Beta" } });
  assert.deepEqual(s.entries["r1"].run.stepState, {});
  assert.equal(Object.keys(s.entries).length, 2);
});

test("cloneRun deep-copies: clone and source do not alias", () => {
  let s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  s = updateRunState(s, "r1", {
    idx: 0, frontier: 0,
    stepState: { s1: { checkedDone: false, outputs: { facts: { client: "Acme" } } } },
    skips: { b: true }, forces: { 0: true },
  }, 150);
  s = cloneRun(s, { fromId: "r1", newId: "r2", now: 200 });
  const src = s.entries["r1"].run, cl = s.entries["r2"].run;
  assert.notEqual(cl, src);
  assert.notEqual(cl.stepState, src.stepState);
  assert.notEqual(cl.skips, src.skips);
  assert.notEqual(cl.forces, src.forces);
  assert.notEqual(cl.stepState.s1, src.stepState.s1);
});

test("cloneRun forks an archived run into an active clone", () => {
  let s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  s = archiveRun(s, "r1", 150);
  s = cloneRun(s, { fromId: "r1", newId: "r2", now: 200 });
  assert.equal(s.entries["r1"].status, "archived");
  assert.equal(s.entries["r2"].status, "active");
});

test("cloneRun throws on unknown fromId", () => {
  const s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  assert.throws(() => cloneRun(s, { fromId: "nope", newId: "r2", now: 200 }), /no run with id/);
});

test("cloneRun throws on an existing newId", () => {
  let s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  s = addRun(s, entryAt("r2", "wf", 150));
  assert.throws(() => cloneRun(s, { fromId: "r1", newId: "r2", now: 200 }), /already exists/);
});

test("cloneRun throws on a non-string or empty newId", () => {
  const s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  assert.throws(() => cloneRun(s, { fromId: "r1", newId: "", now: 200 }), /non-empty string/);
  assert.throws(() => cloneRun(s, { fromId: "r1", newId: "   ", now: 200 }), /non-empty string/);
  assert.throws(() => cloneRun(s, { fromId: "r1", newId: 42, now: 200 }), /non-empty string/);
});

test("cloneRun does not mutate the input store", () => {
  const s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  const snapshot = structuredClone(s);
  cloneRun(s, { fromId: "r1", newId: "r2", now: 200 });
  assert.deepEqual(s, snapshot);
});

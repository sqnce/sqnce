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

/* Three-main-stage fixture for truncation. Flat sub-stage indices:
   a0=0, a0x=1 (skippable) in m0; a1=2 in m1; a2=3 in m2. */
const MULTI = {
  id: "multi",
  name: "Multi",
  mainStages: [
    { id: "m0", name: "M0", subStages: [
      { id: "a0", name: "A0", gate: { type: "hybrid" }, steps: [{ id: "p0", name: "P0" }] },
      { id: "a0x", name: "A0x", skippable: true, gate: { type: "hybrid" }, steps: [{ id: "px", name: "PX" }] },
    ] },
    { id: "m1", name: "M1", subStages: [
      { id: "a1", name: "A1", gate: { type: "hybrid" }, steps: [{ id: "p1", name: "P1" }] },
    ] },
    { id: "m2", name: "M2", subStages: [
      { id: "a2", name: "A2", gate: { type: "hybrid" }, steps: [{ id: "p2", name: "P2" }] },
    ] },
  ],
};

const multiSource = () => ({
  idx: 3,
  frontier: 2,
  stepState: {
    p0: { checkedDone: true, outputs: { v: 0 } },
    px: { checkedDone: true, outputs: {} },
    p1: { checkedDone: true, outputs: { v: 1 } },
    p2: { checkedDone: false, outputs: { v: 2 } },
  },
  skips: { a0x: true },
  forces: { 0: true, 1: true },
});

const multiStore = (run) =>
  addRun(createRunStore(), createRunEntry({ id: "r1", workflowId: "multi", run, now: 100 }));

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

test("cloneRun throws when newId === fromId", () => {
  const s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  assert.throws(() => cloneRun(s, { fromId: "r1", newId: "r1", now: 200 }), /must differ/);
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

test("cloneRun truncated fork keeps work up to the fork main stage", () => {
  let s = multiStore(multiSource());
  s = cloneRun(s, { fromId: "r1", newId: "r2", now: 200, uptoStageId: "m1", definition: MULTI });
  const r = s.entries["r2"].run;
  assert.equal(r.frontier, 1);
  assert.deepEqual(Object.keys(r.stepState).sort(), ["p0", "p1", "px"]);
  assert.equal(r.idx, 2);
  assert.deepEqual(r.skips, { a0x: true });
  assert.deepEqual(r.forces, { 0: true });
});

test("cloneRun truncated to the current frontier keeps the whole committed prefix", () => {
  let s = multiStore(multiSource());
  s = cloneRun(s, { fromId: "r1", newId: "r2", now: 200, uptoStageId: "m2", definition: MULTI });
  const r = s.entries["r2"].run;
  assert.equal(r.frontier, 2);
  assert.deepEqual(Object.keys(r.stepState).sort(), ["p0", "p1", "p2", "px"]);
  assert.deepEqual(r.forces, { 0: true, 1: true });
  assert.equal(r.idx, 3);
});

test("cloneRun truncated fork drops empty skips/forces maps", () => {
  const run = { idx: 1, frontier: 1, stepState: {
    p0: { checkedDone: true, outputs: {} }, p1: { checkedDone: true, outputs: {} },
  } };
  let s = multiStore(run);
  s = cloneRun(s, { fromId: "r1", newId: "r2", now: 200, uptoStageId: "m0", definition: MULTI });
  const r = s.entries["r2"].run;
  assert.equal(r.frontier, 0);
  assert.deepEqual(Object.keys(r.stepState), ["p0"]);
  assert.ok(!("skips" in r));
  assert.ok(!("forces" in r));
});

test("cloneRun truncated clone is drivable and isolated from the source", () => {
  let s = multiStore(multiSource());
  s = cloneRun(s, { fromId: "r1", newId: "r2", now: 200, uptoStageId: "m1", definition: MULTI });
  const driven = setOutput(s.entries["r2"].run, "p1", "v", 99);
  s = updateRunState(s, "r2", driven, 300);
  assert.equal(getStepEntry(s.entries["r2"].run, "p1").outputs.v, 99);
  assert.equal(s.entries["r1"].run.stepState.p1.outputs.v, 1);
});

test("cloneRun throws when uptoStageId is given without a definition", () => {
  const s = multiStore(multiSource());
  assert.throws(() => cloneRun(s, { fromId: "r1", newId: "r2", now: 200, uptoStageId: "m1" }),
    /requires a definition/);
});

test("cloneRun throws when the definition is not the run's workflow", () => {
  const s = multiStore(multiSource());
  assert.throws(() => cloneRun(s, { fromId: "r1", newId: "r2", now: 200, uptoStageId: "m1",
    definition: { ...MULTI, id: "other" } }), /not the run's workflow/);
});

test("cloneRun throws on an unknown uptoStageId", () => {
  const s = multiStore(multiSource());
  assert.throws(() => cloneRun(s, { fromId: "r1", newId: "r2", now: 200, uptoStageId: "ghost",
    definition: MULTI }), /no main stage/);
});

test("cloneRun throws on an ambiguous (duplicate) uptoStageId", () => {
  const dup = { ...MULTI, mainStages: [...MULTI.mainStages,
    { id: "m0", name: "dup", subStages: [{ id: "az", name: "AZ", gate: { type: "hybrid" }, steps: [{ id: "pz", name: "PZ" }] }] }] };
  const s = multiStore(multiSource());
  assert.throws(() => cloneRun(s, { fromId: "r1", newId: "r2", now: 200, uptoStageId: "m0",
    definition: dup }), /ambiguous/);
});

test("cloneRun throws when uptoStageId is beyond the frontier", () => {
  const run = { idx: 0, frontier: 0, stepState: { p0: { checkedDone: true, outputs: {} } } };
  const s = multiStore(run);
  assert.throws(() => cloneRun(s, { fromId: "r1", newId: "r2", now: 200, uptoStageId: "m2",
    definition: MULTI }), /beyond the run frontier/);
});

test("cloneRun throws when the run holds a step absent from the definition", () => {
  const run = { idx: 0, frontier: 0, stepState: {
    p0: { checkedDone: true, outputs: {} }, ghost: { checkedDone: true, outputs: {} },
  } };
  const s = multiStore(run);
  assert.throws(() => cloneRun(s, { fromId: "r1", newId: "r2", now: 200, uptoStageId: "m0",
    definition: MULTI }), /step "ghost" is not in definition/);
});

test("cloneRun throws when a kept skip's sub-stage is no longer skippable", () => {
  const run = { idx: 0, frontier: 0, stepState: { p0: { checkedDone: true, outputs: {} } }, skips: { a0: true } };
  const s = multiStore(run);
  assert.throws(() => cloneRun(s, { fromId: "r1", newId: "r2", now: 200, uptoStageId: "m0",
    definition: MULTI }), /no longer skippable/);
});

test("cloneRun throws when the run holds a skip sub-stage absent from the definition", () => {
  const run = { idx: 0, frontier: 0, stepState: { p0: { checkedDone: true, outputs: {} } }, skips: { ghost: true } };
  const s = multiStore(run);
  assert.throws(() => cloneRun(s, { fromId: "r1", newId: "r2", now: 200, uptoStageId: "m0",
    definition: MULTI }), /skip sub-stage "ghost" is not in definition/);
});

test("cloneRun treats inherited property names as absent run ids", () => {
  let s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  assert.throws(() => cloneRun(s, { fromId: "toString", newId: "r2", now: 200 }), /no run with id/);
  s = cloneRun(s, { fromId: "r1", newId: "constructor", now: 200 });
  assert.equal(s.entries["constructor"].id, "constructor");
  assert.equal(s.entries["constructor"].workflowId, "wf");
});

/* #69: every run-store accessor keyed by a run id must treat an id equal to
   an inherited Object.prototype member ("toString", "constructor", "valueOf",
   ...) as absent, never resolving to the prototype member. Mirrors the
   own-property guard #67 added to cloneRun. */

test("renameRun treats an inherited property name as an absent run id", () => {
  const s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  assert.deepEqual(renameRun(s, "toString", "x", 200), s);
});

test("archiveRun treats an inherited property name as an absent run id", () => {
  const s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  assert.deepEqual(archiveRun(s, "toString", 200), s);
});

test("unarchiveRun treats an inherited property name as an absent run id", () => {
  const s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  assert.deepEqual(unarchiveRun(s, "constructor", 200), s);
});

test("setActiveRun treats an inherited property name as an absent run id", () => {
  const s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  assert.deepEqual(setActiveRun(s, "toString"), s);
});

test("updateRunState treats an inherited property name as an absent run id", () => {
  const s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  assert.deepEqual(updateRunState(s, "toString", createRun(), 200), s);
});

test("deleteRun treats an inherited property name as an absent run id", () => {
  const s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  assert.deepEqual(deleteRun(s, "constructor"), s);
});

test("activeRunEntry returns null when the active mapping points at an inherited name", () => {
  const s = { ...createRunStore(), activeRunByWorkflow: { wf: "toString" } };
  assert.equal(activeRunEntry(s, "wf"), null);
});

test("runDisplayName treats an inherited property name as an absent run id", () => {
  const s = addRun(createRunStore(), entryAt("r1", "wf", 100));
  assert.equal(runDisplayName(DEF, s, "toString"), "");
});

test("accessors still operate on a real run whose id is an inherited name", () => {
  let s = addRun(createRunStore(), createRunEntry({ id: "constructor", workflowId: "wf", run: createRun(), now: 100 }));
  s = renameRun(s, "constructor", "named", 200);
  assert.equal(s.entries["constructor"].name, "named");
  s = archiveRun(s, "constructor", 300);
  assert.equal(s.entries["constructor"].status, "archived");
  assert.equal(activeRunEntry(s, "wf"), s.entries["constructor"]);
  assert.equal(runDisplayName(DEF, s, "constructor"), "named");
  s = deleteRun(s, "constructor");
  assert.equal(Object.prototype.hasOwnProperty.call(s.entries, "constructor"), false);
});

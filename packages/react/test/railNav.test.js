import { test } from "node:test";
import assert from "node:assert/strict";
import {
  flattenSubStages,
  createRun,
  setOutput,
  advance,
  jumpTo,
  skipTrack,
} from "@sqnce/core";
import { railChip } from "../src/railNav.js";

/* Minimal linear definition: four hybrid-gated main stages, one sub-stage and
   one required text step each. The flat index equals the main index here. */
const LINEAR = {
  id: "lin",
  name: "Linear",
  subject: { stepId: "a", outputId: "o", field: "x", fallback: "?" },
  mainStages: [
    { id: "m0", name: "Intake", subStages: [{ id: "m0s", name: "Intake", gate: { type: "hybrid" }, steps: [{ id: "a", name: "A", required: true, outputs: [{ id: "o", type: "text", label: "O" }] }] }] },
    { id: "m1", name: "Findings", subStages: [{ id: "m1s", name: "Findings", gate: { type: "hybrid" }, steps: [{ id: "b", name: "B", required: true, outputs: [{ id: "o2", type: "text", label: "O2" }] }] }] },
    { id: "m2", name: "Design", subStages: [{ id: "m2s", name: "Design", gate: { type: "hybrid" }, steps: [{ id: "c", name: "C", required: true, outputs: [{ id: "o3", type: "text", label: "O3" }] }] }] },
    { id: "m3", name: "Deliver", subStages: [{ id: "m3s", name: "Deliver", gate: { type: "hybrid" }, steps: [{ id: "d", name: "D", required: true, outputs: [{ id: "o4", type: "text", label: "O4" }] }] }] },
  ],
};

/* Minimal forked definition: two-stage spine, one optional demo track stage,
   one required response track stage. */
const FORKED = {
  id: "frk",
  name: "Forked",
  subject: { stepId: "a", outputId: "o", field: "x", fallback: "?" },
  tracks: [
    { id: "demo", name: "Demo", optional: true },
    { id: "resp", name: "Resp" },
  ],
  mainStages: [
    { id: "s0", name: "Intake", subStages: [{ id: "s0s", name: "Intake", gate: { type: "hybrid" }, steps: [{ id: "a", name: "A", required: true, outputs: [{ id: "o", type: "text", label: "O" }] }] }] },
    { id: "s1", name: "Findings", subStages: [{ id: "s1s", name: "Findings", gate: { type: "hybrid" }, steps: [{ id: "b", name: "B", required: true, outputs: [{ id: "o2", type: "text", label: "O2" }] }] }] },
    { id: "d0", name: "Demo", track: "demo", subStages: [{ id: "d0s", name: "Demo", gate: { type: "hybrid" }, steps: [{ id: "c", name: "C", required: true, outputs: [{ id: "o3", type: "text", label: "O3" }] }] }] },
    { id: "r0", name: "Resp", track: "resp", subStages: [{ id: "r0s", name: "Resp", gate: { type: "hybrid" }, steps: [{ id: "e", name: "E", required: true, outputs: [{ id: "o4", type: "text", label: "O4" }] }] }] },
  ],
};

test("railChip linear: committed-and-met stage is a done, interactive tick", () => {
  const subs = flattenSubStages(LINEAR);
  let r = createRun();
  r = setOutput(r, "a", "o", "x", {});
  r = advance(r, subs).run;
  const c0 = railChip(r, subs, LINEAR.mainStages, 0, undefined);
  assert.equal(c0.reachable, true);
  assert.equal(c0.interactive, true);
  assert.equal(c0.glyph, "✓");
  assert.equal(c0.state, "done");
  assert.equal(c0.firstFlat, 0);
});

test("railChip linear: an ahead stage is locked and non-interactive", () => {
  const subs = flattenSubStages(LINEAR);
  let r = createRun();
  r = setOutput(r, "a", "o", "x", {});
  r = advance(r, subs).run;
  const c3 = railChip(r, subs, LINEAR.mainStages, 3, undefined);
  assert.equal(c3.reachable, false);
  assert.equal(c3.interactive, false);
  assert.equal(c3.glyph, "🔒");
});

test("railChip linear: a forced-but-unmet committed stage is interactive with a number glyph", () => {
  const subs = flattenSubStages(LINEAR);
  let r = createRun();
  r = advance(r, subs, { force: true }).run;
  const c0 = railChip(r, subs, LINEAR.mainStages, 0, undefined);
  assert.equal(c0.reachable, true);
  assert.equal(c0.interactive, true);
  assert.equal(c0.glyph, "1");
});

test("railChip forked: a committed track stage past the spine frontier is interactive with a number glyph", () => {
  const subs = flattenSubStages(FORKED);
  let r = createRun();
  r = setOutput(r, "a", "o", "x", {});
  r = advance(r, subs).run;
  r = setOutput(r, "b", "o2", "y", {});
  r = advance(r, subs).run;
  const cDemo = railChip(r, subs, FORKED.mainStages, 2, undefined);
  assert.equal(cDemo.reachable, true);
  assert.equal(cDemo.interactive, true);
  assert.equal(cDemo.glyph, "3");
});

test("railChip forked: a skipped track's stage is locked and non-interactive", () => {
  const subs = flattenSubStages(FORKED);
  let r = createRun();
  r = setOutput(r, "a", "o", "x", {});
  r = advance(r, subs).run;
  r = setOutput(r, "b", "o2", "y", {});
  r = advance(r, subs).run;
  r = skipTrack(r, FORKED, "demo");
  r = jumpTo(r, subs, 1);
  const cDemo = railChip(r, subs, FORKED.mainStages, 2, undefined);
  assert.equal(cDemo.reachable, false);
  assert.equal(cDemo.interactive, false);
  assert.equal(cDemo.glyph, "🔒");
});

test("railChip forked: an optional track filled then skipped reads as locked, not done", () => {
  const subs = flattenSubStages(FORKED);
  let r = createRun();
  r = setOutput(r, "a", "o", "x", {});
  r = advance(r, subs).run;
  r = setOutput(r, "b", "o2", "y", {});
  r = advance(r, subs).run;
  r = setOutput(r, "c", "o3", "z", {});
  r = skipTrack(r, FORKED, "demo");
  r = jumpTo(r, subs, 1);
  const cDemo = railChip(r, subs, FORKED.mainStages, 2, undefined);
  assert.equal(cDemo.reachable, false);
  assert.equal(cDemo.interactive, false);
  assert.equal(cDemo.glyph, "🔒");
  assert.notEqual(cDemo.state, "done");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  flattenSubStages,
  createRun,
  advance,
  browse,
  jumpTo,
  runSummary,
  isRunComplete,
  trackStatus,
} from "../src/index.js";
import { FIXTURE } from "./fixtures/workflow.js"; // linear
import { FORKED } from "./fixtures/forked.js"; // two tracks (demo optional, response)

/*
 * Characterization guard for the #114 topology consolidation: pins the
 * observable outputs of the read aggregates and navigation for a linear and a
 * forked run, captured from the pre-refactor engine. Any drift introduced while
 * routing the duplicated derivations through shared helpers breaks at least one
 * assertion here. Assertions are on observable outputs only, never internals.
 */

test("linear topology behavior is unchanged", () => {
  const subs = flattenSubStages(FIXTURE);
  assert.equal(subs.length, 3);
  const r0 = createRun();
  assert.deepEqual(runSummary(FIXTURE, r0), { met: 0, total: 3 });
  assert.equal(isRunComplete(FIXTURE, r0), false);
  const adv = advance(r0, subs, { force: true });
  assert.equal(adv.advanced, true);
  assert.equal(adv.run.idx, 2);
  assert.equal(adv.run.frontier, 1);
  assert.equal(browse(r0, subs, 1).idx, 1); // forward one within the committed prefix
  assert.equal(jumpTo(r0, subs, 5).idx, 0); // out of range at frontier 0: no-op
});

test("forked topology behavior is unchanged across open/not-open", () => {
  const subs = flattenSubStages(FORKED);
  assert.equal(subs.length, 8);
  const r0 = createRun();
  assert.equal(trackStatus(FORKED, r0, "demo"), "not-open");
  assert.equal(trackStatus(FORKED, r0, "response"), "not-open");
  assert.equal(isRunComplete(FORKED, r0), false);
  assert.deepEqual(runSummary(FORKED, r0), { met: 1, total: 8 });
  // commit the two-stage spine with forced advances; the second opens the fork.
  let r = advance(r0, subs, { force: true }).run;
  r = advance(r, subs, { force: true }).run;
  assert.equal(r.frontier, 1);
  assert.deepEqual(r.trackFrontier, { demo: 2, response: 5 });
  assert.equal(trackStatus(FORKED, r, "demo"), "active");
  assert.equal(trackStatus(FORKED, r, "response"), "active");
  assert.equal(isRunComplete(FORKED, r), false);
});

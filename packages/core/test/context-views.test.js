import { test } from "node:test";
import assert from "node:assert/strict";
import {
  flattenSubStages,
  validateDefinition,
  createRun,
  setOutput,
  getStepEntry,
  isStepComplete,
  buildContext,
  buildDraftPrompt,
  serializeStep,
} from "../src/index.js";
import { FIXTURE } from "./fixtures/workflow.js";

// ---- shared helpers (consumer-style, proving core never needs the format) ----
const MATERIALS =
  "=== [input-001] a.md ===\n\nalpha body\n\n=== [input-002] b.md ===\n\nbeta body";
function splitByHeader(text) {
  const re = /^=== \[(input-\d{3})\] .*$/gm;
  const marks = [];
  let m;
  while ((m = re.exec(text))) marks.push({ id: m[1], start: m.index });
  return marks.map((mk, i) => ({
    id: mk.id,
    slice: text.slice(mk.start, i + 1 < marks.length ? marks[i + 1].start : text.length),
  }));
}
const keepOnly = (text, ids) =>
  splitByHeader(text)
    .filter((s) => ids.has(s.id))
    .map((s) => s.slice)
    .join("")
    .trimEnd();

test("validateDefinition accepts a non-empty contextView on a step", () => {
  // FIXTURE's approve step carries contextView: "select" (added in this task's fixture edit).
  assert.deepEqual(validateDefinition(FIXTURE), []);
});

test("validateDefinition rejects an empty or non-string contextView", () => {
  const bad = structuredClone(FIXTURE);
  // approve is the single step in omega/signoff
  bad.mainStages[1].subStages[0].steps[0].contextView = "  ";
  assert.ok(
    validateDefinition(bad).some((p) => /contextView must be a non-empty string/.test(p)),
    "empty contextView must be reported"
  );
  const bad2 = structuredClone(FIXTURE);
  bad2.mainStages[1].subStages[0].steps[0].contextView = 5;
  assert.ok(validateDefinition(bad2).some((p) => /contextView must be a non-empty string/.test(p)));
});

# definitions decoupling implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the claude-artifact example, move core's engine tests onto a core-owned fixture, and record the definitions ownership decision, per docs/specs/34-definitions-decoupling.md.

**Architecture:** Three ordered chunks in one PR: #10 removes `examples/claude-artifact/` and its living-doc references; #34 introduces `packages/core/test/fixtures/workflow.js` and rewrites `packages/core/test/engine.test.js` against it, with the bundled-definitions validation test discovering files by directory read; #35 records the option (a) ownership decision in CLAUDE.md.

**Tech Stack:** Plain ESM JavaScript, Node built-in test runner (`node:test`, Node 20+), no new dependencies.

---

### Task 1: Remove the claude-artifact example (#10)

**Files:**
- Delete: `examples/claude-artifact/` (entire directory)
- Modify: `CLAUDE.md` (architecture item 4)
- Modify: `README.md` (Packages table row)

- [ ] **Step 1: Delete the directory**

```bash
git rm -r examples/claude-artifact
```

- [ ] **Step 2: Remove architecture layer 4 from CLAUDE.md**

Delete this entire numbered item from the `## Architecture (do not blur these layers)` section (items 1 to 3 stay untouched):

```markdown
4. **Artifact example** (`examples/claude-artifact/process-rolodex.jsx`): a self-contained copy that runs in claude.ai with inlined configs, the Anthropic API for drafts, and `window.storage` persistence. When engine or UI behavior changes, update this file to match.
```

- [ ] **Step 3: Remove the artifact row from the README Packages table**

Delete this row from the `## Packages` table (README.md line 50):

```markdown
| `/examples/claude-artifact` | A fully self-contained version that runs as a claude.ai artifact, with Claude-powered draft generation and artifact storage persistence. |
```

- [ ] **Step 4: Verify no living doc still references the artifact**

Run: `rg -l claude-artifact --glob '!docs/specs/**' --glob '!docs/superpowers/**'`
Expected: no matches. (Historical specs under `docs/specs/` and `docs/superpowers/` keep their references by spec decision.)

- [ ] **Step 5: Run the checks**

Run: `npm test` then `npm run build -w examples/demo`
Expected: all tests pass; demo build succeeds (nothing imports the artifact).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "remove the claude-artifact example (#10)"
```

### Task 2: Core-owned test fixture (#34)

**Files:**
- Create: `packages/core/test/fixtures/workflow.js`
- Modify: `packages/core/test/engine.test.js` (add fixture validation test)

- [ ] **Step 1: Create the fixture module**

Create `packages/core/test/fixtures/workflow.js` with exactly:

```js
/*
 * Minimal definition owned by core's test suite, per
 * docs/specs/34-definitions-decoupling.md. Coverage floor: two main
 * stages, three sub-stages, both gate types, all five output types,
 * a render hint, a subject with field and fallback, required steps,
 * a checklist step, and an aiPrompt. Engine behavior tests assert
 * against this content, never against bundled definitions.
 */
export const FIXTURE = {
  id: "fixture",
  name: "Fixture Process",
  subject: { stepId: "intake", outputId: "facts", field: "client", fallback: "the client" },
  mainStages: [
    {
      id: "alpha",
      name: "Alpha",
      subStages: [
        {
          id: "start",
          name: "Start",
          description: "Collect the basics.",
          gate: { type: "hybrid" },
          steps: [
            {
              id: "intake",
              name: "Intake",
              required: true,
              outputs: [
                {
                  id: "facts",
                  type: "fields",
                  label: "Facts",
                  fields: [
                    { key: "client", label: "Client" },
                    { key: "industry", label: "Industry" },
                  ],
                },
              ],
            },
            { id: "kickoff", name: "Kickoff", required: true },
          ],
        },
        {
          id: "collect",
          name: "Collect",
          description: "Gather and summarize evidence.",
          gate: { type: "hybrid" },
          steps: [
            {
              id: "evidence",
              name: "Evidence",
              required: true,
              outputs: [
                { id: "doc", type: "file", label: "Document" },
                { id: "source", type: "link", label: "Source" },
              ],
            },
            {
              id: "summary",
              name: "Summary",
              aiPrompt: "Summarize the evidence.",
              outputs: [
                { id: "out", type: "text", label: "Summary", render: { kind: "markdown" } },
              ],
            },
            {
              id: "inventory",
              name: "Inventory",
              outputs: [{ id: "data", type: "data", label: "Inventory" }],
            },
          ],
        },
      ],
    },
    {
      id: "omega",
      name: "Omega",
      subStages: [
        {
          id: "signoff",
          name: "Sign-off",
          gate: { type: "strict" },
          steps: [
            {
              id: "approve",
              name: "Approve",
              required: true,
              outputs: [{ id: "memo", type: "text", label: "Memo" }],
            },
          ],
        },
      ],
    },
  ],
};
```

- [ ] **Step 2: Add the fixture validation test**

In `packages/core/test/engine.test.js`, add the import and one test (the rest of the file is rewritten in Task 3; this step only proves the fixture loads and validates):

```js
import { FIXTURE } from "./fixtures/workflow.js";

test("the test fixture validates", () => {
  assert.deepEqual(validateDefinition(FIXTURE), []);
});
```

- [ ] **Step 3: Run the test**

Run: `npm test`
Expected: PASS, including "the test fixture validates".

- [ ] **Step 4: Commit**

```bash
git add packages/core/test/fixtures/workflow.js packages/core/test/engine.test.js
git commit -m "core: add fixture definition for engine tests (#34)"
```

### Task 3: Rewrite engine tests against the fixture, glob the validation test (#34)

**Files:**
- Modify: `packages/core/test/engine.test.js` (full rewrite of the top half; the inline-definition tests at the bottom stay byte-identical)

- [ ] **Step 1: Replace the file's imports, fixture loading, and behavior tests**

The new `engine.test.js` from the top through the buildContext test reads exactly as follows. Everything after it (the existing `hasValue treats empty values as absent`, `validateDefinition catches structural problems`, `validateDefinition accepts the data output type`, `validateDefinition checks render hints`, `hasValue for data outputs`, and `serializeStep serializes data outputs as capped JSON` tests) stays exactly as it is today; those tests already construct their own minimal inline definitions.

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  flattenSubStages,
  validateDefinition,
  createRun,
  setOutput,
  setCheckedDone,
  isStepComplete,
  getStepEntry,
  gateProgress,
  browse,
  jumpTo,
  advance,
  resolveSubject,
  buildContext,
  buildDraftPrompt,
  hasValue,
  serializeStep,
} from "../src/index.js";
import { FIXTURE } from "./fixtures/workflow.js";

const here = dirname(fileURLToPath(import.meta.url));
const defsDir = join(here, "..", "..", "..", "definitions");

test("all bundled definitions validate", () => {
  const names = readdirSync(defsDir).filter((n) => n.endsWith(".json"));
  assert.ok(names.length > 0, "definitions/ contains no .json files");
  for (const name of names) {
    const def = JSON.parse(readFileSync(join(defsDir, name), "utf8"));
    const problems = validateDefinition(def);
    assert.deepEqual(problems, [], `${name}: ${problems.join("; ")}`);
  }
});

test("the test fixture validates", () => {
  assert.deepEqual(validateDefinition(FIXTURE), []);
});

test("flatten produces an ordered sequence with main stage annotations", () => {
  const subs = flattenSubStages(FIXTURE);
  assert.equal(subs.length, 3);
  assert.equal(subs[0].id, "start");
  assert.equal(subs[0].mainName, "Alpha");
  assert.equal(subs[subs.length - 1].mainName, "Omega");
});

test("hybrid gate: output alone completes a step; strict requires explicit done", () => {
  const subs = flattenSubStages(FIXTURE);
  const collect = subs.find((s) => s.id === "collect");
  const summary = collect.steps.find((s) => s.id === "summary");
  const evidence = collect.steps.find((s) => s.id === "evidence");

  let run = createRun();
  run = setOutput(run, "summary", "out", "Evidence points one way.");
  assert.equal(isStepComplete(summary, getStepEntry(run, "summary"), "hybrid"), true);
  assert.equal(isStepComplete(summary, getStepEntry(run, "summary"), "strict"), false);

  run = setOutput(run, "evidence", "doc", { name: "report.pdf", content: "" });
  assert.equal(isStepComplete(evidence, getStepEntry(run, "evidence"), "hybrid"), true);

  run = setCheckedDone(run, "summary", true);
  assert.equal(isStepComplete(summary, getStepEntry(run, "summary"), "strict"), true);
});

test("gateProgress reports missing required steps by name", () => {
  const subs = flattenSubStages(FIXTURE);
  const start = subs[0];
  let run = createRun();
  let p = gateProgress(start, run);
  assert.equal(p.met, false);
  assert.equal(p.total, 2);
  assert.ok(p.missing.includes("Intake"));
  assert.ok(p.missing.includes("Kickoff"));

  run = setOutput(run, "intake", "facts", { client: "Vexel Tools" });
  run = setCheckedDone(run, "kickoff", true);
  p = gateProgress(start, run);
  assert.equal(p.met, true);
  assert.deepEqual(p.missing, []);
});

test("advance is blocked at an unmet gate, allowed when met, and forceable", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();

  let result = advance(run, subs);
  assert.equal(result.advanced, false);
  assert.ok(result.missing.length > 0);

  result = advance(run, subs, { force: true });
  assert.equal(result.advanced, true);
  assert.equal(result.run.idx, 1);
  assert.equal(result.run.frontier, 1);
});

test("browse stays within [0, frontier]; jumpTo respects the frontier", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = advance(run, subs, { force: true }).run;
  assert.equal(run.frontier, 1);

  run = jumpTo(run, subs, 2); // beyond frontier: no-op
  assert.equal(run.idx, 1);

  run = advance(run, subs, { force: true }).run;
  assert.equal(run.frontier, 2);

  run = browse(run, subs, -1);
  assert.equal(run.idx, 1);
  run = browse(run, subs, 1);
  assert.equal(run.idx, 2);
  run = browse(run, subs, 1); // beyond frontier: no-op
  assert.equal(run.idx, 2);

  run = jumpTo(run, subs, 0);
  assert.equal(run.idx, 0);
});

test("advancing from a non-frontier (browsing) position is a no-op", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = advance(run, subs, { force: true }).run;
  run = browse(run, subs, -1);
  const result = advance(run, subs, { force: true });
  assert.equal(result.advanced, false);
  assert.equal(result.run.frontier, 1);
});

test("subject resolves from the configured field with fallback", () => {
  let run = createRun();
  assert.equal(resolveSubject(FIXTURE, run), "the client");
  run = setOutput(run, "intake", "facts", { client: "Vexel Tools" });
  assert.equal(resolveSubject(FIXTURE, run), "Vexel Tools");
});

test("buildContext only includes completed prior outputs; prompt references the subject", () => {
  const subs = flattenSubStages(FIXTURE);
  let run = createRun();
  run = setOutput(run, "intake", "facts", { client: "Vexel Tools", industry: "Tooling" });
  run = setCheckedDone(run, "kickoff", true);
  run = advance(run, subs).run;
  assert.equal(run.idx, 1);

  const ctx = buildContext(subs, run, run.idx);
  assert.match(ctx, /Vexel Tools/);
  assert.doesNotMatch(ctx, /Summary/);

  const summary = subs[1].steps.find((s) => s.id === "summary");
  const prompt = buildDraftPrompt(FIXTURE, subs, run, run.idx, summary);
  assert.match(prompt, /Vexel Tools/);
  assert.match(prompt, /Summarize the evidence\./);
});
```

Notes on intent, for review against the spec:
- The bundled-definitions test now discovers `definitions/*.json` with `readdirSync` and fails loudly on an empty directory.
- The unforced `advance` at a met gate (buildContext test) is new coverage; the original suite only advanced with `force`.
- The hybrid-gate test now also covers file-output completion (`evidence`), preserving the file-value gating coverage the presales-based gateProgress test used to provide.

- [ ] **Step 2: Run the tests**

Run: `npm test`
Expected: PASS, every test green.

- [ ] **Step 3: Verify no demo content remains in the test file**

Run: `rg -i "presales|ironclad|pain-points|rfp" packages/core/test/`
Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add packages/core/test/engine.test.js
git commit -m "core: engine behavior tests run on the fixture; validation test globs definitions/ (#34)"
```

### Task 4: Record the ownership decision (#35)

**Files:**
- Modify: `CLAUDE.md` (architecture item 1)

- [ ] **Step 1: Extend architecture item 1 in CLAUDE.md**

Append to the end of architecture item 1 (the `**Definitions**` item, after "...the test suite checks all bundled definitions."):

```markdown
Ownership (#35, option a): `definitions/` is the single shared content library, consumed by the README quickstart, the demo app, and core's validation test; the framework's relationship to it is validate-only (engine behavior tests run on a core-owned fixture under `packages/core/test/fixtures/`, never on bundled content). Revisit a split (neutral examples at root, demo content under `examples/demo/definitions/`) if demo-specific tuning keeps accreting. The demo-repo split is deferred until after #2 (npm publish); once published, a cheaper intermediate is a CI job that packs both packages and installs the tarballs into the demo build.
```

- [ ] **Step 2: Run the checks**

Run: `npm test`
Expected: PASS (doc-only change).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "record definitions ownership decision, option a (#35)"
```

### Task 5: Full verification and push

- [ ] **Step 1: Full check suite**

Run: `npm test && npm run build -w examples/demo`
Expected: tests pass, demo build succeeds.

- [ ] **Step 2: Acceptance sweep against the spec**

- `examples/claude-artifact/` does not exist.
- CLAUDE.md has three architecture layers, no sync rule, and the ownership decision.
- README has no artifact reference.
- `rg -i "presales|ironclad" packages/core/test/` is empty.
- The validation test reads `definitions/` instead of naming files.

- [ ] **Step 3: Push to the PR branch**

```bash
git push
```

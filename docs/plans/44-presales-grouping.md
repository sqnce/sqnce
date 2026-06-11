# presales regrouping implementation plan (issue #44)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the `proposal` and `demo` sub-stages in `definitions/presales.json` from the `rfp` main stage to the front of the `proposal-demo` main stage, keeping the flattened sub-stage order identical.

**Architecture:** Content-only change to one bundled definition JSON. No engine, UI, seed, or test code changes. The move is done with a small Node script (deterministic splice and rewrite) rather than hand-editing roughly 150 lines, then asserted with a verification script. Existing checks cover the rest: `npm test` runs `validateDefinition` over all bundled definitions, and the demo build plus a browser check confirm the rendered orientation cues.

**Tech Stack:** Node 20+ (one-off scripts via `node -e`), npm workspaces, Vite demo build.

Spec: `docs/specs/44-presales-grouping.md`. No new tests: the framework's relationship to `definitions/` is validate-only (CLAUDE.md, #35), so pinning content grouping in core tests is out of scope.

---

### Task 1: Regroup the sub-stages in definitions/presales.json

**Files:**
- Modify: `definitions/presales.json` (move sub-stage objects with ids `proposal` and `demo` from the end of `mainStages[0].subStages` to the front of `mainStages[1].subStages`)

- [ ] **Step 1: Apply the move with a Node script**

Run from the worktree root:

```bash
node -e '
const fs = require("fs");
const path = "definitions/presales.json";
const def = JSON.parse(fs.readFileSync(path, "utf8"));
const rfp = def.mainStages.find(m => m.id === "rfp");
const pd = def.mainStages.find(m => m.id === "proposal-demo");
const moved = ["proposal", "demo"].map(id => {
  const i = rfp.subStages.findIndex(s => s.id === id);
  if (i === -1) throw new Error("missing " + id);
  return rfp.subStages.splice(i, 1)[0];
});
pd.subStages.unshift(...moved);
fs.writeFileSync(path, JSON.stringify(def, null, 2) + "\n");
'
```

Expected: exits silently. The file is rewritten with 2-space indentation and a trailing newline, matching the existing formatting.

- [ ] **Step 2: Assert the new grouping and unchanged flattened order**

```bash
node -e '
const def = JSON.parse(require("fs").readFileSync("definitions/presales.json", "utf8"));
const groups = def.mainStages.map(m => m.id + ":" + m.subStages.map(s => s.id).join(","));
const expectGroups = [
  "rfp:start,review,solutioning",
  "proposal-demo:proposal,demo,orals,delivery",
  "sow:scope,estimate,sow-draft"
];
if (JSON.stringify(groups) !== JSON.stringify(expectGroups))
  throw new Error("grouping wrong: " + JSON.stringify(groups));
const flat = def.mainStages.flatMap(m => m.subStages.map(s => s.id));
const expectFlat = ["start","review","solutioning","proposal","demo","orals","delivery","scope","estimate","sow-draft"];
if (JSON.stringify(flat) !== JSON.stringify(expectFlat))
  throw new Error("flattened order changed: " + JSON.stringify(flat));
if (flat[4] !== "demo") throw new Error("seed idx 4 no longer Demonstration");
console.log("grouping ok, flattened order unchanged, idx 4 = demo");
'
```

Expected output: `grouping ok, flattened order unchanged, idx 4 = demo`

- [ ] **Step 3: Confirm the diff is a pure move**

```bash
git diff --stat
```

Expected: only `definitions/presales.json` changed. Skim `git diff` to confirm the change is the two sub-stage blocks relocating, with no content edits inside them (indentation of the moved blocks stays the same since both locations sit at the same depth).

- [ ] **Step 4: Run the test suite**

```bash
npm test
```

Expected: all tests pass, including `validateDefinition` over the bundled definitions.

- [ ] **Step 5: Build the demo**

```bash
npm run build -w examples/demo
```

Expected: build succeeds.

- [ ] **Step 6: Commit and push**

```bash
git add definitions/presales.json
git commit -m "presales definition: group Proposal Draft and Demonstration under Proposal & Demo (#44)"
git push
```

### Task 2: Visual verification of the seeded run

**Files:** none modified (verification only)

- [ ] **Step 1: Serve the built demo**

```bash
npx vite preview --outDir examples/demo/dist --port 4173
```

(Or `npm run preview -w examples/demo` if the workspace defines it.) Expected: local server on http://localhost:4173.

- [ ] **Step 2: Check the orientation cues in a browser**

Open the demo, select the Presales Pursuit workflow with its seeded Pacific Ridge run (the default seed opens at `idx: 4`). Verify, per the spec acceptance criteria:

- Header stage rail: Proposal & Demo is the active main stage with glyph `2`, RFP shows done, SOW shows locked
- Centered card is Demonstration and its eyebrow reads `PROPOSAL & DEMO · S2`

Use the playwright-core plus system Chrome setup if a headless check is preferred (see memory: browser-verification-workaround), or report a screenshot. If either cue is wrong, stop and investigate before pushing further commits.

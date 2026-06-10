# run management implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Multiple named runs per workflow: a versioned run store in `@sqnce/core`, plus a collapsible run sidebar and a runs management screen in `@sqnce/react`.

**Architecture:** Pure store functions appended to the single-file core engine (store in, new store out; ids and timestamps supplied by the caller). `ProcessRolodex` swaps its `{ activeId, runs }` state for the version 2 store, routes every mutation through core functions, and gains two internal surfaces (sidebar, runs screen) plus a read-only mode for archived runs. Spec: `docs/specs/11-run-management.md`.

**Tech Stack:** Plain ESM JavaScript, zero-dependency core, `node:test` runner, React 18, Vite demo build.

---

## File structure

- Modify: `package.json` (root) and `packages/core/package.json`: widen `test` scripts to the test directory.
- Modify: `packages/core/src/index.js`: append a "Run store" section (new exports only; existing engine functions untouched).
- Create: `packages/core/test/runstore.test.js`: TDD home for every new core function.
- Modify: `packages/react/src/ProcessRolodex.jsx`: store-backed state, read-only guards, sidebar and runs screen integration, CSS additions, docblock update.
- Modify: `packages/react/src/OutputView.jsx`: honor `context.readOnly`.
- Create: `packages/react/src/RunSidebar.jsx`: collapsible sidebar (own transient UI state).
- Create: `packages/react/src/RunsScreen.jsx`: management table (own transient UI state).
- Modify: `packages/react/README.md` and `CLAUDE.md`: persisted-shape and key-behavior lines.
- Untouched: `examples/demo/*` (storage key stays `sqnce-demo-v1`; the version check discards old state), `examples/claude-artifact/*` (exempt, removed under #10), `definitions/*`.

Conventions that bind every task: no em dashes anywhere, lowercase `sqnce`, plain ESM, core stays dependency-free. All commands run from the worktree root (`.worktrees/11-run-management`).

---

### Task 1: Widen the test scripts

**Files:**
- Modify: `package.json` (root)
- Modify: `packages/core/package.json`

- [ ] **Step 1: Point both `test` scripts at the test directory**

Root `package.json`:

```json
"scripts": {
  "test": "node --test packages/core/test/"
}
```

`packages/core/package.json`:

```json
"scripts": { "test": "node --test test/" }
```

- [ ] **Step 2: Run the suite to confirm nothing broke**

Run: `npm test`
Expected: the existing engine tests pass (15 tests, exit 0).

- [ ] **Step 3: Commit**

```bash
git add package.json packages/core/package.json
git commit -m "test: run the whole core test directory (#11)"
```

### Task 2: Core store creation and addRun

**Files:**
- Create: `packages/core/test/runstore.test.js`
- Modify: `packages/core/src/index.js` (append only)

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/runstore.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test packages/core/test/runstore.test.js`
Expected: FAIL with `SyntaxError: The requested module '../src/index.js' does not provide an export named 'createRunStore'`.

- [ ] **Step 3: Implement**

Append to the end of `packages/core/src/index.js`:

```js
/* ------------------------------------------------------------------ */
/* Run store: multiple named runs per workflow                         */
/* ------------------------------------------------------------------ */
/*
 * A run entry wraps an engine run with identity:
 *   { id, workflowId, name, status: "active" | "archived",
 *     createdAt, updatedAt, run }
 * The store is the versioned persisted shape:
 *   { version: 2, activeWorkflowId, activeRunByWorkflow, entries }
 * Ids and timestamps are supplied by the caller; nothing here reads
 * the clock or generates randomness. "Live" means status "active";
 * entry.name holds manual renames only (display names are derived by
 * runDisplayName). Every function taking a runId returns the store
 * unchanged when the id is unknown.
 */

export function createRunStore() {
  return { version: 2, activeWorkflowId: null, activeRunByWorkflow: {}, entries: {} };
}

export function createRunEntry({ id, workflowId, run, now }) {
  return { id, workflowId, name: "", status: "active", createdAt: now, updatedAt: now, run };
}

function withEntry(store, entry) {
  return { ...store, entries: { ...store.entries, [entry.id]: entry } };
}

/** Insert an entry and make it the active run of its workflow. */
export function addRun(store, entry) {
  return {
    ...withEntry(store, entry),
    activeWorkflowId: entry.workflowId,
    activeRunByWorkflow: { ...store.activeRunByWorkflow, [entry.workflowId]: entry.id },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (engine tests plus the 3 new tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.js packages/core/test/runstore.test.js
git commit -m "core: run store creation and addRun (#11)"
```

### Task 3: Core rename, archive, unarchive

**Files:**
- Modify: `packages/core/test/runstore.test.js`
- Modify: `packages/core/src/index.js`

- [ ] **Step 1: Write the failing tests**

Add to `runstore.test.js` (extend the import list with `renameRun, archiveRun, unarchiveRun`):

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test packages/core/test/runstore.test.js`
Expected: FAIL with `does not provide an export named 'archiveRun'` (import error fails the whole file).

- [ ] **Step 3: Implement**

Append to the run store section of `packages/core/src/index.js`:

```js
export function renameRun(store, runId, name, now) {
  const entry = store.entries[runId];
  if (!entry) return store;
  return withEntry(store, { ...entry, name: String(name || "").trim(), updatedAt: now });
}

/*
 * Archiving is manual only and does not touch active-run mappings: an
 * archived active run stays open and renders read-only in the UI.
 */
export function archiveRun(store, runId, now) {
  const entry = store.entries[runId];
  if (!entry) return store;
  return withEntry(store, { ...entry, status: "archived", updatedAt: now });
}

export function unarchiveRun(store, runId, now) {
  const entry = store.entries[runId];
  if (!entry) return store;
  return withEntry(store, { ...entry, status: "active", updatedAt: now });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.js packages/core/test/runstore.test.js
git commit -m "core: renameRun, archiveRun, unarchiveRun (#11)"
```

### Task 4: Core setActiveRun, updateRunState, runsForWorkflow, activeRunEntry

**Files:**
- Modify: `packages/core/test/runstore.test.js`
- Modify: `packages/core/src/index.js`

- [ ] **Step 1: Write the failing tests**

Add to `runstore.test.js` (extend imports with `setActiveRun, updateRunState, runsForWorkflow, activeRunEntry`):

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test packages/core/test/runstore.test.js`
Expected: FAIL with `does not provide an export named 'setActiveRun'`.

- [ ] **Step 3: Implement**

Append to `packages/core/src/index.js`:

```js
export function setActiveRun(store, runId) {
  const entry = store.entries[runId];
  if (!entry) return store;
  return {
    ...store,
    activeWorkflowId: entry.workflowId,
    activeRunByWorkflow: { ...store.activeRunByWorkflow, [entry.workflowId]: runId },
  };
}

export function updateRunState(store, runId, run, now) {
  const entry = store.entries[runId];
  if (!entry) return store;
  return withEntry(store, { ...entry, run, updatedAt: now });
}

function compareIds(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** All of a workflow's entries, live and archived, oldest first. */
export function runsForWorkflow(store, workflowId) {
  return Object.values(store.entries)
    .filter((e) => e.workflowId === workflowId)
    .sort((a, b) => a.createdAt - b.createdAt || compareIds(a.id, b.id));
}

export function activeRunEntry(store, workflowId) {
  const id = store.activeRunByWorkflow[workflowId];
  return (id && store.entries[id]) || null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.js packages/core/test/runstore.test.js
git commit -m "core: setActiveRun, updateRunState, runsForWorkflow, activeRunEntry (#11)"
```

### Task 5: Core deleteRun

**Files:**
- Modify: `packages/core/test/runstore.test.js`
- Modify: `packages/core/src/index.js`

- [ ] **Step 1: Write the failing tests**

Add to `runstore.test.js` (extend imports with `deleteRun`):

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test packages/core/test/runstore.test.js`
Expected: FAIL with `does not provide an export named 'deleteRun'`.

- [ ] **Step 3: Implement**

Append to `packages/core/src/index.js`:

```js
/*
 * Delete an entry. If it was its workflow's active run, fall back to
 * the workflow's most recently updated live run; with none left, the
 * workflow loses its active-run mapping (the UI creates a fresh entry
 * on demand).
 */
export function deleteRun(store, runId) {
  const entry = store.entries[runId];
  if (!entry) return store;
  const entries = { ...store.entries };
  delete entries[runId];
  const next = { ...store, entries };
  if (store.activeRunByWorkflow[entry.workflowId] !== runId) return next;
  const live = Object.values(entries)
    .filter((e) => e.workflowId === entry.workflowId && e.status === "active")
    .sort((a, b) => b.updatedAt - a.updatedAt || compareIds(a.id, b.id));
  const map = { ...next.activeRunByWorkflow };
  if (live.length) map[entry.workflowId] = live[0].id;
  else delete map[entry.workflowId];
  return { ...next, activeRunByWorkflow: map };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.js packages/core/test/runstore.test.js
git commit -m "core: deleteRun with live-run fallback (#11)"
```

### Task 6: Core runSummary and runDisplayName

**Files:**
- Modify: `packages/core/test/runstore.test.js`
- Modify: `packages/core/src/index.js`

- [ ] **Step 1: Write the failing tests**

Add to `runstore.test.js` (extend imports with `runSummary, runDisplayName`):

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test packages/core/test/runstore.test.js`
Expected: FAIL with `does not provide an export named 'runSummary'`.

- [ ] **Step 3: Implement**

Append to `packages/core/src/index.js`:

```js
/** Progress over a definition: how many flattened sub-stage gates are met. */
export function runSummary(definition, run) {
  const subs = flattenSubStages(definition);
  return { met: subs.filter((ss) => gateProgress(ss, run).met).length, total: subs.length };
}

/*
 * Display name: manual name, else the resolved subject (only when the
 * subject output field actually holds a value; the configured fallback
 * string never becomes a display name), else "Run N" by creation order
 * among the workflow's entries. N can shift after deletions; accepted
 * pre-launch.
 */
export function runDisplayName(definition, store, runId) {
  const entry = store.entries[runId];
  if (!entry) return "";
  if (entry.name) return entry.name;
  const s = definition.subject;
  if (s) {
    const se = entry.run.stepState[s.stepId];
    const val = se && se.outputs && se.outputs[s.outputId];
    const subject = val && String(val[s.field] || "").trim();
    if (subject) return subject;
  }
  const n = runsForWorkflow(store, entry.workflowId).findIndex((e) => e.id === runId) + 1;
  return `Run ${n}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (engine tests plus 17 run store tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/index.js packages/core/test/runstore.test.js
git commit -m "core: runSummary and runDisplayName (#11)"
```

### Task 7: React store wiring and read-only guards

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx`

No new UI surfaces yet: this task swaps the state model underneath the existing rolodex and must leave the demo visually unchanged for live runs.

- [ ] **Step 1: Extend the core imports and add an id helper**

In `ProcessRolodex.jsx`, extend the `@sqnce/core` import with the run store functions:

```js
import {
  flattenSubStages,
  createRun,
  setOutput as coreSetOutput,
  setCheckedDone,
  getStepEntry,
  isStepComplete,
  stepHasAnyOutput,
  gateTypeOf,
  gateProgress,
  browse as coreBrowse,
  jumpTo,
  advance as coreAdvance,
  resolveSubject,
  serializeStep,
  buildDraftPrompt,
  hasValue,
  createRunStore,
  createRunEntry,
  addRun,
  renameRun,
  archiveRun,
  unarchiveRun,
  deleteRun as coreDeleteRun,
  setActiveRun as coreSetActiveRun,
  updateRunState,
  runsForWorkflow,
  activeRunEntry,
} from "@sqnce/core";
```

Add at module scope (below the imports):

```js
/* Ids and timestamps are generated here, never inside @sqnce/core. */
function newId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    return crypto.randomUUID();
  return `run-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
```

- [ ] **Step 2: Replace the state block**

Replace the current state block (from `const [activeId, setActiveId] = useState(...)` through `const setRun = useCallback(...)`, including the `def`/`subs`/`makeInitialRun`/`run`/`idx`/`frontier` lines) with:

```js
  const makeInitialRun = useCallback(
    (id) => (initialRunFor ? initialRunFor(id) : createRun()),
    [initialRunFor]
  );
  /* A workflow's first entry seeds from initialRunFor; later runs start blank. */
  const newEntryFor = useCallback(
    (s, workflowId) => {
      const first = runsForWorkflow(s, workflowId).length === 0;
      return createRunEntry({
        id: newId(),
        workflowId,
        run: first ? makeInitialRun(workflowId) : createRun(),
        now: Date.now(),
      });
    },
    [makeInitialRun]
  );

  const [store, setStore] = useState(() => {
    const empty = createRunStore();
    return addRun(empty, newEntryFor(empty, workflows[0].id));
  });
  const [expanded, setExpanded] = useState(null);
  const [generating, setGenerating] = useState(null);
  const [genError, setGenError] = useState(null);
  const [loaded, setLoaded] = useState(!persistence);
  const [showInputs, setShowInputs] = useState(false);
  const [view, setView] = useState("rolodex");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const fileRef = useRef(null);
  const attachFor = useRef(null);
  const saveTimer = useRef(null);

  const activeId =
    store.activeWorkflowId && workflows.some((w) => w.id === store.activeWorkflowId)
      ? store.activeWorkflowId
      : workflows[0].id;
  const def = useMemo(
    () => workflows.find((w) => w.id === activeId) || workflows[0],
    [workflows, activeId]
  );
  const subs = useMemo(() => flattenSubStages(def), [def]);
  const entry = activeRunEntry(store, activeId);
  const readOnly = !!entry && entry.status === "archived";
  /* One-frame fallback while the ensure effect below creates an entry. */
  const run = entry ? entry.run : makeInitialRun(activeId);
  const idx = Math.min(run.idx, subs.length - 1);
  const frontier = Math.min(run.frontier, subs.length - 1);

  /* A loaded store can lack an active entry for the active workflow
     (last live run deleted, foreign activeWorkflowId). Create one,
     but only when the rolodex view actually needs it: on the runs
     screen a confirmed delete of the final run must not appear to
     recreate a blank run in the table. */
  useEffect(() => {
    if (!loaded || entry || view !== "rolodex") return;
    setStore((s) => (activeRunEntry(s, activeId) ? s : addRun(s, newEntryFor(s, activeId))));
  }, [loaded, entry, activeId, view, newEntryFor]);

  /* Content mutations bump updatedAt and are blocked on archived runs.
     The status is re-checked inside the updater with current state:
     an async writer (draft generation, file read) that started while
     the run was live must not land after it is archived or deleted. */
  const setRun = useCallback(
    (next) => {
      if (!entry || readOnly) return;
      setStore((s) => {
        const e = s.entries[entry.id];
        return e && e.status === "active" ? updateRunState(s, entry.id, next, Date.now()) : s;
      });
    },
    [entry, readOnly]
  );
  /* Navigation stays available on archived runs and must not disturb
     updatedAt ordering, so it writes with the entry's own timestamp. */
  const setNav = useCallback(
    (next) => {
      if (!entry) return;
      setStore((s) => {
        const e = s.entries[entry.id];
        return e ? updateRunState(s, entry.id, next, e.updatedAt) : s;
      });
    },
    [entry]
  );
```

- [ ] **Step 3: Replace the persistence effects**

```js
  /* ---------- persistence ---------- */
  useEffect(() => {
    if (!persistence) return;
    (async () => {
      try {
        const saved = await persistence.load();
        /* Version 2 stores only; anything else (including the old
           { activeId, runs } shape) is discarded. Pre-launch, no users. */
        if (saved && saved.version === 2 && saved.entries && saved.activeRunByWorkflow) {
          setStore(saved);
        }
      } catch (e) {
        /* nothing saved yet */
      }
      setLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!persistence || !loaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      persistence.save(store).catch((e) => console.error("save failed", e));
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [store, loaded, persistence]);
```

- [ ] **Step 4: Route mutations through the store**

Replace `doBrowse`, `doAdvance`, `switchWorkflow`, `writeOutput`, `toggleDone`, `resetRun`, and the `generate` early return; add the run-management handlers:

```js
  const doBrowse = (dir) => {
    const next = coreBrowse(run, subs, dir);
    if (next !== run) {
      clearTransients();
      setNav(next);
    }
  };

  const doAdvance = (force) => {
    if (readOnly) return;
    const result = coreAdvance(run, subs, { force });
    if (result.advanced) {
      clearTransients();
      setRun(result.run);
    }
  };

  const switchWorkflow = (id) => {
    if (id === activeId) return;
    clearTransients();
    setStore((s) => {
      const existing = activeRunEntry(s, id);
      return existing ? coreSetActiveRun(s, existing.id) : addRun(s, newEntryFor(s, id));
    });
  };

  /* ---------- run management ---------- */
  const openRun = (runId) => {
    clearTransients();
    setView("rolodex");
    setStore((s) => coreSetActiveRun(s, runId));
  };
  const newRun = (workflowId) => {
    clearTransients();
    setView("rolodex");
    setStore((s) => addRun(s, newEntryFor(s, workflowId)));
  };
  const doRename = (runId, name) => setStore((s) => renameRun(s, runId, name, Date.now()));
  const doArchive = (runId) => setStore((s) => archiveRun(s, runId, Date.now()));
  const doUnarchive = (runId) => setStore((s) => unarchiveRun(s, runId, Date.now()));
  const doDelete = (runId) => setStore((s) => coreDeleteRun(s, runId));
```

`writeOutput` and `toggleDone` gain the read-only guard:

```js
  const writeOutput = (stepId, outputId, value) => {
    if (readOnly) return;
    setRun(coreSetOutput(run, stepId, outputId, value));
  };
  const toggleDone = (stepId, checked) => {
    if (readOnly) return;
    setRun(setCheckedDone(run, stepId, checked));
  };
```

`generate` early return becomes `if (!generateDraft || readOnly) return;`. `resetRun` becomes:

```js
  const resetRun = () => {
    if (readOnly) return;
    clearTransients();
    setRun(makeInitialRun(activeId));
  };
```

- [ ] **Step 5: Wire read-only into the existing JSX**

Five spot edits in the render:

1. Pip click: `onClick={() => setNav(jumpTo(run, subs, i))}`.
2. Reset button: add `disabled={readOnly}`.
3. Generate button `disabled`: `disabled={generating === step.id || readOnly}`.
4. Mark done button: add `disabled={readOnly}`.
5. Advance and override buttons: add `disabled={readOnly}`; OutputView context becomes `readOnly: readOnly` (replacing the hardcoded `readOnly: false`).

Add to the CSS string:

```css
.pf-advance:disabled, .pf-override:disabled { opacity: 0.4; cursor: default; }
.pf-reset:disabled { opacity: 0.4; cursor: default; }
```

- [ ] **Step 6: Update the component docblock**

Replace the `persistence` prop paragraph in the top-of-file docblock with:

```
 *  - persistence (optional): { load: async () => state | null,
 *                              save: async (state) => void }
 *      where state is the versioned run store
 *      { version: 2, activeWorkflowId, activeRunByWorkflow, entries }.
 *      Anything that is not a version 2 store is discarded on load.
 *      Omit for in-memory only.
```

And extend the `initialRunFor` paragraph:

```
 *  - initialRunFor (optional): (workflowId) => run, seeds the inner run
 *      of a workflow's first entry and backs Reset; every later
 *      "+ New run" starts blank. Defaults to createRun. Must be
 *      side-effect free; it can be called on every render.
```

- [ ] **Step 7: Verify**

Run: `npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:@sqnce/core --outfile=/dev/null`
Expected: exit 0.
Run: `npm run build -w examples/demo`
Expected: build succeeds.
Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "react: back the rolodex with the run store (#11)"
```

### Task 8: Read-only outputs and the archived banner

**Files:**
- Modify: `packages/react/src/OutputView.jsx`
- Modify: `packages/react/src/ProcessRolodex.jsx`

- [ ] **Step 1: Honor context.readOnly in OutputView**

In `OutputView.jsx`:

1. `DefaultEditor` takes a `readOnly` prop: the text `<textarea>` and the link and fields `<input>`s get `readOnly={readOnly}`; the attach button gets `disabled={readOnly}`.

```js
function DefaultEditor({ spec, value, onChange, onAttach, readOnly }) {
  if (spec.type === "text")
    return (
      <textarea
        className="pf-ta"
        placeholder="Write the output or generate a draft."
        value={value || ""}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  if (spec.type === "link")
    return (
      <input
        className="pf-field-input pf-link-input"
        placeholder="https://"
        value={value || ""}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  if (spec.type === "fields")
    return (
      <div className="pf-fields">
        {spec.fields.map((f) => (
          <label key={f.key} className="pf-field">
            <span>{f.label}</span>
            <input
              className="pf-field-input"
              value={(value && value[f.key]) || ""}
              readOnly={readOnly}
              onChange={(e) => onChange({ ...(value || {}), [f.key]: e.target.value })}
            />
          </label>
        ))}
      </div>
    );
  if (spec.type === "file")
    return (
      <>
        {value && value.name ? (
          <div className="pf-filechip">📎 {value.name}</div>
        ) : (
          <div className="pf-filechip pf-filechip-empty">No file attached</div>
        )}
        <button className="pf-btn pf-btn-sm" disabled={readOnly} onClick={onAttach}>
          {value && value.name ? "Replace file" : "Attach file"}
        </button>
      </>
    );
  return null;
}
```

2. In the `OutputView` body, derive read-only mode after the existing `mode` state:

```js
  const readOnly = !!(context && context.readOnly);
  /* Read-only forces renderer-backed outputs into view mode; the raw
     JSON editor and edit toggles become unreachable. */
  const shownMode = readOnly && Renderer ? "view" : mode;
```

Then replace every `mode === "view"`/`mode === "edit"` comparison in the `body` and `toggle` expressions with `shownMode`, pass `readOnly={readOnly}` to `DefaultEditor`, and make the toggle `readOnly ? null : (existing expression)`.

- [ ] **Step 2: Add the archived banner**

In `ProcessRolodex.jsx`, between the header div and the deck (banner shows in rolodex view only; the runs screen from Task 10 replaces the deck):

```jsx
      {readOnly && view === "rolodex" && (
        <div className="pf-archived">
          <span>This run is archived and read-only.</span>
          <button className="pf-btn pf-btn-sm" onClick={() => doUnarchive(entry.id)}>
            Unarchive
          </button>
        </div>
      )}
```

Add to the CSS string:

```css
.pf-archived {
  display: flex; align-items: center; gap: 12px; margin: 6px 28px 0;
  padding: 8px 14px; border: 1px solid #D9A441; border-radius: 8px;
  background: #3A3424; color: #EDD9A8; font-size: 12.5px;
  font-family: 'IBM Plex Mono', monospace;
}
.pf-ta[readonly], .pf-field-input[readonly] { background: #F3F1E8; color: #6B6F76; }
```

- [ ] **Step 3: Verify and commit**

Run the same esbuild check for both files, plus `npm run build -w examples/demo`.
Expected: exit 0 each.

```bash
git add packages/react/src/OutputView.jsx packages/react/src/ProcessRolodex.jsx
git commit -m "react: read-only mode for archived runs (#11)"
```

### Task 9: Run sidebar

**Files:**
- Create: `packages/react/src/RunSidebar.jsx`
- Modify: `packages/react/src/ProcessRolodex.jsx`

- [ ] **Step 1: Create RunSidebar.jsx**

```jsx
import React, { useState } from "react";
import { runsForWorkflow, runSummary, runDisplayName } from "@sqnce/core";

/*
 * Collapsible run sidebar: one section per workflow (prop order), live
 * runs only (archived runs live on the runs screen), a progress meter
 * per run, and a per-run menu (rename, archive, delete with an inline
 * confirm step). Transient UI state (open menu, rename draft, pending
 * delete) is local and never enters the store.
 */
export default function RunSidebar({
  workflows,
  store,
  collapsed,
  onToggle,
  onOpenRun,
  onNewRun,
  onRename,
  onArchive,
  onDelete,
}) {
  const [menuFor, setMenuFor] = useState(null);
  const [renaming, setRenaming] = useState(null); /* { id, value } */
  const [confirmDelete, setConfirmDelete] = useState(null);

  if (collapsed)
    return (
      <aside className="pf-side pf-side-collapsed">
        <button className="pf-side-toggle" title="Show runs" onClick={onToggle}>
          ▸
        </button>
      </aside>
    );

  const commitRename = () => {
    if (!renaming) return;
    onRename(renaming.id, renaming.value);
    setRenaming(null);
  };

  return (
    <aside className="pf-side">
      <div className="pf-side-head">
        <span className="pf-side-title">Runs</span>
        <button className="pf-side-toggle" title="Hide runs" onClick={onToggle}>
          ◂
        </button>
      </div>
      {workflows.map((w) => {
        const live = runsForWorkflow(store, w.id).filter((e) => e.status === "active");
        return (
          <div key={w.id} className="pf-side-group">
            <div className="pf-side-label">{w.short || w.name}</div>
            {live.map((e) => {
              const sum = runSummary(w, e.run);
              const isActive =
                store.activeWorkflowId === w.id && store.activeRunByWorkflow[w.id] === e.id;
              return (
                <div key={e.id} className={`pf-side-run ${isActive ? "pf-side-run-active" : ""}`}>
                  {renaming && renaming.id === e.id ? (
                    <input
                      className="pf-side-rename"
                      autoFocus
                      value={renaming.value}
                      onChange={(ev) => setRenaming({ id: e.id, value: ev.target.value })}
                      onBlur={commitRename}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") commitRename();
                        if (ev.key === "Escape") setRenaming(null);
                      }}
                    />
                  ) : (
                    <button className="pf-side-run-open" onClick={() => onOpenRun(e.id)}>
                      <span className="pf-side-run-name">{runDisplayName(w, store, e.id)}</span>
                      <span className="pf-side-meter">
                        <span
                          className="pf-side-meter-fill"
                          style={{ width: `${sum.total ? (sum.met / sum.total) * 100 : 0}%` }}
                        />
                      </span>
                      <span className="pf-side-count">
                        {sum.met}/{sum.total}
                      </span>
                    </button>
                  )}
                  <button
                    className="pf-side-menu-btn"
                    title="Run actions"
                    onClick={() => {
                      setMenuFor(menuFor === e.id ? null : e.id);
                      setConfirmDelete(null);
                    }}
                  >
                    ⋯
                  </button>
                  {menuFor === e.id && (
                    <div className="pf-side-menu">
                      <button
                        onClick={() => {
                          setRenaming({ id: e.id, value: e.name || "" });
                          setMenuFor(null);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => {
                          onArchive(e.id);
                          setMenuFor(null);
                        }}
                      >
                        Archive
                      </button>
                      <button
                        className="pf-danger"
                        onClick={() => {
                          if (confirmDelete === e.id) {
                            onDelete(e.id);
                            setMenuFor(null);
                            setConfirmDelete(null);
                          } else {
                            setConfirmDelete(e.id);
                          }
                        }}
                      >
                        {confirmDelete === e.id ? "Confirm delete" : "Delete"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            <button className="pf-side-new" onClick={() => onNewRun(w.id)}>
              + New run
            </button>
          </div>
        );
      })}
    </aside>
  );
}
```

- [ ] **Step 2: Integrate into ProcessRolodex**

Add `import RunSidebar from "./RunSidebar.jsx";` and wrap the deck and nav in a body row (sidebar left of the deck):

```jsx
      <div className="pf-body">
        <RunSidebar
          workflows={workflows}
          store={store}
          collapsed={!sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          onOpenRun={openRun}
          onNewRun={newRun}
          onRename={doRename}
          onArchive={doArchive}
          onDelete={doDelete}
        />
        <div className="pf-main">
          <div className="pf-deck">{/* existing deck content, unchanged */}</div>
          <div className="pf-nav">{/* existing nav content, unchanged */}</div>
        </div>
      </div>
```

- [ ] **Step 3: Add the sidebar CSS**

```css
.pf-body { display: flex; flex: 1; min-height: 0; align-items: stretch; }
.pf-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.pf-side {
  width: 232px; flex-shrink: 0; margin: 8px 0 22px 16px;
  border: 1px solid #3A434E; border-radius: 10px; padding: 10px;
  overflow-y: auto; color: #C9CDD3;
  display: flex; flex-direction: column; gap: 12px;
}
.pf-side-collapsed { width: 36px; align-items: center; padding: 10px 4px; }
.pf-side-head { display: flex; justify-content: space-between; align-items: center; }
.pf-side-title { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #8A919B; }
.pf-side-toggle { background: none; border: 1px solid #3A434E; color: #8A919B; border-radius: 6px; cursor: pointer; padding: 2px 8px; }
.pf-side-toggle:hover { color: #EDEAE0; border-color: #5E6772; }
.pf-side-group { display: flex; flex-direction: column; gap: 4px; }
.pf-side-label { font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: #5E6772; }
.pf-side-run { position: relative; display: flex; align-items: center; gap: 2px; border: 1px solid transparent; border-radius: 7px; }
.pf-side-run:hover { border-color: #3A434E; }
.pf-side-run-active { border-color: #D9A441; }
.pf-side-run-open {
  flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0;
  background: none; border: none; color: #C9CDD3; cursor: pointer;
  padding: 7px 8px; text-align: left; font-family: inherit; font-size: 12.5px;
}
.pf-side-run-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 92px; }
.pf-side-meter { flex: 1; height: 4px; border-radius: 2px; background: #3A434E; overflow: hidden; }
.pf-side-meter-fill { display: block; height: 100%; background: #D9A441; }
.pf-side-count { font-family: 'IBM Plex Mono', monospace; font-size: 10px; color: #8A919B; }
.pf-side-menu-btn { background: none; border: none; color: #5E6772; cursor: pointer; font-size: 14px; padding: 2px 6px; }
.pf-side-menu-btn:hover { color: #EDEAE0; }
.pf-side-menu {
  position: absolute; right: 4px; top: 100%; z-index: 30; min-width: 130px;
  background: #23282F; border: 1px solid #3A434E; border-radius: 7px;
  display: flex; flex-direction: column; overflow: hidden;
}
.pf-side-menu button { background: none; border: none; color: #C9CDD3; text-align: left; padding: 7px 12px; cursor: pointer; font-size: 12px; font-family: inherit; }
.pf-side-menu button:hover { background: #3A434E; }
.pf-danger { color: #E08A6D; }
.pf-side-new {
  background: none; border: 1px dashed #3A434E; color: #8A919B;
  border-radius: 7px; padding: 6px; cursor: pointer;
  font-size: 11.5px; font-family: 'IBM Plex Mono', monospace;
}
.pf-side-new:hover { color: #D9A441; border-color: #D9A441; }
.pf-side-rename {
  flex: 1; min-width: 0; background: #1B2129; border: 1px solid #D9A441;
  color: #EDEAE0; border-radius: 6px; padding: 6px 8px;
  font-size: 12.5px; font-family: inherit;
}
```

And inside the existing `@media (max-width: 720px)` block add `.pf-side { display: none; }` (under 720px run management happens on the runs screen; the single-run layout stays exactly as it is today).

- [ ] **Step 4: Verify and commit**

esbuild check both files, `npm run build -w examples/demo`.
Expected: exit 0 each.

```bash
git add packages/react/src/RunSidebar.jsx packages/react/src/ProcessRolodex.jsx
git commit -m "react: collapsible run sidebar (#11)"
```

### Task 10: Runs screen

**Files:**
- Create: `packages/react/src/RunsScreen.jsx`
- Modify: `packages/react/src/ProcessRolodex.jsx`

- [ ] **Step 1: Create RunsScreen.jsx**

```jsx
import React, { useState } from "react";
import { runSummary, runDisplayName } from "@sqnce/core";

/*
 * Management table over every run, live and archived, most recently
 * updated first. Opening a row hands off to the rolodex (archived runs
 * open read-only there). Entries whose workflow id matches no current
 * workflow are hidden but preserved in the store.
 */
export default function RunsScreen({
  workflows,
  store,
  onOpenRun,
  onRename,
  onArchive,
  onUnarchive,
  onDelete,
}) {
  const [renaming, setRenaming] = useState(null); /* { id, value } */
  const [confirmDelete, setConfirmDelete] = useState(null);
  const byId = new Map(workflows.map((w) => [w.id, w]));
  const rows = Object.values(store.entries)
    .filter((e) => byId.has(e.workflowId))
    .sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : 1));

  const commitRename = () => {
    if (!renaming) return;
    onRename(renaming.id, renaming.value);
    setRenaming(null);
  };

  return (
    <div className="pf-runs">
      <table className="pf-table pf-runs-table">
        <thead>
          <tr>
            <th>Run</th>
            <th>Workflow</th>
            <th>Progress</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const w = byId.get(e.workflowId);
            const sum = runSummary(w, e.run);
            return (
              <tr key={e.id} className={e.status === "archived" ? "pf-runs-archived" : ""}>
                <td>
                  {renaming && renaming.id === e.id ? (
                    <input
                      className="pf-runs-rename"
                      autoFocus
                      value={renaming.value}
                      onChange={(ev) => setRenaming({ id: e.id, value: ev.target.value })}
                      onBlur={commitRename}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") commitRename();
                        if (ev.key === "Escape") setRenaming(null);
                      }}
                    />
                  ) : (
                    <button className="pf-runs-open" onClick={() => onOpenRun(e.id)}>
                      {runDisplayName(w, store, e.id)}
                      {e.status === "archived" && <span className="pf-badge">archived</span>}
                    </button>
                  )}
                </td>
                <td>{w.short || w.name}</td>
                <td>
                  {sum.met}/{sum.total}
                </td>
                <td>{new Date(e.updatedAt).toLocaleString()}</td>
                <td>
                  <div className="pf-runs-actions">
                    <button className="pf-btn pf-btn-sm" onClick={() => onOpenRun(e.id)}>
                      Open
                    </button>
                    <button
                      className="pf-btn pf-btn-sm"
                      onClick={() => setRenaming({ id: e.id, value: e.name || "" })}
                    >
                      Rename
                    </button>
                    {e.status === "archived" ? (
                      <button className="pf-btn pf-btn-sm" onClick={() => onUnarchive(e.id)}>
                        Unarchive
                      </button>
                    ) : (
                      <button className="pf-btn pf-btn-sm" onClick={() => onArchive(e.id)}>
                        Archive
                      </button>
                    )}
                    <button
                      className="pf-btn pf-btn-sm pf-danger"
                      onClick={() => {
                        if (confirmDelete === e.id) {
                          onDelete(e.id);
                          setConfirmDelete(null);
                        } else {
                          setConfirmDelete(e.id);
                        }
                      }}
                    >
                      {confirmDelete === e.id ? "Confirm delete" : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && <div className="pf-runs-empty">No runs yet.</div>}
    </div>
  );
}
```

- [ ] **Step 2: Integrate into ProcessRolodex**

Add `import RunsScreen from "./RunsScreen.jsx";`. In the header, next to the Reset button, add the view toggle:

```jsx
          <button
            className="pf-reset"
            onClick={() => {
              clearTransients();
              setView(view === "runs" ? "rolodex" : "runs");
            }}
          >
            {view === "runs" ? "Back to run" : "Runs"}
          </button>
```

Inside `pf-main`, branch on the view (the deck and nav are unchanged, just wrapped):

```jsx
        <div className="pf-main">
          {view === "runs" ? (
            <RunsScreen
              workflows={workflows}
              store={store}
              onOpenRun={openRun}
              onRename={doRename}
              onArchive={doArchive}
              onUnarchive={doUnarchive}
              onDelete={doDelete}
            />
          ) : (
            <>
              <div className="pf-deck">{/* unchanged */}</div>
              <div className="pf-nav">{/* unchanged */}</div>
            </>
          )}
        </div>
```

- [ ] **Step 3: Add the runs screen CSS**

```css
.pf-runs {
  flex: 1; margin: 8px 28px 22px; padding: 18px; overflow: auto;
  background: #F1EEE3; border: 1px solid #D8D3C2; border-radius: 10px;
}
.pf-runs-table { width: 100%; }
.pf-runs-open {
  background: none; border: none; padding: 0; cursor: pointer;
  color: #23282F; font-weight: 600; font-family: inherit; font-size: 13px;
  display: flex; align-items: center; gap: 8px;
}
.pf-runs-open:hover { text-decoration: underline; }
.pf-badge {
  font-family: 'IBM Plex Mono', monospace; font-size: 9.5px;
  letter-spacing: 0.08em; text-transform: uppercase;
  background: #DCD7C7; color: #5C6068; border-radius: 4px; padding: 1px 6px;
}
.pf-runs-archived td { color: #8A8E96; }
.pf-runs-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.pf-runs-empty { color: #6B6F76; font-size: 13px; padding: 8px; }
.pf-runs-rename {
  border: 1px solid #D9A441; border-radius: 6px; padding: 5px 8px;
  font-size: 13px; font-family: inherit; background: #FFFFFF; color: #23282F;
}
```

- [ ] **Step 4: Verify and commit**

esbuild check both files, `npm run build -w examples/demo`, `npm test`.
Expected: exit 0 each.

```bash
git add packages/react/src/RunsScreen.jsx packages/react/src/ProcessRolodex.jsx
git commit -m "react: runs management screen (#11)"
```

### Task 11: Documentation touch-ups

**Files:**
- Modify: `packages/react/README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the react README props**

Replace the `persistence` bullet:

```markdown
- `persistence` (optional): `{ load: async () => state | null, save: async (state) => void }` where state is the versioned run store `{ version: 2, activeWorkflowId, activeRunByWorkflow, entries }`. Anything that is not a version 2 store is discarded on load. Omit for in-memory runs.
```

Replace the `initialRunFor` bullet:

```markdown
- `initialRunFor` (optional): `(workflowId) => run`, seeds the inner run of a workflow's first entry and backs Reset; later runs start blank. Defaults to an empty run. Must be side-effect free.
```

- [ ] **Step 2: Update the CLAUDE.md key behavior**

Replace the bullet "Per-workflow run state is namespaced by workflow id; switching workflows is non-destructive." with:

```markdown
- Run state lives in a versioned run store (multiple named runs per workflow); switching workflows or runs is non-destructive. Archiving is manual only and archived runs open read-only; nothing archives a run automatically.
```

- [ ] **Step 3: Commit**

```bash
git add packages/react/README.md CLAUDE.md
git commit -m "docs: run store shape and key behaviors (#11)"
```

### Task 12: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the automated checks**

```bash
npm test
npm run build -w examples/demo
npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:@sqnce/core --outfile=/dev/null
```

Expected: all exit 0.

- [ ] **Step 2: Manual demo run-through (acceptance from the spec)**

Run `npm run dev -w examples/demo` and verify in the browser:

1. First load with old localStorage state: v1 data is discarded, the demo reseeds (car-buying mid-flight), no console errors.
2. Sidebar: sections per workflow, presales shows its seeded run with a progress meter; "+ New run" under presales creates a blank second run and opens it.
3. Display names: rename the new run (shows the name), fill the presales intake client on a fresh run (shows the client), an untouched blank run shows "Run N".
4. Switch between the two presales runs from the sidebar; each keeps its own state; the active run is highlighted.
5. Archive the second run from the sidebar menu: it leaves the sidebar, the rolodex shows the archived banner if it was open, editing, mark done, generate, advance, override, and reset are disabled, browsing still works.
6. Runs screen: lists every run including the archived one (badge), progress and updated columns filled; open the archived run (read-only), unarchive it from the banner or the screen, delete it through the two-step confirm.
7. Reload: everything persists; the sidebar collapses to the rail and back.
8. Narrow the window under 720px: the sidebar disappears, the single-run layout matches today's.

- [ ] **Step 3: Push and hand off to the Codex implementation loop**

```bash
git push
```

Then follow the workflow's Codex loop (poll reactions and comments until 👍 on the latest commit).

---

## Self-review notes

- Spec coverage: data model (Task 2), every listed core function (Tasks 2 to 6), test script widening (Task 1), store-backed component with compatibility props (Task 7), read-only mode (Task 8), sidebar (Task 9), runs screen (Task 10), docs (Tasks 7 and 11), acceptance (Task 12). The demo needs no changes (spec: storage key stays, discard handles old state).
- Out of scope holds: no engine function edits (run store is append-only in `index.js`), no demo or artifact changes, no new dependencies.
- Navigation on archived runs uses `setNav`, which reuses `updateRunState` with the entry's existing `updatedAt` so browsing never reorders "most recently updated" or fights the read-only guard.
- Stale async writers (Codex P2 on the first plan push): `setRun` re-checks `s.entries[entry.id].status` inside the `setStore` updater, so a draft generation or file read that resolves after the run was archived or deleted is dropped instead of mutating it. `setNav` only needs the existence check, navigation is legal on archived runs.
- Delete-only management (Codex P2 on the second plan push): the ensure effect is gated on `view === "rolodex"`, so deleting the final live run from the runs screen leaves the table without it; a fresh entry is created only when the rolodex needs one (switching back to the run view, or the explicit + New run path).

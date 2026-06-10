# spec: run management, multiple named runs per workflow

Issue: #11. A workflow supports exactly one run, keyed by workflow id (`{ activeId, runs: { [workflowId]: run } }` in the persisted state). There is no way to have two hiring pipelines in flight, no overview of progress across runs, and no management beyond Reset. This spec follows the design approved in the issue (brainstormed 2026-06-09).

Terminology: "live" means `status: "active"` (not archived). "Active run" means the run currently open for a workflow. The two are independent: an archived run can be the active run (it opens read-only).

## Data model

A run entry wraps the unchanged engine run with identity:

```js
{
  id,                      // unique string, supplied by the caller
  workflowId,              // definition id this run belongs to
  name,                    // manual rename only; "" means unnamed (display name is derived)
  status,                  // "active" | "archived"
  createdAt, updatedAt,    // millisecond timestamps, supplied by the caller
  run: { idx, frontier, stepState }   // the engine run, shape untouched
}
```

The persisted shape becomes a versioned store:

```js
{
  version: 2,
  activeWorkflowId,
  activeRunByWorkflow: { [workflowId]: runId },
  entries: { [runId]: entry }
}
```

No migration: the project has no users. The loader discards anything that is not a version 2 store and starts fresh.

## Core (`@sqnce/core`)

Pure and dependency-free: store in, new store out. Ids and timestamps are always supplied by the caller so core stays deterministic. Existing engine functions are untouched. New functions:

- `createRunStore()`: empty version 2 store.
- `createRunEntry({ id, workflowId, run, now })`: a fresh entry, `name: ""`, `status: "active"`, `createdAt` and `updatedAt` set to `now`.
- `addRun(store, entry)`: inserts the entry and makes it the active run of its workflow (also sets `activeWorkflowId`).
- `renameRun(store, runId, name, now)`: sets `entry.name` (trimmed), bumps `updatedAt`.
- `archiveRun(store, runId, now)` / `unarchiveRun(store, runId, now)`: flips `status`, bumps `updatedAt`. Manual only; nothing in core or UI archives a run automatically. Archiving does not change active-run mappings (an archived active run opens read-only, see UI).
- `deleteRun(store, runId)`: removes the entry. If it was its workflow's active run, the workflow's active run falls back to its most recently updated live run (tie-break: id); if the workflow has no live runs left, its `activeRunByWorkflow` mapping is removed.
- `setActiveRun(store, runId)`: sets `activeRunByWorkflow[entry.workflowId]` and `activeWorkflowId`. Works for archived entries.
- `updateRunState(store, runId, run, now)`: replaces `entry.run`, bumps `updatedAt`.
- `runsForWorkflow(store, workflowId)`: all entries for the workflow (live and archived), ordered by `createdAt` ascending, tie-break id. Callers filter by status.
- `activeRunEntry(store, workflowId)`: the workflow's active entry, or null.
- `runSummary(definition, run)`: `{ met, total }` where `total` is the number of flattened sub-stages and `met` counts those whose `gateProgress(...).met` is true. Drives every progress meter.
- `runDisplayName(definition, store, runId)`: `entry.name` if non-empty; else the resolved subject, used only when the subject output field actually holds a non-empty trimmed value (the `subject.fallback` never becomes a display name); else `"Run N"`, where N is the entry's 1-based position in `runsForWorkflow` order. N can shift when an earlier run is deleted; accepted, pre-launch.

All functions that take a `runId` return the store unchanged if the id is unknown. TDD is mandatory for all of the above. Tests go in `packages/core/test/runstore.test.js`; the `test` scripts in the root and `packages/core` package.json files widen from `engine.test.js` to the test directory so both files run.

## UI (`@sqnce/react`)

Component state becomes the store; all mutations go through the core functions. The component generates ids (`crypto.randomUUID()` with a non-crypto fallback) and timestamps (`Date.now()`); these never enter core logic except as arguments.

Two complementary surfaces, both internal to `ProcessRolodex` (no new props):

**Collapsible sidebar**, left of the deck:

- Sections per workflow in `workflows` prop order; each section lists the workflow's live runs (display name, progress meter from `runSummary`) plus a "+ New run" row.
- The active run of the active workflow is highlighted. Clicking a run makes it active (workflow and run).
- Per-run menu: rename (inline), archive, delete (with a confirm step). Archived runs do not appear in the sidebar; they live on the runs screen.
- Collapses to a thin rail (icon-only toggle); expanded or collapsed is ephemeral component state, not persisted.

**Runs screen**, toggled from the header (replaces the deck while open):

- Table of all runs including archived: run (display name, status badge), workflow, progress (`met/total`), updated, actions (open, rename, archive or unarchive, delete with confirm).
- Clicking a row opens that run in the rolodex. Archived runs open read-only.

**Read-only mode** (active entry is archived): a banner names the state and offers Unarchive. Output editing, mark done, generate draft, advance, override, and reset are disabled (guarded in the mutation handlers, not just hidden); browsing history stays available; `context.readOnly: true` is passed to renderers and the built-in editors render disabled.

**Run creation and Reset**:

- A workflow's first entry (created lazily when the workflow becomes active with no entries in the store, or via "+ New run" when none exist) seeds its inner run from `initialRunFor(workflowId)`, defaulting to `createRun()`.
- Every later "+ New run" starts from `createRun()`: new pipelines start blank, seeds are for first contact only.
- Reset keeps its current contract: it replaces the active entry's inner run with `initialRunFor(workflowId)`. On a seeded demo workflow this restores seed content even in a later run; accepted, it matches the prop's documented contract and apps without `initialRunFor` get a blank run.

**Compatibility**: `persistence`, `generateDraft`, `initialRunFor`, `workflowGroups`, and `renderers` props keep working; the component still works with `persistence` omitted (in-memory store). The header workflow switcher stays (it is the workflow control when the sidebar is collapsed): switching activates that workflow's active run, creating a first entry if none exists. The component docblock documents the new persisted shape.

**Demo** (`examples/demo`): no code changes beyond what the component provides; the storage key stays `sqnce-demo-v1`, the version check discards the old shape and reseeds.

## Out of scope

- Any change to existing engine functions or the run shape `{ idx, frontier, stepState }`.
- The claude-artifact example: it is being removed under #10 and is explicitly exempt from the sync rule for this issue.
- Auto-archiving on completion (strict gates make "done" unknowable without the user saying so), run duplication, export or import, cross-device sync, persisted UI preferences (sidebar collapse), and new packages or dependencies.

## Acceptance

- All new core functions are TDD-covered in `packages/core/test/runstore.test.js`; `npm test` runs both test files and passes; the diff leaves existing engine functions untouched.
- In the demo: create a second presales run (starts blank), switch between the two from the sidebar, rename one, archive it, see it leave the sidebar, find it on the runs screen, open it read-only, unarchive it, delete it through the confirm step. Progress meters reflect `runSummary`.
- Display names: a renamed run shows its name, a presales run with a client filled shows the client, an unnamed blank run shows "Run N".
- Reload restores the store through `persistence`; stored v1 state is discarded and the demo reseeds. The component works with `persistence` omitted.
- Browsing, gating, advance and override, drafts, renderers, keyboard navigation, and the under-720px layout work unchanged inside any single run; the sidebar collapses to a rail.
- `npm test` and `npm run build -w examples/demo` pass.

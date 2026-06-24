# spec: harden run-store accessors against inherited-property run ids

Issue: #69. Closes #69.

## Goal

`store.entries` is a plain object and run ids are only constrained to
non-empty strings, so a run id equal to an inherited `Object.prototype`
member (`"toString"`, `"constructor"`, `"valueOf"`, `"hasOwnProperty"`,
...) resolves to that inherited member under a bare `store.entries[id]`
lookup instead of resolving to `undefined`. Because consumers choose run
ids, this is reachable, not theoretical.

#67 fixed exactly this in `cloneRun` (it looks ids up through
`Object.prototype.hasOwnProperty.call(store.entries, id)`), a fix surfaced
by the #67 GitHub-bot review and deliberately scoped to that one function.
Every other run-store accessor still uses a bare lookup and carries the
same latent bug:

- The mutators (`renameRun`, `archiveRun`, `unarchiveRun`, `setActiveRun`,
  `updateRunState`) read the inherited function, which is truthy, so the
  `if (!entry) return store` guard does not fire. The function then spreads
  a prototype member into a new entry. The spread of a function yields an
  object with no `id`, so `withEntry` writes a corrupt record keyed
  `"undefined"`; `setActiveRun` additionally sets `activeWorkflowId` to
  `undefined`.
- `activeRunEntry` returns the inherited function instead of `null` when
  the active mapping resolves to an inherited name (`(id && store.entries[id]) || null`).
- `runDisplayName` returns the inherited function's `.name` (for example
  the string `"toString"`) as the run's display name instead of `""`.
- `deleteRun` also reads the inherited member. Its downstream logic keys
  off `entry.workflowId` (which is `undefined` for a function), so it
  happens to return an equivalent store today and produces no corrupt
  output. The lookup is still wrong and is hardened for consistency and so
  the safety does not silently depend on that downstream accident.

## Change

Add a small internal own-property helper pair in the run-store section of
`packages/core/src/index.js`, near `withEntry`. Neither is exported, so the
public API surface and the generated `.d.ts` are unchanged.

```js
function hasEntry(store, id) {
  return Object.prototype.hasOwnProperty.call(store.entries, id);
}
function getEntry(store, id) {
  return hasEntry(store, id) ? store.entries[id] : undefined;
}
```

Route every run-store accessor keyed by a run id through `getEntry`:
`renameRun`, `archiveRun`, `unarchiveRun`, `setActiveRun`,
`updateRunState`, `deleteRun`, `activeRunEntry`, `runDisplayName`.
Consolidate `cloneRun`'s existing local `has` closure onto the shared
`hasEntry` (the DRY consolidation the issue proposes).

Behavior is unchanged for ordinary run ids. It is also unchanged for a real
entry whose id legitimately equals an inherited name: such an entry is an
own property, so `hasEntry` is true and `getEntry` returns it. The only
behavior that changes is the inherited-name-with-no-real-entry case, which
moves from "returns or writes a prototype member" to "treated as absent".

### Scope note: `runDisplayName`

The issue enumerates seven accessors. `runDisplayName` is an eighth
run-store accessor keyed by a run id with the identical bare-lookup bug
(it returns `"toString"` as a display name). It is included here so the
acceptance criterion "every store accessor treats a run id equal to an
inherited property name as absent" actually holds across the surface,
rather than leaving one known instance of the same bug unfixed.

## Files

- `packages/core/src/index.js`: add `hasEntry`/`getEntry` near `withEntry`
  (~860); replace the entry lookup in the eight accessors above; replace
  `cloneRun`'s local `has` with `hasEntry`. No exported signature changes.
- `packages/core/test/runstore.test.js`: add inherited-property-id tests
  (see Acceptance). The existing `cloneRun` inherited-property test stays
  as is.

## Out of scope

- Constraining or validating run-id format. Run ids stay free non-empty
  strings; this hardens the lookups, it does not restrict the inputs.
- Separate sanitization of the `activeRunByWorkflow` map keyed by
  `workflowId`. Routing the entries lookup in `activeRunEntry` through
  `getEntry` already neutralizes an inherited `workflowId` at the entries
  step (it returns `null`), so no extra workflowId guard is added.
- `getStepEntry` and other run-level accessors keyed by `stepId` on a run.
  Those read a run's `stepState`, a different object and a different
  concern from the run-store entry lookups.
- Any persistence version bump, migration, or compat shim. The change is
  internal hardening with no run or store shape change.
- Any demo or UI affordance.

## Acceptance

- `npm test` passes with new run-store tests (in `runstore.test.js`)
  covering, with a `"toString"` or `"constructor"` run id:
  - `renameRun`, `archiveRun`, `unarchiveRun`, `setActiveRun`,
    `updateRunState`, `deleteRun` each return the store unchanged (no
    corrupt entry written, no stray `"undefined"` key, active mappings
    untouched).
  - `activeRunEntry` returns `null` when the active mapping points at an
    inherited name with no real entry.
  - `runDisplayName` returns `""` for an inherited-name id with no real
    entry.
  - A positive case: a real entry whose id is `"constructor"` still
    renames, archives, resolves through `activeRunEntry`/`runDisplayName`,
    and deletes normally (guards against over-hardening that would reject
    legitimate own-property entries).
- No behavior change for ordinary run ids; the existing run-store suite
  stays green.
- No exported API change; `npm run types` produces no diff (the helpers are
  internal).

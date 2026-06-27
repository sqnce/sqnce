/*
 * Apply a consumer-supplied run-reconcile function. Pure and React-free so it
 * runs under node:test: ProcessRolodex calls these where a run first enters
 * the rendered state (entry creation, load, and each content transition), so
 * a consumer whose run state is partly derived from policy reflects it live.
 * The reconcile function is the consumer's; this module only decides when to
 * apply it, and guards an absent prop or a bad return so a missing or buggy
 * reconcile degrades to a no-op rather than emptying the deck.
 */

/**
 * Apply reconcile to one run. When reconcileFn is not a function, returns the
 * run unchanged (the absent-prop no-op, same reference). Otherwise returns
 * reconcileFn(run, context); a consumer bug degrades to the original run
 * unchanged, whether the function returns a non-object or throws. This is
 * total by design: on the load path a thrown hook must not escape to the
 * persistence catch, where the placeholder store would be saved over the
 * user's runs, and on a transition it must not break the state updater.
 * @param {((run: any, context: any) => any) | null | undefined} reconcileFn
 * @param {any} run
 * @param {any} [context]
 * @returns {any}
 */
export function applyReconcile(reconcileFn, run, context) {
  if (typeof reconcileFn !== "function") return run;
  let next;
  try {
    next = reconcileFn(run, context);
  } catch (e) {
    return run;
  }
  if (next === null || typeof next !== "object") return run;
  return next;
}

/**
 * Apply reconcile to every entry's run in a versioned run store, resolving
 * each entry's workflow definition from workflows to build the context. When
 * reconcileFn is not a function, returns the store unchanged (same reference),
 * so the load path behaves exactly as today when the prop is absent. The input
 * store is never mutated; store shape and entry metadata (including updatedAt,
 * which a load-time projection must not bump) are preserved. An entry whose
 * workflow is not in workflows keeps its run unchanged, because the context
 * cannot be built.
 * @param {((run: any, context: any) => any) | null | undefined} reconcileFn
 * @param {any} store
 * @param {any[]} workflows
 * @returns {any}
 */
export function applyReconcileToStore(reconcileFn, store, workflows) {
  if (typeof reconcileFn !== "function") return store;
  // Null-prototype maps: store ids (workflow id, entry id) are data, so a key
  // like "__proto__" or "toString" must become an own entry, never reach the
  // prototype or be mistaken for an inherited member.
  const defsById = Object.create(null);
  for (const w of workflows || []) defsById[w.id] = w;
  const entries = Object.create(null);
  for (const id of Object.keys(store.entries)) {
    const entry = store.entries[id];
    const def = defsById[entry.workflowId];
    const run = def
      ? applyReconcile(reconcileFn, entry.run, { def, runId: entry.id })
      : entry.run;
    entries[id] = run === entry.run ? entry : { ...entry, run };
  }
  return { ...store, entries };
}

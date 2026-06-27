import { updateRunState } from "@sqnce/core";
import { applyReconcile } from "./reconcile.js";

/*
 * The store-write path for content mutations, lifted out of the Sqnce shell so
 * it is pure and testable under node:test (the react package has no DOM test
 * setup). It resolves the write against the entry's CURRENT run, so an async
 * writer (draft generation, file read) that captured an earlier run does not
 * clobber edits made while it was in flight. The active-status re-check is kept
 * here: a write that lands after the run was archived or deleted is dropped.
 */

/**
 * Apply a content write to one run-store entry.
 * @param {any} store the versioned run store
 * @param {string} entryId the entry to write
 * @param {any | ((prevRun: any) => any)} arg a run value, or a function applied
 *   to the entry's current run to produce the next run
 * @param {{ reconcileRun?: any, def: any, now: number }} options reconcile hook,
 *   the entry's workflow definition (for the reconcile context), and the
 *   timestamp to stamp (passed in so this stays pure)
 * @returns {any} the next store, or the same store unchanged when the entry is
 *   missing or not active
 */
export function applyRunWrite(store, entryId, arg, { reconcileRun, def, now }) {
  const e = store.entries[entryId];
  if (!(e && e.status === "active")) return store;
  const next = typeof arg === "function" ? arg(e.run) : arg;
  const reconciled = applyReconcile(reconcileRun, next, { def, runId: entryId });
  return updateRunState(store, entryId, reconciled, now);
}

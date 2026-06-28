import { useState, useEffect, useRef, useCallback } from "react";
import {
  createRunStore,
  addRun,
  activeRunEntry,
  setActiveRun as coreSetActiveRun,
} from "@sqnce/core";
import { applyReconcileToStore } from "./reconcile.js";

/*
 * The run-store lifecycle, extracted from the Sqnce shell (#114): it owns the
 * persisted versioned run store, derives the active workflow/entry pointers, and
 * runs the persistence load, debounced save, and active-entry repair effects.
 * The one-shot initial-view route effect stays in the shell, because it is a
 * view-routing concern (it sets the shell's view) rather than store persistence.
 *
 * @param {Object} args
 * @param {{ load: () => Promise<any>, save: (state: any) => Promise<void> }} [args.persistence]
 * @param {import("@sqnce/core").Definition[]} args.workflows
 * @param {Function} [args.reconcileRun] consumer run-reconcile hook
 * @param {(store: any, workflowId: string) => any} args.newEntryFor seeds a new run entry
 * @param {string} args.view the shell's current view (the repair effect only adds
 *   a fresh entry while the rolodex view needs one)
 * @returns {{ store: any, setStore: Function, loaded: boolean, activeId: string,
 *   entry: any, staleActiveId: boolean, cancelPendingSave: () => void }}
 */
export function useRunStore({ persistence, workflows, reconcileRun, newEntryFor, view }) {
  const [store, setStore] = useState(() => {
    const empty = createRunStore();
    return addRun(empty, newEntryFor(empty, workflows[0].id));
  });
  const [loaded, setLoaded] = useState(!persistence);
  const saveTimer = useRef(null);

  const activeId =
    store.activeWorkflowId && workflows.some((w) => w.id === store.activeWorkflowId)
      ? store.activeWorkflowId
      : workflows[0].id;
  const entry = activeRunEntry(store, activeId);
  const staleActiveId = store.activeWorkflowId !== activeId;

  /* Repair a loaded store whose active pointers do not match the
     rendered state. Two cases: a foreign activeWorkflowId (workflow no
     longer in the props) is normalized to the rendered fallback so the
     sidebar highlight and saves agree; a missing active entry (last
     live run deleted) gets a fresh entry, but only when the rolodex
     view actually needs it: on the runs screen a confirmed delete of
     the final run must not appear to recreate a blank run. */
  useEffect(() => {
    if (!loaded) return;
    if (entry && staleActiveId) {
      setStore((s) => {
        const e = activeRunEntry(s, activeId);
        return e ? coreSetActiveRun(s, e.id) : s;
      });
      return;
    }
    if (entry || view !== "rolodex") return;
    setStore((s) => (activeRunEntry(s, activeId) ? s : addRun(s, newEntryFor(s, activeId))));
  }, [loaded, entry, staleActiveId, activeId, view, newEntryFor]);

  /* ---------- persistence ---------- */
  useEffect(() => {
    if (!persistence) return;
    (async () => {
      try {
        const saved = await persistence.load();
        /* Version 2 stores only; anything else (including the old
           { activeId, runs } shape) is discarded. Pre-launch, no users. */
        if (saved && saved.version === 3 && saved.entries && saved.activeRunByWorkflow) {
          setStore(applyReconcileToStore(reconcileRun, saved, workflows));
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

  /* The draft-generation flush cancels the pending debounce before its manual
     save, so a server-side generator resolves runId from a fresh store. */
  const cancelPendingSave = useCallback(() => clearTimeout(saveTimer.current), []);

  return { store, setStore, loaded, activeId, entry, staleActiveId, cancelPendingSave };
}

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ThemeRootContext } from "./themeScope.jsx";
import { railChip } from "./railNav.js";
import {
  flattenSubStages,
  createRun,
  setOutput as coreSetOutput,
  setCheckedDone,
  reopenStep,
  isRunComplete,
  browse as coreBrowse,
  jumpTo,
  advance as coreAdvance,
  skipSubStage,
  unskipSubStage,
  resolveSubject,
  buildDraftPrompt,
  draftTarget,
  parseDraft,
  validateOutputValue,
  buildTopology,
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
  runDisplayName,
} from "@sqnce/core";
import { CSS } from "./styles.js";
import ReadingView from "./ReadingView.jsx";
import RolodexView from "./RolodexView.jsx";
import RunSidebar from "./RunSidebar.jsx";
import RunsScreen from "./RunsScreen.jsx";
import OverviewModal from "./OverviewModal.jsx";
import { resolveRunStatus } from "./runStatus.js";
import { applyReconcile } from "./reconcile.js";
import { applyRunWrite } from "./runWrite.js";
import { useRunStore } from "./useRunStore.js";

/* Ids and timestamps are generated here, never inside @sqnce/core. */
function newId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    return crypto.randomUUID();
  return `run-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * <Sqnce />
 *
 * Props:
 *  - workflows: array of sqnce definitions (see /definitions for examples)
 *  - persistence (optional): { load: async () => state | null,
 *                              save: async (state) => void }
 *      where state is the versioned run store
 *      { version: 3, activeWorkflowId, activeRunByWorkflow, entries }.
 *      Anything that is not a version 3 store is discarded on load.
 *      Omit for in-memory only.
 *  - generateDraft (optional): async (prompt, context) => string where
 *      context is { workflowId, stepId, subject, runId }. runId is the
 *      active run entry id, for server-side generators that resolve the
 *      run from a shared store. The second argument
 *      is informational; single-argument implementations keep working.
 *      Wire this to any LLM provider. Omit to hide the
 *      "Generate draft" action entirely. Generation targets the step's
 *      first text output, else its first data output; data replies are
 *      parsed as strict JSON (one surrounding code fence tolerated) and
 *      validated before anything is stored.
 *  - workflowGroups (optional): array of { label, ids } grouping the
 *      switcher. Ids not matching a workflow are ignored; workflows in
 *      no group render in a trailing unlabeled section. Omit for the
 *      flat switcher.
 *  - initialRunFor (optional): (workflowId) => run, seeds the inner run
 *      of a workflow's first entry and backs Reset; every later
 *      "+ New run" starts blank. Defaults to createRun. Must be
 *      side-effect free; it can be called on every render.
 *  - renderers (optional): map of render kind -> React component, the
 *      registry for definition render hints. Resolution order: this map,
 *      then built-ins (markdown, table, cards, keyvalue), then fallback
 *      (JSON tree for data outputs, default editor otherwise). A renderer
 *      receives { spec, value, onChange, context } and must treat
 *      onChange as value-mutations-only. Omit to use built-ins alone.
 *  - validators (optional): map of validator name -> (value, spec,
 *      { run, stepId }) =>
 *      string | null, resolving the validate names declared on output
 *      specs. A returned string is the problem message: it makes the
 *      owning step incomplete (gates, status, draft context) and
 *      rejects generated drafts. Pure functions; omit to validate
 *      nothing.
 *  - contextViews (optional): map of context-view name -> (value, spec,
 *      { run, sourceStepId, targetStepId }) => value, resolving the
 *      contextView a step declares. When a step's draft prompt is built,
 *      each prior output's value passes through the named view, selecting
 *      what that step sees (selection at serialization, run state
 *      untouched). Pure functions; omit for full context.
 *  - generatedBadge (optional): (lifecycle, spec) => string | null,
 *      overrides the generated-output badge label. lifecycle is the owning
 *      step's status ("done" | "draft" | "open"). A non-empty string is the
 *      label; null hides the badge. Omit for the default mapping (a done
 *      step reads "AI generated", otherwise "AI draft").
 *  - renderRunHeader (optional): ({ def, run, runId, subject, complete })
 *      => ReactNode, mounted in the reading-mode run header band (a final
 *      verdict banner, for example). The band only renders for a finished
 *      run, so complete is true whenever it fires. Omit to mount nothing.
 *  - runStatus (optional): ({ def, run, runId }) => string | { word, tone }
 *      | null, a short per-run status word shown in the runs sidebar, the
 *      runs screen, and the reading-mode band (where it replaces the
 *      default "Complete"). A bare string is the word; tone is an opaque
 *      visual hint that must degrade to a plain word. Omit to show no word
 *      in the lists and keep "Complete" in the band.
 *  - renderStageStatus (optional): ({ def, run, runId, stepId, status })
 *      => ReactNode, a per-step status badge shown in place of the generic
 *      "Done"/"Draft" word on a deck card's step row. status is the step's
 *      lifecycle ("done" | "draft" | "open"). Only a null or undefined
 *      return falls back to the generic word; any other return is shown as
 *      given. Called once per drawn step, so keep it cheap and pure. Omit
 *      to show the generic word everywhere.
 *  - reconcileRun (optional): (run, { def, runId }) => run, a pure,
 *      idempotent function the component applies to a run before it is used
 *      to select or render a card: to each entry's run on load, to every
 *      newly seeded run at entry creation, and to the run each setRun
 *      transition produces. Use it to reflect run state a consumer derives
 *      from policy (for example an auto-skip computed from upstream content)
 *      live, without a page reload. It must change only policy-derived run
 *      state and must not move navigation (idx). Omit for the current
 *      behavior (no-op).
 */

function SwitcherButtons({ workflows, activeId, onSwitch }) {
  return (
    <div className="pf-switch">
      {workflows.map((w) => (
        <button
          key={w.id}
          className={`pf-switch-btn ${w.id === activeId ? "pf-switch-active" : ""}`}
          onClick={() => onSwitch(w.id)}
        >
          {w.short || w.name}
        </button>
      ))}
    </div>
  );
}

function WorkflowSwitcher({ workflows, groups, activeId, onSwitch }) {
  if (!groups || !groups.length) {
    return <SwitcherButtons workflows={workflows} activeId={activeId} onSwitch={onSwitch} />;
  }
  const byId = new Map(workflows.map((w) => [w.id, w]));
  const sections = groups
    .map((g) => ({
      label: g.label,
      workflows: (g.ids || []).map((id) => byId.get(id)).filter(Boolean),
    }))
    .filter((s) => s.workflows.length);
  const grouped = new Set(sections.flatMap((s) => s.workflows.map((w) => w.id)));
  const rest = workflows.filter((w) => !grouped.has(w.id));
  if (rest.length) sections.push({ label: "", workflows: rest });
  return (
    <div className="pf-switch-groups">
      {sections.map((s, i) => (
        <div key={s.label || `rest-${i}`} className="pf-switch-group">
          <span className="pf-switch-label">{s.label || " "}</span>
          <SwitcherButtons workflows={s.workflows} activeId={activeId} onSwitch={onSwitch} />
        </div>
      ))}
    </div>
  );
}

/**
 * @typedef {Object} RendererContext
 * @property {string} workflowId
 * @property {string} stepId
 * @property {string} subject
 * @property {boolean} readOnly
 * @property {string | null} runId the active run entry id, or null when there is no active run entry
 * @property {boolean} [expanded]
 */
/**
 * @typedef {Object} RendererProps
 * @property {import("@sqnce/core").OutputSpec} spec
 * @property {any} value
 * @property {(value: any) => void} onChange
 * @property {RendererContext} context
 */
/**
 * @typedef {Object} SqnceProps
 * @property {import("@sqnce/core").Definition[]} workflows
 * @property {{ load: () => Promise<any>, save: (state: any) => Promise<void> }} [persistence]
 * @property {(prompt: string, context: { workflowId: string, stepId: string, subject: string, runId: string }) => Promise<string>} [generateDraft]
 * @property {{ label: string, ids: string[] }[]} [workflowGroups]
 * @property {(workflowId: string) => import("@sqnce/core").Run} [initialRunFor]
 * @property {Object<string, import("react").ComponentType<RendererProps>>} [renderers]
 * @property {Object<string, (value: any, spec: import("@sqnce/core").OutputSpec, ctx: { run?: import("@sqnce/core").Run, stepId: string }) => (string|null)>} [validators]
 * @property {Object<string, (value: any, spec: import("@sqnce/core").OutputSpec, ctx: { run: import("@sqnce/core").Run, sourceStepId: string, targetStepId?: string }) => any>} [contextViews] Map of context-view name to a pure selector; a step's `contextView` names one. Applied to prior outputs when building that step's draft prompt; optional, the component works without it.
 * @property {(lifecycle: "done"|"draft"|"open", spec: import("@sqnce/core").OutputSpec) => (string|null)} [generatedBadge]
 * @property {(ctx: { def: import("@sqnce/core").Definition, run: import("@sqnce/core").Run, runId: string|null, subject: string, complete: boolean }) => import("react").ReactNode} [renderRunHeader]
 * @property {(ctx: { def: import("@sqnce/core").Definition, run: import("@sqnce/core").Run, runId: string|null }) => (string | { word: string, tone?: string } | null)} [runStatus]
 * @property {(ctx: { def: import("@sqnce/core").Definition, run: import("@sqnce/core").Run, runId: string|null, stepId: string, status: "done"|"draft"|"open" }) => import("react").ReactNode} [renderStageStatus]
 * @property {(run: import("@sqnce/core").Run, context: { def: import("@sqnce/core").Definition, runId: string|null }) => import("@sqnce/core").Run} [reconcileRun]
 */

/** @param {SqnceProps} props */
export default function Sqnce({ workflows, persistence, generateDraft, workflowGroups, initialRunFor, renderers, validators, contextViews, generatedBadge, renderRunHeader, runStatus, renderStageStatus, reconcileRun }) {
  const makeInitialRun = useCallback(
    (id) => (initialRunFor ? initialRunFor(id) : createRun()),
    [initialRunFor]
  );
  /* A workflow's first entry seeds from initialRunFor; later runs start blank. */
  const newEntryFor = useCallback(
    (s, workflowId) => {
      const first = runsForWorkflow(s, workflowId).length === 0;
      const id = newId();
      const seed = first ? makeInitialRun(workflowId) : createRun();
      const wf = workflows.find((w) => w.id === workflowId);
      const run = wf ? applyReconcile(reconcileRun, seed, { def: wf, runId: id }) : seed;
      return createRunEntry({ id, workflowId, run, now: Date.now() });
    },
    [makeInitialRun, workflows, reconcileRun]
  );

  const [expanded, setExpanded] = useState(null);
  const [generating, setGenerating] = useState(null);
  const [genError, setGenError] = useState(null);
  const [manualEdit, setManualEdit] = useState([]);
  const [showInputs, setShowInputs] = useState(false);
  const [view, setView] = useState("rolodex");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const pfRootRef = useRef(null);
  const fileRef = useRef(null);
  const attachFor = useRef(null);
  const routedOnLoad = useRef(false);

  /* The run-store lifecycle (persisted store, active pointers, load/save/repair)
     lives in useRunStore; the shell keeps view state and the initial-view route
     effect below. */
  const { store, setStore, loaded, activeId, entry, cancelPendingSave } =
    useRunStore({ persistence, workflows, reconcileRun, newEntryFor, view });

  const def = useMemo(
    () => workflows.find((w) => w.id === activeId) || workflows[0],
    [workflows, activeId]
  );
  const subs = useMemo(() => flattenSubStages(def), [def]);
  // Build the per-definition topology once and feed it to the read aggregates,
  // so they do not re-flatten the definition on every render (#113).
  const topology = useMemo(() => buildTopology(def), [def]);
  const readOnly = !!entry && entry.status === "archived";
  const activeRunId = entry ? entry.id : null;
  /* One-frame fallback while the repair effect (in useRunStore) creates an entry. */
  const run = entry ? entry.run : makeInitialRun(activeId);
  const idx = Math.min(run.idx, subs.length - 1);
  const frontier = Math.min(run.frontier, def.mainStages.length - 1);
  const complete = useMemo(() => isRunComplete(def, run, { validators, topology }), [def, run, validators, topology]);

  /* Content mutations route through applyRunWrite: it bumps updatedAt, is
     blocked on archived runs, and resolves a functional write against the
     entry's current run so an async writer (draft generation, file read) does
     not clobber edits made while it was in flight. arg is a value or
     (prevRun) => nextRun. */
  const setRun = useCallback(
    (arg) => {
      if (!entry || readOnly) return;
      setStore((s) => applyRunWrite(s, entry.id, arg, { reconcileRun, def, now: Date.now() }));
    },
    [entry, readOnly, reconcileRun, def]
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

  /* Route the startup active run once: a finished run that was active at
     load (cold mount without persistence, or after persistence.load swaps
     the store) opens in reading, matching open and switch. The ref keeps
     this a one-shot so a later Edit toggle is not snapped back. */
  useEffect(() => {
    if (!loaded || routedOnLoad.current) return;
    routedOnLoad.current = true;
    setView(viewForRun(entry));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, entry]);

  /* Reading mode is only valid over a present, complete run. Reset run, a
     sidebar delete, or any path that drops completeness while reading
     routes back to the authoring deck rather than showing "Complete" over
     emptied content. */
  useEffect(() => {
    if (view === "reading" && (!entry || !complete)) setView("rolodex");
  }, [view, entry, complete]);

  /* ---------- derived ---------- */
  const subjectName = useMemo(() => resolveSubject(def, run), [def, run]);

  const clearTransients = () => {
    setExpanded(null);
    setGenError(null);
    setShowInputs(false);
    setManualEdit([]);
    setOverviewOpen(false);
  };

  const doBrowse = (dir) => {
    const next = coreBrowse(run, subs, dir);
    if (next !== run) {
      clearTransients();
      setNav(next);
    }
  };

  const doAdvance = (force) => {
    if (readOnly) return;
    /* Decide whether an advance happens and whether to clear transient UI from
       the current render (a blocked advance leaves the expanded step open),
       then write through the functional form so the commit recomputes against
       the latest run. The updater never reads a flag set inside it, so a
       re-invoked updater (StrictMode) is safe. */
    const preview = coreAdvance(run, subs, { force, validators });
    if (!preview.advanced) return;
    clearTransients();
    setRun((prev) => {
      const r = coreAdvance(prev, subs, { force, validators });
      return r.advanced ? r.run : prev;
    });
  };

  /* Pick the landing view for a run entry: a finished run reads, an
     in-progress run authors. Uses the entry's own workflow definition so
     switching workflows routes correctly. */
  const viewForRun = (e) => {
    if (!e) return "rolodex";
    const d = workflows.find((w) => w.id === e.workflowId) || def;
    return isRunComplete(d, e.run, { validators }) ? "reading" : "rolodex";
  };

  const switchWorkflow = (id) => {
    if (id === activeId) return;
    clearTransients();
    /* Route on the entry that will be shown, including a freshly seeded
       first run: a complete seed (from initialRunFor) lands in reading. */
    const existing = activeRunEntry(store, id);
    const entryToShow = existing || newEntryFor(store, id);
    setView(viewForRun(entryToShow));
    setStore((s) => {
      const e = activeRunEntry(s, id);
      return e ? coreSetActiveRun(s, e.id) : addRun(s, entryToShow);
    });
  };

  /* ---------- run management ---------- */
  const openRun = (runId) => {
    clearTransients();
    setView(viewForRun(store.entries[runId]));
    setStore((s) => coreSetActiveRun(s, runId));
  };
  const newRun = (workflowId) => {
    clearTransients();
    /* A normal new run is empty so it authors; a complete first-run seed
       (from initialRunFor) reads, matching open and switch. */
    const e = newEntryFor(store, workflowId);
    setView(viewForRun(e));
    setStore((s) => addRun(s, e));
  };
  const doRename = (runId, name) => setStore((s) => renameRun(s, runId, name, Date.now()));
  const doArchive = (runId) => setStore((s) => archiveRun(s, runId, Date.now()));
  const doUnarchive = (runId) => setStore((s) => unarchiveRun(s, runId, Date.now()));
  const doDelete = (runId) => setStore((s) => coreDeleteRun(s, runId));

  /* Latest-handler ref so the window listener subscribes once (it previously
     had no dependency array and re-subscribed every render, #113) while still
     seeing current state. The guard also bails while an output overlay is open,
     so its arrow keys do not browse the deck behind it (#112). */
  const onKeyRef = useRef(null);
  onKeyRef.current = (e) => {
    if (overviewOpen || overlayOpen || view === "reading") return;
    if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
    if (e.key === "ArrowLeft") doBrowse(-1);
    if (e.key === "ArrowRight") doBrowse(1);
  };
  useEffect(() => {
    const onKey = (e) => onKeyRef.current && onKeyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------- mutations ---------- */
  const writeOutput = (stepId, outputId, value, opts) => {
    if (readOnly) return;
    setRun((prev) => coreSetOutput(prev, stepId, outputId, value, opts));
  };
  const toggleDone = (stepId, checked) => {
    if (readOnly) return;
    setRun((prev) => setCheckedDone(prev, stepId, checked));
  };
  const reopen = (stepId) => {
    if (readOnly) return;
    setRun((prev) => reopenStep(prev, stepId));
  };
  /* setRun, not setNav: a skip changes gate state, so it bumps
     updatedAt and is blocked on archived runs. */
  const toggleSkip = (subStageId, skipped) => {
    if (readOnly) return;
    setExpanded(null);
    setRun((prev) =>
      skipped ? unskipSubStage(prev, subs, subStageId) : skipSubStage(prev, subs, subStageId)
    );
  };

  /* ---------- draft generation ---------- */
  const generate = async (sub, step) => {
    if (!generateDraft || readOnly) return;
    // Before load resolves, the store is the initial placeholder; flushing
    // it (below) would overwrite saved runs. loaded is true when there is
    // no persistence, so this only blocks during a pending load.
    if (!loaded) return;
    const target = draftTarget(step);
    if (!target) return;
    setGenerating(step.id);
    setGenError(null);
    try {
      if (persistence) {
        cancelPendingSave();
        try {
          await persistence.save(store);
        } catch (e) {
          // The flush is what lets a server-side generator resolve runId
          // from the shared store. If it fails, the store is stale, so
          // generating would risk the cross-run mixup this guards against:
          // surface the failure instead of generating from old data.
          console.error("save failed", e);
          setGenError({ stepId: step.id, message: "Could not save the current run before generating. Try again." });
          return;
        }
      }
      const prompt = buildDraftPrompt(def, subs, run, idx, step, { validators, contextViews });
      const text = await generateDraft(prompt, {
        workflowId: def.id,
        stepId: step.id,
        subject: subjectName,
        runId: entry.id,
      });
      if (!text) throw new Error("Empty response");
      const parsed = parseDraft(target, text);
      if (!parsed.ok) {
        setGenError({ stepId: step.id, message: parsed.error });
        return;
      }
      const message = validateOutputValue(subs, run, idx, step.id, target, parsed.value, validators);
      if (typeof message === "string") {
        setGenError({ stepId: step.id, message: `Draft failed validation: ${message}` });
        return;
      }
      writeOutput(step.id, target.id, parsed.value, { generated: true });
    } catch (e) {
      setGenError({ stepId: step.id, message: null });
    } finally {
      setGenerating(null);
    }
  };

  /* ---------- file attach ---------- */
  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    const tgt = attachFor.current;
    if (!f || !tgt) return;
    const finish = (content) =>
      writeOutput(tgt.stepId, tgt.outputId, { name: f.name, content: content || "" });
    if (f.type.startsWith("text") || /\.(md|txt|csv|json)$/i.test(f.name)) {
      const r = new FileReader();
      r.onload = () => finish(String(r.result).slice(0, 6000));
      r.onerror = () => finish(null);
      r.readAsText(f);
    } else {
      finish(null);
    }
    e.target.value = "";
  };

  const resetRun = () => {
    if (readOnly) return;
    clearTransients();
    /* A reset is a replace, not a compose, so the function ignores prev; it
       passes a function only to keep one call style for setRun. */
    setRun(() => makeInitialRun(activeId));
  };

  /* ---------- render ---------- */
  return (
    <ThemeRootContext.Provider value={pfRootRef}>
    <div className="pf-root" ref={pfRootRef}>
      <style>{CSS}</style>
      <input type="file" ref={fileRef} style={{ display: "none" }} onChange={onFile} />

      <div className="pf-header">
        <div className="pf-brand">
          <span className="pf-brand-mark">◫</span>
          <span className="pf-brand-name">{def.name}</span>
          <span className="pf-subject">· {subjectName}</span>
        </div>
        {view !== "reading" && (
        <div className="pf-rail">
          {def.mainStages.map((ms, mi) => {
            /* Reachability, glyph, and color-state come from the shared rail
               model: a chip is interactive exactly when the engine accepts a
               jump to its first sub-stage, so this is fork-aware with no
               frontier math and no core change. The active/done/ahead color
               class is unchanged; only the lock glyph and interactivity follow
               reachability. */
            const { firstFlat, interactive, glyph, state } = railChip(run, subs, def.mainStages, mi, validators);
            /* The rail also renders on the runs screen (view !== "reading"),
               but only the authoring deck may navigate. Gate interactivity to
               the rolodex view, otherwise a chip click would silently rewrite
               the active run's idx behind the run manager. The rail still shows
               (inert) elsewhere, matching its pre-clickable behavior. */
            const clickable = interactive && view === "rolodex";
            const go = () => {
              clearTransients();
              setNav(jumpTo(run, subs, firstFlat));
            };
            return (
              <React.Fragment key={ms.id}>
                {mi > 0 && <span className={`pf-rail-line ${mi <= frontier ? "pf-rail-line-fill" : ""}`} />}
                <span
                  className={`pf-rail-stage pf-rail-${state} ${clickable ? "pf-rail-clickable" : ""}`}
                  aria-current={state === "active" ? "step" : undefined}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  aria-label={clickable ? `Go to ${ms.name}` : undefined}
                  onClick={clickable ? go : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            go();
                          }
                        }
                      : undefined
                  }
                >
                  <span className="pf-rail-circle">{glyph}</span>
                  {ms.name}
                  {state === "active" && <span className="pf-rail-here" aria-hidden="true">▾</span>}
                </span>
              </React.Fragment>
            );
          })}
        </div>
        )}
        {view === "rolodex" && (
          <span className="pf-counter">
            {idx + 1} / {subs.length}
          </span>
        )}
        <div className="pf-header-right">
          {workflows.length > 1 && (
            <WorkflowSwitcher
              workflows={workflows}
              groups={workflowGroups}
              activeId={activeId}
              onSwitch={switchWorkflow}
            />
          )}
          {view === "rolodex" && (
            <button
              className="pf-reset"
              onClick={() => setOverviewOpen(true)}
              title="About this process"
            >
              About
            </button>
          )}
          {view === "rolodex" && complete && (
            <button
              className="pf-reset"
              onClick={() => { clearTransients(); setView("reading"); }}
              title="Read this finished run"
            >
              Read
            </button>
          )}
          <button
            className="pf-reset"
            onClick={() => {
              clearTransients();
              setView(view === "runs" ? viewForRun(entry) : "runs");
            }}
          >
            {view === "runs" ? "Back to run" : "Runs"}
          </button>
          <button
            className="pf-reset"
            onClick={resetRun}
            disabled={readOnly}
            title="Clear this workflow's run"
          >
            Reset run
          </button>
        </div>
      </div>

      {readOnly && view === "rolodex" && (
        <div className="pf-archived">
          <span>This run is archived and read-only.</span>
          <button className="pf-btn pf-btn-sm" onClick={() => doUnarchive(entry.id)}>
            Unarchive
          </button>
        </div>
      )}

      <div className="pf-body">
      <RunSidebar
        workflows={workflows}
        store={store}
        validators={validators}
        runStatus={runStatus}
        collapsed={!sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onOpenRun={openRun}
        onNewRun={newRun}
        onRename={doRename}
        onArchive={doArchive}
        onDelete={doDelete}
      />
      <div className="pf-main">

      {view === "runs" ? (
        <RunsScreen
          workflows={workflows}
          store={store}
          validators={validators}
          runStatus={runStatus}
          onOpenRun={openRun}
          onRename={doRename}
          onArchive={doArchive}
          onUnarchive={doUnarchive}
          onDelete={doDelete}
        />
      ) : view === "reading" ? (
        <ReadingView
          def={def}
          run={run}
          subs={subs}
          runName={entry ? runDisplayName(def, store, entry.id) : def.name}
          renderers={renderers}
          subjectName={subjectName}
          renderRunHeader={renderRunHeader}
          runStatus={runStatus}
          runId={activeRunId}
          complete={complete}
          onJump={(i) => setNav(jumpTo(run, subs, i))}
          onEdit={() => { clearTransients(); setView("rolodex"); }}
        />
      ) : (
        <RolodexView
          view={{ def, run, subs, idx, frontier, subjectName, activeRunId, readOnly }}
          slots={{ validators, renderers, generateDraft, generatedBadge, renderStageStatus }}
          ui={{ expanded, setExpanded, showInputs, setShowInputs, manualEdit, setManualEdit, generating, genError }}
          ops={{ setNav, clearTransients, reopen, toggleDone, generate, writeOutput, toggleSkip, doBrowse, doAdvance }}
          fileRef={fileRef}
          attachFor={attachFor}
          onOverlayOpenChange={setOverlayOpen}
        />
      )}

      </div>
      </div>
      {overviewOpen && (
        <OverviewModal
          def={def}
          run={run}
          subs={subs}
          idx={idx}
          frontier={frontier}
          validators={validators}
          onClose={() => setOverviewOpen(false)}
        />
      )}
    </div>
    </ThemeRootContext.Provider>
  );
}

/* ============================================================ CSS */

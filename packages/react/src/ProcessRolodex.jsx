import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ThemeRootContext } from "./themeScope.jsx";
import {
  flattenSubStages,
  createRun,
  setOutput as coreSetOutput,
  setCheckedDone,
  reopenStep,
  isOutputGenerated,
  getStepEntry,
  isStepComplete,
  stepHasAnyOutput,
  gateTypeOf,
  gateProgress,
  mainGateProgress,
  isRunComplete,
  browse as coreBrowse,
  jumpTo,
  advance as coreAdvance,
  skipSubStage,
  unskipSubStage,
  isSubStageSkipped,
  wasAdvanceForced,
  resolveSubject,
  serializeStep,
  buildDraftPrompt,
  draftTarget,
  parseDraft,
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
  runDisplayName,
} from "@sqnce/core";
import OutputView from "./OutputView.jsx";
import { buildRendererContext } from "./rendererContext.js";
import ReadingView from "./ReadingView.jsx";
import { OutputTypeIcon } from "./icons.jsx";
import RunSidebar from "./RunSidebar.jsx";
import RunsScreen from "./RunsScreen.jsx";
import OverviewModal from "./OverviewModal.jsx";
import { resolveGeneratedBadge } from "./badge.js";
import { resolveRunStatus } from "./runStatus.js";

/* Ids and timestamps are generated here, never inside @sqnce/core. */
function newId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    return crypto.randomUUID();
  return `run-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * <ProcessRolodex />
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
 * @typedef {Object} ProcessRolodexProps
 * @property {import("@sqnce/core").Definition[]} workflows
 * @property {{ load: () => Promise<any>, save: (state: any) => Promise<void> }} [persistence]
 * @property {(prompt: string, context: { workflowId: string, stepId: string, subject: string, runId: string }) => Promise<string>} [generateDraft]
 * @property {{ label: string, ids: string[] }[]} [workflowGroups]
 * @property {(workflowId: string) => import("@sqnce/core").Run} [initialRunFor]
 * @property {Object<string, import("react").ComponentType<RendererProps>>} [renderers]
 * @property {Object<string, (value: any, spec: import("@sqnce/core").OutputSpec, ctx: { run?: import("@sqnce/core").Run, stepId: string }) => (string|null)>} [validators]
 * @property {(lifecycle: "done"|"draft"|"open", spec: import("@sqnce/core").OutputSpec) => (string|null)} [generatedBadge]
 * @property {(ctx: { def: import("@sqnce/core").Definition, run: import("@sqnce/core").Run, runId: string|null, subject: string, complete: boolean }) => import("react").ReactNode} [renderRunHeader]
 * @property {(ctx: { def: import("@sqnce/core").Definition, run: import("@sqnce/core").Run, runId: string|null }) => (string | { word: string, tone?: string } | null)} [runStatus]
 */

/** @param {ProcessRolodexProps} props */
export default function ProcessRolodex({ workflows, persistence, generateDraft, workflowGroups, initialRunFor, renderers, validators, generatedBadge, renderRunHeader, runStatus }) {
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
  const [manualEdit, setManualEdit] = useState([]);
  const [loaded, setLoaded] = useState(!persistence);
  const [showInputs, setShowInputs] = useState(false);
  const [view, setView] = useState("rolodex");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const pfRootRef = useRef(null);
  const fileRef = useRef(null);
  const attachFor = useRef(null);
  const saveTimer = useRef(null);
  const routedOnLoad = useRef(false);

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
  const activeRunId = entry ? entry.id : null;
  /* One-frame fallback while the ensure effect below creates an entry. */
  const run = entry ? entry.run : makeInitialRun(activeId);
  const idx = Math.min(run.idx, subs.length - 1);
  const frontier = Math.min(run.frontier, def.mainStages.length - 1);
  const complete = useMemo(() => isRunComplete(def, run, { validators }), [def, run, validators]);

  /* Repair a loaded store whose active pointers do not match the
     rendered state. Two cases: a foreign activeWorkflowId (workflow no
     longer in the props) is normalized to the rendered fallback so the
     sidebar highlight and saves agree; a missing active entry (last
     live run deleted) gets a fresh entry, but only when the rolodex
     view actually needs it: on the runs screen a confirmed delete of
     the final run must not appear to recreate a blank run. */
  const staleActiveId = store.activeWorkflowId !== activeId;
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

  /* ---------- persistence ---------- */
  useEffect(() => {
    if (!persistence) return;
    (async () => {
      try {
        const saved = await persistence.load();
        /* Version 2 stores only; anything else (including the old
           { activeId, runs } shape) is discarded. Pre-launch, no users. */
        if (saved && saved.version === 3 && saved.entries && saved.activeRunByWorkflow) {
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
  const current = subs[idx];
  const inFrontierStage = current.mainIndex === frontier;
  const maxBrowse = subs.reduce((acc, s, i) => (s.mainIndex <= frontier ? i : acc), 0);
  const stageProg = mainGateProgress(def.mainStages[frontier], run, { validators });
  const nextMain = frontier < def.mainStages.length - 1 ? def.mainStages[frontier + 1] : null;
  const nextSub = idx < subs.length - 1 ? subs[idx + 1] : null;
  const prevSub = idx > 0 ? subs[idx - 1] : null;
  const subjectName = resolveSubject(def, run);

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
    const result = coreAdvance(run, subs, { force, validators });
    if (result.advanced) {
      clearTransients();
      setRun(result.run);
    }
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

  useEffect(() => {
    const onKey = (e) => {
      if (overviewOpen || view === "reading") return;
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
      if (e.key === "ArrowLeft") doBrowse(-1);
      if (e.key === "ArrowRight") doBrowse(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------- mutations ---------- */
  const writeOutput = (stepId, outputId, value, opts) => {
    if (readOnly) return;
    setRun(coreSetOutput(run, stepId, outputId, value, opts));
  };
  const toggleDone = (stepId, checked) => {
    if (readOnly) return;
    setRun(setCheckedDone(run, stepId, checked));
  };
  const reopen = (stepId) => {
    if (readOnly) return;
    setRun(reopenStep(run, stepId));
  };
  /* setRun, not setNav: a skip changes gate state, so it bumps
     updatedAt and is blocked on archived runs. */
  const toggleSkip = (subStageId, skipped) => {
    if (readOnly) return;
    setExpanded(null);
    setRun(
      skipped ? unskipSubStage(run, subs, subStageId) : skipSubStage(run, subs, subStageId)
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
        clearTimeout(saveTimer.current);
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
      const prompt = buildDraftPrompt(def, subs, run, idx, step, { validators });
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
      const fn = target.validate && validators && validators[target.validate];
      const message = fn ? fn(parsed.value, target, { run, stepId: step.id }) : null;
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
    setRun(makeInitialRun(activeId));
  };

  const prevDoneBlocks = prevSub && !isSubStageSkipped(run, prevSub.id)
    ? prevSub.steps
        .map((s) => ({ step: s, entry: getStepEntry(run, s.id) }))
        .filter(
          ({ step, entry }) =>
            isStepComplete(step, entry, gateTypeOf(prevSub), validators, run) && stepHasAnyOutput(step, entry)
        )
    : [];

  const typesWithValue = (step) => {
    const entry = getStepEntry(run, step.id);
    const types = [];
    (step.outputs || []).forEach((spec) => {
      if (hasValue(spec, (entry.outputs || {})[spec.id]) && !types.includes(spec.type)) types.push(spec.type);
    });
    return types;
  };

  const statusOf = (sub, step) => {
    const entry = getStepEntry(run, step.id);
    if (isStepComplete(step, entry, gateTypeOf(sub), validators, run)) return "done";
    if (stepHasAnyOutput(step, entry)) return "draft";
    return "open";
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
            /* Skip-aware: a stage whose remaining sub-stage gates are met
               reads done even when a skipped sub-stage's own gate is not. */
            const allDone = mainGateProgress(ms, run, { validators }).met;
            const stageLocked = mi > frontier;
            const state = mi === current.mainIndex ? "active" : allDone ? "done" : "ahead";
            const glyph = allDone ? "✓" : stageLocked ? "🔒" : String(mi + 1);
            return (
              <React.Fragment key={ms.id}>
                {mi > 0 && <span className={`pf-rail-line ${mi <= frontier ? "pf-rail-line-fill" : ""}`} />}
                <span className={`pf-rail-stage pf-rail-${state}`} aria-current={state === "active" ? "step" : undefined}>
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
        <>

      <div className="pf-deck">
        {subs.map((sub, i) => {
          const pos = i - idx;
          if (Math.abs(pos) > 2) return null;
          const locked = sub.mainIndex > frontier;
          const center = pos === 0;
          const p = gateProgress(sub, run, { validators });
          const skipped = isSubStageSkipped(run, sub.id);
          const sideClickable = !center && Math.abs(pos) === 1 && sub.mainIndex <= frontier;
          return (
            <div
              key={sub.id}
              className={`pf-card ${center ? "pf-card-center" : "pf-card-side"} ${locked ? "pf-card-locked" : ""} ${sideClickable ? "pf-card-clickable" : ""} ${skipped ? "pf-card-skipped" : ""}`}
              style={{
                transform: `translateX(calc(-50% + ${pos * 420}px)) rotateY(${pos * -24}deg) scale(${center ? 1 : 0.82})`,
                opacity: Math.abs(pos) === 2 ? 0 : center ? 1 : 0.38,
                zIndex: 10 - Math.abs(pos),
                pointerEvents: center || sideClickable ? "auto" : "none",
              }}
              role={sideClickable ? "button" : undefined}
              tabIndex={sideClickable ? 0 : undefined}
              aria-label={sideClickable ? `Go to ${sub.name}` : undefined}
              onClick={sideClickable ? () => setNav(jumpTo(run, subs, i)) : undefined}
              onKeyDown={
                sideClickable
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setNav(jumpTo(run, subs, i));
                      }
                    }
                  : undefined
              }
            >
              {!center && Math.abs(pos) === 1 && (
                <div className="pf-card-eyebrow">{pos < 0 ? "Back" : "Next"}</div>
              )}
              <div className="pf-card-strip">
                <span className="pf-card-code">
                  {sub.mainName.toUpperCase()} · S{sub.subIndex + 1}
                </span>
                <span className="pf-card-count">
                  {skipped
                    ? "Skipped"
                    : `${p.done}/${p.total} required${p.gateType === "strict" ? " · strict gate" : ""}`}
                </span>
              </div>
              <div className="pf-card-title">{sub.name}</div>
              {center && <div className="pf-card-desc">{sub.description}</div>}

              {center && prevDoneBlocks.length > 0 && (
                <div className="pf-inputs">
                  <button className="pf-inputs-toggle" onClick={() => setShowInputs(!showInputs)}>
                    {showInputs ? "▾" : "▸"} Inputs from {prevSub.name} ({prevDoneBlocks.length})
                  </button>
                  {showInputs && (
                    <div className="pf-inputs-body">
                      {prevDoneBlocks.map(({ step }) => (
                        <div key={step.id} className="pf-input-item">
                          <div className="pf-input-name">
                            {step.name}
                            <span className="pf-input-chips">
                              {typesWithValue(step).map((t) => (
                                <span key={t} className="pf-chip">
                                  <OutputTypeIcon type={t} />
                                  {t}
                                </span>
                              ))}
                            </span>
                          </div>
                          <div className="pf-input-preview">
                            {(serializeStep(prevSub, step, run) || "")
                              .split("\n")
                              .slice(1)
                              .join(" ")
                              .slice(0, 220)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className={`pf-steps ${center ? "" : "pf-steps-side"}`}>
                {sub.steps.map((step) => {
                  const entry = getStepEntry(run, step.id);
                  const status = statusOf(sub, step);
                  const target = draftTarget(step);
                  const canGenerate = !!generateDraft && !!target && !step.manual;
                  const open = center && expanded === step.id;
                  return (
                    <div key={step.id} className={`pf-step pf-step-${status}`}>
                      <div className="pf-step-row">
                        <button
                          className={`pf-dot-btn pf-dot-${status}`}
                          disabled={!center || readOnly || skipped}
                          title={status === "done" ? "Reopen" : "Mark done"}
                          aria-label={
                            status === "done" ? `Step ${step.name}: done. Reopen`
                            : status === "draft" ? `Step ${step.name}: draft. Mark done`
                            : `Step ${step.name}: not started. Mark done`
                          }
                          onClick={() => (status === "done" ? reopen(step.id) : toggleDone(step.id, true))}
                        >
                          {status === "done" ? "✓" : status === "draft" ? "·" : ""}
                        </button>
                        <button
                          className="pf-step-expand"
                          disabled={!center || skipped}
                          onClick={() => setExpanded(open ? null : step.id)}
                        >
                          <span className="pf-step-name">
                            {step.name}
                            {step.required && <span className="pf-req">*</span>}
                          </span>
                          <span className="pf-step-state">
                            {status === "done" ? "Done" : status === "draft" ? "Draft" : ""}
                          </span>
                          {center && <span className="pf-chev">{open ? "−" : "+"}</span>}
                        </button>
                      </div>

                      {open && (
                        <div className="pf-step-body">
                          {step.description && <div className="pf-step-desc">{step.description}</div>}

                          {(step.outputs || []).map((spec) => {
                            const isGenTarget = canGenerate && spec === target;
                            if (
                              isGenTarget &&
                              !hasValue(spec, (entry.outputs || {})[spec.id]) &&
                              !manualEdit.includes(step.id)
                            ) {
                              return (
                                <div key={spec.id} className="pf-out">
                                  <div className="pf-out-head">
                                    <div className="pf-out-label">{spec.label}</div>
                                  </div>
                                  <div className="pf-gen-invite">
                                    {generating === step.id ? (
                                      <span className="pf-spinner" aria-label="Generating" />
                                    ) : (
                                      <>
                                        <button
                                          className="pf-btn pf-btn-primary"
                                          disabled={readOnly}
                                          onClick={() => generate(sub, step)}
                                        >
                                          Generate draft
                                        </button>
                                        <button
                                          className="pf-gen-manual"
                                          disabled={readOnly}
                                          onClick={() => setManualEdit([...manualEdit, step.id])}
                                        >
                                          or write it yourself
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            }
                            const outVal = (entry.outputs || {})[spec.id];
                            const checkFn = spec.validate && validators && validators[spec.validate];
                            const invalidMsg = checkFn && hasValue(spec, outVal) ? checkFn(outVal, spec, { run, stepId: step.id }) : null;
                            const isGen = isOutputGenerated(run, step.id, spec.id);
                            const genBadge = resolveGeneratedBadge({ generated: isGen, lifecycle: status, spec, resolver: generatedBadge });
                            return (
                              <OutputView
                                key={spec.id}
                                spec={spec}
                                value={outVal}
                                invalid={typeof invalidMsg === "string" ? invalidMsg : null}
                                onChange={(v) => writeOutput(step.id, spec.id, v)}
                                onAttach={() => {
                                  attachFor.current = { stepId: step.id, outputId: spec.id };
                                  fileRef.current && fileRef.current.click();
                                }}
                                renderers={renderers}
                                context={buildRendererContext({ workflowId: def.id, stepId: step.id, subject: subjectName, readOnly, runId: activeRunId })}
                                generated={isGen}
                                badge={genBadge}
                              />
                            );
                          })}

                          {genError && genError.stepId === step.id && (
                            <div className="pf-error">
                              {genError.message || "Generation failed. Check the connection and try again."}
                            </div>
                          )}

                          <div className="pf-actions">
                            {canGenerate && (
                              <button
                                className="pf-btn"
                                disabled={generating === step.id || readOnly}
                                onClick={() => generate(sub, step)}
                              >
                                {generating === step.id ? (
                                  <>
                                    <span className="pf-spinner pf-spinner-sm" aria-hidden="true" /> Generating…
                                  </>
                                ) : hasValue(target, (entry.outputs || {})[target.id]) ? (
                                  "Regenerate"
                                ) : (
                                  "Generate draft"
                                )}
                              </button>
                            )}
                            <button
                              className={`pf-btn ${status === "done" ? "" : "pf-btn-primary"}`}
                              disabled={readOnly}
                              onClick={() => (status === "done" ? reopen(step.id) : toggleDone(step.id, true))}
                            >
                              {status === "done" ? "Reopen" : "Mark done"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {center && (
                <div className="pf-card-foot">
                  {inFrontierStage ? (
                    <>
                      {stageProg.met ? (
                        <span className="pf-gate-state pf-gate-met">
                          ✓ Stage gate met{nextMain ? ", ready to advance" : ""}
                        </span>
                      ) : (
                        <span className="pf-gate-state">
                          🔒 {stageProg.total - stageProg.done} required {stageProg.total - stageProg.done === 1 ? "step" : "steps"} left in this stage
                          · Gate unmet: {stageProg.missing.join(", ")}
                        </span>
                      )}
                      {nextMain &&
                        (stageProg.met ? (
                          <button className="pf-advance" disabled={readOnly} onClick={() => doAdvance(false)}>
                            Advance to {nextMain.name} →
                          </button>
                        ) : (
                          <button className="pf-override" disabled={readOnly} onClick={() => doAdvance(true)}>
                            Advance anyway
                          </button>
                        ))}
                    </>
                  ) : (
                    <>
                      {skipped ? (
                        <span className="pf-gate-state">Skipped, not applicable</span>
                      ) : p.met ? (
                        <span className="pf-gate-state pf-gate-met">✓ Gate met</span>
                      ) : (
                        <span className="pf-gate-state">
                          🔒 {p.total - p.done} required {p.total - p.done === 1 ? "step" : "steps"} left
                          · Gate unmet: {p.missing.join(", ")}
                        </span>
                      )}
                      {wasAdvanceForced(run, sub.mainIndex) &&
                        !mainGateProgress(def.mainStages[sub.mainIndex], run, { validators }).met && (
                          <span className="pf-gate-state pf-gate-forced">Advanced with open steps</span>
                        )}
                    </>
                  )}
                  {sub.skippable && (
                    <button
                      className="pf-skip-btn"
                      disabled={readOnly}
                      onClick={() => toggleSkip(sub.id, skipped)}
                    >
                      {skipped ? "Restore" : "Mark not applicable"}
                    </button>
                  )}
                </div>
              )}

              {locked && (
                <div className="pf-lock">
                  <span className="pf-lock-icon">🔒</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="pf-nav">
        <button className="pf-nav-btn" disabled={idx === 0} onClick={() => doBrowse(-1)}>
          ← {prevSub ? prevSub.name : "Back"}
        </button>

        <div className="pf-nav-mid">
          <div className="pf-dots">
            {subs.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={`pf-pip ${i === idx ? "pf-pip-active" : ""} ${s.mainIndex > frontier ? "pf-pip-locked" : ""} ${isSubStageSkipped(run, s.id) ? "pf-pip-skipped" : ""}`}
                disabled={s.mainIndex > frontier}
                aria-label={`${s.name}${i === idx ? " (current)" : ""}${s.mainIndex > frontier ? " (locked)" : ""}${isSubStageSkipped(run, s.id) ? " (skipped)" : ""}`}
                aria-current={i === idx ? "step" : undefined}
                onClick={() => setNav(jumpTo(run, subs, i))}
              />
            ))}
          </div>

          {!inFrontierStage && (
            <div className="pf-gate-hint">Browsing history · frontier is {def.mainStages[frontier].name}</div>
          )}
          <p className="pf-legend">
            Fill an output or mark a step done to complete it. Required steps (*) drive the gate.
          </p>
        </div>

        <button className="pf-nav-btn pf-nav-fwd" disabled={idx >= maxBrowse} onClick={() => doBrowse(1)}>
          {idx < maxBrowse && nextSub ? nextSub.name : "Forward"} →
        </button>
      </div>

        </>
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
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

.pf-root, .pf-root-tokens {
  /* sqnce design tokens: a consumer overrides the public --sqnce-* on .pf-root
     or any ancestor; the shell reads the private --sqnce-_* indirection so an
     ancestor override is never shadowed by a value on .pf-root itself. The
     block is shared with .pf-root-tokens, which body-portaled overlays carry
     so they get the same defaults. */
  --sqnce-_app-top: var(--sqnce-app-top, #222932);
  --sqnce-_app-bottom: var(--sqnce-app-bottom, #1B2129);
  --sqnce-_paper: var(--sqnce-paper, #F1EEE3);
  --sqnce-_card: var(--sqnce-card, #FAF8F0);
  --sqnce-_input: var(--sqnce-input, #FFFFFF);
  --sqnce-_input-readonly: var(--sqnce-input-readonly, #F3F1E8);
  --sqnce-_panel-dark: var(--sqnce-panel-dark, #23282F);
  --sqnce-_raised: var(--sqnce-raised, #3A434E);
  --sqnce-_locked: var(--sqnce-locked, #3A3F46);
  --sqnce-_subtle: var(--sqnce-subtle, #EFEBDD);
  --sqnce-_hover-paper: var(--sqnce-hover-paper, #E7E2D4);
  --sqnce-_ink-strong: var(--sqnce-ink-strong, #23282F);
  --sqnce-_ink-on-dark: var(--sqnce-ink-on-dark, #EDEAE0);
  --sqnce-_ink-on-dark-2: var(--sqnce-ink-on-dark-2, #C9CDD3);
  --sqnce-_ink-muted-dark: var(--sqnce-ink-muted-dark, #8A919B);
  --sqnce-_ink-muted-on-card: var(--sqnce-ink-muted-on-card, #646A72);
  --sqnce-_ink-muted-light: var(--sqnce-ink-muted-light, #62666D);
  --sqnce-_ink-muted-light-2: var(--sqnce-ink-muted-light-2, #565A61);
  --sqnce-_ink-faint-on-card: var(--sqnce-ink-faint-on-card, #686C73);
  --sqnce-_ink-faint-light: var(--sqnce-ink-faint-light, #2A2F36);
  --sqnce-_ink-label-dark: var(--sqnce-ink-label-dark, #9298A1);
  --sqnce-_ink-label-light: var(--sqnce-ink-label-light, #5E6772);
  --sqnce-_ink-read: var(--sqnce-ink-read, #3A434E);
  --sqnce-_link: var(--sqnce-link, #2F6F8F);
  --sqnce-_accent: var(--sqnce-accent, #D9A441);
  --sqnce-_accent-hover: var(--sqnce-accent-hover, #E5B458);
  --sqnce-_accent-ink: var(--sqnce-accent-ink, #6E6132);
  --sqnce-_done: var(--sqnce-done, #207044);
  --sqnce-_done-tint: var(--sqnce-done-tint, #6FBF95);
  --sqnce-_done-bg: var(--sqnce-done-bg, #F2F8F3);
  --sqnce-_done-ink: var(--sqnce-done-ink, #FFFFFF);
  --sqnce-_draft: var(--sqnce-draft, #D9A441);
  --sqnce-_draft-bg: var(--sqnce-draft-bg, #F4DFAE);
  --sqnce-_danger: var(--sqnce-danger, #B5471F);
  --sqnce-_danger-soft: var(--sqnce-danger-soft, #E08A6D);
  --sqnce-_danger-strong: var(--sqnce-danger-strong, #B3402A);
  --sqnce-_accept-ink: var(--sqnce-accept-ink, #2E6E3F);
  --sqnce-_accept-bg: var(--sqnce-accept-bg, #DDEFE0);
  --sqnce-_revise-ink: var(--sqnce-revise-ink, #8F4E2E);
  --sqnce-_revise-bg: var(--sqnce-revise-bg, #F4DFAE);
  --sqnce-_complete: var(--sqnce-complete, #207044);
  --sqnce-_pip: var(--sqnce-pip, #4A535E);
  --sqnce-_pip-locked: var(--sqnce-pip-locked, #343C45);
  --sqnce-_border-paper: var(--sqnce-border-paper, #D8D3C2);
  --sqnce-_border-card: var(--sqnce-border-card, #DCD7C7);
  --sqnce-_border-soft: var(--sqnce-border-soft, #C9C3B0);
  --sqnce-_border-dot: var(--sqnce-border-dot, #B6BAC1);
  /* Decorative shell tints: low-saturation accent washes on small shell
     surfaces (the generated textarea and its invite box, the status and input
     pills, the active list card, the archived-run banner) plus the done-step
     border. Defaults match today's literals so default rendering is unchanged;
     a consumer override reskins these along with the rest of the shell. */
  --sqnce-_generated-bg: var(--sqnce-generated-bg, #FCF7E9);
  --sqnce-_gen-invite-bg: var(--sqnce-gen-invite-bg, #FCFBF5);
  --sqnce-_status-bg: var(--sqnce-status-bg, #F1E8CE);
  --sqnce-_cards-active-bg: var(--sqnce-cards-active-bg, #FBF3DD);
  --sqnce-_archived-bg: var(--sqnce-archived-bg, #3A3424);
  --sqnce-_archived-ink: var(--sqnce-archived-ink, #EDD9A8);
  --sqnce-_done-border: var(--sqnce-done-border, #BCD9C9);
  --sqnce-_lock-scrim: var(--sqnce-lock-scrim, rgba(241,238,227,0.55));
  /* JSON-tree (data fallback renderer) syntax colors, by role. Defaults match
     today's literals; a consumer reskinning to a dark or branded surface
     overrides these so JSON output stays legible. */
  --sqnce-_jt-key: var(--sqnce-jt-key, #7A6A3C);
  --sqnce-_jt-string: var(--sqnce-jt-string, #2E6E8F);
  --sqnce-_jt-number: var(--sqnce-jt-number, #8F4E2E);
  --sqnce-_jt-keyword: var(--sqnce-jt-keyword, #6B4E8F);
  --sqnce-_font-ui: var(--sqnce-font-ui, 'IBM Plex Sans', system-ui, sans-serif);
  --sqnce-_font-mono: var(--sqnce-font-mono, 'IBM Plex Mono', monospace);
  --sqnce-_font-read: var(--sqnce-font-read, var(--sqnce-_font-ui));
  --sqnce-_size-title: var(--sqnce-size-title, 26px);
  --sqnce-_size-body: var(--sqnce-size-body, 13.5px);
  --sqnce-_size-label: var(--sqnce-size-label, 10.5px);
  --sqnce-_space-1: var(--sqnce-space-1, 4px);
  --sqnce-_space-2: var(--sqnce-space-2, 6px);
  --sqnce-_space-3: var(--sqnce-space-3, 8px);
  --sqnce-_space-4: var(--sqnce-space-4, 10px);
  --sqnce-_space-5: var(--sqnce-space-5, 12px);
  --sqnce-_space-6: var(--sqnce-space-6, 16px);
  --sqnce-_space-7: var(--sqnce-space-7, 20px);
  --sqnce-_pad-section: var(--sqnce-pad-section, 28px);
  --sqnce-_radius-card: var(--sqnce-radius-card, 10px);
  --sqnce-_radius-control: var(--sqnce-radius-control, 8px);
  --sqnce-_radius-sm: var(--sqnce-radius-sm, 6px);
  --sqnce-_motion-card: var(--sqnce-motion-card, 0.45s cubic-bezier(.3,.9,.3,1));
  --sqnce-_motion-fade: var(--sqnce-motion-fade, 0.45s);
  --sqnce-_motion-spin: var(--sqnce-motion-spin, 0.8s);
}
.pf-root {
  min-height: 100vh;
  background: linear-gradient(180deg, var(--sqnce-_app-top) 0%, var(--sqnce-_app-bottom) 100%);
  font-family: var(--sqnce-_font-ui);
  color: var(--sqnce-_ink-strong);
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
}
.pf-root-tokens { font-family: var(--sqnce-_font-ui); color: var(--sqnce-_ink-strong); }

.pf-header { display: flex; align-items: center; gap: var(--sqnce-_space-7); padding: 18px var(--sqnce-_pad-section) 10px; flex-wrap: wrap; }
.pf-brand { display: flex; align-items: center; gap: var(--sqnce-_space-4); color: var(--sqnce-_ink-on-dark); }
.pf-brand-mark { font-size: 20px; color: var(--sqnce-_accent); }
.pf-brand-name { font-family: var(--sqnce-_font-mono); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; font-size: 13px; }
.pf-subject { font-family: var(--sqnce-_font-mono); font-size: 12px; color: var(--sqnce-_ink-muted-dark); }
.pf-rail { display: flex; align-items: center; gap: var(--sqnce-_space-4); flex: 1; justify-content: center; flex-wrap: wrap; }
.pf-rail-stage { display: flex; align-items: center; gap: 7px; font-family: var(--sqnce-_font-mono); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
.pf-rail-circle {
  width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 10px; border: 1px solid currentColor;
}
.pf-rail-active { color: var(--sqnce-_accent); } .pf-rail-active .pf-rail-circle { background: var(--sqnce-_accent); border-color: var(--sqnce-_accent); color: var(--sqnce-_ink-strong); box-shadow: 0 0 0 2px var(--sqnce-_accent-hover); }
.pf-rail-here { font-size: 9px; margin-left: 2px; }
.pf-rail-done { color: var(--sqnce-_done-tint); } .pf-rail-done .pf-rail-circle { background: var(--sqnce-_done); border-color: var(--sqnce-_done); color: var(--sqnce-_ink-on-dark); }
.pf-rail-ahead { color: var(--sqnce-_ink-label-dark); }
.pf-rail-line { width: 34px; height: 1px; background: var(--sqnce-_raised); }
.pf-rail-line-fill { background: var(--sqnce-_accent); }
.pf-header-right { display: flex; align-items: center; gap: var(--sqnce-_space-4); }
.pf-switch { display: flex; border: 1px solid var(--sqnce-_raised); border-radius: var(--sqnce-_radius-control); overflow: hidden; }
.pf-switch-btn {
  background: none; border: none; color: var(--sqnce-_ink-muted-dark); padding: 6px 12px; cursor: pointer;
  font-family: var(--sqnce-_font-mono); font-size: 11.5px; letter-spacing: 0.04em;
}
.pf-switch-btn:not(:last-child) { border-right: 1px solid var(--sqnce-_raised); }
.pf-switch-btn:hover { color: var(--sqnce-_ink-on-dark); }
.pf-switch-active { background: var(--sqnce-_accent); color: var(--sqnce-_ink-strong); font-weight: 600; }
.pf-switch-active:hover { color: var(--sqnce-_ink-strong); }
.pf-switch-groups { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; }
.pf-switch-group { display: flex; flex-direction: column; gap: 3px; align-items: flex-start; }
.pf-switch-label { font-family: var(--sqnce-_font-mono); font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--sqnce-_ink-label-dark); min-height: 12px; }
.pf-reset { background: none; border: 1px solid var(--sqnce-_raised); color: var(--sqnce-_ink-muted-dark); border-radius: var(--sqnce-_radius-sm); padding: 5px 12px; font-size: 12px; cursor: pointer; font-family: var(--sqnce-_font-mono); }
.pf-reset:hover:not(:disabled) { color: var(--sqnce-_ink-on-dark); border-color: var(--sqnce-_ink-label-dark); }
.pf-reset:disabled { opacity: 0.4; cursor: default; }
.pf-advance:disabled, .pf-override:disabled { opacity: 0.4; cursor: default; }
.pf-archived {
  display: flex; align-items: center; gap: var(--sqnce-_space-5); margin: 6px var(--sqnce-_pad-section) 0;
  padding: 8px 14px; border: 1px solid var(--sqnce-_accent); border-radius: var(--sqnce-_radius-control);
  background: var(--sqnce-_archived-bg); color: var(--sqnce-_archived-ink); font-size: 12.5px;
  font-family: var(--sqnce-_font-mono);
}
.pf-ta[readonly], .pf-field-input[readonly] { background: var(--sqnce-_input-readonly); color: var(--sqnce-_ink-muted-light); }

.pf-body { display: flex; flex: 1; min-height: 0; align-items: stretch; }
.pf-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.pf-side {
  width: 232px; flex-shrink: 0; margin: 8px 0 22px 16px;
  border: 1px solid var(--sqnce-_raised); border-radius: var(--sqnce-_radius-card); padding: 10px;
  overflow-y: auto; color: var(--sqnce-_ink-on-dark-2);
  display: flex; flex-direction: column; gap: var(--sqnce-_space-5);
}
.pf-side-collapsed { width: 36px; align-items: center; padding: 10px 4px; }
.pf-side-head { display: flex; justify-content: space-between; align-items: center; }
.pf-side-title { font-family: var(--sqnce-_font-mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--sqnce-_ink-muted-dark); }
.pf-side-toggle { background: none; border: 1px solid var(--sqnce-_raised); color: var(--sqnce-_ink-muted-dark); border-radius: var(--sqnce-_radius-sm); cursor: pointer; padding: 2px 8px; }
.pf-side-toggle:hover { color: var(--sqnce-_ink-on-dark); border-color: var(--sqnce-_ink-label-dark); }
.pf-side-group { display: flex; flex-direction: column; gap: var(--sqnce-_space-1); }
.pf-side-label { font-family: var(--sqnce-_font-mono); font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--sqnce-_ink-label-dark); }
.pf-side-run { position: relative; display: flex; align-items: center; gap: 2px; border: 1px solid transparent; border-radius: 7px; }
.pf-side-run:hover { border-color: var(--sqnce-_raised); }
.pf-side-run-active { border-color: var(--sqnce-_accent); }
.pf-side-run-open {
  flex: 1; display: flex; align-items: center; gap: var(--sqnce-_space-3); min-width: 0;
  background: none; border: none; color: var(--sqnce-_ink-on-dark-2); cursor: pointer;
  padding: 7px 8px; text-align: left; font-family: inherit; font-size: 12.5px;
}
.pf-side-run-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 92px; }
.pf-side-meter { flex: 1; height: 4px; border-radius: 2px; background: var(--sqnce-_raised); overflow: hidden; }
.pf-side-meter-fill { display: block; height: 100%; background: var(--sqnce-_accent); }
.pf-side-count { font-family: var(--sqnce-_font-mono); font-size: 10px; color: var(--sqnce-_ink-muted-dark); }
.pf-side-menu-btn { background: none; border: none; color: var(--sqnce-_ink-label-dark); cursor: pointer; font-size: 14px; padding: 2px 6px; }
.pf-side-menu-btn:hover { color: var(--sqnce-_ink-on-dark); }
.pf-side-menu {
  position: absolute; right: 4px; top: 100%; z-index: 30; min-width: 130px;
  background: var(--sqnce-_panel-dark); border: 1px solid var(--sqnce-_raised); border-radius: 7px;
  display: flex; flex-direction: column; overflow: hidden;
}
.pf-side-menu button { background: none; border: none; color: var(--sqnce-_ink-on-dark-2); text-align: left; padding: 7px 12px; cursor: pointer; font-size: 12px; font-family: inherit; }
.pf-side-menu button:hover { background: var(--sqnce-_raised); }
.pf-danger { color: var(--sqnce-_danger-soft); }
.pf-side-new {
  background: none; border: 1px dashed var(--sqnce-_raised); color: var(--sqnce-_ink-muted-dark);
  border-radius: 7px; padding: 6px; cursor: pointer;
  font-size: 11.5px; font-family: var(--sqnce-_font-mono);
}
.pf-side-new:hover { color: var(--sqnce-_accent); border-color: var(--sqnce-_accent); }
.pf-side-rename {
  flex: 1; min-width: 0; background: var(--sqnce-_app-bottom); border: 1px solid var(--sqnce-_accent);
  color: var(--sqnce-_ink-on-dark); border-radius: var(--sqnce-_radius-sm); padding: 6px 8px;
  font-size: 12.5px; font-family: inherit;
}

.pf-runs {
  flex: 1; margin: 8px var(--sqnce-_pad-section) 22px; padding: 18px; overflow: auto;
  background: var(--sqnce-_paper); border: 1px solid var(--sqnce-_border-paper); border-radius: var(--sqnce-_radius-card);
}
.pf-runs-table { width: 100%; }
.pf-runs-open {
  background: none; border: none; padding: 0; cursor: pointer;
  color: var(--sqnce-_ink-strong); font-weight: 600; font-family: inherit; font-size: 13px;
  display: flex; align-items: center; gap: var(--sqnce-_space-3);
}
.pf-runs-open:hover { text-decoration: underline; }
.pf-badge {
  font-family: var(--sqnce-_font-mono); font-size: 9.5px;
  letter-spacing: 0.08em; text-transform: uppercase;
  background: var(--sqnce-_border-card); color: var(--sqnce-_ink-muted-light-2); border-radius: 4px; padding: 1px 6px;
}
.pf-runs-archived td { color: var(--sqnce-_ink-muted-on-card); }
.pf-runs-actions { display: flex; gap: var(--sqnce-_space-2); flex-wrap: wrap; }
.pf-runs-empty { color: var(--sqnce-_ink-muted-light); font-size: 13px; padding: 8px; }
.pf-runs-rename {
  border: 1px solid var(--sqnce-_accent); border-radius: var(--sqnce-_radius-sm); padding: 5px 8px;
  font-size: 13px; font-family: inherit; background: var(--sqnce-_input); color: var(--sqnce-_ink-strong);
}

.pf-deck { position: relative; flex: 1; min-height: 540px; perspective: 1400px; margin-top: 8px; }
.pf-card {
  position: absolute; left: 50%; top: 12px;
  max-height: calc(100% - 24px);
  background: var(--sqnce-_paper); border-radius: var(--sqnce-_radius-card); border: 1px solid var(--sqnce-_border-paper);
  box-shadow: 0 18px 50px rgba(0,0,0,0.45);
  padding: 0 0 18px;
  transition: transform var(--sqnce-_motion-card), width var(--sqnce-_motion-card), opacity var(--sqnce-_motion-fade);
  transform-style: preserve-3d;
  display: flex; flex-direction: column; overflow: hidden;
}
@media (prefers-reduced-motion: reduce) { .pf-card { transition: none; } }
.pf-card-center { width: min(800px, 92vw); }
.pf-card-side { width: min(400px, 44vw); }
.pf-card-strip {
  display: flex; justify-content: space-between; align-items: center;
  background: var(--sqnce-_panel-dark); color: var(--sqnce-_ink-on-dark); padding: 8px 16px;
  font-family: var(--sqnce-_font-mono); font-size: 11px; letter-spacing: 0.1em;
}
.pf-card-count { color: var(--sqnce-_accent); }
.pf-card-title { font-size: var(--sqnce-_size-title); font-weight: 700; padding: 16px 20px 2px; letter-spacing: -0.01em; }
.pf-card-desc { padding: 0 20px 6px; font-size: var(--sqnce-_size-body); color: var(--sqnce-_ink-muted-light-2); }
.pf-card-locked .pf-card-strip { background: var(--sqnce-_locked); }
.pf-card-clickable { cursor: pointer; }
.pf-card-clickable:hover { filter: brightness(1.12); outline: 1px solid var(--sqnce-_accent); }
.pf-card-clickable:focus-visible { outline: 2px solid var(--sqnce-_accent); }

.pf-inputs { margin: 8px 20px 0; }
.pf-inputs-toggle { background: none; border: none; cursor: pointer; font-family: var(--sqnce-_font-mono); font-size: 11.5px; color: var(--sqnce-_accent-ink); letter-spacing: 0.05em; padding: 0; }
.pf-inputs-body { margin-top: 8px; border-left: 2px solid var(--sqnce-_accent); padding-left: 10px; display: flex; flex-direction: column; gap: var(--sqnce-_space-3); max-height: 160px; overflow-y: auto; }
.pf-input-item { font-size: 12px; }
.pf-input-name { font-weight: 600; }
.pf-input-preview { color: var(--sqnce-_ink-muted-light); white-space: pre-wrap; }

.pf-steps { margin: 12px 14px 0; display: flex; flex-direction: column; gap: var(--sqnce-_space-2); overflow-y: auto; }
.pf-steps-side { pointer-events: none; }
.pf-step { border: 1px solid var(--sqnce-_border-card); border-radius: var(--sqnce-_radius-control); background: var(--sqnce-_card); }
.pf-step-done { border-color: var(--sqnce-_done-border); background: var(--sqnce-_done-bg); }
.pf-step-row { display: flex; align-items: center; gap: var(--sqnce-_space-4); padding-right: 14px; }
.pf-dot-btn {
  width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0; margin-left: 14px;
  display: inline-flex; align-items: center; justify-content: center; padding: 0;
  background: var(--sqnce-_input); border: 1.5px solid var(--sqnce-_border-dot); cursor: pointer;
  font-size: 11px; line-height: 1; color: transparent;
}
.pf-dot-btn:hover:not(:disabled) { border-color: var(--sqnce-_done); color: var(--sqnce-_done); }
.pf-dot-btn:disabled { cursor: default; }
.pf-dot-draft { border-color: var(--sqnce-_draft); background: var(--sqnce-_draft-bg); color: var(--sqnce-_ink-strong); }
.pf-dot-done { border-color: var(--sqnce-_done); background: var(--sqnce-_done); color: var(--sqnce-_done-ink); }
.pf-step-expand {
  flex: 1; display: flex; align-items: center; gap: var(--sqnce-_space-4); min-width: 0;
  background: none; border: none; padding: 11px 0; cursor: pointer;
  font-family: inherit; font-size: 14.5px; color: var(--sqnce-_ink-strong); text-align: left;
}
.pf-step-expand:disabled { cursor: default; }
.pf-step-name { flex: 1; font-weight: 500; }
.pf-req { color: var(--sqnce-_danger); margin-left: 3px; }
.pf-step-state { font-family: var(--sqnce-_font-mono); font-size: var(--sqnce-_size-label); letter-spacing: 0.08em; text-transform: uppercase; color: var(--sqnce-_ink-muted-on-card); }
.pf-step-done .pf-step-state { color: var(--sqnce-_done); }
.pf-chev { color: var(--sqnce-_ink-muted-on-card); font-size: 16px; width: 14px; text-align: center; }

.pf-step-body { padding: 0 14px 14px; }
.pf-step-desc { font-size: 12.5px; color: var(--sqnce-_ink-muted-light); margin-bottom: 8px; }
.pf-out { margin-bottom: 10px; }
.pf-out-label { font-family: var(--sqnce-_font-mono); font-size: var(--sqnce-_size-label); letter-spacing: 0.08em; text-transform: uppercase; color: var(--sqnce-_accent-ink); margin-bottom: 4px; display: flex; align-items: center; gap: 5px; }
.pf-ta {
  width: 100%; min-height: 130px; resize: vertical;
  border: 1px solid var(--sqnce-_border-paper); border-radius: var(--sqnce-_radius-sm); padding: 10px;
  font-family: var(--sqnce-_font-ui); font-size: var(--sqnce-_size-body); line-height: 1.5;
  background: var(--sqnce-_input); color: var(--sqnce-_ink-strong); box-sizing: border-box;
}
.pf-ta:focus { outline: 2px solid var(--sqnce-_accent); outline-offset: 1px; }
.pf-fields { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sqnce-_space-3); }
.pf-field { display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; color: var(--sqnce-_ink-muted-light); }
.pf-field-input {
  border: 1px solid var(--sqnce-_border-paper); border-radius: var(--sqnce-_radius-sm); padding: 8px 10px;
  font-family: var(--sqnce-_font-ui); font-size: var(--sqnce-_size-body); background: var(--sqnce-_input); color: var(--sqnce-_ink-strong);
}
.pf-field-input:focus { outline: 2px solid var(--sqnce-_accent); outline-offset: 1px; }
.pf-link-input { width: 100%; box-sizing: border-box; font-family: var(--sqnce-_font-mono); font-size: 12.5px; }
.pf-filechip { font-size: 12px; font-family: var(--sqnce-_font-mono); color: var(--sqnce-_ink-muted-light-2); margin-bottom: 6px; }
.pf-filechip-empty { color: var(--sqnce-_ink-faint-on-card); }
.pf-error { margin-top: 6px; font-size: 12.5px; color: var(--sqnce-_danger-strong); }
.pf-actions { display: flex; gap: var(--sqnce-_space-3); margin-top: 10px; flex-wrap: wrap; }
.pf-btn {
  border: 1px solid var(--sqnce-_border-soft); background: var(--sqnce-_input); color: var(--sqnce-_ink-strong);
  border-radius: var(--sqnce-_radius-sm); padding: 7px 14px; font-size: 13px; cursor: pointer; font-weight: 500;
}
.pf-btn-sm { padding: 5px 11px; font-size: 12px; }
.pf-btn:hover:not(:disabled) { border-color: var(--sqnce-_ink-strong); }
.pf-btn:disabled { opacity: 0.5; cursor: default; }
.pf-btn-primary { background: var(--sqnce-_panel-dark); color: var(--sqnce-_ink-on-dark); border-color: var(--sqnce-_panel-dark); }
.pf-btn-primary:hover:not(:disabled) { background: var(--sqnce-_raised); }

.pf-lock {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: var(--sqnce-_lock-scrim); backdrop-filter: blur(1px);
}
.pf-lock-icon { font-size: 30px; opacity: 0.7; }

.pf-nav { display: flex; align-items: flex-start; gap: var(--sqnce-_space-6); padding: 14px var(--sqnce-_pad-section) 22px; }
.pf-nav-btn {
  background: none; border: 1px solid var(--sqnce-_raised); color: var(--sqnce-_ink-on-dark-2);
  border-radius: var(--sqnce-_radius-control); padding: 10px 18px; font-size: var(--sqnce-_size-body); cursor: pointer;
  font-family: var(--sqnce-_font-mono); letter-spacing: 0.03em; min-width: 150px;
}
.pf-nav-btn:hover:not(:disabled) { border-color: var(--sqnce-_accent); color: var(--sqnce-_accent); }
.pf-nav-btn:disabled { opacity: 0.35; cursor: default; }
.pf-nav-fwd { margin-left: auto; text-align: right; }
.pf-nav-mid { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 7px; }
.pf-dots { display: flex; gap: 7px; }
.pf-pip { width: 9px; height: 9px; border-radius: 50%; background: var(--sqnce-_pip); cursor: pointer; border: none; padding: 0; }
.pf-pip-active { background: var(--sqnce-_accent); transform: scale(1.25); box-shadow: 0 0 0 2px var(--sqnce-_accent-hover); }
.pf-pip-locked { background: transparent; border: 1px solid var(--sqnce-_pip-locked); box-sizing: border-box; cursor: default; }
.pf-card-foot {
  margin: 12px 14px 0; padding: 10px 2px 0;
  border-top: 1px solid var(--sqnce-_border-card);
  display: flex; align-items: center; justify-content: space-between; gap: var(--sqnce-_space-4); flex-wrap: wrap;
}
.pf-gate-state { font-family: var(--sqnce-_font-mono); font-size: 11px; letter-spacing: 0.04em; color: var(--sqnce-_ink-muted-on-card); }
.pf-gate-met { color: var(--sqnce-_done); }
.pf-gen-invite {
  border: 1.5px dashed var(--sqnce-_border-soft); border-radius: var(--sqnce-_radius-control); padding: 18px;
  display: flex; align-items: center; justify-content: center; gap: var(--sqnce-_space-5);
  background: var(--sqnce-_gen-invite-bg); min-height: 46px;
}
.pf-gen-manual {
  background: none; border: none; color: var(--sqnce-_accent-ink); cursor: pointer;
  font-size: 12px; text-decoration: underline; font-family: var(--sqnce-_font-mono);
}
.pf-spinner {
  width: 14px; height: 14px; border-radius: 50%; display: inline-block;
  border: 2px solid var(--sqnce-_accent); border-top-color: transparent;
  animation: pf-spin var(--sqnce-_motion-spin) linear infinite; vertical-align: -2px;
}
.pf-spinner-sm { width: 11px; height: 11px; }
@keyframes pf-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .pf-spinner { animation: none; border-top-color: var(--sqnce-_accent); opacity: 0.5; } }
.pf-advance {
  background: var(--sqnce-_accent); color: var(--sqnce-_ink-strong); border: none; border-radius: var(--sqnce-_radius-control);
  padding: 10px 22px; font-size: 14px; font-weight: 600; cursor: pointer;
  font-family: var(--sqnce-_font-ui);
}
.pf-advance:hover { background: var(--sqnce-_accent-hover); }
.pf-override {
  background: none; border: none; color: var(--sqnce-_ink-muted-on-card); font-size: 12px; cursor: pointer;
  text-decoration: underline; font-family: var(--sqnce-_font-mono);
}
.pf-override:hover { color: var(--sqnce-_accent-ink); }
.pf-skip-btn {
  background: none; border: none; color: var(--sqnce-_ink-muted-on-card); font-size: 12px; cursor: pointer;
  text-decoration: underline; font-family: var(--sqnce-_font-mono);
}
.pf-skip-btn:hover:not(:disabled) { color: var(--sqnce-_accent-ink); }
.pf-skip-btn:disabled { opacity: 0.4; cursor: default; }
.pf-gate-forced { color: var(--sqnce-_accent-ink); }
.pf-card-skipped .pf-card-desc, .pf-card-skipped .pf-inputs { opacity: 0.5; }
.pf-card-skipped .pf-steps { opacity: 0.5; pointer-events: none; }
.pf-pip-skipped { background: transparent; border: 1px dashed var(--sqnce-_pip); box-sizing: border-box; }
.pf-gate-hint { font-size: 11.5px; color: var(--sqnce-_ink-muted-dark); font-family: var(--sqnce-_font-mono); text-align: center; }
.pf-legend { font-size: 11px; color: var(--sqnce-_ink-label-dark); margin: 2px 0 0; text-align: center; }

.pf-out-head { display: flex; align-items: center; justify-content: space-between; }
.pf-render-toggle { background: none; border: none; color: var(--sqnce-_accent-ink); cursor: pointer; font-family: var(--sqnce-_font-mono); font-size: var(--sqnce-_size-label); text-decoration: underline; padding: 0; }
.pf-render { position: relative; border: 1px solid var(--sqnce-_border-paper); border-radius: var(--sqnce-_radius-sm); background: var(--sqnce-_input); max-height: 280px; overflow: auto; padding: 10px; }
.pf-render-expand { position: absolute; top: 6px; right: 6px; z-index: 2; background: var(--sqnce-_paper); border: 1px solid var(--sqnce-_border-soft); border-radius: 5px; cursor: pointer; font-size: 12px; padding: 2px 6px; }
.pf-render-expand:hover { border-color: var(--sqnce-_ink-strong); }
.pf-render-loading { font-size: 12px; color: var(--sqnce-_ink-muted-on-card); padding: 8px; }
.pf-ta-mono { font-family: var(--sqnce-_font-mono); font-size: 12px; min-height: 180px; }
.pf-overlay { position: fixed; inset: 0; z-index: 1000; background: var(--sqnce-_paper); display: flex; flex-direction: column; }
.pf-overlay-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; background: var(--sqnce-_panel-dark); color: var(--sqnce-_ink-on-dark); }
.pf-overlay-title { font-family: var(--sqnce-_font-mono); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
.pf-overlay-body { flex: 1; overflow: auto; padding: 18px 22px; }
.pf-jt { font-family: var(--sqnce-_font-mono); font-size: 12px; line-height: 1.55; }
.pf-jt-children { padding-left: 16px; }
.pf-jt-node > summary { cursor: pointer; }
.pf-jt-leaf { padding-left: 16px; }
.pf-jt-key { color: var(--sqnce-_jt-key); }
.pf-jt-string { color: var(--sqnce-_jt-string); } .pf-jt-number { color: var(--sqnce-_jt-number); } .pf-jt-boolean, .pf-jt-null { color: var(--sqnce-_jt-keyword); }

.pf-ta-wrap { position: relative; }
.pf-gen-badge {
  position: absolute; top: 6px; right: 10px; z-index: 2; pointer-events: none;
  font-family: var(--sqnce-_font-mono); font-size: 9.5px;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--sqnce-_accent-ink); background: var(--sqnce-_draft-bg); border-radius: 4px; padding: 1px 6px;
}
.pf-ta-generated, .pf-ta-generated[readonly] { background: var(--sqnce-_generated-bg); border-color: var(--sqnce-_accent); }
.pf-render > .pf-gen-badge { left: 10px; right: auto; }
.pf-read-header-slot { margin-left: auto; }
.pf-side-status, .pf-runs-status {
  font-family: var(--sqnce-_font-mono); font-size: 9px; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--sqnce-_accent-ink); background: var(--sqnce-_status-bg);
  border-radius: 4px; padding: 1px 5px; white-space: nowrap;
}
.pf-side-status { margin-left: 6px; }
.pf-side-status[data-tone="accept"], .pf-runs-status[data-tone="accept"] { color: var(--sqnce-_accept-ink); background: var(--sqnce-_accept-bg); }
.pf-side-status[data-tone="revise"], .pf-runs-status[data-tone="revise"] { color: var(--sqnce-_revise-ink); background: var(--sqnce-_revise-bg); }

.pf-oticon { display: inline-flex; vertical-align: -1px; }
.pf-counter {
  font-family: var(--sqnce-_font-mono); font-size: 11px;
  color: var(--sqnce-_ink-muted-dark); letter-spacing: 0.05em; white-space: nowrap;
}
.pf-card-eyebrow {
  font-family: var(--sqnce-_font-mono); font-size: 9.5px;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--sqnce-_ink-muted-on-card); padding: 6px 16px 3px;
}
.pf-input-chips { display: inline-flex; gap: var(--sqnce-_space-1); margin-left: 8px; vertical-align: 1px; }
.pf-chip {
  display: inline-flex; align-items: center; gap: 3px;
  font-family: var(--sqnce-_font-mono); font-size: 9px; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--sqnce-_accent-ink); background: var(--sqnce-_status-bg);
  border-radius: 4px; padding: 1px 5px;
}
.pf-jt-meta { color: var(--sqnce-_ink-faint-on-card); }
.pf-kv { display: grid; grid-template-columns: minmax(110px, max-content) 1fr; gap: var(--sqnce-_space-1) 14px; font-size: 12.5px; }
.pf-kv-row { display: contents; }
.pf-kv-key { font-family: var(--sqnce-_font-mono); color: var(--sqnce-_accent-ink); word-break: break-word; }
.pf-kv-val { color: var(--sqnce-_ink-strong); white-space: pre-wrap; word-break: break-word; }
.pf-table { border-collapse: collapse; font-size: 12px; width: 100%; }
.pf-table th, .pf-table td { border: 1px solid var(--sqnce-_border-card); padding: 5px 8px; text-align: left; vertical-align: top; }
.pf-table th { background: var(--sqnce-_subtle); font-family: var(--sqnce-_font-mono); font-size: var(--sqnce-_size-label); letter-spacing: 0.05em; text-transform: uppercase; }
.pf-cards { display: grid; grid-template-columns: minmax(150px, 220px) 1fr; gap: var(--sqnce-_space-5); min-height: 120px; }
.pf-cards-list { display: flex; flex-direction: column; gap: 5px; overflow-y: auto; max-height: 420px; }
.pf-cards-item { text-align: left; background: var(--sqnce-_card); border: 1px solid var(--sqnce-_border-card); border-radius: var(--sqnce-_radius-sm); padding: 7px 9px; cursor: pointer; font-family: inherit; }
.pf-cards-item:hover { border-color: var(--sqnce-_ink-strong); }
.pf-cards-active { border-color: var(--sqnce-_accent); background: var(--sqnce-_cards-active-bg); }
.pf-cards-title { font-size: 12.5px; font-weight: 600; color: var(--sqnce-_ink-strong); }
.pf-cards-sub { font-size: 11px; color: var(--sqnce-_ink-muted-light); }
.pf-cards-detail { border-left: 2px solid var(--sqnce-_accent); padding-left: 12px; overflow: auto; }
.pf-md { font-size: var(--sqnce-_size-body); line-height: 1.6; }
.pf-md h1, .pf-md h2, .pf-md h3, .pf-md h4, .pf-md h5, .pf-md h6 { margin: 12px 0 6px; line-height: 1.25; }
.pf-md h1 { font-size: 19px; } .pf-md h2 { font-size: 16.5px; } .pf-md h3 { font-size: 14.5px; }
.pf-md p { margin: 6px 0; }
.pf-md ul, .pf-md ol { margin: 6px 0; padding-left: 22px; }
.pf-md blockquote { margin: 8px 0; border-left: 3px solid var(--sqnce-_accent); padding-left: 10px; color: var(--sqnce-_ink-muted-light-2); }
.pf-md-pre { background: var(--sqnce-_panel-dark); color: var(--sqnce-_ink-on-dark); border-radius: var(--sqnce-_radius-sm); padding: 10px; overflow-x: auto; font-size: 12px; }
.pf-md code { background: var(--sqnce-_subtle); border-radius: 3px; padding: 0 4px; font-family: var(--sqnce-_font-mono); font-size: 0.92em; }
.pf-md-pre code { background: none; padding: 0; }
.pf-md table { margin: 8px 0; }

/* ---------- overview modal ---------- */
.pf-ov { max-width: 760px; margin: 0 auto; width: 100%; }
.pf-ov-name { margin: 6px 0 2px; font-size: 24px; }
.pf-ov-short { margin: 0 0 6px; color: var(--sqnce-_ink-label-light); font-size: 14px; }
.pf-ov-heading { font-family: var(--sqnce-_font-mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--sqnce-_accent-ink); margin: 22px 0 8px; }
.pf-ov-rules { margin: 0; padding-left: 18px; display: grid; gap: var(--sqnce-_space-2); font-size: var(--sqnce-_size-body); line-height: 1.5; }
.pf-ov-stages-head { display: flex; align-items: baseline; justify-content: space-between; }
.pf-ov-progress { font-family: var(--sqnce-_font-mono); font-size: 12px; color: var(--sqnce-_ink-label-light); }
.pf-ov-stage { border: 1px solid var(--sqnce-_border-paper); border-radius: var(--sqnce-_radius-control); background: var(--sqnce-_input); padding: 10px 14px; margin: 0 0 10px; }
.pf-ov-stage-active { border-color: var(--sqnce-_accent); box-shadow: 0 0 0 1px var(--sqnce-_accent); }
.pf-ov-stage-row { display: flex; align-items: center; gap: var(--sqnce-_space-3); }
.pf-ov-glyph {
  width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 10px; border: 1px solid var(--sqnce-_ink-strong); font-family: var(--sqnce-_font-mono);
}
.pf-ov-stage-name { font-weight: 600; font-size: 14px; }
.pf-ov-forced { font-family: var(--sqnce-_font-mono); font-size: 11px; letter-spacing: 0.04em; color: var(--sqnce-_accent-ink); margin-left: auto; }
.pf-ov-sub { padding: 7px 0 0 26px; }
.pf-ov-sub-row { display: flex; align-items: baseline; gap: var(--sqnce-_space-4); flex-wrap: wrap; }
.pf-ov-sub-name { font-size: 13px; font-weight: 500; }
.pf-ov-gate { font-family: var(--sqnce-_font-mono); font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--sqnce-_ink-muted-on-card); }
.pf-ov-status { font-family: var(--sqnce-_font-mono); font-size: 11px; letter-spacing: 0.04em; color: var(--sqnce-_ink-label-light); }
.pf-ov-here { font-family: var(--sqnce-_font-mono); font-size: 11px; letter-spacing: 0.04em; color: var(--sqnce-_ink-strong); background: var(--sqnce-_accent); border-radius: 4px; padding: 1px 7px; }
.pf-ov-sub-desc { margin: 3px 0 0; font-size: 12.5px; color: var(--sqnce-_ink-label-light); line-height: 1.45; }

/* ---------- reading mode ---------- */
/* A light document page on the dark app shell, like the cards, so the dark
   text below stays legible. The page scrolls; the contents rail sticks. */
.pf-read { display: flex; flex: 1; min-height: 0; gap: 24px; margin: 8px 4px; padding: 20px 24px; background: var(--sqnce-_paper); border: 1px solid var(--sqnce-_border-paper); border-radius: var(--sqnce-_radius-card); color: var(--sqnce-_ink-strong); overflow: auto; }
.pf-read-rail { flex: 0 0 200px; display: flex; flex-direction: column; gap: 2px; align-self: flex-start; position: sticky; top: 0; }
.pf-read-toc { text-align: left; background: none; border: none; border-left: 2px solid transparent; padding: 6px 10px; color: var(--sqnce-_ink-label-light); font-size: 13px; cursor: pointer; border-radius: 0 4px 4px 0; }
.pf-read-toc:hover { color: var(--sqnce-_ink-strong); background: var(--sqnce-_hover-paper); }
.pf-read-here { color: var(--sqnce-_ink-strong); border-left-color: var(--sqnce-_accent); font-weight: 600; }
.pf-read-doc { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.pf-read-band { display: flex; align-items: baseline; gap: var(--sqnce-_space-5); border-bottom: 1px solid var(--sqnce-_border-paper); padding-bottom: 10px; margin-bottom: 12px; }
.pf-read-title { font-family: var(--sqnce-_font-read); font-size: 22px; margin: 0; color: var(--sqnce-_ink-strong); }
.pf-read-status { font-family: var(--sqnce-_font-mono); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--sqnce-_ink-muted-light); }
.pf-read-status[data-tone="complete"] { color: var(--sqnce-_complete); }
.pf-read-status[data-tone="accept"] { color: var(--sqnce-_accept-ink); }
.pf-read-status[data-tone="revise"] { color: var(--sqnce-_revise-ink); }
.pf-read-canvas { max-width: 760px; }
.pf-read-stage { font-family: var(--sqnce-_font-read); font-size: 18px; color: var(--sqnce-_ink-strong); margin: 4px 0 12px; }
.pf-read-sub { margin-bottom: 22px; }
.pf-read-sub-name { font-family: var(--sqnce-_font-read); font-size: 15px; color: var(--sqnce-_ink-read); margin: 0 0 4px; }
.pf-read-sub-desc { font-family: var(--sqnce-_font-read); color: var(--sqnce-_ink-muted-light); margin: 0 0 10px; }
.pf-read-out { margin: 0 0 14px; }
.pf-read-out-label { font-family: var(--sqnce-_font-mono); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--sqnce-_ink-muted-light); margin-bottom: 4px; }
.pf-read-text { font-family: var(--sqnce-_font-read); white-space: pre-wrap; line-height: 1.55; color: var(--sqnce-_ink-faint-light); margin: 0; }
.pf-read-link { font-family: var(--sqnce-_font-read); color: var(--sqnce-_link); word-break: break-all; }
.pf-read-fields { font-family: var(--sqnce-_font-read); margin: 0; display: grid; gap: var(--sqnce-_space-2); }
.pf-read-field { display: flex; gap: var(--sqnce-_space-3); }
.pf-read-field dt { color: var(--sqnce-_ink-muted-light); min-width: 120px; font-size: 13px; }
.pf-read-field dd { margin: 0; color: var(--sqnce-_ink-faint-light); }
.pf-read-file { font-family: var(--sqnce-_font-read); font-size: 13px; color: var(--sqnce-_ink-read); margin-bottom: 4px; }
.pf-read-nav { display: flex; align-items: center; justify-content: space-between; gap: var(--sqnce-_space-5); padding-top: 12px; border-top: 1px solid var(--sqnce-_border-paper); margin-top: 8px; }
.pf-read-navbtn, .pf-read-edit { background: none; border: 1px solid var(--sqnce-_border-soft); border-radius: var(--sqnce-_radius-sm); padding: 6px 12px; color: var(--sqnce-_ink-read); cursor: pointer; }
.pf-read-navbtn:hover:not(:disabled), .pf-read-edit:hover { background: var(--sqnce-_hover-paper); }
.pf-read-navbtn:disabled { opacity: 0.4; cursor: default; }
/* Uncap renderer-backed outputs in reading mode: the document shows them in
   full rather than the authoring deck's 280px capped panel. The expand-to-
   overlay button stays, so a large output can still go fullscreen and the
   no-trapped-overlay acceptance check is reachable. */
.pf-read .pf-render { max-height: none; }

@media (max-width: 720px) {
  .pf-card-side { display: none; }
  .pf-side { display: none; }
  .pf-deck { min-height: 600px; }
  .pf-nav-btn { min-width: 0; }
  .pf-fields { grid-template-columns: 1fr; }
  .pf-rail { justify-content: flex-start; }
  .pf-read { flex-direction: column; }
  .pf-read-rail { flex-basis: auto; position: static; max-height: none; flex-direction: row; flex-wrap: wrap; }
}
`;

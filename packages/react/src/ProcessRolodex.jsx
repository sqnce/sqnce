import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
import OutputView from "./OutputView.jsx";
import RunSidebar from "./RunSidebar.jsx";
import RunsScreen from "./RunsScreen.jsx";

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
 *      { version: 2, activeWorkflowId, activeRunByWorkflow, entries }.
 *      Anything that is not a version 2 store is discarded on load.
 *      Omit for in-memory only.
 *  - generateDraft (optional): async (prompt, context) => string where
 *      context is { workflowId, stepId, subject }. The second argument
 *      is informational; single-argument implementations keep working.
 *      Wire this to any LLM provider. Omit to hide the
 *      "Generate draft" action entirely.
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

export default function ProcessRolodex({ workflows, persistence, generateDraft, workflowGroups, initialRunFor, renderers }) {
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

  /* ---------- derived ---------- */
  const current = subs[idx];
  const atFrontier = idx === frontier;
  const prog = gateProgress(current, run);
  const nextSub = idx < subs.length - 1 ? subs[idx + 1] : null;
  const prevSub = idx > 0 ? subs[idx - 1] : null;
  const subjectName = resolveSubject(def, run);

  const clearTransients = () => {
    setExpanded(null);
    setGenError(null);
    setShowInputs(false);
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

  useEffect(() => {
    const onKey = (e) => {
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

  /* ---------- draft generation ---------- */
  const generate = async (sub, step) => {
    if (!generateDraft || readOnly) return;
    const target = (step.outputs || []).find((o) => o.type === "text");
    if (!target) return;
    setGenerating(step.id);
    setGenError(null);
    try {
      const prompt = buildDraftPrompt(def, subs, run, idx, step);
      const text = await generateDraft(prompt, {
        workflowId: def.id,
        stepId: step.id,
        subject: subjectName,
      });
      if (!text) throw new Error("Empty response");
      writeOutput(step.id, target.id, text, { generated: true });
    } catch (e) {
      setGenError(step.id);
    }
    setGenerating(null);
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

  const prevDoneBlocks = prevSub
    ? prevSub.steps
        .map((s) => ({ step: s, entry: getStepEntry(run, s.id) }))
        .filter(
          ({ step, entry }) =>
            isStepComplete(step, entry, gateTypeOf(prevSub)) && stepHasAnyOutput(step, entry)
        )
    : [];

  const statusOf = (sub, step) => {
    const entry = getStepEntry(run, step.id);
    if (isStepComplete(step, entry, gateTypeOf(sub))) return "done";
    if (stepHasAnyOutput(step, entry)) return "draft";
    return "open";
  };

  /* ---------- render ---------- */
  return (
    <div className="pf-root">
      <style>{CSS}</style>
      <input type="file" ref={fileRef} style={{ display: "none" }} onChange={onFile} />

      <div className="pf-header">
        <div className="pf-brand">
          <span className="pf-brand-mark">◫</span>
          <span className="pf-brand-name">{def.name}</span>
          <span className="pf-subject">· {subjectName}</span>
        </div>
        <div className="pf-rail">
          {def.mainStages.map((ms, mi) => {
            const allDone = ms.subStages.every((ss) => gateProgress(ss, run).met);
            const state =
              mi === current.mainIndex ? "active" : allDone || mi < current.mainIndex ? "done" : "ahead";
            return (
              <React.Fragment key={ms.id}>
                {mi > 0 && <span className="pf-rail-line" />}
                <span className={`pf-rail-stage pf-rail-${state}`}>
                  <span className="pf-rail-dot" />
                  {ms.name}
                </span>
              </React.Fragment>
            );
          })}
        </div>
        <div className="pf-header-right">
          {workflows.length > 1 && (
            <WorkflowSwitcher
              workflows={workflows}
              groups={workflowGroups}
              activeId={activeId}
              onSwitch={switchWorkflow}
            />
          )}
          <button
            className="pf-reset"
            onClick={() => {
              clearTransients();
              setView(view === "runs" ? "rolodex" : "runs");
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
          onOpenRun={openRun}
          onRename={doRename}
          onArchive={doArchive}
          onUnarchive={doUnarchive}
          onDelete={doDelete}
        />
      ) : (
        <>

      <div className="pf-deck">
        {subs.map((sub, i) => {
          const pos = i - idx;
          if (Math.abs(pos) > 2) return null;
          const locked = i > frontier;
          const center = pos === 0;
          const p = gateProgress(sub, run);
          return (
            <div
              key={sub.id}
              className={`pf-card ${center ? "pf-card-center" : "pf-card-side"} ${locked ? "pf-card-locked" : ""}`}
              style={{
                transform: `translateX(calc(-50% + ${pos * 420}px)) rotateY(${pos * -24}deg) scale(${center ? 1 : 0.82})`,
                opacity: Math.abs(pos) === 2 ? 0 : center ? 1 : 0.38,
                zIndex: 10 - Math.abs(pos),
                pointerEvents: center ? "auto" : "none",
              }}
            >
              <div className="pf-card-strip">
                <span className="pf-card-code">
                  {sub.mainName.toUpperCase()} · S{sub.subIndex + 1}
                </span>
                <span className="pf-card-count">
                  {p.done}/{p.total} required{p.gateType === "strict" ? " · strict gate" : ""}
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
                          <div className="pf-input-name">{step.name}</div>
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
                  const open = center && expanded === step.id;
                  return (
                    <div key={step.id} className={`pf-step pf-step-${status}`}>
                      <button
                        className="pf-step-row"
                        disabled={!center}
                        onClick={() => setExpanded(open ? null : step.id)}
                      >
                        <span className={`pf-dot pf-dot-${status}`} />
                        <span className="pf-step-name">
                          {step.name}
                          {step.required && <span className="pf-req">*</span>}
                        </span>
                        <span className="pf-step-state">
                          {status === "done" ? "Done" : status === "draft" ? "Draft" : ""}
                        </span>
                        {center && <span className="pf-chev">{open ? "−" : "+"}</span>}
                      </button>

                      {open && (
                        <div className="pf-step-body">
                          {step.description && <div className="pf-step-desc">{step.description}</div>}

                          {(step.outputs || []).map((spec) => (
                            <OutputView
                              key={spec.id}
                              spec={spec}
                              value={(entry.outputs || {})[spec.id]}
                              onChange={(v) => writeOutput(step.id, spec.id, v)}
                              onAttach={() => {
                                attachFor.current = { stepId: step.id, outputId: spec.id };
                                fileRef.current && fileRef.current.click();
                              }}
                              renderers={renderers}
                              context={{ workflowId: def.id, stepId: step.id, subject: subjectName, readOnly }}
                              generated={isOutputGenerated(run, step.id, spec.id)}
                            />
                          ))}

                          {genError === step.id && (
                            <div className="pf-error">Generation failed. Check the connection and try again.</div>
                          )}

                          <div className="pf-actions">
                            {generateDraft && (step.outputs || []).some((o) => o.type === "text") && (
                              <button
                                className="pf-btn"
                                disabled={generating === step.id || readOnly}
                                onClick={() => generate(sub, step)}
                              >
                                {generating === step.id ? "Generating…" : "Generate draft"}
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
              <span
                key={s.id}
                className={`pf-pip ${i === idx ? "pf-pip-active" : ""} ${i > frontier ? "pf-pip-locked" : ""}`}
                onClick={() => setNav(jumpTo(run, subs, i))}
              />
            ))}
          </div>

          {atFrontier && nextSub && (
            <div className="pf-advance-zone">
              {prog.met ? (
                <button className="pf-advance" disabled={readOnly} onClick={() => doAdvance(false)}>
                  Advance to {nextSub.name} →
                </button>
              ) : (
                <>
                  <div className="pf-gate-hint">Gate unmet: {prog.missing.join(", ")}</div>
                  <button className="pf-override" disabled={readOnly} onClick={() => doAdvance(true)}>
                    Advance anyway
                  </button>
                </>
              )}
            </div>
          )}
          {!atFrontier && (
            <div className="pf-gate-hint">Browsing history · frontier is {subs[frontier].name}</div>
          )}
          <p className="pf-legend">
            Fill an output or mark a step done to complete it. Required steps (*) drive the gate.
          </p>
        </div>

        <button className="pf-nav-btn pf-nav-fwd" disabled={idx >= frontier} onClick={() => doBrowse(1)}>
          {idx < frontier && nextSub ? nextSub.name : "Forward"} →
        </button>
      </div>

        </>
      )}

      </div>
      </div>
    </div>
  );
}

/* ============================================================ CSS */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

.pf-root {
  min-height: 100vh;
  background: linear-gradient(180deg, #222932 0%, #1B2129 100%);
  font-family: 'IBM Plex Sans', system-ui, sans-serif;
  color: #23282F;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
}

.pf-header { display: flex; align-items: center; gap: 20px; padding: 18px 28px 10px; flex-wrap: wrap; }
.pf-brand { display: flex; align-items: center; gap: 10px; color: #EDEAE0; }
.pf-brand-mark { font-size: 20px; color: #D9A441; }
.pf-brand-name { font-family: 'IBM Plex Mono', monospace; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; font-size: 13px; }
.pf-subject { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: #8A919B; }
.pf-rail { display: flex; align-items: center; gap: 10px; flex: 1; justify-content: center; flex-wrap: wrap; }
.pf-rail-stage { display: flex; align-items: center; gap: 7px; font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
.pf-rail-dot { width: 8px; height: 8px; border-radius: 50%; }
.pf-rail-active { color: #D9A441; } .pf-rail-active .pf-rail-dot { background: #D9A441; box-shadow: 0 0 8px #D9A44188; }
.pf-rail-done { color: #6FBF95; } .pf-rail-done .pf-rail-dot { background: #2E8F62; }
.pf-rail-ahead { color: #5E6772; } .pf-rail-ahead .pf-rail-dot { background: #444D58; }
.pf-rail-line { width: 34px; height: 1px; background: #3A434E; }
.pf-header-right { display: flex; align-items: center; gap: 10px; }
.pf-switch { display: flex; border: 1px solid #3A434E; border-radius: 8px; overflow: hidden; }
.pf-switch-btn {
  background: none; border: none; color: #8A919B; padding: 6px 12px; cursor: pointer;
  font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; letter-spacing: 0.04em;
}
.pf-switch-btn:not(:last-child) { border-right: 1px solid #3A434E; }
.pf-switch-btn:hover { color: #EDEAE0; }
.pf-switch-active { background: #D9A441; color: #23282F; font-weight: 600; }
.pf-switch-active:hover { color: #23282F; }
.pf-switch-groups { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; }
.pf-switch-group { display: flex; flex-direction: column; gap: 3px; align-items: flex-start; }
.pf-switch-label { font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: #5E6772; min-height: 12px; }
.pf-reset { background: none; border: 1px solid #3A434E; color: #8A919B; border-radius: 6px; padding: 5px 12px; font-size: 12px; cursor: pointer; font-family: 'IBM Plex Mono', monospace; }
.pf-reset:hover:not(:disabled) { color: #EDEAE0; border-color: #5E6772; }
.pf-reset:disabled { opacity: 0.4; cursor: default; }
.pf-advance:disabled, .pf-override:disabled { opacity: 0.4; cursor: default; }
.pf-archived {
  display: flex; align-items: center; gap: 12px; margin: 6px 28px 0;
  padding: 8px 14px; border: 1px solid #D9A441; border-radius: 8px;
  background: #3A3424; color: #EDD9A8; font-size: 12.5px;
  font-family: 'IBM Plex Mono', monospace;
}
.pf-ta[readonly], .pf-field-input[readonly] { background: #F3F1E8; color: #6B6F76; }

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

.pf-deck { position: relative; flex: 1; min-height: 540px; perspective: 1400px; margin-top: 8px; }
.pf-card {
  position: absolute; left: 50%; top: 12px;
  max-height: calc(100% - 24px);
  background: #F1EEE3; border-radius: 10px; border: 1px solid #D8D3C2;
  box-shadow: 0 18px 50px rgba(0,0,0,0.45);
  padding: 0 0 18px;
  transition: transform 0.45s cubic-bezier(.3,.9,.3,1), width 0.45s cubic-bezier(.3,.9,.3,1), opacity 0.45s;
  transform-style: preserve-3d;
  display: flex; flex-direction: column; overflow: hidden;
}
@media (prefers-reduced-motion: reduce) { .pf-card { transition: none; } }
.pf-card-center { width: min(800px, 92vw); }
.pf-card-side { width: min(400px, 44vw); }
.pf-card-strip {
  display: flex; justify-content: space-between; align-items: center;
  background: #23282F; color: #EDEAE0; padding: 8px 16px;
  font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.1em;
}
.pf-card-count { color: #D9A441; }
.pf-card-title { font-size: 26px; font-weight: 700; padding: 16px 20px 2px; letter-spacing: -0.01em; }
.pf-card-desc { padding: 0 20px 6px; font-size: 13.5px; color: #5C6068; }
.pf-card-locked .pf-card-strip { background: #3A3F46; }

.pf-inputs { margin: 8px 20px 0; }
.pf-inputs-toggle { background: none; border: none; cursor: pointer; font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; color: #7A6A3C; letter-spacing: 0.05em; padding: 0; }
.pf-inputs-body { margin-top: 8px; border-left: 2px solid #D9A441; padding-left: 10px; display: flex; flex-direction: column; gap: 8px; max-height: 160px; overflow-y: auto; }
.pf-input-item { font-size: 12px; }
.pf-input-name { font-weight: 600; }
.pf-input-preview { color: #6B6F76; white-space: pre-wrap; }

.pf-steps { margin: 12px 14px 0; display: flex; flex-direction: column; gap: 6px; overflow-y: auto; }
.pf-steps-side { pointer-events: none; }
.pf-step { border: 1px solid #DCD7C7; border-radius: 8px; background: #FAF8F0; }
.pf-step-done { border-color: #BCD9C9; background: #F2F8F3; }
.pf-step-row {
  width: 100%; display: flex; align-items: center; gap: 10px;
  background: none; border: none; padding: 11px 14px; cursor: pointer;
  font-family: inherit; font-size: 14.5px; color: #23282F; text-align: left;
}
.pf-step-name { flex: 1; font-weight: 500; }
.pf-req { color: #C9542D; margin-left: 3px; }
.pf-step-state { font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: #8A8E96; }
.pf-step-done .pf-step-state { color: #2E8F62; }
.pf-chev { color: #8A8E96; font-size: 16px; width: 14px; text-align: center; }
.pf-dot { width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid #B6BAC1; flex-shrink: 0; }
.pf-dot-draft { border-color: #D9A441; background: #F4DFAE; }
.pf-dot-done { border-color: #2E8F62; background: #2E8F62; }

.pf-step-body { padding: 0 14px 14px; }
.pf-step-desc { font-size: 12.5px; color: #6B6F76; margin-bottom: 8px; }
.pf-out { margin-bottom: 10px; }
.pf-out-label { font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: #7A6A3C; margin-bottom: 4px; }
.pf-ta {
  width: 100%; min-height: 130px; resize: vertical;
  border: 1px solid #D8D3C2; border-radius: 6px; padding: 10px;
  font-family: 'IBM Plex Sans', sans-serif; font-size: 13.5px; line-height: 1.5;
  background: #FFFFFF; color: #23282F; box-sizing: border-box;
}
.pf-ta:focus { outline: 2px solid #D9A441; outline-offset: 1px; }
.pf-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.pf-field { display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; color: #6B6F76; }
.pf-field-input {
  border: 1px solid #D8D3C2; border-radius: 6px; padding: 8px 10px;
  font-family: 'IBM Plex Sans', sans-serif; font-size: 13.5px; background: #FFFFFF; color: #23282F;
}
.pf-field-input:focus { outline: 2px solid #D9A441; outline-offset: 1px; }
.pf-link-input { width: 100%; box-sizing: border-box; font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; }
.pf-filechip { font-size: 12px; font-family: 'IBM Plex Mono', monospace; color: #5C6068; margin-bottom: 6px; }
.pf-filechip-empty { color: #9A9EA6; }
.pf-error { margin-top: 6px; font-size: 12.5px; color: #B3402A; }
.pf-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.pf-btn {
  border: 1px solid #C9C3B0; background: #FFFFFF; color: #23282F;
  border-radius: 6px; padding: 7px 14px; font-size: 13px; cursor: pointer; font-weight: 500;
}
.pf-btn-sm { padding: 5px 11px; font-size: 12px; }
.pf-btn:hover:not(:disabled) { border-color: #23282F; }
.pf-btn:disabled { opacity: 0.5; cursor: default; }
.pf-btn-primary { background: #23282F; color: #F1EEE3; border-color: #23282F; }
.pf-btn-primary:hover:not(:disabled) { background: #3A434E; }

.pf-lock {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(241,238,227,0.55); backdrop-filter: blur(1px);
}
.pf-lock-icon { font-size: 30px; opacity: 0.7; }

.pf-nav { display: flex; align-items: flex-start; gap: 16px; padding: 14px 28px 22px; }
.pf-nav-btn {
  background: none; border: 1px solid #3A434E; color: #C9CDD3;
  border-radius: 8px; padding: 10px 18px; font-size: 13.5px; cursor: pointer;
  font-family: 'IBM Plex Mono', monospace; letter-spacing: 0.03em; min-width: 150px;
}
.pf-nav-btn:hover:not(:disabled) { border-color: #D9A441; color: #D9A441; }
.pf-nav-btn:disabled { opacity: 0.35; cursor: default; }
.pf-nav-fwd { margin-left: auto; text-align: right; }
.pf-nav-mid { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 7px; }
.pf-dots { display: flex; gap: 7px; }
.pf-pip { width: 9px; height: 9px; border-radius: 50%; background: #4A535E; cursor: pointer; }
.pf-pip-active { background: #D9A441; transform: scale(1.25); }
.pf-pip-locked { background: #343C45; cursor: default; }
.pf-advance-zone { display: flex; flex-direction: column; align-items: center; gap: 5px; }
.pf-advance {
  background: #D9A441; color: #23282F; border: none; border-radius: 8px;
  padding: 10px 22px; font-size: 14px; font-weight: 600; cursor: pointer;
  font-family: 'IBM Plex Sans', sans-serif;
}
.pf-advance:hover { background: #E5B458; }
.pf-override {
  background: none; border: none; color: #8A919B; font-size: 12px; cursor: pointer;
  text-decoration: underline; font-family: 'IBM Plex Mono', monospace;
}
.pf-override:hover { color: #D9A441; }
.pf-gate-hint { font-size: 11.5px; color: #8A919B; font-family: 'IBM Plex Mono', monospace; text-align: center; }
.pf-legend { font-size: 11px; color: #5E6772; margin: 2px 0 0; text-align: center; }

.pf-out-head { display: flex; align-items: center; justify-content: space-between; }
.pf-render-toggle { background: none; border: none; color: #7A6A3C; cursor: pointer; font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; text-decoration: underline; padding: 0; }
.pf-render { position: relative; border: 1px solid #D8D3C2; border-radius: 6px; background: #FFFFFF; max-height: 280px; overflow: auto; padding: 10px; }
.pf-render-expand { position: absolute; top: 6px; right: 6px; z-index: 2; background: #F1EEE3; border: 1px solid #C9C3B0; border-radius: 5px; cursor: pointer; font-size: 12px; padding: 2px 6px; }
.pf-render-expand:hover { border-color: #23282F; }
.pf-render-loading { font-size: 12px; color: #8A8E96; padding: 8px; }
.pf-ta-mono { font-family: 'IBM Plex Mono', monospace; font-size: 12px; min-height: 180px; }
.pf-overlay { position: fixed; inset: 0; z-index: 1000; background: #F1EEE3; display: flex; flex-direction: column; }
.pf-overlay-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; background: #23282F; color: #EDEAE0; }
.pf-overlay-title { font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
.pf-overlay-body { flex: 1; overflow: auto; padding: 18px 22px; }
.pf-jt { font-family: 'IBM Plex Mono', monospace; font-size: 12px; line-height: 1.55; }
.pf-jt-children { padding-left: 16px; }
.pf-jt-node > summary { cursor: pointer; }
.pf-jt-leaf { padding-left: 16px; }
.pf-jt-key { color: #7A6A3C; }
.pf-jt-string { color: #2E6E8F; } .pf-jt-number { color: #8F4E2E; } .pf-jt-boolean, .pf-jt-null { color: #6B4E8F; }

.pf-ta-wrap { position: relative; }
.pf-gen-badge {
  position: absolute; top: 6px; right: 10px; z-index: 2; pointer-events: none;
  font-family: 'IBM Plex Mono', monospace; font-size: 9.5px;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: #7A6A3C; background: #F4DFAE; border-radius: 4px; padding: 1px 6px;
}
.pf-ta-generated, .pf-ta-generated[readonly] { background: #FCF7E9; border-color: #D9A441; }
.pf-render > .pf-gen-badge { left: 10px; right: auto; }
.pf-jt-meta { color: #9A9EA6; }
.pf-kv { display: grid; grid-template-columns: minmax(110px, max-content) 1fr; gap: 4px 14px; font-size: 12.5px; }
.pf-kv-row { display: contents; }
.pf-kv-key { font-family: 'IBM Plex Mono', monospace; color: #7A6A3C; word-break: break-word; }
.pf-kv-val { color: #23282F; white-space: pre-wrap; word-break: break-word; }
.pf-table { border-collapse: collapse; font-size: 12px; width: 100%; }
.pf-table th, .pf-table td { border: 1px solid #DCD7C7; padding: 5px 8px; text-align: left; vertical-align: top; }
.pf-table th { background: #EFEBDD; font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; letter-spacing: 0.05em; text-transform: uppercase; }
.pf-cards { display: grid; grid-template-columns: minmax(150px, 220px) 1fr; gap: 12px; min-height: 120px; }
.pf-cards-list { display: flex; flex-direction: column; gap: 5px; overflow-y: auto; max-height: 420px; }
.pf-cards-item { text-align: left; background: #FAF8F0; border: 1px solid #DCD7C7; border-radius: 6px; padding: 7px 9px; cursor: pointer; font-family: inherit; }
.pf-cards-item:hover { border-color: #23282F; }
.pf-cards-active { border-color: #D9A441; background: #FBF3DD; }
.pf-cards-title { font-size: 12.5px; font-weight: 600; color: #23282F; }
.pf-cards-sub { font-size: 11px; color: #6B6F76; }
.pf-cards-detail { border-left: 2px solid #D9A441; padding-left: 12px; overflow: auto; }
.pf-md { font-size: 13.5px; line-height: 1.6; }
.pf-md h1, .pf-md h2, .pf-md h3, .pf-md h4, .pf-md h5, .pf-md h6 { margin: 12px 0 6px; line-height: 1.25; }
.pf-md h1 { font-size: 19px; } .pf-md h2 { font-size: 16.5px; } .pf-md h3 { font-size: 14.5px; }
.pf-md p { margin: 6px 0; }
.pf-md ul, .pf-md ol { margin: 6px 0; padding-left: 22px; }
.pf-md blockquote { margin: 8px 0; border-left: 3px solid #D9A441; padding-left: 10px; color: #5C6068; }
.pf-md-pre { background: #23282F; color: #EDEAE0; border-radius: 6px; padding: 10px; overflow-x: auto; font-size: 12px; }
.pf-md code { background: #EFEBDD; border-radius: 3px; padding: 0 4px; font-family: 'IBM Plex Mono', monospace; font-size: 0.92em; }
.pf-md-pre code { background: none; padding: 0; }
.pf-md table { margin: 8px 0; }

@media (max-width: 720px) {
  .pf-card-side { display: none; }
  .pf-side { display: none; }
  .pf-deck { min-height: 600px; }
  .pf-nav-btn { min-width: 0; }
  .pf-fields { grid-template-columns: 1fr; }
  .pf-rail { justify-content: flex-start; }
}
`;

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
} from "@sqnce/core";

/**
 * <ProcessRolodex />
 *
 * Props:
 *  - workflows: array of sqnce definitions (see /definitions for examples)
 *  - persistence (optional): { load: async () => state | null,
 *                              save: async (state) => void }
 *      where state is { activeId, runs: { [workflowId]: run } }.
 *      Omit for in-memory only.
 *  - generateDraft (optional): async (prompt: string) => string.
 *      Wire this to any LLM provider. Omit to hide the
 *      "Generate draft" action entirely.
 */
export default function ProcessRolodex({ workflows, persistence, generateDraft }) {
  const [activeId, setActiveId] = useState(workflows[0].id);
  const [runs, setRuns] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [generating, setGenerating] = useState(null);
  const [genError, setGenError] = useState(null);
  const [loaded, setLoaded] = useState(!persistence);
  const [showInputs, setShowInputs] = useState(false);
  const fileRef = useRef(null);
  const attachFor = useRef(null);
  const saveTimer = useRef(null);

  const def = useMemo(
    () => workflows.find((w) => w.id === activeId) || workflows[0],
    [workflows, activeId]
  );
  const subs = useMemo(() => flattenSubStages(def), [def]);
  const run = runs[activeId] || createRun();
  const idx = Math.min(run.idx, subs.length - 1);
  const frontier = Math.min(run.frontier, subs.length - 1);

  const setRun = useCallback(
    (next) => setRuns((prev) => ({ ...prev, [activeId]: next })),
    [activeId]
  );

  /* ---------- persistence ---------- */
  useEffect(() => {
    if (!persistence) return;
    (async () => {
      try {
        const saved = await persistence.load();
        if (saved) {
          if (saved.runs) setRuns(saved.runs);
          if (saved.activeId && workflows.some((w) => w.id === saved.activeId))
            setActiveId(saved.activeId);
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
      persistence.save({ activeId, runs }).catch((e) => console.error("save failed", e));
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [activeId, runs, loaded, persistence]);

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
      setRun(next);
    }
  };

  const doAdvance = (force) => {
    const result = coreAdvance(run, subs, { force });
    if (result.advanced) {
      clearTransients();
      setRun(result.run);
    }
  };

  const switchWorkflow = (id) => {
    if (id === activeId) return;
    clearTransients();
    setActiveId(id);
  };

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
  const writeOutput = (stepId, outputId, value) =>
    setRun(coreSetOutput(run, stepId, outputId, value));
  const toggleDone = (stepId, checked) => setRun(setCheckedDone(run, stepId, checked));

  /* ---------- draft generation ---------- */
  const generate = async (sub, step) => {
    if (!generateDraft) return;
    const target = (step.outputs || []).find((o) => o.type === "text");
    if (!target) return;
    setGenerating(step.id);
    setGenError(null);
    try {
      const prompt = buildDraftPrompt(def, subs, run, idx, step);
      const text = await generateDraft(prompt);
      if (!text) throw new Error("Empty response");
      writeOutput(step.id, target.id, text);
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
    clearTransients();
    setRun(createRun());
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
            <div className="pf-switch">
              {workflows.map((w) => (
                <button
                  key={w.id}
                  className={`pf-switch-btn ${w.id === activeId ? "pf-switch-active" : ""}`}
                  onClick={() => switchWorkflow(w.id)}
                >
                  {w.short || w.name}
                </button>
              ))}
            </div>
          )}
          <button className="pf-reset" onClick={resetRun} title="Clear this workflow's run">
            Reset run
          </button>
        </div>
      </div>

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
                transform: `translateX(calc(-50% + ${pos * 56}%)) rotateY(${pos * -28}deg) scale(${center ? 1 : 0.82})`,
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

                          {(step.outputs || []).map((spec) => {
                            const val = (entry.outputs || {})[spec.id];
                            if (spec.type === "text")
                              return (
                                <div key={spec.id} className="pf-out">
                                  <div className="pf-out-label">{spec.label}</div>
                                  <textarea
                                    className="pf-ta"
                                    placeholder="Write the output or generate a draft."
                                    value={val || ""}
                                    onChange={(e) => writeOutput(step.id, spec.id, e.target.value)}
                                  />
                                </div>
                              );
                            if (spec.type === "link")
                              return (
                                <div key={spec.id} className="pf-out">
                                  <div className="pf-out-label">{spec.label}</div>
                                  <input
                                    className="pf-field-input pf-link-input"
                                    placeholder="https://"
                                    value={val || ""}
                                    onChange={(e) => writeOutput(step.id, spec.id, e.target.value)}
                                  />
                                </div>
                              );
                            if (spec.type === "fields")
                              return (
                                <div key={spec.id} className="pf-out">
                                  <div className="pf-out-label">{spec.label}</div>
                                  <div className="pf-fields">
                                    {spec.fields.map((f) => (
                                      <label key={f.key} className="pf-field">
                                        <span>{f.label}</span>
                                        <input
                                          className="pf-field-input"
                                          value={(val && val[f.key]) || ""}
                                          onChange={(e) =>
                                            writeOutput(step.id, spec.id, {
                                              ...(val || {}),
                                              [f.key]: e.target.value,
                                            })
                                          }
                                        />
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              );
                            if (spec.type === "file")
                              return (
                                <div key={spec.id} className="pf-out">
                                  <div className="pf-out-label">{spec.label}</div>
                                  {val && val.name ? (
                                    <div className="pf-filechip">📎 {val.name}</div>
                                  ) : (
                                    <div className="pf-filechip pf-filechip-empty">No file attached</div>
                                  )}
                                  <button
                                    className="pf-btn pf-btn-sm"
                                    onClick={() => {
                                      attachFor.current = { stepId: step.id, outputId: spec.id };
                                      fileRef.current && fileRef.current.click();
                                    }}
                                  >
                                    {val && val.name ? "Replace file" : "Attach file"}
                                  </button>
                                </div>
                              );
                            return null;
                          })}

                          {genError === step.id && (
                            <div className="pf-error">Generation failed. Check the connection and try again.</div>
                          )}

                          <div className="pf-actions">
                            {generateDraft && (step.outputs || []).some((o) => o.type === "text") && (
                              <button
                                className="pf-btn"
                                disabled={generating === step.id}
                                onClick={() => generate(sub, step)}
                              >
                                {generating === step.id ? "Generating…" : "Generate draft"}
                              </button>
                            )}
                            <button
                              className={`pf-btn ${entry.checkedDone ? "" : "pf-btn-primary"}`}
                              onClick={() => toggleDone(step.id, !entry.checkedDone)}
                            >
                              {entry.checkedDone ? "Reopen" : "Mark done"}
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
                onClick={() => setRun(jumpTo(run, subs, i))}
              />
            ))}
          </div>

          {atFrontier && nextSub && (
            <div className="pf-advance-zone">
              {prog.met ? (
                <button className="pf-advance" onClick={() => doAdvance(false)}>
                  Advance to {nextSub.name} →
                </button>
              ) : (
                <>
                  <div className="pf-gate-hint">Gate unmet: {prog.missing.join(", ")}</div>
                  <button className="pf-override" onClick={() => doAdvance(true)}>
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
.pf-reset { background: none; border: 1px solid #3A434E; color: #8A919B; border-radius: 6px; padding: 5px 12px; font-size: 12px; cursor: pointer; font-family: 'IBM Plex Mono', monospace; }
.pf-reset:hover { color: #EDEAE0; border-color: #5E6772; }

.pf-deck { position: relative; flex: 1; min-height: 540px; perspective: 1400px; margin-top: 8px; }
.pf-card {
  position: absolute; left: 50%; top: 12px;
  width: min(560px, 88vw); max-height: calc(100% - 24px);
  background: #F1EEE3; border-radius: 10px; border: 1px solid #D8D3C2;
  box-shadow: 0 18px 50px rgba(0,0,0,0.45);
  padding: 0 0 18px;
  transition: transform 0.45s cubic-bezier(.3,.9,.3,1), opacity 0.45s;
  transform-style: preserve-3d;
  display: flex; flex-direction: column; overflow: hidden;
}
@media (prefers-reduced-motion: reduce) { .pf-card { transition: none; } }
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

@media (max-width: 720px) {
  .pf-card-side { display: none; }
  .pf-deck { min-height: 600px; }
  .pf-nav-btn { min-width: 0; }
  .pf-fields { grid-template-columns: 1fr; }
  .pf-rail { justify-content: flex-start; }
}
`;

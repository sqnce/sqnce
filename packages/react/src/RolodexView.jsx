import React from "react";
import {
  getStepEntry,
  isStepComplete,
  stepHasAnyOutput,
  gateTypeOf,
  gateProgress,
  mainGateProgress,
  jumpTo,
  isSubStageSkipped,
  wasAdvanceForced,
  serializeStep,
  draftTarget,
  isOutputGenerated,
  hasValue,
} from "@sqnce/core";
import OutputView from "./OutputView.jsx";
import { buildRendererContext } from "./rendererContext.js";
import { OutputTypeIcon } from "./icons.jsx";
import { resolveGeneratedBadge } from "./badge.js";
import { resolveStageStatus } from "./stageStatus.js";
import { resolveAdvisories } from "./advisories.js";

/*
 * The card-deck authoring view: the rotating deck of stage cards (centered
 * active card plus side cards) and the bottom navigation row (prev/next and
 * pip dots). Extracted from the shell (Sqnce.jsx) so the shell is a thin
 * switch over three sibling views (RolodexView, RunsScreen, ReadingView).
 * Behavior-preserving: the shell still owns the run-store state, the
 * mutation handlers, and the transient UI state with its reset; this view
 * receives them as props and owns only the deck's own derived view-model.
 */
export default function RolodexView({ view, slots, ui, ops, fileRef, attachFor, onOverlayOpenChange }) {
  // Cohesive prop groups (#114), destructured here so the body below is unchanged.
  const { def, run, subs, idx, frontier, subjectName, activeRunId, readOnly } = view;
  const { validators, advisories, renderers, generateDraft, generatedBadge, renderStageStatus } = slots;
  const { expanded, setExpanded, showInputs, setShowInputs, manualEdit, setManualEdit, generating, genError } = ui;
  const { setNav, clearTransients, reopen, toggleDone, generate, writeOutput, toggleSkip, doBrowse, doAdvance } = ops;
  const current = subs[idx];
  const inFrontierStage = current.mainIndex === frontier;
  const maxBrowse = subs.reduce((acc, s, i) => (s.mainIndex <= frontier ? i : acc), 0);
  const stageProg = mainGateProgress(def.mainStages[frontier], run, { validators });
  const nextMain = frontier < def.mainStages.length - 1 ? def.mainStages[frontier + 1] : null;
  const nextSub = idx < subs.length - 1 ? subs[idx + 1] : null;
  const prevSub = idx > 0 ? subs[idx - 1] : null;

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

  return (
    <>
      <div className="pf-deck">
        {subs.map((sub, i) => {
          const pos = i - idx;
          if (Math.abs(pos) > 2) return null;
          const locked = sub.mainIndex > frontier;
          const center = pos === 0;
          const p = gateProgress(sub, run, { validators });
          const skipped = isSubStageSkipped(run, sub.id);
          const cardAdvisories = skipped
            ? []
            : resolveAdvisories({
                advisories,
                ctx: { def, run, runId: activeRunId, subStageId: sub.id },
              });
          const advisoryHasWarning = cardAdvisories.some((a) => a.severity === "warning");
          const advisoryLabel = `${cardAdvisories.length} ${cardAdvisories.length === 1 ? "advisory" : "advisories"}`;
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
                <span className="pf-card-strip-right">
                  {cardAdvisories.length > 0 && (
                    <span
                      className={`pf-card-advisory pf-card-advisory-${advisoryHasWarning ? "warning" : "info"}`}
                      aria-label={advisoryLabel}
                      title={advisoryLabel}
                    >
                      {advisoryHasWarning ? "⚠" : "ℹ"} {cardAdvisories.length}
                    </span>
                  )}
                  <span className="pf-card-count">
                    {skipped
                      ? "Skipped"
                      : `${p.done}/${p.total} required${p.gateType === "strict" ? " · strict gate" : ""}`}
                  </span>
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
                  // one handler for the done dot, used by both the compact and
                  // expanded step rows (#114).
                  const onToggleDone = () => (status === "done" ? reopen(step.id) : toggleDone(step.id, true));
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
                          onClick={onToggleDone}
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
                            {(() => {
                              const ss = resolveStageStatus({
                                render: renderStageStatus,
                                ctx: { def, run, runId: activeRunId, stepId: step.id, status },
                                status,
                              });
                              return "node" in ss ? ss.node : ss.word;
                            })()}
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
                                onOverlayOpenChange={onOverlayOpenChange}
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
                              onClick={onToggleDone}
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
                  {cardAdvisories.length > 0 && (
                    <div className="pf-advisories">
                      {cardAdvisories.map((a, ai) => (
                        <div key={ai} className={`pf-advisory pf-advisory-${a.severity}`}>
                          <span className="pf-advisory-icon" aria-hidden="true">
                            {a.severity === "warning" ? "⚠" : "ℹ"}
                          </span>
                          <span className="pf-advisory-msg">{a.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
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
                onClick={() => { clearTransients(); setNav(jumpTo(run, subs, i)); }}
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
  );
}

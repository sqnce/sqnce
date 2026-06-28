import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ThemeScope } from "./themeScope.jsx";
import { useFocusTrap } from "./useFocusTrap.js";
import {
  gateProgress,
  gateTypeOf,
  isSubStageSkipped,
  mainGateProgress,
  runSummary,
  wasAdvanceForced,
} from "@sqnce/core";

/*
 * Full-screen explainer for the active workflow: what the process is,
 * how its gates work, the stage tree, and where the run currently is.
 * Read-only: derived entirely from the definition plus run state, no
 * mutations, nothing persisted. Reuses the pf-overlay pattern from
 * OutputView (portal to body: the rolodex cards are CSS-transformed,
 * which would trap position: fixed overlays inside the card).
 */
export default function OverviewModal({ def, run, subs, idx, frontier, validators, onClose }) {
  const overlayRef = useRef(null);
  useFocusTrap(overlayRef);
  useEffect(() => {
    /* No textarea/input guard: Escape is not a typing key and the
       modal should always close. */
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const current = subs[idx];
  const gateTypes = new Set(subs.map((s) => gateTypeOf(s)));
  const anySkippable = subs.some((s) => s.skippable);
  const progress = runSummary(def, run, { validators });

  return createPortal(
    <ThemeScope>
    <div className="pf-overlay" role="dialog" aria-modal="true" ref={overlayRef} tabIndex={-1}>
      <div className="pf-overlay-head">
        <span className="pf-overlay-title">About this process</span>
        <button className="pf-btn pf-btn-sm" onClick={onClose} title="Close">
          ✕
        </button>
      </div>
      <div className="pf-overlay-body">
        <div className="pf-ov">
          <h2 className="pf-ov-name">{def.name}</h2>
          {def.short && <p className="pf-ov-short">{def.short}</p>}

          <h3 className="pf-ov-heading">How it works</h3>
          <ul className="pf-ov-rules">
            {gateTypes.has("hybrid") && (
              <li>
                A step counts as complete once it has any output or is checked done
                {gateTypes.has("strict")
                  ? ", except in strict sub-stages, where only the explicit done mark counts"
                  : ""}
                .
              </li>
            )}
            {!gateTypes.has("hybrid") && gateTypes.has("strict") && (
              <li>
                Every sub-stage here is strict: a step counts as complete only when it is
                explicitly checked done.
              </li>
            )}
            <li>
              Sub-stages within a committed main stage are freely browsable. Entering the next
              main stage passes its boundary gate: every required step across the stage's
              sub-stages must be complete.
            </li>
            <li>
              The gate guides rather than blocks: advancing past an unmet gate is always
              possible with the explicit override.
            </li>
            {anySkippable && (
              <li>
                Some sub-stages can be marked not applicable; they leave the gate aggregate and
                the progress count until restored.
              </li>
            )}
          </ul>

          <div className="pf-ov-stages-head">
            <h3 className="pf-ov-heading">Stages</h3>
            <span className="pf-ov-progress">
              {progress.met} of {progress.total} gates met
            </span>
          </div>
          {def.mainStages.map((ms, mi) => {
            const p = mainGateProgress(ms, run, { validators });
            const locked = mi > frontier;
            const glyph = p.met ? "✓" : locked ? "🔒" : String(mi + 1);
            const forced = wasAdvanceForced(run, mi) && !p.met;
            return (
              <div
                key={ms.id}
                className={`pf-ov-stage ${mi === current.mainIndex ? "pf-ov-stage-active" : ""}`}
              >
                <div className="pf-ov-stage-row">
                  <span className="pf-ov-glyph">{glyph}</span>
                  <span className="pf-ov-stage-name">{ms.name}</span>
                  {forced && <span className="pf-ov-forced">Advanced with open steps</span>}
                </div>
                {subs.map((sub, fi) =>
                  sub.mainIndex !== mi ? null : (
                    <div key={sub.id} className="pf-ov-sub">
                      <div className="pf-ov-sub-row">
                        <span className="pf-ov-sub-name">{sub.name}</span>
                        <span className="pf-ov-gate">{gateTypeOf(sub)} gate</span>
                        <span className="pf-ov-status">
                          {isSubStageSkipped(run, sub.id)
                            ? "Not applicable"
                            : gateProgress(sub, run, { validators }).met
                              ? "Gate met"
                              : "In progress"}
                        </span>
                        {fi === idx && <span className="pf-ov-here">you are here</span>}
                      </div>
                      {sub.description && <p className="pf-ov-sub-desc">{sub.description}</p>}
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
    </ThemeScope>,
    document.body
  );
}

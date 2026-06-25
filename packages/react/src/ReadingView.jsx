import React, { useMemo } from "react";
import { jumpTo, getStepEntry, hasValue, isSubStageSkipped } from "@sqnce/core";
import OutputView from "./OutputView.jsx";

/*
 * Reading mode for a (typically finished) run: a flat, non-3D document
 * view, so it never recreates the card deck's CSS transform that traps
 * position: fixed overlays. The contents rail lists the committed
 * reachable main stages (the ones jumpTo accepts, so skipped tracks and
 * unreached stages drop out); the canvas renders each stage's filled
 * outputs read-only and expanded; prev/next walk the reachable stages in
 * reading order (def.mainStages order: spine, then kept tracks). No engine
 * change: reachability is jumpTo, output values come from getStepEntry,
 * and the caller decides completeness.
 */
export default function ReadingView({ def, run, subs, runName, renderers, subjectName, onJump, onEdit }) {
  const firstFlatOf = (mi) => subs.findIndex((s) => s.mainIndex === mi);

  /* The committed reachable main stages, in def order. A stage is readable
     when its first sub-stage is a jumpTo target (jumpTo returns idx === f
     only when f is reachable), which excludes skipped tracks and stages
     past the frontier without any frontier math here. */
  const readable = useMemo(() => {
    const out = [];
    for (let mi = 0; mi < def.mainStages.length; mi++) {
      const f = subs.findIndex((s) => s.mainIndex === mi);
      if (f >= 0 && jumpTo(run, subs, f).idx === f) out.push(mi);
    }
    return out;
  }, [def, run, subs]);

  const selectedMain = subs[Math.min(run.idx, subs.length - 1)].mainIndex;
  const at = readable.indexOf(selectedMain);
  const prevMi = at > 0 ? readable[at - 1] : null;
  const nextMi = at >= 0 && at < readable.length - 1 ? readable[at + 1] : null;

  const stageSubs = subs.filter((s) => s.mainIndex === selectedMain && !isSubStageSkipped(run, s.id));

  return (
    <div className="pf-read">
      <nav className="pf-read-rail" aria-label="Contents">
        {readable.map((mi) => (
          <button
            key={def.mainStages[mi].id}
            className={`pf-read-toc ${mi === selectedMain ? "pf-read-here" : ""}`}
            aria-current={mi === selectedMain ? "step" : undefined}
            onClick={() => onJump(firstFlatOf(mi))}
          >
            {def.mainStages[mi].name}
          </button>
        ))}
      </nav>

      <div className="pf-read-doc">
        <header className="pf-read-band">
          <h1 className="pf-read-title">{runName}</h1>
          <span className="pf-read-status">Complete</span>
        </header>

        <article className="pf-read-canvas">
          <h2 className="pf-read-stage">{def.mainStages[selectedMain].name}</h2>
          {stageSubs.map((sub) => {
            const blocks = [];
            for (const step of sub.steps) {
              const se = getStepEntry(run, step.id);
              for (const spec of step.outputs || []) {
                const outVal = (se.outputs || {})[spec.id];
                if (!hasValue(spec, outVal)) continue;
                blocks.push(
                  <OutputView
                    key={step.id + ":" + spec.id}
                    spec={spec}
                    value={outVal}
                    onChange={() => {}}
                    renderers={renderers}
                    context={{ workflowId: def.id, stepId: step.id, subject: subjectName, readOnly: true, expanded: true }}
                  />
                );
              }
            }
            if (blocks.length === 0) return null;
            return (
              <section key={sub.id} className="pf-read-sub">
                <h3 className="pf-read-sub-name">{sub.name}</h3>
                {sub.description && <p className="pf-read-sub-desc">{sub.description}</p>}
                {blocks}
              </section>
            );
          })}
        </article>

        <div className="pf-read-nav">
          <button className="pf-read-navbtn" disabled={prevMi === null} onClick={() => prevMi !== null && onJump(firstFlatOf(prevMi))}>
            ← {prevMi !== null ? def.mainStages[prevMi].name : "Back"}
          </button>
          <button className="pf-read-edit" onClick={onEdit}>
            Edit run
          </button>
          <button className="pf-read-navbtn" disabled={nextMi === null} onClick={() => nextMi !== null && onJump(firstFlatOf(nextMi))}>
            {nextMi !== null ? def.mainStages[nextMi].name : "Forward"} →
          </button>
        </div>
      </div>
    </div>
  );
}

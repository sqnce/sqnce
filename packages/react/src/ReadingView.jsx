import React, { useMemo } from "react";
import { jumpTo, getStepEntry, hasValue, isSubStageSkipped } from "@sqnce/core";
import OutputView from "./OutputView.jsx";
import { resolveRunStatus } from "./runStatus.js";
import { BUILTIN_RENDERERS } from "./renderers/builtins.js";

/*
 * Reading mode for a (typically finished) run: a flat, non-3D document
 * view, so it never recreates the card deck's CSS transform that traps
 * position: fixed overlays. The contents rail lists the committed
 * reachable main stages (the ones jumpTo accepts, so skipped tracks and
 * unreached stages drop out); the canvas renders each stage's filled
 * outputs as document content; prev/next walk the reachable stages in
 * reading order (def.mainStages order: spine, then kept tracks). No engine
 * change: reachability is jumpTo, output values come from getStepEntry,
 * and the caller decides completeness.
 */

/* A renderer-backed output (an injected or built-in render.kind, or a data
   output that defaults to the JSON tree) is shown through OutputView in its
   normal inline form, uncapped in reading mode (the CSS drops the 280px panel
   cap; the renderer's expanded flag stays false, since that flag means the
   fullscreen overlay). Everything else is plain and is rendered as document
   content below, not as OutputView's read-only form controls (a fixed-height
   scrolling textarea is not a read presentation). */
function rendererBacked(spec, renderers) {
  const kind = spec.render && spec.render.kind;
  const custom = kind ? (renderers && renderers[kind]) || BUILTIN_RENDERERS[kind] : null;
  return !!custom || spec.type === "data";
}

/* Plain output as flowing document content: text wraps, a link is a real
   anchor, fields become labeled lines, a file shows its name and any
   extracted text. */
function PlainOutput({ spec, value }) {
  if (spec.type === "link") {
    /* Whitelist safe schemes, like the markdown renderer (Markdown.jsx),
       so a saved javascript:/data: value cannot become a clickable sink in
       a shared finished run. An unsafe value shows as plain text. */
    const safe = typeof value === "string" && /^(https?:|mailto:|#)/i.test(value.trim());
    return safe ? (
      <a className="pf-read-link" href={value} target="_blank" rel="noreferrer">
        {value}
      </a>
    ) : (
      <div className="pf-read-text">{value}</div>
    );
  }
  if (spec.type === "fields")
    return (
      <dl className="pf-read-fields">
        {(spec.fields || []).map((f) => (
          <div key={f.key} className="pf-read-field">
            <dt>{f.label}</dt>
            <dd>{(value && value[f.key]) || ""}</dd>
          </div>
        ))}
      </dl>
    );
  if (spec.type === "file") {
    const text = value && value.content;
    return (
      <div>
        <div className="pf-read-file">📎 {(value && value.name) || "file"}</div>
        {text && text.trim() ? <div className="pf-read-text">{text}</div> : null}
      </div>
    );
  }
  return <div className="pf-read-text">{typeof value === "string" ? value : String(value == null ? "" : value)}</div>;
}

export default function ReadingView({ def, run, subs, runName, renderers, subjectName, renderRunHeader, runStatus, runId, complete, onJump, onEdit }) {
  const firstFlatOf = (mi) => subs.findIndex((s) => s.mainIndex === mi);

  /* The committed reachable main stages, in reading order: the shared spine
     first (untracked stages in mainStages order), then each declared track
     in definition.tracks declaration order, since the contiguous track
     blocks in mainStages may be ordered differently from the declaration.
     A stage is readable when its first sub-stage is a jumpTo target (jumpTo
     returns idx === f only when f is reachable), which drops skipped tracks
     and stages past the frontier without any frontier math here. */
  const readable = useMemo(() => {
    const reachable = (mi) => {
      const f = subs.findIndex((s) => s.mainIndex === mi);
      return f >= 0 && jumpTo(run, subs, f).idx === f;
    };
    const out = [];
    for (let mi = 0; mi < def.mainStages.length; mi++) {
      if (def.mainStages[mi].track === undefined && reachable(mi)) out.push(mi);
    }
    for (const t of def.tracks || []) {
      for (let mi = 0; mi < def.mainStages.length; mi++) {
        if (def.mainStages[mi].track === t.id && reachable(mi)) out.push(mi);
      }
    }
    return out;
  }, [def, run, subs]);

  const selectedMain = subs[Math.min(run.idx, subs.length - 1)].mainIndex;
  const at = readable.indexOf(selectedMain);
  const prevMi = at > 0 ? readable[at - 1] : null;
  const nextMi = at >= 0 && at < readable.length - 1 ? readable[at + 1] : null;

  const stageSubs = subs.filter((s) => s.mainIndex === selectedMain && !isSubStageSkipped(run, s.id));

  const status = resolveRunStatus(runStatus, { def, run, runId });
  const headerNode = renderRunHeader ? renderRunHeader({ def, run, runId, subject: subjectName, complete }) : null;

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
          <span className="pf-read-status" data-tone={status ? status.tone || undefined : "complete"}>
            {status ? status.word : "Complete"}
          </span>
        </header>
        {headerNode && <div className="pf-read-header-slot">{headerNode}</div>}

        <article className="pf-read-canvas">
          <h2 className="pf-read-stage">{def.mainStages[selectedMain].name}</h2>
          {stageSubs.map((sub) => {
            const blocks = [];
            for (const step of sub.steps) {
              const se = getStepEntry(run, step.id);
              for (const spec of step.outputs || []) {
                const outVal = (se.outputs || {})[spec.id];
                if (!hasValue(spec, outVal)) continue;
                const key = step.id + ":" + spec.id;
                if (rendererBacked(spec, renderers)) {
                  blocks.push(
                    <OutputView
                      key={key}
                      spec={spec}
                      value={outVal}
                      onChange={() => {}}
                      onAttach={() => {}}
                      renderers={renderers}
                      context={{ workflowId: def.id, stepId: step.id, subject: subjectName, readOnly: true, expanded: false }}
                      generated={false}
                      invalid={null}
                    />
                  );
                } else {
                  blocks.push(
                    <div key={key} className="pf-read-out">
                      <div className="pf-read-out-label">{spec.label}</div>
                      <PlainOutput spec={spec} value={outVal} />
                    </div>
                  );
                }
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

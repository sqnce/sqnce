import React, { useEffect, useState, Suspense } from "react";
import { createPortal } from "react-dom";
import { hasValue } from "@sqnce/core";
import { BUILTIN_RENDERERS } from "./renderers/builtins.js";
import JsonTree from "./renderers/JsonTree.jsx";
import { OutputTypeIcon } from "./icons.jsx";

/*
 * Renderer contract: a renderer is a pure presentation component
 * receiving { spec, value, onChange, context }. onChange carries value
 * mutations only; renderer view state (selection, pan, zoom) stays
 * internal, because serializeStep feeds values into LLM draft prompts.
 * context = { workflowId, stepId, subject, readOnly, runId, expanded }.
 * runId is the active run entry id (null when there is no active run yet).
 */

function Overlay({ label, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  /* Portal to body: the rolodex cards are CSS-transformed, which would
     trap position: fixed overlays inside the card. */
  return createPortal(
    <div className="pf-overlay" role="dialog" aria-modal="true">
      <div className="pf-overlay-head">
        <span className="pf-overlay-title">{label}</span>
        <button className="pf-btn pf-btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="pf-overlay-body">{children}</div>
    </div>,
    document.body
  );
}

function RenderView({ Renderer, spec, value, onChange, context }) {
  return (
    <Suspense fallback={<div className="pf-render-loading">Loading view…</div>}>
      <Renderer spec={spec} value={value} onChange={onChange} context={context} />
    </Suspense>
  );
}

function RawJsonEditor({ value, onChange, onDone }) {
  const [draft, setDraft] = useState(() => JSON.stringify(value === undefined ? null : value, null, 2));
  const [error, setError] = useState(null);
  const apply = () => {
    try {
      onChange(JSON.parse(draft));
      setError(null);
      onDone();
    } catch (e) {
      setError("Invalid JSON: " + e.message);
    }
  };
  return (
    <div>
      <textarea className="pf-ta pf-ta-mono" value={draft} onChange={(e) => setDraft(e.target.value)} />
      {error && <div className="pf-error">{error}</div>}
      <div className="pf-actions">
        <button className="pf-btn pf-btn-sm" onClick={apply}>
          Apply
        </button>
        <button className="pf-btn pf-btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function DefaultEditor({ spec, value, onChange, onAttach, readOnly, generated, badge }) {
  if (spec.type === "text")
    return (
      <div className="pf-ta-wrap">
        {badge && <span className="pf-gen-badge">{badge}</span>}
        <textarea
          className={`pf-ta ${generated ? "pf-ta-generated" : ""}`}
          placeholder="Write the output or generate a draft."
          value={value || ""}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  if (spec.type === "link")
    return (
      <input
        className="pf-field-input pf-link-input"
        placeholder="https://"
        value={value || ""}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  if (spec.type === "fields")
    return (
      <div className="pf-fields">
        {spec.fields.map((f) => (
          <label key={f.key} className="pf-field">
            <span>{f.label}</span>
            <input
              className="pf-field-input"
              value={(value && value[f.key]) || ""}
              readOnly={readOnly}
              onChange={(e) => onChange({ ...(value || {}), [f.key]: e.target.value })}
            />
          </label>
        ))}
      </div>
    );
  if (spec.type === "file")
    return (
      <>
        {value && value.name ? (
          <div className="pf-filechip">📎 {value.name}</div>
        ) : (
          <div className="pf-filechip pf-filechip-empty">No file attached</div>
        )}
        <button className="pf-btn pf-btn-sm" disabled={readOnly} onClick={onAttach}>
          {value && value.name ? "Replace file" : "Attach file"}
        </button>
      </>
    );
  return null;
}

/**
 * One output spec rendered: resolves render.kind against the injected
 * renderers map, then built-ins, then falls back (JSON tree for data,
 * the default editor otherwise). Unknown kinds never render blank.
 */
export default function OutputView({ spec, value, onChange, onAttach, renderers, context, generated, badge = null, invalid }) {
  const kind = spec.render && spec.render.kind;
  const Custom = kind ? (renderers && renderers[kind]) || BUILTIN_RENDERERS[kind] : null;
  const isData = spec.type === "data";
  const Renderer = Custom || (isData ? JsonTree : null);
  const filled = hasValue(spec, value);
  const viewValue = spec.type === "file" ? (value && value.content) || "" : value;
  /* A file value with no extracted text has nothing for a renderer to
     show; fall back to the attachment display instead of a blank panel. */
  const fileNoText = spec.type === "file" && !(value && value.content && value.content.trim());
  /* Mode is initialized once at mount; deriving it per render would flip
     an empty hinted output from edit to view on the first keystroke. */
  const [mode, setMode] = useState(() => (isData ? "view" : Renderer && filled ? "view" : "edit"));
  const [big, setBig] = useState(false);
  const readOnly = !!(context && context.readOnly);
  /* Read-only forces renderer-backed outputs into view mode; the raw
     JSON editor and the edit toggles become unreachable. */
  const shownMode = readOnly && Renderer ? "view" : mode;

  const body =
    Renderer && shownMode === "view" && !fileNoText ? (
      filled ? (
        <div className="pf-render">
          {badge && <span className="pf-gen-badge">{badge}</span>}
          <button className="pf-render-expand" title="Expand" onClick={() => setBig(true)}>
            ⛶
          </button>
          <RenderView
            Renderer={Renderer}
            spec={spec}
            value={viewValue}
            onChange={onChange}
            context={{ ...context, expanded: false }}
          />
        </div>
      ) : (
        <div className="pf-filechip pf-filechip-empty">{isData ? "No data yet" : "Nothing to show yet"}</div>
      )
    ) : isData ? (
      <RawJsonEditor value={value} onChange={onChange} onDone={() => setMode("view")} />
    ) : (
      <DefaultEditor spec={spec} value={value} onChange={onChange} onAttach={onAttach} readOnly={readOnly} generated={generated} badge={badge} />
    );

  const toggle = readOnly || fileNoText ? null : Renderer && shownMode === "view" ? (
    <button className="pf-render-toggle" onClick={() => setMode("edit")}>
      {isData ? "Edit JSON" : spec.type === "file" ? "Replace file" : "Edit"}
    </button>
  ) : Renderer && shownMode === "edit" && !isData && filled ? (
    <button className="pf-render-toggle" onClick={() => setMode("view")}>
      View
    </button>
  ) : null;

  return (
    <div className="pf-out">
      <div className="pf-out-head">
        <div className="pf-out-label">
          <OutputTypeIcon type={spec.type} />
          {spec.label}
        </div>
        {toggle}
      </div>
      {body}
      {invalid && <div className="pf-error">{invalid}</div>}
      {big && Renderer && (
        <Overlay label={spec.label} onClose={() => setBig(false)}>
          <RenderView
            Renderer={Renderer}
            spec={spec}
            value={viewValue}
            onChange={onChange}
            context={{ ...context, expanded: true }}
          />
        </Overlay>
      )}
    </div>
  );
}

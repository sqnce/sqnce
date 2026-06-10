import React from "react";

/** Collapsible JSON tree. Universal fallback for data outputs and unknown kinds. */
function Node({ k, v, depth }) {
  const label = k != null ? <span className="pf-jt-key">{k}: </span> : null;
  if (v === null || typeof v !== "object") {
    return (
      <div className="pf-jt-leaf">
        {label}
        <span className={`pf-jt-${v === null ? "null" : typeof v}`}>{JSON.stringify(v)}</span>
      </div>
    );
  }
  const entries = Array.isArray(v) ? v.map((x, i) => [i, x]) : Object.entries(v);
  return (
    <details className="pf-jt-node" open={depth < 1}>
      <summary>
        {label}
        <span className="pf-jt-meta">{Array.isArray(v) ? `[${entries.length}]` : `{${entries.length}}`}</span>
      </summary>
      <div className="pf-jt-children">
        {entries.map(([ck, cv]) => (
          <Node key={String(ck)} k={String(ck)} v={cv} depth={depth + 1} />
        ))}
      </div>
    </details>
  );
}

export default function JsonTree({ value }) {
  return (
    <div className="pf-jt">
      <Node k={null} v={value === undefined ? null : value} depth={0} />
    </div>
  );
}

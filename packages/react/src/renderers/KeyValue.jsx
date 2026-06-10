import React from "react";
import JsonTree from "./JsonTree.jsx";

/**
 * Flat-object renderer: one row per key. Non-objects fall back to the
 * tree. Row labels resolve per key: render.options.labels wins, then a
 * fields spec's declared { key, label } pairs, then the raw key. Labels
 * are a lookup, never a filter or reorder; unmapped keys show as-is.
 */
export default function KeyValue({ spec, value }) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return <JsonTree value={value} />;
  }
  const optionLabels = (spec && spec.render && spec.render.options && spec.render.options.labels) || {};
  const fieldLabels = {};
  ((spec && spec.fields) || []).forEach((f) => {
    if (f && f.key && f.label) fieldLabels[f.key] = f.label;
  });
  const labelFor = (k) => optionLabels[k] || fieldLabels[k] || k;
  return (
    <div className="pf-kv">
      {Object.entries(value).map(([k, v]) => (
        <div key={k} className="pf-kv-row">
          <div className="pf-kv-key">{labelFor(k)}</div>
          <div className="pf-kv-val">{v == null || typeof v !== "object" ? String(v) : JSON.stringify(v)}</div>
        </div>
      ))}
    </div>
  );
}

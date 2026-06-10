import React from "react";
import JsonTree from "./JsonTree.jsx";

/** Flat-object renderer: one row per key. Non-objects fall back to the tree. */
export default function KeyValue({ value }) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return <JsonTree value={value} />;
  }
  return (
    <div className="pf-kv">
      {Object.entries(value).map(([k, v]) => (
        <div key={k} className="pf-kv-row">
          <div className="pf-kv-key">{k}</div>
          <div className="pf-kv-val">{v == null || typeof v !== "object" ? String(v) : JSON.stringify(v)}</div>
        </div>
      ))}
    </div>
  );
}

import React, { useState } from "react";
import KeyValue from "./KeyValue.jsx";
import JsonTree from "./JsonTree.jsx";

/**
 * Navigable item list with a detail pane.
 * render.options: { title: "<key>", subtitle: "<key>" } select which item
 * fields label the list; defaults probe name/title/id and purpose/description.
 * Selection is renderer view state: internal, never written through onChange.
 */
export default function Cards({ spec, value }) {
  const [sel, setSel] = useState(0);
  if (!Array.isArray(value) || !value.length) return <JsonTree value={value} />;
  const opts = (spec && spec.render && spec.render.options) || {};
  const titleOf = (item, i) => {
    if (item == null || typeof item !== "object") return String(item);
    return String((opts.title && item[opts.title]) || item.name || item.title || item.id || `Item ${i + 1}`);
  };
  const subOf = (item) => {
    if (item == null || typeof item !== "object") return "";
    return String((opts.subtitle && item[opts.subtitle]) || item.purpose || item.description || "");
  };
  const idx = Math.min(sel, value.length - 1);
  const current = value[idx];
  return (
    <div className="pf-cards">
      <div className="pf-cards-list">
        {value.map((item, i) => (
          <button
            key={i}
            className={`pf-cards-item ${i === idx ? "pf-cards-active" : ""}`}
            onClick={() => setSel(i)}
          >
            <div className="pf-cards-title">{titleOf(item, i)}</div>
            {subOf(item) && <div className="pf-cards-sub">{subOf(item).slice(0, 90)}</div>}
          </button>
        ))}
      </div>
      <div className="pf-cards-detail">
        {current != null && typeof current === "object" && !Array.isArray(current) ? (
          <KeyValue value={current} />
        ) : (
          <JsonTree value={current} />
        )}
      </div>
    </div>
  );
}

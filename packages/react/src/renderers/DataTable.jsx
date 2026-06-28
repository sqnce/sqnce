import React from "react";
import JsonTree from "./JsonTree.jsx";
import { discoverColumns } from "./discoverColumns.js";

/** Array-of-uniform-objects renderer. Anything else falls back to the tree. */
export default function DataTable({ value }) {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.some((r) => r == null || typeof r !== "object" || Array.isArray(r))
  ) {
    return <JsonTree value={value} />;
  }
  const cols = discoverColumns(value);
  const cell = (v) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v).slice(0, 80) : String(v));
  return (
    <table className="pf-table">
      <thead>
        <tr>
          {cols.map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {value.map((row, i) => (
          <tr key={i}>
            {cols.map((c) => (
              <td key={c}>{cell(row[c])}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

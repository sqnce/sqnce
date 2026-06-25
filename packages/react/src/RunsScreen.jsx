import React, { useState } from "react";
import { runSummary, runDisplayName } from "@sqnce/core";
import { resolveRunStatus } from "./runStatus.js";

/*
 * Management table over every run, live and archived, most recently
 * updated first. Opening a row hands off to the rolodex (archived runs
 * open read-only there). Entries whose workflow id matches no current
 * workflow are hidden but preserved in the store.
 */
export default function RunsScreen({
  workflows,
  store,
  validators,
  runStatus,
  onOpenRun,
  onRename,
  onArchive,
  onUnarchive,
  onDelete,
}) {
  const [renaming, setRenaming] = useState(null); /* { id, value } */
  const [confirmDelete, setConfirmDelete] = useState(null);
  const byId = new Map(workflows.map((w) => [w.id, w]));
  const rows = Object.values(store.entries)
    .filter((e) => byId.has(e.workflowId))
    .sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : 1));

  const commitRename = () => {
    if (!renaming) return;
    onRename(renaming.id, renaming.value);
    setRenaming(null);
  };

  return (
    <div className="pf-runs">
      <table className="pf-table pf-runs-table">
        <thead>
          <tr>
            <th>Run</th>
            <th>Workflow</th>
            <th>Status</th>
            <th>Progress</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const w = byId.get(e.workflowId);
            const sum = runSummary(w, e.run, { validators });
            const status = resolveRunStatus(runStatus, { def: w, run: e.run, runId: e.id });
            return (
              <tr key={e.id} className={e.status === "archived" ? "pf-runs-archived" : ""}>
                <td>
                  {renaming && renaming.id === e.id ? (
                    <input
                      className="pf-runs-rename"
                      autoFocus
                      value={renaming.value}
                      onChange={(ev) => setRenaming({ id: e.id, value: ev.target.value })}
                      onBlur={commitRename}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter") commitRename();
                        if (ev.key === "Escape") setRenaming(null);
                      }}
                    />
                  ) : (
                    <button className="pf-runs-open" onClick={() => onOpenRun(e.id)}>
                      {runDisplayName(w, store, e.id)}
                      {e.status === "archived" && <span className="pf-badge">archived</span>}
                    </button>
                  )}
                </td>
                <td>{w.short || w.name}</td>
                <td>
                  {status ? (
                    <span className="pf-runs-status" data-tone={status.tone || undefined}>
                      {status.word}
                    </span>
                  ) : (
                    ""
                  )}
                </td>
                <td>
                  {sum.met}/{sum.total}
                </td>
                <td>{new Date(e.updatedAt).toLocaleString()}</td>
                <td>
                  <div className="pf-runs-actions">
                    <button className="pf-btn pf-btn-sm" onClick={() => onOpenRun(e.id)}>
                      Open
                    </button>
                    <button
                      className="pf-btn pf-btn-sm"
                      onClick={() => setRenaming({ id: e.id, value: e.name || "" })}
                    >
                      Rename
                    </button>
                    {e.status === "archived" ? (
                      <button className="pf-btn pf-btn-sm" onClick={() => onUnarchive(e.id)}>
                        Unarchive
                      </button>
                    ) : (
                      <button className="pf-btn pf-btn-sm" onClick={() => onArchive(e.id)}>
                        Archive
                      </button>
                    )}
                    <button
                      className="pf-btn pf-btn-sm pf-danger"
                      onClick={() => {
                        if (confirmDelete === e.id) {
                          onDelete(e.id);
                          setConfirmDelete(null);
                        } else {
                          setConfirmDelete(e.id);
                        }
                      }}
                    >
                      {confirmDelete === e.id ? "Confirm delete" : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && <div className="pf-runs-empty">No runs yet.</div>}
    </div>
  );
}

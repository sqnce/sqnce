import React, { useState } from "react";
import { runsForWorkflow, runSummary, runDisplayName } from "@sqnce/core";

/*
 * Collapsible run sidebar: one section per workflow (prop order), live
 * runs only (archived runs live on the runs screen), a progress meter
 * per run, and a per-run menu (rename, archive, delete with an inline
 * confirm step). Transient UI state (open menu, rename draft, pending
 * delete) is local and never enters the store.
 */
export default function RunSidebar({
  workflows,
  store,
  collapsed,
  onToggle,
  onOpenRun,
  onNewRun,
  onRename,
  onArchive,
  onDelete,
}) {
  const [menuFor, setMenuFor] = useState(null);
  const [renaming, setRenaming] = useState(null); /* { id, value } */
  const [confirmDelete, setConfirmDelete] = useState(null);

  if (collapsed)
    return (
      <aside className="pf-side pf-side-collapsed">
        <button className="pf-side-toggle" title="Show runs" onClick={onToggle}>
          ▸
        </button>
      </aside>
    );

  const commitRename = () => {
    if (!renaming) return;
    onRename(renaming.id, renaming.value);
    setRenaming(null);
  };

  return (
    <aside className="pf-side">
      <div className="pf-side-head">
        <span className="pf-side-title">Runs</span>
        <button className="pf-side-toggle" title="Hide runs" onClick={onToggle}>
          ◂
        </button>
      </div>
      {workflows.map((w) => {
        const live = runsForWorkflow(store, w.id).filter((e) => e.status === "active");
        return (
          <div key={w.id} className="pf-side-group">
            <div className="pf-side-label">{w.short || w.name}</div>
            {live.map((e) => {
              const sum = runSummary(w, e.run);
              const isActive =
                store.activeWorkflowId === w.id && store.activeRunByWorkflow[w.id] === e.id;
              return (
                <div key={e.id} className={`pf-side-run ${isActive ? "pf-side-run-active" : ""}`}>
                  {renaming && renaming.id === e.id ? (
                    <input
                      className="pf-side-rename"
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
                    <button className="pf-side-run-open" onClick={() => onOpenRun(e.id)}>
                      <span className="pf-side-run-name">{runDisplayName(w, store, e.id)}</span>
                      <span className="pf-side-meter">
                        <span
                          className="pf-side-meter-fill"
                          style={{ width: `${sum.total ? (sum.met / sum.total) * 100 : 0}%` }}
                        />
                      </span>
                      <span className="pf-side-count">
                        {sum.met}/{sum.total}
                      </span>
                    </button>
                  )}
                  <button
                    className="pf-side-menu-btn"
                    title="Run actions"
                    onClick={() => {
                      setMenuFor(menuFor === e.id ? null : e.id);
                      setConfirmDelete(null);
                    }}
                  >
                    ⋯
                  </button>
                  {menuFor === e.id && (
                    <div className="pf-side-menu">
                      <button
                        onClick={() => {
                          setRenaming({ id: e.id, value: e.name || "" });
                          setMenuFor(null);
                        }}
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => {
                          onArchive(e.id);
                          setMenuFor(null);
                        }}
                      >
                        Archive
                      </button>
                      <button
                        className="pf-danger"
                        onClick={() => {
                          if (confirmDelete === e.id) {
                            onDelete(e.id);
                            setMenuFor(null);
                            setConfirmDelete(null);
                          } else {
                            setConfirmDelete(e.id);
                          }
                        }}
                      >
                        {confirmDelete === e.id ? "Confirm delete" : "Delete"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            <button className="pf-side-new" onClick={() => onNewRun(w.id)}>
              + New run
            </button>
          </div>
        );
      })}
    </aside>
  );
}

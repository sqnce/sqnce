/*
 * Build the context object passed to a custom output renderer.
 *
 * Single source for the renderer-context field set so the two build sites
 * (the editing rolodex view in ProcessRolodex.jsx and the reading view in
 * ReadingView.jsx) cannot drift. The `expanded` flag is deliberately not set
 * here: OutputView owns it and sets it per view branch (inline vs the
 * full-screen overlay).
 */

/**
 * @param {Object} args
 * @param {string} args.workflowId
 * @param {string} args.stepId
 * @param {string} args.subject
 * @param {boolean} args.readOnly
 * @param {string | null} [args.runId] the active run entry id, or null when
 *   there is no active run entry (a brand-new workflow with no run yet)
 * @returns {{ workflowId: string, stepId: string, subject: string, readOnly: boolean, runId: string | null }}
 */
export function buildRendererContext({ workflowId, stepId, subject, readOnly, runId = null }) {
  return { workflowId, stepId, subject, readOnly, runId };
}

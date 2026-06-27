/*
 * Per-step status word on a deck card, resolved from an optional
 * consumer-supplied render slot. Pure and React-free so it runs under
 * node:test: it never renders, it only decides whether the consumer's
 * node or the generic word is shown. The node is opaque here; the JSX in
 * ProcessRolodex renders whichever side this returns.
 */

/**
 * Default per-step status word, by lifecycle state. Mirrors the mapping
 * that was inline in ProcessRolodex: a done step reads "Done", a draft
 * step reads "Draft", an open step reads nothing.
 * @param {"done"|"draft"|"open"} status
 * @returns {string}
 */
export function defaultStageStatusWord(status) {
  return status === "done" ? "Done" : status === "draft" ? "Draft" : "";
}

/**
 * Resolve what to show on one step's status line. When the consumer
 * supplies a render slot and it returns a non-nullish value, that value
 * (a React node) is shown; only null or undefined falls back to the
 * generic word, so a consumer returns null to defer and returns its own
 * empty node to show nothing. Returns a discriminated result so the JSX
 * stays thin and this stays testable without a DOM.
 * @param {Object} args
 * @param {((ctx: any) => any)} [args.render] the renderStageStatus prop
 * @param {any} args.ctx context passed to the render slot
 * @param {"done"|"draft"|"open"} args.status
 * @returns {{ node: any } | { word: string }}
 */
export function resolveStageStatus({ render, ctx, status }) {
  if (typeof render === "function") {
    const node = render(ctx);
    if (node !== null && node !== undefined) return { node };
  }
  return { word: defaultStageStatusWord(status) };
}

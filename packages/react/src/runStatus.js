/*
 * Per-run status word, resolved from a consumer-supplied resolver. Pure and
 * React-free so it runs under node:test. Normalizes the resolver's loose
 * return shape (string | { word, tone } | null) into a single
 * { word, tone } | null the shell renders uniformly.
 */

/**
 * @typedef {{ word: string, tone?: string }} RunStatusWord
 */

/**
 * Resolve and normalize a per-run status word. Returns null when no
 * resolver is supplied or the resolver yields no usable word, so a caller
 * can fall back to its own default (the reading band keeps "Complete"; the
 * sidebar and runs screen show nothing). A bare string becomes { word }; a
 * { word, tone } passes through; any other shape, including an empty or
 * whitespace-only word, resolves to null.
 * @param {((ctx: { def: any, run: any, runId: string|null }) => (string | RunStatusWord | null)) | undefined} resolver
 * @param {{ def: any, run: any, runId: string|null }} ctx
 * @returns {RunStatusWord | null}
 */
export function resolveRunStatus(resolver, ctx) {
  if (typeof resolver !== "function") return null;
  // A throwing consumer resolver degrades to no status word rather than
  // crashing the render, matching applyReconcile's degrade-not-crash contract.
  let out;
  try {
    out = resolver(ctx);
  } catch (e) {
    return null;
  }
  if (typeof out === "string") {
    const word = out.trim();
    return word ? { word } : null;
  }
  if (out && typeof out === "object" && typeof out.word === "string") {
    const word = out.word.trim();
    if (!word) return null;
    return out.tone ? { word, tone: out.tone } : { word };
  }
  return null;
}

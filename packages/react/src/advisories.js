/*
 * Non-blocking advisory items for one sub-stage card, resolved from an
 * optional consumer-supplied function. Pure and React-free so it runs under
 * node:test: it never renders, it only normalizes the consumer's return into
 * a safe, render-ready list. Advisories inform, never block: this value is
 * computed in the view only and never enters @sqnce/core, so it cannot affect
 * a gate, the run summary, completion, or advance.
 */

/* Recognized advisory severities. Anything else normalizes to "info". */
const SEVERITIES = new Set(["info", "warning"]);

/**
 * Resolve the advisory list to render for one sub-stage. Total and
 * degrade-not-crash: a missing function, a throwing function, or a non-array
 * return all yield []. Each item must have a non-empty string message (after
 * trimming) or it is dropped; severity normalizes to "warning" or "info"
 * ("info" for absent or unrecognized). Matches resolveStageStatus and
 * applyReconcile: a buggy consumer hook can never blank or crash the deck.
 * @param {Object} args
 * @param {((ctx: any) => any)} [args.advisories] the advisories prop
 * @param {any} args.ctx context passed to the advisories function
 * @returns {{ message: string, severity: "info"|"warning" }[]}
 */
export function resolveAdvisories({ advisories, ctx }) {
  if (typeof advisories !== "function") return [];
  let raw;
  try {
    raw = advisories(ctx);
  } catch (e) {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const message = typeof item.message === "string" ? item.message.trim() : "";
    if (!message) continue;
    const severity = SEVERITIES.has(item.severity) ? item.severity : "info";
    out.push({ message, severity });
  }
  return out;
}

/*
 * Generated-output badge label, resolved from the owning step's lifecycle.
 * Pure and React-free so it runs under node:test. The badge is a
 * render-only marker (pointer-events: none); it never enters a value.
 */

/**
 * Default badge label for a generated output, by lifecycle state. An open
 * or draft step still reads "AI draft"; a done/accepted step reads
 * "AI generated", so the AI provenance survives without claiming the
 * output is still a draft.
 * @param {"done"|"draft"|"open"} lifecycle
 * @returns {string}
 */
export function defaultGeneratedBadge(lifecycle) {
  return lifecycle === "done" ? "AI generated" : "AI draft";
}

/**
 * Resolve the badge label to render for one output. Returns null when no
 * badge should show: the output was not generated, or a consumer resolver
 * hid it. A consumer resolver, when present, fully owns the label for a
 * generated output: a non-empty returned string is the label, anything
 * else (null, empty string) hides the badge.
 * @param {Object} args
 * @param {boolean} args.generated
 * @param {"done"|"draft"|"open"} args.lifecycle
 * @param {import("@sqnce/core").OutputSpec} args.spec
 * @param {((lifecycle: string, spec: any) => (string|null))} [args.resolver]
 * @returns {string|null}
 */
export function resolveGeneratedBadge({ generated, lifecycle, spec, resolver }) {
  if (!generated) return null;
  if (resolver) {
    const out = resolver(lifecycle, spec);
    return typeof out === "string" && out.trim() ? out : null;
  }
  return defaultGeneratedBadge(lifecycle);
}

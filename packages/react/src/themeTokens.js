/* Public token names (without the --sqnce- prefix), in sync with the .pf-root
   token block. A body-portaled overlay is not a DOM descendant of .pf-root, so
   it cannot inherit these; ThemeScope re-declares the private defaults (via the
   .pf-root-tokens class) and mirrors any live consumer override. Pure and
   dependency-free so Node's test runner can import it. */
export const THEME_TOKENS = [
  "app-top", "app-bottom", "paper", "card", "input", "input-readonly",
  "panel-dark", "raised", "locked", "subtle", "hover-paper", "ink-strong", "ink-on-dark",
  "ink-on-dark-2", "ink-muted-dark", "ink-muted-on-card", "ink-muted-light",
  "ink-muted-light-2", "ink-faint-on-card", "ink-faint-light", "ink-label-dark",
  "ink-label-light", "ink-read", "link", "accent", "accent-hover", "accent-ink",
  "done", "done-tint", "done-bg", "done-ink", "draft", "draft-bg", "danger",
  "danger-soft", "danger-strong", "accept-ink", "accept-bg", "revise-ink",
  "revise-bg", "complete", "pip", "pip-locked", "border-paper", "border-card",
  "border-soft", "border-dot", "generated-bg", "gen-invite-bg", "status-bg",
  "cards-active-bg", "archived-bg", "archived-ink", "done-border", "lock-scrim",
  "jt-key", "jt-string", "jt-number", "jt-keyword",
  "font-ui", "font-mono", "font-read", "size-title", "size-body",
  "size-label", "space-1", "space-2", "space-3", "space-4", "space-5", "space-6",
  "space-7", "pad-section", "radius-card", "radius-control", "radius-sm",
  "motion-card", "motion-fade", "motion-spin",
];

/* Given a reader of resolved custom properties, return only the public tokens
   that actually have a value (a consumer override). Defaults come from the
   .pf-root-tokens class on the scope, not from here. */
export function readThemeVars(getProp) {
  const out = {};
  for (const name of THEME_TOKENS) {
    const v = getProp(`--sqnce-${name}`);
    if (v && v.trim()) out[`--sqnce-${name}`] = v.trim();
  }
  return out;
}

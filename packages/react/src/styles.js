/*
 * Rolodex shell stylesheet, extracted from Sqnce.jsx (#114). Rendered via
 * <style>{CSS}</style> in the shell; kept as a single template literal so the
 * shell stays a thin component module.
 */
export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

.pf-root, .pf-root-tokens {
  /* sqnce design tokens: a consumer overrides the public --sqnce-* on .pf-root
     or any ancestor; the shell reads the private --sqnce-_* indirection so an
     ancestor override is never shadowed by a value on .pf-root itself. The
     block is shared with .pf-root-tokens, which body-portaled overlays carry
     so they get the same defaults. */
  --sqnce-_app-top: var(--sqnce-app-top, #222932);
  --sqnce-_app-bottom: var(--sqnce-app-bottom, #1B2129);
  --sqnce-_paper: var(--sqnce-paper, #F1EEE3);
  --sqnce-_card: var(--sqnce-card, #FAF8F0);
  --sqnce-_input: var(--sqnce-input, #FFFFFF);
  --sqnce-_input-readonly: var(--sqnce-input-readonly, #F3F1E8);
  --sqnce-_panel-dark: var(--sqnce-panel-dark, #23282F);
  --sqnce-_raised: var(--sqnce-raised, #3A434E);
  --sqnce-_locked: var(--sqnce-locked, #3A3F46);
  --sqnce-_subtle: var(--sqnce-subtle, #EFEBDD);
  --sqnce-_hover-paper: var(--sqnce-hover-paper, #E7E2D4);
  --sqnce-_ink-strong: var(--sqnce-ink-strong, #23282F);
  --sqnce-_ink-on-dark: var(--sqnce-ink-on-dark, #EDEAE0);
  --sqnce-_ink-on-dark-2: var(--sqnce-ink-on-dark-2, #C9CDD3);
  --sqnce-_ink-muted-dark: var(--sqnce-ink-muted-dark, #8A919B);
  --sqnce-_ink-muted-on-card: var(--sqnce-ink-muted-on-card, #646A72);
  --sqnce-_ink-muted-light: var(--sqnce-ink-muted-light, #62666D);
  --sqnce-_ink-muted-light-2: var(--sqnce-ink-muted-light-2, #565A61);
  --sqnce-_ink-faint-on-card: var(--sqnce-ink-faint-on-card, #686C73);
  --sqnce-_ink-faint-light: var(--sqnce-ink-faint-light, #2A2F36);
  --sqnce-_ink-label-dark: var(--sqnce-ink-label-dark, #9298A1);
  --sqnce-_ink-label-light: var(--sqnce-ink-label-light, #5E6772);
  --sqnce-_ink-read: var(--sqnce-ink-read, #3A434E);
  --sqnce-_link: var(--sqnce-link, #2F6F8F);
  --sqnce-_accent: var(--sqnce-accent, #D9A441);
  --sqnce-_accent-hover: var(--sqnce-accent-hover, #E5B458);
  --sqnce-_accent-ink: var(--sqnce-accent-ink, #6E6132);
  --sqnce-_done: var(--sqnce-done, #207044);
  --sqnce-_done-tint: var(--sqnce-done-tint, #6FBF95);
  --sqnce-_done-bg: var(--sqnce-done-bg, #F2F8F3);
  --sqnce-_done-ink: var(--sqnce-done-ink, #FFFFFF);
  --sqnce-_draft: var(--sqnce-draft, #D9A441);
  --sqnce-_draft-bg: var(--sqnce-draft-bg, #F4DFAE);
  --sqnce-_danger: var(--sqnce-danger, #B5471F);
  --sqnce-_danger-soft: var(--sqnce-danger-soft, #E08A6D);
  --sqnce-_danger-strong: var(--sqnce-danger-strong, #B3402A);
  --sqnce-_accept-ink: var(--sqnce-accept-ink, #2E6E3F);
  --sqnce-_accept-bg: var(--sqnce-accept-bg, #DDEFE0);
  --sqnce-_revise-ink: var(--sqnce-revise-ink, #8F4E2E);
  --sqnce-_revise-bg: var(--sqnce-revise-bg, #F4DFAE);
  --sqnce-_complete: var(--sqnce-complete, #207044);
  --sqnce-_pip: var(--sqnce-pip, #4A535E);
  --sqnce-_pip-locked: var(--sqnce-pip-locked, #343C45);
  --sqnce-_border-paper: var(--sqnce-border-paper, #D8D3C2);
  --sqnce-_border-card: var(--sqnce-border-card, #DCD7C7);
  --sqnce-_border-soft: var(--sqnce-border-soft, #C9C3B0);
  --sqnce-_border-dot: var(--sqnce-border-dot, #B6BAC1);
  /* Decorative shell tints: low-saturation accent washes on small shell
     surfaces (the generated textarea and its invite box, the status and input
     pills, the active list card, the archived-run banner) plus the done-step
     border. Defaults match today's literals so default rendering is unchanged;
     a consumer override reskins these along with the rest of the shell. */
  --sqnce-_generated-bg: var(--sqnce-generated-bg, #FCF7E9);
  --sqnce-_gen-invite-bg: var(--sqnce-gen-invite-bg, #FCFBF5);
  --sqnce-_status-bg: var(--sqnce-status-bg, #F1E8CE);
  --sqnce-_cards-active-bg: var(--sqnce-cards-active-bg, #FBF3DD);
  --sqnce-_archived-bg: var(--sqnce-archived-bg, #3A3424);
  --sqnce-_archived-ink: var(--sqnce-archived-ink, #EDD9A8);
  --sqnce-_done-border: var(--sqnce-done-border, #BCD9C9);
  --sqnce-_lock-scrim: var(--sqnce-lock-scrim, rgba(241,238,227,0.55));
  /* JSON-tree (data fallback renderer) syntax colors, by role. Defaults match
     today's literals; a consumer reskinning to a dark or branded surface
     overrides these so JSON output stays legible. */
  --sqnce-_jt-key: var(--sqnce-jt-key, #7A6A3C);
  --sqnce-_jt-string: var(--sqnce-jt-string, #2E6E8F);
  --sqnce-_jt-number: var(--sqnce-jt-number, #8F4E2E);
  --sqnce-_jt-keyword: var(--sqnce-jt-keyword, #6B4E8F);
  --sqnce-_font-ui: var(--sqnce-font-ui, 'IBM Plex Sans', system-ui, sans-serif);
  --sqnce-_font-mono: var(--sqnce-font-mono, 'IBM Plex Mono', monospace);
  --sqnce-_font-read: var(--sqnce-font-read, var(--sqnce-_font-ui));
  --sqnce-_size-title: var(--sqnce-size-title, 26px);
  --sqnce-_size-body: var(--sqnce-size-body, 13.5px);
  --sqnce-_size-label: var(--sqnce-size-label, 10.5px);
  --sqnce-_space-1: var(--sqnce-space-1, 4px);
  --sqnce-_space-2: var(--sqnce-space-2, 6px);
  --sqnce-_space-3: var(--sqnce-space-3, 8px);
  --sqnce-_space-4: var(--sqnce-space-4, 10px);
  --sqnce-_space-5: var(--sqnce-space-5, 12px);
  --sqnce-_space-6: var(--sqnce-space-6, 16px);
  --sqnce-_space-7: var(--sqnce-space-7, 20px);
  --sqnce-_pad-section: var(--sqnce-pad-section, 28px);
  --sqnce-_radius-card: var(--sqnce-radius-card, 10px);
  --sqnce-_radius-control: var(--sqnce-radius-control, 8px);
  --sqnce-_radius-sm: var(--sqnce-radius-sm, 6px);
  --sqnce-_motion-card: var(--sqnce-motion-card, 0.45s cubic-bezier(.3,.9,.3,1));
  --sqnce-_motion-fade: var(--sqnce-motion-fade, 0.45s);
  --sqnce-_motion-spin: var(--sqnce-motion-spin, 0.8s);
}
.pf-root {
  min-height: 100vh;
  background: linear-gradient(180deg, var(--sqnce-_app-top) 0%, var(--sqnce-_app-bottom) 100%);
  font-family: var(--sqnce-_font-ui);
  color: var(--sqnce-_ink-strong);
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
}
.pf-root-tokens { font-family: var(--sqnce-_font-ui); color: var(--sqnce-_ink-strong); }

.pf-header { display: flex; align-items: center; gap: var(--sqnce-_space-7); padding: 18px var(--sqnce-_pad-section) 10px; flex-wrap: wrap; }
.pf-brand { display: flex; align-items: center; gap: var(--sqnce-_space-4); color: var(--sqnce-_ink-on-dark); }
.pf-brand-mark { font-size: 20px; color: var(--sqnce-_accent); }
.pf-brand-name { font-family: var(--sqnce-_font-mono); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; font-size: 13px; }
.pf-subject { font-family: var(--sqnce-_font-mono); font-size: 12px; color: var(--sqnce-_ink-muted-dark); }
.pf-rail { display: flex; align-items: center; gap: var(--sqnce-_space-4); flex: 1; justify-content: center; flex-wrap: wrap; }
.pf-rail-stage { display: flex; align-items: center; gap: 7px; font-family: var(--sqnce-_font-mono); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
.pf-rail-circle {
  width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 10px; border: 1px solid currentColor;
}
.pf-rail-active { color: var(--sqnce-_accent); } .pf-rail-active .pf-rail-circle { background: var(--sqnce-_accent); border-color: var(--sqnce-_accent); color: var(--sqnce-_ink-strong); box-shadow: 0 0 0 2px var(--sqnce-_accent-hover); }
.pf-rail-here { font-size: 9px; margin-left: 2px; }
.pf-rail-done { color: var(--sqnce-_done-tint); } .pf-rail-done .pf-rail-circle { background: var(--sqnce-_done); border-color: var(--sqnce-_done); color: var(--sqnce-_ink-on-dark); }
.pf-rail-ahead { color: var(--sqnce-_ink-label-dark); }
.pf-rail-clickable { cursor: pointer; }
.pf-rail-clickable:hover { color: var(--sqnce-_accent); }
.pf-rail-clickable:focus-visible { outline: 2px solid var(--sqnce-_accent); outline-offset: 3px; border-radius: 4px; }
.pf-rail-line { width: 34px; height: 1px; background: var(--sqnce-_raised); }
.pf-rail-line-fill { background: var(--sqnce-_accent); }
.pf-header-right { display: flex; align-items: center; gap: var(--sqnce-_space-4); }
.pf-switch { display: flex; border: 1px solid var(--sqnce-_raised); border-radius: var(--sqnce-_radius-control); overflow: hidden; }
.pf-switch-btn {
  background: none; border: none; color: var(--sqnce-_ink-muted-dark); padding: 6px 12px; cursor: pointer;
  font-family: var(--sqnce-_font-mono); font-size: 11.5px; letter-spacing: 0.04em;
}
.pf-switch-btn:not(:last-child) { border-right: 1px solid var(--sqnce-_raised); }
.pf-switch-btn:hover { color: var(--sqnce-_ink-on-dark); }
.pf-switch-active { background: var(--sqnce-_accent); color: var(--sqnce-_ink-strong); font-weight: 600; }
.pf-switch-active:hover { color: var(--sqnce-_ink-strong); }
.pf-switch-groups { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; }
.pf-switch-group { display: flex; flex-direction: column; gap: 3px; align-items: flex-start; }
.pf-switch-label { font-family: var(--sqnce-_font-mono); font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--sqnce-_ink-label-dark); min-height: 12px; }
.pf-reset { background: none; border: 1px solid var(--sqnce-_raised); color: var(--sqnce-_ink-muted-dark); border-radius: var(--sqnce-_radius-sm); padding: 5px 12px; font-size: 12px; cursor: pointer; font-family: var(--sqnce-_font-mono); }
.pf-reset:hover:not(:disabled) { color: var(--sqnce-_ink-on-dark); border-color: var(--sqnce-_ink-label-dark); }
.pf-reset:disabled { opacity: 0.4; cursor: default; }
.pf-advance:disabled, .pf-override:disabled { opacity: 0.4; cursor: default; }
.pf-archived {
  display: flex; align-items: center; gap: var(--sqnce-_space-5); margin: 6px var(--sqnce-_pad-section) 0;
  padding: 8px 14px; border: 1px solid var(--sqnce-_accent); border-radius: var(--sqnce-_radius-control);
  background: var(--sqnce-_archived-bg); color: var(--sqnce-_archived-ink); font-size: 12.5px;
  font-family: var(--sqnce-_font-mono);
}
.pf-ta[readonly], .pf-field-input[readonly] { background: var(--sqnce-_input-readonly); color: var(--sqnce-_ink-muted-light); }

.pf-body { display: flex; flex: 1; min-height: 0; align-items: stretch; }
.pf-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.pf-side {
  width: 232px; flex-shrink: 0; margin: 8px 0 22px 16px;
  border: 1px solid var(--sqnce-_raised); border-radius: var(--sqnce-_radius-card); padding: 10px;
  overflow-y: auto; color: var(--sqnce-_ink-on-dark-2);
  display: flex; flex-direction: column; gap: var(--sqnce-_space-5);
}
.pf-side-collapsed { width: 36px; align-items: center; padding: 10px 4px; }
.pf-side-head { display: flex; justify-content: space-between; align-items: center; }
.pf-side-title { font-family: var(--sqnce-_font-mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--sqnce-_ink-muted-dark); }
.pf-side-toggle { background: none; border: 1px solid var(--sqnce-_raised); color: var(--sqnce-_ink-muted-dark); border-radius: var(--sqnce-_radius-sm); cursor: pointer; padding: 2px 8px; }
.pf-side-toggle:hover { color: var(--sqnce-_ink-on-dark); border-color: var(--sqnce-_ink-label-dark); }
.pf-side-group { display: flex; flex-direction: column; gap: var(--sqnce-_space-1); }
.pf-side-label { font-family: var(--sqnce-_font-mono); font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--sqnce-_ink-label-dark); }
.pf-side-run { position: relative; display: flex; align-items: center; gap: 2px; border: 1px solid transparent; border-radius: 7px; }
.pf-side-run:hover { border-color: var(--sqnce-_raised); }
.pf-side-run-active { border-color: var(--sqnce-_accent); }
.pf-side-run-open {
  flex: 1; display: flex; align-items: center; gap: var(--sqnce-_space-3); min-width: 0;
  background: none; border: none; color: var(--sqnce-_ink-on-dark-2); cursor: pointer;
  padding: 7px 8px; text-align: left; font-family: inherit; font-size: 12.5px;
}
.pf-side-run-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 92px; }
.pf-side-meter { flex: 1; height: 4px; border-radius: 2px; background: var(--sqnce-_raised); overflow: hidden; }
.pf-side-meter-fill { display: block; height: 100%; background: var(--sqnce-_accent); }
.pf-side-count { font-family: var(--sqnce-_font-mono); font-size: 10px; color: var(--sqnce-_ink-muted-dark); }
.pf-side-menu-btn { background: none; border: none; color: var(--sqnce-_ink-label-dark); cursor: pointer; font-size: 14px; padding: 2px 6px; }
.pf-side-menu-btn:hover { color: var(--sqnce-_ink-on-dark); }
.pf-side-menu {
  position: absolute; right: 4px; top: 100%; z-index: 30; min-width: 130px;
  background: var(--sqnce-_panel-dark); border: 1px solid var(--sqnce-_raised); border-radius: 7px;
  display: flex; flex-direction: column; overflow: hidden;
}
.pf-side-menu button { background: none; border: none; color: var(--sqnce-_ink-on-dark-2); text-align: left; padding: 7px 12px; cursor: pointer; font-size: 12px; font-family: inherit; }
.pf-side-menu button:hover { background: var(--sqnce-_raised); }
.pf-danger { color: var(--sqnce-_danger-soft); }
.pf-side-new {
  background: none; border: 1px dashed var(--sqnce-_raised); color: var(--sqnce-_ink-muted-dark);
  border-radius: 7px; padding: 6px; cursor: pointer;
  font-size: 11.5px; font-family: var(--sqnce-_font-mono);
}
.pf-side-new:hover { color: var(--sqnce-_accent); border-color: var(--sqnce-_accent); }
.pf-side-rename {
  flex: 1; min-width: 0; background: var(--sqnce-_app-bottom); border: 1px solid var(--sqnce-_accent);
  color: var(--sqnce-_ink-on-dark); border-radius: var(--sqnce-_radius-sm); padding: 6px 8px;
  font-size: 12.5px; font-family: inherit;
}

.pf-runs {
  flex: 1; margin: 8px var(--sqnce-_pad-section) 22px; padding: 18px; overflow: auto;
  background: var(--sqnce-_paper); border: 1px solid var(--sqnce-_border-paper); border-radius: var(--sqnce-_radius-card);
}
.pf-runs-table { width: 100%; }
.pf-runs-open {
  background: none; border: none; padding: 0; cursor: pointer;
  color: var(--sqnce-_ink-strong); font-weight: 600; font-family: inherit; font-size: 13px;
  display: flex; align-items: center; gap: var(--sqnce-_space-3);
}
.pf-runs-open:hover { text-decoration: underline; }
.pf-badge {
  font-family: var(--sqnce-_font-mono); font-size: 9.5px;
  letter-spacing: 0.08em; text-transform: uppercase;
  background: var(--sqnce-_border-card); color: var(--sqnce-_ink-muted-light-2); border-radius: 4px; padding: 1px 6px;
}
.pf-runs-archived td { color: var(--sqnce-_ink-muted-on-card); }
.pf-runs-actions { display: flex; gap: var(--sqnce-_space-2); flex-wrap: wrap; }
.pf-runs-empty { color: var(--sqnce-_ink-muted-light); font-size: 13px; padding: 8px; }
.pf-runs-rename {
  border: 1px solid var(--sqnce-_accent); border-radius: var(--sqnce-_radius-sm); padding: 5px 8px;
  font-size: 13px; font-family: inherit; background: var(--sqnce-_input); color: var(--sqnce-_ink-strong);
}

.pf-deck { position: relative; flex: 1; min-height: 540px; perspective: 1400px; margin-top: 8px; }
.pf-card {
  position: absolute; left: 50%; top: 12px;
  max-height: calc(100% - 24px);
  background: var(--sqnce-_paper); border-radius: var(--sqnce-_radius-card); border: 1px solid var(--sqnce-_border-paper);
  box-shadow: 0 18px 50px rgba(0,0,0,0.45);
  padding: 0 0 18px;
  transition: transform var(--sqnce-_motion-card), width var(--sqnce-_motion-card), opacity var(--sqnce-_motion-fade);
  transform-style: preserve-3d;
  display: flex; flex-direction: column; overflow: hidden;
}
@media (prefers-reduced-motion: reduce) { .pf-card { transition: none; } }
.pf-card-center { width: min(800px, 92vw); }
.pf-card-side { width: min(400px, 44vw); }
.pf-card-strip {
  display: flex; justify-content: space-between; align-items: center;
  background: var(--sqnce-_panel-dark); color: var(--sqnce-_ink-on-dark); padding: 8px 16px;
  font-family: var(--sqnce-_font-mono); font-size: 11px; letter-spacing: 0.1em;
}
.pf-card-count { color: var(--sqnce-_accent); }
.pf-card-title { font-size: var(--sqnce-_size-title); font-weight: 700; padding: 16px 20px 2px; letter-spacing: -0.01em; }
.pf-card-desc { padding: 0 20px 6px; font-size: var(--sqnce-_size-body); color: var(--sqnce-_ink-muted-light-2); }
.pf-card-locked .pf-card-strip { background: var(--sqnce-_locked); }
.pf-card-clickable { cursor: pointer; }
.pf-card-clickable:hover { filter: brightness(1.12); outline: 1px solid var(--sqnce-_accent); }
.pf-card-clickable:focus-visible { outline: 2px solid var(--sqnce-_accent); }

.pf-inputs { margin: 8px 20px 0; }
.pf-inputs-toggle { background: none; border: none; cursor: pointer; font-family: var(--sqnce-_font-mono); font-size: 11.5px; color: var(--sqnce-_accent-ink); letter-spacing: 0.05em; padding: 0; }
.pf-inputs-body { margin-top: 8px; border-left: 2px solid var(--sqnce-_accent); padding-left: 10px; display: flex; flex-direction: column; gap: var(--sqnce-_space-3); max-height: 160px; overflow-y: auto; }
.pf-input-item { font-size: 12px; }
.pf-input-name { font-weight: 600; }
.pf-input-preview { color: var(--sqnce-_ink-muted-light); white-space: pre-wrap; }

.pf-steps { margin: 12px 14px 0; display: flex; flex-direction: column; gap: var(--sqnce-_space-2); overflow-y: auto; }
.pf-steps-side { pointer-events: none; }
.pf-step { border: 1px solid var(--sqnce-_border-card); border-radius: var(--sqnce-_radius-control); background: var(--sqnce-_card); }
.pf-step-done { border-color: var(--sqnce-_done-border); background: var(--sqnce-_done-bg); }
.pf-step-row { display: flex; align-items: center; gap: var(--sqnce-_space-4); padding-right: 14px; }
.pf-dot-btn {
  width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0; margin-left: 14px;
  display: inline-flex; align-items: center; justify-content: center; padding: 0;
  background: var(--sqnce-_input); border: 1.5px solid var(--sqnce-_border-dot); cursor: pointer;
  font-size: 11px; line-height: 1; color: transparent;
}
.pf-dot-btn:hover:not(:disabled) { border-color: var(--sqnce-_done); color: var(--sqnce-_done); }
.pf-dot-btn:disabled { cursor: default; }
.pf-dot-draft { border-color: var(--sqnce-_draft); background: var(--sqnce-_draft-bg); color: var(--sqnce-_ink-strong); }
.pf-dot-done { border-color: var(--sqnce-_done); background: var(--sqnce-_done); color: var(--sqnce-_done-ink); }
.pf-step-expand {
  flex: 1; display: flex; align-items: center; gap: var(--sqnce-_space-4); min-width: 0;
  background: none; border: none; padding: 11px 0; cursor: pointer;
  font-family: inherit; font-size: 14.5px; color: var(--sqnce-_ink-strong); text-align: left;
}
.pf-step-expand:disabled { cursor: default; }
.pf-step-name { flex: 1; font-weight: 500; }
.pf-req { color: var(--sqnce-_danger); margin-left: 3px; }
.pf-step-state { font-family: var(--sqnce-_font-mono); font-size: var(--sqnce-_size-label); letter-spacing: 0.08em; text-transform: uppercase; color: var(--sqnce-_ink-muted-on-card); }
.pf-step-done .pf-step-state { color: var(--sqnce-_done); }
.pf-chev { color: var(--sqnce-_ink-muted-on-card); font-size: 16px; width: 14px; text-align: center; }

.pf-step-body { padding: 0 14px 14px; }
.pf-step-desc { font-size: 12.5px; color: var(--sqnce-_ink-muted-light); margin-bottom: 8px; }
.pf-out { margin-bottom: 10px; }
.pf-out-label { font-family: var(--sqnce-_font-mono); font-size: var(--sqnce-_size-label); letter-spacing: 0.08em; text-transform: uppercase; color: var(--sqnce-_accent-ink); margin-bottom: 4px; display: flex; align-items: center; gap: 5px; }
.pf-ta {
  width: 100%; min-height: 130px; resize: vertical;
  border: 1px solid var(--sqnce-_border-paper); border-radius: var(--sqnce-_radius-sm); padding: 10px;
  font-family: var(--sqnce-_font-ui); font-size: var(--sqnce-_size-body); line-height: 1.5;
  background: var(--sqnce-_input); color: var(--sqnce-_ink-strong); box-sizing: border-box;
}
.pf-ta:focus { outline: 2px solid var(--sqnce-_accent); outline-offset: 1px; }
.pf-fields { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sqnce-_space-3); }
.pf-field { display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; color: var(--sqnce-_ink-muted-light); }
.pf-field-input {
  border: 1px solid var(--sqnce-_border-paper); border-radius: var(--sqnce-_radius-sm); padding: 8px 10px;
  font-family: var(--sqnce-_font-ui); font-size: var(--sqnce-_size-body); background: var(--sqnce-_input); color: var(--sqnce-_ink-strong);
}
.pf-field-input:focus { outline: 2px solid var(--sqnce-_accent); outline-offset: 1px; }
.pf-link-input { width: 100%; box-sizing: border-box; font-family: var(--sqnce-_font-mono); font-size: 12.5px; }
.pf-filechip { font-size: 12px; font-family: var(--sqnce-_font-mono); color: var(--sqnce-_ink-muted-light-2); margin-bottom: 6px; }
.pf-filechip-empty { color: var(--sqnce-_ink-faint-on-card); }
.pf-error { margin-top: 6px; font-size: 12.5px; color: var(--sqnce-_danger-strong); }
.pf-actions { display: flex; gap: var(--sqnce-_space-3); margin-top: 10px; flex-wrap: wrap; }
.pf-btn {
  border: 1px solid var(--sqnce-_border-soft); background: var(--sqnce-_input); color: var(--sqnce-_ink-strong);
  border-radius: var(--sqnce-_radius-sm); padding: 7px 14px; font-size: 13px; cursor: pointer; font-weight: 500;
}
.pf-btn-sm { padding: 5px 11px; font-size: 12px; }
.pf-btn:hover:not(:disabled) { border-color: var(--sqnce-_ink-strong); }
.pf-btn:disabled { opacity: 0.5; cursor: default; }
.pf-btn-primary { background: var(--sqnce-_panel-dark); color: var(--sqnce-_ink-on-dark); border-color: var(--sqnce-_panel-dark); }
.pf-btn-primary:hover:not(:disabled) { background: var(--sqnce-_raised); }

.pf-lock {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: var(--sqnce-_lock-scrim); backdrop-filter: blur(1px);
}
.pf-lock-icon { font-size: 30px; opacity: 0.7; }

.pf-nav { display: flex; align-items: flex-start; gap: var(--sqnce-_space-6); padding: 14px var(--sqnce-_pad-section) 22px; }
.pf-nav-btn {
  background: none; border: 1px solid var(--sqnce-_raised); color: var(--sqnce-_ink-on-dark-2);
  border-radius: var(--sqnce-_radius-control); padding: 10px 18px; font-size: var(--sqnce-_size-body); cursor: pointer;
  font-family: var(--sqnce-_font-mono); letter-spacing: 0.03em; min-width: 150px;
}
.pf-nav-btn:hover:not(:disabled) { border-color: var(--sqnce-_accent); color: var(--sqnce-_accent); }
.pf-nav-btn:disabled { opacity: 0.35; cursor: default; }
.pf-nav-fwd { margin-left: auto; text-align: right; }
.pf-nav-mid { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 7px; }
.pf-dots { display: flex; gap: 7px; }
.pf-pip { width: 9px; height: 9px; border-radius: 50%; background: var(--sqnce-_pip); cursor: pointer; border: none; padding: 0; }
.pf-pip-active { background: var(--sqnce-_accent); transform: scale(1.25); box-shadow: 0 0 0 2px var(--sqnce-_accent-hover); }
.pf-pip-locked { background: transparent; border: 1px solid var(--sqnce-_pip-locked); box-sizing: border-box; cursor: default; }
.pf-card-foot {
  margin: 12px 14px 0; padding: 10px 2px 0;
  border-top: 1px solid var(--sqnce-_border-card);
  display: flex; align-items: center; justify-content: space-between; gap: var(--sqnce-_space-4); flex-wrap: wrap;
}
.pf-gate-state { font-family: var(--sqnce-_font-mono); font-size: 11px; letter-spacing: 0.04em; color: var(--sqnce-_ink-muted-on-card); }
.pf-gate-met { color: var(--sqnce-_done); }
.pf-gen-invite {
  border: 1.5px dashed var(--sqnce-_border-soft); border-radius: var(--sqnce-_radius-control); padding: 18px;
  display: flex; align-items: center; justify-content: center; gap: var(--sqnce-_space-5);
  background: var(--sqnce-_gen-invite-bg); min-height: 46px;
}
.pf-gen-manual {
  background: none; border: none; color: var(--sqnce-_accent-ink); cursor: pointer;
  font-size: 12px; text-decoration: underline; font-family: var(--sqnce-_font-mono);
}
.pf-spinner {
  width: 14px; height: 14px; border-radius: 50%; display: inline-block;
  border: 2px solid var(--sqnce-_accent); border-top-color: transparent;
  animation: pf-spin var(--sqnce-_motion-spin) linear infinite; vertical-align: -2px;
}
.pf-spinner-sm { width: 11px; height: 11px; }
@keyframes pf-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .pf-spinner { animation: none; border-top-color: var(--sqnce-_accent); opacity: 0.5; } }
.pf-advance {
  background: var(--sqnce-_accent); color: var(--sqnce-_ink-strong); border: none; border-radius: var(--sqnce-_radius-control);
  padding: 10px 22px; font-size: 14px; font-weight: 600; cursor: pointer;
  font-family: var(--sqnce-_font-ui);
}
.pf-advance:hover { background: var(--sqnce-_accent-hover); }
.pf-override {
  background: none; border: none; color: var(--sqnce-_ink-muted-on-card); font-size: 12px; cursor: pointer;
  text-decoration: underline; font-family: var(--sqnce-_font-mono);
}
.pf-override:hover { color: var(--sqnce-_accent-ink); }
.pf-skip-btn {
  background: none; border: none; color: var(--sqnce-_ink-muted-on-card); font-size: 12px; cursor: pointer;
  text-decoration: underline; font-family: var(--sqnce-_font-mono);
}
.pf-skip-btn:hover:not(:disabled) { color: var(--sqnce-_accent-ink); }
.pf-skip-btn:disabled { opacity: 0.4; cursor: default; }
.pf-gate-forced { color: var(--sqnce-_accent-ink); }
.pf-card-skipped .pf-card-desc, .pf-card-skipped .pf-inputs { opacity: 0.5; }
.pf-card-skipped .pf-steps { opacity: 0.5; pointer-events: none; }
.pf-pip-skipped { background: transparent; border: 1px dashed var(--sqnce-_pip); box-sizing: border-box; }
.pf-gate-hint { font-size: 11.5px; color: var(--sqnce-_ink-muted-dark); font-family: var(--sqnce-_font-mono); text-align: center; }
.pf-legend { font-size: 11px; color: var(--sqnce-_ink-label-dark); margin: 2px 0 0; text-align: center; }

.pf-out-head { display: flex; align-items: center; justify-content: space-between; }
.pf-render-toggle { background: none; border: none; color: var(--sqnce-_accent-ink); cursor: pointer; font-family: var(--sqnce-_font-mono); font-size: var(--sqnce-_size-label); text-decoration: underline; padding: 0; }
.pf-render { position: relative; border: 1px solid var(--sqnce-_border-paper); border-radius: var(--sqnce-_radius-sm); background: var(--sqnce-_input); max-height: 280px; overflow: auto; padding: 10px; }
.pf-render-expand { position: absolute; top: 6px; right: 6px; z-index: 2; background: var(--sqnce-_paper); border: 1px solid var(--sqnce-_border-soft); border-radius: 5px; cursor: pointer; font-size: 12px; padding: 2px 6px; }
.pf-render-expand:hover { border-color: var(--sqnce-_ink-strong); }
.pf-render-loading { font-size: 12px; color: var(--sqnce-_ink-muted-on-card); padding: 8px; }
.pf-ta-mono { font-family: var(--sqnce-_font-mono); font-size: 12px; min-height: 180px; }
.pf-overlay { position: fixed; inset: 0; z-index: 1000; background: var(--sqnce-_paper); display: flex; flex-direction: column; }
.pf-overlay-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; background: var(--sqnce-_panel-dark); color: var(--sqnce-_ink-on-dark); }
.pf-overlay-title { font-family: var(--sqnce-_font-mono); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
.pf-overlay-body { flex: 1; overflow: auto; padding: 18px 22px; }
.pf-overlay-main { flex: 1; display: flex; min-height: 0; }
.pf-overlay-outline { flex: 0 0 240px; overflow: auto; border-right: 1px solid var(--sqnce-_border-soft); padding: 14px 14px 18px; background: var(--sqnce-_paper); }
.pf-overlay-outline:not([open]) { flex: 0 0 auto; }
.pf-overlay-outline > summary { cursor: pointer; font-family: var(--sqnce-_font-mono); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--sqnce-_ink-label-dark); margin-bottom: 8px; }
.pf-outline-list { list-style: none; margin: 0; padding: 0; }
.pf-outline-item { margin: 0; }
.pf-outline-link { display: block; width: 100%; text-align: left; background: none; border: none; cursor: pointer; padding: 3px 4px; font-family: var(--sqnce-_font-mono); font-size: 12px; line-height: 1.5; color: var(--sqnce-_accent-ink); border-radius: 4px; }
.pf-outline-link:hover { background: var(--sqnce-_input); }
.pf-outline-l2 .pf-outline-link { padding-left: 16px; }
.pf-outline-l3 .pf-outline-link { padding-left: 28px; }
.pf-outline-l4 .pf-outline-link { padding-left: 40px; }
.pf-outline-l5 .pf-outline-link { padding-left: 52px; }
.pf-outline-l6 .pf-outline-link { padding-left: 64px; }
@media (max-width: 720px) {
  .pf-overlay-main { flex-direction: column; }
  .pf-overlay-outline { flex: 0 0 auto; max-height: 32vh; border-right: none; border-bottom: 1px solid var(--sqnce-_border-soft); }
}
.pf-jt { font-family: var(--sqnce-_font-mono); font-size: 12px; line-height: 1.55; }
.pf-jt-children { padding-left: 16px; }
.pf-jt-node > summary { cursor: pointer; }
.pf-jt-leaf { padding-left: 16px; }
.pf-jt-key { color: var(--sqnce-_jt-key); }
.pf-jt-string { color: var(--sqnce-_jt-string); } .pf-jt-number { color: var(--sqnce-_jt-number); } .pf-jt-boolean, .pf-jt-null { color: var(--sqnce-_jt-keyword); }

.pf-ta-wrap { position: relative; }
.pf-gen-badge {
  position: absolute; top: 6px; right: 10px; z-index: 2; pointer-events: none;
  font-family: var(--sqnce-_font-mono); font-size: 9.5px;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--sqnce-_accent-ink); background: var(--sqnce-_draft-bg); border-radius: 4px; padding: 1px 6px;
}
.pf-ta-generated, .pf-ta-generated[readonly] { background: var(--sqnce-_generated-bg); border-color: var(--sqnce-_accent); }
.pf-render > .pf-gen-badge { left: 10px; right: auto; }
.pf-read-header-slot { margin-left: auto; }
.pf-side-status, .pf-runs-status {
  font-family: var(--sqnce-_font-mono); font-size: 9px; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--sqnce-_accent-ink); background: var(--sqnce-_status-bg);
  border-radius: 4px; padding: 1px 5px; white-space: nowrap;
}
.pf-side-status { margin-left: 6px; }
.pf-side-status[data-tone="accept"], .pf-runs-status[data-tone="accept"] { color: var(--sqnce-_accept-ink); background: var(--sqnce-_accept-bg); }
.pf-side-status[data-tone="revise"], .pf-runs-status[data-tone="revise"] { color: var(--sqnce-_revise-ink); background: var(--sqnce-_revise-bg); }

.pf-oticon { display: inline-flex; vertical-align: -1px; }
.pf-counter {
  font-family: var(--sqnce-_font-mono); font-size: 11px;
  color: var(--sqnce-_ink-muted-dark); letter-spacing: 0.05em; white-space: nowrap;
}
.pf-card-eyebrow {
  font-family: var(--sqnce-_font-mono); font-size: 9.5px;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--sqnce-_ink-muted-on-card); padding: 6px 16px 3px;
}
.pf-input-chips { display: inline-flex; gap: var(--sqnce-_space-1); margin-left: 8px; vertical-align: 1px; }
.pf-chip {
  display: inline-flex; align-items: center; gap: 3px;
  font-family: var(--sqnce-_font-mono); font-size: 9px; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--sqnce-_accent-ink); background: var(--sqnce-_status-bg);
  border-radius: 4px; padding: 1px 5px;
}
.pf-jt-meta { color: var(--sqnce-_ink-faint-on-card); }
.pf-kv { display: grid; grid-template-columns: minmax(110px, max-content) 1fr; gap: var(--sqnce-_space-1) 14px; font-size: 12.5px; }
.pf-kv-row { display: contents; }
.pf-kv-key { font-family: var(--sqnce-_font-mono); color: var(--sqnce-_accent-ink); word-break: break-word; }
.pf-kv-val { color: var(--sqnce-_ink-strong); white-space: pre-wrap; word-break: break-word; }
.pf-table { border-collapse: collapse; font-size: 12px; width: 100%; }
.pf-table th, .pf-table td { border: 1px solid var(--sqnce-_border-card); padding: 5px 8px; text-align: left; vertical-align: top; }
.pf-table th { background: var(--sqnce-_subtle); font-family: var(--sqnce-_font-mono); font-size: var(--sqnce-_size-label); letter-spacing: 0.05em; text-transform: uppercase; }
.pf-cards { display: grid; grid-template-columns: minmax(150px, 220px) 1fr; gap: var(--sqnce-_space-5); min-height: 120px; }
.pf-cards-list { display: flex; flex-direction: column; gap: 5px; overflow-y: auto; max-height: 420px; }
.pf-cards-item { text-align: left; background: var(--sqnce-_card); border: 1px solid var(--sqnce-_border-card); border-radius: var(--sqnce-_radius-sm); padding: 7px 9px; cursor: pointer; font-family: inherit; }
.pf-cards-item:hover { border-color: var(--sqnce-_ink-strong); }
.pf-cards-active { border-color: var(--sqnce-_accent); background: var(--sqnce-_cards-active-bg); }
.pf-cards-title { font-size: 12.5px; font-weight: 600; color: var(--sqnce-_ink-strong); }
.pf-cards-sub { font-size: 11px; color: var(--sqnce-_ink-muted-light); }
.pf-cards-detail { border-left: 2px solid var(--sqnce-_accent); padding-left: 12px; overflow: auto; }
.pf-md { font-size: var(--sqnce-_size-body); line-height: 1.6; }
.pf-md h1, .pf-md h2, .pf-md h3, .pf-md h4, .pf-md h5, .pf-md h6 { margin: 12px 0 6px; line-height: 1.25; }
.pf-md h1 { font-size: 19px; } .pf-md h2 { font-size: 16.5px; } .pf-md h3 { font-size: 14.5px; }
.pf-md p { margin: 6px 0; }
.pf-md ul, .pf-md ol { margin: 6px 0; padding-left: 22px; }
.pf-md blockquote { margin: 8px 0; border-left: 3px solid var(--sqnce-_accent); padding-left: 10px; color: var(--sqnce-_ink-muted-light-2); }
.pf-md-pre { background: var(--sqnce-_panel-dark); color: var(--sqnce-_ink-on-dark); border-radius: var(--sqnce-_radius-sm); padding: 10px; overflow-x: auto; font-size: 12px; }
.pf-md code { background: var(--sqnce-_subtle); border-radius: 3px; padding: 0 4px; font-family: var(--sqnce-_font-mono); font-size: 0.92em; }
.pf-md-pre code { background: none; padding: 0; }
.pf-md table { margin: 8px 0; }

/* ---------- overview modal ---------- */
.pf-ov { max-width: 760px; margin: 0 auto; width: 100%; }
.pf-ov-name { margin: 6px 0 2px; font-size: 24px; }
.pf-ov-short { margin: 0 0 6px; color: var(--sqnce-_ink-label-light); font-size: 14px; }
.pf-ov-heading { font-family: var(--sqnce-_font-mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--sqnce-_accent-ink); margin: 22px 0 8px; }
.pf-ov-rules { margin: 0; padding-left: 18px; display: grid; gap: var(--sqnce-_space-2); font-size: var(--sqnce-_size-body); line-height: 1.5; }
.pf-ov-stages-head { display: flex; align-items: baseline; justify-content: space-between; }
.pf-ov-progress { font-family: var(--sqnce-_font-mono); font-size: 12px; color: var(--sqnce-_ink-label-light); }
.pf-ov-stage { border: 1px solid var(--sqnce-_border-paper); border-radius: var(--sqnce-_radius-control); background: var(--sqnce-_input); padding: 10px 14px; margin: 0 0 10px; }
.pf-ov-stage-active { border-color: var(--sqnce-_accent); box-shadow: 0 0 0 1px var(--sqnce-_accent); }
.pf-ov-stage-row { display: flex; align-items: center; gap: var(--sqnce-_space-3); }
.pf-ov-glyph {
  width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 10px; border: 1px solid var(--sqnce-_ink-strong); font-family: var(--sqnce-_font-mono);
}
.pf-ov-stage-name { font-weight: 600; font-size: 14px; }
.pf-ov-forced { font-family: var(--sqnce-_font-mono); font-size: 11px; letter-spacing: 0.04em; color: var(--sqnce-_accent-ink); margin-left: auto; }
.pf-ov-sub { padding: 7px 0 0 26px; }
.pf-ov-sub-row { display: flex; align-items: baseline; gap: var(--sqnce-_space-4); flex-wrap: wrap; }
.pf-ov-sub-name { font-size: 13px; font-weight: 500; }
.pf-ov-gate { font-family: var(--sqnce-_font-mono); font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--sqnce-_ink-muted-on-card); }
.pf-ov-status { font-family: var(--sqnce-_font-mono); font-size: 11px; letter-spacing: 0.04em; color: var(--sqnce-_ink-label-light); }
.pf-ov-here { font-family: var(--sqnce-_font-mono); font-size: 11px; letter-spacing: 0.04em; color: var(--sqnce-_ink-strong); background: var(--sqnce-_accent); border-radius: 4px; padding: 1px 7px; }
.pf-ov-sub-desc { margin: 3px 0 0; font-size: 12.5px; color: var(--sqnce-_ink-label-light); line-height: 1.45; }

/* ---------- reading mode ---------- */
/* A light document page on the dark app shell, like the cards, so the dark
   text below stays legible. The page scrolls; the contents rail sticks. */
.pf-read { display: flex; flex: 1; min-height: 0; gap: 24px; margin: 8px 4px; padding: 20px 24px; background: var(--sqnce-_paper); border: 1px solid var(--sqnce-_border-paper); border-radius: var(--sqnce-_radius-card); color: var(--sqnce-_ink-strong); overflow: auto; }
.pf-read-rail { flex: 0 0 200px; display: flex; flex-direction: column; gap: 2px; align-self: flex-start; position: sticky; top: 0; }
.pf-read-toc { text-align: left; background: none; border: none; border-left: 2px solid transparent; padding: 6px 10px; color: var(--sqnce-_ink-label-light); font-size: 13px; cursor: pointer; border-radius: 0 4px 4px 0; }
.pf-read-toc:hover { color: var(--sqnce-_ink-strong); background: var(--sqnce-_hover-paper); }
.pf-read-here { color: var(--sqnce-_ink-strong); border-left-color: var(--sqnce-_accent); font-weight: 600; }
.pf-read-doc { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.pf-read-band { display: flex; align-items: baseline; gap: var(--sqnce-_space-5); border-bottom: 1px solid var(--sqnce-_border-paper); padding-bottom: 10px; margin-bottom: 12px; }
.pf-read-title { font-family: var(--sqnce-_font-read); font-size: 22px; margin: 0; color: var(--sqnce-_ink-strong); }
.pf-read-status { font-family: var(--sqnce-_font-mono); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--sqnce-_ink-muted-light); }
.pf-read-status[data-tone="complete"] { color: var(--sqnce-_complete); }
.pf-read-status[data-tone="accept"] { color: var(--sqnce-_accept-ink); }
.pf-read-status[data-tone="revise"] { color: var(--sqnce-_revise-ink); }
.pf-read-canvas { max-width: 760px; }
.pf-read-stage { font-family: var(--sqnce-_font-read); font-size: 18px; color: var(--sqnce-_ink-strong); margin: 4px 0 12px; }
.pf-read-sub { margin-bottom: 22px; }
.pf-read-sub-name { font-family: var(--sqnce-_font-read); font-size: 15px; color: var(--sqnce-_ink-read); margin: 0 0 4px; }
.pf-read-sub-desc { font-family: var(--sqnce-_font-read); color: var(--sqnce-_ink-muted-light); margin: 0 0 10px; }
.pf-read-out { margin: 0 0 14px; }
.pf-read-out-label { font-family: var(--sqnce-_font-mono); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--sqnce-_ink-muted-light); margin-bottom: 4px; }
.pf-read-text { font-family: var(--sqnce-_font-read); white-space: pre-wrap; line-height: 1.55; color: var(--sqnce-_ink-faint-light); margin: 0; }
.pf-read-link { font-family: var(--sqnce-_font-read); color: var(--sqnce-_link); word-break: break-all; }
.pf-read-fields { font-family: var(--sqnce-_font-read); margin: 0; display: grid; gap: var(--sqnce-_space-2); }
.pf-read-field { display: flex; gap: var(--sqnce-_space-3); }
.pf-read-field dt { color: var(--sqnce-_ink-muted-light); min-width: 120px; font-size: 13px; }
.pf-read-field dd { margin: 0; color: var(--sqnce-_ink-faint-light); }
.pf-read-file { font-family: var(--sqnce-_font-read); font-size: 13px; color: var(--sqnce-_ink-read); margin-bottom: 4px; }
.pf-read-nav { display: flex; align-items: center; justify-content: space-between; gap: var(--sqnce-_space-5); padding-top: 12px; border-top: 1px solid var(--sqnce-_border-paper); margin-top: 8px; }
.pf-read-navbtn, .pf-read-edit { background: none; border: 1px solid var(--sqnce-_border-soft); border-radius: var(--sqnce-_radius-sm); padding: 6px 12px; color: var(--sqnce-_ink-read); cursor: pointer; }
.pf-read-navbtn:hover:not(:disabled), .pf-read-edit:hover { background: var(--sqnce-_hover-paper); }
.pf-read-navbtn:disabled { opacity: 0.4; cursor: default; }
/* Uncap renderer-backed outputs in reading mode: the document shows them in
   full rather than the authoring deck's 280px capped panel. The expand-to-
   overlay button stays, so a large output can still go fullscreen and the
   no-trapped-overlay acceptance check is reachable. */
.pf-read .pf-render { max-height: none; }

@media (max-width: 720px) {
  .pf-card-side { display: none; }
  .pf-side { display: none; }
  .pf-deck { min-height: 600px; }
  .pf-nav-btn { min-width: 0; }
  .pf-fields { grid-template-columns: 1fr; }
  .pf-rail { justify-content: flex-start; }
  .pf-read { flex-direction: column; }
  .pf-read-rail { flex-basis: auto; position: static; max-height: none; flex-direction: row; flex-wrap: wrap; }
}
`;

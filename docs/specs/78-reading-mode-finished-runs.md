# spec: reading mode for finished runs

Issue: #78 (reading mode for finished runs, keep the authoring deck behind a toggle). Milestone: "UI shell: reading mode, renderers & theming".

The decision is already locked in the issue body: Option A, add a reading view and keep the authoring deck. This spec is the design for Option A. It is a first-draft spec committed to a draft PR ahead of the Codex review loop, which runs later.

Layer: pure `@sqnce/react` work in `packages/react/src/ProcessRolodex.jsx` plus a new reading-mode subtree (likely a new `ReadingView.jsx` so the deck file does not grow further). No `@sqnce/core` change is required: run completeness is derived from existing engine state, and navigation reuses the existing `jumpTo` primitive. Renderers and validators stay injected, and the reading canvas reuses `OutputView` for output rendering.

## Current behavior

- `ProcessRolodex` carries a `view` state with two values: `"rolodex"` (the authoring card-deck) and `"runs"` (the runs screen). The reading frame does not exist yet.
- The deck (`pf-deck`) renders the centered sub-stage as a 3D card using `perspective` and `rotateY` transforms. The top `pf-rail` shows the main stages as a strip that looks like tabs but has no `onClick`, so it is inert. Navigation is one step at a time via `doBrowse` (prev/next) and the pip row.
- Output content opens collapsed: each step body sits behind an expand toggle, and renderer panels are capped at 280px with an expand-to-overlay affordance.
- For a finished run the user is reading a deliverable rather than building it, so this authoring frame is the wrong default.

## How we know a run is finished

There is no terminal flag in `@sqnce/core`. A run is complete when its frontier sits on the last main stage and that stage's boundary gate is met:

```
run.frontier === def.mainStages.length - 1
  && mainGateProgress(def.mainStages[last], run, { validators }).met
```

Both `mainGateProgress` and the frontier already exist and are already used in the header. Compute this completeness as a derived boolean in the react layer so the engine stays untouched. A run that reached the last stage by a forced advance with the gate still unmet is correctly not complete (the override does not produce a finished deliverable), and forces recorded on earlier stages do not block completeness because the run still reached the end.

Design choice, raised for approval: derive completeness in react versus add a pure `isRunComplete(def, run, { validators })` to core. The recommendation is to derive it in react for this issue so the engine is not touched; revisit a core helper if #79's run-header work wants the same predicate.

## Change (Option A): add reading mode as a third view

Add `view === "reading"` as a third top-level view alongside `"rolodex"` and `"runs"`. Reading mode uses a flat (non-3D) layout, so it does not reintroduce the trap where the card deck's CSS transform captures `position: fixed` overlays. The issue calls this out: today overlays portal to `body` to escape the deck's transform, and reading mode must not recreate a transformed ancestor. A flat layout has no transformed ancestor, so fixed overlays inside it behave normally.

Default view selection: when a run is complete (per the rule above), opening it defaults to reading mode; otherwise it opens in the authoring rolodex as today. Opening a run from the runs screen and switching runs both route a complete run to reading and an in-progress run to rolodex.

### Reading-mode layout

1. Persistent left contents rail. Lists the main stages as a real, clickable table of contents with a "you are here" marker on the selected stage. Clicking an entry selects that stage in the reading canvas. This uses the same jump semantics as #85 (the `jumpTo` primitive), limited to stages at or before the frontier; for a complete run the frontier is the last stage, so the whole run is reachable. #78 introduces the rail inside reading mode; #85 makes the authoring-mode stepper clickable. They share the jump primitive but live in different views. Within reading mode this rail replaces the inert strip.
2. Run header band. Shows the run title plus a prominent terminal status. The status word and any banner come from the consumer-supplied run-header/status slot defined in #79; #78 provides the band placement, #79 provides the slot mechanism and the lifecycle-aware status. Until #79 lands, the band shows the run name and a neutral derived status word ("Complete").
3. Reading canvas. Renders the selected stage as a document page with its outputs expanded by default rather than collapsed behind toggles, one stage at a time, with quiet prev/next at the foot. It reuses `OutputView` and the injected renderers in a read-oriented presentation, with editing affordances suppressed by default (editing happens in authoring mode).

### Edit toggle

An "Edit run" control switches from reading mode into the authoring rolodex for the same run (add, do not replace). A matching control returns to reading mode. The card-deck authoring mode is unchanged. Switching views never mutates run state.

### Responsive

- The contents rail collapses to a drawer on narrow and projector widths; the reading column keeps its measure (a bounded line length).
- A two-pane custom renderer degrades to a list-then-detail layout at narrow widths.

## Out of scope

- Any `@sqnce/core` change. Completeness is derived in react.
- The consumer-supplied status text and its derivation. That is #79; #78 provides only the header band placement and a neutral default.
- Within-document section navigation in the reading canvas. That is #86, which targets the expand overlay; reading mode benefits from it but does not implement it here.
- Making the authoring-mode stepper clickable. That is #85.

## Acceptance

- A complete run opens in reading mode by default; an in-progress run opens in the authoring rolodex.
- Reading mode shows a clickable contents rail with a "you are here" marker, a run header band, and the selected stage's outputs expanded.
- "Edit run" switches to the authoring card-deck for the same run and back, with no change to run state.
- No `position: fixed` overlay is trapped by a transformed ancestor in reading mode.
- `npm test`, `npm run build -w examples/demo`, and `npm run types` pass.

## Open questions for approval

1. Derive completeness in react, or add a pure `isRunComplete` helper to core. Recommendation: derive in react.
2. Contents rail granularity: main stages only, or main stages with sub-stages nested. Recommendation: main stages, expandable to sub-stages if needed.
3. Default reading mode for complete runs immediately, or keep it opt-in via the toggle until #79's status slot lands. Recommendation: default it on now; the header shows a neutral "Complete" until #79.

# spec: per-step context selection (context views) in buildDraftPrompt

Issue: #120. This is a planning-and-design document only: it defines the seam and its
contract, with no implementation. Code lands in the step-6 plan and the step-9
implementation on this same branch; nothing here should be read as already built.

Builds directly on #52 (issues #52/#53/#54, `docs/specs/52-53-54-draft-pipeline.md`), which
gave `buildDraftPrompt`/`buildContext`/`serializeStep` a character budget (`maxCharsPerStep`)
and explicitly deferred per-step *selection*: "a per-step budget map stays out of scope; the
single knob unblocks the consumer." #120 is that deferred selection, but selection of *which
content* a step sees, not how many characters.

## Driving need

The consumer (dawtips/presales-sqnce#39) ingests source documents into one materials blob,
each document under an `=== [input-NNN] basename ===` header, stored as the `intake-materials`
step's text output. Today `buildContext` serializes every completed prior step in full, so
that whole blob feeds every downstream step's draft prompt. Threshold-gated retrieval needs
each step to see only a subset of the inputs: the ones retrieved for it, the ones an earlier
step cited, or none.

The consumer cannot do this by trimming materials before calling core, because the same run
state is read by validators. The findings validator resolves its `source_refs` against
`run.stepState["intake-materials"].outputs.materials`; if materials were pre-stripped, those
citations to a removed input would be wrongly rejected. So the selection must happen where the
prompt text is *serialized*, leaving run state intact. That is why this belongs in core. The
spike (`docs/spikes/120-per-step-context-selection.md`) confirmed this against a real presales
run: selecting at serialization left the findings validator passing on the untouched run.

## The seam (chosen design: a named selection hook, threaded like validators)

A step names the view of prior context it wants; the consumer supplies the implementation, the
same split sqnce already uses for render hints and validators (definitions are pure JSON and
cannot hold functions).

- A step may declare optional `contextView: "<name>"`. The name is a free string, validated
  loosely (non-empty), never whitelisted, exactly like `render.kind` and `validate`.
- Consumers supply a `contextViews` map: `{ [name]: (value, spec, ctx) => value }`. The
  function receives one prior output's value, that output's spec, and `ctx = { run,
  sourceStepId, targetStepId }`, and returns the replacement value to serialize. It must be
  pure and must not throw; core does not catch (same contract as validators).
- The returned value is serialized in place of the original. Returning an empty/absent value
  (so `hasValue` is false for that output) drops the block, which is how a step suppresses a
  source entirely.
- A step with no `contextView`, a name missing from the map, or no map at all gets the full
  context unchanged. Zero behavior change for anyone not opting in.
- The hook runs at serialization only; it never writes back to the run. Validators, gates,
  completion, status, `runSummary`, and other steps' draft context are all computed from run
  state and are unaffected.
- Core never parses the value. The `input-NNN` header convention stays entirely in the
  consumer, which keeps each kept slice's header bytes when it re-joins. Core's contract is to
  serialize the returned value verbatim (subject to the existing `maxCharsPerStep`
  truncation), so headers survive because core never strips them.

### Why the excluded step is the target

`buildContext(subStages, run, flatIdx, excludeStepId, opts)` already excludes the step being
drafted from its own context, so `excludeStepId` *is* the draft target. Core resolves the
target's `contextView` from `excludeStepId` (no new positional argument): it finds the step
with that id, reads its `contextView`, resolves the name against `opts.contextViews`, and binds
the resolved function. When `excludeStepId` is absent or empty (for example the synthetic
fallback step `buildDraftPrompt` uses for a stale forked index, whose id is `""`), no view
resolves and the context is full.

### The view applies to every prior output for that target

The bound function runs on each prior output value the target would see, with `sourceStepId`
identifying which source it is. The consumer keys on `ctx.sourceStepId` to transform only the
materials output and returns every other value unchanged. This generality (rather than a
"which output is materials" marker in core) keeps the header convention out of the engine; the
spec documents the pass-through expectation as part of the consumer contract, the same
consumer-supplied-pure-function trust model as renderers and validators. Because the function
is bound to the target, it only ever changes that one target's prompt; every other step's
context is untouched.

### Order relative to the budget

Selection runs before the `maxCharsPerStep` truncation, so a step that both selects and
budgets gets "select, then truncate the selection". The block-level budget remains the single
truncation point and truncated blocks still end with the `[truncated]` marker.

## Definition schema

- `Step` gains optional `contextView: string`. `validateDefinition` adds one check: when
  present it must be a non-empty string (mirroring the `validate` and `render.kind` checks).
- No change to output specs, gates, tracks, or run shape. A definition without `contextView`
  validates and behaves exactly as today.

## Core changes (`@sqnce/core`, pure, dependency-free)

- `serializeStep(subStage, step, run, { maxChars = 2500, view, targetStepId })`: when `view`
  is a function, each output's value passes through `view(value, spec, { run, sourceStepId:
  step.id, targetStepId })` before the `hasValue` presence check and formatting. The rest of
  the function is unchanged. Omitting `view` is byte-identical to today.
- `buildContext(subStages, run, flatIdx, excludeStepId, { maxCharsPerStep, validators,
  contextViews })`: resolves the target step's `contextView` against `contextViews` as
  described, then threads the bound function and `targetStepId: excludeStepId` into each
  `serializeStep` call. Resolution is independent of the validator/completeness pass: the view
  runs only on outputs of steps that are already complete and included.
- `buildDraftPrompt(definition, subStages, run, subIdx, step, opts)`: already forwards `opts`
  to `buildContext`, so `contextViews` flows through with no signature change beyond docs.
- Forked/tracked definitions: `buildContext` already excludes sibling-track blocks and only
  serializes spine plus own-track steps, so a view never sees cross-track content it should
  not. The view receives the same normalized run `serializeStep` already serializes from;
  cross-track *scoping of the view's `ctx.run`* is out of scope because materials live on the
  spine (intake), and validator gating already uses its own scoped run. This is documented, not
  changed.

## UI changes (`@sqnce/react`)

- The top-level `Sqnce` component gains an optional `contextViews` prop, threaded into the one
  `buildDraftPrompt` call (today `buildDraftPrompt(def, subs, run, idx, step, { validators })`)
  so the default draft path can select context the same way the CLI does. The component keeps
  working when the prop is omitted, like every injected prop. No other UI surface changes;
  views never affect status, gates, or rendering.

## Consumer (the seam's first user, presales-sqnce#39, not in this repo)

Out of scope for this PR (it lands in the consumer repo), but recorded so the seam's shape is
justified. The consumer passes `contextViews` alongside its existing `validators` in the same
opts object, with views such as `cited` (keep only findings-cited inputs), `retrieved` (keep a
precomputed retrieved subset for the target step), and `suppressed` (hide materials). Each
reuses the consumer's existing `splitMaterials` and re-joins kept slices with their original
`input-NNN` header bytes. The spike implemented all three against the proposed signature and a
real run; nothing in the consumer needs to fork the traceability contract.

## Docs

Same-PR updates: the core file header comment (a `contextView` bullet beside the existing
render/validate bullets, and a `contextViews` line in the consumer-supplied vocabulary);
`CLAUDE.md` (an architecture line for `contextView` on steps and a key-behavior line: a
consumer-supplied context view selects what a step sees of prior outputs at serialization
only, never mutating run state, so validators and gates are unaffected, with unresolvable
names a no-op and headers preserved); root `README.md` and `packages/react/README.md` (the
`contextViews` prop). `npm run types` regenerates the `.d.ts`.

## Out of scope

- Retrieval itself (embeddings, similarity, thresholds): a consumer concern, computed before
  the draft call and read by the pure view.
- Built-in or async views; view functions in definitions; persisting selection results.
- A "which output is the materials source" marker in core, or core parsing `input-NNN`
  headers: the consumer owns the format.
- Per-step character budget maps (that was #52's deferred budget knob, a different axis) and
  any change to the truncation behavior.
- Cross-track scoping of a view's `ctx.run` for forked definitions.
- Demo/bundled-definition changes: no bundled definition uses materials, so the demo is
  unchanged; the seam is exercised by core tests and, downstream, by the consumer.

## Acceptance

- `npm test` passes with new engine tests: `serializeStep` applies a `view` and serializes its
  returned value; an omitted `view` is byte-identical to today; a view returning an empty value
  drops the block. `buildContext`/`buildDraftPrompt` resolve `contextView` from the target
  (the excluded step), apply the bound view, and are a no-op when `contextViews` is omitted,
  when the name is missing from the map, or when the step has no `contextView`; an empty/absent
  `excludeStepId` resolves no view. A view trimming one prior output does not change which
  steps are complete or included, and does not change another step's context. `input-NNN`
  header bytes in kept slices are preserved. Selection runs before truncation (a selected
  subset still over budget ends with `[truncated]`). `validateDefinition` accepts a non-empty
  `contextView` and rejects an empty or non-string one; all bundled definitions still validate.
- `npm run build -w examples/demo` and `npm run types` pass; the generated `.d.ts` reflect the
  new optional fields.
- The spike's seven assertions (full-context baseline, cited, retrieved, suppressed,
  unresolvable no-op, validator independence, header preservation) are reproduced as core
  unit tests over a core-owned fixture (engine tests never run on bundled content).

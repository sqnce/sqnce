# spec: context budget, output validators, and generation into data outputs

Issues: #52, #53, #54, bundled into one PR because all three reshape the same pipeline (what feeds draft prompts, what counts as a valid output, and where generated values land), and because #53 and #54 are two enforcement points of a single validator concept. Also records the #50 evaluation outcome (a comment, no code).

Driving need: presales-sqnce (dawtips/presales-sqnce#1) is paused on #52 and #53. Its structured stages (findings, inventory) want LLM generation into `data` outputs with shape validation, and its late stages need upstream artifacts untruncated in prompts. #54 closes the hand-edit hole the same validator concept covers for free.

## The validator concept (shared by #53 and #54)

Definitions are pure JSON and cannot hold functions, so validation splits the same way rendering already does: the definition names the validator, the consumer supplies the implementation.

- An output spec may declare `validate: "<name>"`. The name is a free string validated loosely (non-empty), never whitelisted, exactly like `render.kind`.
- Consumers supply a validators map: `{ [name]: (value, spec) => string | null }`. A returned string is the problem message; null or undefined means valid. Validators must be pure and must not throw; the engine does not catch.
- Validators run only on present values (`hasValue` true). Empty values keep the existing presence semantics.
- An output with no `validate`, a name missing from the map, or no map at all is unvalidated. Zero behavior change for anyone not opting in.
- Validation results are computed, never persisted in run state.
- Core ships no built-in validators.

Enforcement point 1 is the gate (#54), enforcement point 2 is draft generation (#53), below.

## Definition schema

- `OutputSpec` gains optional `validate: string`. `validateDefinition` adds one check: when present it must be a non-empty string.
- Guidance (docs, not schema): a step that generates into a `data` output should describe the expected JSON shape in its `aiPrompt`.

## Core: configurable context budget (#52)

An options object threads through the prompt-building chain:

- `serializeStep(subStage, step, run, { maxChars = 2500 })`: already parameterized. Two deliberate changes inside:
  - The fixed inner 2000-char caps on file content and data JSON are removed. The block-level `maxChars` slice becomes the single truncation point, so `maxChars: Infinity` truly disables truncation (today a large JSON artifact arrives malformed regardless of the block cap).
  - When the joined parts exceed `maxChars`, the block ends with a final line `[truncated]` after the slice, so an LLM reading the prompt knows content was cut instead of treating a mid-JSON slice as the whole artifact.
- `buildContext(subStages, run, flatIdx, excludeStepId, { maxCharsPerStep, validators })`: forwards `maxCharsPerStep` as `serializeStep`'s `maxChars`.
- `buildDraftPrompt(definition, subStages, run, subIdx, step, { maxCharsPerStep, validators })`: forwards to `buildContext`.

Issue #52 asks for "default behavior unchanged when the option is omitted". The spec relaxes that from byte-identical to: same default budget (2500), no caller changes required. The two exceptions are the deliberate improvements above; both only surface on blocks that were already being truncated or inner-capped, and sqnce is pre-launch with no installed base. A per-step budget map (`{ [stepId]: maxChars }`) stays out of scope; the single knob unblocks the consumer.

## Core: validator-aware completion and gates (#54)

- `isStepComplete(step, entry, gateType, validators)` gains the optional 4th parameter. A present value on an output whose named validator returns a message makes the step incomplete, regardless of the done flag and for both gate types. A done checkbox cannot bless structurally invalid data; the force override remains the escape hatch (guide, never hard-block).
- `gateProgress(subStage, run, { validators })`: threads validators into the completion check. A required step that is incomplete because an output is invalid contributes `"<step name>: <message>"` to `missing` (first invalid output's message) instead of the bare step name.
- `mainGateProgress(mainStage, run, { validators })`, `advance(run, subStages, { force, validators })`, `runSummary(definition, run, { validators })`: thread through to the aggregate. A forced advance past a gate unmet only due to invalid outputs records `forces` exactly like any other forced advance.
- `buildContext` with validators excludes steps that are incomplete because of invalid outputs, closing the leak #54 describes: invalid content never feeds downstream draft prompts. (Step-level exclusion is the granularity; an invalid output makes its whole step incomplete, so none of the step serializes.)

## Core: draft targets and parsing (#53)

- `draftTarget(step)`: returns the first output spec with `type: "text"`, else the first with `type: "data"`, else null. Exported; the UI and the prompt builder share one definition of "what generation writes into".
- `parseDraft(spec, text)`: pure helper turning a raw LLM reply into a storable value.
  - Text target: `{ ok: true, value: text }`, unchanged passthrough.
  - Data target: trim, strip one surrounding markdown code fence (with optional language tag) when present, then strict `JSON.parse`. Success: `{ ok: true, value }` (the parsed value). Failure: `{ ok: false, error: "Draft is not valid JSON: <parser message>" }`.
- `buildDraftPrompt` adapts its closing instruction via `draftTarget(step)`: text targets keep the current line; data targets get "Respond with valid JSON only: no preamble, no code fences, no commentary."

## UI (`@sqnce/react`)

- `ProcessRolodex` gains an optional `validators` prop, threaded into every completion and gate call (step status, previous-card done blocks, inputs panel, gate footer, rail, advance) and into `buildDraftPrompt`; `RunSidebar` and `RunsScreen` receive it for their `runSummary` calls. The component keeps working when the prop is omitted, like every injected prop.
- `generate()` targets `draftTarget(step)` instead of "first text output". The data path runs `parseDraft`, then the target's validator when resolvable. Any failure sets the error state with the message and writes nothing; success writes the parsed value with `{ generated: true }`.
- The generation error state becomes `{ stepId, message }`; the error line under the step shows the message, falling back to the current generic copy when absent (provider errors).
- The generate invite ("Generate draft / or write it yourself") and the Regenerate button key off `draftTarget(step)`, so data-only steps get the same generation affordances text steps have today. "Write it yourself" on a data target lands in the existing raw JSON editor path.
- The "AI draft" badge in `OutputView` drops its text-only restriction; a generated data value badges the same way until hand-edited (`isOutputGenerated` already supports this).
- Per-output validation feedback: `ProcessRolodex` computes the message for present values and passes an optional `invalid` string to `OutputView`, which renders an error line under the output. Validators never enter `OutputView` itself.

## Demo and definitions

- `definitions/presales.json`: the two structured steps (Requirements table, Win Themes cards) gain `aiPrompt` text describing the expected JSON shape, and `validate` names.
- `examples/demo/src/App.jsx`: passes a small `validators` map implementing those two names (array-of-objects shape checks with the keys the renderers expect).
- `examples/demo/src/drafts.js`: canned JSON drafts (strings) for those two steps; one wrapped in a code fence to exercise the tolerance.

## #50: runDisplayName and skipped subject sub-stages (decision, no code)

Decision: keep as is. `runDisplayName` keeps reading the subject output directly; `resolveSubject` keeps falling back while the subject's sub-stage is skipped. The asymmetry is deliberate: `resolveSubject` feeds content channels (draft prompts, the header line) where not-applicable content must not leak; the display name exists to identify the run in lists, and a typed subject is still the best identifier for a run whose subject sub-stage was later marked not applicable. Aligning would rename such runs to "Run N", making the runs list unstable for no content-hygiene gain. The comment block above `runDisplayName` gains one line documenting the asymmetry. The decision is recorded on #50 and the issue closed once the spec gate passes.

## Docs

Same-PR updates: core file header comment (validator concept, draft targets, budget options), root `README.md` and `packages/react/README.md` (validators prop, generation into data outputs), `CLAUDE.md` (architecture bullet for `validate` on output specs; key behaviors gain: consumer-supplied pure validators make a step with an invalid present value incomplete everywhere and are skipped when unresolvable; generation into data outputs parses strictly with single-fence tolerance and never writes on failure; serialization budget is configurable with a truncation marker). `npm run types` regenerates.

## Out of scope

- Per-step budget maps and any budgeting beyond the single knob.
- Built-in or async validators; validator functions in definitions.
- Persisting validation results in run state.
- Generation into `fields`, `file`, or `link` outputs.
- JSON tolerance beyond one surrounding fence (no JSON5, no repair).
- #55 (npm publish) and #8 (workflow explainer modal): separate work.

## Acceptance

- `npm test` passes with new engine tests: budget override and `Infinity` through all three functions; truncation marker presence and absence; inner-cap removal (a large data value survives intact under a big budget); `draftTarget` selection order; `parseDraft` passthrough, strict parse, fence tolerance, failure shape; validator-aware `isStepComplete` (done flag does not bless invalid, both gate types); `gateProgress` missing message format; aggregate and `advance` threading with force recording; `buildContext` exclusion of invalid steps; no behavior change when validators or options are omitted.
- In the demo: Generate draft on the presales Requirements step lands a parsed array in the table renderer with the AI draft badge; the fence-wrapped canned draft parses; hand-editing a structured output into an invalid shape blocks the boundary gate with "<step>: <message>" in the footer and force-advance still works; restoring a valid shape unblocks.
- `npm run build -w examples/demo` and `npm run types` pass.

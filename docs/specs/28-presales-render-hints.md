# spec: presales demo render hints on every output-bearing step

Issue: #28. PR #27 landed the rendering mechanism (render hints, the `data` output type, the `renderers` prop, built-in shape renderers, the FlowDiagram reference renderer), but the presales workflow only showcases it on the Solution Narrative and Demonstration cards. This spec puts a render hint on every output in the presales definition and reshapes the Pacific Ridge seed so every browsable card shows rendered views.

## Decisions

1. **Visualizations over drafting (user decision).** The presales demo showcases structured views even where that costs the Generate draft affordance. Four outputs convert from `text` to `data`; three of them lose drafting as a result.
2. **Frontier stays at Demonstration (user decision).** The seed keeps `idx: 4, frontier: 4`, the undone Demo Build step, and the unmet hybrid gate story from issue #12. No seed content is added for the five locked cards (Orals Prep, Delivery, Scope Definition, Estimation, SOW Draft). The issue's "all ten cards" acceptance narrows to all browsable cards.
3. **Dead `aiPrompt`s are removed.** Generate draft writes to a step's first `text` output (`ProcessRolodex.jsx`), so a step whose only output becomes `data` can never draft. The `aiPrompt` is removed from Requirements Extract, Win Themes, and Q&A Prep rather than left as config the UI cannot honor. Drafting is reintroduced if and when draft generation learns to target `data` outputs.
4. **Display-ready field keys (user decision).** The built-in KeyValue renderer prints object keys verbatim, so the Deal facts field keys are renamed to display strings: `client` -> `Client`, `industry` -> `Industry`, `dealSize` -> `Deal size`, `responseDue` -> `Response due`. `subject.field` and the seed object change with them. Keys double as labels, accepted for this demo definition; the long-term fix (a label-mapping option on KeyValue) is a separate react-package issue if wanted.
5. **Built-ins only.** No new custom renderers, no new dependencies, no changes to `@sqnce/core` or `@sqnce/react`. `flow` (already injected in the demo) stays the only non-built-in kind.

## Type conversions

| Step | Output | New type | Render hint | Value shape (normative for this definition) |
| --- | --- | --- | --- | --- |
| Requirements Extract (`requirements`) | `out` | `data` | `table` | array of `{ id, area, requirement, type }`, `type` is `Functional` or `Non-functional` |
| Win Themes (`win-themes`) | `out` | `data` | `cards`, options `{ "title": "name", "subtitle": "purpose" }` | array of `{ name, purpose }` |
| Q&A Prep (`qna`) | `out` | `data` | `cards`, options `{ "title": "question", "subtitle": "owner" }` | array of `{ question, answer, owner }` |
| Effort Estimate (`effort`) | `out` | `data` | `table` | array of `{ workstream, effort, confidence }` |

`aiPrompt` is removed from `requirements`, `win-themes`, and `qna` (decision 3). `effort` never had one. Q&A Prep and Effort Estimate are unseeded; their shapes are documented here so future content and future drafting have a contract.

`serializeStep` serializes `data` values into later draft prompts as capped JSON, so downstream drafted steps (alignment, architectures, fit-gap, narrative) still receive the requirements as context.

## Hint map (every output in `definitions/presales.json`)

| Sub-stage | Step.output | Type | Kind |
| --- | --- | --- | --- |
| Start | `intake.facts` | fields | `keyvalue` |
| Start | `rfp-upload.doc` | file | `markdown` |
| Start | `qualify.out` | text | `markdown` |
| RFP Review | `pain-points.out` | text | `markdown` |
| RFP Review | `requirements.out` | data (converted) | `table` |
| RFP Review | `customer-research.out` | text | `markdown` |
| RFP Review | `industry-research.out` | text | `markdown` |
| Solutioning | `product-alignment.out` | text | `markdown` |
| Solutioning | `functional-arch.out` | text | `markdown` |
| Solutioning | `technical-arch.out` | text | `markdown` |
| Solutioning | `fit-gap.out` | text | `markdown` |
| Proposal Draft | `win-themes.out` | data (converted) | `cards` |
| Proposal Draft | `exec-summary.out` | text | `markdown` |
| Proposal Draft | `solution-narrative.out` | text | `markdown` (already hinted) |
| Proposal Draft | `pricing-approach.out` | text | `markdown` |
| Demonstration | `demo-script.out` | text | `markdown` (already hinted) |
| Demonstration | `demo-data.file` | file | `markdown` |
| Demonstration | `demo-data.inventory` | data | `cards` (already hinted) |
| Demonstration | `demo-data.automations` | data | `flow` (already hinted) |
| Orals Prep | `deck.file` | file | `markdown` |
| Orals Prep | `qna.out` | data (converted) | `cards` |
| Delivery | `followups.out` | text | `markdown` |
| Scope Definition | `scope-statement.out` | text | `markdown` |
| Scope Definition | `assumptions.out` | text | `markdown` |
| Estimation | `effort.out` | data (converted) | `table` |
| Estimation | `pricing-model.out` | text | `markdown` |
| SOW Draft | `sow-doc.file` | file | `markdown` |

After this change all 27 outputs carry hints. Steps with no outputs (Demo Build, Demo Delivery, Legal Review) are checklist steps and stay untouched.

## Seed reshaping (`examples/demo/src/seeds.js`, presales-pursuit only)

Run shape (`idx`, `frontier`, `checkedDone` flags, which steps have content) does not change. Content reshapes to match the hints:

- `intake.facts`: same four values under the renamed keys.
- `rfp-upload.doc.content`: the requirements-document summary becomes a small markdown document (title heading, purpose line, bullet list of requirement areas).
- `qualify.out`: heading plus the go verdict and the four proof points as a list.
- `pain-points.out`: ranked ordered list under a short heading.
- `requirements.out`: the objectives paragraph becomes roughly 13 requirement rows `{ id, area, requirement, type }` (accounts/contacts unification, account relationships, lead capture, lead routing, one-action conversion, pipeline stages, pipe-spec quoting, approvals, territory, reporting and forecast, integrations, security and audit, mobile and offline).
- `customer-research.out` and `industry-research.out`: short markdown with headings and bullets.
- `product-alignment.out`: markdown with a pipe table mapping requirement areas to platform capabilities.
- `functional-arch.out` and `technical-arch.out`: markdown with headings and bullets.
- `fit-gap.out`: markdown with a pipe table (area, disposition, note) covering strong fits, lightweight additions, and out-of-scope items.
- `win-themes.out`: four objects `{ name, purpose }` from the existing numbered themes.
- `exec-summary.out`: short markdown, outcome-led paragraph plus bullets.
- `solution-narrative.out`: the flat paragraph becomes sections that match its existing markdown hint.
- `pricing-approach.out`: short markdown.
- `demo-data.file.content`: the inventory-summary paragraph becomes markdown bullets.
- `demo-script.out`, `demo-data.inventory`, `demo-data.automations`: already shaped, untouched.

Content stays Pacific Ridge Steel; this is reformatting, not rewriting facts.

## Artifact mirror

`examples/claude-artifact/process-rolodex.jsx` inlines the presales config: it receives the same hint additions, the four type conversions, the three `aiPrompt` removals, and the field-key and `subject.field` renames. No seed data exists in the artifact, so nothing else changes there.

## Out of scope

- Changes to `@sqnce/core` or `@sqnce/react`, including the KeyValue label option (possible follow-up issue).
- New dependencies anywhere.
- The other seven bundled workflows.
- Draft generation targeting `data` outputs.
- Seed content or frontier movement for the five locked cards.

## Acceptance

- Every output in the presales definition carries a `render` hint; `npm test` passes (bundled definition validation covers the converted outputs and hints).
- Browsing the five browsable presales cards with the seed shows rendered views on every output-bearing step; no raw-textarea-only steps remain on browsable cards.
- Generate draft still appears and works on every step that keeps a text output and an `aiPrompt`; the three converted steps show no draft button and no dead `aiPrompt` remains in the definition.
- The Deal facts card renders keyvalue rows with display-ready labels.
- `npm run build -w examples/demo` and the artifact esbuild syntax check pass.

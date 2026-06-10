# spec: output view fixes (binary attachment fallback, KeyValue labels)

Issues: #33 (file outputs with render hints render blank for binary attachments), #31 (KeyValue renderer label mapping).

Batch 5 of the spec series. This PR is parked at the spec-approval gate; implementation follows approval.

Both issues live in `@sqnce/react`'s output rendering path (`packages/react/src/OutputView.jsx`, `packages/react/src/renderers/KeyValue.jsx`) and both enforce the same fail-soft principle: hinted outputs never render blank or misleading. No `@sqnce/core` change.

## Assumes merged

Batches 1 to 4 (PRs #38, #39, #40, #41). This batch implements and merges only after batch 1: #10 (part of #38) deletes `examples/claude-artifact/`, so by implementation time there is no inlined artifact copy of `OutputView` or `KeyValue` to mirror, and the issue texts' "artifact esbuild check" acceptance items are replaced by the demo build check. This spec does not waive the CLAUDE.md sync rule; it sequences after the rule's removal. In the contingency that this batch is implemented while the artifact still exists in the tree, the sync rule applies as written and the artifact receives the same two fixes.

Batch 4's #19 touches the empty state of text outputs; #33 touches the view state of file outputs; the two changes are in disjoint branches of `OutputView`.

## #33: binary attachment fallback

### Problem mechanics (current code)

For non-text uploads the attach handler stores `{ name, content: "" }`. In `OutputView`, `filled` is true (a file value with a `name` has value), so a hinted file output mounts in view mode, and `viewValue` is `(value && value.content) || ""`: the renderer receives an empty string and renders an empty panel. Since #28 all four presales file outputs carry markdown hints, so any binary upload (PDF, PPTX, DOCX) hits this.

### Change

In view mode for `file` outputs, when the extracted content is empty (no `content` or whitespace-only), render the default file display (the attachment chip plus the Replace file button, the existing `DefaultEditor` file branch) instead of the renderer:

- The expand-overlay affordance only renders alongside the renderer, so it disappears in this state too.
- The separate "Replace file" view/edit toggle is redundant in this state (the default display already carries the button) and does not render.
- File values that do have extracted text (.md, .txt, .csv, .json uploads) keep today's behavior exactly: rendered content in view mode with the Replace file toggle.
- Read-only runs show the chip without the replace action, per the existing `readOnly` guards.

### Out of scope (from the issue)

- Any `@sqnce/core` change.
- Extracting text from binary formats.
- Other output types; text, data, fields, link are unaffected.

### Acceptance

- Attaching a PDF to a markdown-hinted file output shows the file chip, not a blank panel.
- Attaching a .md or .txt file still shows the rendered extracted content with the Replace file toggle.
- `npm test` and `npm run build -w examples/demo` pass.

## #31: KeyValue label mapping

### Problem

`KeyValue` prints raw object keys verbatim, so a value keyed `dealSize` displays as `dealSize`. #28 worked around it by renaming presales field keys to display strings ("Deal size"), making keys double as labels.

### Change

Two complementary mechanisms, per the issue:

1. Automatic, from the output spec: `KeyValue` starts reading its `spec` prop (the renderer contract already passes it). When the output is a `fields` spec, its declared `{ key, label }` pairs become row labels with zero configuration.
2. Explicit, via hint options: `render: { kind: "keyvalue", options: { labels: { dealSize: "Deal size" } } }` supplies labels for plain `data` objects, consistent with `cards` taking `title`/`subtitle` options.

Precedence per key: `options.labels` wins over `spec.fields` labels; both fall back to the raw key. Iteration order stays `Object.entries(value)` (render what is there, fail soft); labels are a lookup, never a filter or reorder, so unmapped keys show as-is and mapped-but-absent keys add nothing. The non-object fallback to the JSON tree is unchanged.

### Docs

`docs/render-kinds.md`: the `keyvalue` row in the built-in kinds table documents the `options.labels` contract and the automatic `spec.fields` labeling, including precedence.

### Recommended follow-up inside this batch: revert the #28 key rename

With label mapping in place, the presales workaround can be undone: field keys and `subject.field` go back to code-style keys (`dealSize`-style) in `definitions/presales.json`, display strings move into the specs' `labels`/`label` declarations, and `examples/demo/src/seeds.js` entries are renamed to match. The issue marks this optional ("or leave it, it is harmless"); this spec recommends doing it here so the rename workaround does not outlive the feature that obsoletes it. Droppable without affecting the rest of the batch.

### Acceptance

- A `fields` output with a `keyvalue` hint renders its declared labels with no options.
- `options.labels` relabels keys on `data` outputs; unmapped keys show as-is.
- `docs/render-kinds.md` documents the `options.labels` contract for `keyvalue`.
- If the key revert is approved: presales renders identically in the demo before and after the rename (labels unchanged, keys code-style), and seeded runs still resolve their subject.
- `npm test` and `npm run build -w examples/demo` pass.

## Sequencing

Independent changes; suggested order #33 then #31 (smallest first, then the renderer plus docs plus optional content change).

## Open questions for approval

1. The #28 key revert in presales and seeds: recommended in (see above), droppable. Approve or drop.

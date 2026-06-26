# Spec: reading-mode document font token (`--sqnce-font-read`)

Issue: [#97](https://github.com/sqnce/sqnce/issues/97). Downstream consumer:
`dawtips/presales-sqnce#134` (editorial reading theme).

## Context

`#80` shipped consumer theming through `--sqnce-*` design tokens, and reading mode
(`#78`) renders a finished run as a flat document. A consumer can already retint the
reading document independently of the authoring chrome through the reading-mode ink
token `--sqnce-ink-read`. There is no matching reading-mode font token. The two font
tokens that shipped are `--sqnce-font-ui` (the whole interface) and `--sqnce-font-mono`
(machine literals). Reading mode renders its document body in `--sqnce-font-ui`, the same
font as the rail, the buttons, and the chrome, so a consumer who wants the document to
read in a serif while the interface stays sans cannot express that: overriding
`--sqnce-font-ui` changes the chrome too, which is the opposite of the intent.

This is additive and backward-compatible. It adds one optional token whose default is the
interface font, so nothing changes unless a consumer opts in.

## Goal

Add a reading-mode document font token, `--sqnce-font-read`, that mirrors the existing
`ink-read` token plumbing exactly, and apply it to the reading-mode document body text
only (the prose and headings), leaving the machine labels, the contents rail, the nav
buttons, the authoring deck, and renderer-backed outputs untouched.

## Design

Three changes, all in `packages/react`. No engine change, no public component-prop
change, no new dependency.

### 1. Token declaration (the plumbing)

In `packages/react/src/ProcessRolodex.jsx`, the private design-token defaults live in a
single block declared on `.pf-root, .pf-root-tokens` (the selector is shared so a
body-portaled overlay carrying `.pf-root-tokens` gets the same defaults as the inline
shell). Immediately after the existing mono-font line:

```css
--sqnce-_font-mono: var(--sqnce-font-mono, 'IBM Plex Mono', monospace);
```

add one line that mirrors `--sqnce-_ink-read` exactly:

```css
--sqnce-_font-read: var(--sqnce-font-read, var(--sqnce-_font-ui));
```

A private property reads a public override and falls back to the private interface-font
token. With no override, the public `--sqnce-font-read` is unset, so the value resolves to
`var(--sqnce-_font-ui)`, which is byte-identical to what the document body inherits today.
This is the same fallback shape the shipped `--sqnce-_ink-read` and `--sqnce-_font-mono`
tokens already use, so the default-equivalence is guaranteed by the established token
mechanism, not by anything new.

### 2. Public token list

In `packages/react/src/themeTokens.js`, add `"font-read"` to `THEME_TOKENS` next to
`"font-ui"` and `"font-mono"`. `THEME_TOKENS` is the list of public token names that
`readThemeVars` surfaces as consumer overrides, and that `ThemeScope` mirrors onto
body-portaled overlays. Adding the name there makes a consumer's `--sqnce-font-read`
override visible to those paths, the same way every other public token is handled.

### 3. Application to the reading-mode document body (plain classes only)

In `packages/react/src/ProcessRolodex.jsx`, set `font-family: var(--sqnce-_font-read);` on
exactly the reading-mode classes that render the deliverable's prose and headings. These
classes currently set no `font-family` of their own and inherit `--sqnce-_font-ui` from
`.pf-root`. The classes:

- `.pf-read-title` (the document title, `h1`)
- `.pf-read-stage` (the main-stage heading, `h2`)
- `.pf-read-sub-name` (the sub-stage name, `h3`)
- `.pf-read-sub-desc` (the sub-stage description prose)
- `.pf-read-text` (plain prose output and a file's extracted text)
- `.pf-read-link` (a link output rendered as document content)
- `.pf-read-fields` (a fields output; its `dt`/`dd` inherit from this rule)
- `.pf-read-file` (the file-name line)

Left unchanged, so they stay exactly as today:

- `.pf-read-status` and `.pf-read-out-label`, which already set `font-family:
  var(--sqnce-_font-mono)` explicitly and so stay mono (the reading-mode structural
  labels).
- The contents rail (`.pf-read-rail`, `.pf-read-toc`) and the nav buttons
  (`.pf-read-navbtn`, `.pf-read-edit`), which keep inheriting `--sqnce-_font-ui` from
  `.pf-root` as chrome.
- The entire authoring deck.
- Renderer-backed outputs (the built-in markdown and table renderers, any consumer
  renderer). These are drawn by the renderer layer through `OutputView` and are out of
  scope here. A deliverable whose prose is authored as markdown therefore keeps the
  interface font in reading mode; that boundary is intentional and is addressed
  separately if a consumer needs it (see Non-goals).

This is the option chosen at the design gate: apply the token to the named plain document
classes only, the most surgical reading of the issue and the closest match to how
`ink-read` is applied (named class by named class). It carries no cascade into tables or
other rich outputs.

## Data flow

A consumer sets `--sqnce-font-read: <serif stack>` on the wrapping scope (`.pf-root` or
any ancestor, including a theme class). The private indirection
`--sqnce-_font-read: var(--sqnce-font-read, var(--sqnce-_font-ui))` resolves to the serif.
The eight reading-mode document-body rules read `var(--sqnce-_font-read)` and render in
the serif. The mono labels, rail, nav buttons, and authoring deck read their own font
tokens (`--sqnce-_font-mono` or the inherited `--sqnce-_font-ui`) and are unaffected. For
a body-portaled overlay, `ThemeScope` reads the consumer override via `readThemeVars`
(now including `font-read`) and re-declares the private defaults on `.pf-root-tokens`, so
the same resolution holds outside the inline tree.

## Error handling and edge cases

- No override set: `--sqnce-font-read` is unset, the fallback resolves to
  `--sqnce-_font-ui`, and reading mode renders exactly as today. This is the primary
  backward-compatibility guarantee.
- An invalid font value: a consumer-supplied `font-family` is plain CSS; an invalid value
  degrades the same way any bad `--sqnce-font-*` override would (the browser's
  font-family fallback), which is the consumer's responsibility and unchanged by this
  work.
- Overriding `--sqnce-font-ui` only: the document body still resolves through
  `--sqnce-_font-read`, whose default is `--sqnce-_font-ui`, so overriding the interface
  font alone moves the document body too (unchanged from today). Setting `font-read`
  is what decouples them.

## Testing

- Extend `packages/react/test/themeTokens.test.js` (run by `npm test` via the root
  script that globs `packages/react/test/*.test.js`):
  - assert `THEME_TOKENS.includes("font-read")`.
  - assert `readThemeVars` mirrors a set `--sqnce-font-read` (and, consistent with the
    existing test, does not mirror it when empty).
- The CSS default-equivalence (acceptance 1) and the per-class scoping (acceptance 2) are
  guaranteed by the custom-property fallback that the shipped `ink-read` and `font-mono`
  tokens already use, and are confirmed by reading the diff. A browser check is optional
  and not a gate; if run, serve the demo over local HTTP rather than `file:`.

## Acceptance (from the issue)

1. With no override, reading mode looks exactly as it does today (the default resolves to
   `font-ui`).
2. A consumer setting `--sqnce-font-read: <serif stack>` on the wrapping scope renders the
   reading-mode document body in that serif, while the rail, the controls, and the
   authoring deck stay on `font-ui`.
3. `font-read` appears in `THEME_TOKENS`.

## Non-goals

- Restyling renderer-backed outputs (markdown prose, data tables, custom renderers) in
  reading mode. If a consumer authors deliverable prose as markdown and wants the serif to
  reach it, that is a separate, additive follow-up (extend the reading-mode markdown body,
  or have the consumer's renderer copy read `--sqnce-_font-read`). It is deliberately out
  of scope here to keep the change surgical and predictable.
- Any change to sizes, spacing, or the mono token. Those already have tokens and are
  unaffected.
- A renderer package or any new public component prop.

## Layer separation

This is entirely UI-layer work in `@sqnce/react`: a CSS token and its application, plus a
public-token-list constant. `@sqnce/core` is untouched and stays dependency-free. No
definition schema change. No renderer or validator enters core.

## Gates

`npm test`, `npm run build -w examples/demo`, and `npm run types` (the type generation is
unaffected because no exported signature changes; CI runs the authoritative check).

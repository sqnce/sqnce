# spec: seed a mid-flight presales run (issue #12)

## Goal

The demo's four everyday workflows open mid-flight through seeded runs in
`examples/demo/src/seeds.js`; the four work workflows all start empty. Seed
`presales-pursuit` so a first-time visitor clicking Presales lands inside a
realistic, deep pursuit instead of a blank form.

## Content

The seed is the Pacific Ridge Steel Products, Inc. scenario, supplied verbatim
by the maintainer: a Western U.S. steel pipe manufacturer replacing
spreadsheet and email sales tracking with Dynamics 365 Sales, pursued through
a configuration-first demo strategy.

Run shape:

- `idx: 4, frontier: 4`: viewing "Demonstration", the fifth of presales'
  ten sub-stages.
- Every step from Opportunity Intake through Demo Data has output content
  (17 steps across Start, RFP Review, Solutioning, Proposal Draft, and
  Demonstration).
- "Demo Build", a required checklist step with no outputs, stays undone, so
  the Demonstration hybrid gate is unmet and the gate hint plus the explicit
  override stay visible, same teaching purpose as the car-buying seed.

## Change

One file, `examples/demo/src/seeds.js`:

1. Add the `"presales-pursuit"` entry to `SEEDS`, content verbatim from the
   maintainer, formatted to match the file's existing style.
2. Update the header comment: seeds no longer cover only the everyday
   workflows.

No engine, UI, definition, or test changes. `initialRunFor` already returns
any seed present and `createRun()` otherwise, so the remaining three work
workflows keep starting empty.

## Verification

- Step ids (`intake`, `rfp-upload`, `qualify`, `pain-points`, `requirements`,
  `customer-research`, `industry-research`, `product-alignment`,
  `functional-arch`, `technical-arch`, `fit-gap`, `win-themes`,
  `exec-summary`, `solution-narrative`, `pricing-approach`, `demo-script`,
  `demo-data`, `demo-build`) and output ids (`facts`, `doc`, `out`, `file`)
  match `definitions/presales.json`.
- `npm test` passes.
- `npm run build -w examples/demo` passes.

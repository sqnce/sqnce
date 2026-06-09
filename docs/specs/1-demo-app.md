# spec: demo showcase app

- Issue: [#1](https://github.com/sqnce/sqnce/issues/1)
- Date: 2026-06-09
- Status: awaiting owner approval

## Goal

A public showcase at https://sqnce.github.io/sqnce/ where the rolodex is the entire page. A first-time visitor lands inside a seeded, relatable workflow (buying a used car) already mid-flight: outputs filled, the frontier a few sub-stages in, a gate visibly unmet. They browse history, advance through a gate, generate a draft, and switch between eight bundled workflows grouped into Everyday and Work. The demo doubles as living documentation: it builds from workspace source, so engine or UI changes that break it fail CI on the same pull request.

## Non-goals

- npm publishing (issue #2). The header links to GitHub only; an npm link joins once packages publish.
- Engine changes. `@sqnce/core` is untouched.
- Root-URL deployment (a `sqnce.github.io` repo). The upgrade path stays open; nothing here closes it.
- Real LLM drafts or bring-your-own-key UI. Drafts are simulated (see Content).
- Per-main-stage gating, parallel or skippable sub-stages, TypeScript declarations (issues #4, #5, #6).

## Page shell: The Stage

New Vite React app at `examples/demo`, added to npm workspaces.

- Layout: a thin brand strip on top, the rolodex filling the remaining viewport, no page scroll on desktop.
- Strip content: `◫ sqnce` wordmark (IBM Plex Mono, gold mark), tagline "staged, gated workflows", and a GitHub link to the repo on the right.
- The component hardcodes `min-height: 100vh` on `.pf-root`. The demo stylesheet overrides it to `calc(100vh - 44px)` (the strip is fixed at 44px) with a comment stating it reaches into component internals on purpose. Demo-local only.
- Files: `index.html`, `vite.config.js` (`base: "/sqnce/"`), `src/main.jsx`, `src/App.jsx`, `src/seeds.js`, `src/drafts.js`, `src/demo.css`.
- Package: `sqnce-demo`, private, React 18, `@sqnce/react` resolved through the workspace. Definitions imported by relative path from `/definitions` (single source of truth, no copies).
- Persistence: localStorage under the key `sqnce-demo-v1`, storing the component's `{ activeId, runs }` shape. Returning visitors keep their state.

## New @sqnce/react props

Two optional props on `ProcessRolodex`. Both are no-ops when omitted; existing consumers see no behavior change.

### `workflowGroups`

`Array<{ label: string, ids: string[] }>`.

- When present and non-empty, the workflow switcher renders one labeled section per entry (small uppercase label above that group's buttons) instead of one flat row.
- Ids that match no workflow are ignored. Workflows referenced by no group render in a trailing unlabeled section.
- When omitted, the switcher renders exactly as today. The switcher stays hidden when only one workflow is passed, as today.

### `initialRunFor`

`(workflowId: string) => run`, defaulting to `createRun` from `@sqnce/core`.

- Used wherever the component currently falls back to `createRun()`: when a workflow has no entry in run state, and when the Reset control is clicked.
- Persisted runs always win; `initialRunFor` only fills absent entries. Reset therefore returns to the seed, not to empty.
- The returned object must be a valid run (`{ idx, frontier, stepState }`). The component already clamps `idx` and `frontier` against the definition's length; that clamping covers malformed seeds.

The demo uses `workflowGroups` for Everyday | Work and `initialRunFor` for seeding. Rejected alternative: injecting seeds through `persistence.load`, which leaves Reset wiping to an empty run and breaks the "reset returns to the seed" behavior.

## Content: definitions, seeds, drafts

### Four new everyday definitions in `/definitions`

| File | Name | Short | Subject | Stage arc |
|---|---|---|---|---|
| `car-buying.json` | Car Buying | Car | the car | Scope (needs, budget) > Search (research, shortlist, test drives) > Deal (financing, negotiation) > Close (inspection, paperwork, pickup) |
| `moving.json` | Moving | Move | the new place | Decide (needs, budget) > Hunt (search, viewings) > Commit (application, lease) > Move (logistics, settle in) |
| `trip-planning.json` | Trip Planning | Trip | the destination | Dream (destination, budget) > Book (transport, lodging) > Plan (itinerary, packing) |
| `meal-planning.json` | Meal Planning | Meals | the week | Plan (meals, list) > Shop (groceries) > Prep (cook ahead) |

Requirements for each: 3 to 4 main stages; a mix of hybrid and strict gates; every output type (`text`, `fields`, `file`, `link`) used at least once per definition; at least one checklist step (no outputs); unique step ids across the definition; `subject` configured with a sensible fallback; `validateDefinition` passes. Step ids carry a per-definition prefix (for example `car-intake`, not `intake`): run state is namespaced by workflow id so cross-definition collisions are technically harmless, but the demo's canned-draft map is keyed by step id alone and must stay unambiguous across all eight definitions.

### Seeds (`src/seeds.js`)

Run state keyed by workflow id, applied via `initialRunFor`.

- Car Buying: seeded deepest. Frontier 3 or 4 sub-stages in, prior outputs filled with a coherent story (one specific car), and the frontier sub-stage's gate visibly unmet so the gate hint and "Advance anyway" override show.
- Moving, Trip Planning, Meal Planning: lightly seeded, frontier 1 or 2 sub-stages in.
- The four business definitions (presales, hiring, onboarding, launch): no seeds, empty runs, grouped under Work.
- Default active workflow: Car Buying.

### Simulated drafts (`src/drafts.js`)

`generateDraft` is wired to a local function: roughly 600ms delay, then a prewritten, step-aware draft. A map from step id to draft text (with the resolved subject name spliced in) covers the steps a visitor will plausibly reach; a generic fallback covers the rest. A comment block in `App.jsx` shows how to replace it with a real LLM call.

## Build, deploy, CI, hygiene

- `.github/workflows/pages.yml`: on push to `main` and manual dispatch; Node 20, `npm ci`, `npm run build -w examples/demo`, `actions/configure-pages` (`enablement: true`), `actions/upload-pages-artifact` from `examples/demo/dist`, `actions/deploy-pages`. If token permissions reject enablement, Pages gets switched on once in repo settings (GitHub Actions source) and the workflow rerun.
- `ci.yml`: switch `npm install` to `npm ci`; add the demo build step so pull requests catch demo breakage.
- Commit `package-lock.json`. Add `.worktrees/` and `.superpowers/` to `.gitignore`.
- Tests: the bundled-definitions validation test must cover all eight definition files (extend the list if discovery is hardcoded). No React test runner exists in the repo; the new props are exercised by the demo build, and behavior is verified manually before the PR leaves draft.
- `examples/claude-artifact/process-rolodex.jsx`: gains the same `workflowGroups` and `initialRunFor` behavior (self-contained copy, kept in sync by design).
- README: live demo link near the top; `examples/demo` row in the packages table.
- CLAUDE.md: demo build command added to Commands.

## Acceptance criteria

1. `npm ci && npm test` passes; the validation test covers all eight definitions.
2. `npm run build -w examples/demo` succeeds from a clean install.
3. The Pages workflow deploys to https://sqnce.github.io/sqnce/ and the site loads with correct asset paths.
4. First visit lands in Car Buying mid-run with a visibly unmet gate at the frontier; Reset returns to the seed; state survives a reload.
5. The switcher shows Everyday and Work groups; all eight workflows are reachable; switching is non-destructive.
6. "Generate draft" produces a canned draft after a short delay on seeded-reachable text steps.
7. Omitting both new props leaves `ProcessRolodex` behavior identical to today.
8. The artifact example carries the same new behavior.
9. No em dashes anywhere; brand is lowercase `sqnce` throughout.

## Decisions log (brainstorm, 2026-06-09)

| Question | Decision |
|---|---|
| Audience | Showcase piece, landing-quality |
| Page structure | The Stage: rolodex is the page, thin brand strip |
| Seed strategy | Seeded mid-run, relatable everyday scenarios |
| Scenarios | All four: car buying, moving, trip planning, meal planning, as bundled definitions |
| Catalog | Grouped switcher (Everyday, Work) via new `workflowGroups` prop; Car Buying default |
| Repo split | Monorepo `examples/demo`; root-URL move stays open for later |
| Drafts | Simulated, step-aware canned text with subject splice |

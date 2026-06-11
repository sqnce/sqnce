# @sqnce/react

Rolodex UI for sqnce workflow definitions. The active sub-stage is centered and interactive; neighbors are faded; sub-stages beyond the frontier main stage are locked until its boundary gate is met (with an explicit override). Sub-stages declared skippable offer "Mark not applicable"; a skipped card stays in the deck, dimmed, with a Restore control. See the [repository README](../../README.md) for usage.

## Props

- `workflows` (required): array of sqnce definitions.
- `persistence` (optional): `{ load: async () => state | null, save: async (state) => void }` where state is the versioned run store `{ version: 2, activeWorkflowId, activeRunByWorkflow, entries }`. Anything that is not a version 2 store is discarded on load. Omit for in-memory runs.
- `generateDraft` (optional): `async (prompt, context) => string` where context is `{ workflowId, stepId, subject }`. The second argument is informational; single-argument implementations keep working. Omit to hide the draft action.
- `workflowGroups` (optional): array of `{ label, ids }` grouping the workflow switcher. Ids not matching a workflow are ignored; ungrouped workflows render in a trailing unlabeled section. Omit for a flat switcher.
- `initialRunFor` (optional): `(workflowId) => run`, seeds the inner run of a workflow's first entry and backs Reset; later runs start blank. Defaults to an empty run. Must be side-effect free.

## Bundler note

This package ships raw JSX (`.jsx` source, no build step). Vite and esbuild transform `.jsx` files in `node_modules` out of the box. webpack and Next.js typically do not transpile `node_modules`: add the package to your transpile list, for example `transpilePackages: ["@sqnce/react"]` in `next.config.js`, or an explicit babel-loader include.

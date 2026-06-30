# @sqnce/react

Rolodex UI for sqnce workflow definitions. The active sub-stage is centered and interactive; neighbors are faded; sub-stages beyond the frontier main stage are locked until its boundary gate is met (with an explicit override). Sub-stages declared skippable offer "Mark not applicable"; a skipped card stays in the deck, dimmed, with a Restore control. An About button in the header opens a read-only overview of the active workflow: its description, how its gates work, the full stage tree, and a you-are-here marker. See the [repository README](../../README.md) for usage.

## Props

- `workflows` (required): array of sqnce definitions.
- `persistence` (optional): `{ load: async () => state | null, save: async (state) => void }` where state is the versioned run store `{ version: 2, activeWorkflowId, activeRunByWorkflow, entries }`. Anything that is not a version 2 store is discarded on load. Omit for in-memory runs.
- `generateDraft` (optional): `async (prompt, context) => string` where context is `{ workflowId, stepId, subject, runId }`. The second argument is informational; single-argument implementations keep working. Omit to hide the draft action. Targets the step's first `text` output, else its first `data` output (JSON replies, parsed and validated before storing). A step marked `manual: true` shows no draft action.
- `validators` (optional): map of validator name -> `(value, spec, { run, stepId }) => string | null`, resolving `validate` names on output specs. A string return is the problem message: the step reads incomplete and generated drafts that fail are rejected. The third argument carries the run (read other steps with `getStepEntry`) and the stepId.
- `contextViews` (optional): map of context-view name -> `(value, spec, { run, sourceStepId, targetStepId }) => value`, resolving the `contextView` a step declares. When that step's draft prompt is built, each prior output's value passes through the named view, selecting what the step sees (selection at serialization, run state untouched, slice headers preserved). Pure functions; omit for full context.
- `workflowGroups` (optional): array of `{ label, ids }` grouping the workflow switcher. Ids not matching a workflow are ignored; ungrouped workflows render in a trailing unlabeled section. Omit for a flat switcher.
- `initialRunFor` (optional): `(workflowId) => run`, seeds the inner run of a workflow's first entry and backs Reset; later runs start blank. Defaults to an empty run. Must be side-effect free.

## Bundler note

This package ships raw JSX (`.jsx` source, no build step). Vite and esbuild transform `.jsx` files in `node_modules` out of the box. webpack and Next.js typically do not transpile `node_modules`: add the package to your transpile list, for example `transpilePackages: ["@sqnce/react"]` in `next.config.js`, or an explicit babel-loader include.

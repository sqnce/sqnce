# @sqnce/react

Rolodex UI for sqnce workflow definitions. The active sub-stage is centered and interactive; neighbors are faded; sub-stages beyond the frontier are locked until the gate is met (with an explicit override). See the [repository README](../../README.md) for usage.

## Props

- `workflows` (required): array of sqnce definitions.
- `persistence` (optional): `{ load: async () => state | null, save: async (state) => void }` where state is `{ activeId, runs }`. Omit for in-memory runs.
- `generateDraft` (optional): `async (prompt, context) => string` where context is `{ workflowId, stepId, subject }`. The second argument is informational; single-argument implementations keep working. Omit to hide the draft action.
- `workflowGroups` (optional): array of `{ label, ids }` grouping the workflow switcher. Ids not matching a workflow are ignored; ungrouped workflows render in a trailing unlabeled section. Omit for a flat switcher.
- `initialRunFor` (optional): `(workflowId) => run`, used when a workflow has no stored run and by Reset. Defaults to an empty run. Must be side-effect free.

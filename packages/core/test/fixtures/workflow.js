/*
 * Minimal definition owned by core's test suite, per
 * docs/specs/34-definitions-decoupling.md. Coverage floor: two main
 * stages, three sub-stages, both gate types, all five output types,
 * a render hint, a subject with field and fallback, required steps,
 * a checklist step, and an aiPrompt. Engine behavior tests assert
 * against this content, never against bundled definitions.
 */
export const FIXTURE = {
  id: "fixture",
  name: "Fixture Process",
  subject: { stepId: "intake", outputId: "facts", field: "client", fallback: "the account" },
  mainStages: [
    {
      id: "alpha",
      name: "Alpha",
      subStages: [
        {
          id: "start",
          name: "Start",
          description: "Collect the basics.",
          gate: { type: "hybrid" },
          steps: [
            {
              id: "intake",
              name: "Intake",
              required: true,
              outputs: [
                {
                  id: "facts",
                  type: "fields",
                  label: "Facts",
                  fields: [
                    { key: "client", label: "Client" },
                    { key: "industry", label: "Industry" },
                  ],
                },
              ],
            },
            { id: "kickoff", name: "Kickoff", required: true },
          ],
        },
        {
          id: "collect",
          name: "Collect",
          description: "Gather and summarize evidence.",
          gate: { type: "hybrid" },
          steps: [
            {
              id: "evidence",
              name: "Evidence",
              required: true,
              outputs: [
                { id: "doc", type: "file", label: "Document" },
                { id: "source", type: "link", label: "Source" },
              ],
            },
            {
              id: "summary",
              name: "Summary",
              aiPrompt: "Summarize the evidence.",
              outputs: [
                { id: "out", type: "text", label: "Summary", render: { kind: "markdown" } },
              ],
            },
            {
              id: "inventory",
              name: "Inventory",
              outputs: [{ id: "data", type: "data", label: "Inventory" }],
            },
          ],
        },
      ],
    },
    {
      id: "omega",
      name: "Omega",
      subStages: [
        {
          id: "signoff",
          name: "Sign-off",
          gate: { type: "strict" },
          steps: [
            {
              id: "approve",
              name: "Approve",
              required: true,
              outputs: [{ id: "memo", type: "text", label: "Memo" }],
            },
          ],
        },
      ],
    },
  ],
};

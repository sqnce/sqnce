# sqnce

A reusable framework for staged, gated workflows. Define a process as data, run it through a small pure engine, and visualize it as a rolodex that keeps the active sub-stage in focus while feeding each stage's outputs into the next.

**[Live demo](https://sqnce.github.io/sqnce/)**: all eight bundled workflows, seeded mid-run, drafts simulated, state in your browser's localStorage.

> "Let's create a sqnce for that."
>
> Pronounced "sequence". Spelled without the vowels so the name is actually yours.

A sqnce is a workflow definition: main stages, sub-stages within them, steps within those, and typed outputs per step. The engine and UI know nothing about any particular domain. The definitions bundled in `/definitions` are examples, not special cases: four from work (presales pursuit, hiring, customer onboarding, product launch) and four from life (car buying, moving, trip planning, meal planning).

## Architecture

```
DEFINITION (JSON, swap to run any process)
  MainStage[] -> SubStage[] -> Step[] -> Output spec[]
       |             |            |          |
       |             |            |          types: text | fields | file | link
       |             |            required steps drive the gate
       |             gate: { type: "hybrid" | "strict" }
       subject: which field names the thing the process is about

RUN (runtime state, separate from the definition)
  { idx, frontier, stepState: { [stepId]: { checkedDone, outputs } } }

ENGINE (@sqnce/core, pure functions, zero dependencies)
  flatten, completion, gate progress, browse/jump/advance,
  subject resolution, context serialization, draft-prompt building

UI (@sqnce/react)
  Rolodex: active sub-stage centered, neighbors faded,
  locked beyond the frontier, gated "Advance" with override
```

Core concepts:

- **Gate**: a sub-stage's required steps must be complete before the next sub-stage unlocks. Under a `hybrid` gate a step is complete when it has any output or is marked done; under `strict` it must be explicitly marked done. An "advance anyway" override is always available, so the gate guides rather than blocks.
- **Frontier**: the furthest committed sub-stage. Browsing back through history never loses your place; advancing the frontier is a deliberate action.
- **Output flow**: completed outputs from earlier sub-stages are serialized into context for later ones, including any LLM draft prompts.
- **Subject**: each definition declares which field names the thing the process is about (the client, the role, the customer, the product) so generated drafts reference it by name.

## Packages

| Package | What it is |
|---|---|
| `@sqnce/core` | The engine. Pure functions, no dependencies, no UI. |
| `@sqnce/react` | The rolodex component. React 18+, brings its own styles. |
| `/definitions` | Example workflow definitions as plain JSON. |
| `/examples/claude-artifact` | A fully self-contained version that runs as a claude.ai artifact, with Claude-powered draft generation and artifact storage persistence. |
| `/examples/demo` | The live demo app (Vite). Builds from workspace source. |

## Quickstart

```jsx
import { ProcessRolodex } from "@sqnce/react";
import presales from "../definitions/presales.json";
import hiring from "../definitions/hiring.json";

export default function App() {
  return (
    <ProcessRolodex
      workflows={[presales, hiring]}
      persistence={{
        load: async () => JSON.parse(localStorage.getItem("sqnce") || "null"),
        save: async (state) => localStorage.setItem("sqnce", JSON.stringify(state)),
      }}
      generateDraft={async (prompt) => {
        // Wire to any LLM provider. The engine builds the prompt,
        // including the subject and all completed prior outputs.
        const res = await fetch("/api/draft", { method: "POST", body: prompt });
        return res.text();
      }}
    />
  );
}
```

Both `persistence` and `generateDraft` are optional. Omit `persistence` for in-memory runs; omit `generateDraft` to hide the draft action entirely.

Using the engine without the UI:

```js
import {
  flattenSubStages, createRun, setOutput, gateProgress, advance,
} from "@sqnce/core";
import presales from "./definitions/presales.json" with { type: "json" };

const subs = flattenSubStages(presales);
let run = createRun();
run = setOutput(run, "intake", "facts", { client: "Ironclad Industries" });

console.log(gateProgress(subs[0], run)); // { met: false, missing: [...] }
const result = advance(run, subs);       // blocked until the gate is met
```

## Writing a definition

A definition is plain JSON. Minimal shape:

```jsonc
{
  "id": "my-process",
  "name": "My Process",
  "short": "MyProc",
  "subject": { "stepId": "intake", "outputId": "facts", "field": "client", "fallback": "the client" },
  "mainStages": [
    {
      "id": "stage-1",
      "name": "Stage One",
      "subStages": [
        {
          "id": "sub-1",
          "name": "First Sub-Stage",
          "description": "What this sub-stage accomplishes.",
          "gate": { "type": "hybrid" },
          "steps": [
            {
              "id": "intake",
              "name": "Intake",
              "required": true,
              "outputs": [
                { "id": "facts", "type": "fields", "label": "Facts",
                  "fields": [{ "key": "client", "label": "Client" }] }
              ]
            },
            {
              "id": "assessment",
              "name": "Assessment",
              "required": true,
              "aiPrompt": "Draft an assessment based on the intake facts.",
              "outputs": [{ "id": "out", "type": "text", "label": "Assessment" }]
            },
            { "id": "signoff", "name": "Sign-off" }
          ]
        }
      ]
    }
  ]
}
```

Rules of thumb: step ids must be unique across the whole definition; a step with no `outputs` is a checklist step completed by marking it done; `aiPrompt` is the task line injected into the generated draft prompt for that step's text output. Run `validateDefinition(def)` from `@sqnce/core` to check a definition's shape.

## Development

```
npm install
npm test
```

The engine has no build step and no dependencies; tests run on Node's built-in test runner (Node 20+).

## License

Apache-2.0. See [LICENSE](LICENSE).

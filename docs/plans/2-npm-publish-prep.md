# npm publish prep and declarations implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both packages manually publishable (#2, decision: document the raw-JSX constraint) and ship generated TypeScript declarations from JSDoc at pack time (#6, decision: option a), per docs/specs/2-npm-publish-prep.md.

**Architecture:** Manifest and LICENSE work first, then JSDoc typedefs in `packages/core/src/index.js` and a props typedef in `packages/react/src/ProcessRolodex.jsx`, then `tsc --emitDeclarationOnly` wired as `prepack` plus a CI step, then tarball-level verification in scratch projects. Requires batches 1 and 2 merged (the `StepEntry` typedef includes `reopened` and `generated`; `setOutput` carries the options argument).

**Tech Stack:** npm workspaces, `typescript` and `@types/react` as root devDependencies (pack/CI time only; core stays runtime-dependency-free), Vite for the scratch consumer.

---

### Task 1: manifests and LICENSE (#2)

**Files:**
- Create: `packages/core/LICENSE`, `packages/react/LICENSE` (copies of the root file)
- Modify: `packages/core/package.json`, `packages/react/package.json`

- [ ] **Step 1: Copy the license into each package**

```bash
cp LICENSE packages/core/LICENSE
cp LICENSE packages/react/LICENSE
```

(npm only auto-includes a LICENSE that lives in the package folder.)

- [ ] **Step 2: Update `packages/core/package.json`**

Add these fields (keep every existing field; `types`, `exports`, `files`, and `scripts` reach their final form in Task 4):

```json
"publishConfig": { "access": "public" },
"homepage": "https://github.com/sqnce/sqnce#readme",
"bugs": { "url": "https://github.com/sqnce/sqnce/issues" }
```

- [ ] **Step 3: Update `packages/react/package.json`**

Same three fields as core, plus loosen the core range:

```json
"dependencies": { "@sqnce/core": "^0.1.0" }
```

- [ ] **Step 4: Verify and commit**

Run: `npm install && npm test && npm run build -w examples/demo`
Expected: lockfile updates for the range change; everything green.

```bash
git add -A
git commit -m "publish: publishConfig, homepage, bugs, per-package LICENSE, ^0.1.0 core range (#2)"
```

### Task 2: document the raw-JSX constraint (#2, decision a)

**Files:**
- Modify: `packages/react/README.md`
- Modify: `README.md` (Quickstart section)

- [ ] **Step 1: Add an install note to `packages/react/README.md`**

Append after the Props section:

```markdown
## Bundler note

This package ships raw JSX (`.jsx` source, no build step). Vite and esbuild transform `.jsx` files in `node_modules` out of the box. webpack and Next.js typically do not transpile `node_modules`: add the package to your transpile list, for example `transpilePackages: ["@sqnce/react"]` in `next.config.js`, or an explicit babel-loader include.
```

- [ ] **Step 2: Add the same note to the root README**

In `README.md`, directly after the Quickstart code block's trailing paragraph ("Both `persistence` and `generateDraft` are optional. ..."), add:

```markdown
`@sqnce/react` ships raw JSX. Vite and esbuild consumers work out of the box; webpack/Next.js consumers add `transpilePackages: ["@sqnce/react"]` (or a babel-loader include) because bundlers usually skip transpiling `node_modules`.
```

- [ ] **Step 3: Commit**

```bash
git add packages/react/README.md README.md
git commit -m "docs: raw JSX bundler note for @sqnce/react (#2)"
```

### Task 3: JSDoc typedefs in core (#6)

**Files:**
- Modify: `packages/core/src/index.js`

- [ ] **Step 1: Add the typedef block**

Insert after the file's header comment, before the first export:

```js
/**
 * @typedef {Object} RenderHint
 * @property {string} kind
 * @property {Object<string, any>} [options]
 */
/**
 * @typedef {Object} FieldSpec
 * @property {string} key
 * @property {string} label
 */
/**
 * @typedef {Object} OutputSpec
 * @property {string} id
 * @property {"text"|"fields"|"file"|"link"|"data"} type
 * @property {string} [label]
 * @property {FieldSpec[]} [fields]
 * @property {RenderHint} [render]
 */
/**
 * @typedef {Object} Step
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {boolean} [required]
 * @property {string} [aiPrompt]
 * @property {OutputSpec[]} [outputs]
 */
/**
 * @typedef {Object} Gate
 * @property {"hybrid"|"strict"} type
 */
/**
 * @typedef {Object} SubStage
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {Gate} [gate]
 * @property {Step[]} [steps]
 */
/**
 * @typedef {Object} MainStage
 * @property {string} id
 * @property {string} name
 * @property {SubStage[]} subStages
 */
/**
 * @typedef {Object} SubjectSpec
 * @property {string} stepId
 * @property {string} outputId
 * @property {string} field
 * @property {string} [fallback]
 */
/**
 * @typedef {Object} Definition
 * @property {string} id
 * @property {string} name
 * @property {string} [short]
 * @property {SubjectSpec} [subject]
 * @property {MainStage[]} mainStages
 */
/**
 * @typedef {SubStage & { mainId: string, mainName: string, mainIndex: number, subIndex: number }} FlatSubStage
 */
/**
 * @typedef {Object} StepEntry
 * @property {boolean} checkedDone
 * @property {Object<string, any>} outputs
 * @property {boolean} [reopened]
 * @property {Object<string, true>} [generated]
 */
/**
 * @typedef {Object} Run
 * @property {number} idx
 * @property {number} frontier
 * @property {Object<string, StepEntry>} stepState
 */
/**
 * @typedef {Object} GateProgress
 * @property {boolean} met
 * @property {number} done
 * @property {number} total
 * @property {"hybrid"|"strict"} gateType
 * @property {string[]} missing
 */
/**
 * @typedef {Object} AdvanceResult
 * @property {Run} run
 * @property {boolean} advanced
 * @property {string[]} missing
 */
/**
 * @typedef {Object} RunEntry
 * @property {string} id
 * @property {string} workflowId
 * @property {string} name
 * @property {"active"|"archived"} status
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {Run} run
 */
/**
 * @typedef {Object} RunStore
 * @property {number} version
 * @property {string|null} activeWorkflowId
 * @property {Object<string, string>} activeRunByWorkflow
 * @property {Object<string, RunEntry>} entries
 */
```

- [ ] **Step 2: Annotate every exported function**

Add these `@param`/`@returns` lines to each function's existing doc comment (create a doc comment where none exists; keep all existing prose):

- `flattenSubStages`: `@param {Definition} definition` `@returns {FlatSubStage[]}`
- `validateDefinition`: `@param {Definition} definition` `@returns {string[]}`
- `createRun`: `@returns {Run}`
- `emptyStepEntry`: `@returns {StepEntry}`
- `getStepEntry`: `@param {Run} run` `@param {string} stepId` `@returns {StepEntry}`
- `setOutput`: `@param {Run} run` `@param {string} stepId` `@param {string} outputId` `@param {any} value` `@param {{ generated?: boolean }} [opts]` `@returns {Run}`
- `isOutputGenerated`: `@param {Run} run` `@param {string} stepId` `@param {string} outputId` `@returns {boolean}`
- `setCheckedDone`: `@param {Run} run` `@param {string} stepId` `@param {boolean} checkedDone` `@returns {Run}`
- `reopenStep`: `@param {Run} run` `@param {string} stepId` `@returns {Run}`
- `hasValue`: `@param {OutputSpec} spec` `@param {any} val` `@returns {boolean}`
- `stepHasAnyOutput`: `@param {Step} step` `@param {StepEntry} entry` `@returns {boolean}`
- `isStepComplete`: `@param {Step} step` `@param {StepEntry} entry` `@param {"hybrid"|"strict"} [gateType]` `@returns {boolean}`
- `gateTypeOf`: `@param {SubStage} subStage` `@returns {"hybrid"|"strict"}`
- `gateProgress`: `@param {SubStage} subStage` `@param {Run} run` `@returns {GateProgress}`
- `browse`: `@param {Run} run` `@param {FlatSubStage[]} subStages` `@param {number} direction` `@returns {Run}`
- `jumpTo`: `@param {Run} run` `@param {FlatSubStage[]} subStages` `@param {number} index` `@returns {Run}`
- `advance`: `@param {Run} run` `@param {FlatSubStage[]} subStages` `@param {{ force?: boolean }} [opts]` `@returns {AdvanceResult}`
- `resolveSubject`: `@param {Definition} definition` `@param {Run} run` `@returns {string}`
- `serializeStep`: `@param {FlatSubStage} subStage` `@param {Step} step` `@param {Run} run` `@param {{ maxChars?: number }} [opts]` `@returns {string|null}`
- `buildContext`: `@param {FlatSubStage[]} subStages` `@param {Run} run` `@param {number} uptoIdx` `@returns {string}`
- `buildDraftPrompt`: `@param {Definition} definition` `@param {FlatSubStage[]} subStages` `@param {Run} run` `@param {number} subIdx` `@param {Step} step` `@returns {string}`
- `createRunStore`: `@returns {RunStore}`
- `createRunEntry`: `@param {{ id: string, workflowId: string, run: Run, now: number }} init` `@returns {RunEntry}`
- `addRun`: `@param {RunStore} store` `@param {RunEntry} entry` `@returns {RunStore}`
- `renameRun`: `@param {RunStore} store` `@param {string} runId` `@param {string} name` `@param {number} now` `@returns {RunStore}`
- `archiveRun` and `unarchiveRun`: `@param {RunStore} store` `@param {string} runId` `@param {number} now` `@returns {RunStore}`
- `setActiveRun`: `@param {RunStore} store` `@param {string} runId` `@returns {RunStore}`
- `updateRunState`: `@param {RunStore} store` `@param {string} runId` `@param {Run} run` `@param {number} now` `@returns {RunStore}`
- `runsForWorkflow`: `@param {RunStore} store` `@param {string} workflowId` `@returns {RunEntry[]}`
- `activeRunEntry`: `@param {RunStore} store` `@param {string} workflowId` `@returns {RunEntry|null}`
- `deleteRun`: `@param {RunStore} store` `@param {string} runId` `@returns {RunStore}`
- `runSummary`: `@param {Definition} definition` `@param {Run} run` `@returns {{ met: number, total: number }}`
- `runDisplayName`: `@param {Definition} definition` `@param {RunStore} store` `@param {string} runId` `@returns {string}`

- [ ] **Step 3: Verify and commit**

Run: `npm test`
Expected: PASS (comments only).

```bash
git add packages/core/src/index.js
git commit -m "core: JSDoc typedefs and annotations for the public surface (#6)"
```

### Task 4: declaration emit wiring (#6)

**Files:**
- Create: `packages/core/tsconfig.declarations.json`, `packages/react/tsconfig.declarations.json`
- Modify: root `package.json`, `packages/core/package.json`, `packages/react/package.json`, `.gitignore`, `.github/workflows/ci.yml`, `CLAUDE.md`

- [ ] **Step 1: Create `packages/core/tsconfig.declarations.json`**

```json
{
  "compilerOptions": {
    "allowJs": true,
    "declaration": true,
    "emitDeclarationOnly": true,
    "outDir": "types",
    "rootDir": "src",
    "module": "esnext",
    "moduleResolution": "bundler",
    "target": "es2022",
    "strict": false,
    "skipLibCheck": true
  },
  "include": ["src/**/*.js"]
}
```

- [ ] **Step 2: Create `packages/react/tsconfig.declarations.json`**

Same as core plus JSX support and `.jsx` inclusion:

```json
{
  "compilerOptions": {
    "allowJs": true,
    "declaration": true,
    "emitDeclarationOnly": true,
    "outDir": "types",
    "rootDir": "src",
    "module": "esnext",
    "moduleResolution": "bundler",
    "target": "es2022",
    "jsx": "preserve",
    "strict": false,
    "skipLibCheck": true
  },
  "include": ["src/**/*.js", "src/**/*.jsx"]
}
```

- [ ] **Step 3: Root `package.json` devDependencies and orchestration script**

```json
"scripts": {
  "test": "node --test packages/core/test/*.test.js",
  "types": "npm run types -w packages/core && npm run types -w packages/react"
},
"devDependencies": {
  "@types/react": "^18.3.12",
  "typescript": "^5.7.2"
}
```

(Core must emit before react: react's declaration build resolves `@sqnce/core` through the workspace link's `types` field.)

- [ ] **Step 4: Package manifests, final form**

`packages/core/package.json` gains:

```json
"types": "./types/index.d.ts",
"exports": { ".": { "types": "./types/index.d.ts", "default": "./src/index.js" } },
"files": ["src", "types"],
"scripts": {
  "test": "node --test test/*.test.js",
  "types": "tsc -p tsconfig.declarations.json",
  "prepack": "npm run types"
}
```

`packages/react/package.json` gains the same `types`, `exports` (`"types"` condition first, `"default"` to `./src/index.js`), `files: ["src", "types"]`, and:

```json
"scripts": {
  "types": "tsc -p tsconfig.declarations.json",
  "prepack": "npm run types"
}
```

- [ ] **Step 5: Ignore the generated output**

Append to `.gitignore`:

```
packages/*/types/
```

- [ ] **Step 6: CI step**

In `.github/workflows/ci.yml`, after `- run: npm ci`, add:

```yaml
      - run: npm run types
```

In `CLAUDE.md`'s Commands section, add:

```markdown
- `npm run types` (generate .d.ts from JSDoc into packages/*/types; prepack runs it, CI checks it)
```

- [ ] **Step 7: Run the emit**

Run: `npm install && npm run types`
Expected: `packages/core/types/index.d.ts` and `packages/react/types/` exist; `index.d.ts` declares `createRun(): Run` etc. If tsc errors on a JSDoc type, fix the annotation (not the code) until clean.

Run: `npm test && npm run build -w examples/demo`
Expected: green (runtime untouched; `exports.default` still points at `src/`).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "publish: emit .d.ts from JSDoc at pack time, CI types check (#6)"
```

### Task 5: react props typedef (#6)

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx`

- [ ] **Step 1: Add the props typedef and param annotation**

Directly above the `export default function ProcessRolodex(...)` line:

```js
/**
 * @typedef {Object} ProcessRolodexProps
 * @property {import("@sqnce/core").Definition[]} workflows
 * @property {{ load: () => Promise<any>, save: (state: any) => Promise<void> }} [persistence]
 * @property {(prompt: string, context: { workflowId: string, stepId: string, subject: string }) => Promise<string>} [generateDraft]
 * @property {{ label: string, ids: string[] }[]} [workflowGroups]
 * @property {(workflowId: string) => import("@sqnce/core").Run} [initialRunFor]
 * @property {Object<string, import("react").ComponentType<any>>} [renderers]
 */

/** @param {ProcessRolodexProps} props */
```

- [ ] **Step 2: Re-emit and verify**

Run: `npm run types`
Expected: clean; `packages/react/types/ProcessRolodex.d.ts` types the props object.

- [ ] **Step 3: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "react: ProcessRolodex props typedef (#6)"
```

### Task 6: tarball verification (#2 acceptance)

Manual, nothing committed; results recorded in the PR conversation.

- [ ] **Step 1: Pack both and inspect file lists**

```bash
mkdir -p "$TMP/sqnce-pack"
npm pack -w @sqnce/core -w @sqnce/react --pack-destination "$TMP/sqnce-pack"
tar -tzf "$TMP/sqnce-pack/sqnce-core-0.1.0.tgz"
tar -tzf "$TMP/sqnce-pack/sqnce-react-0.1.0.tgz"
```

Expected contents, both: `package/package.json`, `package/README.md`, `package/LICENSE`, `package/src/**`, `package/types/**`. Nothing else (no `test/`, no tsconfig).

- [ ] **Step 2: Node smoke test of the core tarball**

```bash
mkdir -p "$TMP/sqnce-scratch-node" && cd "$TMP/sqnce-scratch-node"
npm init -y >/dev/null && npm pkg set type=module
npm install "$TMP/sqnce-pack/sqnce-core-0.1.0.tgz"
node -e "
import('@sqnce/core').then((core) => {
  const def = { id: 'x', name: 'X', mainStages: [{ id: 'm', name: 'M', subStages: [
    { id: 's1', name: 'S1', gate: { type: 'hybrid' }, steps: [{ id: 'a', name: 'A', required: true, outputs: [{ id: 'o', type: 'text' }] }] },
    { id: 's2', name: 'S2', steps: [] },
  ] }] };
  const subs = core.flattenSubStages(def);
  let run = core.createRun();
  if (core.advance(run, subs).advanced) throw new Error('gate should block');
  run = core.setOutput(run, 'a', 'o', 'done');
  const res = core.advance(run, subs);
  if (!res.advanced || res.run.frontier !== 1) throw new Error('advance failed');
  console.log('core tarball OK');
});
"
```

Expected: `core tarball OK`.

- [ ] **Step 3: Vite scratch app renders ProcessRolodex from the tarballs**

```bash
cd "$TMP" && npm create vite@latest sqnce-scratch-vite -- --template react
cd sqnce-scratch-vite && npm install
npm install "$TMP/sqnce-pack/sqnce-core-0.1.0.tgz" "$TMP/sqnce-pack/sqnce-react-0.1.0.tgz"
```

Replace `src/App.jsx` with:

```jsx
import { ProcessRolodex } from "@sqnce/react";

const def = {
  id: "scratch",
  name: "Scratch",
  subject: { stepId: "intake", outputId: "facts", field: "client", fallback: "the account" },
  mainStages: [
    {
      id: "m",
      name: "Main",
      subStages: [
        {
          id: "s1",
          name: "First",
          gate: { type: "hybrid" },
          steps: [
            {
              id: "intake",
              name: "Intake",
              required: true,
              outputs: [
                { id: "facts", type: "fields", label: "Facts", fields: [{ key: "client", label: "Client" }] },
              ],
            },
          ],
        },
        { id: "s2", name: "Second", steps: [{ id: "wrap", name: "Wrap up" }] },
      ],
    },
  ],
};

export default function App() {
  return <ProcessRolodex workflows={[def]} />;
}
```

Run: `npm run build` then `npm run dev`, open the page.
Expected: build succeeds (raw JSX in node_modules handled by Vite); the rolodex renders, the gate blocks Advance until the Client field is filled.

Run: `npm ls @sqnce/core`
Expected: a single top-level `@sqnce/core@0.1.0`, satisfying `@sqnce/react`'s `^0.1.0` by version, no nested duplicate.

- [ ] **Step 4: TypeScript consumer check**

In the scratch app:

```bash
cat > check.ts <<'EOF'
import { createRun, gateProgress, type Run } from "@sqnce/core";
import { ProcessRolodex } from "@sqnce/react";
const r: Run = createRun();
console.log(typeof gateProgress, typeof ProcessRolodex, r.idx);
EOF
npx tsc --noEmit --strict --moduleResolution bundler --module esnext --target es2022 --jsx react-jsx check.ts
```

Expected: exit 0; both packages resolve types from the tarballs.

- [ ] **Step 5: Record results on the PR**

Post a PR comment with the four results (file lists, node smoke, Vite render, tsc check).

### Task 7: record decisions on the issues, push

- [ ] **Step 1: Issue comments**

```bash
gh issue comment 2 --body "Decision (spec-approved in PR #40): ship raw JSX and document the constraint. Vite/esbuild consumers work out of the box; webpack/Next consumers add transpilePackages or a babel-loader include. Revisit precompiling at prepack at the first real webpack/Next consumer report. Also: core range loosened to ^0.1.0, publishConfig access public, per-package LICENSE copies."
gh issue comment 6 --body "Decision (spec-approved in PR #40): generate .d.ts from JSDoc at pack time (tsc allowJs + emitDeclarationOnly, typescript as a root devDependency). Types are not checked in; prepack emits them and CI runs npm run types so a JSDoc regression fails fast."
```

- [ ] **Step 2: Full checks and push**

Run: `npm test && npm run build -w examples/demo && npm run types`
Expected: green.

```bash
git push
```

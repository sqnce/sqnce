# ci pack-and-install job: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `docs/specs/58-ci-pack-install.md`: a `pack` CI job that packs both packages, asserts tarball contents, and verifies a scratch consumer can install and bundle against the tarballs.

**Architecture:** One new job in the existing `.github/workflows/ci.yml`, independent of the `test` job. All logic is inline shell in workflow steps; no scripts are added to the repo. The job's shell logic is rehearsed locally in Git Bash before pushing, because GitHub Actions cannot run locally.

**Tech Stack:** GitHub Actions (ubuntu-latest), npm workspaces, tar, esbuild.

**Worktree:** `.worktrees/58-ci-pack-install`, branch `58-ci-pack-install`, PR #59. Run all commands from the worktree root.

**Task tags:** every task is `inline` or `delegate: sonnet` per CLAUDE.md.

---

### Task 1: add the pack job [inline]

**Files:**
- Modify: `.github/workflows/ci.yml` (append a second job after `test`)

- [ ] **Step 1: Append the job**

Add to the end of `.github/workflows/ci.yml`, inside `jobs:`, after the `test` job, at the same indentation as `test`:

```yaml
  pack:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - name: Pack both packages
        run: |
          mkdir -p "$RUNNER_TEMP/tarballs"
          npm pack -w packages/core -w packages/react --pack-destination "$RUNNER_TEMP/tarballs"
      - name: Assert tarball contents
        run: |
          set -euo pipefail
          tarballs=("$RUNNER_TEMP"/tarballs/*.tgz)
          [ ${#tarballs[@]} -eq 2 ] || { echo "expected 2 tarballs, found ${#tarballs[@]}"; exit 1; }
          for t in "${tarballs[@]}"; do
            echo "== $t"
            files=$(tar -tzf "$t")
            echo "$files"
            for required in package/package.json package/LICENSE package/README.md package/types/index.d.ts; do
              echo "$files" | grep -qx "$required" || { echo "missing $required in $t"; exit 1; }
            done
            echo "$files" | grep -q "^package/src/" || { echo "missing src/ in $t"; exit 1; }
            if echo "$files" | grep -q "^package/test/"; then echo "test/ leaked into $t"; exit 1; fi
          done
      - name: Install tarballs into a scratch consumer and bundle
        run: |
          set -euo pipefail
          consumer="$RUNNER_TEMP/consumer"
          mkdir -p "$consumer"
          cd "$consumer"
          npm init -y
          npm install "$RUNNER_TEMP"/tarballs/*.tgz react react-dom esbuild --no-audit --no-fund
          node -e "import('@sqnce/core').then(m => { if (typeof m.createRun !== 'function') process.exit(1); })"
          printf 'import { ProcessRolodex } from "@sqnce/react";\nconsole.log(typeof ProcessRolodex);\n' > entry.jsx
          npx esbuild entry.jsx --bundle --format=esm --external:react --external:react-dom --outfile=/dev/null
```

- [ ] **Step 2: Rehearse the job's shell logic locally**

GitHub Actions cannot run locally; rehearse the same commands in Git Bash from the worktree root (`npm ci` equivalent already done by `npm install`):

```bash
export RUNNER_TEMP=$(mktemp -d)
mkdir -p "$RUNNER_TEMP/tarballs"
npm pack -w packages/core -w packages/react --pack-destination "$RUNNER_TEMP/tarballs"
tarballs=("$RUNNER_TEMP"/tarballs/*.tgz)
[ ${#tarballs[@]} -eq 2 ] && echo COUNT_OK
for t in "${tarballs[@]}"; do
  files=$(tar -tzf "$t")
  for required in package/package.json package/LICENSE package/README.md package/types/index.d.ts; do
    echo "$files" | grep -qx "$required" || { echo "missing $required in $t"; exit 1; }
  done
  echo "$files" | grep -q "^package/src/" || { echo "missing src/ in $t"; exit 1; }
  echo "$files" | grep -q "^package/test/" && { echo "test/ leaked"; exit 1; }
done
echo ASSERT_OK
consumer="$RUNNER_TEMP/consumer"
mkdir -p "$consumer" && cd "$consumer"
npm init -y
npm install "$RUNNER_TEMP"/tarballs/*.tgz react react-dom esbuild --no-audit --no-fund
node -e "import('@sqnce/core').then(m => { if (typeof m.createRun !== 'function') process.exit(1); })"
printf 'import { ProcessRolodex } from "@sqnce/react";\nconsole.log(typeof ProcessRolodex);\n' > entry.jsx
npx esbuild entry.jsx --bundle --format=esm --external:react --external:react-dom --outfile=/dev/null
echo REHEARSAL_OK
```

Expected: `COUNT_OK`, `ASSERT_OK`, `REHEARSAL_OK`, no errors. Note: the rehearsal of the loop body must not let the final `grep -q "^package/test/"` short-circuit the loop's exit status under `set -e` semantics; the workflow uses an explicit `if` for that check, the rehearsal uses `&&` whose false branch is the success path.

- [ ] **Step 3: Commit and push**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: pack job asserts tarball contents and a scratch consumer install (#58)"
git push
```

- [ ] **Step 4: Verify both CI jobs on the PR**

Run: `gh pr checks 59` (poll until complete)
Expected: `test` pass and `pack` pass. A failure in `pack` is a real finding: fix in the workflow file, rehearse, push again.

Then the Codex implementation loop (workflow step 9) takes over.

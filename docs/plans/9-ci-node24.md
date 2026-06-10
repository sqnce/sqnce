# ci Node 24 actions migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bump all GitHub Actions workflow action versions to Node-24-native tags so CI and Pages deploy runs produce no Node deprecation warnings before the June 16 enforcement date.

**Architecture:** Two workflow files each get their action version pins updated and their `node-version` input bumped from 20 to 24. No application code changes. No tests: CI is self-verifying (a green run with no warnings is the acceptance proof).

**Tech Stack:** GitHub Actions YAML

---

## File map

| File | Change |
|------|--------|
| `.github/workflows/ci.yml` | Bump `actions/checkout`, `actions/setup-node`; set `node-version: 24` |
| `.github/workflows/pages.yml` | Bump all five actions; set `node-version: 24` |

---

### Task 1: Update ci.yml

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Replace the file content**

Replace `.github/workflows/ci.yml` with:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build -w examples/demo
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: bump checkout and setup-node to v6, node-version to 24"
```

---

### Task 2: Update pages.yml

**Files:**
- Modify: `.github/workflows/pages.yml`

- [ ] **Step 1: Replace the file content**

Replace `.github/workflows/pages.yml` with:

```yaml
name: Deploy demo to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run build -w examples/demo
      - uses: actions/configure-pages@v6
        with:
          enablement: true
      - uses: actions/upload-pages-artifact@v5
        with:
          path: examples/demo/dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/pages.yml
git commit -m "ci: bump pages workflow actions to node24-native versions"
```

---

### Task 3: Push and verify

- [ ] **Step 1: Push the branch**

```bash
git push
```

- [ ] **Step 2: Watch the CI run**

```bash
gh run watch --repo sqnce/sqnce
```

Expected: the `CI` workflow run triggered by the push completes green with no "Node.js 20 actions are deprecated" annotations. The Pages deploy run is triggered only on merge to main, so it is verified post-merge.

- [ ] **Step 3: Confirm no Node deprecation annotations in the run log**

```bash
gh run view --repo sqnce/sqnce --log | grep -i "node.*deprecat" || echo "clean"
```

Expected output: `clean`

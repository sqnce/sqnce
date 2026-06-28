# Dev-workflow lifecycle (sqnce)

An issue-driven, spec-first lifecycle. Every authored artifact (the spec, the plan, the
code) gets an independent second-model review by Codex before it advances. The GitHub
issue number is the spine: it names the spec file, the branch, the commit subjects, and
the PR.

The authored stages run on the `superpowers` skills, the methodology layer; the table
below maps each stage to its skill. The repo's own rules (the issue-number spine, the
paths, the Codex loop) override a skill's defaults where they differ. Requires the
`superpowers` plugin and the Codex plugin; new-machine setup is in `.claude/SETUP.md`.

This file mirrors the canonical version in `presales-sqnce/.claude/dev-workflow.md`. Two
presales stages do not apply here and are marked inline: graphify orientation and the
post-merge graph refresh (sqnce has no committed graph yet), and the graded-eval
re-baseline (sqnce has no eval pipeline).

## The Codex review loop

At each authored artifact, run `/codex:review --wait --base main` on the committed branch
diff for an independent review, address the findings, and re-run it until a pass returns
no medium-or-higher findings. Each run re-reviews the whole diff from scratch, so every
pass is fresh and catches issues a confirming re-read would miss, including ones the fixes
themselves introduce. The loop ends on the first pass with no medium-or-higher findings:
if that pass is low-only, fix the low findings in place but do not run another review; if
it is zero findings, you are done.

`/codex:review` is review-only by construction: it reports findings and never edits files.
Drive each pass with `superpowers:requesting-code-review`, act on the findings with
`superpowers:receiving-code-review`, and apply every fix yourself. Claude runs this loop
automatically as part of the agreed process, without pausing to ask; it is not a
stop-time gate. For an approach-challenge pass, `/codex:adversarial-review` takes the same
flags plus a focus string.

**Reviews use your global Codex config, not per-call model pins.** The model and reasoning
effort for `/codex:review` come from each machine's `~/.codex/config.toml`. The command
accepts a model via `-m`, but pin one only if the local Codex auth actually exposes it: a
ChatGPT-account Codex does not offer every model ID — for example `gpt-5.3-codex` is
unavailable there (that account exposes `gpt-5.5`, `gpt-5.4`, and `gpt-5.3-codex-spark`).
Reasoning effort is global-only for `/codex:review` and `/codex:adversarial-review` — they
read `model_reasoning_effort` from the config. Keep that global at **`medium`** (the
default; it is shared with interactive coding). To run a **deeper adversarial review at
`xhigh`**, do NOT raise the global — that also raises coding, and an interrupted edit can
leave it stuck at the wrong tier — instead use the per-call argument on the Codex `task`
path, which honours the effort you pass: `codex task --effort xhigh --prompt-file
<review-prompt>` with **no `--write`** so it runs read-only (review-only).

## One human gate

Only one step pauses for a human: the owner approves the spec on the draft PR (between
steps 5 and 6). The squash-merge to main is autonomous and durably authorized, gated only
on CI going green and the code-review loop returning no medium-or-higher findings (step
10). Everything else is autonomous too: the review loops, the commits, the test runs, the
merge itself, the branch cleanup. Do not present option forks for non-gate decisions; pick the
sensible default and proceed.

## Superpowers skills, the methodology layer

| Lifecycle stage (step) | superpowers skill | repo-specific override |
|---|---|---|
| Start of any task | `using-superpowers` | none |
| Issue framing and spec (1, 3) | `brainstorming` | spec at `docs/specs/<#>-<slug>.md`, issue-numbered |
| Worktree and branch (3) | `using-git-worktrees` | branch `<#>-<slug>`, created when the spec work starts |
| Implementation plan (6) | `writing-plans` | plan at `docs/plans/<#>-<slug>.md`; a working artifact removed before the code review, never on main |
| Implement (9) | `test-driven-development`, then `executing-plans` or `subagent-driven-development`; `systematic-debugging` for failures | the repo gates are the tests |
| Parallel independent tasks | `dispatching-parallel-agents` | none |
| Review each artifact (4, 7, 10) | `requesting-code-review`, `receiving-code-review` | the reviewer is Codex, review-only (see the loop above) |
| Before claiming done (10) | `verification-before-completion` | run the gates; never claim green without the output |
| Merge (10) | `finishing-a-development-branch` | squash-merge with the `(#<issue>)` subject; owner gate |
| Authoring a new skill | `writing-skills` | none |

## Lifecycle

1. **Frame the work as a GitHub issue.** The issue number is the spine: it names the spec
   (`docs/specs/<#>-<slug>.md`, sometimes multi-issue such as `49-50-...`), the branch
   (`<#>-<slug>`), and the squash-merge subject's trailing `(#<issue>)`; the squash also
   appends the PR number, so feature merges read `... (#<issue>) (#<pr>)`. Then explore
   intent, requirements, and design with `superpowers:brainstorming` (one question at a
   time, two or three approaches, design approval). Its hard gate forbids any
   implementation before the design is approved.
2. **Orient before touching code.** _(graphify deferred in sqnce: no committed graph yet.
   Read `CLAUDE.md` and the relevant source. To enable this step, generate a committed
   graph with `graphify`, then prefer `graphify query "<question>"`, with `path` and
   `explain`, before reading raw source.)_
3. **Write the spec to `docs/specs/<#>-<slug>.md`.** This is the design-doc output of
   `superpowers:brainstorming` (architecture, components, data flow, error handling,
   testing, plus the spec self-review). The spec is design, not the plan; implementation
   steps belong in the step-6 plan. Respect the layer separation in `CLAUDE.md` (pure JSON
   definitions, a pure dependency-free engine, all rendering in the UI). Start the worktree
   and branch now and commit the spec on the branch (`docs(spec): ...`), so the step-4
   review reads a committed branch diff and the spec is never left uncommitted on main.
   (`git worktree add -b <#>-<slug> <path> main`.) Use `superpowers:using-git-worktrees`.
4. **Codex spec-review loop.** Run the Codex review loop (above) on the committed spec.
   This comes after the spec is written and before the adversarial review.
5. **Adversarial spec review.** Independently verify every codebase claim in the spec
   against the source: assume it is wrong until each claim is confirmed.

> **Spec-de-risking spike, conditional, after step 5, before approval.** Steps 4 and 5 are
> static: the Codex loop checks the spec's internal logic, the adversarial review checks
> its codebase claims; neither tests whether the system will actually behave as the spec
> assumes. When the spec's correctness rests on a behavioral or empirical assumption (a new
> engine rule firing as intended, a cross-stage interaction, a renderer or validator
> contract), prototype a throwaway slice (`docs/spikes/<#>-<slug>.md`), test it on a real
> fixture before approval, and attach the writeup to the draft PR so the owner approves
> with evidence. A failed assumption means revise the spec and re-run steps 4 and 5. This
> is distinct from step 9's implementation-approach spike.

> **Draft PR, then the spec-approval gate, between steps 5 and 6.** Once the spec clears
> the Codex loop, the adversarial review, and any spike, push the branch and open a draft
> PR so the owner can review it on GitHub (the PR must exist before approval). The owner
> approves the spec on the draft PR; only then does the plan (step 6) proceed. The spec is
> the branch's first commit; the plan and implementation add commits to the same branch and
> PR; step 10 marks the draft ready and squash-merges.

6. **Write the implementation plan to `docs/plans/<#>-<slug>.md`.** The how, using
   `superpowers:writing-plans`: bite-sized TDD steps with exact paths, real code, exact
   commands and their expected output, and frequent commits, no placeholders. The plan is a
   separate artifact from the spec and a working artifact: committed on the branch so steps
   7 and 8 can read it and to track execution, then removed before the step-10 code review
   so it never reaches main. Because the merge is a squash, only the branch's final snapshot
   lands on main, so a plan removed before the merge never appears there. Once the change is
   built, the code is the source of truth; the spec and any spike stay on main, only the plan
   is dropped.
7. **Codex plan-review loop.** Run the Codex review loop on the committed plan.
8. **Adversarial plan review.** Verify the plan the same way as the spec (step 5).
9. **Implement and test.** Continue on the branch. Respect the architecture in `CLAUDE.md`:
   the engine stays pure and dependency-free (`@sqnce/core`), new UI goes in `@sqnce/react`
   or a new package, and renderers and validators never enter core except as arguments.
   Spike first when risky (`docs/spikes/<#>-<slug>.md`); this is the implementation-approach
   spike. Per-PR gates: `npm test`, `npm run build -w examples/demo`, and `npm run types`
   (regenerate the `.d.ts`; CI checks they are committed); CI re-runs these and must be
   green. _(No eval re-baseline in sqnce.)_ Execute with
   `superpowers:test-driven-development`, then `executing-plans` or
   `subagent-driven-development`; use `systematic-debugging` for failures and
   `verification-before-completion` before claiming any gate green (run the command, confirm
   the output). If a gate cannot run locally, say so and name where it will run, for example
   CI.
10. **Drop the plan, then the Codex code-review loop, then PR.** With implementation done,
    remove the plan in a single commit (`git rm docs/plans/<#>-<slug>.md`, subject
    `chore: drop plan before merge, code is the source of truth`), so it never reaches main
    and the code review and the PR show only the code. Then run the Codex review loop on the
    branch diff, mark the draft PR ready, and squash-merge to main (subject: descriptive
    imperative plus trailing `(#<issue>) (#<pr>)`). Drive it with `superpowers:requesting-code-review`
    and `receiving-code-review`, run `verification-before-completion` before marking ready,
    and use `finishing-a-development-branch`. Squash-merge autonomously once CI is green and
    the code-review loop returns no medium-or-higher findings; this merge is durably
    authorized, so do not pause for approval. The plan's content stays in branch history;
    the spec and spike remain on main.
11. **Post-merge cleanup.** _(graphify refresh deferred in sqnce: once a committed graph
    exists, run `graphify update .` on main, the command is `graphify update <path>`, then
    commit the refreshed `graphify-out/graph.json` and `GRAPH_REPORT.md`.)_ Always clean up
    the merged branch: delete the remote branch (`git push origin --delete <#>-<slug>`),
    remove the worktree (`git worktree remove <path>`, then `git worktree prune`), and drop
    the local branch (`git branch -D <#>-<slug>`). Pairs with
    `superpowers:finishing-a-development-branch`.

## Codex plugin notes

- **Local, not committed.** `.codex/`, `.codex-companion/`, and `AGENTS.md` are local to
  the machine; gitignore them if Codex generates them here.
- **Manual, not stop-gated.** The review loop fires when the workflow runs `/codex:review`;
  there is no stop-time review gate in `settings.json`. Run `/codex:setup` on a new machine
  to confirm the local Codex CLI is ready.
- **Review-only.** `/codex:review` reports findings and never edits the artifact, so apply
  every fix yourself.

## Conventions observed in history

- **Conventional commits**: `feat(core):`, `docs(spec):`, `docs(claude):`, `chore(tests):`
  for chores, docs, and small feats; larger feature merges use a plain descriptive subject
  plus trailing `(#<issue>) (#<pr>)`.
- **Specs are one-per-change**, numbered by issue (`67-run-clone-primitive.md`,
  `62-63-64-run-aware-drafts.md`).
- **No em dashes anywhere** (code, comments, docs, commit messages, UI copy); brand is
  lowercase `sqnce` everywhere; license is Apache-2.0.

# Dev-workflow lifecycle (sqnce)

An issue-driven, spec-first lifecycle with a second-model (Codex) review loop at each
authored artifact: the spec, the plan, and the code. Every change is numbered by its
GitHub issue, and that number flows through the chain: spec filename, branch, commits,
and PR.

The authored stages run on the `superpowers` skills: `brainstorming` for the issue and
spec, `writing-plans` for the plan, `test-driven-development` plus `executing-plans` or
`subagent-driven-development` for the build, and the code-review and verification skills
for review and completion. Superpowers is the methodology layer. This lifecycle layers
the repo specifics on top (the issue-number spine and the Codex second-model review),
and the repo's own rules override a skill's defaults where they differ. The full mapping
is in "Superpowers skills, the methodology layer" below. Invoke the named skill at each
step.

This file is adapted from the canonical version in the sibling project,
`presales-sqnce/.claude/dev-workflow.md`. Two presales-only stages do not apply to sqnce
and are marked as such inline: the graded eval re-baseline (sqnce has no eval pipeline),
and graphify orientation plus the post-merge graph refresh (sqnce has no committed graph
at `graphify-out/` yet; generate one with `graphify` to turn those steps on).

**Codex review loop** means: invoke the Codex plugin manually (`/codex:rescue --fresh`)
for an independent review of the artifact, address its findings, then re-invoke as a
fresh, clean-slate review each iteration (`--fresh`, never `--resume`) until a pass
returns no medium-or-higher findings. Every iteration is fresh-eyes by design: a resumed
thread carries its own prior findings as context and is biased toward confirming them
resolved, so it can miss issues a clean-slate read catches, including ones the fixes
themselves introduce. The loop terminates on the first fresh pass that surfaces no
medium-or-higher findings, meaning zero findings or low-only. On a low-only terminating
pass, fix the low findings but do not run another review (a low fix does not earn a fresh
confirming pass). Driven by you, not an automated stop-time gate.

> **Termination and cost.** A fresh pass with no medium-or-higher findings is the exit
> condition. Re-loop only while a pass still returns a medium-or-higher finding. On the
> terminating pass: if it is low-only, fix those low findings in place but do not run
> another review, because a low fix does not warrant a fresh confirming pass, and
> re-reviewing every cosmetic touch-up is what spins the loop on never-ending polish; if
> it is zero-findings, you are done. `--fresh` re-reads the whole artifact every pass, so
> it costs more tokens per iteration than a resume. That is the deliberate price of
> independence.

> **Codex is review-only.** Codex is the independent second-model reviewer; it must only
> report findings and must not edit, create, or delete files. Drive each Codex pass with
> `superpowers:requesting-code-review`, act on the findings with
> `superpowers:receiving-code-review`, and apply every fix yourself, then confirm
> `git status` shows Codex changed nothing. (Pass `--wait` so the review runs in the
> foreground and returns its verdict; a backgrounded pass can lose the result.)
>
> **Operational guard (learned the hard way):** the `/codex:rescue` agent will edit and
> commit files unless the invocation explicitly frames it as report-only. State, in every
> invocation: "Review only, do not modify, create, or delete any files; report findings
> by severity." After each pass run `git status`; if Codex committed or changed anything,
> reset it before you act on the findings, so the reviewer stays independent of the fixer.

## Superpowers skills, the methodology layer

The `superpowers` plugin provides the how for each authored stage. Invoke the named skill
at each step; the repo's own rules (paths, the issue-number spine, the Codex loop)
override a skill's defaults where they differ.

| Lifecycle stage (step) | superpowers skill | repo-specific override |
|---|---|---|
| Start of any task | `using-superpowers` | none |
| Issue framing and design/spec (1, 3) | `brainstorming` | spec path `docs/specs/<#>-<slug>.md` (issue-numbered, not the skill's dated default) |
| Worktree before the branch (5 to 6) | `using-git-worktrees` | branch `<#>-<slug>`; `git worktree add -b <#>-<slug> <path> main` |
| Implementation plan (6) | `writing-plans` | plan path `docs/plans/<#>-<slug>.md` (issue-numbered, not the dated default); a working artifact deleted right before the merge (step 10), never lands on main |
| Implement (9) | `test-driven-development`, then `executing-plans` or `subagent-driven-development`; `systematic-debugging` for any failure | the `npm test`, `npm run build -w examples/demo`, and `npm run types` gates are the repo's tests |
| Parallel independent tasks | `dispatching-parallel-agents` | none |
| Review each artifact (4, 7, 10) | `requesting-code-review` (drive) plus `receiving-code-review` (act) | the reviewer is Codex, run review-only (see the Codex note above and the loop below) |
| Before claiming done or PR-ready (10) | `verification-before-completion` | run the repo gates; never claim green without the command output |
| Merge or branch completion (10) | `finishing-a-development-branch` | squash-merge with the `(#<issue>)` subject; pause for the owner at the merge gate |
| Authoring a new skill | `writing-skills` | none |

**Two human gates stand.** `brainstorming` ends at a design-approval gate, which this repo
folds into the owner's spec approval on the draft PR (between steps 5 and 6); the second
gate is merge-to-main (step 10). The superpowers skills run between those gates, never
through them.

> Requires the `superpowers` plugin (install once per machine:
> `/plugin install superpowers@claude-plugins-official`), the same way the Codex loop
> needs `/codex:setup`. See `.claude/SETUP.md`.

1. **Frame the work as a GitHub issue.** The issue number is the spine: it names the spec
   (`docs/specs/<#>-<slug>.md`, sometimes multi-issue, for example `49-50-...`), the
   branch, and the squash-merge subject's trailing `(#<issue>)`; the squash also appends
   the PR number, so feature merges read `... (#<issue>) (#<pr>)`. Commit subjects:
   conventional `type(scope):` for chores, docs, and small feats; larger feature merges
   use a plain descriptive subject plus the trailing numbers.
   Once the issue is framed, explore intent, requirements, and design with
   `superpowers:brainstorming` (one question at a time, propose two or three approaches,
   get design approval). Its hard gate forbids any implementation action before the design
   is approved.
2. **Orient before touching code.** _(graphify deferred in sqnce: there is no committed
   graph at `graphify-out/` yet. Until one exists, orient by reading `CLAUDE.md` and the
   relevant source. To enable this step, generate a committed graph with `graphify` and
   then prefer `graphify query "<question>"` for a scoped subgraph, with `path` and
   `explain` for relationships, before reading raw source.)_
3. **Write the spec to `docs/specs/<#>-<slug>.md`.** This is the design-doc output of
   `superpowers:brainstorming` (scaled sections: architecture, components, data flow,
   error handling, testing, plus the brainstorming spec self-review), saved to the repo's
   issue-numbered path rather than the skill's dated default. The spec is design, not the
   plan: implementation steps belong in the step-6 plan, not here. Respect sqnce's layer
   separation when writing it: the definitions are pure JSON, the engine (`@sqnce/core`)
   is pure and dependency-free, and the UI (`@sqnce/react`) holds all rendering; a spec
   must not blur those layers (see `CLAUDE.md`).
4. **Codex spec-review loop.** Run `/codex:rescue --fresh` on the spec for an independent
   second-model review, address findings, then re-review fresh (`--fresh`, a new thread
   each pass) until a fresh pass returns no medium-or-higher findings (then fix any low
   findings without re-reviewing, see the loop definition). This comes after the spec is
   written and before the adversarial review.
5. **Adversarial spec review.** Independently verify every codebase claim in the spec
   against the source: assume it is wrong until each claim is confirmed.

> **Spec-de-risking spike, conditional, after step 5, before approval.** Steps 4 and 5 are
> static: the Codex loop checks the spec's internal logic, the adversarial review checks
> its codebase claims; neither can test whether the system will actually behave as the
> spec assumes. When the spec's correctness rests on a behavioral or empirical assumption
> (a new engine rule firing as intended, a cross-stage interaction, a renderer or
> validator contract), run a spike (`docs/spikes/<#>-<slug>.md`) that prototypes a
> throwaway slice and tests it on a real fixture before the spec goes up for approval,
> then attach the writeup to the draft PR so the owner approves with evidence, not on
> faith. A failed assumption means revise the spec and re-run steps 4 and 5. This is
> distinct from step 9's implementation-approach spike and from the spec's post-build
> smoke (which verifies the shipped change, not the design).

> **Spec ready for review means worktree, branch, draft PR (between steps 5 and 6).** Once
> the spec clears the Codex loop (4) and the adversarial review (5), it is ready for the
> owner's review. The owner reviews on GitHub, so the PR must exist before approval, not
> after (approval is a human gate; "approve, then open the PR" is circular). Create a git
> worktree on a feature branch named for the issue (`<#>-<slug>`, per step 1), commit the
> spec (`docs(spec): ...`), push, and open a draft PR so the owner can review it on GitHub
> and the artifact is preserved locally and on the remote, never left uncommitted on
> `main` where it can be lost. **Approval gate:** the owner reviews and approves the spec
> on the draft PR; only after approval does the plan (6) proceed. The spec is the draft
> PR's first commit; the plan (6 to 8) and implementation (9) add commits to the same
> branch and PR, all in that worktree; step 9's feature branch off main is this same
> branch; step 10 marks the draft ready and squash-merges. (Mechanic: `git worktree add -b
> <#>-<slug> <path> main`, move the spec in, commit, `git push -u`, `gh pr create
> --draft`; the worktree keeps `main`'s working tree clean.) Use
> `superpowers:using-git-worktrees` to create the isolated workspace.

6. **Write the implementation plan to `docs/plans/<#>-<slug>.md`.** The how: the change
   broken into steps. Use `superpowers:writing-plans`: bite-sized (two to five minute) TDD
   steps with exact file paths, real code, exact commands and their expected output, and
   frequent commits; no placeholders. Saved to the repo's issue-numbered plan path rather
   than the skill's dated default. The plan is a separate artifact from the spec (the
   spec's `## Steps`, if any, is an outline, not the plan). The plan is a working artifact:
   it is committed on the branch so the Codex plan-review (7) and adversarial review (8)
   can read it and so it tracks execution, but it is deleted right before the squash-merge
   (step 10) and never lands on `main`. Once the change is built, the code is the source of
   truth, and a merged plan is stale how-to-build duplication. (Its content stays in branch
   history.) The spec (`docs/specs/`) and any spike (`docs/spikes/`) do stay on main as the
   design and the evidence; only the plan is dropped.
7. **Codex plan-review loop.** `/codex:rescue --fresh` reviews the plan, address, then
   re-review fresh (`--fresh`, a new thread each pass) until a fresh pass returns no
   medium-or-higher findings (then fix any low findings without re-reviewing, see the loop
   definition).
8. **Adversarial plan review.** Independently verify the plan the same way as the spec
   (step 5): assume it is wrong until confirmed.
9. **Implement and test.** Continue in the worktree and branch created when the spec went
   up for review (between steps 5 and 6); off main, squash-merged via PR. Respect sqnce's
   architecture: the engine stays pure and dependency-free (`@sqnce/core`), new UI work
   goes in `@sqnce/react` or a new package, and renderers and validators never enter core
   except as arguments (see `CLAUDE.md`). Spike first when risky
   (`docs/spikes/<#>-<slug>.md`); this is the implementation-approach spike (a build
   technique). The spec-de-risking spike that validates a design assumption runs earlier,
   after step 5. Per-PR gate: `npm test` (Node's built-in runner over the engine tests),
   `npm run build -w examples/demo` (the demo build CI runs on every PR), and `npm run
   types` (regenerate the `.d.ts`; CI checks they are committed). CI re-runs these and must
   be green. _(No eval re-baseline in sqnce: the presales graded-eval stage does not apply
   here.)_
   Execute the plan with `superpowers:test-driven-development` (failing test first) and
   `executing-plans` or `subagent-driven-development` (fresh subagent per task with review
   between tasks); use `systematic-debugging` for any failure rather than guessing; and
   `verification-before-completion` before claiming any gate green, meaning run the command
   and confirm the output, evidence before assertion. (If a repo gate cannot run in the
   current environment, say so plainly and name where it will run, for example CI; never
   claim a gate passed that you did not run. Example: `tsc` for `npm run types` may not be
   installed locally, so confirm the diff touches no exported signature as the local proxy
   and let CI run the real types check.)
10. **Codex pre-PR code-review loop, then PR.** Run `/codex:rescue --fresh` on the diff,
    address findings, then re-review fresh (`--fresh`, a new thread each pass) until a fresh
    pass returns no medium-or-higher findings (then fix any low findings without
    re-reviewing, see the loop definition); then mark the draft PR (opened when the spec
    went up for review, between steps 5 and 6) ready for review and squash-merge to main
    (subject: descriptive imperative plus trailing `(#<issue>)`; the squash appends the PR
    number).
    Drive the Codex code-review with `superpowers:requesting-code-review` and act on
    findings with `receiving-code-review` (Codex review-only, you apply the fixes); run
    `verification-before-completion` before marking the PR ready; and use
    `finishing-a-development-branch` to choose how the work integrates. The squash-merge to
    main is the owner's gate, pause for it.
    **Delete the plan after merge approval, immediately before the squash-merge.** The plan
    is a working artifact, but it stays on the branch through the owner's review of the
    ready PR: mark the PR ready with the plan still present, so the owner can read it while
    approving. Only once the owner approves the merge, and as the last commit before the
    squash-merge, `git rm docs/plans/<#>-<slug>.md` and commit (`chore: drop plan before
    merge, code is the source of truth`), push, then merge, so the squash does not carry the
    plan to main. The plan stays in branch history; the spec and spike remain. (Do not
    delete it before the PR is marked ready, nor before the owner approves the merge.)
11. **Post-merge orientation refresh.** _(graphify deferred in sqnce: skip until a committed
    graph exists. Once `graphify-out/` is generated and tracked, this step becomes required:
    on main, run `graphify update .` (the command is `graphify update <path>`, not `graphify
    --update`), then commit the refreshed tracked `graphify-out/graph.json` and
    `GRAPH_REPORT.md` to main as `chore(graphify): refresh committed graph after #<#>
    merge`.)_
    **Clean up the merged branch, always.** Once the merge has landed, delete the remote
    branch (`git push origin --delete <#>-<slug>`), remove its worktree (`git worktree
    remove <path>`, then `git worktree prune`), and drop the local branch (`git branch -D
    <#>-<slug>`). The work is on main as the squash commit; the feature branch and its
    worktree are disposable. (Pairs with `superpowers:finishing-a-development-branch`.)

## Codex plugin notes

- **Claude-primary, Codex-side auto-generated.** `.codex/`, `.codex-companion/`, and
  `AGENTS.md` are local, not committed (gitignore them if Codex generates them here).
- **Manual, not gated.** Review loops fire when you invoke `/codex:rescue --fresh` (always
  fresh, see the loop definition); there is no stop-time review gate wired in
  `settings.json`. Run `/codex:setup` on a new machine to confirm the local Codex CLI is
  ready (the stop-time gate stays off unless you turn it on).
- **Review-only.** Codex reports; it never edits the artifact. Apply every fix yourself and
  confirm `git status` shows Codex changed nothing (see the Codex-is-review-only note near
  the top). Pair it with `superpowers:requesting-code-review` (drive) and
  `receiving-code-review` (act with technical rigor, not performative agreement).

## Conventions observed in history

- **Conventional commits**: `feat(core):`, `docs(spec):`, `docs(claude):`,
  `chore(tests):` for chores, docs, and small feats; larger feature merges use a plain
  descriptive subject plus trailing `(#<issue>) (#<pr>)`.
- **Specs are one-per-change**, numbered by issue (`67-run-clone-primitive.md`,
  `62-63-64-run-aware-drafts.md`).
- **No em dashes anywhere** (code, comments, docs, commit messages, UI copy); brand is
  lowercase `sqnce` everywhere; license is Apache-2.0 (see `CLAUDE.md` Conventions).

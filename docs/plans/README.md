# docs/plans

Implementation plans, one per change, issue-numbered: `docs/plans/<#>-<slug>.md`. See
`.claude/dev-workflow.md` step 6.

A plan is a working artifact. It is committed on the feature branch so the Codex plan
review and the adversarial review can read it and to track execution, then removed in a
single commit before the step-10 code review. Because the merge is a squash, only the
branch's final snapshot reaches `main`, so a plan removed before the merge never lands
there and the code review sees only the code. Once the change is built, the code is the
source of truth. The plan's content stays in branch history. The spec (`docs/specs/`) and
any spike (`docs/spikes/`) remain on `main`; only the plan is dropped.

So this directory normally holds only this README on `main`; individual plans live and die
on their branches.

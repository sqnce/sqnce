# docs/plans

Implementation plans, one per change, issue-numbered: `docs/plans/<#>-<slug>.md`. See
`.claude/dev-workflow.md` step 6.

A plan is a working artifact. It is committed on the feature branch so the Codex plan
review and the adversarial review can read it, and it stays through the owner's review of
the ready PR. It is then deleted as the last commit before the squash-merge and never
lands on `main`: once the change is built, the code is the source of truth. The plan's
content stays in branch history. The spec (`docs/specs/`) and any spike (`docs/spikes/`)
do remain on `main`; only the plan is dropped.

So this directory normally holds only this README on `main`; individual plans live and die
on their branches.

# docs/spikes

Throwaway prototypes that de-risk a decision, one per spike, issue-numbered:
`docs/spikes/<#>-<slug>.md`. See `.claude/dev-workflow.md`.

Two kinds:

- **Spec-de-risking spike** (after step 5, before spec approval): when the spec's
  correctness rests on a behavioral or empirical assumption (a new engine rule firing as
  intended, a cross-stage interaction, a renderer or validator contract) that the static
  Codex and adversarial reviews cannot test, prototype a throwaway slice and run it on a
  real fixture, then attach the writeup to the draft PR so the owner approves with evidence.
- **Implementation-approach spike** (step 9): a build technique tried before committing to
  it.

Unlike plans, spikes stay on `main` as the evidence behind a design.

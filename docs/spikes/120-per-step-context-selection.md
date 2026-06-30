# spike: #120 per-step context selection, consumer-contract check

Throwaway slice run before spec approval, per the dev-workflow's conditional spec-de-risking
spike. The static reviews (Codex loop, adversarial) check the spec's internal logic and its
codebase claims; neither tests whether the proposed seam is actually consumable by the
blocking consumer (dawtips/presales-sqnce#39) without forking the `input-NNN` traceability
contract. This spike retires that one risk: it confirms the hook signature is sufficient and
that selection at serialization does not disturb the validators that read run-state materials.

## What was prototyped (then reverted)

A minimal version of the recommended seam (Option A) was wired into the worktree's
`@sqnce/core` and reverted after the run, so only this writeup survives on the branch:

- `serializeStep(subStage, step, run, { maxChars, view, targetStepId })`: when a `view`
  function is present, each output value passes through `view(value, spec, { run,
  sourceStepId, targetStepId })` before the presence check and formatting. The view's
  returned value is what gets serialized; core never parses the value.
- `buildContext(subStages, run, flatIdx, excludeStepId, { ..., views })`: the draft target is
  the excluded step. Core finds that step, reads its `contextView` name, resolves it against
  the consumer-supplied `views` map, and threads the bound function (plus the target step id)
  into every `serializeStep` call. An absent `views` map or an unresolvable name yields no
  view (full context, today's behavior).

The selection runs only on the local value being serialized; it never writes back to the run.

## Fixture

The real presales store, run `run-8b5518aa` (`~/dev/presales-sqnce/runs-data/store.json`),
against the real `definition/presales-pursuit.json`. The run carries a materials blob with two
ingested inputs (`input-001`, `input-002`, each under its `=== [input-NNN] file ===` header)
and a completed `findings` data output citing both via `source_refs`. The target step is
`narrative`, tagged with a `contextView` in a cloned definition.

The three consumer views and the run-aware findings validator were written ONLY against the
proposed signature, reusing presales' own `splitMaterials` / `checkSourceRefs` verbatim:

- `cited`: keeps only the inputs the findings step cited. Needs `run` (to read findings) and
  `sourceStepId` (to act on materials only, pass other outputs through).
- `retrieved`: keeps only a precomputed retrieved subset for the target step (here
  `narrative -> {input-001}`). Needs `targetStepId`.
- `suppressed`: returns `""` for the materials output, hiding it entirely.

Each view re-joins kept slices using the slice's original header bytes, so the
`=== [input-NNN] file ===` headers survive untouched.

## Result: all assertions pass

```
A full-context baseline (omitted views == today, byte-identical)         PASS
B cited view keeps exactly the findings-cited inputs                     PASS
C retrieved view keeps only the precomputed subset (input-002 dropped)   PASS
D suppressed view removes materials entirely                             PASS
E unresolvable view name is a no-op (full materials)                     PASS
F findings validator still passes (reads run, not the trimmed text)      PASS
G kept slice's input-NNN header bytes preserved                          PASS
```

## What this de-risks

1. **The signature is sufficient.** `(value, spec, { run, sourceStepId, targetStepId })`
   covers all three real views. `cited` needs `run` + `sourceStepId`; `retrieved` needs
   `targetStepId`; `suppressed` needs `sourceStepId`. None needed core to understand the
   header format, so the `input-NNN` convention stays entirely in the consumer.
2. **Validator independence holds (the core reason this belongs in core).** With the
   `retrieved` view dropping `input-002` from what `narrative` sees, the findings validator
   still reads the full, untouched `run.stepState["intake-materials"].outputs.materials` and
   passes. Selecting at serialization does not corrupt the validators, which is exactly what a
   pre-strip of run state would have done.
3. **No regression below the retrieval threshold.** An omitted `views` map produces a
   byte-identical context to today, and an unresolvable view name is a silent no-op.
4. **Headers preserved.** Kept slices carry their original `=== [input-NNN] file ===` bytes.

## Caveats / notes for the spec

- The view is applied to every prior output value for the target, so the consumer keys on
  `ctx.sourceStepId` to act on materials and returns other values unchanged. This generality
  is the price of not baking a "which output is materials" marker into core; the spec
  documents the pass-through expectation as part of the contract (the same trust model as
  validators and renderers: consumer-supplied, pure, must not throw).
- Selection happens before the `maxCharsPerStep` truncation, so a step that both selects and
  budgets gets "select, then truncate the selection". Presales runs with `Infinity`, so no
  truncation; the order is still the correct one.
- A non-string return for a non-text output is the consumer's responsibility; the view should
  return same-typed values and typically transform only the targeted output.

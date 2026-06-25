/*
 * Forked fixture owned by core's test suite, per
 * docs/specs/66-sub-branching.md. Coverage: a non-empty two-stage spine,
 * two tracks (demo optional, response required), both gate types, a
 * terminal per track, the subject in the spine, and a skippable sub-stage
 * inside a track. mainStages order: spine 0,1; demo 2,3,4 (terminal 4);
 * response 5,6,7 (terminal 7).
 */
export const FORKED = {
  id: "forked",
  name: "Forked Process",
  subject: { stepId: "intake", outputId: "facts", field: "client", fallback: "the account" },
  tracks: [
    { id: "demo", name: "Demo", optional: true },
    { id: "response", name: "Response" },
  ],
  mainStages: [
    { id: "intake-stage", name: "Intake", subStages: [
      { id: "intake-sub", name: "Intake", gate: { type: "hybrid" }, steps: [
        { id: "intake", name: "Intake", required: true, outputs: [
          { id: "facts", type: "fields", label: "Facts", fields: [
            { key: "client", label: "Client" }, { key: "industry", label: "Industry" }] }] }] }] },
    { id: "findings-stage", name: "Findings", subStages: [
      { id: "findings-sub", name: "Findings", gate: { type: "hybrid" }, steps: [
        { id: "findings", name: "Findings", required: true, outputs: [
          { id: "notes", type: "text", label: "Notes" }] }] }] },
    { id: "demo-script", name: "Script", track: "demo", subStages: [
      { id: "demo-script-sub", name: "Script", gate: { type: "hybrid" }, steps: [
        { id: "demoScript", name: "Script", required: true, outputs: [
          { id: "s", type: "text", label: "Script" }] }] }] },
    { id: "demo-build", name: "Build", track: "demo", subStages: [
      { id: "demo-build-sub", name: "Build", skippable: true, gate: { type: "hybrid" }, steps: [
        { id: "demoBuild", name: "Build", outputs: [{ id: "b", type: "text", label: "Build" }] }] }] },
    { id: "demo-qa", name: "Demo QA", track: "demo", subStages: [
      { id: "demo-qa-sub", name: "Demo QA", gate: { type: "strict" }, steps: [
        { id: "demoQa", name: "QA", required: true, outputs: [{ id: "q", type: "text", label: "QA" }] }] }] },
    { id: "resp-draft", name: "Draft", track: "response", subStages: [
      { id: "resp-draft-sub", name: "Draft", gate: { type: "hybrid" }, steps: [
        { id: "respDraft", name: "Draft", required: true, outputs: [{ id: "d", type: "text", label: "Draft" }] }] }] },
    { id: "resp-review", name: "Review", track: "response", subStages: [
      { id: "resp-review-sub", name: "Review", gate: { type: "hybrid" }, steps: [
        { id: "respReview", name: "Review", required: true, outputs: [{ id: "r", type: "text", label: "Review" }] }] }] },
    { id: "resp-signoff", name: "Sign-off", track: "response", subStages: [
      { id: "resp-signoff-sub", name: "Sign-off", gate: { type: "strict" }, steps: [
        { id: "respSignoff", name: "Sign-off", required: true, outputs: [{ id: "so", type: "text", label: "Sign-off" }] }] }] },
  ],
};

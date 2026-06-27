import { lazy } from "react";
import { ProcessRolodex } from "@sqnce/react";
import { getStepEntry } from "@sqnce/core";
import carBuying from "../../../definitions/car-buying.json";
import moving from "../../../definitions/moving.json";
import tripPlanning from "../../../definitions/trip-planning.json";
import mealPlanning from "../../../definitions/meal-planning.json";
import presales from "../../../definitions/presales.json";
import hiring from "../../../definitions/hiring.json";
import onboarding from "../../../definitions/onboarding.json";
import launch from "../../../definitions/launch.json";
import { initialRunFor } from "./seeds.js";
import { generateDraft } from "./drafts.js";

const STORAGE_KEY = "sqnce-demo-v1";

/* Vendorable reference renderer (React Flow + elkjs), lazy so the
   diagram stack stays out of the initial chunk. */
const FlowDiagram = lazy(() => import("./renderers/FlowDiagram.jsx"));
const RENDERERS = { flow: FlowDiagram };

const persistence = {
  load: async () => JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"),
  save: async (state) => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)),
};

const WORKFLOWS = [carBuying, moving, tripPlanning, mealPlanning, presales, hiring, onboarding, launch];

const GROUPS = [
  { label: "Everyday", ids: ["car-buying", "moving", "trip-planning", "meal-planning"] },
  { label: "Work", ids: ["presales-pursuit", "hiring-pipeline", "customer-onboarding", "product-launch"] },
];

/* Validators referenced by validate names in definitions/presales.json.
   A returned string is the problem message; null means valid. */
const validators = {
  requirements: (value) =>
    Array.isArray(value) && value.length > 0 && value.every((r) => r && typeof r === "object" && !Array.isArray(r))
      ? null
      : "Requirements must be a non-empty array of row objects.",
  "win-themes": (value, spec, ctx) => {
    if (!(Array.isArray(value) && value.length > 0 && value.every((t) => t && typeof t.name === "string" && typeof t.purpose === "string")))
      return "Win themes must be an array of { name, purpose } objects.";
    const reqEntry = ctx && ctx.run ? getStepEntry(ctx.run, "requirements") : null;
    const reqs = reqEntry && Array.isArray(reqEntry.outputs && reqEntry.outputs.out) ? reqEntry.outputs.out : [];
    const ids = new Set(reqs.map((r) => r && r.id));
    const bad = value.find((t) => t.requirement && !ids.has(t.requirement));
    return bad ? `Win theme "${bad.name}" references requirement ${bad.requirement}, which the requirements step does not define.` : null;
  },
};

/* Illustrative consumer derivation. sqnce stays content-agnostic; a real
   consumer derives its own verdict. For the presales workflow, read the
   fit-gap step's text and surface a coarse ACCEPT/REVISE word; other
   workflows get no status word. */
function runStatus({ def, run }) {
  if (def.id !== "presales-pursuit") return null;
  const e = getStepEntry(run, "fit-gap");
  const text = e && e.outputs && typeof e.outputs.out === "string" ? e.outputs.out : "";
  if (!text.trim()) return null;
  return /\bgap\b/i.test(text) ? { word: "REVISE", tone: "revise" } : { word: "ACCEPT", tone: "accept" };
}

function renderRunHeader({ def, run, complete }) {
  if (!complete) return null;
  const st = runStatus({ def, run });
  if (!st) return null;
  return <div className={`demo-verdict demo-verdict-${st.tone}`}>Readiness: {st.word}</div>;
}

/* Reference per-step badge: on the presales workflow, paint the coarse
   ACCEPT/REVISE verdict over the fit-gap step's status word once it is
   done. Other steps and workflows keep the generic word. */
function renderStageStatus({ def, run, stepId, status }) {
  if (def.id !== "presales-pursuit" || stepId !== "fit-gap" || status !== "done") return null;
  const st = runStatus({ def, run });
  if (!st) return null;
  return <span className={`demo-verdict demo-verdict-${st.tone}`}>{st.word}</span>;
}

export default function App() {
  return (
    <>
      <header className="demo-strip">
        <div className="demo-brand">
          <span className="demo-mark">&#9707;</span>
          <span className="demo-name">sqnce</span>
          <span className="demo-tagline">staged, gated workflows</span>
        </div>
        <a className="demo-link" href="https://github.com/sqnce/sqnce" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </header>
      <ProcessRolodex
        workflows={WORKFLOWS}
        workflowGroups={GROUPS}
        initialRunFor={initialRunFor}
        persistence={persistence}
        generateDraft={generateDraft}
        validators={validators}
        renderers={RENDERERS}
        runStatus={runStatus}
        renderRunHeader={renderRunHeader}
        renderStageStatus={renderStageStatus}
      />
    </>
  );
}

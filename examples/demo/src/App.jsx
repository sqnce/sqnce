import { lazy } from "react";
import { ProcessRolodex } from "@sqnce/react";
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
        renderers={RENDERERS}
      />
    </>
  );
}

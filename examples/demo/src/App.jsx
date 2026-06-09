import { ProcessRolodex } from "@sqnce/react";
import presales from "../../../definitions/presales.json";
import hiring from "../../../definitions/hiring.json";
import onboarding from "../../../definitions/onboarding.json";
import launch from "../../../definitions/launch.json";

const STORAGE_KEY = "sqnce-demo-v1";

const persistence = {
  load: async () => JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"),
  save: async (state) => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)),
};

export default function App() {
  return (
    <ProcessRolodex
      workflows={[presales, hiring, onboarding, launch]}
      persistence={persistence}
    />
  );
}

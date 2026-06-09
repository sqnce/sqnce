# demo showcase app implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the sqnce showcase demo (spec: `docs/specs/1-demo-app.md`, issue #1): a Vite app at `examples/demo` deployed to https://sqnce.github.io/sqnce/, with four new everyday definitions, seeded runs, a grouped switcher, and simulated drafts.

**Architecture:** The demo consumes `@sqnce/react` from workspace source. Two new optional props (`workflowGroups`, `initialRunFor`) plus an optional second argument to `generateDraft` land in the component first; content (definitions, seeds, drafts) layers on top; deploy and docs land last. Every task leaves the repo building and tested.

**Tech Stack:** Plain ESM JavaScript, React 18, Vite, Node 20 test runner, GitHub Actions Pages deploy.

**Process notes:**
- Work happens in the `demo-app` worktree (`.worktrees/demo-app`), PR #7. Commit after every task; each push to the draft PR gets `@codex review` commented (drafts do not auto-trigger Codex).
- This plan file is deleted in the final pre-merge commit, per project procedure. The spec stays.
- No em dashes anywhere. Brand is lowercase `sqnce`.
- One spec amendment is implemented here (Task 5): `generateDraft` gains an optional second `context` argument (`{ workflowId, stepId, subject }`) because the demo's draft map is keyed by step id and the prompt string does not carry it. Existing single-argument consumers are unaffected.

---

### Task 1: Demo workspace scaffold (minimal working app)

A minimal demo that builds and runs with the four existing business definitions, flat switcher, localStorage persistence, no drafts, no seeds. Later tasks layer the showcase on top.

**Files:**
- Modify: `package.json` (root)
- Modify: `.gitignore`
- Create: `examples/demo/package.json`
- Create: `examples/demo/vite.config.js`
- Create: `examples/demo/index.html`
- Create: `examples/demo/src/main.jsx`
- Create: `examples/demo/src/App.jsx` (minimal version, replaced in Task 6)
- Create: `examples/demo/src/demo.css`
- Create: `package-lock.json` (generated, committed)

- [ ] **Step 1: Add the workspace and ignores**

`package.json` (root), full new content:

```json
{
  "name": "sqnce-monorepo",
  "private": true,
  "workspaces": ["packages/*", "examples/demo"],
  "scripts": {
    "test": "node --test packages/core/test/engine.test.js"
  }
}
```

`.gitignore`, full new content:

```
node_modules/
dist/
*.log
.DS_Store
.worktrees/
.superpowers/
```

- [ ] **Step 2: Create the demo package manifest**

`examples/demo/package.json`:

```json
{
  "name": "sqnce-demo",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

- [ ] **Step 3: Install dependencies (resolves current compatible versions)**

Run from the worktree root:

```bash
npm install -w examples/demo react react-dom @sqnce/react
npm install -w examples/demo -D vite @vitejs/plugin-react
```

Expected: `examples/demo/package.json` gains dependencies (react, react-dom, `@sqnce/react` at `^0.1.0` resolved to the workspace) and devDependencies (vite, `@vitejs/plugin-react`); `package-lock.json` is created at the root.

- [ ] **Step 4: Write the Vite config**

`examples/demo/vite.config.js`:

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base matches the GitHub Pages project path: sqnce.github.io/sqnce/
export default defineConfig({
  base: "/sqnce/",
  plugins: [react()],
});
```

- [ ] **Step 5: Write the HTML entry**

`examples/demo/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>sqnce demo</title>
    <meta
      name="description"
      content="sqnce: staged, gated workflows defined as data and visualized as a rolodex. Live demo."
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Write the React entry**

`examples/demo/src/main.jsx`:

```jsx
import React from "react";
import { createRoot } from "react-dom/client";
import "./demo.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 7: Write the minimal App (replaced in Task 6)**

`examples/demo/src/App.jsx`:

```jsx
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
```

- [ ] **Step 8: Write the demo stylesheet**

`examples/demo/src/demo.css`:

```css
body {
  margin: 0;
  background: #1b2129;
}

.demo-strip {
  height: 44px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: #16191f;
  border-bottom: 1px solid #2a323c;
  font-family: "IBM Plex Mono", monospace;
}

.demo-brand {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.demo-mark {
  color: #d9a441;
  font-size: 16px;
}

.demo-name {
  color: #edeae0;
  font-weight: 600;
  letter-spacing: 0.08em;
  font-size: 13px;
}

.demo-tagline {
  color: #8a919b;
  font-size: 11.5px;
}

.demo-link {
  color: #8a919b;
  text-decoration: none;
  font-size: 12px;
  border: 1px solid #3a434e;
  border-radius: 6px;
  padding: 4px 10px;
}

.demo-link:hover {
  color: #d9a441;
  border-color: #d9a441;
}

/* Reaches into component internals on purpose: the rolodex hardcodes
   min-height: 100vh on .pf-root, and the demo gives 44px of that to
   the brand strip above it. */
.pf-root {
  min-height: calc(100vh - 44px);
}
```

- [ ] **Step 9: Verify the build and tests**

```bash
npm run build -w examples/demo
npm test
```

Expected: Vite build succeeds writing `examples/demo/dist/`; all 11 tests pass.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "demo: scaffold examples/demo workspace with minimal app

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Four everyday definitions (TDD)

**Files:**
- Modify: `packages/core/test/engine.test.js:31`
- Create: `definitions/car-buying.json`
- Create: `definitions/moving.json`
- Create: `definitions/trip-planning.json`
- Create: `definitions/meal-planning.json`

- [ ] **Step 1: Extend the validation test to the eight bundled files (failing first)**

In `packages/core/test/engine.test.js`, replace the file list inside the `"all bundled definitions validate"` test:

```js
test("all bundled definitions validate", () => {
  for (const name of [
    "presales.json",
    "hiring.json",
    "onboarding.json",
    "launch.json",
    "car-buying.json",
    "moving.json",
    "trip-planning.json",
    "meal-planning.json",
  ]) {
    const problems = validateDefinition(load(name));
    assert.deepEqual(problems, [], `${name}: ${problems.join("; ")}`);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL, `ENOENT` reading `car-buying.json`.

- [ ] **Step 3: Write `definitions/car-buying.json`**

```json
{
  "id": "car-buying",
  "name": "Car Buying",
  "short": "Car",
  "subject": { "stepId": "car-needs", "outputId": "facts", "field": "target", "fallback": "the car" },
  "mainStages": [
    {
      "id": "car-scope",
      "name": "Scope",
      "subStages": [
        {
          "id": "car-frame",
          "name": "Needs and Budget",
          "gate": { "type": "hybrid" },
          "description": "Pin down what you need and what you can spend before falling in love with anything.",
          "steps": [
            {
              "id": "car-needs",
              "name": "Needs",
              "required": true,
              "description": "What the car must do for your life.",
              "outputs": [
                {
                  "id": "facts",
                  "type": "fields",
                  "label": "Needs",
                  "fields": [
                    { "key": "target", "label": "Target car or type" },
                    { "key": "mustHaves", "label": "Must-haves" },
                    { "key": "dealBreakers", "label": "Deal-breakers" }
                  ]
                }
              ]
            },
            {
              "id": "car-budget",
              "name": "Budget",
              "required": true,
              "description": "The number you will not cross, written down before anyone shows you leather seats.",
              "outputs": [
                {
                  "id": "facts",
                  "type": "fields",
                  "label": "Budget",
                  "fields": [
                    { "key": "cap", "label": "All-in cap" },
                    { "key": "downPayment", "label": "Down payment" },
                    { "key": "monthlyMax", "label": "Max monthly payment" }
                  ]
                }
              ]
            },
            {
              "id": "car-household",
              "name": "Household Sign-off",
              "description": "Everyone who shares the driveway agrees on the needs and the cap."
            }
          ]
        }
      ]
    },
    {
      "id": "car-search",
      "name": "Search",
      "subStages": [
        {
          "id": "car-research",
          "name": "Research",
          "gate": { "type": "hybrid" },
          "description": "Learn the market before talking to anyone who is selling.",
          "steps": [
            {
              "id": "car-research-notes",
              "name": "Market Research",
              "required": true,
              "description": "Reliability record, common faults, and fair prices for the target.",
              "aiPrompt": "Summarize what a careful buyer should know about this car: reliability record, common faults, fair private-party and dealer price ranges, and which model years to prefer or avoid.",
              "outputs": [{ "id": "out", "type": "text", "label": "Research notes" }]
            },
            {
              "id": "car-listings",
              "name": "Saved Listings",
              "required": true,
              "description": "The live candidates, collected in one place.",
              "outputs": [{ "id": "url", "type": "link", "label": "Listings search link" }]
            }
          ]
        },
        {
          "id": "car-drives",
          "name": "Test Drives",
          "gate": { "type": "hybrid" },
          "description": "Drive the shortlist. Trust what the seat of your pants tells you.",
          "steps": [
            {
              "id": "car-shortlist",
              "name": "Shortlist",
              "required": true,
              "description": "Two or three real candidates with asking prices.",
              "outputs": [
                {
                  "id": "facts",
                  "type": "fields",
                  "label": "Shortlist",
                  "fields": [
                    { "key": "topPick", "label": "Top pick" },
                    { "key": "runnerUp", "label": "Runner-up" },
                    { "key": "askingPrices", "label": "Asking prices" }
                  ]
                }
              ]
            },
            {
              "id": "car-drive-notes",
              "name": "Drive Notes",
              "required": true,
              "description": "What each candidate felt like on the road.",
              "aiPrompt": "Draft structured test-drive notes for the shortlisted cars: ride, noise, visibility, seating fit, and any warning signs worth a second look.",
              "outputs": [{ "id": "out", "type": "text", "label": "Drive notes" }]
            }
          ]
        }
      ]
    },
    {
      "id": "car-deal",
      "name": "Deal",
      "subStages": [
        {
          "id": "car-financing",
          "name": "Financing",
          "gate": { "type": "strict" },
          "description": "Money lined up before negotiating. Cash buyers mark these done.",
          "steps": [
            {
              "id": "car-preapproval",
              "name": "Pre-approval",
              "required": true,
              "description": "A lender's written offer, or proof of funds.",
              "outputs": [{ "id": "doc", "type": "file", "label": "Pre-approval letter" }]
            },
            {
              "id": "car-financing-pick",
              "name": "Chosen Financing",
              "required": true,
              "description": "The terms you will actually sign.",
              "outputs": [
                {
                  "id": "facts",
                  "type": "fields",
                  "label": "Financing",
                  "fields": [
                    { "key": "lender", "label": "Lender" },
                    { "key": "rate", "label": "Rate" },
                    { "key": "termMonths", "label": "Term (months)" }
                  ]
                }
              ]
            }
          ]
        },
        {
          "id": "car-negotiation",
          "name": "Negotiation",
          "gate": { "type": "hybrid" },
          "description": "Numbers decided before you say them out loud.",
          "steps": [
            {
              "id": "car-price-targets",
              "name": "Price Targets",
              "required": true,
              "description": "Opening offer and walk-away, fixed in advance.",
              "outputs": [
                {
                  "id": "facts",
                  "type": "fields",
                  "label": "Targets",
                  "fields": [
                    { "key": "opening", "label": "Opening offer" },
                    { "key": "walkAway", "label": "Walk-away price" }
                  ]
                }
              ]
            },
            {
              "id": "car-negotiation-plan",
              "name": "Negotiation Plan",
              "required": true,
              "description": "Leverage, timing, and the script for the conversation.",
              "aiPrompt": "Draft a short negotiation plan: leverage points from the research and drive notes, an opening script, and calm responses to common dealer tactics.",
              "outputs": [{ "id": "out", "type": "text", "label": "Plan" }]
            }
          ]
        }
      ]
    },
    {
      "id": "car-close",
      "name": "Close",
      "subStages": [
        {
          "id": "car-inspection",
          "name": "Inspection",
          "gate": { "type": "strict" },
          "description": "A mechanic you pay looks at it before you commit.",
          "steps": [
            {
              "id": "car-inspection-report",
              "name": "Inspection Report",
              "required": true,
              "description": "The independent mechanic's findings.",
              "outputs": [{ "id": "doc", "type": "file", "label": "Report" }]
            },
            {
              "id": "car-go-decision",
              "name": "Go / No-go",
              "required": true,
              "description": "Walking away is still on the table."
            }
          ]
        },
        {
          "id": "car-paperwork",
          "name": "Paperwork and Pickup",
          "gate": { "type": "strict" },
          "description": "Sign, insure, drive home.",
          "steps": [
            {
              "id": "car-insurance",
              "name": "Insurance",
              "required": true,
              "description": "Coverage active before the wheels move.",
              "outputs": [{ "id": "url", "type": "link", "label": "Proof of insurance" }]
            },
            {
              "id": "car-sign",
              "name": "Sign the Papers",
              "required": true,
              "description": "Title, bill of sale, registration."
            },
            {
              "id": "car-pickup",
              "name": "Pick It Up",
              "description": "Keys in hand, photos of the odometer."
            }
          ]
        }
      ]
    }
  ]
}
```

- [ ] **Step 4: Write `definitions/moving.json`**

```json
{
  "id": "moving",
  "name": "Moving",
  "short": "Move",
  "subject": { "stepId": "move-needs", "outputId": "facts", "field": "place", "fallback": "the new place" },
  "mainStages": [
    {
      "id": "move-decide",
      "name": "Decide",
      "subStages": [
        {
          "id": "move-frame",
          "name": "Needs and Budget",
          "gate": { "type": "hybrid" },
          "description": "Know what you are looking for and what it can cost before the first viewing.",
          "steps": [
            {
              "id": "move-needs",
              "name": "Needs",
              "required": true,
              "description": "Where, how big, by when.",
              "outputs": [
                {
                  "id": "facts",
                  "type": "fields",
                  "label": "Needs",
                  "fields": [
                    { "key": "place", "label": "Target area or building" },
                    { "key": "space", "label": "Space needed" },
                    { "key": "moveBy", "label": "Move-by date" }
                  ]
                }
              ]
            },
            {
              "id": "move-budget",
              "name": "Budget",
              "required": true,
              "description": "Rent ceiling plus the cash a move actually takes.",
              "outputs": [
                {
                  "id": "facts",
                  "type": "fields",
                  "label": "Budget",
                  "fields": [
                    { "key": "rentMax", "label": "Max rent" },
                    { "key": "deposit", "label": "Deposit available" },
                    { "key": "overlap", "label": "Overlap budget" }
                  ]
                }
              ]
            },
            {
              "id": "move-notice",
              "name": "Check Your Notice Period",
              "description": "Know the date you must give notice at the current place. Do not give it yet."
            }
          ]
        }
      ]
    },
    {
      "id": "move-hunt",
      "name": "Hunt",
      "subStages": [
        {
          "id": "move-search",
          "name": "Search",
          "gate": { "type": "hybrid" },
          "description": "Cast the net and look at places with clear eyes.",
          "steps": [
            {
              "id": "move-listings",
              "name": "Saved Searches",
              "required": true,
              "description": "Alerts set on the portals that matter.",
              "outputs": [{ "id": "url", "type": "link", "label": "Search link" }]
            },
            {
              "id": "move-viewing-notes",
              "name": "Viewing Notes",
              "required": true,
              "description": "What to check at every viewing, and what you found.",
              "aiPrompt": "Draft a viewing checklist and notes template: light, noise, water pressure, storage, phone signal, commute timing, and red flags to check at each viewing.",
              "outputs": [{ "id": "out", "type": "text", "label": "Notes" }]
            }
          ]
        },
        {
          "id": "move-pick",
          "name": "Shortlist",
          "gate": { "type": "hybrid" },
          "description": "Two places you would genuinely sign for.",
          "steps": [
            {
              "id": "move-shortlist",
              "name": "Shortlist",
              "required": true,
              "description": "Ranked, with the true monthly cost of each.",
              "outputs": [
                {
                  "id": "facts",
                  "type": "fields",
                  "label": "Shortlist",
                  "fields": [
                    { "key": "first", "label": "First choice" },
                    { "key": "second", "label": "Second choice" },
                    { "key": "monthly", "label": "True monthly cost" }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "id": "move-commit",
      "name": "Commit",
      "subStages": [
        {
          "id": "move-apply",
          "name": "Application",
          "gate": { "type": "hybrid" },
          "description": "Paperwork ready the moment the right place appears.",
          "steps": [
            {
              "id": "move-packet",
              "name": "Application Packet",
              "required": true,
              "description": "Pay stubs, references, ID, all in one file.",
              "outputs": [{ "id": "doc", "type": "file", "label": "Packet" }]
            },
            {
              "id": "move-apply-sent",
              "name": "Applications Sent",
              "required": true,
              "description": "Submitted for the shortlist, follow-ups noted."
            }
          ]
        },
        {
          "id": "move-lease",
          "name": "Lease",
          "gate": { "type": "strict" },
          "description": "Read it, then sign it, in that order.",
          "steps": [
            {
              "id": "move-lease-review",
              "name": "Lease Review",
              "required": true,
              "description": "Key terms, in your own words.",
              "aiPrompt": "Summarize the lease's key terms and flag anything unusual: break clause, rent increases, deposit conditions, maintenance responsibilities, and guest or sublet rules.",
              "outputs": [{ "id": "out", "type": "text", "label": "Review" }]
            },
            {
              "id": "move-lease-signed",
              "name": "Lease Signed",
              "required": true,
              "description": "Countersigned copy in hand."
            },
            {
              "id": "move-give-notice",
              "name": "Give Notice",
              "description": "Only after the new lease is signed."
            }
          ]
        }
      ]
    },
    {
      "id": "move-move",
      "name": "Move",
      "subStages": [
        {
          "id": "move-logistics",
          "name": "Logistics",
          "gate": { "type": "hybrid" },
          "description": "The week where lists beat willpower.",
          "steps": [
            {
              "id": "move-movers",
              "name": "Movers",
              "required": true,
              "description": "Booked, confirmed, and quoted in writing.",
              "outputs": [
                {
                  "id": "facts",
                  "type": "fields",
                  "label": "Movers",
                  "fields": [
                    { "key": "company", "label": "Company" },
                    { "key": "date", "label": "Date" },
                    { "key": "quote", "label": "Quote" }
                  ]
                }
              ]
            },
            {
              "id": "move-utilities",
              "name": "Utilities Switched",
              "description": "Power, internet, water on at the new place for day one."
            },
            {
              "id": "move-address",
              "name": "Address Changes",
              "description": "Bank, employer, subscriptions, mail forwarding."
            }
          ]
        },
        {
          "id": "move-settle",
          "name": "Settle In",
          "gate": { "type": "hybrid" },
          "description": "Make it yours, and protect the deposit.",
          "steps": [
            {
              "id": "move-walkthrough",
              "name": "Walkthrough Photos",
              "required": true,
              "description": "Move-in condition, documented before the boxes open.",
              "outputs": [{ "id": "doc", "type": "file", "label": "Move-in condition photos" }]
            },
            {
              "id": "move-unpack",
              "name": "Essentials Unpacked",
              "description": "Bed made, kitchen working, shower curtain up."
            }
          ]
        }
      ]
    }
  ]
}
```

- [ ] **Step 5: Write `definitions/trip-planning.json`**

```json
{
  "id": "trip-planning",
  "name": "Trip Planning",
  "short": "Trip",
  "subject": { "stepId": "trip-destination", "outputId": "facts", "field": "destination", "fallback": "the destination" },
  "mainStages": [
    {
      "id": "trip-dream",
      "name": "Dream",
      "subStages": [
        {
          "id": "trip-frame",
          "name": "Destination and Dates",
          "gate": { "type": "hybrid" },
          "description": "Agree on where, when, and what it can cost.",
          "steps": [
            {
              "id": "trip-destination",
              "name": "Destination",
              "required": true,
              "description": "The place, the dates, and who is coming.",
              "outputs": [
                {
                  "id": "facts",
                  "type": "fields",
                  "label": "Trip",
                  "fields": [
                    { "key": "destination", "label": "Destination" },
                    { "key": "dates", "label": "Dates" },
                    { "key": "travelers", "label": "Travelers" }
                  ]
                }
              ]
            },
            {
              "id": "trip-budget",
              "name": "Budget",
              "required": true,
              "description": "Total and per-day, agreed before booking anything.",
              "outputs": [
                {
                  "id": "facts",
                  "type": "fields",
                  "label": "Budget",
                  "fields": [
                    { "key": "total", "label": "Total budget" },
                    { "key": "perDay", "label": "Per-day target" }
                  ]
                }
              ]
            },
            {
              "id": "trip-timeoff",
              "name": "Time Off Approved",
              "description": "Calendars blocked before money moves."
            }
          ]
        }
      ]
    },
    {
      "id": "trip-book",
      "name": "Book",
      "subStages": [
        {
          "id": "trip-transport",
          "name": "Transport",
          "gate": { "type": "hybrid" },
          "description": "Getting there, locked in.",
          "steps": [
            {
              "id": "trip-flights",
              "name": "Flights",
              "required": true,
              "description": "Booked, or a fare watch with a trigger price.",
              "outputs": [{ "id": "url", "type": "link", "label": "Flight booking or watch link" }]
            },
            {
              "id": "trip-ground",
              "name": "Ground Transport",
              "description": "From the airport, and getting around once there.",
              "outputs": [
                {
                  "id": "facts",
                  "type": "fields",
                  "label": "Ground",
                  "fields": [
                    { "key": "arrival", "label": "From the airport" },
                    { "key": "local", "label": "Getting around" }
                  ]
                }
              ]
            }
          ]
        },
        {
          "id": "trip-lodging",
          "name": "Lodging",
          "gate": { "type": "strict" },
          "description": "A confirmed bed for every night of the trip.",
          "steps": [
            {
              "id": "trip-stay",
              "name": "Where You're Staying",
              "required": true,
              "description": "The booking, neighborhood checked.",
              "outputs": [{ "id": "url", "type": "link", "label": "Booking link" }]
            },
            {
              "id": "trip-confirmations",
              "name": "Confirmations",
              "required": true,
              "description": "Every confirmation saved in one place, offline-readable.",
              "outputs": [{ "id": "doc", "type": "file", "label": "Booking confirmations" }]
            }
          ]
        }
      ]
    },
    {
      "id": "trip-plan",
      "name": "Plan",
      "subStages": [
        {
          "id": "trip-itinerary",
          "name": "Itinerary",
          "gate": { "type": "hybrid" },
          "description": "Enough plan to relax, not enough to need a vacation after.",
          "steps": [
            {
              "id": "trip-days",
              "name": "Day-by-day Plan",
              "required": true,
              "description": "One anchor per day, slack built in.",
              "aiPrompt": "Draft a relaxed day-by-day itinerary for the destination and dates: one anchor activity per day, one food idea, and slack time built in.",
              "outputs": [{ "id": "out", "type": "text", "label": "Itinerary" }]
            },
            {
              "id": "trip-reservations",
              "name": "Reservations",
              "description": "Restaurants and timed entries that sell out.",
              "outputs": [{ "id": "url", "type": "link", "label": "Bookings list" }]
            }
          ]
        },
        {
          "id": "trip-pack",
          "name": "Packing and Papers",
          "gate": { "type": "hybrid" },
          "description": "Out the door without the 2 a.m. drugstore run.",
          "steps": [
            {
              "id": "trip-packing",
              "name": "Packing List",
              "required": true,
              "description": "By category, documents and chargers called out.",
              "aiPrompt": "Draft a packing list for this destination, dates, and travelers, organized by category, with documents, medications, and chargers called out explicitly.",
              "outputs": [{ "id": "out", "type": "text", "label": "Packing list" }]
            },
            {
              "id": "trip-documents",
              "name": "Passports and Documents Checked",
              "description": "Validity dates, visas, insurance cards."
            }
          ]
        }
      ]
    }
  ]
}
```

- [ ] **Step 6: Write `definitions/meal-planning.json`**

```json
{
  "id": "meal-planning",
  "name": "Meal Planning",
  "short": "Meals",
  "subject": { "stepId": "meal-week", "outputId": "facts", "field": "week", "fallback": "this week" },
  "mainStages": [
    {
      "id": "meal-plan",
      "name": "Plan",
      "subStages": [
        {
          "id": "meal-menu",
          "name": "The Week's Menu",
          "gate": { "type": "hybrid" },
          "description": "Decide the dinners once, skip the 5 p.m. scramble all week.",
          "steps": [
            {
              "id": "meal-week",
              "name": "Week Setup",
              "required": true,
              "description": "Who you are feeding and what constrains the cooking.",
              "outputs": [
                {
                  "id": "facts",
                  "type": "fields",
                  "label": "Setup",
                  "fields": [
                    { "key": "week", "label": "Week of" },
                    { "key": "household", "label": "Cooking for" },
                    { "key": "constraints", "label": "Constraints" }
                  ]
                }
              ]
            },
            {
              "id": "meal-dinners",
              "name": "Dinner Plan",
              "required": true,
              "description": "Five weeknight dinners that respect the constraints.",
              "aiPrompt": "Draft a dinner plan for the week: five weeknight meals matching the constraints, one new recipe, a leftovers night, and a one-line prep note per meal.",
              "outputs": [{ "id": "out", "type": "text", "label": "Dinner plan" }]
            }
          ]
        },
        {
          "id": "meal-list",
          "name": "Shopping List",
          "gate": { "type": "hybrid" },
          "description": "The plan turned into a list the store layout agrees with.",
          "steps": [
            {
              "id": "meal-groceries",
              "name": "Grocery List",
              "required": true,
              "description": "By store section, quantities included.",
              "aiPrompt": "Turn the dinner plan into a grocery list organized by store section, with quantities, checking pantry staples last.",
              "outputs": [{ "id": "out", "type": "text", "label": "Grocery list" }]
            },
            {
              "id": "meal-recipes",
              "name": "Recipe Links",
              "description": "The recipes the plan leans on.",
              "outputs": [{ "id": "url", "type": "link", "label": "Recipes" }]
            }
          ]
        }
      ]
    },
    {
      "id": "meal-shop",
      "name": "Shop",
      "subStages": [
        {
          "id": "meal-buy",
          "name": "Groceries",
          "gate": { "type": "strict" },
          "description": "One trip, the whole list, nothing extra that is not chocolate.",
          "steps": [
            {
              "id": "meal-shopping-done",
              "name": "Shopping Done",
              "required": true,
              "description": "Everything on the list is in the kitchen."
            },
            {
              "id": "meal-receipt",
              "name": "Receipt",
              "description": "For the budget ledger.",
              "outputs": [{ "id": "doc", "type": "file", "label": "Receipt" }]
            }
          ]
        }
      ]
    },
    {
      "id": "meal-prep",
      "name": "Prep",
      "subStages": [
        {
          "id": "meal-ahead",
          "name": "Cook Ahead",
          "gate": { "type": "hybrid" },
          "description": "An hour on Sunday that buys five calm evenings.",
          "steps": [
            {
              "id": "meal-prep-notes",
              "name": "Prep Notes",
              "description": "What to chop, marinate, or batch-cook ahead.",
              "aiPrompt": "Draft Sunday prep notes from the dinner plan: what to chop, marinate, or batch-cook ahead, and what stays fresh until the day it is needed.",
              "outputs": [{ "id": "out", "type": "text", "label": "Prep notes" }]
            },
            {
              "id": "meal-prep-done",
              "name": "Sunday Prep",
              "description": "Containers filled, fridge organized."
            }
          ]
        }
      ]
    }
  ]
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 11 tests, including all eight definitions validating.

- [ ] **Step 8: Commit**

```bash
git add definitions packages/core/test/engine.test.js
git commit -m "definitions: add four everyday workflows (car, move, trip, meals)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `workflowGroups` prop on ProcessRolodex

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx` (props doc block, signature, switcher markup around line 225, CSS block)

- [ ] **Step 1: Update the component signature and doc block**

Signature becomes:

```jsx
export default function ProcessRolodex({ workflows, persistence, generateDraft, workflowGroups, initialRunFor }) {
```

(`initialRunFor` lands in Task 4; including it in the signature now is harmless and avoids touching the line twice.)

Add to the props doc comment above the component:

```
 *  - workflowGroups (optional): array of { label, ids } grouping the
 *      switcher. Ids not matching a workflow are ignored; workflows in
 *      no group render in a trailing unlabeled section. Omit for the
 *      flat switcher.
 *  - initialRunFor (optional): (workflowId) => run, used when a
 *      workflow has no stored run and by Reset. Defaults to createRun.
 *      Must be side-effect free; it can be called on every render.
```

- [ ] **Step 2: Add the switcher helper components**

Above `export default function ProcessRolodex`, add:

```jsx
function SwitcherButtons({ workflows, activeId, onSwitch }) {
  return (
    <div className="pf-switch">
      {workflows.map((w) => (
        <button
          key={w.id}
          className={`pf-switch-btn ${w.id === activeId ? "pf-switch-active" : ""}`}
          onClick={() => onSwitch(w.id)}
        >
          {w.short || w.name}
        </button>
      ))}
    </div>
  );
}

function WorkflowSwitcher({ workflows, groups, activeId, onSwitch }) {
  if (!groups || !groups.length) {
    return <SwitcherButtons workflows={workflows} activeId={activeId} onSwitch={onSwitch} />;
  }
  const byId = new Map(workflows.map((w) => [w.id, w]));
  const sections = groups
    .map((g) => ({
      label: g.label,
      workflows: (g.ids || []).map((id) => byId.get(id)).filter(Boolean),
    }))
    .filter((s) => s.workflows.length);
  const grouped = new Set(sections.flatMap((s) => s.workflows.map((w) => w.id)));
  const rest = workflows.filter((w) => !grouped.has(w.id));
  if (rest.length) sections.push({ label: "", workflows: rest });
  return (
    <div className="pf-switch-groups">
      {sections.map((s, i) => (
        <div key={s.label || `rest-${i}`} className="pf-switch-group">
          <span className="pf-switch-label">{s.label || " "}</span>
          <SwitcherButtons workflows={s.workflows} activeId={activeId} onSwitch={onSwitch} />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Replace the inline switcher markup**

The current block inside the header:

```jsx
{workflows.length > 1 && (
  <div className="pf-switch">
    {workflows.map((w) => (
      <button
        key={w.id}
        className={`pf-switch-btn ${w.id === activeId ? "pf-switch-active" : ""}`}
        onClick={() => switchWorkflow(w.id)}
      >
        {w.short || w.name}
      </button>
    ))}
  </div>
)}
```

becomes:

```jsx
{workflows.length > 1 && (
  <WorkflowSwitcher
    workflows={workflows}
    groups={workflowGroups}
    activeId={activeId}
    onSwitch={switchWorkflow}
  />
)}
```

- [ ] **Step 4: Add the group CSS**

In the `CSS` template string, directly after the `.pf-switch-active:hover` rule, add:

```css
.pf-switch-groups { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; }
.pf-switch-group { display: flex; flex-direction: column; gap: 3px; align-items: flex-start; }
.pf-switch-label { font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: #5E6772; min-height: 12px; }
```

- [ ] **Step 5: Verify syntax and build**

```bash
npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:@sqnce/core --outfile=/dev/null
npm run build -w examples/demo
npm test
```

Expected: all three succeed (the demo still passes no groups; flat path unchanged).

- [ ] **Step 6: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "react: optional workflowGroups prop for a grouped switcher

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `initialRunFor` prop on ProcessRolodex

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx:51` (run fallback) and the `resetRun` function

- [ ] **Step 1: Route run creation through the prop**

After the `subs` memo, replace:

```jsx
const run = runs[activeId] || createRun();
```

with:

```jsx
const makeInitialRun = useCallback(
  (id) => (initialRunFor ? initialRunFor(id) : createRun()),
  [initialRunFor]
);
const run = runs[activeId] || makeInitialRun(activeId);
```

- [ ] **Step 2: Route Reset through the prop**

In `resetRun`, replace `setRun(createRun());` with `setRun(makeInitialRun(activeId));`.

- [ ] **Step 3: Verify**

```bash
npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:@sqnce/core --outfile=/dev/null
npm run build -w examples/demo
npm test
```

Expected: all succeed.

- [ ] **Step 4: Commit**

```bash
git add packages/react/src/ProcessRolodex.jsx
git commit -m "react: optional initialRunFor prop seeds absent runs and Reset

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `generateDraft` context argument (spec amendment)

The demo's draft map is keyed by step id, which the prompt string does not carry. `generateDraft` gains an optional second argument; one-argument consumers are unaffected.

**Files:**
- Modify: `packages/react/src/ProcessRolodex.jsx` (the `generate` function and the props doc block)
- Modify: `docs/specs/1-demo-app.md` (record the amendment)

- [ ] **Step 1: Pass context in `generate`**

In the `generate` function, replace:

```jsx
const text = await generateDraft(prompt);
```

with:

```jsx
const text = await generateDraft(prompt, {
  workflowId: def.id,
  stepId: step.id,
  subject: subjectName,
});
```

- [ ] **Step 2: Document it in the props comment**

Extend the `generateDraft` line in the doc block:

```
 *  - generateDraft (optional): async (prompt, context) => string where
 *      context is { workflowId, stepId, subject }. The second argument
 *      is informational; single-argument implementations keep working.
```

- [ ] **Step 3: Record the amendment in the spec**

In `docs/specs/1-demo-app.md`, at the end of the "New @sqnce/react props" section, add:

```markdown
### Amendment (planning): `generateDraft` context

`generateDraft` receives an optional second argument `{ workflowId, stepId, subject }` so the demo's step-keyed draft map can identify the step; the prompt string alone does not carry the id. Existing single-argument consumers are unaffected.
```

- [ ] **Step 4: Verify and commit**

```bash
npx esbuild packages/react/src/ProcessRolodex.jsx --bundle --format=esm --external:react --external:@sqnce/core --outfile=/dev/null
npm test
git add packages/react/src/ProcessRolodex.jsx docs/specs/1-demo-app.md
git commit -m "react: pass workflow, step, and subject context to generateDraft

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Seeds, drafts, and the full showcase App

**Files:**
- Create: `examples/demo/src/seeds.js`
- Create: `examples/demo/src/drafts.js`
- Modify: `examples/demo/src/App.jsx` (full replacement)

- [ ] **Step 1: Write `examples/demo/src/seeds.js`**

```js
/* Seeded runs for the everyday workflows, so a first-time visitor lands
   mid-flight instead of on an empty form. Returned through the
   component's initialRunFor prop: used when no stored run exists and by
   Reset, so Reset returns here, not to a blank run. */
import { createRun } from "@sqnce/core";

const done = { checkedDone: true, outputs: {} };

const SEEDS = {
  /* Deep seed: frontier at "Financing" (index 3), a strict gate with
     nothing done, so the gate hint and the override are visible. */
  "car-buying": {
    idx: 3,
    frontier: 3,
    stepState: {
      "car-needs": {
        checkedDone: false,
        outputs: {
          facts: {
            target: "a 2021 Mazda CX-5 Touring",
            mustHaves: "AWD, CarPlay, under 60k miles, full service records",
            dealBreakers: "Salvage or rebuilt title, smoker car, aftermarket tune",
          },
        },
      },
      "car-budget": {
        checkedDone: false,
        outputs: {
          facts: { cap: "$24,000 all-in", downPayment: "$6,000", monthlyMax: "$320" },
        },
      },
      "car-household": done,
      "car-research-notes": {
        checkedDone: false,
        outputs: {
          out: "The CX-5 has a strong reliability record across 2019 to 2022; the 2.5L non-turbo is the safe pick. Watch for infotainment freezes (fixed by software update) and check that the recall work on the fuel pump is done. Fair price for a 2021 Touring with 35k to 45k miles: $21,500 to $23,500 dealer, about $1,500 less private party. Avoid 2016 to 2017 for the older platform.",
        },
      },
      "car-listings": {
        checkedDone: false,
        outputs: { url: "https://www.autotrader.com/cars-for-sale/mazda-cx-5" },
      },
      "car-shortlist": {
        checkedDone: false,
        outputs: {
          facts: {
            topPick: "2021 CX-5 Touring, 41k mi, Riverside Mazda",
            runnerUp: "2020 CX-5 Grand Touring, 55k mi, private seller",
            askingPrices: "$22,800 / $21,500",
          },
        },
      },
      "car-drive-notes": {
        checkedDone: false,
        outputs: {
          out: "Riverside car: tight ride, quiet at 65 mph, seats fit both drivers, one door ding noted. Private GT: softer suspension, sunroof rattle over bumps, strong brakes, seller has every receipt. Both pull straight under braking. Recheck the GT rattle on the inspection if it gets that far.",
        },
      },
    },
  },

  /* Light seed: needs and budget done, browsing at "Search" (index 1)
     with the listings link saved and viewing notes still open. */
  moving: {
    idx: 1,
    frontier: 1,
    stepState: {
      "move-needs": {
        checkedDone: false,
        outputs: {
          facts: {
            place: "a two-bed near Greenlake",
            space: "2 bed, 1 bath, parking, in-unit laundry",
            moveBy: "August 1",
          },
        },
      },
      "move-budget": {
        checkedDone: false,
        outputs: {
          facts: { rentMax: "$2,400", deposit: "$3,000", overlap: "$1,200 for one month of overlap" },
        },
      },
      "move-notice": done,
      "move-listings": {
        checkedDone: false,
        outputs: { url: "https://www.zillow.com/green-lake-seattle-wa/rentals/" },
      },
    },
  },

  /* Light seed: frame done, at "Transport" (index 1) with flights
     booked, so the met gate and the Advance button are visible. */
  "trip-planning": {
    idx: 1,
    frontier: 1,
    stepState: {
      "trip-destination": {
        checkedDone: false,
        outputs: {
          facts: { destination: "Lisbon", dates: "Sep 12 to 21", travelers: "2 adults" },
        },
      },
      "trip-budget": {
        checkedDone: false,
        outputs: { facts: { total: "$3,800", perDay: "$250" } },
      },
      "trip-timeoff": done,
      "trip-flights": {
        checkedDone: false,
        outputs: { url: "https://www.google.com/travel/flights" },
      },
    },
  },

  /* Light seed: menu planned, at "Shopping List" (index 1) with the
     grocery list still open, so the hybrid gate hint is visible. */
  "meal-planning": {
    idx: 1,
    frontier: 1,
    stepState: {
      "meal-week": {
        checkedDone: false,
        outputs: {
          facts: {
            week: "the week of June 8",
            household: "2 adults, 1 kid",
            constraints: "One vegetarian night, 30-minute weeknights, kid vetoes mushrooms",
          },
        },
      },
      "meal-dinners": {
        checkedDone: false,
        outputs: {
          out: "Mon: sheet-pan chicken fajitas (marinate Sunday). Tue: pesto pasta with white beans, vegetarian. Wed: smash burgers, quick pickles from Sunday. Thu: leftovers night. Fri: new recipe, gochujang salmon bowls (sauce keeps all week). Sat: out or freezer backup.",
        },
      },
    },
  },
};

export function initialRunFor(workflowId) {
  const seed = SEEDS[workflowId];
  return seed ? structuredClone(seed) : createRun();
}
```

- [ ] **Step 2: Write `examples/demo/src/drafts.js`**

```js
/* Simulated draft generation. The engine still builds the real prompt
   (subject plus all completed prior outputs); this module just answers
   it with prewritten, step-aware text after a short delay, so the demo
   needs no backend and no API key.

   To use a real LLM instead, replace the exported generateDraft with a
   provider call. The first argument is the complete prompt; send it
   and return the text. For example:

     export const generateDraft = async (prompt) => {
       const res = await fetch("/api/draft", { method: "POST", body: prompt });
       return res.text();
     };
*/

const DRAFTS = {
  "car-research-notes": (s) =>
    `Research summary for ${s}: strong reliability record for recent model years; prefer the naturally aspirated engine for longevity. Known issues: infotainment freezes (software update), check fuel pump recall completion. Fair price band: $21,500 to $23,500 at dealers, roughly $1,500 less private party. Best years: 2020 to 2022.`,
  "car-drive-notes": (s) =>
    `Drive notes for ${s}: ride is composed over broken pavement, cabin quiet at highway speed, visibility good with a slightly high beltline. Check seat comfort past 30 minutes, listen for sunroof rattle, confirm straight tracking under hard braking. Warning signs to recheck: any vibration at 70 mph, uneven tire wear.`,
  "car-negotiation-plan": (s) =>
    `Negotiation plan for ${s}: anchor below the research band with a written out-the-door number. Leverage: days on lot, the runner-up candidate, pre-approved financing. Script: open with the out-the-door figure, decline add-ons twice, be ready to leave once. If the price holds, ask for new tires or the first service instead.`,
  "move-viewing-notes": (s) =>
    `Viewing checklist for ${s}: visit at two different times of day. Check light in the main rooms, water pressure in the shower, phone signal in every room, storage depth, window noise with traffic, and signs of damp behind furniture. Time the real commute door to door. Red flags: month-to-month neighbors, fresh paint over one patch, vague answers about the deposit.`,
  "move-lease-review": (s) =>
    `Lease review for ${s}: 12-month term with a 60-day notice to vacate. Rent increase capped at renewal, not during term. Deposit held in escrow, itemized deductions required within 21 days. Tenant handles fixtures under $50; landlord handles appliances and plumbing. Unusual: guest stays over 14 nights need written consent. Nothing blocking signature; ask to strike the carpet-cleaning fee.`,
  "trip-days": (s) =>
    `Itinerary for ${s}: Day 1, arrive and walk the old town, early dinner near the hotel. Day 2, the one museum that books out, long lunch after. Day 3, day trip by train, pack light. Day 4, market morning, free afternoon, sunset viewpoint. Day 5, neighborhood without a plan, best meal of the trip budgeted here. Keep one evening completely empty.`,
  "trip-packing": (s) =>
    `Packing list for ${s}: Documents: passports, one printed booking sheet, insurance card. Tech: phone chargers, one adapter per person, power bank. Clothes: layers for evening wind, one rain shell, broken-in walking shoes. Health: prescriptions in original packaging, basic painkillers, blister plasters. Day bag: collapsible tote, water bottle, sunglasses.`,
  "meal-dinners": (s) =>
    `Dinner plan for ${s}: Mon: sheet-pan chicken fajitas, marinate the night before. Tue: pesto pasta with white beans, vegetarian. Wed: smash burgers with quick pickles. Thu: leftovers night, clear the fridge. Fri: gochujang salmon bowls, the new one, sauce keeps all week. Prep note: double the rice Monday for Friday's bowls.`,
  "meal-groceries": (s) =>
    `Grocery list for ${s}: Produce: peppers x3, onions x2, limes x4, basil, cucumbers x2, scallions. Meat and fish: chicken thighs 2 lb, ground beef 1 lb, salmon 4 fillets. Dry: pasta, rice, white beans x2 cans, burger buns. Dairy: butter, cheddar slices, yogurt. Pantry check last: gochujang, pesto, pickling vinegar, oil.`,
  "meal-prep-notes": (s) =>
    `Sunday prep for ${s}: marinate the fajita chicken; mix the gochujang sauce (keeps 7 days); quick-pickle the cucumbers; cook a double batch of rice and refrigerate flat; wash and dry the basil. Leave the salmon untouched until Friday. Total time: about 50 minutes with the rice unattended.`,
};

const FALLBACK = (s) =>
  `Draft for ${s}: a working first pass based on everything completed so far. Strong openings name the goal in the first sentence, the middle carries the specifics already captured in earlier steps, and the close names the next decision. Replace any placeholder with the real figure before sharing.`;

export async function generateDraft(prompt, context = {}) {
  await new Promise((resolve) => setTimeout(resolve, 600));
  const make = DRAFTS[context.stepId] || FALLBACK;
  return make(context.subject || "the subject");
}
```

- [ ] **Step 3: Replace `examples/demo/src/App.jsx` (full content)**

```jsx
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
      />
    </>
  );
}
```

- [ ] **Step 4: Verify the build, then verify behavior in the browser**

```bash
npm run build -w examples/demo
npm test
```

Expected: both pass. Then run `npm run dev -w examples/demo` and check, in the browser:
1. First load lands in Car Buying at Financing with "Gate unmet: Pre-approval, Chosen Financing" and the "Advance anyway" override visible.
2. The switcher shows Everyday and Work labels with four buttons each.
3. Trip Planning sits at Transport with "Advance to Lodging" available.
4. "Generate draft" on Market Research produces the canned text after a moment.
5. Reset run returns Car Buying to the seeded state, not to empty.
6. Reload keeps state (localStorage), and presales still starts empty.

- [ ] **Step 5: Commit**

```bash
git add examples/demo
git commit -m "demo: showcase app with seeds, grouped switcher, simulated drafts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Artifact example sync

The artifact (`examples/claude-artifact/process-rolodex.jsx`) is a self-contained copy and must carry the same three behaviors. It has no props, so the equivalents are module-level constants.

**Files:**
- Modify: `examples/claude-artifact/process-rolodex.jsx` (run fallback at ~line 636, `resetRun` at ~line 825, switcher at ~line 880, generate at ~line 772, CSS at ~line 1146)

- [ ] **Step 1: Add the seed and group constants**

Directly after `const emptyStep = ...` (~line 604), add:

```jsx
/* Optional UI behaviors, kept in sync with @sqnce/react:
   WORKFLOW_GROUPS groups the switcher ([{ label, ids }] or null for flat);
   SEED_RUNS pre-populates runs by workflow id (used when no stored run
   exists and by Reset). Both default to off in this artifact. */
const WORKFLOW_GROUPS = null;
const SEED_RUNS = {};
const initialRunFor = (workflowId) =>
  SEED_RUNS[workflowId] ? structuredClone(SEED_RUNS[workflowId]) : emptyRun();
```

- [ ] **Step 2: Route run fallback and reset through `initialRunFor`**

Replace `const run = runs[activeId] || emptyRun();` (~line 636) with:

```jsx
const run = runs[activeId] || initialRunFor(activeId);
```

In `resetRun` (~line 825), replace its `emptyRun()` call with `initialRunFor(activeId)`.

- [ ] **Step 3: Grouped switcher**

Replace the `.pf-switch` block (~line 880) with the same `WorkflowSwitcher`/`SwitcherButtons` pair from Task 3 (defined above the main component, using `WORKFLOWS` and `WORKFLOW_GROUPS`), and add the same three CSS rules (`.pf-switch-groups`, `.pf-switch-group`, `.pf-switch-label`) after `.pf-switch-active:hover` in the CSS string.

- [ ] **Step 4: Draft context parity**

In the artifact's `generate` function (~line 772), thread the same context object into its internal draft call so the signature matches the library: where the prompt is built and the API is called, pass `{ workflowId: def.id, stepId: step.id, subject }` as a second argument to the local draft function (which may ignore it; the point is signature parity for anyone copying the file).

- [ ] **Step 5: Verify syntax**

```bash
npx esbuild examples/claude-artifact/process-rolodex.jsx --bundle --format=esm --external:react --outfile=/dev/null
```

Expected: success.

- [ ] **Step 6: Commit**

```bash
git add examples/claude-artifact/process-rolodex.jsx
git commit -m "artifact: sync workflowGroups, initialRunFor, and draft context

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Pages deploy and CI

**Files:**
- Create: `.github/workflows/pages.yml`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Write `pages.yml`**

```yaml
name: Deploy demo to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build -w examples/demo
      - uses: actions/configure-pages@v5
        with:
          enablement: true
      - uses: actions/upload-pages-artifact@v3
        with:
          path: examples/demo/dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Update `ci.yml` (full new content)**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build -w examples/demo
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows
git commit -m "ci: deploy demo to GitHub Pages, build demo on every PR

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Docs

**Files:**
- Modify: `README.md` (top, packages table)
- Modify: `CLAUDE.md` (Commands)
- Modify: `packages/react/README.md` (new props, brief)

- [ ] **Step 1: README demo link**

After the first paragraph of `README.md`, add:

```markdown
**[Live demo](https://sqnce.github.io/sqnce/)**: all eight bundled workflows, seeded mid-run, drafts simulated, state in your browser's localStorage.
```

In the packages table, add a row:

```markdown
| `/examples/demo` | The live demo app (Vite). Builds from workspace source. |
```

- [ ] **Step 2: CLAUDE.md Commands**

Add to the Commands section:

```markdown
- `npm run build -w examples/demo` (build the demo app; CI runs this on every PR)
```

- [ ] **Step 3: react README props**

In `packages/react/README.md`, document the two new optional props and the `generateDraft` second argument in whatever props section exists (or add a short "Props" section mirroring the component doc block: `workflowGroups`, `initialRunFor`, `generateDraft(prompt, context)`).

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md packages/react/README.md
git commit -m "docs: live demo link, demo build command, new prop docs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Full gate and PR ready

- [ ] **Step 1: Clean-room verification**

```bash
rm -rf node_modules examples/demo/node_modules packages/*/node_modules
npm ci
npm test
npm run build -w examples/demo
```

Expected: install clean, 11 tests pass, build succeeds.

- [ ] **Step 2: Conventions sweep**

```bash
grep -rn $'—' --include='*.md' --include='*.js' --include='*.jsx' --include='*.json' --include='*.yml' . --exclude-dir=node_modules
```

Expected: no matches (no em dashes anywhere).

- [ ] **Step 3: Push, mark ready, Codex loop**

```bash
git push
gh pr ready 7
```

Marking ready-for-review triggers Codex automatically. Address findings, push, comment `@codex review` after each subsequent push, repeat until clean. Pages deploys on merge (push to main); verify https://sqnce.github.io/sqnce/ loads afterward.

- [ ] **Step 4: Pre-merge cleanup**

Delete `docs/plans/1-demo-app.md` as the final commit before merge, per project procedure (the spec stays).

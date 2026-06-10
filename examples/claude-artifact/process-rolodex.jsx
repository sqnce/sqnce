import React, { useState, useEffect, useRef, useMemo, useCallback, Suspense } from "react";
import { createPortal } from "react-dom";

/* ============================================================
   PROCESS FRAMEWORK v3 (multi-workflow)
   Two layers, deliberately separate:

   1) CONFIGS (the WORKFLOWS array)
      Pure data trees the engine knows nothing special about.
      MainStage -> SubStage -> Step -> Output spec[]
      - Output spec types: "text" | "fields" | "file" | "link" | "data"
        (steps with no outputs are checklist steps)
      - Any output spec may carry render: { kind, options }. Kinds
        resolve against built-ins (markdown, table, cards, keyvalue),
        then fall back: JSON tree for data, default editor otherwise.
      - SubStage gate: { type: "hybrid" | "strict" }
      - Each workflow declares a `subject` (which field names the
        thing the process is about) so AI drafts reference it.

   2) ENGINE + RUNTIME STATE
      Per-workflow run state, namespaced by workflow id:
        { idx, frontier, stepState: { [stepId]: { checkedDone, outputs } } }
      Completion and gates computed live. `frontier` is the furthest
      committed sub-stage; chevrons browse, "Advance" commits.
   ============================================================ */

const gate = { type: "hybrid" };

/* ---------------- CONFIG 1: Presales Pursuit ---------------- */
const PRESALES = {
  id: "presales-pursuit",
  name: "Presales Pursuit",
  short: "Presales",
  subject: { stepId: "intake", outputId: "facts", field: "client", fallback: "the client" },
  mainStages: [
    {
      id: "rfp", name: "RFP",
      subStages: [
        {
          id: "start", name: "Start", gate,
          description: "Intake and qualify the opportunity.",
          steps: [
            { id: "intake", name: "Opportunity Intake", required: true,
              description: "Capture the deal facts up front so every later stage can reference them.",
              outputs: [{ id: "facts", type: "fields", label: "Deal facts",
                fields: [
                  { key: "client", label: "Client" },
                  { key: "industry", label: "Industry" },
                  { key: "dealSize", label: "Deal size" },
                  { key: "responseDue", label: "Response due" },
                ] }] },
            { id: "rfp-upload", name: "RFP Upload", required: true,
              description: "Attach the RFP document and any addenda.",
              outputs: [{ id: "doc", type: "file", label: "RFP document" }] },
            { id: "qualify", name: "Qualification Check", required: true,
              description: "Go/no-go: fit, timeline, incumbents, budget signals.",
              aiPrompt: "Draft a qualification assessment (go/no-go). Cover solution fit, timeline feasibility, incumbent risk, and budget signals.",
              outputs: [{ id: "out", type: "text", label: "Go / no-go assessment" }] },
          ],
        },
        {
          id: "review", name: "RFP Review", gate,
          description: "Break the RFP down into what the customer actually needs.",
          steps: [
            { id: "pain-points", name: "Pain Points", required: true,
              description: "Stated and implied pain points, ranked.",
              aiPrompt: "Extract and rank the customer's stated and implied pain points from the RFP context.",
              outputs: [{ id: "out", type: "text", label: "Pain points" }] },
            { id: "requirements", name: "Requirements Extract", required: true,
              description: "Functional and non-functional requirements.",
              aiPrompt: "Produce a structured requirements list (functional and non-functional) from the RFP context.",
              outputs: [{ id: "out", type: "text", label: "Requirements" }] },
            { id: "customer-research", name: "Customer Research",
              description: "Org structure, strategy, recent news, tech estate.",
              aiPrompt: "Summarize what a presales architect should know about this customer: strategy, structure, technology estate, recent news.",
              outputs: [{ id: "out", type: "text", label: "Research notes" }] },
            { id: "industry-research", name: "Industry Research",
              description: "Sector trends, regulatory pressures, comparable deals.",
              aiPrompt: "Summarize industry trends, regulatory pressures, and comparable transformation patterns relevant to this opportunity.",
              outputs: [{ id: "out", type: "text", label: "Research notes" }] },
          ],
        },
        {
          id: "solutioning", name: "Solutioning", gate,
          description: "Shape the solution against the requirements.",
          steps: [
            { id: "product-alignment", name: "Product Alignment", required: true,
              description: "Map requirements to product capabilities.",
              aiPrompt: "Map the extracted requirements to product capabilities, flagging strong fits and gaps.",
              outputs: [{ id: "out", type: "text", label: "Alignment map" }] },
            { id: "functional-arch", name: "Functional Architecture", required: true,
              description: "Capability map and process coverage.",
              aiPrompt: "Draft a functional architecture narrative: capability domains, process coverage, personas served.",
              outputs: [{ id: "out", type: "text", label: "Functional architecture" }] },
            { id: "technical-arch", name: "Technical Architecture", required: true,
              description: "Integration, data, security, environments.",
              aiPrompt: "Draft a technical architecture narrative: integration approach, data flows, security posture, environment strategy.",
              outputs: [{ id: "out", type: "text", label: "Technical architecture" }] },
            { id: "fit-gap", name: "Fit Gap & Configurations", required: true,
              description: "Where config ends and customization begins.",
              aiPrompt: "Produce a fit-gap summary: configuration vs customization vs ISV, with risk notes.",
              outputs: [{ id: "out", type: "text", label: "Fit-gap summary" }] },
          ],
        },
        {
          id: "proposal", name: "Proposal Draft", gate,
          description: "Turn the solution into a winning response.",
          steps: [
            { id: "win-themes", name: "Win Themes", required: true,
              description: "The three to five reasons we win this deal.",
              aiPrompt: "Propose 3 to 5 win themes grounded in the pain points and solution shape.",
              outputs: [{ id: "out", type: "text", label: "Win themes" }] },
            { id: "exec-summary", name: "Executive Summary", required: true,
              description: "One page, customer language, outcome led.",
              aiPrompt: "Draft a one-page executive summary in the customer's language, led by business outcomes.",
              outputs: [{ id: "out", type: "text", label: "Executive summary" }] },
            { id: "solution-narrative", name: "Solution Narrative", required: true,
              description: "The full response body mapped to RFP sections.",
              aiPrompt: "Draft the solution narrative mapped to the RFP's requirement areas.",
              outputs: [{ id: "out", type: "text", label: "Narrative", render: { kind: "markdown" } }] },
            { id: "pricing-approach", name: "Pricing Approach",
              description: "Commercial structure and rationale.",
              outputs: [{ id: "out", type: "text", label: "Pricing approach" }] },
          ],
        },
        {
          id: "demo", name: "Demonstration", gate,
          description: "Prove it on screen.",
          steps: [
            { id: "demo-script", name: "Demo Script", required: true,
              description: "Scenario, personas, talk track, wow moments.",
              aiPrompt: "Draft a demo script: scenario, personas, click path beats, and two wow moments tied to the win themes.",
              outputs: [{ id: "out", type: "text", label: "Demo script", render: { kind: "markdown" } }] },
            { id: "demo-data", name: "Demo Data",
              description: "Realistic records that mirror the customer's world.",
              outputs: [
                { id: "file", type: "file", label: "Data set" },
                { id: "inventory", type: "data", label: "Build inventory",
                  render: { kind: "cards", options: { title: "name", subtitle: "purpose" } } },
                { id: "automations", type: "data", label: "Automation map",
                  render: { kind: "flow" } },
              ] },
            { id: "demo-build", name: "Demo Build", required: true,
              description: "Environment configured and dry run complete." },
          ],
        },
      ],
    },
    {
      id: "proposal-demo", name: "Proposal & Demo",
      subStages: [
        {
          id: "orals", name: "Orals Prep", gate,
          description: "Prepare the team to present and defend.",
          steps: [
            { id: "deck", name: "Presentation Deck", required: true,
              description: "Orals deck built on the win themes.",
              outputs: [{ id: "file", type: "file", label: "Deck" }] },
            { id: "qna", name: "Q&A Prep",
              description: "Anticipated questions and assigned owners.",
              aiPrompt: "Generate the 15 hardest questions the evaluation panel could ask, with suggested answers.",
              outputs: [{ id: "out", type: "text", label: "Q&A bank" }] },
          ],
        },
        {
          id: "delivery", name: "Delivery", gate,
          description: "Present, demo, and follow through.",
          steps: [
            { id: "demo-delivery", name: "Demo Delivery", required: true,
              description: "Run the session; capture reactions and objections." },
            { id: "followups", name: "Follow-ups",
              description: "Answers, clarifications, supplementary material.",
              outputs: [{ id: "out", type: "text", label: "Follow-up log" }] },
          ],
        },
      ],
    },
    {
      id: "sow", name: "SOW",
      subStages: [
        {
          id: "scope", name: "Scope Definition", gate,
          description: "Pin down what is in and what is out.",
          steps: [
            { id: "scope-statement", name: "Scope Statement", required: true,
              description: "In-scope, out-of-scope, phase boundaries.",
              aiPrompt: "Draft a scope statement: in-scope, out-of-scope, and phase boundaries based on the solution shape.",
              outputs: [{ id: "out", type: "text", label: "Scope statement" }] },
            { id: "assumptions", name: "Assumptions & Dependencies",
              description: "Everything the estimate leans on.",
              outputs: [{ id: "out", type: "text", label: "Assumptions" }] },
          ],
        },
        {
          id: "estimate", name: "Estimation", gate,
          description: "Effort, team shape, and commercials.",
          steps: [
            { id: "effort", name: "Effort Estimate", required: true,
              description: "Workstream estimates with confidence levels.",
              outputs: [{ id: "out", type: "text", label: "Estimate" }] },
            { id: "pricing-model", name: "Pricing Model",
              description: "T&M, fixed, or hybrid, with rationale.",
              outputs: [{ id: "out", type: "text", label: "Pricing model" }] },
          ],
        },
        {
          id: "sow-draft", name: "SOW Draft", gate: { type: "strict" },
          description: "The document that gets signed.",
          steps: [
            { id: "sow-doc", name: "SOW Document", required: true,
              description: "Full statement of work draft.",
              outputs: [{ id: "file", type: "file", label: "SOW document" }] },
            { id: "legal", name: "Legal Review",
              description: "Redlines resolved, ready for signature." },
          ],
        },
      ],
    },
  ],
};

/* ---------------- CONFIG 2: Hiring ---------------- */
const HIRING = {
  id: "hiring-pipeline",
  name: "Hiring Pipeline",
  short: "Hiring",
  subject: { stepId: "h-intake", outputId: "facts", field: "role", fallback: "the role" },
  mainStages: [
    {
      id: "h-open", name: "Open Role",
      subStages: [
        {
          id: "h-define", name: "Define", gate,
          description: "Define the role before anyone sources a single candidate.",
          steps: [
            { id: "h-intake", name: "Role Definition", required: true,
              description: "The facts every later stage references.",
              outputs: [{ id: "facts", type: "fields", label: "Role facts",
                fields: [
                  { key: "role", label: "Role title" },
                  { key: "level", label: "Level" },
                  { key: "team", label: "Team" },
                  { key: "location", label: "Location" },
                ] }] },
            { id: "h-jd", name: "Job Description", required: true,
              description: "Responsibilities, qualifications, comp range.",
              aiPrompt: "Draft a job description: responsibilities, must-have and nice-to-have qualifications, and what makes the role compelling.",
              outputs: [{ id: "out", type: "text", label: "Job description" }] },
          ],
        },
        {
          id: "h-approve", name: "Approve", gate,
          description: "Headcount and budget sign-off.",
          steps: [
            { id: "h-headcount", name: "Headcount Approval", required: true,
              description: "Budget owner has signed off on the req." },
            { id: "h-posting", name: "Posting Live",
              description: "Role published to job boards and careers site.",
              outputs: [{ id: "out", type: "link", label: "Posting URL" }] },
          ],
        },
      ],
    },
    {
      id: "h-source", name: "Source & Screen",
      subStages: [
        {
          id: "h-sourcing", name: "Source", gate,
          description: "Build the candidate pipeline.",
          steps: [
            { id: "h-plan", name: "Sourcing Plan", required: true,
              description: "Channels, search strings, target companies.",
              aiPrompt: "Draft a sourcing plan: channels, boolean search strings, and target companies for this role.",
              outputs: [{ id: "out", type: "text", label: "Sourcing plan" }] },
            { id: "h-pipeline", name: "Pipeline Log",
              description: "Candidates identified and contacted.",
              outputs: [{ id: "out", type: "text", label: "Pipeline" }] },
          ],
        },
        {
          id: "h-screen", name: "Screen", gate,
          description: "Filter to a shortlist worth interviewing.",
          steps: [
            { id: "h-criteria", name: "Screening Criteria", required: true,
              description: "What passes and what fails at the screen.",
              outputs: [{ id: "out", type: "text", label: "Criteria" }] },
            { id: "h-shortlist", name: "Shortlist", required: true,
              description: "Candidates advancing to the loop.",
              outputs: [{ id: "out", type: "text", label: "Shortlist" }] },
          ],
        },
      ],
    },
    {
      id: "h-interview", name: "Interview",
      subStages: [
        {
          id: "h-loop", name: "Loop Design", gate,
          description: "Design the interview loop.",
          steps: [
            { id: "h-loop-plan", name: "Interview Loop", required: true,
              description: "Rounds, interviewers, and what each round assesses.",
              aiPrompt: "Design an interview loop for this role: rounds, what each assesses, and suggested interviewer profiles.",
              outputs: [{ id: "out", type: "text", label: "Loop plan" }] },
          ],
        },
        {
          id: "h-debrief", name: "Debrief", gate,
          description: "Decide.",
          steps: [
            { id: "h-scorecards", name: "Scorecards", required: true,
              description: "Collected feedback per candidate.",
              outputs: [{ id: "out", type: "text", label: "Scorecards" }] },
            { id: "h-decision", name: "Hire Decision", required: true,
              description: "Who gets the offer and why.",
              outputs: [{ id: "out", type: "text", label: "Decision" }] },
          ],
        },
      ],
    },
    {
      id: "h-offer", name: "Offer",
      subStages: [
        {
          id: "h-comp", name: "Approval", gate,
          description: "Build and approve the package.",
          steps: [
            { id: "h-package", name: "Comp Package", required: true,
              description: "The numbers.",
              outputs: [{ id: "comp", type: "fields", label: "Compensation",
                fields: [
                  { key: "base", label: "Base" },
                  { key: "bonus", label: "Bonus" },
                  { key: "equity", label: "Equity" },
                ] }] },
            { id: "h-comp-approve", name: "Approval", required: true,
              description: "Comp approved by the chain.",
              outputs: [{ id: "out", type: "text", label: "Approval notes" }] },
          ],
        },
        {
          id: "h-close", name: "Close", gate: { type: "strict" },
          description: "Get the signature.",
          steps: [
            { id: "h-letter", name: "Offer Letter", required: true,
              description: "The formal offer document.",
              outputs: [{ id: "out", type: "link", label: "Offer letter" }] },
            { id: "h-accept", name: "Acceptance", required: true,
              description: "Signed acceptance and start date.",
              outputs: [{ id: "out", type: "text", label: "Acceptance / start date" }] },
          ],
        },
      ],
    },
  ],
};

/* ---------------- CONFIG 3: Customer Onboarding ---------------- */
const ONBOARDING = {
  id: "customer-onboarding",
  name: "Customer Onboarding",
  short: "Onboarding",
  subject: { stepId: "ob-account", outputId: "facts", field: "customer", fallback: "the customer" },
  mainStages: [
    {
      id: "ob-kick", name: "Kickoff",
      subStages: [
        {
          id: "ob-setup", name: "Setup", gate,
          description: "Lock the basics so the rest of onboarding has context.",
          steps: [
            { id: "ob-account", name: "Account Details", required: true,
              description: "Who they are and what they bought.",
              outputs: [{ id: "facts", type: "fields", label: "Account facts",
                fields: [
                  { key: "customer", label: "Customer" },
                  { key: "plan", label: "Plan / tier" },
                  { key: "csm", label: "CSM" },
                  { key: "goLive", label: "Go-live target" },
                ] }] },
            { id: "ob-contract", name: "Contract on File",
              description: "Signed agreement and order form.",
              outputs: [{ id: "doc", type: "file", label: "Contract" }] },
          ],
        },
        {
          id: "ob-call", name: "Kickoff Call", gate,
          description: "Set expectations and the plan.",
          steps: [
            { id: "ob-agenda", name: "Kickoff Agenda", required: true,
              description: "Agenda, attendees, success framing.",
              aiPrompt: "Draft a customer kickoff call agenda: introductions, success criteria framing, timeline, and responsibilities.",
              outputs: [{ id: "out", type: "text", label: "Agenda" }] },
            { id: "ob-notes", name: "Kickoff Notes", required: true,
              description: "Decisions and commitments from the call.",
              outputs: [{ id: "out", type: "text", label: "Notes" }] },
          ],
        },
      ],
    },
    {
      id: "ob-discovery", name: "Discovery",
      subStages: [
        {
          id: "ob-current", name: "Current State", gate,
          description: "How they work today.",
          steps: [
            { id: "ob-as-is", name: "Current State Assessment", required: true,
              description: "Processes, systems, and pain today.",
              aiPrompt: "Draft a current state assessment outline: processes, systems, data sources, and pain points to validate with the customer.",
              outputs: [{ id: "out", type: "text", label: "Assessment" }] },
          ],
        },
        {
          id: "ob-success", name: "Success Plan", gate,
          description: "What good looks like.",
          steps: [
            { id: "ob-criteria", name: "Success Criteria", required: true,
              description: "Measurable outcomes the customer signs up to.",
              outputs: [{ id: "out", type: "text", label: "Success criteria" }] },
            { id: "ob-milestones", name: "Milestone Plan",
              description: "Dated milestones to go-live.",
              outputs: [{ id: "out", type: "text", label: "Milestones" }] },
          ],
        },
      ],
    },
    {
      id: "ob-config", name: "Configuration",
      subStages: [
        {
          id: "ob-configure", name: "Configure", gate,
          description: "Stand the solution up.",
          steps: [
            { id: "ob-config-log", name: "Configuration Log", required: true,
              description: "What was configured and why.",
              outputs: [{ id: "out", type: "text", label: "Config log" }] },
            { id: "ob-integrations", name: "Integrations",
              description: "Connected systems and data flows.",
              outputs: [{ id: "out", type: "text", label: "Integrations" }] },
          ],
        },
        {
          id: "ob-validate", name: "Validate", gate,
          description: "Customer confirms it works.",
          steps: [
            { id: "ob-uat", name: "UAT Results", required: true,
              description: "Test outcomes and resolved issues.",
              outputs: [{ id: "out", type: "text", label: "UAT results" }] },
            { id: "ob-signoff", name: "Customer Sign-off", required: true,
              description: "Written acceptance to proceed to go-live." },
          ],
        },
      ],
    },
    {
      id: "ob-golive", name: "Go-Live",
      subStages: [
        {
          id: "ob-launch", name: "Launch", gate,
          description: "Flip the switch.",
          steps: [
            { id: "ob-checklist", name: "Go-Live Checklist", required: true,
              description: "Cutover steps, owners, rollback plan.",
              outputs: [{ id: "out", type: "text", label: "Checklist" }] },
            { id: "ob-comms", name: "Launch Comms",
              description: "Announcement to customer end users.",
              aiPrompt: "Draft a go-live announcement to the customer's end users: what is changing, when, and where to get help.",
              outputs: [{ id: "out", type: "text", label: "Comms" }] },
          ],
        },
        {
          id: "ob-handover", name: "Handover", gate,
          description: "From onboarding to ongoing success.",
          steps: [
            { id: "ob-handover-doc", name: "Handover Summary", required: true,
              description: "State of the account for the ongoing CSM.",
              outputs: [{ id: "out", type: "text", label: "Handover" }] },
            { id: "ob-health", name: "First Health Check",
              description: "30-day adoption review scheduled." },
          ],
        },
      ],
    },
  ],
};

/* ---------------- CONFIG 4: Product Launch ---------------- */
const LAUNCH = {
  id: "product-launch",
  name: "Product Launch",
  short: "Launch",
  subject: { stepId: "pl-brief", outputId: "facts", field: "product", fallback: "the product" },
  mainStages: [
    {
      id: "pl-plan", name: "Plan",
      subStages: [
        {
          id: "pl-define", name: "Brief", gate,
          description: "What we are launching and for whom.",
          steps: [
            { id: "pl-brief", name: "Launch Brief", required: true,
              description: "The facts every later stage references.",
              outputs: [{ id: "facts", type: "fields", label: "Launch facts",
                fields: [
                  { key: "product", label: "Product / feature" },
                  { key: "audience", label: "Target audience" },
                  { key: "date", label: "Launch date" },
                  { key: "tier", label: "Launch tier" },
                ] }] },
            { id: "pl-positioning", name: "Positioning", required: true,
              description: "Category, differentiation, proof.",
              aiPrompt: "Draft positioning: category, target customer, differentiation, and proof points.",
              outputs: [{ id: "out", type: "text", label: "Positioning" }] },
          ],
        },
      ],
    },
    {
      id: "pl-build", name: "Build",
      subStages: [
        {
          id: "pl-readiness", name: "Readiness", gate,
          description: "Is the product actually ready.",
          steps: [
            { id: "pl-feature-status", name: "Feature Readiness", required: true,
              description: "Scope locked, quality bar met.",
              outputs: [{ id: "out", type: "text", label: "Readiness status" }] },
            { id: "pl-docs", name: "Documentation",
              description: "Help docs and release notes drafted.",
              outputs: [{ id: "out", type: "link", label: "Docs link" }] },
          ],
        },
      ],
    },
    {
      id: "pl-gtm", name: "GTM",
      subStages: [
        {
          id: "pl-messaging", name: "Messaging", gate,
          description: "The story and the price.",
          steps: [
            { id: "pl-message", name: "Messaging Framework", required: true,
              description: "Headline, pillars, objection handling.",
              aiPrompt: "Draft a messaging framework: headline message, three pillars, and objection handling.",
              outputs: [{ id: "out", type: "text", label: "Messaging" }] },
            { id: "pl-pricing", name: "Pricing & Packaging",
              description: "How it is sold.",
              outputs: [{ id: "out", type: "text", label: "Pricing" }] },
          ],
        },
        {
          id: "pl-enable", name: "Enablement", gate,
          description: "Arm the field.",
          steps: [
            { id: "pl-sales-enable", name: "Sales Enablement", required: true,
              description: "Pitch deck, battlecard, demo flow.",
              outputs: [{ id: "out", type: "text", label: "Enablement plan" }] },
            { id: "pl-assets", name: "Launch Assets",
              description: "Web, video, social, PR assets.",
              outputs: [{ id: "file", type: "file", label: "Asset pack" }] },
          ],
        },
      ],
    },
    {
      id: "pl-launch", name: "Launch",
      subStages: [
        {
          id: "pl-go", name: "Go", gate,
          description: "Ship it.",
          steps: [
            { id: "pl-checklist", name: "Launch Checklist", required: true,
              description: "Day-of sequence, owners, contingencies.",
              outputs: [{ id: "out", type: "text", label: "Checklist" }] },
            { id: "pl-announce", name: "Announcement", required: true,
              description: "The public post.",
              aiPrompt: "Draft the launch announcement: what it is, who it is for, why it matters, and the call to action.",
              outputs: [{ id: "out", type: "text", label: "Announcement" }] },
          ],
        },
        {
          id: "pl-review", name: "Review", gate,
          description: "Did it work.",
          steps: [
            { id: "pl-metrics", name: "Launch Metrics",
              description: "Adoption, pipeline, coverage.",
              outputs: [{ id: "out", type: "text", label: "Metrics" }] },
            { id: "pl-retro", name: "Retro", required: true,
              description: "What to repeat and what to fix.",
              outputs: [{ id: "out", type: "text", label: "Retro" }] },
          ],
        },
      ],
    },
  ],
};

const WORKFLOWS = [PRESALES, HIRING, ONBOARDING, LAUNCH];
const STORAGE_KEY = "procflow-suite-v1";

/* ---------- engine helpers ---------- */
const flattenSubs = (def) => {
  const out = [];
  def.mainStages.forEach((ms, mi) =>
    ms.subStages.forEach((ss, si) =>
      out.push({ ...ss, mainId: ms.id, mainName: ms.name, mainIndex: mi, subIndex: si })
    )
  );
  return out;
};

const emptyRun = () => ({ idx: 0, frontier: 0, stepState: {} });
const emptyStep = () => ({ checkedDone: false, outputs: {} });

/* Optional UI behaviors, kept in sync with @sqnce/react:
   WORKFLOW_GROUPS groups the switcher ([{ label, ids }] or null for flat);
   SEED_RUNS pre-populates runs by workflow id (used when no stored run
   exists and by Reset). Both default to off in this artifact. */
const WORKFLOW_GROUPS = null;
const SEED_RUNS = {};
/* Custom renderer registry, kept in sync with the @sqnce/react
   renderers prop. Defaults to off in this artifact: built-in kinds
   (markdown, table, cards, keyvalue) and the JSON tree fallback still
   apply, same as omitting the prop. */
const RENDERERS = null;
const initialRunFor = (workflowId) =>
  SEED_RUNS[workflowId] ? structuredClone(SEED_RUNS[workflowId]) : emptyRun();

/* Mirrors the @sqnce/react generateDraft signature: (prompt, context)
   where context is { workflowId, stepId, subject }. This artifact's
   implementation calls the Anthropic API and does not need the context. */
const generateDraft = async (prompt, context = {}) => {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  return (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
};

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
          <span className="pf-switch-label">{s.label || " "}</span>
          <SwitcherButtons workflows={s.workflows} activeId={activeId} onSwitch={onSwitch} />
        </div>
      ))}
    </div>
  );
}

const hasValue = (spec, val) => {
  if (val == null) return false;
  if (spec.type === "text" || spec.type === "link") return String(val).trim().length > 0;
  if (spec.type === "fields") return Object.values(val).some((v) => String(v || "").trim().length > 0);
  if (spec.type === "file") return !!val.name;
  if (spec.type === "data") {
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === "object") return Object.keys(val).length > 0;
    return String(val).trim().length > 0;
  }
  return false;
};

const stepHasAnyOutput = (step, st) =>
  (step.outputs || []).some((spec) => hasValue(spec, (st.outputs || {})[spec.id]));

const stepComplete = (step, st, gateType) => {
  if (gateType === "strict") return !!st.checkedDone;
  return !!st.checkedDone || stepHasAnyOutput(step, st);
};

/* ---------------- output rendering, kept in sync with @sqnce/react ----
   Renderer contract: a renderer is a pure presentation component
   receiving { spec, value, onChange, context }. onChange carries value
   mutations only; renderer view state stays internal, because
   serializeStep feeds values into LLM draft prompts.
   context = { workflowId, stepId, subject, readOnly, expanded }. */

function JtNode({ k, v, depth }) {
  const label = k != null ? <span className="pf-jt-key">{k}: </span> : null;
  if (v === null || typeof v !== "object") {
    return (
      <div className="pf-jt-leaf">
        {label}
        <span className={`pf-jt-${v === null ? "null" : typeof v}`}>{JSON.stringify(v)}</span>
      </div>
    );
  }
  const entries = Array.isArray(v) ? v.map((x, i) => [i, x]) : Object.entries(v);
  return (
    <details className="pf-jt-node" open={depth < 1}>
      <summary>
        {label}
        <span className="pf-jt-meta">{Array.isArray(v) ? `[${entries.length}]` : `{${entries.length}}`}</span>
      </summary>
      <div className="pf-jt-children">
        {entries.map(([ck, cv]) => (
          <JtNode key={String(ck)} k={String(ck)} v={cv} depth={depth + 1} />
        ))}
      </div>
    </details>
  );
}

function JsonTree({ value }) {
  return (
    <div className="pf-jt">
      <JtNode v={value === undefined ? null : value} depth={0} />
    </div>
  );
}

function KeyValue({ value }) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return <JsonTree value={value} />;
  }
  return (
    <div className="pf-kv">
      {Object.entries(value).map(([k, v]) => (
        <div key={k} className="pf-kv-row">
          <div className="pf-kv-key">{k}</div>
          <div className="pf-kv-val">{v == null || typeof v !== "object" ? String(v) : JSON.stringify(v)}</div>
        </div>
      ))}
    </div>
  );
}

function DataTable({ value }) {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.some((r) => r == null || typeof r !== "object" || Array.isArray(r))
  ) {
    return <JsonTree value={value} />;
  }
  const cols = [];
  value.slice(0, 50).forEach((row) =>
    Object.keys(row).forEach((k) => {
      if (!cols.includes(k)) cols.push(k);
    })
  );
  const cell = (v) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v).slice(0, 80) : String(v));
  return (
    <table className="pf-table">
      <thead>
        <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {value.map((row, i) => (
          <tr key={i}>{cols.map((c) => <td key={c}>{cell(row[c])}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

function Cards({ spec, value }) {
  const [sel, setSel] = useState(0);
  if (!Array.isArray(value) || !value.length) return <JsonTree value={value} />;
  const opts = (spec && spec.render && spec.render.options) || {};
  const titleOf = (item, i) => {
    if (item == null || typeof item !== "object") return String(item);
    return String((opts.title && item[opts.title]) || item.name || item.title || item.id || `Item ${i + 1}`);
  };
  const subOf = (item) => {
    if (item == null || typeof item !== "object") return "";
    return String((opts.subtitle && item[opts.subtitle]) || item.purpose || item.description || "");
  };
  const idx = Math.min(sel, value.length - 1);
  const current = value[idx];
  return (
    <div className="pf-cards">
      <div className="pf-cards-list">
        {value.map((item, i) => (
          <button key={i} className={`pf-cards-item ${i === idx ? "pf-cards-active" : ""}`} onClick={() => setSel(i)}>
            <div className="pf-cards-title">{titleOf(item, i)}</div>
            {subOf(item) && <div className="pf-cards-sub">{subOf(item).slice(0, 90)}</div>}
          </button>
        ))}
      </div>
      <div className="pf-cards-detail">
        {current != null && typeof current === "object" && !Array.isArray(current) ? (
          <KeyValue value={current} />
        ) : (
          <JsonTree value={current} />
        )}
      </div>
    </div>
  );
}

const MD_TOKEN = /(`[^`]+`)|(\*\*[^*]+?\*\*)|(\*[^*]+?\*)|(\[[^\]]+\]\([^)\s]+\))/;

function mdInline(text) {
  const out = [];
  let rest = String(text);
  let i = 0;
  while (rest.length) {
    const m = rest.match(MD_TOKEN);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) out.push(<code key={i}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("**")) out.push(<strong key={i}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("*")) out.push(<em key={i}>{tok.slice(1, -1)}</em>);
    else {
      const mm = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      const safe = /^(https?:|mailto:|#)/i.test(mm[2]);
      out.push(
        safe ? (
          <a key={i} href={mm[2]} target="_blank" rel="noreferrer">
            {mm[1]}
          </a>
        ) : (
          `${mm[1]} (${mm[2]})`
        )
      );
    }
    rest = rest.slice(m.index + tok.length);
    i++;
  }
  return out;
}

const MD_BLOCK_START = /^(#{1,6}\s|```|>|\s*[-*]\s+|\s*\d+\.\s+|(-{3,}|\*{3,})\s*$)/;

function Markdown({ value }) {
  const lines = String(value || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  let key = 0;
  const splitRow = (l) =>
    l.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={key++} className="pf-md-pre">
          <code>{buf.join("\n")}</code>
        </pre>
      );
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const Tag = `h${h[1].length}`;
      blocks.push(<Tag key={key++}>{mdInline(h[2])}</Tag>);
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push(<hr key={key++} />);
      i++;
      continue;
    }
    if (line.startsWith(">")) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith(">")) buf.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={key++}>{mdInline(buf.join(" "))}</blockquote>);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i]))
        items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ""));
      const Tag = ordered ? "ol" : "ul";
      blocks.push(
        <Tag key={key++}>
          {items.map((t, j) => (
            <li key={j}>{mdInline(t)}</li>
          ))}
        </Tag>
      );
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const body = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) body.push(splitRow(lines[i++]));
      blocks.push(
        <table key={key++} className="pf-table">
          <thead>
            <tr>{head.map((c, j) => <th key={j}>{mdInline(c)}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((r, ri) => (
              <tr key={ri}>{r.map((c, ci) => <td key={ci}>{mdInline(c)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      );
      continue;
    }
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !MD_BLOCK_START.test(lines[i])) buf.push(lines[i++]);
    blocks.push(<p key={key++}>{mdInline(buf.join(" "))}</p>);
  }
  return <div className="pf-md">{blocks}</div>;
}

const BUILTIN_RENDERERS = {
  markdown: Markdown,
  table: DataTable,
  cards: Cards,
  keyvalue: KeyValue,
};

function RenderOverlay({ label, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  /* Portal to body: the rolodex cards are CSS-transformed, which would
     trap position: fixed overlays inside the card. */
  return createPortal(
    <div className="pf-overlay" role="dialog" aria-modal="true">
      <div className="pf-overlay-head">
        <span className="pf-overlay-title">{label}</span>
        <button className="pf-btn pf-btn-sm" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="pf-overlay-body">{children}</div>
    </div>,
    document.body
  );
}

function RenderView({ Renderer, spec, value, onChange, context }) {
  return (
    <Suspense fallback={<div className="pf-render-loading">Loading view…</div>}>
      <Renderer spec={spec} value={value} onChange={onChange} context={context} />
    </Suspense>
  );
}

function RawJsonEditor({ value, onChange, onDone }) {
  const [draft, setDraft] = useState(() => JSON.stringify(value === undefined ? null : value, null, 2));
  const [error, setError] = useState(null);
  const apply = () => {
    try {
      onChange(JSON.parse(draft));
      setError(null);
      onDone();
    } catch (e) {
      setError("Invalid JSON: " + e.message);
    }
  };
  return (
    <div>
      <textarea className="pf-ta pf-ta-mono" value={draft} onChange={(e) => setDraft(e.target.value)} />
      {error && <div className="pf-error">{error}</div>}
      <div className="pf-actions">
        <button className="pf-btn pf-btn-sm" onClick={apply}>
          Apply
        </button>
        <button className="pf-btn pf-btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function DefaultEditor({ spec, value, onChange, onAttach }) {
  if (spec.type === "text")
    return (
      <textarea
        className="pf-ta"
        placeholder="Write the output or generate a draft."
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  if (spec.type === "link")
    return (
      <input
        className="pf-field-input pf-link-input"
        placeholder="https://"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  if (spec.type === "fields")
    return (
      <div className="pf-fields">
        {spec.fields.map((f) => (
          <label key={f.key} className="pf-field">
            <span>{f.label}</span>
            <input
              className="pf-field-input"
              value={(value && value[f.key]) || ""}
              onChange={(e) => onChange({ ...(value || {}), [f.key]: e.target.value })}
            />
          </label>
        ))}
      </div>
    );
  if (spec.type === "file")
    return (
      <>
        {value && value.name ? (
          <div className="pf-filechip">📎 {value.name}</div>
        ) : (
          <div className="pf-filechip pf-filechip-empty">No file attached</div>
        )}
        <button className="pf-btn pf-btn-sm" onClick={onAttach}>
          {value && value.name ? "Replace file" : "Attach file"}
        </button>
      </>
    );
  return null;
}

function OutputView({ spec, value, onChange, onAttach, renderers, context }) {
  const kind = spec.render && spec.render.kind;
  const Custom = kind ? (renderers && renderers[kind]) || BUILTIN_RENDERERS[kind] : null;
  const isData = spec.type === "data";
  const Renderer = Custom || (isData ? JsonTree : null);
  const filled = hasValue(spec, value);
  const viewValue = spec.type === "file" ? (value && value.content) || "" : value;
  /* Mode is initialized once at mount; deriving it per render would flip
     an empty hinted output from edit to view on the first keystroke. */
  const [mode, setMode] = useState(() => (isData ? "view" : Renderer && filled ? "view" : "edit"));
  const [big, setBig] = useState(false);

  const body =
    Renderer && mode === "view" ? (
      filled ? (
        <div className="pf-render">
          <button className="pf-render-expand" title="Expand" onClick={() => setBig(true)}>
            ⛶
          </button>
          <RenderView
            Renderer={Renderer}
            spec={spec}
            value={viewValue}
            onChange={onChange}
            context={{ ...context, expanded: false }}
          />
        </div>
      ) : (
        <div className="pf-filechip pf-filechip-empty">{isData ? "No data yet" : "Nothing to show yet"}</div>
      )
    ) : isData ? (
      <RawJsonEditor value={value} onChange={onChange} onDone={() => setMode("view")} />
    ) : (
      <DefaultEditor spec={spec} value={value} onChange={onChange} onAttach={onAttach} />
    );

  const toggle =
    Renderer && mode === "view" && spec.type !== "file" ? (
      <button className="pf-render-toggle" onClick={() => setMode("edit")}>
        {isData ? "Edit JSON" : "Edit"}
      </button>
    ) : Renderer && mode === "edit" && !isData && filled ? (
      <button className="pf-render-toggle" onClick={() => setMode("view")}>
        View
      </button>
    ) : null;

  return (
    <div className="pf-out">
      <div className="pf-out-head">
        <div className="pf-out-label">{spec.label}</div>
        {toggle}
      </div>
      {body}
      {big && Renderer && (
        <RenderOverlay label={spec.label} onClose={() => setBig(false)}>
          <RenderView
            Renderer={Renderer}
            spec={spec}
            value={viewValue}
            onChange={onChange}
            context={{ ...context, expanded: true }}
          />
        </RenderOverlay>
      )}
    </div>
  );
}

export default function ProcessRolodex() {
  const [activeId, setActiveId] = useState(WORKFLOWS[0].id);
  const [runs, setRuns] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [generating, setGenerating] = useState(null);
  const [genError, setGenError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [showInputs, setShowInputs] = useState(false);
  const fileRef = useRef(null);
  const attachFor = useRef(null);
  const saveTimer = useRef(null);

  const def = useMemo(() => WORKFLOWS.find((w) => w.id === activeId) || WORKFLOWS[0], [activeId]);
  const subs = useMemo(() => flattenSubs(def), [def]);
  const run = runs[activeId] || initialRunFor(activeId);
  const idx = Math.min(run.idx, subs.length - 1);
  const frontier = Math.min(run.frontier, subs.length - 1);
  const stepState = run.stepState;

  const patchRun = (patch) =>
    setRuns((prev) => ({ ...prev, [activeId]: { ...(prev[activeId] || emptyRun()), ...patch } }));

  /* ---------- persistence ---------- */
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY);
        if (res && res.value) {
          const saved = JSON.parse(res.value);
          if (saved.runs) setRuns(saved.runs);
          if (saved.activeId && WORKFLOWS.some((w) => w.id === saved.activeId)) setActiveId(saved.activeId);
        }
      } catch (e) {
        /* no saved state yet */
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await window.storage.set(STORAGE_KEY, JSON.stringify({ activeId, runs }));
      } catch (e) {
        console.error("save failed", e);
      }
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [activeId, runs, loaded]);

  const getSt = useCallback((stepId) => stepState[stepId] || emptyStep(), [stepState]);
  const patchStep = (stepId, patch) =>
    patchRun({ stepState: { ...stepState, [stepId]: { ...(stepState[stepId] || emptyStep()), ...patch } } });
  const setOutput = (stepId, outputId, value) => {
    const cur = stepState[stepId] || emptyStep();
    patchRun({ stepState: { ...stepState, [stepId]: { ...cur, outputs: { ...cur.outputs, [outputId]: value } } } });
  };

  /* ---------- gating ---------- */
  const gateProgress = useCallback(
    (sub) => {
      const gt = (sub.gate && sub.gate.type) || "hybrid";
      const req = sub.steps.filter((s) => s.required);
      const done = req.filter((s) => stepComplete(s, getSt(s.id), gt));
      return { met: done.length === req.length, done: done.length, total: req.length, gateType: gt };
    },
    [getSt]
  );

  const atFrontier = idx === frontier;
  const current = subs[idx];
  const prog = gateProgress(current);
  const nextSub = idx < subs.length - 1 ? subs[idx + 1] : null;
  const prevSub = idx > 0 ? subs[idx - 1] : null;

  const clearTransients = () => {
    setExpanded(null);
    setGenError(null);
    setShowInputs(false);
  };

  const browse = (dir) => {
    const t = idx + dir;
    if (t < 0 || t > frontier || t >= subs.length) return;
    clearTransients();
    patchRun({ idx: t });
  };

  const advance = () => {
    if (!nextSub || !atFrontier) return;
    clearTransients();
    patchRun({ idx: idx + 1, frontier: frontier + 1 });
  };

  const switchWorkflow = (id) => {
    if (id === activeId) return;
    clearTransients();
    setActiveId(id);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
      if (e.key === "ArrowLeft") browse(-1);
      if (e.key === "ArrowRight") browse(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------- subject + AI context ---------- */
  const subjectName = useMemo(() => {
    const s = def.subject;
    if (!s) return "the subject";
    const st = stepState[s.stepId];
    const val = st && st.outputs && st.outputs[s.outputId];
    return (val && String(val[s.field] || "").trim()) || s.fallback;
  }, [def, stepState]);

  const serializeStep = (sub, step) => {
    const st = getSt(step.id);
    const parts = [];
    (step.outputs || []).forEach((spec) => {
      const val = (st.outputs || {})[spec.id];
      if (!hasValue(spec, val)) return;
      if (spec.type === "text") parts.push(val);
      if (spec.type === "link") parts.push(`Link: ${val}`);
      if (spec.type === "fields")
        parts.push(spec.fields.map((f) => `${f.label}: ${val[f.key] || ""}`).filter((l) => !l.endsWith(": ")).join("\n"));
      if (spec.type === "file") parts.push(`Attached file: ${val.name}\n${(val.content || "").slice(0, 2000)}`);
      if (spec.type === "data") parts.push(`${spec.label || "Data"}:\n${JSON.stringify(val).slice(0, 2000)}`);
    });
    if (!parts.length) return null;
    return `### ${sub.mainName} / ${sub.name} / ${step.name}\n${parts.join("\n").slice(0, 2500)}`;
  };

  const buildContext = (uptoIdx) => {
    const lines = [];
    for (let i = 0; i < uptoIdx; i++) {
      const gt = (subs[i].gate && subs[i].gate.type) || "hybrid";
      subs[i].steps.forEach((s) => {
        if (!stepComplete(s, getSt(s.id), gt)) return;
        const block = serializeStep(subs[i], s);
        if (block) lines.push(block);
      });
    }
    return lines.join("\n\n");
  };

  const generate = async (sub, step) => {
    const target = (step.outputs || []).find((o) => o.type === "text");
    if (!target) return;
    setGenerating(step.id);
    setGenError(null);
    try {
      const ctx = buildContext(idx);
      const prompt = [
        `You are assisting inside a staged workflow named "${def.name}". This process concerns ${subjectName}.`,
        `Current stage: ${sub.mainName} > ${sub.name}. Current step: ${step.name} (${step.description || ""}).`,
        ctx ? `Outputs produced so far:\n\n${ctx}` : `No prior outputs exist yet; produce a strong first draft from general best practice.`,
        `Task: ${step.aiPrompt || `Draft the output for the step "${step.name}".`}`,
        `Refer to ${subjectName} by name where natural. Respond with the draft output only, concise and usable. No preamble.`,
      ].join("\n\n");
      const text = await generateDraft(prompt, {
        workflowId: def.id,
        stepId: step.id,
        subject: subjectName,
      });
      if (!text) throw new Error("Empty response");
      setOutput(step.id, target.id, text);
    } catch (e) {
      setGenError(step.id);
    }
    setGenerating(null);
  };

  /* ---------- file attach ---------- */
  const onFile = (e) => {
    const f = e.target.files && e.target.files[0];
    const tgt = attachFor.current;
    if (!f || !tgt) return;
    const finish = (content) => setOutput(tgt.stepId, tgt.outputId, { name: f.name, content: content || "" });
    if (f.type.startsWith("text") || /\.(md|txt|csv|json)$/i.test(f.name)) {
      const r = new FileReader();
      r.onload = () => finish(String(r.result).slice(0, 6000));
      r.onerror = () => finish(null);
      r.readAsText(f);
    } else {
      finish(null);
    }
    e.target.value = "";
  };

  const resetRun = () => {
    clearTransients();
    setRuns((prev) => ({ ...prev, [activeId]: initialRunFor(activeId) }));
  };

  /* ---------- derived for render ---------- */
  const prevDoneBlocks = prevSub
    ? prevSub.steps
        .map((s) => ({ step: s, st: getSt(s.id) }))
        .filter(({ step, st }) =>
          stepComplete(step, st, (prevSub.gate && prevSub.gate.type) || "hybrid") && stepHasAnyOutput(step, st)
        )
    : [];

  const missing = current.steps
    .filter((s) => s.required && !stepComplete(s, getSt(s.id), prog.gateType))
    .map((s) => s.name);

  const statusOf = (sub, step) => {
    const gt = (sub.gate && sub.gate.type) || "hybrid";
    const st = getSt(step.id);
    if (stepComplete(step, st, gt)) return "done";
    if (stepHasAnyOutput(step, st)) return "draft";
    return "open";
  };

  /* ---------- render ---------- */
  return (
    <div className="pf-root">
      <style>{CSS}</style>
      <input type="file" ref={fileRef} style={{ display: "none" }} onChange={onFile} />

      {/* header */}
      <div className="pf-header">
        <div className="pf-brand">
          <span className="pf-brand-mark">◫</span>
          <span className="pf-brand-name">{def.name}</span>
          <span className="pf-subject">· {subjectName}</span>
        </div>
        <div className="pf-rail">
          {def.mainStages.map((ms, mi) => {
            const allDone = ms.subStages.every((ss) => gateProgress(ss).met);
            const state = mi === current.mainIndex ? "active" : allDone || mi < current.mainIndex ? "done" : "ahead";
            return (
              <React.Fragment key={ms.id}>
                {mi > 0 && <span className="pf-rail-line" />}
                <span className={`pf-rail-stage pf-rail-${state}`}>
                  <span className="pf-rail-dot" />
                  {ms.name}
                </span>
              </React.Fragment>
            );
          })}
        </div>
        <div className="pf-header-right">
          <WorkflowSwitcher
            workflows={WORKFLOWS}
            groups={WORKFLOW_GROUPS}
            activeId={activeId}
            onSwitch={switchWorkflow}
          />
          <button className="pf-reset" onClick={resetRun} title="Clear this workflow's run">
            Reset run
          </button>
        </div>
      </div>

      {/* rolodex */}
      <div className="pf-deck">
        {subs.map((sub, i) => {
          const pos = i - idx;
          if (Math.abs(pos) > 2) return null;
          const locked = i > frontier;
          const center = pos === 0;
          const p = gateProgress(sub);
          return (
            <div
              key={sub.id}
              className={`pf-card ${center ? "pf-card-center" : "pf-card-side"} ${locked ? "pf-card-locked" : ""}`}
              style={{
                transform: `translateX(calc(-50% + ${pos * 56}%)) rotateY(${pos * -28}deg) scale(${center ? 1 : 0.82})`,
                opacity: Math.abs(pos) === 2 ? 0 : center ? 1 : 0.38,
                zIndex: 10 - Math.abs(pos),
                pointerEvents: center ? "auto" : "none",
              }}
            >
              <div className="pf-card-strip">
                <span className="pf-card-code">
                  {sub.mainName.toUpperCase()} · S{sub.subIndex + 1}
                </span>
                <span className="pf-card-count">
                  {p.done}/{p.total} required{p.gateType === "strict" ? " · strict gate" : ""}
                </span>
              </div>
              <div className="pf-card-title">{sub.name}</div>
              {center && <div className="pf-card-desc">{sub.description}</div>}

              {center && prevDoneBlocks.length > 0 && (
                <div className="pf-inputs">
                  <button className="pf-inputs-toggle" onClick={() => setShowInputs(!showInputs)}>
                    {showInputs ? "▾" : "▸"} Inputs from {prevSub.name} ({prevDoneBlocks.length})
                  </button>
                  {showInputs && (
                    <div className="pf-inputs-body">
                      {prevDoneBlocks.map(({ step }) => (
                        <div key={step.id} className="pf-input-item">
                          <div className="pf-input-name">{step.name}</div>
                          <div className="pf-input-preview">
                            {(serializeStep(prevSub, step) || "").split("\n").slice(1).join(" ").slice(0, 220)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className={`pf-steps ${center ? "" : "pf-steps-side"}`}>
                {sub.steps.map((step) => {
                  const st = getSt(step.id);
                  const status = statusOf(sub, step);
                  const open = center && expanded === step.id;
                  return (
                    <div key={step.id} className={`pf-step pf-step-${status}`}>
                      <button className="pf-step-row" disabled={!center} onClick={() => setExpanded(open ? null : step.id)}>
                        <span className={`pf-dot pf-dot-${status}`} />
                        <span className="pf-step-name">
                          {step.name}
                          {step.required && <span className="pf-req">*</span>}
                        </span>
                        <span className="pf-step-state">{status === "done" ? "Done" : status === "draft" ? "Draft" : ""}</span>
                        {center && <span className="pf-chev">{open ? "−" : "+"}</span>}
                      </button>

                      {open && (
                        <div className="pf-step-body">
                          {step.description && <div className="pf-step-desc">{step.description}</div>}

                          {(step.outputs || []).map((spec) => (
                            <OutputView
                              key={spec.id}
                              spec={spec}
                              value={(st.outputs || {})[spec.id]}
                              onChange={(v) => setOutput(step.id, spec.id, v)}
                              onAttach={() => {
                                attachFor.current = { stepId: step.id, outputId: spec.id };
                                fileRef.current && fileRef.current.click();
                              }}
                              renderers={RENDERERS}
                              context={{ workflowId: def.id, stepId: step.id, subject: subjectName, readOnly: false }}
                            />
                          ))}

                          {genError === step.id && (
                            <div className="pf-error">Generation failed. Check the connection and try again.</div>
                          )}

                          <div className="pf-actions">
                            {(step.outputs || []).some((o) => o.type === "text") && (
                              <button className="pf-btn" disabled={generating === step.id} onClick={() => generate(sub, step)}>
                                {generating === step.id ? "Generating…" : "Generate draft"}
                              </button>
                            )}
                            <button
                              className={`pf-btn ${st.checkedDone ? "" : "pf-btn-primary"}`}
                              onClick={() => patchStep(step.id, { checkedDone: !st.checkedDone })}
                            >
                              {st.checkedDone ? "Reopen" : "Mark done"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {locked && (
                <div className="pf-lock">
                  <span className="pf-lock-icon">🔒</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* nav: browse chevrons + advance commit */}
      <div className="pf-nav">
        <button className="pf-nav-btn" disabled={idx === 0} onClick={() => browse(-1)}>
          ← {prevSub ? prevSub.name : "Back"}
        </button>

        <div className="pf-nav-mid">
          <div className="pf-dots">
            {subs.map((s, i) => (
              <span
                key={s.id}
                className={`pf-pip ${i === idx ? "pf-pip-active" : ""} ${i > frontier ? "pf-pip-locked" : ""}`}
                onClick={() => i <= frontier && patchRun({ idx: i })}
              />
            ))}
          </div>

          {atFrontier && nextSub && (
            <div className="pf-advance-zone">
              {prog.met ? (
                <button className="pf-advance" onClick={advance}>
                  Advance to {nextSub.name} →
                </button>
              ) : (
                <>
                  <div className="pf-gate-hint">Gate unmet: {missing.join(", ")}</div>
                  <button className="pf-override" onClick={advance}>
                    Advance anyway
                  </button>
                </>
              )}
            </div>
          )}
          {!atFrontier && (
            <div className="pf-gate-hint">Browsing history · frontier is {subs[frontier].name}</div>
          )}
          <p className="pf-legend">Fill an output or mark a step done to complete it. Required steps (*) drive the gate.</p>
        </div>

        <button className="pf-nav-btn pf-nav-fwd" disabled={idx >= frontier} onClick={() => browse(1)}>
          {idx < frontier && nextSub ? nextSub.name : "Forward"} →
        </button>
      </div>
    </div>
  );
}

/* ============================================================ CSS */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

.pf-root {
  min-height: 100vh;
  background: linear-gradient(180deg, #222932 0%, #1B2129 100%);
  font-family: 'IBM Plex Sans', system-ui, sans-serif;
  color: #23282F;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
}

/* header */
.pf-header { display: flex; align-items: center; gap: 20px; padding: 18px 28px 10px; flex-wrap: wrap; }
.pf-brand { display: flex; align-items: center; gap: 10px; color: #EDEAE0; }
.pf-brand-mark { font-size: 20px; color: #D9A441; }
.pf-brand-name { font-family: 'IBM Plex Mono', monospace; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; font-size: 13px; }
.pf-subject { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: #8A919B; }
.pf-rail { display: flex; align-items: center; gap: 10px; flex: 1; justify-content: center; flex-wrap: wrap; }
.pf-rail-stage { display: flex; align-items: center; gap: 7px; font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
.pf-rail-dot { width: 8px; height: 8px; border-radius: 50%; }
.pf-rail-active { color: #D9A441; } .pf-rail-active .pf-rail-dot { background: #D9A441; box-shadow: 0 0 8px #D9A44188; }
.pf-rail-done { color: #6FBF95; } .pf-rail-done .pf-rail-dot { background: #2E8F62; }
.pf-rail-ahead { color: #5E6772; } .pf-rail-ahead .pf-rail-dot { background: #444D58; }
.pf-rail-line { width: 34px; height: 1px; background: #3A434E; }
.pf-header-right { display: flex; align-items: center; gap: 10px; }
.pf-switch { display: flex; border: 1px solid #3A434E; border-radius: 8px; overflow: hidden; }
.pf-switch-btn {
  background: none; border: none; color: #8A919B; padding: 6px 12px; cursor: pointer;
  font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; letter-spacing: 0.04em;
}
.pf-switch-btn:not(:last-child) { border-right: 1px solid #3A434E; }
.pf-switch-btn:hover { color: #EDEAE0; }
.pf-switch-active { background: #D9A441; color: #23282F; font-weight: 600; }
.pf-switch-active:hover { color: #23282F; }
.pf-switch-groups { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; }
.pf-switch-group { display: flex; flex-direction: column; gap: 3px; align-items: flex-start; }
.pf-switch-label { font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: #5E6772; min-height: 12px; }
.pf-reset { background: none; border: 1px solid #3A434E; color: #8A919B; border-radius: 6px; padding: 5px 12px; font-size: 12px; cursor: pointer; font-family: 'IBM Plex Mono', monospace; }
.pf-reset:hover { color: #EDEAE0; border-color: #5E6772; }

/* rolodex deck */
.pf-deck { position: relative; flex: 1; min-height: 540px; perspective: 1400px; margin-top: 8px; }
.pf-card {
  position: absolute; left: 50%; top: 12px;
  width: min(560px, 88vw); max-height: calc(100% - 24px);
  background: #F1EEE3; border-radius: 10px; border: 1px solid #D8D3C2;
  box-shadow: 0 18px 50px rgba(0,0,0,0.45);
  padding: 0 0 18px;
  transition: transform 0.45s cubic-bezier(.3,.9,.3,1), opacity 0.45s;
  transform-style: preserve-3d;
  display: flex; flex-direction: column; overflow: hidden;
}
@media (prefers-reduced-motion: reduce) { .pf-card { transition: none; } }
.pf-card-strip {
  display: flex; justify-content: space-between; align-items: center;
  background: #23282F; color: #EDEAE0; padding: 8px 16px;
  font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.1em;
}
.pf-card-count { color: #D9A441; }
.pf-card-title { font-size: 26px; font-weight: 700; padding: 16px 20px 2px; letter-spacing: -0.01em; }
.pf-card-desc { padding: 0 20px 6px; font-size: 13.5px; color: #5C6068; }
.pf-card-locked .pf-card-strip { background: #3A3F46; }

/* inputs from previous */
.pf-inputs { margin: 8px 20px 0; }
.pf-inputs-toggle { background: none; border: none; cursor: pointer; font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; color: #7A6A3C; letter-spacing: 0.05em; padding: 0; }
.pf-inputs-body { margin-top: 8px; border-left: 2px solid #D9A441; padding-left: 10px; display: flex; flex-direction: column; gap: 8px; max-height: 160px; overflow-y: auto; }
.pf-input-item { font-size: 12px; }
.pf-input-name { font-weight: 600; }
.pf-input-preview { color: #6B6F76; white-space: pre-wrap; }

/* steps */
.pf-steps { margin: 12px 14px 0; display: flex; flex-direction: column; gap: 6px; overflow-y: auto; }
.pf-steps-side { pointer-events: none; }
.pf-step { border: 1px solid #DCD7C7; border-radius: 8px; background: #FAF8F0; }
.pf-step-done { border-color: #BCD9C9; background: #F2F8F3; }
.pf-step-row {
  width: 100%; display: flex; align-items: center; gap: 10px;
  background: none; border: none; padding: 11px 14px; cursor: pointer;
  font-family: inherit; font-size: 14.5px; color: #23282F; text-align: left;
}
.pf-step-name { flex: 1; font-weight: 500; }
.pf-req { color: #C9542D; margin-left: 3px; }
.pf-step-state { font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: #8A8E96; }
.pf-step-done .pf-step-state { color: #2E8F62; }
.pf-chev { color: #8A8E96; font-size: 16px; width: 14px; text-align: center; }
.pf-dot { width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid #B6BAC1; flex-shrink: 0; }
.pf-dot-draft { border-color: #D9A441; background: #F4DFAE; }
.pf-dot-done { border-color: #2E8F62; background: #2E8F62; }

.pf-step-body { padding: 0 14px 14px; }
.pf-step-desc { font-size: 12.5px; color: #6B6F76; margin-bottom: 8px; }
.pf-out { margin-bottom: 10px; }
.pf-out-label { font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: #7A6A3C; margin-bottom: 4px; }
.pf-ta {
  width: 100%; min-height: 130px; resize: vertical;
  border: 1px solid #D8D3C2; border-radius: 6px; padding: 10px;
  font-family: 'IBM Plex Sans', sans-serif; font-size: 13.5px; line-height: 1.5;
  background: #FFFFFF; color: #23282F; box-sizing: border-box;
}
.pf-ta:focus { outline: 2px solid #D9A441; outline-offset: 1px; }
.pf-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.pf-field { display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; color: #6B6F76; }
.pf-field-input {
  border: 1px solid #D8D3C2; border-radius: 6px; padding: 8px 10px;
  font-family: 'IBM Plex Sans', sans-serif; font-size: 13.5px; background: #FFFFFF; color: #23282F;
}
.pf-field-input:focus { outline: 2px solid #D9A441; outline-offset: 1px; }
.pf-link-input { width: 100%; box-sizing: border-box; font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; }
.pf-filechip { font-size: 12px; font-family: 'IBM Plex Mono', monospace; color: #5C6068; margin-bottom: 6px; }
.pf-filechip-empty { color: #9A9EA6; }
.pf-error { margin-top: 6px; font-size: 12.5px; color: #B3402A; }
.pf-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.pf-btn {
  border: 1px solid #C9C3B0; background: #FFFFFF; color: #23282F;
  border-radius: 6px; padding: 7px 14px; font-size: 13px; cursor: pointer; font-weight: 500;
}
.pf-btn-sm { padding: 5px 11px; font-size: 12px; }
.pf-btn:hover:not(:disabled) { border-color: #23282F; }
.pf-btn:disabled { opacity: 0.5; cursor: default; }
.pf-btn-primary { background: #23282F; color: #F1EEE3; border-color: #23282F; }
.pf-btn-primary:hover:not(:disabled) { background: #3A434E; }

/* lock overlay */
.pf-lock {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(241,238,227,0.55); backdrop-filter: blur(1px);
}
.pf-lock-icon { font-size: 30px; opacity: 0.7; }

/* nav */
.pf-nav { display: flex; align-items: flex-start; gap: 16px; padding: 14px 28px 22px; }
.pf-nav-btn {
  background: none; border: 1px solid #3A434E; color: #C9CDD3;
  border-radius: 8px; padding: 10px 18px; font-size: 13.5px; cursor: pointer;
  font-family: 'IBM Plex Mono', monospace; letter-spacing: 0.03em; min-width: 150px;
}
.pf-nav-btn:hover:not(:disabled) { border-color: #D9A441; color: #D9A441; }
.pf-nav-btn:disabled { opacity: 0.35; cursor: default; }
.pf-nav-fwd { margin-left: auto; text-align: right; }
.pf-nav-mid { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 7px; }
.pf-dots { display: flex; gap: 7px; }
.pf-pip { width: 9px; height: 9px; border-radius: 50%; background: #4A535E; cursor: pointer; }
.pf-pip-active { background: #D9A441; transform: scale(1.25); }
.pf-pip-locked { background: #343C45; cursor: default; }
.pf-advance-zone { display: flex; flex-direction: column; align-items: center; gap: 5px; }
.pf-advance {
  background: #D9A441; color: #23282F; border: none; border-radius: 8px;
  padding: 10px 22px; font-size: 14px; font-weight: 600; cursor: pointer;
  font-family: 'IBM Plex Sans', sans-serif;
}
.pf-advance:hover { background: #E5B458; }
.pf-override {
  background: none; border: none; color: #8A919B; font-size: 12px; cursor: pointer;
  text-decoration: underline; font-family: 'IBM Plex Mono', monospace;
}
.pf-override:hover { color: #D9A441; }
.pf-gate-hint { font-size: 11.5px; color: #8A919B; font-family: 'IBM Plex Mono', monospace; text-align: center; }
.pf-legend { font-size: 11px; color: #5E6772; margin: 2px 0 0; text-align: center; }

.pf-out-head { display: flex; align-items: center; justify-content: space-between; }
.pf-render-toggle { background: none; border: none; color: #7A6A3C; cursor: pointer; font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; text-decoration: underline; padding: 0; }
.pf-render { position: relative; border: 1px solid #D8D3C2; border-radius: 6px; background: #FFFFFF; max-height: 280px; overflow: auto; padding: 10px; }
.pf-render-expand { position: absolute; top: 6px; right: 6px; z-index: 2; background: #F1EEE3; border: 1px solid #C9C3B0; border-radius: 5px; cursor: pointer; font-size: 12px; padding: 2px 6px; }
.pf-render-expand:hover { border-color: #23282F; }
.pf-render-loading { font-size: 12px; color: #8A8E96; padding: 8px; }
.pf-ta-mono { font-family: 'IBM Plex Mono', monospace; font-size: 12px; min-height: 180px; }
.pf-overlay { position: fixed; inset: 0; z-index: 1000; background: #F1EEE3; display: flex; flex-direction: column; }
.pf-overlay-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; background: #23282F; color: #EDEAE0; }
.pf-overlay-title { font-family: 'IBM Plex Mono', monospace; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
.pf-overlay-body { flex: 1; overflow: auto; padding: 18px 22px; }
.pf-jt { font-family: 'IBM Plex Mono', monospace; font-size: 12px; line-height: 1.55; }
.pf-jt-children { padding-left: 16px; }
.pf-jt-node > summary { cursor: pointer; }
.pf-jt-leaf { padding-left: 16px; }
.pf-jt-key { color: #7A6A3C; }
.pf-jt-string { color: #2E6E8F; } .pf-jt-number { color: #8F4E2E; } .pf-jt-boolean, .pf-jt-null { color: #6B4E8F; }
.pf-jt-meta { color: #9A9EA6; }
.pf-kv { display: grid; grid-template-columns: minmax(110px, max-content) 1fr; gap: 4px 14px; font-size: 12.5px; }
.pf-kv-row { display: contents; }
.pf-kv-key { font-family: 'IBM Plex Mono', monospace; color: #7A6A3C; word-break: break-word; }
.pf-kv-val { color: #23282F; white-space: pre-wrap; word-break: break-word; }
.pf-table { border-collapse: collapse; font-size: 12px; width: 100%; }
.pf-table th, .pf-table td { border: 1px solid #DCD7C7; padding: 5px 8px; text-align: left; vertical-align: top; }
.pf-table th { background: #EFEBDD; font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; letter-spacing: 0.05em; text-transform: uppercase; }
.pf-cards { display: grid; grid-template-columns: minmax(150px, 220px) 1fr; gap: 12px; min-height: 120px; }
.pf-cards-list { display: flex; flex-direction: column; gap: 5px; overflow-y: auto; max-height: 420px; }
.pf-cards-item { text-align: left; background: #FAF8F0; border: 1px solid #DCD7C7; border-radius: 6px; padding: 7px 9px; cursor: pointer; font-family: inherit; }
.pf-cards-item:hover { border-color: #23282F; }
.pf-cards-active { border-color: #D9A441; background: #FBF3DD; }
.pf-cards-title { font-size: 12.5px; font-weight: 600; color: #23282F; }
.pf-cards-sub { font-size: 11px; color: #6B6F76; }
.pf-cards-detail { border-left: 2px solid #D9A441; padding-left: 12px; overflow: auto; }
.pf-md { font-size: 13.5px; line-height: 1.6; }
.pf-md h1, .pf-md h2, .pf-md h3, .pf-md h4, .pf-md h5, .pf-md h6 { margin: 12px 0 6px; line-height: 1.25; }
.pf-md h1 { font-size: 19px; } .pf-md h2 { font-size: 16.5px; } .pf-md h3 { font-size: 14.5px; }
.pf-md p { margin: 6px 0; }
.pf-md ul, .pf-md ol { margin: 6px 0; padding-left: 22px; }
.pf-md blockquote { margin: 8px 0; border-left: 3px solid #D9A441; padding-left: 10px; color: #5C6068; }
.pf-md-pre { background: #23282F; color: #EDEAE0; border-radius: 6px; padding: 10px; overflow-x: auto; font-size: 12px; }
.pf-md code { background: #EFEBDD; border-radius: 3px; padding: 0 4px; font-family: 'IBM Plex Mono', monospace; font-size: 0.92em; }
.pf-md-pre code { background: none; padding: 0; }
.pf-md table { margin: 8px 0; }

@media (max-width: 720px) {
  .pf-card-side { display: none; }
  .pf-deck { min-height: 600px; }
  .pf-nav-btn { min-width: 0; }
  .pf-fields { grid-template-columns: 1fr; }
  .pf-rail { justify-content: flex-start; }
}
`;

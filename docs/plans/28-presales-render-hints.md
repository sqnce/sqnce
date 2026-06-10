# presales render hints implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every output in `definitions/presales.json` carries a render hint, four outputs convert to `data` with structured shapes, and the Pacific Ridge seed renders digestibly on all five browsable cards.

**Architecture:** Pure content change across three files: the definition (hints, conversions, key renames), the demo seed (content reshaped to match hints), and the artifact mirror (definition changes only). No `@sqnce/core` or `@sqnce/react` changes, no new dependencies.

**Tech Stack:** JSON definition, plain ESM seed module, Node test runner (`npm test`), Vite demo build, esbuild syntax check for the artifact.

Spec: `docs/specs/28-presales-render-hints.md`. This plan is deleted in the final pre-merge commit per the dev workflow.

---

### Task 1: definition, Deal facts keys and keyvalue hint

**Files:**
- Modify: `definitions/presales.json` (subject block, intake step)

- [ ] **Step 1: rename `subject.field`**

Change:

```json
"subject": {
    "stepId": "intake",
    "outputId": "facts",
    "field": "client",
    "fallback": "the client"
  }
```

to:

```json
"subject": {
    "stepId": "intake",
    "outputId": "facts",
    "field": "Client",
    "fallback": "the client"
  }
```

- [ ] **Step 2: rename the four field keys and add the keyvalue hint**

In the `intake` step, change the `facts` output to:

```json
{
  "id": "facts",
  "type": "fields",
  "label": "Deal facts",
  "render": { "kind": "keyvalue" },
  "fields": [
    { "key": "Client", "label": "Client" },
    { "key": "Industry", "label": "Industry" },
    { "key": "Deal size", "label": "Deal size" },
    { "key": "Response due", "label": "Response due" }
  ]
}
```

Labels stay; only keys and the new `render` line change.

### Task 2: definition, four data conversions and aiPrompt removals

**Files:**
- Modify: `definitions/presales.json` (steps `requirements`, `win-themes`, `qna`, `effort`)

- [ ] **Step 1: convert Requirements Extract**

In the `requirements` step: delete the `aiPrompt` line entirely, and replace the output with:

```json
{
  "id": "out",
  "type": "data",
  "label": "Requirements",
  "render": { "kind": "table" }
}
```

- [ ] **Step 2: convert Win Themes**

In the `win-themes` step: delete the `aiPrompt` line, replace the output with:

```json
{
  "id": "out",
  "type": "data",
  "label": "Win themes",
  "render": { "kind": "cards", "options": { "title": "name", "subtitle": "purpose" } }
}
```

- [ ] **Step 3: convert Q&A Prep**

In the `qna` step: delete the `aiPrompt` line, replace the output with:

```json
{
  "id": "out",
  "type": "data",
  "label": "Q&A bank",
  "render": { "kind": "cards", "options": { "title": "question", "subtitle": "owner" } }
}
```

- [ ] **Step 4: convert Effort Estimate**

In the `effort` step (no `aiPrompt` exists), replace the output with:

```json
{
  "id": "out",
  "type": "data",
  "label": "Estimate",
  "render": { "kind": "table" }
}
```

### Task 3: definition, markdown hints on every remaining unhinted output

**Files:**
- Modify: `definitions/presales.json`

- [ ] **Step 1: add `"render": { "kind": "markdown" }` to each of these outputs**

Text outputs: `qualify.out`, `pain-points.out`, `customer-research.out`, `industry-research.out`, `product-alignment.out`, `functional-arch.out`, `technical-arch.out`, `fit-gap.out`, `exec-summary.out`, `pricing-approach.out`, `followups.out`, `scope-statement.out`, `assumptions.out`, `pricing-model.out`.

File outputs: `rfp-upload.doc`, `demo-data.file`, `deck.file`, `sow-doc.file`.

Each gets the same property added to the output object, for example:

```json
{
  "id": "out",
  "type": "text",
  "label": "Go / no-go assessment",
  "render": { "kind": "markdown" }
}
```

Already hinted, do not touch: `solution-narrative.out`, `demo-script.out`, `demo-data.inventory`, `demo-data.automations`.

- [ ] **Step 2: verify every output now has a hint**

Run: `grep -c '"render"' definitions/presales.json`
Expected: `27`

- [ ] **Step 3: run the test suite**

Run: `npm test`
Expected: all 15 tests pass (bundled definition validation covers the edited file).

- [ ] **Step 4: commit**

```bash
git add definitions/presales.json
git commit -m "presales definition: render hints on every output, four data conversions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 4: seed, Start and RFP Review cards

**Files:**
- Modify: `examples/demo/src/seeds.js` (presales-pursuit entry only; `idx`, `frontier`, `checkedDone` flags never change)

- [ ] **Step 1: intake facts, renamed keys**

```js
intake: {
  checkedDone: false,
  outputs: {
    facts: {
      "Client": "Pacific Ridge Steel Products, Inc.",
      "Industry": "Western U.S. steel pipe manufacturing: carbon, stainless, and alloy pipe",
      "Deal size": "18 territory-aligned direct sales reps; Phase 1 direct-sales replacement system",
      "Response due": "90-day target from vendor selection to cloud go-live",
    },
  },
},
```

- [ ] **Step 2: RFP document content as markdown**

Replace `rfp-upload.outputs.doc.content` with (array-join form, matching the demo-script seed style):

```js
content: [
  "# Sales System Requirements Document v1.0",
  "",
  "April 13, 2026. Prepared by the Sales Operations & IT Steering Committee.",
  "",
  "Pacific Ridge is replacing spreadsheets, email, and an aging on-premises contact database with a sales system. ERP remains the system of record. Phase 1 is the direct sales team only.",
  "",
  "## Requirement areas",
  "",
  "- Account and contact management",
  "- Lead capture and routing",
  "- Opportunity and pipeline management",
  "- Quoting",
  "- Territory management",
  "- Reporting and forecasting",
  "- Integration, security, and usability",
].join("\n"),
```

- [ ] **Step 3: qualification as markdown**

Replace `qualify.outputs.out` with:

```js
out: [
  "## Go / no-go: Go",
  "",
  "Pacific Ridge is a strong fit for a configured Dynamics 365 Sales and Power Platform demo. The real Stage 4 brief frames the demo around four proof points:",
  "",
  "1. Pacific Ridge's selling motion is recognizable in the system.",
  "2. Margin is protected and the CFO is in control.",
  "3. Leadership gets real-time pipeline truth.",
  "4. The 90-day timeline is credible.",
  "",
  "Keep ERP, email, website, and identity integrations at capability level.",
].join("\n"),
```

- [ ] **Step 4: pain points as a ranked list**

Replace `pain-points.outputs.out` with:

```js
out: [
  "## Pain points, ranked (Stage 1 findings)",
  "",
  "1. Sales process fragmented across spreadsheets, email, and an aging on-premises contact database.",
  "2. No centralized account/contact master; activity history is inconsistent.",
  "3. Leads from web forms, trade shows, and phone are not consolidated or systematically routed.",
  "4. Opportunity stages and forecast are not standardized.",
  "5. Quoting lacks pipe-specific structure and approval governance.",
  "6. Territory assignment is not automated or auditable.",
  "7. Leadership lacks real-time reporting.",
  "8. ERP, email, and website data is not visible in the sales workflow.",
  "9. Role-based security and audit controls are missing.",
  "10. Reps need mobile/offline support for job sites and the mill floor.",
].join("\n"),
```

- [ ] **Step 5: requirements as table rows**

Replace `requirements.outputs.out` with:

```js
out: [
  { id: "R-01", area: "Accounts & contacts", requirement: "Unify accounts, contacts, leads, opportunities, and quotes in one system", type: "Functional" },
  { id: "R-02", area: "Accounts & contacts", requirement: "Support GC, subcontractor, and end-user account relationships", type: "Functional" },
  { id: "R-03", area: "Leads", requirement: "Capture leads from web, trade show, phone, and manual entry", type: "Functional" },
  { id: "R-04", area: "Leads", requirement: "Route leads by territory or product line", type: "Functional" },
  { id: "R-05", area: "Leads", requirement: "Convert qualified leads into account, contact, and opportunity in one action", type: "Functional" },
  { id: "R-06", area: "Pipeline", requirement: "Operate stages Inquiry, Specification Review, Quote Submitted, Negotiation, Won, Lost", type: "Functional" },
  { id: "R-07", area: "Quoting", requirement: "Produce pipe-spec quotes: grade, diameter, wall thickness, length, quantity, UoM, unit price, freight and surcharge lines, versioning, cloning, PDF output", type: "Functional" },
  { id: "R-08", area: "Quoting", requirement: "Enforce discount and margin approvals", type: "Functional" },
  { id: "R-09", area: "Territory", requirement: "Assign and audit territories", type: "Functional" },
  { id: "R-10", area: "Reporting", requirement: "Provide dashboards, win/loss, quote-to-order, time-to-close, ad-hoc reporting, and weighted forecast vs quota", type: "Functional" },
  { id: "R-11", area: "Integration", requirement: "Integrate ERP, email, website inquiry forms, SSO, and future APIs", type: "Non-functional" },
  { id: "R-12", area: "Security", requirement: "Enforce role security, audit, field-level security, and retention/deletion policies", type: "Non-functional" },
  { id: "R-13", area: "Usability", requirement: "Provide web, mobile, and offline/degraded connectivity access", type: "Non-functional" },
],
```

- [ ] **Step 6: customer research as markdown**

Replace `customer-research.outputs.out` with:

```js
out: [
  "## Customer profile",
  "",
  "Pacific Ridge Steel Products, Inc. is a Western U.S. steel pipe manufacturer producing carbon, stainless, and alloy pipe from a single mill with an adjacent distribution yard.",
  "",
  "- 18-person direct sales force, territory aligned.",
  "- Sells to industrial, construction, and municipal infrastructure customers.",
  "- Demo audience: VP Sales, Director of IT, CFO, Project Sponsor, Sales Managers, Territory Reps.",
].join("\n"),
```

- [ ] **Step 7: industry research as markdown**

Replace `industry-research.outputs.out` with:

```js
out: [
  "## Selling motion",
  "",
  "Project-based pipe sales: GC, subcontractor, and end-user municipality relationships matter.",
  "",
  "- Quote lines need pipe grade, diameter, wall thickness, length, quantity, UoM in feet or tons, unit price, surcharges, freight, and versioning.",
  "- ERP owns customer master, product catalog, credit, orders, inventory, and financials.",
  "- Territory routing and forecast credibility are central to leadership confidence.",
].join("\n"),
```

### Task 5: seed, Solutioning, Proposal Draft, and Demonstration cards

**Files:**
- Modify: `examples/demo/src/seeds.js`

- [ ] **Step 1: product alignment as markdown with a pipe table**

Replace `product-alignment.outputs.out` with:

```js
out: [
  "## Platform direction (Stage 4)",
  "",
  "Dynamics 365 Sales Enterprise on Microsoft Dataverse, surfaced through standard Sales Hub re-titled on stage as Pacific Ridge Sales.",
  "",
  "| Need | Capability |",
  "| --- | --- |",
  "| Mobile site visits | Power Apps mobile model-driven offline (Scene 7) |",
  "| Web inquiry intake | Power Pages thin intake (Scene 1) |",
  "| Routing and approvals | Power Automate post-lead-create routing and quote approval |",
  "| Single sign-on | Microsoft Entra ID |",
  "| Leadership reporting | Dataverse dashboards, D365 Sales Forecast, one embedded Power BI tile and subscription (Scene 9) |",
  "| AI moments | Selected Copilot / Sales Qualification Agent moments |",
].join("\n"),
```

- [ ] **Step 2: functional architecture as markdown**

Replace `functional-arch.outputs.out` with:

```js
out: [
  "## Functional architecture (Stage 5 inventory)",
  "",
  "Use standard Sales/Dataverse tables; no new tables.",
  "",
  "- Core tables: Account, Contact, Lead, Opportunity, Quote, Quote Detail, Product, Price List, Territory, System User, Team, Activities, Audit, Field Security Profile.",
  "- App: Sales Hub re-titled Pacific Ridge Sales with a customized site map.",
  "- Business Process Flow: Pacific Ridge Pipe Sale on Opportunity with stages Inquiry, Specification Review, Quote Submitted, Negotiation, Won, Lost.",
].join("\n"),
```

- [ ] **Step 3: technical architecture as markdown**

Replace `technical-arch.outputs.out` with:

```js
out: [
  "## Technical architecture",
  "",
  "- One managed solution named PacificRidgeSales; Dev/Test/Prod environments.",
  "- ERP account, credit, and order-history lookup; product catalog refresh from ERP.",
  "- Server-Side Sync for email; public Power Pages lead intake.",
  "- Dataverse row-added flow for web lead territory routing; quote approval flow.",
  "- Generate PDF then Email Quote platform command.",
  "- Dataverse audit, Field Security Profile for margin/cost, Microsoft Entra ID SSO capability.",
  "- Power Apps mobile offline support for the Opportunity BPF site-visit scene.",
].join("\n"),
```

- [ ] **Step 4: fit-gap as markdown with a pipe table**

Replace `fit-gap.outputs.out` with:

```js
out: [
  "## Fit-gap",
  "",
  "Configuration-first fit.",
  "",
  "| Area | Disposition | Note |",
  "| --- | --- | --- |",
  "| Lead intake, routing, conversion | Strong fit | Standard Sales plus one routing flow |",
  "| Opportunity stages | Strong fit | BPF mirrors the six pipeline stages |",
  "| Quoting | Strong fit | Standard Quote and Quote Detail |",
  "| Dashboards and forecast | Strong fit | Native dashboards and D365 Forecast |",
  "| Security, audit, mobile, approvals | Strong fit | Platform capabilities |",
  "| Pipe attributes, surcharges, discount justification | Lightweight addition | Illustrative custom columns |",
  "| Secured margin/cost, ERP customer id, credit hold, consent | Lightweight addition | Field security plus integration columns |",
  "| Rules-based CPQ | Out of scope | Demo avoids implying production CPQ |",
  "| Self-service portal, marketing automation | Out of scope | Phase 1 is direct sales only |",
  "| Inventory/WMS, AR/invoicing, field service, channel sales | Out of scope | ERP and later phases |",
].join("\n"),
```

- [ ] **Step 5: win themes as card objects**

Replace `win-themes.outputs.out` with:

```js
out: [
  { name: "Recognizable selling motion", purpose: "Pacific Ridge's real selling motion is recognizable in the system out of the box." },
  { name: "Margin protected", purpose: "Discount justification, approval routing, and field security keep the CFO in control." },
  { name: "Real-time pipeline truth", purpose: "Leadership gets live pipeline, forecast, win/loss, quote-to-order, and territory visibility." },
  { name: "Credible 90-day rollout", purpose: "Configuration-first, direct-sales-only scope makes the Phase 1 timeline believable." },
],
```

- [ ] **Step 6: executive summary as markdown**

Replace `exec-summary.outputs.out` with:

```js
out: [
  "## Executive summary",
  "",
  "Pacific Ridge can replace spreadsheet, email, and on-premises sales tracking with a cloud sales workspace that follows a rep's day end to end:",
  "",
  "- Web inquiry to lead conversion in one motion.",
  "- Account hierarchy and ERP-informed opportunity work.",
  "- Pipe-spec quoting with manager approval.",
  "- Mobile site visits and executive forecast.",
  "",
  "The demo proves Phase 1 for the direct sales team while keeping ERP, identity, email, website, and production-adjacent scope at the right level.",
].join("\n"),
```

- [ ] **Step 7: solution narrative as sectioned markdown**

Replace `solution-narrative.outputs.out` with:

```js
out: [
  "# Solution narrative",
  "",
  "## The workspace",
  "",
  "Pacific Ridge Sales, a re-titled Sales Hub app backed by Dataverse.",
  "",
  "## From inquiry to opportunity",
  "",
  "Power Pages creates web inquiry leads, Power Automate routes them by territory, and reps convert qualified leads into Accounts, Contacts, and Opportunities. The Opportunity BPF mirrors Pacific Ridge's pipeline stages.",
  "",
  "## Quoting and control",
  "",
  "Quote and Quote Detail support pipe-spec line items and surcharges; managers approve discount exceptions.",
  "",
  "## The field and the top floor",
  "",
  "Mobile offline supports field activity capture. Leadership dashboards expose pipeline, forecast, win/loss, quote-to-order, territory, and subscription reporting.",
].join("\n"),
```

- [ ] **Step 8: pricing approach as markdown**

Replace `pricing-approach.outputs.out` with:

```js
out: [
  "## Scope positioning",
  "",
  "- Phase 1 is direct sales only and cloud hosted.",
  "- ERP remains system of record for orders, inventory, financials, product catalog, credit, and customer master.",
  "- The demo avoids implying production delivery of CPQ, portal self-service, marketing automation, WMS, invoicing, field service, or channel sales.",
].join("\n"),
```

- [ ] **Step 9: demo data set file content as markdown**

Replace `demo-data.outputs.file.content` with:

```js
content: [
  "# Stage 5 inventory summary",
  "",
  "From the real Claude Managed Agent run:",
  "",
  "- 23 standard Dataverse/Sales tables; 18 illustrative custom columns.",
  "- 16 automation moments; 10 demo scenes; 19 AI moments.",
  "- 6 demo security roles; 2 owner teams; 1 root business unit; 1 Field Security Profile.",
  "- 4 dashboards (Sales Rep Home, Western Region Pipeline, Company Pipeline, Sales Admin); 12 KPIs; 1 embedded Power BI tile; 1 Power BI subscription.",
  "- Hero app: Pacific Ridge Sales (Sales Hub re-titled). Hero opportunity: Cascade Civil - Astoria Water Main Replacement, Phase 2. Quote: Q-2026-0142.",
  "- BPF: Pacific Ridge Pipe Sale with stages Inquiry, Specification Review, Quote Submitted, Negotiation, Won, Lost.",
].join("\n"),
```

Untouched seeds: `demo-script.outputs.out`, `demo-data.outputs.inventory`, `demo-data.outputs.automations`, `demo-build`, and every non-presales workflow.

- [ ] **Step 10: build the demo**

Run: `npm run build -w examples/demo`
Expected: build succeeds with no errors.

- [ ] **Step 11: commit**

```bash
git add examples/demo/src/seeds.js
git commit -m "presales seed: reshape Pacific Ridge content to match render hints

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 6: artifact mirror

**Files:**
- Modify: `examples/claude-artifact/process-rolodex.jsx` (inlined presales config, lines ~31-220)

- [ ] **Step 1: mirror every definition change in JS object form**

Apply the same changes as Tasks 1-3 to the inlined presales config: `subject.field` to `"Client"`, the four field key renames plus `render: { kind: "keyvalue" }`, the four `data` conversions with their hints (`requirements` table, `win-themes` cards, `qna` cards, `effort` table), the three `aiPrompt` deletions (`requirements`, `win-themes`, `qna`), and `render: { kind: "markdown" }` on `qualify.out`, `pain-points.out`, `customer-research.out`, `industry-research.out`, `product-alignment.out`, `functional-arch.out`, `technical-arch.out`, `fit-gap.out`, `exec-summary.out`, `pricing-approach.out`, `followups.out`, `scope-statement.out`, `assumptions.out`, `pricing-model.out`, `rfp-upload.doc`, `demo-data.file`, `deck.file`, and `sow-doc.file`. JS form example:

```js
{ id: "out", type: "data", label: "Win themes", render: { kind: "cards", options: { title: "name", subtitle: "purpose" } } },
```

No seed data exists in the artifact; nothing else changes.

- [ ] **Step 2: syntax check**

Run: `npx esbuild examples/claude-artifact/process-rolodex.jsx --bundle --format=esm --external:react --external:@sqnce/core --outfile=/dev/null`
Expected: exit 0.

- [ ] **Step 3: commit**

```bash
git add examples/claude-artifact/process-rolodex.jsx
git commit -m "artifact: mirror presales render hints and data conversions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 7: full verification and push

- [ ] **Step 1: run everything**

Run: `npm test && npm run build -w examples/demo && npx esbuild examples/claude-artifact/process-rolodex.jsx --bundle --format=esm --external:react --external:@sqnce/core --outfile=/dev/null`
Expected: 15 tests pass, both builds succeed.

- [ ] **Step 2: acceptance spot-checks against the spec**

- `grep -c '"render"' definitions/presales.json` returns 27.
- `grep -c aiPrompt definitions/presales.json` returns 12 (15 today minus the 3 removed).
- No occurrence of `dealSize` or `responseDue` remains in the repo: `grep -rn "dealSize\|responseDue" definitions examples` returns nothing.

- [ ] **Step 3: push**

```bash
git push
```

Codex auto-reviews the push on PR #30; address findings until the +1 reaction lands for the implementation phase.

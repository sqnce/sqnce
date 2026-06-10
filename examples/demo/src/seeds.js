/* Seeded runs, so a first-time visitor lands mid-flight instead of on
   an empty form: all four everyday workflows plus the presales pursuit.
   Returned through the component's initialRunFor prop: used when no
   stored run exists and by Reset, so Reset returns here, not to a
   blank run. */
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

  /* Deep seed: frontier at "Demonstration" (index 4), every step through
     Demo Data filled. Demo Build, a required checklist step, stays
     undone, so the unmet hybrid gate hint and the override are visible. */
  "presales-pursuit": {
    idx: 4,
    frontier: 4,
    stepState: {
      intake: {
        checkedDone: false,
        outputs: {
          facts: {
            client: "Pacific Ridge Steel Products, Inc.",
            industry: "Western U.S. steel pipe manufacturing: carbon, stainless, and alloy pipe",
            dealSize: "18 territory-aligned direct sales reps; Phase 1 direct-sales replacement system",
            responseDue: "90-day target from vendor selection to cloud go-live",
          },
        },
      },
      "rfp-upload": {
        checkedDone: false,
        outputs: {
          doc: {
            name: "pacific-ridge-steel-sales-requirements.md",
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
          },
        },
      },
      qualify: {
        checkedDone: false,
        outputs: {
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
        },
      },
      "pain-points": {
        checkedDone: false,
        outputs: {
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
        },
      },
      requirements: {
        checkedDone: false,
        outputs: {
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
        },
      },
      "customer-research": {
        checkedDone: false,
        outputs: {
          out: [
            "## Customer profile",
            "",
            "Pacific Ridge Steel Products, Inc. is a Western U.S. steel pipe manufacturer producing carbon, stainless, and alloy pipe from a single mill with an adjacent distribution yard.",
            "",
            "- 18-person direct sales force, territory aligned.",
            "- Sells to industrial, construction, and municipal infrastructure customers.",
            "- Demo audience: VP Sales, Director of IT, CFO, Project Sponsor, Sales Managers, Territory Reps.",
          ].join("\n"),
        },
      },
      "industry-research": {
        checkedDone: false,
        outputs: {
          out: [
            "## Selling motion",
            "",
            "Project-based pipe sales: GC, subcontractor, and end-user municipality relationships matter.",
            "",
            "- Quote lines need pipe grade, diameter, wall thickness, length, quantity, UoM in feet or tons, unit price, surcharges, freight, and versioning.",
            "- ERP owns customer master, product catalog, credit, orders, inventory, and financials.",
            "- Territory routing and forecast credibility are central to leadership confidence.",
          ].join("\n"),
        },
      },
      "product-alignment": {
        checkedDone: false,
        outputs: {
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
        },
      },
      "functional-arch": {
        checkedDone: false,
        outputs: {
          out: [
            "## Functional architecture (Stage 5 inventory)",
            "",
            "Use standard Sales/Dataverse tables; no new tables.",
            "",
            "- Core tables: Account, Contact, Lead, Opportunity, Quote, Quote Detail, Product, Price List, Territory, System User, Team, Activities, Audit, Field Security Profile.",
            "- App: Sales Hub re-titled Pacific Ridge Sales with a customized site map.",
            "- Business Process Flow: Pacific Ridge Pipe Sale on Opportunity with stages Inquiry, Specification Review, Quote Submitted, Negotiation, Won, Lost.",
          ].join("\n"),
        },
      },
      "technical-arch": {
        checkedDone: false,
        outputs: {
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
        },
      },
      "fit-gap": {
        checkedDone: false,
        outputs: {
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
        },
      },
      "win-themes": {
        checkedDone: false,
        outputs: {
          out: [
            { name: "Recognizable selling motion", purpose: "Pacific Ridge's real selling motion is recognizable in the system out of the box." },
            { name: "Margin protected", purpose: "Discount justification, approval routing, and field security keep the CFO in control." },
            { name: "Real-time pipeline truth", purpose: "Leadership gets live pipeline, forecast, win/loss, quote-to-order, and territory visibility." },
            { name: "Credible 90-day rollout", purpose: "Configuration-first, direct-sales-only scope makes the Phase 1 timeline believable." },
          ],
        },
      },
      "exec-summary": {
        checkedDone: false,
        outputs: {
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
        },
      },
      "solution-narrative": {
        checkedDone: false,
        outputs: {
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
        },
      },
      "pricing-approach": {
        checkedDone: false,
        outputs: {
          out: [
            "## Scope positioning",
            "",
            "- Phase 1 is direct sales only and cloud hosted.",
            "- ERP remains system of record for orders, inventory, financials, product catalog, credit, and customer master.",
            "- The demo avoids implying production delivery of CPQ, portal self-service, marketing automation, WMS, invoicing, field service, or channel sales.",
          ].join("\n"),
        },
      },
      "demo-script": {
        checkedDone: false,
        outputs: {
          out: [
            "# Pacific Ridge demo arc (Stage 2)",
            "",
            "## Act I: The Inbound",
            "1. Web inquiry lands and routes itself.",
            "2. One-click lead conversion.",
            "",
            "## Act II: The Account & The Project",
            "3. GC, subcontractor, and end-user project hierarchy.",
            "4. ERP-sourced customer truth inside the sales record.",
            "",
            "## Act III: The Quote",
            "5. Pipe-spec quoting with surcharges, clone, and version.",
            "6. Discount override, justification, approval, masked margin, and branded PDF.",
            "",
            "## Act IV: The Field",
            "7. Mobile/offline site visit.",
            "",
            "## Act V: The View from the Top",
            "8. Manager territory view and role-aware visibility.",
            "9. VP pipeline, weighted forecast vs quota, ad-hoc reporting, and scheduled subscription.",
            "",
            "## Act VI: The 90-Day Reality",
            "10. SSO, security posture, and speed-to-value close.",
            "",
            "## Wow moments",
            "",
            "| Scene | Beat | Why it lands |",
            "| --- | --- | --- |",
            "| 6 | Branded quote PDF from the record | Quote turnaround is the stated pain |",
            "| 9 | Forecast vs quota, then a scheduled subscription | The VP sees the number without asking |",
          ].join("\n"),
        },
      },
      "demo-data": {
        checkedDone: false,
        outputs: {
          file: {
            name: "pacific-ridge-stage5-inventory-summary.md",
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
          },
          inventory: [
            { id: "tbl-account", name: "Account", logical_name: "account", purpose: "GC, sub-contractor, end-user municipality records; visual account hierarchy; ERP-sourced credit and order-history panel.", scenes: [2, 3, 4, 8, 9] },
            { id: "tbl-contact", name: "Contact", logical_name: "contact", purpose: "Buyer, Engineer, AP role designations per account.", scenes: [2, 3] },
            { id: "tbl-lead", name: "Lead", logical_name: "lead", purpose: "Inbound web inquiry; source = Web; territory-routed.", scenes: [1, 2] },
            { id: "tbl-opportunity", name: "Opportunity", logical_name: "opportunity", purpose: "Pipeline with the OM-02 named stages; single-table BPF host (qualifies for offline).", scenes: [2, 5, 6, 7, 8, 9] },
            { id: "tbl-quote", name: "Quote", logical_name: "quote", purpose: "Pipe-spec quote with versioning/cloning and header-level pricing summary.", scenes: [5, 6] },
            { id: "tbl-quote-detail", name: "Quote Detail (Quote Product)", logical_name: "quotedetail", purpose: "Pipe line items + surcharge / freight write-in rows.", scenes: [5, 6] },
            { id: "tbl-product", name: "Product", logical_name: "product", purpose: "Pipe SKUs with grade/diameter/wall attributes. Mastered in ERP; read into Dataverse.", scenes: [5] },
            { id: "tbl-price-list", name: "Price List", logical_name: "pricelevel", purpose: "Pricing source for QT-02; default by territory; maintained by Priya (Product Manager).", scenes: [5, 10] },
            { id: "tbl-price-list-item", name: "Price List Item", logical_name: "productpricelevel", purpose: "Unit prices keyed to currency and Unit (UoM); override pricing supported.", scenes: [5] },
            { id: "tbl-unit-group", name: "Unit Group", logical_name: "uomschedule", purpose: "Two Unit Groups model UoM in feet OR tons.", scenes: [5] },
            { id: "tbl-territory", name: "Territory", logical_name: "territory", purpose: "Western-US territory model with hierarchical relationship; default price-list-by-territory.", scenes: [1, 8, 9] },
            { id: "tbl-connection", name: "Connection", logical_name: "connection", purpose: "Links the municipal end-user account to the GC account on the same project.", scenes: [3] },
          ],
          automations: {
            nodes: [
              { id: "A-01", label: "A-01: Web lead territory routing", group: "automation" },
              { id: "A-02", label: "A-02: Lead-to-opportunity conversion", group: "automation" },
              { id: "A-03", label: "A-03: ERP account & credit lookup", group: "automation" },
              { id: "A-04", label: "A-04: Product catalog refresh", group: "automation" },
              { id: "A-06", label: "A-06: Quote clone & version flow", group: "automation" },
              { id: "A-07", label: "A-07: Discount / margin approval", group: "automation" },
              { id: "A-08", label: "A-08: Branded quote PDF & send", group: "automation" },
              { id: "A-09", label: "A-09: Next-step activity automation", group: "automation" },
              { id: "tbl-lead", label: "Lead", group: "table" },
              { id: "tbl-opportunity", label: "Opportunity", group: "table" },
              { id: "tbl-account", label: "Account", group: "table" },
              { id: "tbl-product", label: "Product", group: "table" },
              { id: "tbl-price-list", label: "Price List", group: "table" },
              { id: "tbl-quote", label: "Quote", group: "table" },
              { id: "tbl-activity-phonecall", label: "Phone Call activity", group: "table" },
              { id: "tbl-activity-task", label: "Task activity", group: "table" },
              { id: "tbl-activity-appointment", label: "Appointment activity", group: "table" },
            ],
            edges: [
              { from: "A-01", to: "tbl-lead" },
              { from: "A-02", to: "tbl-lead" },
              { from: "A-02", to: "tbl-opportunity" },
              { from: "A-03", to: "tbl-account" },
              { from: "A-04", to: "tbl-product" },
              { from: "A-04", to: "tbl-price-list" },
              { from: "A-06", to: "tbl-quote" },
              { from: "A-06", to: "tbl-opportunity" },
              { from: "A-07", to: "tbl-quote" },
              { from: "A-08", to: "tbl-quote" },
              { from: "A-09", to: "tbl-activity-phonecall" },
              { from: "A-09", to: "tbl-activity-task" },
              { from: "A-09", to: "tbl-activity-appointment" },
            ],
          },
        },
      },
      "demo-build": {
        checkedDone: false,
        outputs: {},
      },
    },
  },
};

export function initialRunFor(workflowId) {
  const seed = SEEDS[workflowId];
  return seed ? structuredClone(seed) : createRun();
}

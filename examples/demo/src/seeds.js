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

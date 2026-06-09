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

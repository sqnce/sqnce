import { jumpTo, mainGateProgress } from "@sqnce/core";

/**
 * Pure per-chip model for the top stage rail. Reachability is the engine's own
 * probe (the same idiom the reading-mode contents list uses): a stage is
 * reachable when jumpTo accepts a jump to its first sub-stage. That single
 * result drives both interactivity and the glyph, so the rail is correct for
 * linear and forked runs without any frontier arithmetic and without a core
 * change. The active/done/ahead color class follows the prior rail, except that
 * an unreachable stage is never shown as done: a skipped track that still holds
 * stale filled outputs (the engine keeps a skipped track's stepState) would
 * otherwise report its gate met, so reachability is checked before done.
 *
 * subStages is passed to mainGateProgress so a forked run scopes its
 * validators the same way the engine's advance does (the spine plus the
 * stage's own track); for a linear run there are no tracks, so this is inert.
 *
 * @param {import("@sqnce/core").Run} run
 * @param {import("@sqnce/core").FlatSubStage[]} subs Flat sub-stages (flattenSubStages output).
 * @param {import("@sqnce/core").MainStage[]} mainStages
 * @param {number} mainIndex
 * @param {Object<string, ((value: any, spec: any, ctx: any) => (string|null))>} [validators]
 * @returns {{ firstFlat: number, reachable: boolean, interactive: boolean, glyph: string, state: string, active: boolean }}
 */
export function railChip(run, subs, mainStages, mainIndex, validators) {
  const ms = mainStages[mainIndex];
  const firstFlat = subs.findIndex((s) => s.mainIndex === mainIndex);
  const reachable = firstFlat >= 0 && jumpTo(run, subs, firstFlat).idx === firstFlat;
  const allDone = mainGateProgress(ms, run, { validators, subStages: subs }).met;
  const centered = subs[Math.min(run.idx, subs.length - 1)];
  const active = !!centered && centered.mainIndex === mainIndex;
  const state = active ? "active" : reachable && allDone ? "done" : "ahead";
  const glyph = !reachable ? "🔒" : allDone ? "✓" : String(mainIndex + 1);
  return { firstFlat, reachable, interactive: reachable, glyph, state, active };
}

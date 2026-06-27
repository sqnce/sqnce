import { tokenizeInline } from "./markdownInline.js";

/*
 * Pure outline support for the markdown built-in renderer. No React.
 * The renderer stamps heading ids and the expand overlay builds a jump
 * list; both use the same slug sequence from here so a heading's id and
 * its jump target always agree. Headings inside fenced code blocks are
 * not real headings (the renderer renders the fence as code before it
 * matches headings), so parseOutline skips them and does not let them
 * advance the slug sequence.
 */

/**
 * @typedef {{ level: number, text: string, slug: string }} OutlineEntry
 */

/** Base slug: lowercase, runs of non-alphanumerics become one dash, ends trimmed. */
function baseSlug(rawText) {
  return String(rawText)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Inline markdown removed, for a readable jump-list label. */
function plainText(rawText) {
  return tokenizeInline(rawText)
    .map((t) => (t.type === "link" ? t.text : t.value))
    .join("");
}

/**
 * Create a stateful per-document slug generator. Feed it raw heading texts
 * in document order. The first use of a slug returns the bare slug; a
 * repeat returns the next free numeric suffix from -2. Two instances fed
 * the same sequence return identical results, which is what keeps the
 * renderer ids and the overlay jump targets in lockstep.
 * @returns {(rawText: string) => string}
 */
export function createSlugger() {
  const used = new Set();
  return function slug(rawText) {
    const base = baseSlug(rawText) || "section";
    if (!used.has(base)) {
      used.add(base);
      return base;
    }
    let n = 2;
    while (used.has(`${base}-${n}`)) n++;
    const out = `${base}-${n}`;
    used.add(out);
    return out;
  };
}

/**
 * Parse the ATX heading outline from markdown source, mirroring the
 * renderer's block handling: a line that starts a fenced code block (three
 * backticks) toggles a fence flag, and heading-looking lines inside a fence
 * are ignored. A heading is one to six leading '#' characters followed by a
 * space, exactly as the renderer matches it.
 * @param {string} source
 * @returns {OutlineEntry[]}
 */
export function parseOutline(source) {
  const lines = String(source || "").replace(/\r\n/g, "\n").split("\n");
  const slug = createSlugger();
  /** @type {OutlineEntry[]} */
  const entries = [];
  let inFence = false;
  for (const line of lines) {
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    if (!m) continue;
    entries.push({ level: m[1].length, text: plainText(m[2]), slug: slug(m[2]) });
  }
  return entries;
}

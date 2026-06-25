/*
 * Inline tokenizer for the markdown subset renderer. Pure (no React): returns a
 * flat descriptor list so the autolink logic is unit-testable in isolation.
 * Descriptor kinds:
 *   { type: "text",   value }      plain text run
 *   { type: "code",   value }      inline code, backticks stripped
 *   { type: "strong", value }      bold inner text (not re-tokenized)
 *   { type: "em",     value }      italic inner text (not re-tokenized)
 *   { type: "link",   text, href } explicit [text](href), or a bare http(s) URL (text === href)
 */

/**
 * @typedef {(
 *   | { type: "text", value: string }
 *   | { type: "code", value: string }
 *   | { type: "strong", value: string }
 *   | { type: "em", value: string }
 *   | { type: "link", text: string, href: string }
 * )} InlineToken
 */

const TOKEN =
  /(`[^`]+`)|(\*\*[^*]+?\*\*)|(\*[^*]+?\*)|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/[^\s]+)/;
const TRAILING_PUNCT = /[.,;:!?)\]}>"'»]+$/;

/**
 * Tokenize one line of inline markdown into a flat descriptor list.
 * @param {string} text
 * @returns {InlineToken[]}
 */
export function tokenizeInline(text) {
  /** @type {InlineToken[]} */
  const out = [];
  let rest = String(text);
  while (rest.length) {
    const m = rest.match(TOKEN);
    if (!m) {
      out.push({ type: "text", value: rest });
      break;
    }
    if (m.index > 0) out.push({ type: "text", value: rest.slice(0, m.index) });
    const tok = m[0];
    let consumed = tok.length;
    if (tok.startsWith("`")) {
      out.push({ type: "code", value: tok.slice(1, -1) });
    } else if (tok.startsWith("**")) {
      out.push({ type: "strong", value: tok.slice(2, -2) });
    } else if (tok.startsWith("*")) {
      out.push({ type: "em", value: tok.slice(1, -1) });
    } else if (tok.startsWith("[")) {
      const mm = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      out.push({ type: "link", text: mm[1], href: mm[2] });
    } else {
      // Bare http(s) URL: trim a trailing run of sentence punctuation back to
      // plain text, so "see https://x/y." links https://x/y and keeps the period.
      const url = tok.replace(TRAILING_PUNCT, "") || tok;
      out.push({ type: "link", text: url, href: url });
      consumed = url.length;
    }
    rest = rest.slice(m.index + consumed);
  }
  return out;
}

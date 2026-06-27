import { test } from "node:test";
import assert from "node:assert/strict";
import { createSlugger, parseOutline } from "../src/renderers/markdownOutline.js";

test("createSlugger: a single heading slugifies to lowercase dashed text", () => {
  const slug = createSlugger();
  assert.equal(slug("Customer Profile"), "customer-profile");
});

test("createSlugger: a repeated heading gets numeric suffixes from -2", () => {
  const slug = createSlugger();
  assert.equal(slug("Summary"), "summary");
  assert.equal(slug("Summary"), "summary-2");
  assert.equal(slug("Summary"), "summary-3");
});

test("createSlugger: two instances fed the same sequence agree", () => {
  const a = createSlugger();
  const b = createSlugger();
  const seq = ["Intro", "Details", "Intro", "Details"];
  assert.deepEqual(seq.map(a), seq.map(b));
});

test("createSlugger: a literal slug and a disambiguated slug do not collide", () => {
  const slug = createSlugger();
  assert.equal(slug("Summary"), "summary");
  assert.equal(slug("Summary 2"), "summary-2");
  assert.equal(slug("Summary"), "summary-3");
});

test("createSlugger: an empty or symbol-only heading falls back to section", () => {
  const slug = createSlugger();
  assert.equal(slug("***"), "section");
  assert.equal(slug("   "), "section-2");
});

test("parseOutline: extracts headings with level and plain text", () => {
  const md = "# Title\n\nbody\n\n## Section A\n\n### Deep\n";
  assert.deepEqual(parseOutline(md), [
    { level: 1, text: "Title", slug: "title" },
    { level: 2, text: "Section A", slug: "section-a" },
    { level: 3, text: "Deep", slug: "deep" },
  ]);
});

test("parseOutline: the label is plain text but the slug comes from the raw heading", () => {
  const md = "## See [the docs](https://x.com)\n";
  assert.deepEqual(parseOutline(md), [
    { level: 2, text: "See the docs", slug: "see-the-docs-https-x-com" },
  ]);
});

test("parseOutline: a heading inside a fenced code block is ignored and does not shift the sequence", () => {
  const md = "# Intro\n\n```\n## Fake\n```\n\n## Intro\n";
  assert.deepEqual(parseOutline(md), [
    { level: 1, text: "Intro", slug: "intro" },
    { level: 2, text: "Intro", slug: "intro-2" },
  ]);
});

test("parseOutline: zero or one heading yields fewer than two entries", () => {
  assert.equal(parseOutline("just prose, no headings").length, 0);
  assert.equal(parseOutline("# Only one\n\nbody").length, 1);
});

test("parseOutline: CRLF source parses the same as LF", () => {
  assert.deepEqual(parseOutline("# A\r\n## B\r\n"), [
    { level: 1, text: "A", slug: "a" },
    { level: 2, text: "B", slug: "b" },
  ]);
});

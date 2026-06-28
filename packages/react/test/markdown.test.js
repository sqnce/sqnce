import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenizeInline } from "../src/renderers/markdownInline.js";

test("tokenizeInline: a bare http(s) URL becomes a link whose text is the URL", () => {
  assert.deepEqual(tokenizeInline("https://x.com"), [
    { type: "link", text: "https://x.com", href: "https://x.com" },
  ]);
});

test("tokenizeInline: a sentence-final URL leaves the trailing period as text", () => {
  assert.deepEqual(tokenizeInline("see https://learn.microsoft.com/x."), [
    { type: "text", value: "see " },
    {
      type: "link",
      text: "https://learn.microsoft.com/x",
      href: "https://learn.microsoft.com/x",
    },
    { type: "text", value: "." },
  ]);
});

test("tokenizeInline: a URL inside an inline code span stays a literal code token", () => {
  assert.deepEqual(tokenizeInline("run `https://x.com` now"), [
    { type: "text", value: "run " },
    { type: "code", value: "https://x.com" },
    { type: "text", value: " now" },
  ]);
});

test("tokenizeInline: an explicit link still tokenizes as one link (unchanged)", () => {
  assert.deepEqual(tokenizeInline("[docs](https://x.com)"), [
    { type: "link", text: "docs", href: "https://x.com" },
  ]);
});

test("tokenizeInline: bold and italic inner text is not re-tokenized", () => {
  assert.deepEqual(tokenizeInline("a **b https://x.com** c"), [
    { type: "text", value: "a " },
    { type: "strong", value: "b https://x.com" },
    { type: "text", value: " c" },
  ]);
});

test("tokenizeInline: keeps a balanced trailing paren in a bare URL", () => {
  const link = tokenizeInline("see https://en.wikipedia.org/wiki/Foo_(bar)").find((t) => t.type === "link");
  assert.equal(link.href, "https://en.wikipedia.org/wiki/Foo_(bar)");
});

test("tokenizeInline: strips an unbalanced trailing paren and sentence punctuation", () => {
  const a = tokenizeInline("(see https://x/y)").find((t) => t.type === "link");
  assert.equal(a.href, "https://x/y");
  const b = tokenizeInline("see https://x/y.").find((t) => t.type === "link");
  assert.equal(b.href, "https://x/y");
});

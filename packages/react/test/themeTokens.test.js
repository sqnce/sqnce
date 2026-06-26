import { test } from "node:test";
import assert from "node:assert/strict";
import { THEME_TOKENS, readThemeVars } from "../src/themeTokens.js";

test("readThemeVars mirrors only the public tokens a consumer set", () => {
  const set = { "--sqnce-accent": "rgb(0, 0, 255)", "--sqnce-paper": "" };
  const vars = readThemeVars((name) => set[name] ?? "");
  assert.equal(vars["--sqnce-accent"], "rgb(0, 0, 255)");
  assert.ok(!("--sqnce-paper" in vars), "an empty token is not mirrored");
});

test("THEME_TOKENS lists public token names without the --sqnce- prefix", () => {
  assert.ok(THEME_TOKENS.includes("accent"));
  assert.ok(THEME_TOKENS.every((n) => !n.startsWith("--")));
});

test("THEME_TOKENS includes the reading-mode document font token", () => {
  assert.ok(THEME_TOKENS.includes("font-read"));
});

test("readThemeVars mirrors a set --sqnce-font-read override", () => {
  const set = { "--sqnce-font-read": "Georgia, 'Times New Roman', serif" };
  const vars = readThemeVars((name) => set[name] ?? "");
  assert.equal(vars["--sqnce-font-read"], "Georgia, 'Times New Roman', serif");
});

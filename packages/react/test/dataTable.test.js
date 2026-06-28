import { test } from "node:test";
import assert from "node:assert/strict";
import { discoverColumns } from "../src/renderers/discoverColumns.js";

test("discoverColumns includes a key that first appears past row 50", () => {
  const rows = [];
  for (let i = 0; i < 60; i++) rows.push(i === 55 ? { a: 1, late: 2 } : { a: 1 });
  assert.deepEqual(discoverColumns(rows), ["a", "late"]);
});

test("discoverColumns preserves first-seen order", () => {
  assert.deepEqual(discoverColumns([{ b: 1, a: 1 }, { c: 1, a: 1 }]), ["b", "a", "c"]);
});

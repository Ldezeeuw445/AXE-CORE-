import { test } from "node:test";
import assert from "node:assert/strict";
import { clampFocus, formatClock, wordCount, FOCUS_DEFAULT } from "./widgets.ts";

test("focus timer clamps to 5..90 in steps of 5", () => {
  assert.equal(clampFocus(0), 5);
  assert.equal(clampFocus(200), 90);
  assert.equal(clampFocus(22), 20);
  assert.equal(clampFocus(Number.NaN), FOCUS_DEFAULT);
});

test("clock + word count", () => {
  assert.equal(formatClock(17 * 60), "17:00");
  assert.equal(formatClock(65), "01:05");
  assert.equal(formatClock(-3), "00:00");
  assert.equal(wordCount("  "), 0);
  assert.equal(wordCount("call  the broker\ntomorrow"), 4);
});

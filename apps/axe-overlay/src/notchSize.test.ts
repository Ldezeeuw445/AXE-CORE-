import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SIZE, SIZE_KEY, loadSize, saveSize, sizeFromCmd, sizeKeyAction, toggleSize } from "./notchSize.ts";

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

test("default is compact; remembers the last explicit choice", () => {
  const s = mem();
  assert.equal(DEFAULT_SIZE, "compact");
  assert.equal(loadSize(s), "compact");
  saveSize(s, "large");
  assert.equal(s.m.get(SIZE_KEY), "large");
  assert.equal(loadSize(s), "large");
  s.setItem(SIZE_KEY, "huge");
  assert.equal(loadSize(s), "compact");
  assert.equal(loadSize(null), "compact");
  const broken = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
  assert.equal(loadSize(broken), "compact");
  assert.doesNotThrow(() => saveSize(broken, "large"));
});

test("toggle + keyboard: ⌘E / Ctrl+E toggles, Esc steps down", () => {
  assert.equal(toggleSize("compact"), "large");
  assert.equal(toggleSize("large"), "compact");
  assert.equal(sizeKeyAction({ key: "e", metaKey: true }), "toggle");
  assert.equal(sizeKeyAction({ key: "E", ctrlKey: true }), "toggle");
  assert.equal(sizeKeyAction({ key: "e" }), null);
  assert.equal(sizeKeyAction({ key: "Escape" }), "step-down");
});

test("overlay.cmd sizes", () => {
  assert.equal(sizeFromCmd("expand", "compact"), "compact");
  assert.equal(sizeFromCmd("expand", "large"), "large");
  assert.equal(sizeFromCmd("expand-large", "compact"), "large");
  assert.equal(sizeFromCmd("expand-compact", "large"), "compact");
  assert.equal(sizeFromCmd("toggle-size", "compact"), "large");
  assert.equal(sizeFromCmd("approvals", "compact"), null);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { NOTCH_TABS, tabActie, tabBadge } from "./tabs.ts";

test("precies zes tabs, Home eerst", () => {
  assert.equal(NOTCH_TABS.length, 6);
  assert.equal(NOTCH_TABS[0].id, "home");
  assert.equal(new Set(NOTCH_TABS.map((t) => t.id)).size, 6);
});

test("Home opent de shell, de rest kiest een tab", () => {
  assert.deepEqual(tabActie("home"), { soort: "open-shell" });
  assert.deepEqual(tabActie("trading"), { soort: "kies-tab", tab: "trading" });
});

test("badges alleen op Meldingen en Agents", () => {
  const c = { approvals: 3, tasks: 2 };
  assert.equal(tabBadge("meldingen", c), 3);
  assert.equal(tabBadge("agents", c), 2);
  assert.equal(tabBadge("chat", c), 0);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { NOTCH_TABS, tabActie, tabBadge } from "./tabs.ts";

test("precies zes tabs, Home eerst", () => {
  assert.equal(NOTCH_TABS.length, 6);
  assert.equal(NOTCH_TABS[0].id, "home");
  assert.equal(new Set(NOTCH_TABS.map((t) => t.id)).size, 6);
});

test("Home/NorthSea/Trading openen de shell; Chat/Meldingen/Agents kiezen een tab", () => {
  assert.deepEqual(tabActie("home"), { soort: "open-shell" });
  assert.deepEqual(tabActie("northsea"), { soort: "open-shell", route: "/northsea" });
  assert.deepEqual(tabActie("trading"), { soort: "open-shell", route: "/trading" });
  assert.deepEqual(tabActie("chat"), { soort: "kies-tab", tab: "chat" });
  assert.deepEqual(tabActie("meldingen"), { soort: "kies-tab", tab: "meldingen" });
  assert.deepEqual(tabActie("agents"), { soort: "kies-tab", tab: "agents" });
});

test("badges alleen op Meldingen en Agents", () => {
  const c = { approvals: 3, tasks: 2 };
  assert.equal(tabBadge("meldingen", c), 3);
  assert.equal(tabBadge("agents", c), 2);
  assert.equal(tabBadge("chat", c), 0);
  assert.equal(tabBadge("northsea", c), 0);
});

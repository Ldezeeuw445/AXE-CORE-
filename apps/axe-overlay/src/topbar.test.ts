import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TOPBAR_BUTTONS,
  TOPBAR_HEIGHT,
  topbarActie,
  topbarBadge,
} from "./topbar.ts";

test("zes topbar-knoppen, HQ eerst", () => {
  assert.equal(TOPBAR_BUTTONS.length, 6);
  assert.equal(TOPBAR_BUTTONS[0].id, "hq");
  assert.equal(new Set(TOPBAR_BUTTONS.map((b) => b.id)).size, 6);
  assert.ok(TOPBAR_HEIGHT >= 36 && TOPBAR_HEIGHT <= 56);
});

test("topbarActie dekt alle ids", () => {
  assert.deepEqual(topbarActie("hq"), { soort: "open-hq" });
  assert.deepEqual(topbarActie("chat"), { soort: "new-chat" });
  assert.deepEqual(topbarActie("ptt"), { soort: "ptt" });
  assert.deepEqual(topbarActie("approvals"), { soort: "approvals" });
  assert.deepEqual(topbarActie("agents"), { soort: "agents" });
  assert.deepEqual(topbarActie("settings"), { soort: "settings" });
});

test("badges alleen op approvals en agents", () => {
  const c = { approvals: 4, tasks: 7 };
  assert.equal(topbarBadge("approvals", c), 4);
  assert.equal(topbarBadge("agents", c), 7);
  assert.equal(topbarBadge("hq", c), 0);
  assert.equal(topbarBadge("chat", c), 0);
});

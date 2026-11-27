import { test } from "node:test";
import assert from "node:assert/strict";
import { designData, designState } from "./design.ts";

test("design data never in Tauri or production builds", () => {
  assert.equal(designState({ dev: true, tauri: true, search: "?ontwerp=1" }), null);
  assert.equal(designState({ dev: false, tauri: false, search: "?ontwerp=1" }), null);
  assert.equal(designState({ dev: true, tauri: false, search: "" }), null);
  assert.equal(designState({ dev: true, tauri: false, search: "?ontwerp=1&state=error" }), "error");
  assert.equal(designState({ dev: true, tauri: false, search: "?ontwerp=1&state=nope" }), "working");
});

test("design fixtures match their state", () => {
  assert.equal(designData("offline").online, false);
  assert.equal(designData("error").failed.length, 1);
  assert.equal(designData("empty").approvals.length, 0);
  assert.ok(designData("working").live.length > 0);
});

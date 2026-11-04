import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LOOK, isLook, resolveLook } from "./look.ts";

test("isLook accepteert alleen black|glass", () => {
  assert.equal(isLook("black"), true);
  assert.equal(isLook("glass"), true);
  assert.equal(isLook("dark"), false);
  assert.equal(isLook("light"), false);
  assert.equal(isLook(null), false);
});

test("resolveLook: shared wint van local; anders default glass", () => {
  assert.equal(resolveLook({ shared: "black", local: "glass" }), "black");
  assert.equal(resolveLook({ shared: undefined, local: "black" }), "black");
  assert.equal(resolveLook({}), DEFAULT_LOOK);
  assert.equal(resolveLook({ shared: "neon", local: "oops" }), DEFAULT_LOOK);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { AXE_CARD_BG, DEFAULT_LOOK, isLook, resolveLook } from "./look.ts";

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

test("AXE_CARD_BG is het HQ-matzwart (axe-surface.css --axe-card-bg)", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../../../AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/src/design/axe-surface.css", import.meta.url), "utf8");
  const hq = /--axe-card-bg:\s*([^;]+);/.exec(css)?.[1].replace(/\s+/g, "").replace(/(\D)\./g, "$10.");
  assert.equal(AXE_CARD_BG.replace(/\s+/g, ""), hq);
});

test("glass topbar-chrome verschilt zichtbaar van black (App.css)", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./App.css", import.meta.url), "utf8");
  const black = /:root\[data-look="black"\]\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
  const glass = /:root\[data-look="glass"\]\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
  assert.ok(black.includes("--axe-topbar-bg"), "black mist topbar");
  assert.ok(glass.includes("--axe-topbar-bg"), "glass mist topbar");
  const blackTop = /--axe-topbar-bg:\s*([^;]+);/.exec(black)?.[1];
  const glassTop = /--axe-topbar-bg:\s*([^;]+);/.exec(glass)?.[1];
  assert.notEqual(blackTop, glassTop);
  assert.match(glassTop ?? "", /248,\s*250,\s*253/);
  // Panel blijft matzwart-kaart (mat-zwart pass) in beide standen.
  assert.match(black, /--axe-panel:\s*var\(--axe-card-bg\)/);
  assert.match(glass, /--axe-panel:\s*var\(--axe-card-bg\)/);
});

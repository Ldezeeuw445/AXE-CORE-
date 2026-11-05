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

test("overlay-notch is altijd HQ --axe-surface, nooit glass", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./App.css", import.meta.url), "utf8");
  const surface = readFileSync(new URL("../../../AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/src/design/axe-surface.css", import.meta.url), "utf8");
  assert.match(surface, /--axe-surface:\s*#0A0A0A/);
  assert.match(css, /--axe-topbar-bg:\s*#0A0A0A/);
  assert.doesNotMatch(css, /:root\[data-look="glass"\]/);
  assert.doesNotMatch(css, /248,\s*250,\s*253/);
});

test("notch clip-path + cyaan knop-accent (geen rechthoek-hoekstreepjes)", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("./App.css", import.meta.url), "utf8");
  assert.match(css, /clip-path:\s*inset\(0 round 0 0 16px 16px\)/);
  assert.match(css, /\.topbar-btn:hover\s*\{[^}]*--axe-cyan/s);
  assert.match(css, /\.topbar-btn\.on,\s*\.topbar-btn\.ptt-on\s*\{[^}]*background:\s*var\(--axe-cyan\)/s);
});

test("overlay past geen look toe op de notch-chrome", async () => {
  const { readFileSync } = await import("node:fs");
  const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
  const look = readFileSync(new URL("./look.ts", import.meta.url), "utf8");
  assert.doesNotMatch(app, /applyLook/);
  assert.doesNotMatch(app, /get_axe_look/);
  assert.doesNotMatch(look, /document\.documentElement\.style\.colorScheme/);
});

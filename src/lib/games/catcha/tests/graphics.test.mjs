import test from "node:test";
import assert from "node:assert/strict";
import { createGraphicsPolicy, GRAPHICS_KEY, GRAPHICS_MODES } from "../graphics-settings.js";

test("graphics choice persists independently and handles unavailable or invalid storage", () => {
  const data = new Map([["cuc-family-v1", "family"], [GRAPHICS_KEY, "old-mode"]]);
  const storage = { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v) };
  const p = createGraphicsPolicy(storage);
  assert.equal(p.mode.id, "auto");
  p.setMode("ultra");
  assert.equal(createGraphicsPolicy(storage).mode.id, "ultra");
  assert.equal(data.get("cuc-family-v1"), "family");
  p.setMode("high", false);
  assert.equal(data.get(GRAPHICS_KEY), "ultra");
  const privateStorage = { getItem() { throw Error("private"); }, setItem() { throw Error("private"); } };
  assert.doesNotThrow(() => createGraphicsPolicy(privateStorage).setMode("high"));
});

test("all profiles keep native UI separate and respect device and pixel budgets", () => {
  const p = createGraphicsPolicy();
  for (const mode of GRAPHICS_MODES) {
    p.setMode(mode.id);
    for (const [w, h, dpr] of [[844, 390, 3], [1024, 768, 2], [1920, 1080, 3], [3840, 2160, 4], [320, 180, 1]]) {
      const d = p.dimensions(w, h, dpr);
      assert(d.screenWidth * d.screenHeight <= 6000000);
      assert(d.sceneWidth * d.sceneHeight <= mode.pixels);
      assert(d.sceneRatio <= d.screenRatio && d.screenRatio <= dpr);
      assert(d.sceneWidth > 0 && d.sceneHeight > 0);
    }
    assert.equal(p.dimensions(844, 390, 3).screenRatio, 3);
  }
  p.setMode("battery");
  assert.equal(p.dimensions(844, 390, 3).sceneRatio, 1.5);
  p.setMode("ultra");
  assert.equal(p.dimensions(844, 390, 3).sceneRatio, 3);
  assert.equal(p.dimensions(844, 390, NaN).screenRatio, 1);
});

const feed = (p, ms, duration, active = true) => { for (let elapsed = 0; elapsed < duration; elapsed += ms) p.sample(ms, active); };
test("Auto adapts both ways after sustained play without reacting to menus or single stalls", () => {
  const p = createGraphicsPolicy();
  feed(p, 50, 30000, false);
  assert.equal(p.dimensions(844, 390, 3).sceneRatio, 2);
  feed(p, 33.3, 2000);
  assert.equal(p.dimensions(844, 390, 3).sceneRatio, 2);
  p.sample(2000); // tab return / debugger pause
  assert.equal(p.dimensions(844, 390, 3).sceneRatio, 2);
  feed(p, 33.3, 18000);
  assert(p.dimensions(844, 390, 3).sceneRatio < 2);
  feed(p, 16.67, 60000);
  assert.equal(p.dimensions(844, 390, 3).sceneRatio, 2, "recovers, but never climbs past Auto's own 2× (heat)");
  feed(p, 40, 60000);
  assert.equal(p.dimensions(844, 390, 3).sceneRatio, 1.25);
});

test("manual quality remains fixed under load; switching back to Auto resets its budget", () => {
  const p = createGraphicsPolicy();
  for (const id of ["battery", "high", "ultra"]) {
    p.setMode(id);
    const before = p.dimensions(844, 390, 3);
    feed(p, 40, 60000); feed(p, 16.67, 60000);
    assert.deepEqual(p.dimensions(844, 390, 3), before);
  }
  p.setMode("auto");
  assert.equal(p.dimensions(844, 390, 3).sceneRatio, 2);
});

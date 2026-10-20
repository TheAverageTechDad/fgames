import test from "node:test";
import assert from "node:assert/strict";
import { createCook, cookRound, interact, stepCook, stepPrep, RECIPES, PREP, SUPPLIES } from "../cooking.js";
import { cookingGuide, kitchenHudLayout } from "../cooking-guide.js";

test("following the guide completes every recipe without changing state during reads", () => {
  for (const recipe of Object.keys(RECIPES)) {
    const k = createCook(), settings = { ...cookRound("easy", 3), menu: [recipe], maxOrders: 1 };
    stepCook(k, 1, settings, () => 0);
    for (let i = 0; i < 30 && !k.served; i++) {
      const before = structuredClone(k), g = cookingGuide(k, settings);
      assert.deepEqual(k, before, "guidance is read-only");
      if (!g.targets.length) { stepCook(k, 8, settings, () => 0); continue; }
      const station = g.targets[0], event = interact(k, station, settings);
      assert.notEqual(event?.type, "wrong", `${recipe}: ${g.title}`);
      if (SUPPLIES[station]) assert.equal(g.icon, k.carried.id, "hint names the ingredient actually offered");
      if (PREP.includes(station)) stepPrep(k, station, settings.prepTime + 0.1, settings);
    }
    assert.equal(k.served, 1, `${recipe} can be served by following the guide`);
  }
});

test("guidance rescues ready food and clears blocked cookers before fetching more", () => {
  const k = createCook(), settings = cookRound("hard", 1);
  stepCook(k, 1, settings, () => 0);
  Object.assign(k.cookers.pan, { state: "ready", dish: "pancakes", t: 4, order: 1 });
  assert.deepEqual(cookingGuide(k, settings).targets, ["pan"]);
  assert.equal(cookingGuide(k, settings).kind, "urgent");
  assert.notEqual(cookingGuide(k, { ...settings, burnAfter: null }).kind, "urgent", "Easy never warns of burning");
  k.cookers.pan.state = "burnt";
  assert.deepEqual(cookingGuide(k, settings).targets, ["pan"]);
  interact(k, "pan", settings);
  assert.deepEqual(cookingGuide(k, settings).targets, ["bin"]);
  k.carried = { type: "prep", recipe: "cookies", order: 1 };
  k.cookers.oven.state = "cooking";
  assert.deepEqual(cookingGuide(k, settings).targets, [], "no false transfer into an occupied cooker");
  k.carried = { type: "ing", id: "cheese" };
  k.orders = [];
  assert.deepEqual(cookingGuide(k, settings).targets, ["bin"], "expired ingredients have a recovery route");
});

test("all three tickets fit in one row and stay fixed as orders arrive", () => {
  for (const [w, h, inset] of [[640, 360, 14], [844, 390, 61], [1024, 768, 14], [1366, 1024, 14], [1920, 1080, 14]]) {
    const v = { w, h, left: inset, right: inset, top: 12, bottom: 12 };
    const l = kitchenHudLayout(v, 3), one = kitchenHudLayout(v, 1);
    assert.deepEqual(l.tickets[0], one.tickets[0], "order arrivals cannot shift the first ticket");
    const rectangles = [l.score, ...l.tickets, l.timer, l.pause];
    for (let i = 0; i < rectangles.length; i++) {
      const b = rectangles[i];
      assert.equal(b.y, v.top);
      assert(b.w > 0 && b.x >= v.left && b.x + b.w <= w - v.right, `${w}: header stays inside safe areas`);
      if (i) assert(rectangles[i - 1].x + rectangles[i - 1].w < b.x, `${w}: no overlapping chips`);
    }
    assert(l.tickets.every((b) => b.y + b.h < 80), "cards cannot descend over the side counters");
    assert(l.guide.y > h / 2 && l.guide.x >= v.left && l.guide.x + l.guide.w <= w - v.right);
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { createCook, interact, stepPrep, stepCook, kitchenLayout, cookRound, wanted, destinations, orderView, SLOTS, STATIONS } from "../cooking.js";

const settings = { ...cookRound("medium", 1), menu: ["pancakes"], maxOrders: 1 };

test("a pancake order goes fridge/pantry → bowl → mix → pan → ready → hatch, and burns if left", () => {
  const k = createCook();
  stepCook(k, 1, settings, () => 0);
  assert.equal(k.orders.length, 1);
  assert.deepEqual(wanted(k).sort(), ["egg", "flour", "milk"]);
  assert.equal(interact(k, "fridge", settings).ing, "egg"); // fridge offers the first thing still needed
  assert.equal(interact(k, "fridge", settings), null, "one thing at a time");
  assert.deepEqual(destinations(k), ["bowl"]);
  assert.equal(interact(k, "board", settings).type, "wrong");
  assert.equal(interact(k, "bowl", settings).type, "add");
  assert.equal(interact(k, "fridge", settings).ing, "milk");
  interact(k, "bowl", settings);
  assert.equal(interact(k, "pantry", settings).ing, "flour");
  assert.equal(interact(k, "bowl", settings).full, true);
  assert.equal(interact(k, "fridge", settings).reason, "nothing", "nothing more is needed");
  assert.equal(orderView(k, settings)[0].stage, "prep");
  let done = null;
  for (let i = 0; i < 40 && !done; i++) done = stepPrep(k, "bowl", 0.1, settings);
  assert.equal(done.type, "prepped");
  assert.equal(interact(k, "bowl", settings).type, "takePrep");
  assert.equal(k.prep.bowl.order, null, "taking prepared food releases its station claim");
  assert.deepEqual(wanted(k), [], "do not fetch the ingredients again while carrying its mix");
  assert.equal(interact(k, "oven", settings).type, "wrong", "pancakes go in the pan");
  assert.equal(interact(k, "pan", settings).type, "cookStart");
  assert.deepEqual(wanted(k), [], "a cooking order must not request a duplicate batch");
  const events = [];
  for (let i = 0; i < 60; i++) events.push(...stepCook(k, 0.1, settings, () => 0));
  assert(events.some((e) => e.type === "ready"));
  assert.equal(interact(k, "pan", settings).type, "takeDish");
  const served = interact(k, "hatch", settings);
  assert.equal(served.type, "serve");
  assert(served.points > 190);
  assert.equal(k.served, 1);
  assert.equal(k.carried, null);
});

test("left on the stove, food burns and only the bin takes it", () => {
  const k = createCook();
  stepCook(k, 1, settings, () => 0);
  k.carried = { type: "prep", recipe: "pancakes", order: k.orders[0].id };
  interact(k, "pan", settings);
  for (let i = 0; i < 200; i++) stepCook(k, 0.1, { ...settings, patience: null }, () => 0);
  assert.equal(k.cookers.pan.state, "burnt");
  assert.equal(interact(k, "pan", settings).burnt, true);
  assert.equal(interact(k, "hatch", settings).reason, "burnt");
  assert.deepEqual(destinations(k), ["bin"]);
  assert.equal(interact(k, "bin", settings).type, "bin");
});

test("an order that runs out of patience is missed and its bowl is tipped out", () => {
  const k = createCook();
  stepCook(k, 1, settings, () => 0);
  k.carried = { type: "ing", id: "egg" };
  interact(k, "bowl", settings);
  const events = stepCook(k, settings.patience + 1, { ...settings, maxOrders: 0 }, () => 0);
  assert(events.some((e) => e.type === "missed"));
  assert(events.some((e) => e.type === "tipped"));
  assert.equal(k.prep.bowl.contents.length, 0);
});

test("layouts are deterministic, use every station once, and seat her beside a prep station", () => {
  for (let seed = 1; seed < 60; seed++) {
    const a = kitchenLayout(seed);
    assert.deepEqual(a, kitchenLayout(seed));
    assert.deepEqual(Object.keys(a).sort(), [...STATIONS].sort());
    assert.equal(new Set(Object.values(a)).size, STATIONS.length);
    for (const id of ["fridge", "pantry", "oven", "bin"]) assert.notEqual(SLOTS[a[id]].run, "island");
    const nextTo = (x, y) => SLOTS[x].run === SLOTS[y].run && Math.abs(x - y) === 1;
    assert(nextTo(a.seat, a.bowl) || nextTo(a.seat, a.board), `seed ${seed}`);
  }
  assert.notDeepEqual(kitchenLayout(1), kitchenLayout(2));
});

test("rounds: Easy is three untimed rounds with no burning; Hard ramps to three orders", () => {
  assert.equal(cookRound("easy", 1).timed, false);
  assert.equal(cookRound("easy", 1).burnAfter, null);
  assert.equal(cookRound("easy", 9).rounds, 3);
  assert.equal(cookRound("hard", 2).maxOrders, 3);
  assert(cookRound("hard", 9).patience >= 38);
  assert.equal(cookRound("medium", 2).twist, "Pizza's on the menu!");
});

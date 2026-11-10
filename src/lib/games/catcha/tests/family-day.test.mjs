import test from "node:test";
import assert from "node:assert/strict";
import { roundSettings } from "../game-modes.js";
import { cookRound } from "../cooking.js";
import { familyDaySettings, createFamilyDay, finishActivity, kitchenSeed, beginKitchen, stepDay, skipDay, failDay, claimDayResult } from "../family-day.js";

test("Family Day targets preserve the standalone profiles and calm Easy rules", () => {
  const modes = ["easy", "medium", "hard"];
  const before = modes.map(mode => [1, 2, 3, 12].map(r => [roundSettings(mode, r), cookRound(mode, r)]));
  modes.forEach((mode, i) => {
    const tidy = familyDaySettings(mode, "clean"), cook = familyDaySettings(mode, "cook");
    assert.equal(tidy.quota, [4, 6, 8][i]); assert.equal(cook.quota, [1, 2, 3][i]);
    assert.equal(tidy.rounds, 1); assert.equal(cook.rounds, 1);
    assert.equal(tidy.roundTime, [0, 88, 70][i]); assert.equal(cook.roundTime, [0, 110, 100][i]);
  });
  const easy = familyDaySettings("easy", "cook");
  assert.equal(easy.patience, null); assert.equal(easy.burnAfter, null); assert.equal(easy.maxOrders, 1);
  assert.deepEqual(modes.map(mode => [1, 2, 3, 12].map(r => [roundSettings(mode, r), cookRound(mode, r)])), before);
});
test("only the current activity can complete, and each clear bonus is awarded once", () => {
  const day = createFamilyDay("medium", 7);
  assert.equal(finishActivity(day, "cook", 80), null);
  assert.equal(finishActivity(day, "clean", 3.2), 290);
  assert.equal(finishActivity(day, "clean", 3.2), null);
  assert.equal(day.phase, "transition");
  assert.equal(beginKitchen(day), true); assert.equal(beginKitchen(day), false);
  assert.equal(finishActivity(day, "cook", 1), 260);
  assert.equal(finishActivity(day, "cook", 1), null);
  assert.deepEqual(day.completed, ["clean", "cook"]);
});
test("an untimed activity never receives a clock bonus", () => {
  assert.equal(finishActivity(createFamilyDay("easy", 1), "clean", 999), 250);
  assert.equal(finishActivity(createFamilyDay("hard", 1), "clean", -5), 250);
});
test("transition clocks pause and become ready without resetting the kitchen repeatedly", () => {
  const day = createFamilyDay("easy", 7); finishActivity(day, "clean", 0);
  stepDay(day, 2, { paused: true }); assert.equal(day.phaseTime, 0);
  assert.equal(stepDay(day, 2.7), null); assert.equal(stepDay(day, 0.11), "kitchen");
  beginKitchen(day); assert.equal(stepDay(day, 10), null); assert.equal(day.phase, "cook");
});
test("the meal waits for all seats and freezes its gathering and eating clocks when paused", () => {
  const day = createFamilyDay("easy", 7); finishActivity(day, "clean", 0); beginKitchen(day); finishActivity(day, "cook", 0);
  stepDay(day, 6); assert.equal(day.seatedTime, 0);
  stepDay(day, 3, { mealReady: true });
  const before = structuredClone(day); stepDay(day, 50, { paused: true, mealReady: true }); assert.deepEqual(day, before);
  assert.equal(stepDay(day, 1.01, { mealReady: true }), "complete");
  assert.equal(day.phase, "complete");
});
test("a stalled cosmetic meal can time out or be skipped, but active activities cannot", () => {
  const day = createFamilyDay("easy", 7); assert.equal(skipDay(day), null);
  finishActivity(day, "clean", 0); assert.equal(skipDay(day), null);
  stepDay(day, 0.8); assert.equal(skipDay(day), "kitchen"); beginKitchen(day);
  assert.equal(skipDay(day), null); finishActivity(day, "cook", 0);
  assert.equal(stepDay(day, 25), "complete"); assert.equal(skipDay(day), null);
  const other = createFamilyDay("easy", 8); finishActivity(other, "clean", 0); beginKitchen(other); finishActivity(other, "cook", 0);
  stepDay(other, 0.8); assert.equal(skipDay(other), "complete");
});
test("results can only be claimed once, after success or a gameplay failure", () => {
  const day = createFamilyDay("easy", 7); assert.equal(claimDayResult(day), false);
  finishActivity(day, "clean", 0); assert.equal(failDay(day), false);
  beginKitchen(day); assert.equal(failDay(day), true); assert.equal(failDay(day), false);
  assert.equal(claimDayResult(day), true); assert.equal(claimDayResult(day), false);
  const won = createFamilyDay("easy", 8); finishActivity(won, "clean", 0); beginKitchen(won); finishActivity(won, "cook", 0);
  stepDay(won, 5, { mealReady: true }); assert.equal(claimDayResult(won), true); assert.equal(claimDayResult(won), false);
});
test("new days reset progress and seed both worlds repeatably without random reads", () => {
  const a = createFamilyDay("hard", 7), b = createFamilyDay("hard", 7);
  assert.deepEqual(a, b); assert.equal(kitchenSeed(a), kitchenSeed(b)); assert.notEqual(kitchenSeed(a), a.seed);
  finishActivity(a, "clean", 5); beginKitchen(a);
  const fresh = createFamilyDay("hard", 8); assert.equal(fresh.phase, "tidy"); assert.deepEqual(fresh.completed, []);
  assert.notEqual(kitchenSeed(fresh), kitchenSeed(b)); assert.equal(fresh.claimed, false);
  assert.equal(createFamilyDay("invalid", 0).mode, "easy");
});
test("non-finite or negative time cannot poison a session", () => {
  const day = createFamilyDay("medium", 7); assert.equal(finishActivity(day, "clean", Infinity), 250);
  for (const dt of [Infinity, NaN, -1]) assert.equal(stepDay(day, dt), null);
  assert.equal(day.phaseTime, 0);
});

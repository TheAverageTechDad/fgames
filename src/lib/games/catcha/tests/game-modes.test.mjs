import test from "node:test";
import assert from "node:assert/strict";
import { getMode, roundSettings } from "../game-modes.js";

test("Easy is three short relaxed rounds and invalid choices default safely", () => {
  const easy = roundSettings("easy", 1);
  assert.equal(easy.rounds, 3);
  assert.deepEqual([1, 2, 3].map((r) => roundSettings("easy", r).quota), [4, 6, 8]);
  for (const round of [4, 10, 100]) assert.deepEqual(roundSettings("easy", round), roundSettings("easy", 3));
  assert.equal(easy.timed, false);
  assert.equal(easy.messLimit, null);
  assert(easy.floorCap >= easy.quota && easy.batch === 1);
  assert(easy.pickupRadius > getMode("hard").pickupRadius);
  assert.equal(getMode("unknown").id, "easy");
});

test("adult modes add pressure gradually while keeping usable clocks", () => {
  for (const id of ["medium", "hard"]) {
    const first = roundSettings(id, 1), later = roundSettings(id, 12);
    assert(first.timed && later.timed);
    assert(later.roundTime > 0 && later.roundTime <= first.roundTime);
    assert(later.dropEvery > 0 && later.batch / later.dropEvery > first.batch / first.dropEvery); // more mess per second
    assert(later.speed >= first.speed && later.batch >= first.batch);
  }
  assert(roundSettings("medium").dropEvery > roundSettings("hard").dropEvery);
  assert(roundSettings("medium").roundTime > roundSettings("hard").roundTime);
});

test("every adult round names its twist, and the creep stays under its caps", () => {
  for (const id of ["medium", "hard"]) {
    assert.equal(roundSettings(id, 1).twist, null);
    for (let r = 2; r <= 30; r++) assert.equal(typeof roundSettings(id, r).twist, "string");
    const deep = roundSettings(id, 60);
    assert(deep.speed <= 6.5 && deep.dropEvery >= 2 && deep.roundTime >= 50 && deep.quota <= 18);
  }
  assert.equal(roundSettings("hard", 5).batch, 2); // double throws arrive in round 5, not before
  assert.equal(roundSettings("hard", 4).batch, 1);
});

import test from "node:test";
import assert from "node:assert/strict";
import { createPowerups, stepPowerups, toddlerSlow, carryBonus, chargeMom, FLOOR_LIFE, POWERUPS } from "../powerups.js";

const far = { x: 50, z: 50 };
const opts = (player) => ({ player, rng: () => 0, pickSpot: () => ({ x: 0, z: 0 }), every: 10 });

test("an untouched token disappears after its floor life", () => {
  const pu = createPowerups(1);
  assert.equal(stepPowerups(pu, 1, opts(far))[0].type, "spawn");
  assert.ok(pu.field);
  let events = [];
  for (let t = 0; t < FLOOR_LIFE + 0.5; t += 0.5) events.push(...stepPowerups(pu, 0.5, opts(far)));
  assert.ok(events.some((e) => e.type === "missed"));
  assert.equal(pu.field, null);
  assert.equal(pu.missed, 1);
});

test("a grabbed token runs its effect for a limited time", () => {
  const pu = createPowerups(1);
  stepPowerups(pu, 1, opts(far));
  const kind = pu.field.kind;
  assert.equal(stepPowerups(pu, 0.1, opts({ x: 0, z: 0 }))[0].type, "pickup");
  assert.equal(kind, "slow");
  assert.equal(toddlerSlow(pu), 0.4);
  assert.equal(carryBonus(pu), 0);
  const events = [];
  for (let t = 0; t <= POWERUPS.slow.duration; t += 0.5) events.push(...stepPowerups(pu, 0.5, { ...opts(far), every: null }));
  assert.ok(events.some((e) => e.type === "ended" && e.kind === "slow"));
  assert.equal(toddlerSlow(pu), 1);
});

test("Mom is earned: combos fill the meter, the next bubble is Mom, a miss refunds half", () => {
  const pu = createPowerups(100);
  for (let i = 0; i < 50; i++) { pu.timer = 0; stepPowerups(pu, 0.1, opts(far)); assert.notEqual(pu.field.kind, "mom"); pu.field = null; }
  pu.timer = 100;
  assert.equal(chargeMom(pu, 1, 0.1), false);
  assert.equal(chargeMom(pu, 3, 0.1), false);
  assert.ok(Math.abs(pu.momCharge - 0.4) < 1e-9);
  assert.equal(chargeMom(pu, 5, 0.2), true); // x5 counts as x3
  stepPowerups(pu, 1.6, opts(far));
  assert.equal(pu.field.kind, "mom");
  assert.equal(pu.momCharge, 0);
  for (let t = 0; t < FLOOR_LIFE + 0.5; t += 0.5) stepPowerups(pu, 0.5, { ...opts(far), every: null });
  assert.equal(pu.momCharge, 0.5);
});

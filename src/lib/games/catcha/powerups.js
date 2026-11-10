/**
 * Power-ups: pure sim logic, no three.js (tests run under plain node). One token at a time
 * appears on the floor on a seeded timer; untouched, it fades away after `FLOOR_LIFE` seconds.
 * Touching it starts that effect for its `duration`; grabbing the same kind again refreshes it.
 * main.js draws the token (items.js) and reads the effect helpers below each step.
 */
export const POWERUPS = {
  slow: { label: "Snail time", hint: "Little one slows down", color: 0x9b7bff, duration: 8, weight: 1 },
  carry: { label: "Big basket", hint: "Carry 6 things", color: 0xffb627, duration: 12, weight: 1 },
  magnet: { label: "Magnet hands", hint: "Grab from further away", color: 0x2ec4b6, duration: 10, weight: 1 },
  // Never random: Mom is earned by filling the heart meter with returns (see chargeMom).
  mom: { label: "Mom's here", hint: "Mom tidies up for you!", color: 0xff7aa8, duration: 6, weight: 0 },
};
export const FLOOR_LIFE = 9;
export const BLINK_TIME = 3;
const GRAB_RADIUS = 1.5;

export function createPowerups(firstSpawn = 8) {
  return { field: null, active: {}, timer: firstSpawn, picked: 0, missed: 0, momCharge: 0, momReady: false };
}

/**
 * The heart meter: every return fills it, combos fill it faster (x1 → 1, x2 → 2, x3+ → 3 steps of
 * `rate`). Full means the next bubble is Mom, and it arrives within 1.5s. Returns true the moment
 * the meter fills.
 */
export function chargeMom(pu, combo, rate) {
  if (pu.momReady || pu.active.mom > 0 || pu.field?.kind === "mom") return false;
  pu.momCharge = Math.min(1, pu.momCharge + Math.min(3, Math.max(1, combo)) * rate);
  if (pu.momCharge < 1) return false;
  pu.momReady = true;
  return true;
}

/**
 * Advance one step. `every` is the seconds between tokens (null disables them),
 * `pickSpot(rng)` returns a free `{x, z}`. Returns the events of this step:
 * `{type: "spawn"|"pickup"|"missed"|"ended", kind}`.
 */
export function stepPowerups(pu, dt, { player, rng, pickSpot, every }) {
  const events = [];
  for (const kind of Object.keys(pu.active)) {
    pu.active[kind] -= dt;
    if (pu.active[kind] <= 0) { delete pu.active[kind]; events.push({ type: "ended", kind }); }
  }
  if (pu.field) {
    const f = pu.field;
    f.life -= dt;
    if (Math.hypot(f.x - player.x, f.z - player.z) < GRAB_RADIUS) {
      pu.active[f.kind] = POWERUPS[f.kind].duration;
      pu.picked += 1;
      pu.field = null;
      events.push({ type: "pickup", kind: f.kind });
    } else if (f.life <= 0) {
      pu.missed += 1;
      if (f.kind === "mom") pu.momCharge = 0.5; // a missed Mom refunds half the meter
      pu.field = null;
      events.push({ type: "missed", kind: f.kind });
    }
  } else if (every) {
    if (pu.momReady) pu.timer = Math.min(pu.timer, 1.5);
    pu.timer -= dt;
    if (pu.timer <= 0) {
      pu.timer = every;
      const roll = rng();
      const kind = pu.momReady ? "mom" : pickWeighted(roll);
      if (kind === "mom") { pu.momReady = false; pu.momCharge = 0; }
      pu.field = { kind, ...pickSpot(rng), life: FLOOR_LIFE };
      events.push({ type: "spawn", kind });
    }
  }
  return events;
}

/** Weighted kind choice: Mom is rarer than the everyday power-ups. */
export function pickWeighted(roll) {
  const entries = Object.entries(POWERUPS);
  let left = roll * entries.reduce((sum, [, p]) => sum + p.weight, 0);
  for (const [kind, p] of entries) if ((left -= p.weight) < 0) return kind;
  return entries[0][0];
}

export const toddlerSlow = (pu) => (pu.active.slow > 0 ? 0.4 : 1);
export const carryBonus = (pu) => (pu.active.carry > 0 ? 3 : 0);
export const reachScale = (pu) => (pu.active.magnet > 0 ? 1.8 : 1);

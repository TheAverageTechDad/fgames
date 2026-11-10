import test from "node:test";
import assert from "node:assert/strict";
import { diningRoute, clearDiningSegment } from "../dining-path.js";
import { DINING_SPOTS, kitchenLayout, seededRng, SLOTS } from "../cooking.js";

test("parents can reach the baby and every dining seat across seeded kitchens without crossing furniture", () => {
  for (let seed = 1; seed <= 96; seed++) {
    const [x, z] = DINING_SPOTS[Math.floor(seededRng(seed + 7)() * 4)];
    const s = SLOTS[kitchenLayout(seed).seat];
    const counter = { x: s.x + s.face[0] * 1.75, z: s.z + s.face[1] * 1.75 };
    const mother = { x: x - 2.65, z }, father = { x: x + 2.65, z }, baby = { x: x - 1.15, z: z - 1.9 };
    const hatch = { x, z: z + 2.15 }, chef = { x, z: z + 2.65 };
    const obstacles = [
      { x: 0, z: -9.2, hx: 11.4, hz: 0.8 }, { x: -12.2, z: -2, hx: 0.8, hz: 8 },
      { x: 12.2, z: -2, hx: 0.8, hz: 8 }, { x: 0, z: 0, hx: 2.45, hz: 0.8 },
      { x, z, hx: 2.05, hz: 1.2 }, { x, z: z - 1.75, hx: 0.5, hz: 0.48 },
    ];
    for (const [from, to] of [[{ x: -2.1, z: 9 }, counter], [{ x: 2.1, z: 9 }, father],
      [counter, baby], [baby, mother], [mother, baby], [baby, counter], [counter, mother], [hatch, chef]]) {
      const route = diningRoute(from, to, obstacles);
      assert(route.length, `no route in seed ${seed}`);
      let p = from;
      for (const q of route) { assert(clearDiningSegment(p, q, obstacles), `blocked route in seed ${seed}`); p = q; }
      assert.deepEqual(p, to);
      assert.deepEqual(diningRoute(from, to, obstacles), route, "cosmetic routing is deterministic");
    }
  }
});

test("an unreachable cosmetic destination cannot teleport a visitor through an obstacle", () => {
  assert.deepEqual(diningRoute({ x: 0, z: 5 }, { x: 0, z: 0 }, [{ x: 0, z: 0, hx: 1, hz: 1 }]), []);
});

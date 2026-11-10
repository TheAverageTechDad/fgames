import test from "node:test";
import assert from "node:assert/strict";
import { createRoomLayout } from "../room-layout.js";

const clear = (objects, x, z, pad = 0.6) => objects.every((o) =>
  Math.abs(x - o.x) >= o.hx + pad || Math.abs(z - o.z) >= o.hz + pad);

test("every room variant has safe spawns, separated furniture and reachable return areas", () => {
  const variants = new Set();
  for (let seed = 0; seed < 96; seed++) {
    const layout = createRoomLayout(seed);
    variants.add(JSON.stringify([layout.furniture, layout.stations]));
    const objects = [...layout.furniture, ...layout.stations];
    assert(clear(objects, 0, 4), `player spawn: ${seed}`);
    assert(clear(objects, 2, -2), `toddler spawn: ${seed}`);
    for (const [i, a] of objects.entries()) {
      assert(Math.abs(a.x) + a.hx <= 13 && Math.abs(a.z) + a.hz <= 10, `bounds: ${seed}/${a.id}`);
      for (const b of objects.slice(i + 1)) assert(
        Math.abs(a.x - b.x) >= a.hx + b.hx || Math.abs(a.z - b.z) >= a.hz + b.hz,
        `overlap: ${seed}/${a.id}/${b.id}`);
    }
    // Flood-fill at half-unit spacing with more clearance than the actual player radius.
    const queue = [[0, 4]], visited = new Set(["0,4"]);
    for (let n = 0; n < queue.length; n++) {
      const [x, z] = queue[n];
      for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
        const nx = x + dx, nz = z + dz, key = `${nx},${nz}`;
        if (visited.has(key) || Math.abs(nx) > 12 || Math.abs(nz) > 9 || !clear(objects, nx, nz)) continue;
        visited.add(key); queue.push([nx, nz]);
      }
    }
    for (const station of layout.stations) assert(queue.some(([x, z]) =>
      Math.hypot(x - station.x, z - station.z) < 2.23), `unreachable station: ${seed}/${station.id}`);
    assert.deepEqual(createRoomLayout(seed), layout, `unstable seed: ${seed}`);
    assert.notDeepEqual(createRoomLayout(seed + 1).stations, layout.stations, `static return areas: ${seed}`);
  }
  assert.equal(variants.size, 96);
});

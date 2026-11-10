/** Four roomy arrangements × 24 station permutations. No wall-clock or gameplay RNG. */
export const FURNITURE = [
  { id: "sofa", asset: "rounded-sofa-sample", hx: 3.8, hz: 1.5, material: "cloth" },
  { id: "bed", asset: "rounded-bed", hx: 1.95, hz: 2.8, material: "cloth" },
  { id: "table", asset: "rounded-coffee-table", hx: 2.1, hz: 1.5, material: "wood" },
  { id: "ottoman", asset: "rounded-ottoman", hx: 1.3, hz: 1.3, material: "cloth" },
];
export const STORAGE = [
  { id: "bin", kind: "toy", asset: "rounded-toy-box", hx: 1.45, hz: 1.25, material: "wood" },
  { id: "shelf", kind: "book", asset: "rounded-bookshelf", hx: 1.5, hz: 1.15, material: "wood" },
  { id: "hamper", kind: "cloth", asset: "rounded-hamper", hx: 1.25, hz: 1.25, material: "thatch" },
];
// [x, z, quarter-turns]. The centre and both spawn points stay clear in every arrangement.
const arrangements = [
  [[-3, -8, 0], [6, -5.5, 0], [6, 4.8, 0], [-7.5, 4.5, 0]],
  [[3, -8, 0], [-6, -5.5, 0], [-6, 4.8, 0], [7.5, 4.5, 0]],
  [[-7.2, -2, 1], [3.8, -7.4, 1], [6, 4.8, 0], [-6, 5.5, 0]],
  [[7.2, -2, -1], [-3.8, -7.4, -1], [-6, 4.8, 0], [6, 5.5, 0]],
];
const corners = [[-10.8, -7.2], [10.8, -7.2], [-10.8, 7.2], [10.8, 7.2]];

export function createRoomLayout(seed) {
  const value = seed >>> 0;
  const arrangement = value % arrangements.length;
  // Decode a seeded permutation of the four corners; one corner is intentionally left open.
  let permutation = (Math.floor(value / 4) * 5 + arrangement * 7) % 24;
  const available = corners.slice();
  const slots = [];
  while (available.length) {
    slots.push(available.splice(permutation % available.length, 1)[0]);
    permutation = Math.floor(permutation / (available.length + 1));
  }
  const furniture = FURNITURE.map((item, i) => {
    const [x, z, turn] = arrangements[arrangement][i];
    return { ...item, x, z, turn, hx: Math.abs(turn) % 2 ? item.hz : item.hx,
      hz: Math.abs(turn) % 2 ? item.hx : item.hz };
  });
  const stations = STORAGE.map((item, i) => {
    const [x, z] = slots[i];
    // Keep the book spines and toy-box decoration visible to the raised camera at any corner.
    return { ...item, x, z, turn: 0 };
  });
  return { id: arrangement + 1, seed: value, furniture, stations };
}

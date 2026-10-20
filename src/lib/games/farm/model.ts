export type Crop = 'tomato' | 'cucumber';
export type Point = { x: number; z: number };
export type Inventory = Record<Crop, number>;
export type Cell = Point & { id: string; stage: 'empty' | 'growing' | 'ripe'; age: number };
export type Plot = { id: number; crop: Crop; cells: Cell[] };
// `wait` counts down while the shopper walks in; only the front shopper is served.
export type Customer = { id: number; crop: Crop; want: number; got: number; wait: number };
export type FarmState = {
  version: 1; player: Point; plots: Plot[]; seeds: Inventory; produce: Inventory;
  stock: Inventory; wallet: number; cash: number; sold: number;
  customers: Customer[]; nextCustomer: number; arrivalClock: number; serveClock: number;
  actionClock: number; purchaseProgress: number; lastCell: string | null;
  muted: boolean; haptics: boolean;
};
export type FarmEvent = { type: 'seed' | 'plant' | 'harvest' | 'delivery' | 'sale' | 'served' | 'cash' | 'purchase'; at: Point; crop?: Crop; amount: number };
export const CROPS = ['tomato', 'cucumber'] as const;
export const PRICES: Inventory = { tomato: 2, cucumber: 3 };
export const CROP_CAPACITY = 24;
export const SEED_CAPACITY = 12;
export const GROW_SECONDS = 8;
export const LAND_PRICE = 40;
export const HOLD_SECONDS = 0.8;
export const QUEUE_SIZE = 3;
export const ARRIVE_SECONDS = 1.6;
export const SERVE_SECONDS = 0.25;
export const STEP_SECONDS = 0.4;
// World layout, axis-aligned; the camera views it at 45° so the stone cross reads as two diagonals.
// Screen up is world (-x, -z): the tomato field sits at the top, the market at the bottom.
export const FIELDS: Point[] = [{ x: -2.8, z: -2.8 }, { x: 2.8, z: -2.8 }];
export const BOUNDS = 4.6;
export const SPOTS = {
  seeds: { x: -2.2, z: -0.4 },
  cucumberSeeds: { x: 2.2, z: -0.4 },
  market: { x: 0.9, z: 2.3 },
  counter: { x: 2.3, z: 2.3 },
  cash: { x: 1.45, z: 3.1 },
  expansion: FIELDS[1]
};
// Solid things she walks around: [centre x, centre z, half width, half depth].
// Seed stands sit at each field's outer corner, leaving a straight walk from the SEEDS tile into the soil.
export const STANDS = [{ x: -3.2, z: -1.15 }, { x: 3.2, z: -1.15 }];
type Box = [number, number, number, number];
export const OBSTACLES: Box[] = [[2.4, 2.0, 0.95, 0.42], [STANDS[0].x, STANDS[0].z, 0.5, 0.22], [-2.8, 2.8, 1.25, 1.05]];
const CUCUMBER_STAND: Box = [STANDS[1].x, STANDS[1].z, 0.5, 0.22];
export const total = (items: Inventory) => items.tomato + items.cucumber;
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
export const ripeCells = (s: FarmState) => s.plots.flatMap(p => p.cells.filter(c => c.stage === 'ripe'));
export function makePlot(id: number, crop: Crop): Plot {
  return { id, crop, cells: Array.from({ length: 9 }, (_, i) => ({
    id: `${id}-${i}`, x: FIELDS[id].x + ((i % 3) - 1) * 0.8,
    z: FIELDS[id].z + (Math.floor(i / 3) - 1) * 0.8, stage: 'empty', age: 0
  })) };
}
export function createFarm(): FarmState {
  return { version: 1, player: { x: 0, z: 0.4 }, plots: [makePlot(0, 'tomato')],
    seeds: { tomato: 0, cucumber: 0 }, produce: { tomato: 0, cucumber: 0 },
    stock: { tomato: 0, cucumber: 0 }, wallet: 0, cash: 0, sold: 0,
    customers: [], nextCustomer: 0, arrivalClock: ARRIVE_SECONDS, serveClock: 0,
    actionClock: 0, purchaseProgress: 0, lastCell: null, muted: false, haptics: true };
}
export function purchaseLand(state: FarmState): boolean {
  if (state.plots.length !== 1 || state.wallet < LAND_PRICE) return false;
  state.wallet -= LAND_PRICE;
  state.plots.push(makePlot(1, 'cucumber'));
  state.purchaseProgress = 0;
  return true;
}
export function stepFarm(state: FarmState, delta: number, input: Point): FarmEvent[] {
  const events: FarmEvent[] = [];
  const dt = Number.isFinite(delta) ? Math.min(30, Math.max(0, delta)) : 0;
  const mx = Number.isFinite(input.x) ? input.x : 0, mz = Number.isFinite(input.z) ? input.z : 0;
  const length = Math.max(1, Math.hypot(mx, mz));
  const p = state.player, r = 0.25;
  p.x = Math.max(-BOUNDS, Math.min(BOUNDS, p.x + mx / length * 3.1 * Math.min(dt, 0.1)));
  p.z = Math.max(-BOUNDS, Math.min(BOUNDS, p.z + mz / length * 3.1 * Math.min(dt, 0.1)));
  // Push out of solid props along the shallower side.
  for (const [ox, oz, hw, hd] of state.plots.length > 1 ? [...OBSTACLES, CUCUMBER_STAND] : OBSTACLES) {
    const dx = p.x - ox, dz = p.z - oz, px = hw + r - Math.abs(dx), pz = hd + r - Math.abs(dz);
    if (px > 0 && pz > 0) { if (px < pz) p.x += Math.sign(dx || 1) * px; else p.z += Math.sign(dz || 1) * pz; }
  }
  const emit = (type: FarmEvent['type'], at: Point, amount: number, crop?: Crop) => events.push({ type, at: { ...at }, amount, crop });
  for (const plot of state.plots) for (const cell of plot.cells) {
    if (cell.stage === 'growing') {
      cell.age = Math.min(GROW_SECONDS, cell.age + dt);
      if (cell.age >= GROW_SECONDS) cell.stage = 'ripe';
    }
  }
  // Shoppers walk in, wait at the counter, take stocked produce one at a time and pay per item,
  // so a reload mid-purchase never loses or duplicates goods. They are not saved.
  const unlocked = state.plots.map(p => p.crop);
  state.arrivalClock += dt;
  while (state.customers.length < QUEUE_SIZE && state.arrivalClock >= ARRIVE_SECONDS) {
    state.arrivalClock -= ARRIVE_SECONDS;
    const id = state.nextCustomer++;
    state.customers.push({ id, crop: unlocked[id % unlocked.length], want: 1 + (id * 5 + 1) % 3, got: 0, wait: ARRIVE_SECONDS });
  }
  if (state.customers.length >= QUEUE_SIZE) state.arrivalClock = Math.min(state.arrivalClock, ARRIVE_SECONDS);
  for (const c of state.customers) c.wait = Math.max(0, c.wait - dt);
  state.serveClock += dt;
  for (let guard = 0; guard < 200 && state.serveClock >= SERVE_SECONDS; guard++) {
    const front = state.customers[0];
    if (!front || front.wait > 0) { state.serveClock = Math.min(state.serveClock, SERVE_SECONDS); break; }
    // A shopper still empty-handed happily switches to whatever is on the shelf.
    if (front.got === 0 && state.stock[front.crop] === 0) front.crop = CROPS.find(c => state.stock[c] > 0) ?? front.crop;
    if (state.stock[front.crop] === 0) { state.serveClock = SERVE_SECONDS; break; }
    state.serveClock -= SERVE_SECONDS;
    state.stock[front.crop]--; front.got++; state.sold++;
    state.cash += PRICES[front.crop];
    emit('sale', SPOTS.counter, PRICES[front.crop], front.crop);
    if (front.got >= front.want) {
      state.customers.shift();
      emit('served', SPOTS.counter, front.got * PRICES[front.crop], front.crop);
      state.serveClock -= STEP_SECONDS;
    }
  }
  if (distance(state.player, SPOTS.cash) < 0.8 && state.cash > 0) {
    const value = state.cash;
    state.wallet += value; state.cash = 0;
    emit('cash', SPOTS.cash, value);
  }
  if (state.plots.length === 1 && distance(state.player, SPOTS.expansion) < 0.8 && state.wallet >= LAND_PRICE) {
    state.purchaseProgress += dt / HOLD_SECONDS;
    if (state.purchaseProgress >= 1 && purchaseLand(state)) emit('purchase', SPOTS.expansion, LAND_PRICE);
  } else state.purchaseProgress = 0;

  state.actionClock += dt;
  if (state.actionClock < 0.14) return events;
  state.actionClock = 0;
  for (const [crop, spot] of [['tomato', SPOTS.seeds], ['cucumber', SPOTS.cucumberSeeds]] as const) {
    if (!unlocked.includes(crop) || distance(state.player, spot) >= 0.85) continue;
    // Only as many seeds as there are empty spots for this crop, within the pouch.
    const demand = state.plots.filter(p => p.crop === crop).flatMap(p => p.cells).filter(c => c.stage === 'empty').length;
    const count = Math.min(Math.max(0, demand - state.seeds[crop]), SEED_CAPACITY - total(state.seeds));
    if (count > 0) { state.seeds[crop] += count; emit('seed', spot, count, crop); }
  }
  if (distance(state.player, SPOTS.market) < 0.85 && total(state.produce) > 0) {
    const count = total(state.produce);
    for (const crop of CROPS) { state.stock[crop] += state.produce[crop]; state.produce[crop] = 0; }
    emit('delivery', SPOTS.market, count);
  }
  const nearby = state.plots.flatMap(plot => plot.cells.map(cell => ({ cell, crop: plot.crop })))
    .filter(({ cell }) => distance(state.player, cell) < 0.57).sort((a, b) => distance(state.player, a.cell) - distance(state.player, b.cell));
  if (!nearby.some(({ cell }) => cell.id === state.lastCell)) state.lastCell = null;
  const candidate = nearby.find(({ cell, crop }) => cell.id !== state.lastCell &&
    (cell.stage === 'ripe' && total(state.produce) + 3 <= CROP_CAPACITY || cell.stage === 'empty' && state.seeds[crop] > 0));
  if (candidate) {
    const { cell, crop } = candidate;
    state.lastCell = cell.id;
    if (cell.stage === 'ripe') {
      const count = Math.min(3, CROP_CAPACITY - total(state.produce));
      state.produce[crop] += count;
      cell.stage = 'empty'; cell.age = 0;
      emit('harvest', cell, count, crop);
    } else {
      state.seeds[crop]--; cell.stage = 'growing'; cell.age = 0;
      emit('plant', cell, 1, crop);
    }
  }
  return events;
}

const nearest = (from: Point, points: Point[]) => points.reduce<Point | null>((best, p) => !best || distance(from, p) < distance(from, best) ? p : best, null);
// The next useful thing to do and where it is; drives both the hint text and the guide arrow.
export function farmGoal(s: FarmState): { hint: string; at: Point | null } {
  const full = total(s.produce) + 3 > CROP_CAPACITY;
  const emptyFor = (crop: Crop) => s.plots.filter(p => p.crop === crop).flatMap(p => p.cells.filter(c => c.stage === 'empty'));
  if (s.cash > 0) return { hint: 'Your customers paid! Walk over to collect.', at: SPOTS.cash };
  if (s.wallet >= LAND_PRICE && s.plots.length === 1) return { hint: 'A new field is ready. Stand on the golden tile!', at: SPOTS.expansion };
  if (full) return { hint: 'Basket full! Bring your harvest to the market.', at: SPOTS.market };
  const ripe = ripeCells(s);
  if (ripe.length) return { hint: 'Ready to pick! Walk through the ripe crops.', at: nearest(s.player, ripe) };
  if (total(s.produce) > 0) return { hint: 'Bring your harvest to the market stall.', at: SPOTS.market };
  const plantable = CROPS.flatMap(crop => s.seeds[crop] > 0 ? emptyFor(crop) : []);
  if (plantable.length) return { hint: 'Walk through the soil to plant your seeds.', at: nearest(s.player, plantable) };
  const needSeeds = CROPS.find(crop => emptyFor(crop).length > 0);
  if (needSeeds) return { hint: 'Walk to the seed stand to get started.', at: needSeeds === 'tomato' ? SPOTS.seeds : SPOTS.cucumberSeeds };
  return { hint: 'Growing nicely. Your customers are waiting for more!', at: null };
}

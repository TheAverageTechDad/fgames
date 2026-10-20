export type Crop = 'tomato' | 'cucumber' | 'strawberry';
export type Point = { x: number; z: number };
export type Inventory = Record<Crop, number>;
export type Cell = Point & { id: string; stage: 'empty' | 'growing' | 'ripe'; age: number };
export type Plot = { id: number; crop: Crop; cells: Cell[] };
// `wait` counts down while the shopper walks in; `patience` only while they stand at the front unserved.
export type Customer = { id: number; crop: Crop; want: number; got: number; wait: number; patience: number };
export type Stats = { harvested: Inventory; sold: Inventory; served: number; unhappy: number; earned: number };
export type FarmState = {
  version: 1; player: Point; plots: Plot[]; seeds: Inventory; produce: Inventory;
  stock: Inventory; wallet: number; cash: number; sold: number;
  purchased: number; rating: number; goal: number; stats: Stats;
  customers: Customer[]; nextCustomer: number; arrivalClock: number; serveClock: number;
  actionClock: number; purchaseProgress: number; lastCell: string | null;
  muted: boolean; haptics: boolean;
};
export type FarmEvent = { type: 'seed' | 'plant' | 'harvest' | 'delivery' | 'sale' | 'served' | 'unhappy' | 'cash' | 'purchase' | 'goal'; at: Point; crop?: Crop; amount: number };
export const CROPS = ['tomato', 'cucumber', 'strawberry'] as const;
export const PRICES: Inventory = { tomato: 2, cucumber: 3, strawberry: 5 };
export const GROW: Inventory = { tomato: 8, cucumber: 9, strawberry: 10 };
export const GROW_SECONDS = Math.max(...Object.values(GROW));
export const BASE_CAPACITY = 24;
export const SEED_CAPACITY = 12;
export const HOLD_SECONDS = 0.8;
export const QUEUE_SIZE = 3;
export const ARRIVE_SECONDS = 1.6;
export const SERVE_SECONDS = 0.25;
export const STEP_SECONDS = 0.4;
export const PATIENCE_SECONDS = 22;
export const RUN_SPEED = 3.6;
const empty = (): Inventory => ({ tomato: 0, cucumber: 0, strawberry: 0 });

// World layout, axis-aligned; the camera views it at 45° so the stone cross reads as two diagonals.
// Screen up is world (-x, -z): tomatoes at the top, cucumbers right, strawberries left, the market at the bottom.
// Each field has its seed stand at one corner and a SEEDS tile on the path, a straight walk from the soil.
export const FIELDS: (Point & { crop: Crop; stand: Point; tile: Point })[] = [
  { crop: 'tomato', x: -3.2, z: -3.2, stand: { x: -2.8, z: -1.55 }, tile: { x: -3.8, z: -0.4 } },
  { crop: 'cucumber', x: 3.2, z: -3.2, stand: { x: 3.6, z: -1.55 }, tile: { x: 2.6, z: -0.4 } },
  { crop: 'strawberry', x: -2.9, z: 2.8, stand: { x: -3.3, z: 1.1 }, tile: { x: -2.3, z: 0.4 } }
];
export const BOUNDS = 6.4;
export const SPOTS = {
  market: { x: 1.5, z: 2.9 },
  counter: { x: 3.0, z: 2.6 },
  cash: { x: 2.05, z: 3.7 },
  basket: { x: 1.4, z: 1.4 },
  house: { x: -5.3, z: 5.4 }
};
// Bought one at a time; only the next one shows its price tile.
export const PURCHASES: { kind: 'field' | 'basket'; price: number; at: Point; field?: number }[] = [
  { kind: 'field', price: 40, at: FIELDS[1], field: 1 },
  { kind: 'basket', price: 60, at: SPOTS.basket },
  { kind: 'field', price: 120, at: FIELDS[2], field: 2 },
  { kind: 'basket', price: 200, at: SPOTS.basket }
];
// Solid things she walks around: [centre x, centre z, half width, half depth].
type Box = [number, number, number, number];
export const OBSTACLES: Box[] = [[SPOTS.counter.x, SPOTS.counter.z, 0.95, 0.42], [SPOTS.house.x, SPOTS.house.z, 1.25, 1.05]];
const standBox = (id: number): Box => [FIELDS[id].stand.x, FIELDS[id].stand.z, 0.5, 0.22];

// The goal track: what to work toward. Rewards are paid straight into the wallet.
export type Goal = { text: string; target: number; value: (s: FarmState) => number; reward: number };
const bought = (n: number) => (s: FarmState) => s.purchased >= n ? PURCHASES[n - 1].price : Math.min(s.wallet, PURCHASES[n - 1].price - 1);
const GOALS: Goal[] = [
  { text: 'Harvest 9 tomatoes', target: 9, value: s => s.stats.harvested.tomato, reward: 5 },
  { text: 'Serve 4 happy shoppers', target: 4, value: s => s.stats.served, reward: 10 },
  { text: 'Buy the cucumber field', target: PURCHASES[0].price, value: bought(1), reward: 10 },
  { text: 'Sell 12 cucumbers', target: 12, value: s => s.stats.sold.cucumber, reward: 15 },
  { text: 'Reach 4 stars', target: 4, value: s => s.rating, reward: 20 },
  { text: 'Buy a bigger basket', target: PURCHASES[1].price, value: bought(2), reward: 15 },
  { text: 'Buy the strawberry patch', target: PURCHASES[2].price, value: bought(3), reward: 25 },
  { text: 'Sell 20 strawberries', target: 20, value: s => s.stats.sold.strawberry, reward: 30 },
  { text: 'Serve 60 happy shoppers', target: 60, value: s => s.stats.served, reward: 40 },
  { text: 'Buy the biggest basket', target: PURCHASES[3].price, value: bought(4), reward: 30 },
  { text: 'Reach 5 stars', target: 5, value: s => s.rating >= 4.95 ? 5 : s.rating, reward: 50 }
];
export function currentGoal(s: FarmState): Goal {
  if (s.goal < GOALS.length) return GOALS[s.goal];
  // ponytail: the endless tail is one repeating goal; design more content when players get here.
  const target = 60 + (s.goal - GOALS.length + 1) * 40;
  return { text: `Serve ${target} happy shoppers`, target, value: st => st.stats.served, reward: 25 };
}

export const total = (items: Inventory) => items.tomato + items.cucumber + items.strawberry;
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
export const ripeCells = (s: FarmState) => s.plots.flatMap(p => p.cells.filter(c => c.stage === 'ripe'));
export const capacity = (s: FarmState) => BASE_CAPACITY + 12 * PURCHASES.slice(0, s.purchased).filter(p => p.kind === 'basket').length;
export const nextPurchase = (s: FarmState) => PURCHASES[s.purchased] ?? null;
export const unlocked = (s: FarmState) => s.plots.map(p => p.crop);
export function makePlot(id: number): Plot {
  const f = FIELDS[id];
  return { id, crop: f.crop, cells: Array.from({ length: 9 }, (_, i) => ({
    id: `${id}-${i}`, x: f.x + ((i % 3) - 1) * 0.8, z: f.z + (Math.floor(i / 3) - 1) * 0.8, stage: 'empty', age: 0
  })) };
}
export function createFarm(): FarmState {
  return { version: 1, player: { x: 0, z: 0.4 }, plots: [makePlot(0)],
    seeds: empty(), produce: empty(), stock: empty(), wallet: 0, cash: 0, sold: 0,
    purchased: 0, rating: 3, goal: 0, stats: { harvested: empty(), sold: empty(), served: 0, unhappy: 0, earned: 0 },
    customers: [], nextCustomer: 0, arrivalClock: ARRIVE_SECONDS, serveClock: 0,
    actionClock: 0, purchaseProgress: 0, lastCell: null, muted: false, haptics: true };
}
export function purchaseNext(state: FarmState): boolean {
  const next = nextPurchase(state);
  if (!next || state.wallet < next.price) return false;
  state.wallet -= next.price;
  state.purchased++;
  if (next.field !== undefined) state.plots.push(makePlot(next.field));
  state.purchaseProgress = 0;
  return true;
}
// Shoppers arrive faster for a well-rated shop, and tip at four stars and up.
export const arrivalSeconds = (s: FarmState) => 2.4 - s.rating * 0.3;
export const tip = (s: FarmState) => s.rating >= 4.95 ? 2 : s.rating >= 4 ? 1 : 0;
// A full basket slows her from a run to a walk; seeds weigh nothing.
export const speed = (s: FarmState) => RUN_SPEED * (1 - 0.45 * total(s.produce) / capacity(s));

export function stepFarm(state: FarmState, delta: number, input: Point): FarmEvent[] {
  const events: FarmEvent[] = [];
  const dt = Number.isFinite(delta) ? Math.min(30, Math.max(0, delta)) : 0;
  const mx = Number.isFinite(input.x) ? input.x : 0, mz = Number.isFinite(input.z) ? input.z : 0;
  const length = Math.max(1, Math.hypot(mx, mz));
  const p = state.player, r = 0.25, v = speed(state) * Math.min(dt, 0.1);
  p.x = Math.max(-BOUNDS, Math.min(BOUNDS, p.x + mx / length * v));
  p.z = Math.max(-BOUNDS, Math.min(BOUNDS, p.z + mz / length * v));
  // Push out of solid props along the shallower side.
  for (const [ox, oz, hw, hd] of [...OBSTACLES, ...state.plots.map(plot => standBox(plot.id))]) {
    const dx = p.x - ox, dz = p.z - oz, px = hw + r - Math.abs(dx), pz = hd + r - Math.abs(dz);
    if (px > 0 && pz > 0) { if (px < pz) p.x += Math.sign(dx || 1) * px; else p.z += Math.sign(dz || 1) * pz; }
  }
  const emit = (type: FarmEvent['type'], at: Point, amount: number, crop?: Crop) => events.push({ type, at: { ...at }, amount, crop });
  for (const plot of state.plots) for (const cell of plot.cells) {
    if (cell.stage === 'growing') {
      cell.age = Math.min(GROW[plot.crop], cell.age + dt);
      if (cell.age >= GROW[plot.crop]) cell.stage = 'ripe';
    }
  }
  // Shoppers walk in once the shop has opened, wait at the counter, take stocked produce one at a time and
  // pay per item, so a reload mid-purchase never loses or duplicates goods. They are not saved.
  const crops = unlocked(state), opened = state.sold > 0 || total(state.stock) > 0;
  if (opened) state.arrivalClock += dt;
  const interval = arrivalSeconds(state);
  while (opened && state.customers.length < QUEUE_SIZE && state.arrivalClock >= interval) {
    state.arrivalClock -= interval;
    const id = state.nextCustomer++;
    state.customers.push({ id, crop: crops[id % crops.length], want: 1 + (id * 5 + 1) % 3, got: 0, wait: ARRIVE_SECONDS, patience: PATIENCE_SECONDS });
  }
  if (state.customers.length >= QUEUE_SIZE) state.arrivalClock = Math.min(state.arrivalClock, interval);
  for (const c of state.customers) c.wait = Math.max(0, c.wait - dt);
  // An empty-handed shopper happily switches to whatever is on the shelf; with nothing they want, patience runs down.
  const front = state.customers[0];
  if (front && front.got === 0 && state.stock[front.crop] === 0) front.crop = CROPS.find(c => state.stock[c] > 0) ?? front.crop;
  if (front && front.wait === 0 && state.stock[front.crop] === 0) {
    front.patience -= dt;
    if (front.patience <= 0) {
      state.customers.shift(); state.stats.unhappy++;
      state.rating = Math.max(1, state.rating - 0.6);
      emit('unhappy', SPOTS.counter, 0, front.crop);
    }
  }
  state.serveClock += dt;
  for (let guard = 0; guard < 200 && state.serveClock >= SERVE_SECONDS; guard++) {
    const c = state.customers[0];
    if (!c || c.wait > 0) { state.serveClock = Math.min(state.serveClock, SERVE_SECONDS); break; }
    if (c.got === 0 && state.stock[c.crop] === 0) c.crop = CROPS.find(k => state.stock[k] > 0) ?? c.crop;
    if (state.stock[c.crop] === 0) { state.serveClock = SERVE_SECONDS; break; }
    state.serveClock -= SERVE_SECONDS;
    state.stock[c.crop]--; c.got++; state.sold++; state.stats.sold[c.crop]++;
    state.cash += PRICES[c.crop];
    emit('sale', SPOTS.counter, PRICES[c.crop], c.crop);
    if (c.got >= c.want) {
      state.customers.shift();
      const bonus = tip(state);
      state.cash += bonus; state.stats.served++;
      state.rating = Math.min(5, state.rating + 0.12);
      emit('served', SPOTS.counter, c.got * PRICES[c.crop] + bonus, c.crop);
      state.serveClock -= STEP_SECONDS;
    }
  }
  if (distance(p, SPOTS.cash) < 0.8 && state.cash > 0) {
    const value = state.cash;
    state.wallet += value; state.stats.earned += value; state.cash = 0;
    emit('cash', SPOTS.cash, value);
  }
  const next = nextPurchase(state);
  if (next && distance(p, next.at) < 0.8 && state.wallet >= next.price) {
    state.purchaseProgress += dt / HOLD_SECONDS;
    if (state.purchaseProgress >= 1 && purchaseNext(state)) emit('purchase', next.at, next.price);
  } else state.purchaseProgress = 0;
  const goal = currentGoal(state);
  if (goal.value(state) >= goal.target) {
    state.goal++; state.wallet += goal.reward;
    emit('goal', p, goal.reward);
  }

  state.actionClock += dt;
  if (state.actionClock < 0.14) return events;
  state.actionClock = 0;
  for (const plot of state.plots) {
    const { crop, tile } = FIELDS[plot.id];
    if (distance(p, tile) >= 0.85) continue;
    // Only as many seeds as there are empty spots for this crop, within the pouch.
    const demand = plot.cells.filter(c => c.stage === 'empty').length;
    const count = Math.min(Math.max(0, demand - state.seeds[crop]), SEED_CAPACITY - total(state.seeds));
    if (count > 0) { state.seeds[crop] += count; emit('seed', tile, count, crop); }
  }
  if (distance(p, SPOTS.market) < 0.85 && total(state.produce) > 0) {
    const count = total(state.produce);
    for (const crop of CROPS) { state.stock[crop] += state.produce[crop]; state.produce[crop] = 0; }
    emit('delivery', SPOTS.market, count);
  }
  const room = capacity(state) - total(state.produce);
  const nearby = state.plots.flatMap(plot => plot.cells.map(cell => ({ cell, crop: plot.crop })))
    .filter(({ cell }) => distance(p, cell) < 0.57).sort((a, b) => distance(p, a.cell) - distance(p, b.cell));
  if (!nearby.some(({ cell }) => cell.id === state.lastCell)) state.lastCell = null;
  const candidate = nearby.find(({ cell, crop }) => cell.id !== state.lastCell &&
    (cell.stage === 'ripe' && room >= 3 || cell.stage === 'empty' && state.seeds[crop] > 0));
  if (candidate) {
    const { cell, crop } = candidate;
    state.lastCell = cell.id;
    if (cell.stage === 'ripe') {
      state.produce[crop] += 3; state.stats.harvested[crop] += 3;
      cell.stage = 'empty'; cell.age = 0;
      emit('harvest', cell, 3, crop);
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
  const full = total(s.produce) + 3 > capacity(s), next = nextPurchase(s), front = s.customers[0];
  const emptyFor = (crop: Crop) => s.plots.filter(p => p.crop === crop).flatMap(p => p.cells.filter(c => c.stage === 'empty'));
  if (s.cash >= 20) return { hint: 'Coins are piling up! Walk over to collect.', at: SPOTS.cash };
  if (next && s.wallet >= next.price) return { hint: `You can afford ${next.kind === 'field' ? 'a new field' : 'a bigger basket'}. Stand on the golden tile!`, at: next.at };
  if (full) return { hint: 'Basket full! Bring your harvest to the market.', at: SPOTS.market };
  if (front && !front.wait && s.stock[front.crop] === 0 && total(s.produce) > 0) return { hint: 'A shopper is waiting. Bring your harvest to the market!', at: SPOTS.market };
  const ripe = ripeCells(s);
  if (ripe.length) return { hint: 'Ready to pick! Walk through the ripe crops.', at: nearest(s.player, ripe) };
  if (total(s.produce) > 0) return { hint: 'Bring your harvest to the market stall.', at: SPOTS.market };
  const plantable = CROPS.flatMap(crop => s.seeds[crop] > 0 ? emptyFor(crop) : []);
  if (plantable.length) return { hint: 'Walk through the soil to plant your seeds.', at: nearest(s.player, plantable) };
  const tiles = s.plots.filter(p => emptyFor(p.crop).length > 0).map(p => FIELDS[p.id].tile);
  if (tiles.length) return { hint: 'Walk to a SEEDS tile to get seeds.', at: nearest(s.player, tiles) };
  if (s.cash > 0) return { hint: 'Your customers paid! Walk over to collect.', at: SPOTS.cash };
  return { hint: 'Growing nicely. Your shoppers are waiting for more!', at: null };
}

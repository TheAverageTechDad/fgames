// Seeded crops grow in fields; apples grow on orchard trees that refill by themselves.
export type Crop = 'tomato' | 'cucumber' | 'strawberry' | 'apple';
// Everything that can be carried and sold: the crops, the coop's eggs and the hives' honey.
export type Product = Crop | 'egg' | 'honey';
export type Point = { x: number; z: number };
export type Inventory = Record<Product, number>;
export type Cell = Point & { id: string; stage: 'empty' | 'growing' | 'ripe'; age: number };
export type Plot = { id: number; crop: Crop; cells: Cell[] };
// `wait` counts down while the shopper walks in; `patience` only while they stand at the front unserved.
export type Customer = { id: number; stall: number; crop: Product; want: number; got: number; wait: number; patience: number };
export type Helper = Point & { carry: Inventory };
export type Stats = { harvested: Inventory; sold: Inventory; served: number; unhappy: number; earned: number };
export type UpgradeId = 'sprinkler' | 'stall' | 'boots' | 'pouch';
export type DecorId = 'arch' | 'scarecrow' | 'benches' | 'fountain' | 'windmill';
export type FarmState = {
  version: 1; player: Point; plots: Plot[]; seeds: Inventory; produce: Inventory;
  stock: Inventory; wallet: number; cash: number; standCash: number; sold: number;
  purchased: number; rating: number; goal: number; stats: Stats;
  upgrades: Record<UpgradeId, number>; decor: DecorId[]; helpers: Helper[];
  nests: number[]; layClock: number; hives: number[]; honeyClock: number;
  customers: Customer[]; nextCustomer: number; arrival: number[]; serve: number[];
  actionClock: number; purchaseProgress: number; lastCell: string | null;
  muted: boolean; music: boolean; haptics: boolean;
};
export type FarmEvent = { type: 'seed' | 'plant' | 'harvest' | 'delivery' | 'sale' | 'served' | 'unhappy' | 'cash' | 'purchase' | 'goal' | 'egg' | 'honey' | 'upgrade' | 'helper';
  at: Point; crop?: Product; amount: number; id?: string; stall?: number };
export const CROPS = ['tomato', 'cucumber', 'strawberry'] as const;
export const PRODUCTS = ['tomato', 'cucumber', 'strawberry', 'egg', 'apple', 'honey'] as const;
export const PRICES: Inventory = { tomato: 2, cucumber: 3, strawberry: 5, egg: 4, apple: 6, honey: 10 };
export const GROW: Record<Crop, number> = { tomato: 8, cucumber: 9, strawberry: 10, apple: 14 };
export const GROW_SECONDS = Math.max(...Object.values(GROW));
export const BASE_CAPACITY = 24;
export const BASE_SEEDS = 12;
export const HOLD_SECONDS = 0.8;
export const QUEUE_SIZE = 3;
export const ARRIVE_SECONDS = 1.6;
export const SERVE_SECONDS = 0.25;
export const STEP_SECONDS = 0.4;
export const PATIENCE_SECONDS = 22;
export const RUN_SPEED = 3.6;
export const NEST_SIZE = 4;
export const LAY_SECONDS = 4;
export const HIVE_SIZE = 3;
export const HONEY_SECONDS = 7;
export const HELPER_LOAD = 6;
export const empty = (): Inventory => ({ tomato: 0, cucumber: 0, strawberry: 0, egg: 0, apple: 0, honey: 0 });

// World layout, axis-aligned; the camera views it at 45° so the stone cross reads as two diagonals.
// Screen up is world (-x, -z): tomatoes at the top, cucumbers right, strawberries left, the market at the bottom.
// Each field has its seed stand at one corner and a SEEDS tile on the path, a straight walk from the soil.
// The orchard's trees need no seeds and refill by themselves.
type Field = Point & { crop: Crop; stand?: Point; tile?: Point; trees?: boolean };
export const FIELDS: Field[] = [
  { crop: 'tomato', x: -3.2, z: -3.2, stand: { x: -2.8, z: -1.55 }, tile: { x: -3.8, z: -0.4 } },
  { crop: 'cucumber', x: 3.2, z: -3.2, stand: { x: 3.6, z: -1.55 }, tile: { x: 2.6, z: -0.4 } },
  { crop: 'strawberry', x: -2.9, z: 2.8, stand: { x: -3.3, z: 1.1 }, tile: { x: -2.3, z: 0.4 } },
  { crop: 'apple', x: -4.2, z: 9.6, trees: true }
];
export const BOUNDS = 6.4;
export const SPOTS = {
  market: { x: 1.5, z: 2.9 },
  counter: { x: 3.0, z: 2.6 },
  cash: { x: 2.05, z: 3.7 },
  basket: { x: 1.4, z: 1.4 },
  house: { x: -5.3, z: 5.4 },
  board: { x: -3.4, z: 5.7 },
  coopTile: { x: 5.7, z: 0 },
  coop: { x: 9.4, z: -3.7 },
  orchardTile: { x: 0, z: 5.85 },
  stand: { x: 0, z: 7.2 },
  standCounter: { x: -1.55, z: 7.2 },
  standCash: { x: 0.1, z: 8.4 },
  hiveTile: { x: -1.5, z: 9.9 }
};
// Two places to sell: the market takes the fields' crops and eggs, the orchard stand takes apples and honey.
export const STALLS: { sell: Point; counter: Point; cash: Point; accepts: readonly Product[] }[] = [
  { sell: SPOTS.market, counter: SPOTS.counter, cash: SPOTS.cash, accepts: ['tomato', 'cucumber', 'strawberry', 'egg'] },
  { sell: SPOTS.stand, counter: SPOTS.standCounter, cash: SPOTS.standCash, accepts: ['apple', 'honey'] }
];
// The coop yard lies past the right-hand hedge; the orchard past the bottom-left one, south of the farmhouse.
export const YARD = { minX: BOUNDS, maxX: 10.6, minZ: -4.2, maxZ: 1.2 };
export const ORCHARD = { minX: -BOUNDS, maxX: 0.75, minZ: BOUNDS, maxZ: 11 };
export const NESTS: Point[] = [{ x: 8.6, z: -2.55 }, { x: 9.4, z: -2.55 }, { x: 10.2, z: -2.55 }];
export const HIVES: Point[] = [{ x: -5.6, z: 7.6 }, { x: -4.6, z: 7.6 }, { x: -3.6, z: 7.6 }];
// Bought one at a time; only the next one shows its price tile.
export const PURCHASES: { kind: 'field' | 'basket' | 'coop' | 'orchard' | 'hives'; price: number; at: Point; field?: number }[] = [
  { kind: 'field', price: 40, at: FIELDS[1], field: 1 },
  { kind: 'basket', price: 60, at: SPOTS.basket },
  { kind: 'field', price: 120, at: FIELDS[2], field: 2 },
  { kind: 'basket', price: 200, at: SPOTS.basket },
  { kind: 'coop', price: 350, at: SPOTS.coopTile },
  { kind: 'orchard', price: 600, at: SPOTS.orchardTile, field: 3 },
  { kind: 'hives', price: 900, at: SPOTS.hiveTile }
];
// Bought from the board by the farmhouse door.
export const UPGRADES: Record<UpgradeId, { name: string; detail: string; prices: number[] }> = {
  sprinkler: { name: 'Sprinklers', detail: 'Crops grow 15% faster', prices: [150, 300, 600] },
  stall: { name: 'Fancy stall', detail: '+1 coin for every item sold', prices: [200, 400, 800] },
  boots: { name: 'Comfy boots', detail: 'Run 10% faster', prices: [100, 250, 500] },
  pouch: { name: 'Seed pouch', detail: 'Carry 6 more seeds', prices: [80, 200] }
};
export const HELPER_PRICES = [600, 1200];
// Decorations make the farm lovelier: each brings shoppers a little sooner and adds to tips.
export const DECOR: Record<DecorId, { name: string; price: number; at: Point }> = {
  scarecrow: { name: 'Scarecrow', price: 120, at: { x: -1.25, z: -3.2 } },
  arch: { name: 'Flower arch', price: 150, at: { x: 0, z: -6.1 } },
  benches: { name: 'Garden benches', price: 180, at: { x: 1.4, z: 5.4 } },
  fountain: { name: 'Fountain', price: 250, at: { x: 5.2, z: 5.2 } },
  windmill: { name: 'Windmill', price: 500, at: { x: -8, z: -9.5 } }
};
// Solid things she walks around: [centre x, centre z, half width, half depth].
type Box = [number, number, number, number];
export const OBSTACLES: Box[] = [[SPOTS.counter.x, SPOTS.counter.z, 0.95, 0.42], [SPOTS.house.x, SPOTS.house.z, 1.25, 1.05]];
const standBoxes = (s: FarmState): Box[] => s.plots.flatMap(plot => FIELDS[plot.id].stand ? [[FIELDS[plot.id].stand!.x, FIELDS[plot.id].stand!.z, 0.5, 0.22] as Box] : []);
// Once the yard or orchard opens, the hedge beside its entrance becomes its wall.
const YARD_WALLS: Box[] = [[6.65, -3.8, 0.17, 2.9], [6.65, 1.9, 0.17, 1.0], [SPOTS.coop.x, SPOTS.coop.z, 1.1, 0.55]];
const ORCHARD_WALLS: Box[] = [[-3.78, 6.65, 2.87, 0.17], [SPOTS.standCounter.x, SPOTS.standCounter.z, 0.95, 0.42]];

export const total = (items: Inventory) => PRODUCTS.reduce((sum, p) => sum + (items[p] ?? 0), 0);
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
export const ripeCells = (s: FarmState) => s.plots.flatMap(p => p.cells.filter(c => c.stage === 'ripe'));
const owns = (s: FarmState, kind: (typeof PURCHASES)[number]['kind']) => PURCHASES.slice(0, s.purchased).some(p => p.kind === kind);
export const capacity = (s: FarmState) => BASE_CAPACITY + 12 * PURCHASES.slice(0, s.purchased).filter(p => p.kind === 'basket').length;
export const seedCapacity = (s: FarmState) => BASE_SEEDS + 6 * s.upgrades.pouch;
export const hasCoop = (s: FarmState) => owns(s, 'coop');
export const hasOrchard = (s: FarmState) => owns(s, 'orchard');
export const hasHives = (s: FarmState) => owns(s, 'hives');
export const nextPurchase = (s: FarmState) => PURCHASES[s.purchased] ?? null;
export const unlocked = (s: FarmState): Product[] => [...s.plots.map(p => p.crop), ...(hasCoop(s) ? ['egg' as const] : []), ...(hasHives(s) ? ['honey' as const] : [])];
export const stallFor = (item: Product) => STALLS.findIndex(st => st.accepts.includes(item));
export const growTime = (s: FarmState, crop: Crop) => GROW[crop] * (1 - 0.15 * s.upgrades.sprinkler);
export const priceOf = (s: FarmState, item: Product) => PRICES[item] + s.upgrades.stall;
export const beauty = (s: FarmState) => s.decor.length;
export const boardOpen = (s: FarmState) => s.purchased >= 1;
export const atBoard = (s: FarmState) => boardOpen(s) && distance(s.player, SPOTS.board) < 0.9;
export const upgradePrice = (s: FarmState, id: UpgradeId) => UPGRADES[id].prices[s.upgrades[id]] ?? null;
export const helperPrice = (s: FarmState) => HELPER_PRICES[s.helpers.length] ?? null;
const inRect = (p: Point, r: { minX: number; maxX: number; minZ: number; maxZ: number }) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;
/** Whether a point is on land she owns: the farm square, plus the yard and orchard once bought. */
export function onLand(p: Point, coop: boolean, orchard: boolean) {
  return Number.isFinite(p.x) && Number.isFinite(p.z) && (Math.abs(p.x) <= BOUNDS && Math.abs(p.z) <= BOUNDS || coop && inRect(p, YARD) || orchard && inRect(p, ORCHARD));
}

// The goal track: what to work toward. Rewards are paid straight into the wallet.
export type Goal = { text: string; target: number; value: (s: FarmState) => number; reward: number };
const bought = (n: number) => (s: FarmState) => s.purchased >= n ? PURCHASES[n - 1].price : Math.min(s.wallet, PURCHASES[n - 1].price - 1);
const levels = (s: FarmState) => Object.values(s.upgrades).reduce((a, b) => a + b, 0);
const GOALS: Goal[] = [
  { text: 'Harvest 9 tomatoes', target: 9, value: s => s.stats.harvested.tomato, reward: 5 },
  { text: 'Serve 4 happy shoppers', target: 4, value: s => s.stats.served, reward: 10 },
  { text: 'Buy the cucumber field', target: PURCHASES[0].price, value: bought(1), reward: 10 },
  { text: 'Sell 12 cucumbers', target: 12, value: s => s.stats.sold.cucumber, reward: 15 },
  { text: 'Buy an upgrade at the board', target: 1, value: levels, reward: 15 },
  { text: 'Reach 4 stars', target: 4, value: s => s.rating, reward: 20 },
  { text: 'Buy a bigger basket', target: PURCHASES[1].price, value: bought(2), reward: 15 },
  { text: 'Buy the strawberry patch', target: PURCHASES[2].price, value: bought(3), reward: 25 },
  { text: 'Sell 20 strawberries', target: 20, value: s => s.stats.sold.strawberry, reward: 30 },
  { text: 'Add a decoration', target: 1, value: beauty, reward: 25 },
  { text: 'Buy the biggest basket', target: PURCHASES[3].price, value: bought(4), reward: 30 },
  { text: 'Reach 5 stars', target: 5, value: s => s.rating >= 4.95 ? 5 : s.rating, reward: 50 },
  { text: 'Open the chicken coop', target: PURCHASES[4].price, value: bought(5), reward: 40 },
  { text: 'Sell 15 eggs', target: 15, value: s => s.stats.sold.egg, reward: 40 },
  { text: 'Hire a farmhand', target: 1, value: s => s.helpers.length, reward: 60 },
  { text: 'Open the orchard', target: PURCHASES[5].price, value: bought(6), reward: 60 },
  { text: 'Sell 20 apples', target: 20, value: s => s.stats.sold.apple, reward: 60 },
  { text: 'Reach 6 upgrade levels', target: 6, value: levels, reward: 60 },
  { text: 'Keep bees', target: PURCHASES[6].price, value: bought(7), reward: 80 },
  { text: 'Sell 10 jars of honey', target: 10, value: s => s.stats.sold.honey, reward: 80 },
  { text: 'Add 3 decorations', target: 3, value: beauty, reward: 80 },
  { text: 'Hire a second farmhand', target: 2, value: s => s.helpers.length, reward: 100 },
  { text: 'Max out every upgrade', target: 11, value: levels, reward: 150 },
  { text: 'Finish the farm with every decoration', target: 5, value: beauty, reward: 200 }
];
export function currentGoal(s: FarmState): Goal {
  if (s.goal < GOALS.length) return GOALS[s.goal];
  // ponytail: the endless tail is one repeating goal; design more content when players get here.
  const target = 200 + (s.goal - GOALS.length + 1) * 50;
  return { text: `Serve ${target} happy shoppers`, target, value: st => st.stats.served, reward: 50 };
}

export function makePlot(id: number): Plot {
  const f = FIELDS[id];
  // Fields are 3×3 beds; the orchard is two rows of three trees, already in fruit when it opens.
  const cells = f.trees
    ? Array.from({ length: 6 }, (_, i) => ({ id: `${id}-${i}`, x: f.x + ((i % 3) - 1) * 1.2, z: f.z + (Math.floor(i / 3) - 0.5) * 1.2, stage: 'ripe' as const, age: GROW[f.crop] }))
    : Array.from({ length: 9 }, (_, i) => ({ id: `${id}-${i}`, x: f.x + ((i % 3) - 1) * 0.8, z: f.z + (Math.floor(i / 3) - 1) * 0.8, stage: 'empty' as const, age: 0 }));
  return { id, crop: f.crop, cells };
}
export function createFarm(): FarmState {
  return { version: 1, player: { x: 0, z: 0.4 }, plots: [makePlot(0)],
    seeds: empty(), produce: empty(), stock: empty(), wallet: 0, cash: 0, standCash: 0, sold: 0,
    purchased: 0, rating: 3, goal: 0, stats: { harvested: empty(), sold: empty(), served: 0, unhappy: 0, earned: 0 },
    upgrades: { sprinkler: 0, stall: 0, boots: 0, pouch: 0 }, decor: [], helpers: [],
    nests: NESTS.map(() => 0), layClock: 0, hives: HIVES.map(() => 0), honeyClock: 0,
    customers: [], nextCustomer: 0, arrival: STALLS.map(() => ARRIVE_SECONDS), serve: STALLS.map(() => 0),
    actionClock: 0, purchaseProgress: 0, lastCell: null, muted: false, music: true, haptics: true };
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
// The board's three shelves. Each returns false (and spends nothing) when it can't be bought.
export function buyUpgrade(state: FarmState, id: UpgradeId): boolean {
  const price = upgradePrice(state, id);
  if (price === null || !boardOpen(state) || state.wallet < price) return false;
  state.wallet -= price; state.upgrades[id]++;
  return true;
}
export function buyDecor(state: FarmState, id: DecorId): boolean {
  if (!boardOpen(state) || state.decor.includes(id) || state.wallet < DECOR[id].price) return false;
  state.wallet -= DECOR[id].price; state.decor.push(id);
  return true;
}
export function hireHelper(state: FarmState): boolean {
  const price = helperPrice(state);
  if (price === null || !boardOpen(state) || state.wallet < price) return false;
  state.wallet -= price; state.helpers.push({ x: SPOTS.board.x + 0.6, z: SPOTS.board.z - 0.6, carry: empty() });
  return true;
}
// Shoppers arrive faster for a well-rated, well-decorated shop, and tip at four stars and up.
export const arrivalSeconds = (s: FarmState) => (2.4 - s.rating * 0.3) * (1 - 0.06 * beauty(s));
export const tip = (s: FarmState) => (s.rating >= 4.95 ? 2 : s.rating >= 4 ? 1 : 0) + Math.floor(beauty(s) / 2);
// A full basket slows her from a run to a walk; seeds weigh nothing; boots help.
export const speed = (s: FarmState) => RUN_SPEED * (1 + 0.1 * s.upgrades.boots) * (1 - 0.45 * total(s.produce) / capacity(s));

function pushOut(p: Point, boxes: Box[], r = 0.25) {
  for (const [ox, oz, hw, hd] of boxes) {
    const dx = p.x - ox, dz = p.z - oz, px = hw + r - Math.abs(dx), pz = hd + r - Math.abs(dz);
    if (px > 0 && pz > 0) { if (px < pz) p.x += Math.sign(dx || 1) * px; else p.z += Math.sign(dz || 1) * pz; }
  }
}
const solids = (s: FarmState, stands = true): Box[] => [...OBSTACLES, ...(stands ? standBoxes(s) : []), ...(hasCoop(s) ? YARD_WALLS : []), ...(hasOrchard(s) ? ORCHARD_WALLS : []),
  ...(hasHives(s) ? HIVES.map(h => [h.x, h.z, 0.28, 0.28] as Box) : []),
  ...(s.decor.includes('fountain') ? [[DECOR.fountain.at.x, DECOR.fountain.at.z, 0.6, 0.6] as Box] : [])];
const nearest = <T extends Point>(from: Point, points: T[]) => points.reduce<T | null>((best, p) => !best || distance(from, p) < distance(from, best) ? p : best, null);
// Stock the stall with whatever it sells from `from`; returns how many items moved.
function stockStall(state: FarmState, stall: number, from: Inventory) {
  let moved = 0;
  for (const item of STALLS[stall].accepts) { state.stock[item] += from[item]; moved += from[item]; from[item] = 0; }
  return moved;
}

export function stepFarm(state: FarmState, delta: number, input: Point): FarmEvent[] {
  const events: FarmEvent[] = [];
  const dt = Number.isFinite(delta) ? Math.min(30, Math.max(0, delta)) : 0;
  const mx = Number.isFinite(input.x) ? input.x : 0, mz = Number.isFinite(input.z) ? input.z : 0;
  const length = Math.max(1, Math.hypot(mx, mz));
  const p = state.player, v = speed(state) * Math.min(dt, 0.1), coop = hasCoop(state), orchard = hasOrchard(state), hives = hasHives(state);
  // Move one axis at a time and keep each step that stays on her land, so she slides along its edges.
  const x = p.x + mx / length * v, z = p.z + mz / length * v;
  if (onLand({ x, z: p.z }, coop, orchard)) p.x = x;
  if (onLand({ x: p.x, z }, coop, orchard)) p.z = z;
  pushOut(p, solids(state));
  const emit = (type: FarmEvent['type'], at: Point, amount: number, crop?: Product, stall?: number) => events.push({ type, at: { ...at }, amount, crop, stall });
  for (const plot of state.plots) {
    const grow = growTime(state, plot.crop);
    for (const cell of plot.cells) {
      if (cell.stage !== 'growing') continue;
      cell.age = Math.min(GROW[plot.crop], cell.age + dt * GROW[plot.crop] / grow);
      if (cell.age >= GROW[plot.crop]) cell.stage = 'ripe';
    }
  }
  // Hens lay into the emptiest nest and bees fill the emptiest hive; full ones simply wait for her.
  const fill = (stores: number[], size: number, clock: 'layClock' | 'honeyClock', every: number) => {
    state[clock] += dt;
    for (let guard = 0; guard < 50 && state[clock] >= every; guard++) {
      state[clock] -= every;
      const i = stores.indexOf(Math.min(...stores));
      if (stores[i] < size) stores[i]++;
    }
  };
  if (coop) fill(state.nests, NEST_SIZE, 'layClock', LAY_SECONDS);
  if (hives) fill(state.hives, HIVE_SIZE, 'honeyClock', HONEY_SECONDS);
  // Each stall has its own little queue. Shoppers come once it has opened, wait at the counter, take stocked
  // goods one at a time and pay per item onto that stall's pile, so a reload mid-purchase never loses or
  // duplicates goods. They are not saved.
  const items = unlocked(state), interval = arrivalSeconds(state);
  STALLS.forEach((stall, s) => {
    const sells = items.filter(i => stall.accepts.includes(i));
    const opened = sells.length > 0 && stall.accepts.some(i => state.stock[i] > 0 || state.stats.sold[i] > 0) && (s === 0 || orchard);
    let queue = state.customers.filter(c => c.stall === s);
    if (opened) state.arrival[s] += dt;
    while (opened && queue.length < QUEUE_SIZE && state.arrival[s] >= interval) {
      state.arrival[s] -= interval;
      const id = state.nextCustomer++;
      state.customers.push({ id, stall: s, crop: sells[id % sells.length], want: 1 + (id * 5 + 1) % 3, got: 0, wait: ARRIVE_SECONDS, patience: PATIENCE_SECONDS });
      queue = state.customers.filter(c => c.stall === s);
    }
    if (queue.length >= QUEUE_SIZE) state.arrival[s] = Math.min(state.arrival[s], interval);
    for (const c of queue) c.wait = Math.max(0, c.wait - dt);
    const leave = (c: Customer) => state.customers.splice(state.customers.indexOf(c), 1);
    const onShelf = () => stall.accepts.find(k => state.stock[k] > 0);
    // An empty-handed shopper happily switches to whatever is on the shelf; with nothing they want, patience runs down.
    const front = queue[0];
    if (front && front.got === 0 && state.stock[front.crop] === 0) front.crop = onShelf() ?? front.crop;
    if (front && front.wait === 0 && state.stock[front.crop] === 0) {
      front.patience -= dt;
      if (front.patience <= 0) {
        leave(front); queue.shift(); state.stats.unhappy++;
        state.rating = Math.max(1, state.rating - 0.6);
        emit('unhappy', stall.counter, 0, front.crop, s);
      }
    }
    const pile = s === 0 ? 'cash' : 'standCash';
    state.serve[s] += dt;
    for (let guard = 0; guard < 200 && state.serve[s] >= SERVE_SECONDS; guard++) {
      const c = queue[0];
      if (!c || c.wait > 0) { state.serve[s] = Math.min(state.serve[s], SERVE_SECONDS); break; }
      if (c.got === 0 && state.stock[c.crop] === 0) c.crop = onShelf() ?? c.crop;
      if (state.stock[c.crop] === 0) { state.serve[s] = SERVE_SECONDS; break; }
      state.serve[s] -= SERVE_SECONDS;
      const price = priceOf(state, c.crop);
      state.stock[c.crop]--; c.got++; state.sold++; state.stats.sold[c.crop]++;
      state[pile] += price;
      emit('sale', stall.counter, price, c.crop, s);
      if (c.got >= c.want) {
        leave(c); queue.shift();
        const bonus = tip(state);
        state[pile] += bonus; state.stats.served++;
        state.rating = Math.min(5, state.rating + 0.12);
        emit('served', stall.counter, c.got * price + bonus, c.crop, s);
        state.serve[s] -= STEP_SECONDS;
      }
    }
    if (distance(p, stall.cash) < 0.8 && state[pile] > 0) {
      const value = state[pile];
      state.wallet += value; state.stats.earned += value; state[pile] = 0;
      emit('cash', stall.cash, value, undefined, s);
    }
  });
  stepHelpers(state, dt, emit);
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
    if (!tile || distance(p, tile) >= 0.85) continue;
    // Only as many seeds as there are empty spots for this crop, within the pouch.
    const demand = plot.cells.filter(c => c.stage === 'empty').length;
    const count = Math.min(Math.max(0, demand - state.seeds[crop]), seedCapacity(state) - total(state.seeds));
    if (count > 0) { state.seeds[crop] += count; emit('seed', tile, count, crop); }
  }
  // Each stall takes only what it sells; the rest stays in her arms for the other one.
  STALLS.forEach((stall, s) => {
    if (distance(p, stall.sell) >= 0.85) return;
    const count = stockStall(state, s, state.produce);
    if (count > 0) emit('delivery', stall.sell, count, undefined, s);
  });
  const collect = (stores: number[], spots: Point[], item: 'egg' | 'honey') => spots.forEach((spot, i) => {
    const take = Math.min(stores[i], capacity(state) - total(state.produce));
    if (distance(p, spot) < 0.7 && take > 0) {
      stores[i] -= take; state.produce[item] += take; state.stats.harvested[item] += take;
      emit(item, spot, take, item);
    }
  });
  if (coop) collect(state.nests, NESTS, 'egg');
  if (hives) collect(state.hives, HIVES, 'honey');
  const space = capacity(state) - total(state.produce);
  const nearby = state.plots.flatMap(plot => plot.cells.map(cell => ({ cell, crop: plot.crop, trees: !!FIELDS[plot.id].trees })))
    .filter(({ cell, trees }) => distance(p, cell) < (trees ? 0.75 : 0.57)).sort((a, b) => distance(p, a.cell) - distance(p, b.cell));
  if (!nearby.some(({ cell }) => cell.id === state.lastCell)) state.lastCell = null;
  const candidate = nearby.find(({ cell, crop }) => cell.id !== state.lastCell &&
    (cell.stage === 'ripe' && space >= 3 || cell.stage === 'empty' && state.seeds[crop] > 0));
  if (candidate) {
    const { cell, crop, trees } = candidate;
    state.lastCell = cell.id;
    if (cell.stage === 'ripe') {
      state.produce[crop] += 3; state.stats.harvested[crop] += 3;
      // Trees start growing their next fruit straight away; field beds wait for seed.
      cell.stage = trees ? 'growing' : 'empty'; cell.age = 0;
      emit('harvest', cell, 3, crop);
    } else {
      state.seeds[crop]--; cell.stage = 'growing'; cell.age = 0;
      emit('plant', cell, 1, crop);
    }
  }
  return events;
}

// Farmhands pick the nearest ripe plant or tree, a nest with eggs or a hive with honey that nobody else is
// after, replant straight away with their own seed, and take each load to the stall that sells it. They go
// through the yard and orchard entrances and walk around the same props she does.
const HELPER_SPEED = 2.2;
const GATES = { yard: { x: 6.75, z: 0 }, orchard: { x: 0, z: 6.75 } } as const;
const region = (p: Point) => p.x > 6.6 ? 'yard' : p.z > 6.6 ? 'orchard' : 'main';
type Job = Point & ({ kind: 'cell'; cell: Cell; crop: Crop; trees: boolean } | { kind: 'store'; item: 'egg' | 'honey'; index: number } | { kind: 'stall'; stall: number } | { kind: 'rest' });
function stepHelpers(state: FarmState, dt: number, emit: (type: FarmEvent['type'], at: Point, amount: number, crop?: Product, stall?: number) => void) {
  const claimed = new Set<string>(), walls = solids(state, false);
  state.helpers.forEach((h, index) => {
    const load = total(h.carry);
    const jobs: Job[] = [
      ...state.plots.flatMap(plot => plot.cells.filter(c => c.stage === 'ripe' && !claimed.has(c.id)).map(cell => ({ x: cell.x, z: cell.z, kind: 'cell' as const, cell, crop: plot.crop, trees: !!FIELDS[plot.id].trees }))),
      ...(hasCoop(state) ? NESTS.flatMap((n, i) => state.nests[i] >= 2 && !claimed.has(`egg${i}`) ? [{ ...n, kind: 'store' as const, item: 'egg' as const, index: i }] : []) : []),
      ...(hasHives(state) ? HIVES.flatMap((n, i) => state.hives[i] >= 1 && !claimed.has(`honey${i}`) ? [{ ...n, kind: 'store' as const, item: 'honey' as const, index: i }] : []) : [])
    ];
    const deliverTo = STALLS.findIndex(st => st.accepts.some(i => h.carry[i] > 0));
    const target: Job = load >= HELPER_LOAD || (load > 0 && !jobs.length) ? { ...STALLS[deliverTo].sell, kind: 'stall', stall: deliverTo }
      : nearest(h, jobs) ?? { x: SPOTS.board.x + 0.8 + index * 0.6, z: SPOTS.board.z - 0.8, kind: 'rest' };
    if (target.kind === 'cell') claimed.add(target.cell.id);
    if (target.kind === 'store') claimed.add(`${target.item}${target.index}`);
    // Between areas by their entrance; one axis at a time, so they slide along a wall instead of sticking.
    const from = region(h), to = region(target), gate = from !== 'main' ? GATES[from] : to !== 'main' ? GATES[to] : null;
    const via = from !== to && gate && distance(h, gate) > 0.3 ? gate : target;
    const d = distance(h, via), step = Math.min(d, HELPER_SPEED * dt);
    if (d > 0.001) { h.x += (via.x - h.x) / d * step; pushOut(h, walls, 0.2); h.z += (via.z - h.z) / d * step; pushOut(h, walls, 0.2); }
    if (via !== target || distance(h, target) > 0.15) return;
    if (target.kind === 'cell' && target.cell.stage === 'ripe') {
      h.carry[target.crop] += 3; state.stats.harvested[target.crop] += 3;
      target.cell.stage = 'growing'; target.cell.age = 0;
      emit('helper', target.cell, 3, target.crop);
    } else if (target.kind === 'store') {
      const stores = target.item === 'egg' ? state.nests : state.hives, take = Math.min(stores[target.index], HELPER_LOAD + 3 - load);
      stores[target.index] -= take; h.carry[target.item] += take; state.stats.harvested[target.item] += take;
      emit('helper', target, take, target.item);
    } else if (target.kind === 'stall' && load > 0) {
      emit('helper', target, stockStall(state, target.stall, h.carry), undefined, target.stall);
    }
  });
}

// The next useful thing to do and where it is; drives both the hint text and the guide arrow.
export function farmGoal(s: FarmState): { hint: string; at: Point | null } {
  const full = total(s.produce) + 3 > capacity(s), next = nextPurchase(s);
  const emptyFor = (crop: Crop) => s.plots.filter(p => p.crop === crop).flatMap(p => p.cells.filter(c => c.stage === 'empty'));
  const carried = STALLS.map((st, i) => ({ ...st.sell, i, has: st.accepts.some(k => s.produce[k] > 0) })).filter(st => st.has);
  const deliver = nearest(s.player, carried);
  const pile = [{ ...SPOTS.cash, coins: s.cash }, { ...SPOTS.standCash, coins: s.standCash }].sort((a, b) => b.coins - a.coins)[0];
  if (pile.coins >= 40) return { hint: 'Coins are piling up! Walk over to collect.', at: pile };
  if (next && s.wallet >= next.price) {
    const what = { field: 'a new field', basket: 'a bigger basket', coop: 'the chicken coop', orchard: 'the orchard', hives: 'beehives' }[next.kind];
    return { hint: `You can afford ${what}. Stand on the golden tile!`, at: next.at };
  }
  if (full && deliver) return { hint: 'Basket full! Bring your harvest to the stall.', at: deliver };
  const waiting = STALLS.findIndex((st, i) => { const f = s.customers.find(c => c.stall === i); return f && !f.wait && s.stock[f.crop] === 0 && st.accepts.some(k => s.produce[k] > 0); });
  if (waiting >= 0) return { hint: 'A shopper is waiting. Bring them what they need!', at: STALLS[waiting].sell };
  const ripe = ripeCells(s);
  if (ripe.length) return { hint: 'Ready to pick! Walk through the ripe crops.', at: nearest(s.player, ripe) };
  const nest = hasCoop(s) ? nearest(s.player, NESTS.filter((_, i) => s.nests[i] >= 2)) : null;
  if (nest) return { hint: 'The hens have laid! Collect the eggs.', at: nest };
  const hive = hasHives(s) ? nearest(s.player, HIVES.filter((_, i) => s.hives[i] >= 2)) : null;
  if (hive) return { hint: 'The bees made honey! Collect the jars.', at: hive };
  if (deliver) return { hint: deliver.i ? 'Take your apples and honey to the orchard stand.' : 'Bring your harvest to the market stall.', at: deliver };
  const plantable = CROPS.flatMap(crop => s.seeds[crop] > 0 ? emptyFor(crop) : []);
  if (plantable.length) return { hint: 'Walk through the soil to plant your seeds.', at: nearest(s.player, plantable) };
  const tiles = s.plots.filter(p => FIELDS[p.id].tile && emptyFor(p.crop).length > 0).map(p => FIELDS[p.id].tile!);
  if (tiles.length) return { hint: 'Walk to a SEEDS tile to get seeds.', at: nearest(s.player, tiles) };
  if (pile.coins > 0) return { hint: 'Your customers paid! Walk over to collect.', at: pile };
  if (boardOpen(s) && s.wallet >= 80) return { hint: 'Spend your coins at the board by the farmhouse.', at: SPOTS.board };
  return { hint: 'Growing nicely. Your shoppers are waiting for more!', at: null };
}

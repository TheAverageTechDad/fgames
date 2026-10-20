export type Crop = 'tomato' | 'cucumber';
export type Point = { x: number; z: number };
export type Inventory = Record<Crop, number>;
export type Cell = Point & { id: string; stage: 'empty' | 'growing' | 'ripe'; age: number };
export type Plot = { id: number; crop: Crop; cells: Cell[] };
export type FarmState = {
  version: 1; player: Point; plots: Plot[]; seeds: Inventory; produce: Inventory;
  stock: Inventory; wallet: number; cash: number; sold: number; saleClock: number;
  actionClock: number; purchaseProgress: number; lastCell: string | null;
  muted: boolean; haptics: boolean;
};
export type FarmEvent = { type: 'seed' | 'plant' | 'harvest' | 'delivery' | 'sale' | 'cash' | 'purchase'; at: Point; crop?: Crop; amount: number };
export const CROP_CAPACITY = 24;
export const SEED_CAPACITY = 12;
export const GROW_SECONDS = 8;
export const LAND_PRICE = 40;
export const SALE_SECONDS = 0.45;
export const SPOTS = {
  seeds: { x: -2.9, z: 1.25 },
  cucumberSeeds: { x: 2.8, z: -4.1 },
  market: { x: 2.45, z: 1.5 },
  cash: { x: 2.9, z: 3.2 },
  expansion: { x: 1.85, z: -1.9 }
};
export const total = (items: Inventory) => items.tomato + items.cucumber;
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
export function makePlot(id: number, crop: Crop): Plot {
  return { id, crop, cells: Array.from({ length: 9 }, (_, i) => ({
    id: `${id}-${i}`, x: (id === 0 ? -1.85 : 1.85) + ((i % 3) - 1) * 0.75,
    z: -1.85 + (Math.floor(i / 3) - 1) * 0.8, stage: 'empty', age: 0
  })) };
}
export function createFarm(): FarmState {
  return { version: 1, player: { x: 0, z: 2.6 }, plots: [makePlot(0, 'tomato')],
    seeds: { tomato: 0, cucumber: 0 }, produce: { tomato: 0, cucumber: 0 },
    stock: { tomato: 0, cucumber: 0 }, wallet: 0, cash: 0, sold: 0,
    saleClock: 0, actionClock: 0, purchaseProgress: 0, lastCell: null, muted: false, haptics: true };
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
  state.player.x = Math.max(-3.8, Math.min(3.8, state.player.x + mx / length * 3.1 * Math.min(dt, 0.1)));
  state.player.z = Math.max(-4.8, Math.min(4.7, state.player.z + mz / length * 3.1 * Math.min(dt, 0.1)));
  const emit = (type: FarmEvent['type'], at: Point, amount: number, crop?: Crop) => events.push({ type, at: { ...at }, amount, crop });
  for (const plot of state.plots) for (const cell of plot.cells) {
    if (cell.stage === 'growing') {
      cell.age = Math.min(GROW_SECONDS, cell.age + dt);
      if (cell.age >= GROW_SECONDS) cell.stage = 'ripe';
    }
  }
  // Sales are customer exchanges, independent of the player's presence at the counter.
  state.saleClock += dt;
  const sales = Math.min(70, Math.floor(state.saleClock / SALE_SECONDS));
  state.saleClock %= SALE_SECONDS;
  for (let i = 0; i < sales; i++) {
    const crop: Crop | null = state.stock.tomato > 0 ? 'tomato' : state.stock.cucumber > 0 ? 'cucumber' : null;
    if (!crop) break;
    state.stock[crop]--; state.sold++;
    const value = crop === 'tomato' ? 2 : 3;
    state.cash += value;
    emit('sale', SPOTS.market, value, crop);
  }
  if (distance(state.player, SPOTS.cash) < 0.8 && state.cash > 0) {
    const value = state.cash;
    state.wallet += value; state.cash = 0;
    emit('cash', SPOTS.cash, value);
  }
  if (state.plots.length === 1 && distance(state.player, SPOTS.expansion) < 0.8 && state.wallet >= LAND_PRICE) {
    state.purchaseProgress += dt / 0.7;
    if (state.purchaseProgress >= 1 && purchaseLand(state)) emit('purchase', SPOTS.expansion, LAND_PRICE);
  } else state.purchaseProgress = 0;

  state.actionClock += dt;
  if (state.actionClock < 0.14) return events;
  state.actionClock = 0;
  for (const [crop, spot] of [['tomato', SPOTS.seeds], ['cucumber', SPOTS.cucumberSeeds]] as const) {
    if (crop === 'cucumber' && state.plots.length < 2) continue;
    if (distance(state.player, spot) < 0.85) {
      const demand = state.plots.filter(p => p.crop === crop).flatMap(p => p.cells).filter(c => c.stage === 'empty').length;
      const count = Math.min(Math.max(0, demand * 2 - state.seeds[crop]), SEED_CAPACITY - total(state.seeds));
      if (count > 0) { state.seeds[crop] += count; emit('seed', spot, count, crop); }
    }
  }
  if (distance(state.player, SPOTS.market) < 0.85 && total(state.produce) > 0) {
    const count = total(state.produce);
    for (const crop of ['tomato', 'cucumber'] as const) { state.stock[crop] += state.produce[crop]; state.produce[crop] = 0; }
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

export function farmHint(s: FarmState): string {
  if (s.cash > 0) return 'Your customers paid! Walk over to collect.';
  if (s.wallet >= LAND_PRICE && s.plots.length === 1) return 'A new field is ready. Walk to the golden sign!';
  if (total(s.produce) + 3 > CROP_CAPACITY) return 'Basket full! Bring your harvest to the shop.';
  if (s.plots.some(p => p.cells.some(c => c.stage === 'ripe'))) return 'Ready to pick! Walk through the ripe crops.';
  if (total(s.produce) > 0) return 'Bring your harvest to the striped market stall.';
  if (total(s.seeds) > 0) return 'Walk through the soil to plant your seeds.';
  if (s.plots.some(p => p.cells.some(c => c.stage === 'growing'))) return 'Growing nicely. Get seeds for your next row.';
  return 'Walk to the seed bags to get started.';
}

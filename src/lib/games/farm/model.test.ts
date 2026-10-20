import { describe, expect, it } from 'vitest';
import { createFarm, stepFarm, purchaseNext, farmGoal, currentGoal, capacity, speed, BASE_CAPACITY, FIELDS, GROW, PATIENCE_SECONDS, PRICES, PURCHASES, RUN_SPEED, SPOTS } from './model';

const stay = { x: 0, z: 0 };
const away = { x: 0, z: -6 };
function visit(s: ReturnType<typeof createFarm>, point: { x: number; z: number }) {
  s.player = { ...point };
  return stepFarm(s, 0.5, stay);
}

describe('Pocket Farm loop', () => {
  it('supplies free seeds for the empty spots only and plants the assigned crop', () => {
    const s = createFarm();
    visit(s, FIELDS[0].tile);
    expect(s.seeds.tomato).toBe(9);
    const cell = s.plots[0].cells[0];
    visit(s, cell);
    expect(cell.stage).toBe('growing');
    expect(s.seeds.tomato).toBe(8);
    visit(s, FIELDS[0].tile);
    expect(s.seeds.tomato).toBe(8);
  });
  it('grows crops while active, collects them, and leaves ripe crops when full', () => {
    const s = createFarm();
    const cell = s.plots[0].cells[0];
    cell.stage = 'growing';
    s.player = { ...away };
    stepFarm(s, GROW.tomato, stay);
    expect(cell.stage).toBe('ripe');
    s.produce.tomato = BASE_CAPACITY - 2;
    visit(s, cell);
    expect(cell.stage).toBe('ripe');
    s.produce.tomato = 0;
    visit(s, cell);
    expect(s.produce.tomato).toBe(3);
    expect(s.stats.harvested.tomato).toBe(3);
    expect(cell.stage).toBe('empty');
  });
  it('slows her down as the basket fills', () => {
    const s = createFarm();
    expect(speed(s)).toBe(RUN_SPEED);
    s.produce.tomato = capacity(s);
    expect(speed(s)).toBeCloseTo(RUN_SPEED * 0.55);
  });
  it('opens the shop on first delivery; shoppers take stock one item at a time, pay per item, then leave', () => {
    const s = createFarm();
    s.player = { ...away };
    stepFarm(s, 10, stay);
    expect(s.customers).toHaveLength(0);
    s.produce.tomato = 1;
    visit(s, SPOTS.market);
    s.player = { ...away };
    stepFarm(s, 10, stay);
    expect(s.cash).toBe(PRICES.tomato);
    expect(s.customers.length).toBeGreaterThan(0);
    s.stock.tomato = 20;
    const events = stepFarm(s, 3, stay);
    expect(events.some(e => e.type === 'served')).toBe(true);
    expect(s.stats.served).toBeGreaterThan(0);
  });
  it('sends an unserved shopper away unhappy and lowers the rating; serving raises it', () => {
    const s = createFarm();
    s.sold = 1; s.player = { ...away };
    s.customers = [{ id: 1, crop: 'tomato', want: 1, got: 0, wait: 0, patience: PATIENCE_SECONDS }];
    const events = stepFarm(s, PATIENCE_SECONDS + 0.1, stay);
    expect(events.some(e => e.type === 'unhappy')).toBe(true);
    expect(s.rating).toBeCloseTo(2.4);
    s.customers = [{ id: 2, crop: 'tomato', want: 1, got: 0, wait: 0, patience: PATIENCE_SECONDS }];
    s.stock.tomato = 1;
    stepFarm(s, 0.3, stay);
    expect(s.rating).toBeCloseTo(2.52);
  });
  it('lets an empty-handed shopper switch to produce that is in stock', () => {
    const s = createFarm();
    s.customers = [{ id: 1, crop: 'cucumber', want: 2, got: 0, wait: 0, patience: PATIENCE_SECONDS }];
    s.stock.tomato = 2; s.player = { ...away };
    stepFarm(s, 0.6, stay);
    expect(s.stock.tomato).toBe(0);
    expect(s.cash).toBeGreaterThanOrEqual(2 * PRICES.tomato);
  });
  it('buys each purchase once, in order: field, basket, field, basket', () => {
    const s = createFarm();
    expect(purchaseNext(s)).toBe(false);
    s.wallet = 1000;
    for (const p of PURCHASES) expect(purchaseNext(s)).toBe(true);
    expect(purchaseNext(s)).toBe(false);
    expect(s.wallet).toBe(1000 - PURCHASES.reduce((a, p) => a + p.price, 0));
    expect(s.plots.map(p => p.crop)).toEqual(['tomato', 'cucumber', 'strawberry']);
    expect(capacity(s)).toBe(BASE_CAPACITY + 24);
  });
  it('does not charge for merely crossing a purchase tile', () => {
    const s = createFarm();
    s.wallet = 40;
    s.player = { ...PURCHASES[0].at };
    stepFarm(s, 0.1, stay);
    expect(s.wallet).toBe(40);
    s.player = { ...away };
    stepFarm(s, 1, stay);
    expect(s.purchaseProgress).toBe(0);
    s.player = { ...PURCHASES[0].at };
    stepFarm(s, 1, stay);
    expect(s.plots).toHaveLength(2);
  });
  it('completes goals in order and pays their reward', () => {
    const s = createFarm();
    expect(currentGoal(s).text).toMatch(/Harvest/);
    s.stats.harvested.tomato = 9; s.player = { ...away };
    const events = stepFarm(s, 0.05, stay);
    expect(events.some(e => e.type === 'goal')).toBe(true);
    expect(s.goal).toBe(1);
    expect(s.wallet).toBe(5);
  });
  it('points the guide at the next useful place', () => {
    const s = createFarm();
    expect(farmGoal(s).at).toEqual(FIELDS[0].tile);
    s.seeds.tomato = 2;
    expect(s.plots[0].cells).toContainEqual(expect.objectContaining(farmGoal(s).at));
    s.cash = 25;
    expect(farmGoal(s).at).toEqual(SPOTS.cash);
  });
  it('walks around solid props, and a seed stand only once its field exists', () => {
    const s = createFarm();
    s.player = { x: SPOTS.counter.x, z: SPOTS.counter.z + 0.9 };
    for (let i = 0; i < 20; i++) stepFarm(s, 0.05, { x: 0, z: -1 });
    expect(s.player.z).toBeGreaterThan(SPOTS.counter.z);
    const stand = FIELDS[1].stand;
    s.player = { x: stand.x, z: stand.z + 0.9 };
    for (let i = 0; i < 20; i++) stepFarm(s, 0.05, { x: 0, z: -1 });
    expect(s.player.z).toBeLessThan(stand.z);
    s.wallet = 40; purchaseNext(s); s.player = { x: stand.x, z: stand.z + 0.9 };
    for (let i = 0; i < 20; i++) stepFarm(s, 0.05, { x: 0, z: -1 });
    expect(s.player.z).toBeGreaterThan(stand.z);
  });
  it('bounds movement and ignores non-finite input and time', () => {
    const s = createFarm();
    stepFarm(s, 1000, { x: 1, z: 1 });
    expect(Number.isFinite(s.player.x)).toBe(true);
    stepFarm(s, NaN, { x: Infinity, z: NaN });
    expect(Number.isFinite(s.player.x + s.player.z)).toBe(true);
  });
});

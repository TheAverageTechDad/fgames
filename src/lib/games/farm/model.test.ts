import { describe, expect, it } from 'vitest';
import { createFarm, stepFarm, purchaseNext, hasHives, HIVES, ORCHARD, buyUpgrade, buyDecor, hireHelper, farmGoal, currentGoal, capacity, speed, priceOf, growTime, hasCoop,
  BASE_CAPACITY, FIELDS, GROW, LAY_SECONDS, NESTS, PATIENCE_SECONDS, PRICES, PURCHASES, RUN_SPEED, SPOTS, YARD } from './model';

const stay = { x: 0, z: 0 };
const away = { x: 0, z: -6 };
function visit(s: ReturnType<typeof createFarm>, point: { x: number; z: number }) {
  s.player = { ...point };
  return stepFarm(s, 0.5, stay);
}

describe('Pocket Farm loop', () => {
  it('supplies free seeds for the empty spots only and plants the assigned crop', () => {
    const s = createFarm();
    visit(s, FIELDS[0].tile!);
    expect(s.seeds.tomato).toBe(9);
    const cell = s.plots[0].cells[0];
    visit(s, cell);
    expect(cell.stage).toBe('growing');
    expect(s.seeds.tomato).toBe(8);
    visit(s, FIELDS[0].tile!);
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
    s.customers = [{ id: 1, stall: 0, crop: 'tomato', want: 1, got: 0, wait: 0, patience: PATIENCE_SECONDS }];
    const events = stepFarm(s, PATIENCE_SECONDS + 0.1, stay);
    expect(events.some(e => e.type === 'unhappy')).toBe(true);
    expect(s.rating).toBeCloseTo(2.4);
    s.customers = [{ id: 2, stall: 0, crop: 'tomato', want: 1, got: 0, wait: 0, patience: PATIENCE_SECONDS }];
    s.stock.tomato = 1;
    stepFarm(s, 0.3, stay);
    expect(s.rating).toBeCloseTo(2.52);
  });
  it('lets an empty-handed shopper switch to produce that is in stock', () => {
    const s = createFarm();
    s.customers = [{ id: 1, stall: 0, crop: 'cucumber', want: 2, got: 0, wait: 0, patience: PATIENCE_SECONDS }];
    s.stock.tomato = 2; s.player = { ...away };
    stepFarm(s, 0.6, stay);
    expect(s.stock.tomato).toBe(0);
    expect(s.cash).toBeGreaterThanOrEqual(2 * PRICES.tomato);
  });
  it('buys each purchase once, in order: field, basket, field, basket', () => {
    const s = createFarm();
    expect(purchaseNext(s)).toBe(false);
    s.wallet = 10_000;
    for (const p of PURCHASES) expect(purchaseNext(s), p.kind).toBe(true);
    expect(purchaseNext(s)).toBe(false);
    expect(s.wallet).toBe(10_000 - PURCHASES.reduce((a, p) => a + p.price, 0));
    expect(s.plots.map(p => p.crop)).toEqual(['tomato', 'cucumber', 'strawberry', 'apple']);
    expect(capacity(s)).toBe(BASE_CAPACITY + 24);
    expect(hasCoop(s)).toBe(true);
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
    s.cash = 45;
    expect(farmGoal(s).at).toMatchObject(SPOTS.cash);
  });
  it('walks around solid props, and a seed stand only once its field exists', () => {
    const s = createFarm();
    s.player = { x: SPOTS.counter.x, z: SPOTS.counter.z + 0.9 };
    for (let i = 0; i < 20; i++) stepFarm(s, 0.05, { x: 0, z: -1 });
    expect(s.player.z).toBeGreaterThan(SPOTS.counter.z);
    const stand = FIELDS[1].stand!;
    s.player = { x: stand.x, z: stand.z + 0.9 };
    for (let i = 0; i < 20; i++) stepFarm(s, 0.05, { x: 0, z: -1 });
    expect(s.player.z).toBeLessThan(stand.z);
    s.wallet = 40; purchaseNext(s); s.player = { x: stand.x, z: stand.z + 0.9 };
    for (let i = 0; i < 20; i++) stepFarm(s, 0.05, { x: 0, z: -1 });
    expect(s.player.z).toBeGreaterThan(stand.z);
  });
  it('lays eggs into the nests once the coop opens, and she collects them into her basket', () => {
    const s = createFarm();
    s.wallet = 10_000; while (purchaseNext(s));
    s.player = { x: 0, z: -6 };
    stepFarm(s, LAY_SECONDS * 5, stay);
    expect(s.nests.reduce((a, b) => a + b, 0)).toBe(5);
    s.player = { ...NESTS[0] };
    const events = stepFarm(s, 0.2, stay);
    expect(events.some(e => e.type === 'egg')).toBe(true);
    expect(s.produce.egg).toBeGreaterThan(0);
  });
  it('lets her into the yard only after the coop is bought', () => {
    const s = createFarm();
    s.player = { x: 6.2, z: 0 };
    for (let i = 0; i < 30; i++) stepFarm(s, 0.05, { x: 1, z: 0 });
    expect(s.player.x).toBeLessThanOrEqual(6.4);
    s.wallet = 10_000; while (purchaseNext(s));
    for (let i = 0; i < 30; i++) stepFarm(s, 0.05, { x: 1, z: 0 });
    expect(s.player.x).toBeGreaterThan(7);
    expect(s.player.x).toBeLessThanOrEqual(YARD.maxX);
  });
  it('upgrades change growth, prices, speed and seed room, and stop at their top level', () => {
    const s = createFarm();
    s.wallet = 100_000;
    expect(buyUpgrade(s, 'stall')).toBe(false);
    purchaseNext(s);
    expect(buyUpgrade(s, 'sprinkler')).toBe(true);
    expect(growTime(s, 'tomato')).toBeCloseTo(GROW.tomato * 0.85);
    expect(buyUpgrade(s, 'stall')).toBe(true);
    expect(priceOf(s, 'tomato')).toBe(PRICES.tomato + 1);
    expect(buyUpgrade(s, 'boots')).toBe(true);
    expect(speed(s)).toBeCloseTo(RUN_SPEED * 1.1);
    expect(buyUpgrade(s, 'pouch') && buyUpgrade(s, 'pouch')).toBe(true);
    expect(buyUpgrade(s, 'pouch')).toBe(false);
    const before = capacity(s);
    for (let i = 0; i < 5; i++) expect(buyUpgrade(s, 'basket')).toBe(true);
    expect(buyUpgrade(s, 'basket')).toBe(false);
    expect(capacity(s)).toBe(before + 60);
  });
  it('decorations are bought once each; farmhands pick, replant and stock the stall', () => {
    const s = createFarm();
    s.wallet = 100_000; purchaseNext(s);
    expect(buyDecor(s, 'fountain')).toBe(true);
    expect(buyDecor(s, 'fountain')).toBe(false);
    expect(hireHelper(s) && hireHelper(s)).toBe(true);
    expect(hireHelper(s)).toBe(false);
    for (const cell of s.plots[0].cells) { cell.stage = 'ripe'; cell.age = GROW.tomato; }
    s.player = { x: 0, z: -6 };
    for (let i = 0; i < 400; i++) stepFarm(s, 0.05, stay);
    expect(s.stats.harvested.tomato).toBeGreaterThan(0);
    expect(s.stock.tomato + s.stats.sold.tomato).toBeGreaterThan(0);
    expect(s.plots[0].cells.some(c => c.stage !== 'empty')).toBe(true);
  });
  it('farmhands fetch eggs from the coop through the gate and stock them', () => {
    const s = createFarm();
    s.wallet = 100_000; for (let i = 0; i < 5; i++) purchaseNext(s);
    hireHelper(s); s.nests = [4, 4, 4]; s.player = { x: 0, z: -6 };
    for (let i = 0; i < 600; i++) stepFarm(s, 0.05, stay);
    expect(s.stats.harvested.egg).toBeGreaterThan(0);
    expect(s.stock.egg + s.stats.sold.egg).toBeGreaterThan(0);
  });
  it('the orchard sells apples and honey at its own stand, while the market keeps the rest', () => {
    const s = createFarm();
    s.wallet = 100_000; while (purchaseNext(s));
    expect(hasHives(s)).toBe(true);
    const tree = s.plots[3].cells[0];
    expect(tree.stage).toBe('ripe');
    s.player = { x: tree.x, z: tree.z };
    stepFarm(s, 0.2, stay);
    expect(s.produce.apple).toBe(3);
    expect(tree.stage).toBe('growing');
    s.produce.tomato = 2;
    s.player = { ...SPOTS.market }; stepFarm(s, 0.2, stay);
    expect(s.produce.apple).toBe(3); expect(s.stock.tomato).toBe(2);
    s.player = { ...SPOTS.stand }; stepFarm(s, 0.2, stay);
    expect(s.produce.apple).toBe(0); expect(s.stock.apple).toBe(3);
    s.player = { x: 0, z: -6 };
    for (let i = 0; i < 200; i++) stepFarm(s, 0.05, stay);
    expect(s.stats.sold.apple).toBeGreaterThan(0);
    expect(s.standCash).toBeGreaterThan(0);
    for (let i = 0; i < 100; i++) stepFarm(s, 0.1, stay);
    expect(s.hives.some(h => h > 0)).toBe(true);
    s.player = { ...HIVES[0] }; stepFarm(s, 0.2, stay);
  });
  it('keeps her off the orchard until it is bought, then lets her in by the path', () => {
    const s = createFarm();
    s.player = { x: 0, z: 6.2 };
    for (let i = 0; i < 30; i++) stepFarm(s, 0.05, { x: 0, z: 1 });
    expect(s.player.z).toBeLessThanOrEqual(6.4);
    s.wallet = 100_000; while (purchaseNext(s));
    for (let i = 0; i < 30; i++) stepFarm(s, 0.05, { x: 0, z: 1 });
    expect(s.player.z).toBeGreaterThan(7);
    expect(s.player.z).toBeLessThanOrEqual(ORCHARD.maxZ);
  });
  it('two farmhands spread over different fields instead of crowding the nearest', () => {
    const s = createFarm();
    s.wallet = 100_000; for (let i = 0; i < 3; i++) purchaseNext(s);
    hireHelper(s); hireHelper(s); s.wallet = 0;
    for (const plot of s.plots) for (const cell of plot.cells) { cell.stage = 'ripe'; cell.age = GROW[plot.crop]; }
    s.player = { x: 0, z: -6 };
    for (let i = 0; i < 160; i++) stepFarm(s, 0.05, stay);
    const crops = (['tomato', 'cucumber', 'strawberry'] as const).filter(c => s.stats.harvested[c] > 0);
    expect(crops.length).toBeGreaterThanOrEqual(2);
  });
  it('bounds movement and ignores non-finite input and time', () => {
    const s = createFarm();
    stepFarm(s, 1000, { x: 1, z: 1 });
    expect(Number.isFinite(s.player.x)).toBe(true);
    stepFarm(s, NaN, { x: Infinity, z: NaN });
    expect(Number.isFinite(s.player.x + s.player.z)).toBe(true);
  });
});

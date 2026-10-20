import { describe, expect, it } from 'vitest';
import { createFarm, stepFarm, purchaseLand, CROP_CAPACITY, SEED_CAPACITY, GROW_SECONDS, SPOTS } from './model';

const stay = { x: 0, z: 0 };
function visit(s: ReturnType<typeof createFarm>, point: { x: number; z: number }) {
  s.player = { ...point };
  return stepFarm(s, 0.5, stay);
}

describe('Pocket Farm loop', () => {
  it('supplies free seeds and plants the assigned crop', () => {
    const s = createFarm();
    visit(s, SPOTS.seeds);
    expect(s.seeds.tomato).toBe(SEED_CAPACITY);
    expect(s.wallet).toBe(0);
    const cell = s.plots[0].cells[0];
    visit(s, cell);
    expect(cell.stage).toBe('growing');
    expect(s.seeds.tomato).toBeLessThan(SEED_CAPACITY);
  });
  it('grows crops while active, collects them, and leaves ripe crops when full', () => {
    const s = createFarm();
    const cell = s.plots[0].cells[0];
    cell.stage = 'growing';
    s.player = { x: 0, z: 5 };
    stepFarm(s, GROW_SECONDS, stay);
    expect(cell.stage).toBe('ripe');
    s.produce.tomato = CROP_CAPACITY;
    visit(s, cell);
    expect(cell.stage).toBe('ripe');
    s.produce.tomato = CROP_CAPACITY - 1;
    visit(s, cell);
    expect(cell.stage).toBe('ripe');
    expect(s.produce.tomato).toBe(CROP_CAPACITY - 1);
    s.produce.tomato = 0;
    visit(s, cell);
    expect(s.produce.tomato).toBeGreaterThan(0);
    expect(cell.stage).toBe('empty');
  });
  it('delivers mixed produce, sells stock, then collects cash independently of a full basket', () => {
    const s = createFarm();
    s.produce = { tomato: 4, cucumber: 2 };
    visit(s, SPOTS.market);
    expect(s.produce).toEqual({ tomato: 0, cucumber: 0 });
    s.player = { x: 0, z: 5 };
    stepFarm(s, 8, stay);
    expect(s.cash).toBeGreaterThan(0);
    expect(s.wallet).toBe(0);
    const cash = s.cash;
    s.produce.tomato = CROP_CAPACITY;
    visit(s, SPOTS.cash);
    expect(s.wallet).toBeGreaterThanOrEqual(cash);
    expect(s.cash).toBe(0);
  });
  it('buys the next field exactly once and unlocks cucumbers', () => {
    const s = createFarm();
    expect(purchaseLand(s)).toBe(false);
    s.wallet = 100;
    expect(purchaseLand(s)).toBe(true);
    expect(s.wallet).toBe(60);
    expect(s.plots).toHaveLength(2);
    expect(s.plots[1].crop).toBe('cucumber');
    expect(purchaseLand(s)).toBe(false);
    expect(s.wallet).toBe(60);
  });
  it('does not charge for merely crossing a purchase marker', () => {
    const s = createFarm();
    s.wallet = 40;
    s.player = { ...SPOTS.expansion };
    stepFarm(s, 0.1, stay);
    expect(s.wallet).toBe(40);
    s.player = { x: 0, z: 5 };
    stepFarm(s, 1, stay);
    expect(s.purchaseProgress).toBe(0);
    s.player = { ...SPOTS.expansion };
    stepFarm(s, 1, stay);
    expect(s.plots).toHaveLength(2);
    expect(s.wallet).toBe(0);
  });
  it('bounds movement and ignores non-finite input and time', () => {
    const s = createFarm();
    stepFarm(s, 1000, { x: 1, z: 1 });
    expect(Math.abs(s.player.x)).toBeLessThanOrEqual(4);
    stepFarm(s, NaN, { x: Infinity, z: NaN });
    expect(Number.isFinite(s.player.x + s.player.z)).toBe(true);
  });
});

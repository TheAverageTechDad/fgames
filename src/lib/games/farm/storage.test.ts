import { describe, expect, it } from 'vitest';
import { createFarm, purchaseNext, buyUpgrade, buyDecor, hireHelper } from './model';
import { readFarm, saveFarm } from './storage';

function memory(initial: string | null = null) {
  let value = initial;
  return { getItem: () => value, setItem: (_key: string, text: string) => { value = text; } };
}
describe('farm saves', () => {
  it('roundtrips progress and a completed purchase without charging again', () => {
    const store = memory(), s = createFarm();
    s.wallet = 45; purchaseNext(s);
    s.seeds.tomato = 3; s.produce.cucumber = 2; s.cash = 7; s.stock.tomato = 5;
    s.plots[0].cells[0].stage = 'growing'; s.plots[0].cells[0].age = 3;
    expect(saveFarm(store, s)).toBe(true);
    const loaded = readFarm(store);
    expect(loaded.wallet).toBe(5); expect(loaded.plots).toHaveLength(2);
    expect(loaded.produce.cucumber).toBe(2); expect(loaded.cash).toBe(7);
    expect(loaded.plots[0].cells[0].age).toBe(3);
    expect(loaded.purchased).toBe(1);
    expect(purchaseNext(loaded)).toBe(false);
  });
  it.each(['{bad', '{"version":99}', 'null', '[]', '{"version":1}'])('recovers from corrupt or unsupported saves: %s', value => {
    expect(readFarm(memory(value))).toEqual(createFarm());
  });
  it('rejects non-finite, negative, over-capacity, and invalid world data', () => {
    for (const mutate of [
      (s: ReturnType<typeof createFarm>) => { s.wallet = -5; },
      (s: ReturnType<typeof createFarm>) => { s.produce.tomato = 999; },
      (s: ReturnType<typeof createFarm>) => { s.player.x = Infinity; },
      (s: ReturnType<typeof createFarm>) => { s.plots[0].cells[0].age = -3; }
    ]) {
      const s = createFarm(); mutate(s);
      expect(readFarm(memory(JSON.stringify(s)))).toEqual(createFarm());
    }
  });
  it('upgrades a save from before strawberries, goals and ratings', () => {
    const old = { version: 1, player: { x: 1, z: 1 }, plots: [createFarm().plots[0], { id: 1, crop: 'cucumber', cells: createFarm().plots[0].cells.map(c => ({ ...c, id: c.id.replace('0-', '1-') })) }],
      seeds: { tomato: 1, cucumber: 0 }, produce: { tomato: 2, cucumber: 3 }, stock: { tomato: 0, cucumber: 0 }, wallet: 7, cash: 0, sold: 20, muted: false, haptics: true };
    const loaded = readFarm(memory(JSON.stringify(old)));
    expect(loaded.plots).toHaveLength(2);
    expect(loaded.purchased).toBe(1);
    expect(loaded.produce).toEqual({ tomato: 2, cucumber: 3, strawberry: 0, egg: 0 });
    expect(loaded.music).toBe(true);
    expect(loaded.rating).toBe(3);
    expect(loaded.goal).toBe(0);
  });
  it('roundtrips the coop, upgrades, decorations and farmhands', () => {
    const store = memory(), s = createFarm();
    s.wallet = 100_000; while (purchaseNext(s));
    buyUpgrade(s, 'pouch'); buyDecor(s, 'arch'); hireHelper(s); s.nests = [2, 0, 4]; s.player = { x: 9, z: -1 };
    saveFarm(store, s);
    const loaded = readFarm(store);
    expect(loaded.purchased).toBe(5); expect(loaded.upgrades.pouch).toBe(1); expect(loaded.decor).toEqual(['arch']);
    expect(loaded.helpers).toHaveLength(1); expect(loaded.nests).toEqual([2, 0, 4]); expect(loaded.player.x).toBe(9);
  });
  it('rejects unknown decorations and impossible upgrade levels', () => {
    for (const mutate of [(s: ReturnType<typeof createFarm>) => { (s.decor as string[]).push('castle'); }, (s: ReturnType<typeof createFarm>) => { s.upgrades.boots = 9; }]) {
      const s = createFarm(); mutate(s);
      expect(readFarm(memory(JSON.stringify(s)))).toEqual(createFarm());
    }
  });
  it('works when browser storage is unavailable', () => {
    const store = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
    expect(readFarm(store)).toEqual(createFarm());
    expect(saveFarm(store, createFarm())).toBe(false);
  });
});

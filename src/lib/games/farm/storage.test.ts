import { describe, expect, it } from 'vitest';
import { createFarm, purchaseLand } from './model';
import { readFarm, saveFarm } from './storage';

function memory(initial: string | null = null) {
  let value = initial;
  return { getItem: () => value, setItem: (_key: string, text: string) => { value = text; } };
}
describe('farm saves', () => {
  it('roundtrips progress and a completed purchase without charging again', () => {
    const store = memory(), s = createFarm();
    s.wallet = 45; purchaseLand(s);
    s.seeds.tomato = 3; s.produce.cucumber = 2; s.cash = 7; s.stock.tomato = 5;
    s.plots[0].cells[0].stage = 'growing'; s.plots[0].cells[0].age = 3;
    expect(saveFarm(store, s)).toBe(true);
    const loaded = readFarm(store);
    expect(loaded.wallet).toBe(5); expect(loaded.plots).toHaveLength(2);
    expect(loaded.produce.cucumber).toBe(2); expect(loaded.cash).toBe(7);
    expect(loaded.plots[0].cells[0].age).toBe(3);
    expect(purchaseLand(loaded)).toBe(false);
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
  it('works when browser storage is unavailable', () => {
    const store = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); } };
    expect(readFarm(store)).toEqual(createFarm());
    expect(saveFarm(store, createFarm())).toBe(false);
  });
});

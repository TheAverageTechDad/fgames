import { describe, expect, it } from 'vitest';
import { readGarage, saveGarage, SAVE_KEY, emptyGarage } from './storage';

const memory = (value: string | null) => {
  const data = new Map<string, string>(value === null ? [] : [[SAVE_KEY, value]]);
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};

describe('garage save', () => {
  it('starts empty without a save, or with a broken one', () => {
    expect(readGarage(memory(null))).toEqual(emptyGarage());
    expect(readGarage(memory('{nope'))).toEqual(emptyGarage());
  });
  it('round-trips bikes and a build in progress', () => {
    const store = memory(null);
    saveGarage(store, { bikes: [{ paint: 'blue', stars: 7, built: 5 }], building: { steps: 4, paint: 'pink' }, voice: false });
    expect(readGarage(store)).toEqual({ bikes: [{ paint: 'blue', stars: 7, built: 5 }], building: { steps: 4, paint: 'pink' }, voice: false });
  });
  it('drops what it cannot trust', () => {
    const g = readGarage(memory(JSON.stringify({ bikes: [{ paint: 'tartan' }, { paint: 'red', stars: -3 }], building: { steps: 99 } })));
    expect(g.bikes).toEqual([{ paint: 'red', stars: 0, built: 0 }]);
    expect(g.building).toBeNull();
  });
});

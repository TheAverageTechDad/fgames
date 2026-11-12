import { describe, expect, it } from 'vitest';
import { readGarage, saveGarage, SAVE_KEY, emptyGarage } from './storage';
import { MODES, PARTS, STEPS, piecesFor } from './steps';

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
    const garage = { bikes: [{ paint: 'blue' as const, stars: 7, built: 5, mode: 'master' as const }], building: { mode: 'mechanic' as const, placed: ['engine', 'forks'], paint: 'pink' as const }, voice: false, mode: 'mechanic' as const, radio: false };
    saveGarage(store, garage);
    expect(readGarage(store)).toEqual(garage);
  });
  it('reads the first save format as an Apprentice build', () => {
    const g = readGarage(memory(JSON.stringify({ bikes: [{ paint: 'red', stars: 3, built: 1 }], building: { steps: 2, paint: 'green' }, voice: true })));
    expect(g.building).toEqual({ mode: 'apprentice', placed: ['engine', 'swingarm'], paint: 'green' });
    expect(g.bikes[0].mode).toBe('apprentice');
  });
  it('drops what it cannot trust', () => {
    const g = readGarage(memory(JSON.stringify({ bikes: [{ paint: 'tartan' }, { paint: 'red', stars: -3 }], building: { steps: 99 } })));
    expect(g.bikes).toEqual([{ paint: 'red', stars: 0, built: 0, mode: 'apprentice' }]);
    expect(g.building).toBeNull();
    expect(readGarage(memory(JSON.stringify({ building: { mode: 'master', placed: ['tank', 'tank', 'engine', 7] } }))).building?.placed).toEqual(['tank']);
  });
});

describe('build pieces', () => {
  it('every mode covers every part once, and can be built in its listed order', () => {
    for (const { id } of MODES) {
      const pieces = piecesFor(id), on = new Set<string>();
      expect(pieces.flatMap(p => p.members).sort()).toEqual(PARTS.map(p => p.id).sort());
      for (const p of pieces) { expect(p.needs.every(n => on.has(n)), `${id}: ${p.id}`).toBe(true); on.add(p.id); }
    }
    expect(piecesFor('apprentice').map(p => p.id)).toEqual(STEPS.map(s => s.id));
  });
});

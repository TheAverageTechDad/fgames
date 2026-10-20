import { createFarm, makePlot, total, BOUNDS, CROP_CAPACITY, SEED_CAPACITY, GROW_SECONDS, type FarmState, type Inventory } from './model';
export const SAVE_KEY = 'pocket-farm:v1';
type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem'>;
const number = (v: unknown, max: number, integer = true): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max && (!integer || Number.isInteger(v));
function inventory(v: unknown, cap: number): v is Inventory {
  if (!v || typeof v !== 'object') return false;
  const n = v as Inventory;
  return number(n.tomato, cap) && number(n.cucumber, cap) && total(n) <= cap;
}
export function readFarm(storage: Reader): FarmState {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return createFarm();
    const s = JSON.parse(raw) as FarmState;
    if (!s || s.version !== 1 || !Array.isArray(s.plots) || s.plots.length < 1 || s.plots.length > 2 ||
      !s.player || !Number.isFinite(s.player.x) || !Number.isFinite(s.player.z) || Math.abs(s.player.x) > BOUNDS || Math.abs(s.player.z) > BOUNDS ||
      !inventory(s.seeds, SEED_CAPACITY) || !inventory(s.produce, CROP_CAPACITY) || !inventory(s.stock, 1_000_000) ||
      !number(s.wallet, 1_000_000_000) || !number(s.cash, 1_000_000_000) || !number(s.sold, 1_000_000_000)) return createFarm();
    const fresh = createFarm();
    fresh.plots = s.plots.map((plot, i) => {
      const canonical = makePlot(i, i === 0 ? 'tomato' : 'cucumber');
      if (plot.id !== i || plot.crop !== canonical.crop || !Array.isArray(plot.cells) || plot.cells.length !== 9) throw new Error('Invalid plot');
      canonical.cells.forEach((cell, j) => {
        const saved = plot.cells[j];
        if (!saved || !['empty', 'growing', 'ripe'].includes(saved.stage) || !number(saved.age, GROW_SECONDS, false)) throw new Error('Invalid crop');
        cell.stage = saved.stage; cell.age = saved.age;
      });
      return canonical;
    });
    fresh.player = { x: s.player.x, z: s.player.z };
    for (const key of ['seeds', 'produce', 'stock'] as const) fresh[key] = { tomato: s[key].tomato, cucumber: s[key].cucumber };
    fresh.wallet = s.wallet; fresh.cash = s.cash; fresh.sold = s.sold;
    fresh.muted = s.muted === true; fresh.haptics = s.haptics !== false;
    return fresh;
  } catch { return createFarm(); }
}
export function saveFarm(storage: Writer, state: FarmState): boolean {
  try { storage.setItem(SAVE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}

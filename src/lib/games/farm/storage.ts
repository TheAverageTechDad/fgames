import { createFarm, makePlot, capacity, total, BOUNDS, CROPS, FIELDS, GROW, PURCHASES, SEED_CAPACITY, type FarmState, type Inventory } from './model';
export const SAVE_KEY = 'pocket-farm:v1';
type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem'>;
const BIG = 1_000_000_000;
const number = (v: unknown, max: number, integer = true): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max && (!integer || Number.isInteger(v));
// Crops added after a save was written default to zero.
function inventory(v: unknown, cap: number): Inventory {
  if (!v || typeof v !== 'object') throw new Error('Invalid inventory');
  const n = v as Partial<Inventory>, out = {} as Inventory;
  for (const crop of CROPS) {
    const value = n[crop] ?? 0;
    if (!number(value, cap)) throw new Error('Invalid count');
    out[crop] = value;
  }
  if (total(out) > cap) throw new Error('Over capacity');
  return out;
}
const optional = (v: unknown, fallback: number, max: number, integer = true) => {
  if (v === undefined) return fallback;
  if (!number(v, max, integer)) throw new Error('Invalid value');
  return v;
};
export function readFarm(storage: Reader): FarmState {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return createFarm();
    const s = JSON.parse(raw) as FarmState;
    if (!s || s.version !== 1 || !Array.isArray(s.plots) || s.plots.length < 1 || s.plots.length > FIELDS.length ||
      !s.player || !Number.isFinite(s.player.x) || !Number.isFinite(s.player.z) || Math.abs(s.player.x) > BOUNDS || Math.abs(s.player.z) > BOUNDS ||
      !number(s.wallet, BIG) || !number(s.cash, BIG) || !number(s.sold, BIG)) return createFarm();
    const fresh = createFarm();
    // Saves from before the purchase track only bought the cucumber field.
    fresh.purchased = optional(s.purchased, s.plots.length - 1, PURCHASES.length);
    const fields = [0, ...PURCHASES.slice(0, fresh.purchased).flatMap(p => p.field ?? [])];
    if (fields.length !== s.plots.length) return createFarm();
    fresh.plots = s.plots.map((plot, i) => {
      const canonical = makePlot(fields[i]);
      if (plot.id !== canonical.id || plot.crop !== canonical.crop || !Array.isArray(plot.cells) || plot.cells.length !== 9) throw new Error('Invalid plot');
      canonical.cells.forEach((cell, j) => {
        const saved = plot.cells[j];
        if (!saved || !['empty', 'growing', 'ripe'].includes(saved.stage) || !number(saved.age, GROW[canonical.crop], false)) throw new Error('Invalid crop');
        cell.stage = saved.stage; cell.age = saved.age;
      });
      return canonical;
    });
    fresh.player = { x: s.player.x, z: s.player.z };
    fresh.seeds = inventory(s.seeds, SEED_CAPACITY);
    fresh.produce = inventory(s.produce, capacity(fresh));
    fresh.stock = inventory(s.stock, BIG);
    fresh.wallet = s.wallet; fresh.cash = s.cash; fresh.sold = s.sold;
    fresh.rating = optional(s.rating, 3, 5, false);
    if (fresh.rating < 1) throw new Error('Invalid rating');
    fresh.goal = optional(s.goal, 0, 10_000);
    if (s.stats !== undefined) {
      fresh.stats = { harvested: inventory(s.stats.harvested, BIG), sold: inventory(s.stats.sold, BIG),
        served: optional(s.stats.served, 0, BIG), unhappy: optional(s.stats.unhappy, 0, BIG), earned: optional(s.stats.earned, 0, BIG) };
    }
    fresh.muted = s.muted === true; fresh.haptics = s.haptics !== false;
    return fresh;
  } catch { return createFarm(); }
}
export function saveFarm(storage: Writer, state: FarmState): boolean {
  try { storage.setItem(SAVE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}

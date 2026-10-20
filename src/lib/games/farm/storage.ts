import { createFarm, empty, makePlot, capacity, seedCapacity, total, BOUNDS, DECOR, FIELDS, GROW, HELPER_LOAD, HELPER_PRICES, NEST_SIZE, PRODUCTS, PURCHASES, UPGRADES, YARD,
  type DecorId, type FarmState, type Inventory, type UpgradeId } from './model';
export const SAVE_KEY = 'pocket-farm:v1';
type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem'>;
const BIG = 1_000_000_000;
const number = (v: unknown, max: number, integer = true): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max && (!integer || Number.isInteger(v));
const fail = (why: string): never => { throw new Error(why); };
// Products added after a save was written default to zero.
function inventory(v: unknown, cap: number): Inventory {
  if (!v || typeof v !== 'object') fail('Invalid inventory');
  const n = v as Partial<Inventory>, out = empty();
  for (const item of PRODUCTS) {
    const value = n[item] ?? 0;
    if (!number(value, cap)) fail('Invalid count');
    out[item] = value as number;
  }
  if (total(out) > cap) fail('Over capacity');
  return out;
}
const optional = (v: unknown, fallback: number, max: number, integer = true) => {
  if (v === undefined) return fallback;
  if (!number(v, max, integer)) fail('Invalid value');
  return v as number;
};
const inside = (p: { x: number; z: number }, yard: boolean) => Number.isFinite(p?.x) && Number.isFinite(p?.z) && Math.abs(p.z) <= BOUNDS &&
  p.x >= -BOUNDS && (p.x <= BOUNDS || yard && p.x <= YARD.maxX && p.z >= YARD.minZ && p.z <= YARD.maxZ);
export function readFarm(storage: Reader): FarmState {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return createFarm();
    const s = JSON.parse(raw) as FarmState;
    if (!s || s.version !== 1 || !Array.isArray(s.plots) || s.plots.length < 1 || s.plots.length > FIELDS.length ||
      !number(s.wallet, BIG) || !number(s.cash, BIG) || !number(s.sold, BIG)) return createFarm();
    const fresh = createFarm();
    // Saves from before the purchase track only bought the cucumber field.
    fresh.purchased = optional(s.purchased, s.plots.length - 1, PURCHASES.length);
    const owned = PURCHASES.slice(0, fresh.purchased), yard = owned.some(p => p.kind === 'coop');
    if (!s.player || !inside(s.player, yard)) return createFarm();
    const fields = [0, ...owned.flatMap(p => p.field ?? [])];
    if (fields.length !== s.plots.length) return createFarm();
    fresh.plots = s.plots.map((plot, i) => {
      const canonical = makePlot(fields[i]);
      if (plot.id !== canonical.id || plot.crop !== canonical.crop || !Array.isArray(plot.cells) || plot.cells.length !== 9) fail('Invalid plot');
      canonical.cells.forEach((cell, j) => {
        const saved = plot.cells[j];
        if (!saved || !['empty', 'growing', 'ripe'].includes(saved.stage) || !number(saved.age, GROW[canonical.crop], false)) fail('Invalid crop');
        cell.stage = saved.stage; cell.age = saved.age;
      });
      return canonical;
    });
    fresh.player = { x: s.player.x, z: s.player.z };
    if (s.upgrades !== undefined) for (const id of Object.keys(UPGRADES) as UpgradeId[]) fresh.upgrades[id] = optional(s.upgrades?.[id], 0, UPGRADES[id].prices.length);
    if (s.decor !== undefined) {
      if (!Array.isArray(s.decor) || new Set(s.decor).size !== s.decor.length || s.decor.some(d => !(d in DECOR))) fail('Invalid decor');
      fresh.decor = [...s.decor] as DecorId[];
    }
    fresh.seeds = inventory(s.seeds, seedCapacity(fresh));
    fresh.produce = inventory(s.produce, capacity(fresh));
    fresh.stock = inventory(s.stock, BIG);
    if (s.helpers !== undefined) {
      if (!Array.isArray(s.helpers) || s.helpers.length > HELPER_PRICES.length) fail('Invalid helpers');
      fresh.helpers = s.helpers.map(h => { if (!inside(h, yard)) fail('Invalid helper'); return { x: h.x, z: h.z, carry: inventory(h.carry, HELPER_LOAD + 3) }; });
    }
    if (s.nests !== undefined) {
      if (!Array.isArray(s.nests) || s.nests.length !== fresh.nests.length || s.nests.some(n => !number(n, NEST_SIZE))) fail('Invalid nests');
      fresh.nests = [...s.nests];
    }
    fresh.wallet = s.wallet; fresh.cash = s.cash; fresh.sold = s.sold;
    fresh.rating = optional(s.rating, 3, 5, false);
    if (fresh.rating < 1) fail('Invalid rating');
    fresh.goal = optional(s.goal, 0, 10_000);
    if (s.stats !== undefined) {
      fresh.stats = { harvested: inventory(s.stats.harvested, BIG), sold: inventory(s.stats.sold, BIG),
        served: optional(s.stats.served, 0, BIG), unhappy: optional(s.stats.unhappy, 0, BIG), earned: optional(s.stats.earned, 0, BIG) };
    }
    fresh.muted = s.muted === true; fresh.music = s.music !== false; fresh.haptics = s.haptics !== false;
    return fresh;
  } catch { return createFarm(); }
}
export function saveFarm(storage: Writer, state: FarmState): boolean {
  try { storage.setItem(SAVE_KEY, JSON.stringify(state)); return true; } catch { return false; }
}

import { PAINTS, STEPS, isMode, piecesFor, type ModeId, type PaintId } from './steps';

export const SAVE_KEY = 'garage:v1';
export type Bike = { paint: PaintId; stars: number; built: number; mode: ModeId; time?: number };
/** A build in progress survives leaving the game: its mode, the pieces on so far, the paint chosen and its stopwatch (seconds). */
export type Building = { mode: ModeId; placed: string[]; paint: PaintId; time: number };
/** `best`: the fastest Mechanic and Master builds, in seconds. */
export type Garage = { bikes: Bike[]; building: Building | null; voice: boolean; mode: ModeId; radio: boolean; best: Partial<Record<ModeId, number>> };
type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export const emptyGarage = (): Garage => ({ bikes: [], building: null, voice: true, mode: 'apprentice', radio: true, best: {} });
const seconds = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
const isPaint = (v: unknown): v is PaintId => PAINTS.some(p => p.id === v);

/** Reads the save, keeping whatever is valid and dropping the rest; a broken save starts an empty garage. */
export function readGarage(store: Store): Garage {
  const garage = emptyGarage();
  try {
    const raw = JSON.parse(store.getItem(SAVE_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return garage;
    if (Array.isArray(raw.bikes)) garage.bikes = raw.bikes.filter((b: Bike) => b && isPaint(b.paint))
      .map((b: Bike) => ({ paint: b.paint, stars: Math.max(0, Math.floor(Number(b.stars) || 0)), built: Number(b.built) || 0, mode: isMode(b.mode) ? b.mode : 'apprentice',
        ...(seconds(b.time) ? { time: seconds(b.time) } : {}) })).slice(-24);
    if (isMode(raw.mode)) garage.mode = raw.mode;
    const b = raw.building;
    if (b && typeof b === 'object') {
      const paint = isPaint(b.paint) ? b.paint : 'red';
      if (Number.isInteger(b.steps) && b.steps >= 0 && b.steps <= STEPS.length) {
        // the first save format: how many of the 13 steps were on, always built in order
        garage.building = { mode: 'apprentice', placed: STEPS.slice(0, b.steps).map(s => s.id), paint, time: 0 };
      } else if (isMode(b.mode) && Array.isArray(b.placed)) {
        const ids = new Set(piecesFor(b.mode).map(p => p.id));
        garage.building = { mode: b.mode, placed: [...new Set(b.placed.filter((id: unknown) => typeof id === 'string' && ids.has(id)))] as string[], paint, time: seconds(b.time) };
      }
    }
    if (typeof raw.voice === 'boolean') garage.voice = raw.voice;
    if (typeof raw.radio === 'boolean') garage.radio = raw.radio;
    if (raw.best && typeof raw.best === 'object') for (const m of ['mechanic', 'master'] as const) if (seconds(raw.best[m])) garage.best[m] = seconds(raw.best[m]);
  } catch { /* unreadable: an empty garage */ }
  return garage;
}

export function saveGarage(store: Store, garage: Garage) {
  try { store.setItem(SAVE_KEY, JSON.stringify(garage)); return true; } catch { return false; }
}

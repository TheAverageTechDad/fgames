import { PAINTS, STEPS, type PaintId } from './steps';

export const SAVE_KEY = 'garage:v1';
export type Bike = { paint: PaintId; stars: number; built: number };
/** A build in progress survives leaving the game: how many steps are on and the paint chosen so far. */
export type Garage = { bikes: Bike[]; building: { steps: number; paint: PaintId } | null; voice: boolean };
type Store = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export const emptyGarage = (): Garage => ({ bikes: [], building: null, voice: true });
const isPaint = (v: unknown): v is PaintId => PAINTS.some(p => p.id === v);

/** Reads the save, keeping whatever is valid and dropping the rest; a broken save starts an empty garage. */
export function readGarage(store: Store): Garage {
  const garage = emptyGarage();
  try {
    const raw = JSON.parse(store.getItem(SAVE_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return garage;
    if (Array.isArray(raw.bikes)) garage.bikes = raw.bikes.filter((b: Bike) => b && isPaint(b.paint))
      .map((b: Bike) => ({ paint: b.paint, stars: Math.max(0, Math.floor(Number(b.stars) || 0)), built: Number(b.built) || 0 })).slice(-24);
    const b = raw.building;
    if (b && Number.isInteger(b.steps) && b.steps >= 0 && b.steps <= STEPS.length) garage.building = { steps: b.steps, paint: isPaint(b.paint) ? b.paint : 'red' };
    if (typeof raw.voice === 'boolean') garage.voice = raw.voice;
  } catch { /* unreadable: an empty garage */ }
  return garage;
}

export function saveGarage(store: Store, garage: Garage) {
  try { store.setItem(SAVE_KEY, JSON.stringify(garage)); return true; } catch { return false; }
}

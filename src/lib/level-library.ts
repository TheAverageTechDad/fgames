import type { EscapeLevel } from './escape/types';
import type { NutsLevel } from './nuts/types';
import type { NutMove } from './nuts/solver';
import type { VehicleMove } from './escape/solver';
export const difficulties = ['easy','medium','hard','extra_hard'] as const;
export type Difficulty = typeof difficulties[number];
export type Game = 'nuts' | 'escape';
export type StoredNutsLevel = NutsLevel & { minMoves: number; solution: NutMove[] };
export type StoredEscapeLevel = EscapeLevel & { minMoves: number; solution: VehicleMove[] };
export type Library = Record<Difficulty, (StoredNutsLevel | StoredEscapeLevel)[]>;
export function savedLevel(game: Game, difficulty: Difficulty) {
 try { return Math.max(1,Math.min(100,Number(localStorage.getItem(`fgames_v2_${game}_${difficulty}_level`)) || 1)); } catch { return 1; }
}
export function saveProgress(game: Game, difficulty: Difficulty, level: number) {
 try { localStorage.setItem(`fgames_v2_${game}_${difficulty}_level`,String(Math.min(100,Math.max(savedLevel(game,difficulty),level)))); } catch { /* Private storage still allows play. */ }
}
export function readHints(game: Game) {
 try { const v=localStorage.getItem(`fgames_${game}_hints`); return v===null?3:Math.max(0,Math.min(3,Number(v)||0)); } catch { return 3; }
}
export function saveHints(game: Game, count: number) {
 try { localStorage.setItem(`fgames_${game}_hints`,String(count)); } catch { /* Session value remains usable. */ }
}

import { SETS } from './words';

// When the word is said after blending: after a short countdown (the child's turn first), or only when the speaker is
// tapped (a grown-up listening, or a child who wants to check). Saved on the device.
export type Reveal = 'pause' | 'tap';
const KEY = 'phonics_reveal';
export function readReveal(): Reveal { try { return localStorage.getItem(KEY) === 'tap' ? 'tap' : 'pause'; } catch { return 'pause'; } }
export function saveReveal(value: Reveal) { try { localStorage.setItem(KEY, value); } catch { /* private mode: lasts this visit */ } }

// The sound map: rounds finished on each stone (index 0 is stone 1), and whether a grown-up opened every stone. A stone
// opens once the stone before it has a finished round. Saved on the device.
export type Progress = { rounds: number[]; open: boolean };
const PROGRESS = 'phonics_progress';
export function readProgress(): Progress {
  try { const p = JSON.parse(localStorage.getItem(PROGRESS) ?? '{}'); return { rounds: SETS.map((_, i) => Number(p.rounds?.[i]) || 0), open: p.open === true }; }
  catch { return { rounds: SETS.map(() => 0), open: false }; }
}
export function saveProgress(p: Progress) { try { localStorage.setItem(PROGRESS, JSON.stringify(p)); } catch { /* private mode: lasts this visit */ } }
export const isOpen = (p: Progress, stone: number) => p.open || stone === 1 || p.rounds[stone - 2] > 0;

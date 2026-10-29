// When the word is said after blending: after a short countdown (the child's turn first), or only when the speaker is
// tapped (a grown-up listening, or a child who wants to check). Saved on the device.
export type Reveal = 'pause' | 'tap';
const KEY = 'phonics_reveal';
export function readReveal(): Reveal { try { return localStorage.getItem(KEY) === 'tap' ? 'tap' : 'pause'; } catch { return 'pause'; } }
export function saveReveal(value: Reveal) { try { localStorage.setItem(KEY, value); } catch { /* private mode: lasts this visit */ } }

// Which stone's words a round reads: 1 is s a t p i n, 2 adds m d g o. ponytail: a setting until the sound map exists.
const STONE = 'phonics_stone';
export function readStone(): number { try { return localStorage.getItem(STONE) === '2' ? 2 : 1; } catch { return 1; } }
export function saveStone(value: number) { try { localStorage.setItem(STONE, String(value)); } catch { /* private mode: lasts this visit */ } }

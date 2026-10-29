// When the word is said after blending: after a short countdown (the child's turn first), or only when the speaker is
// tapped (a grown-up listening, or a child who wants to check). Saved on the device.
export type Reveal = 'pause' | 'tap';
const KEY = 'phonics_reveal';
export function readReveal(): Reveal { try { return localStorage.getItem(KEY) === 'tap' ? 'tap' : 'pause'; } catch { return 'pause'; } }
export function saveReveal(value: Reveal) { try { localStorage.setItem(KEY, value); } catch { /* private mode: lasts this visit */ } }

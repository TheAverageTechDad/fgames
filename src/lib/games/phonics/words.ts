// Words in the order UK schools teach the sounds (docs/superpowers/specs/2026-10-29-phonics-game-design.md).
// A word is split into its sounds with `|` (`ch|i|ck`); a piece names its sound after a colon when its spelling has
// two (`th:dh|i|s`). A word only uses spellings taught in its own set or an earlier one (words.test.ts checks).
// ponytail: set 1 only for the first build; the other stones' sets join here in build step 3.
export const SETS = [['s', 'a', 't', 'p', 'i', 'n']];

// Spellings that share a sound file (c, k and ck all say /k/).
const SOUND_OF: Record<string, string> = { c: 'k', ck: 'k', ff: 'f', ll: 'l', ss: 's', zz: 'z' };

export type Piece = { spelling: string; sound: string };
export type Word = { text: string; set: number; pieces: Piece[]; emoji?: string };

const word = (split: string, set: number, emoji?: string): Word => {
  const pieces = split.split('|').map(part => { const [spelling, sound] = part.split(':'); return { spelling, sound: sound ?? SOUND_OF[spelling] ?? spelling }; });
  return { text: pieces.map(p => p.spelling).join(''), set, pieces, emoji };
};

export const WORDS: Word[] = [
  word('p|i|n', 1, '📌'), word('p|a|n', 1, '🍳'), word('t|a|p', 1, '🚰'), word('t|i|n', 1, '🥫'),
  word('n|a|p', 1, '😴'), word('s|i|p', 1, '🥤'), word('s|i|t', 1, '🪑'), word('p|i|t', 1, '🕳️'),
  word('s|a|t', 1), word('p|a|t', 1), word('s|a|p', 1), word('t|i|p', 1), word('n|i|p', 1), word('t|a|n', 1),
  word('a|t', 1), word('a|n', 1), word('i|n', 1), word('i|t', 1)
];

// Real words that turn up in phonics lists and must never be shown.
export const BANNED = ['tit', 'tits', 'git', 'nob', 'fag', 'fanny', 'cock', 'dick', 'prick', 'piss', 'shit'];

// A round: `size` words from the set, shuffled with no repeats.
export function round(set: number, size = 8, random = Math.random) {
  const pool = WORDS.filter(w => w.set === set);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, size);
}

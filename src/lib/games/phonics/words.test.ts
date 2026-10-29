import { describe, expect, it } from 'vitest';
import { isOpen } from './settings';
import { BANNED, choices, round, SETS, WORDS } from './words';

const files = import.meta.glob(['../../../../static/phonics/audio/*/*.m4a', '../../../../static/phonics/pictures/*.webp']);
const has = (path: string) => `../../../../static/phonics/${path}` in files;

describe('phonics words', () => {
  it('only use spellings taught by their set, never a banned word, and have every audio file', () => {
    for (const w of WORDS) {
      const taught = SETS.slice(0, w.set).flat();
      for (const p of w.pieces) {
        expect(taught, `${w.text}: "${p.spelling}" is not taught by set ${w.set}`).toContain(p.spelling);
        expect(has(`audio/sounds/${p.sound}.m4a`), `sound ${p.sound}`).toBe(true);
      }
      expect(BANNED).not.toContain(w.text);
      if (w.picture) expect(has(`pictures/${w.text}.webp`), `picture ${w.text}`).toBe(true);
      expect(has(`audio/words/${w.text}.m4a`), `word ${w.text}`).toBe(true);
    }
    expect(new Set(WORDS.map(w => w.text)).size).toBe(WORDS.length);
    expect(has('pictures/star.webp')).toBe(true);
  });

  it('deals a round of distinct words from one set', () => {
    const r = round(1);
    expect(r).toHaveLength(8);
    expect(new Set(r.map(w => w.text)).size).toBe(8);
  });

  it('opens a stone once the one before it has a finished round, or when every stone is opened', () => {
    const p = { rounds: [1, 0, 0, 0], open: false };
    expect([1, 2, 3, 4].map(n => isOpen(p, n))).toEqual([true, true, false, false]);
    expect(isOpen({ ...p, open: true }, 4)).toBe(true);
  });

  it('gives every word two taught look-alikes to pick between, never more than 2 sounds apart', () => {
    for (const w of WORDS) {
      // A copy, as the game passes a reactive proxy rather than the list's own object.
      const c = choices({ ...w });
      expect(c).toHaveLength(3);
      expect(new Set(c.map(o => o.text)).size).toBe(3);
      expect(c.map(o => o.text)).toContain(w.text);
      for (const o of c) expect(o.set <= w.set && o.pieces.length === w.pieces.length, `${w.text}: ${o.text}`).toBe(true);
      const apart = c.filter(o => o.text !== w.text).map(o => o.pieces.filter((p, i) => p.spelling !== w.pieces[i].spelling).length);
      expect(Math.max(...apart), `${w.text}: ${c.map(o => o.text)}`).toBeLessThanOrEqual(2);
    }
  });
});

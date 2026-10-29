import { describe, expect, it } from 'vitest';
import { BANNED, round, SETS, WORDS } from './words';

const audio = import.meta.glob('../../../../static/phonics/audio/*/*.m4a');
const has = (path: string) => `../../../../static/phonics/audio/${path}.m4a` in audio;

describe('phonics words', () => {
  it('only use spellings taught by their set, never a banned word, and have every audio file', () => {
    for (const w of WORDS) {
      const taught = SETS.slice(0, w.set).flat();
      for (const p of w.pieces) {
        expect(taught, `${w.text}: "${p.spelling}" is not taught by set ${w.set}`).toContain(p.spelling);
        expect(has(`sounds/${p.sound}`), `sound ${p.sound}`).toBe(true);
      }
      expect(BANNED).not.toContain(w.text);
      expect(has(`words/${w.text}`), `word ${w.text}`).toBe(true);
    }
    expect(new Set(WORDS.map(w => w.text)).size).toBe(WORDS.length);
  });

  it('deals a round of distinct words from one set', () => {
    const r = round(1);
    expect(r).toHaveLength(8);
    expect(new Set(r.map(w => w.text)).size).toBe(8);
  });
});

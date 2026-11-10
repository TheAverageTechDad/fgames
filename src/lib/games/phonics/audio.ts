import { wake } from '#lib/audio-wake.js';
import { sound } from '#lib/sound';
import type { Word } from './words';

// Sounds and words play from decoded buffers so each one starts the instant its letters light. A new clip fades the
// last one out over ~40 ms, so a quick drag runs the sounds together. Follows the arcade's mute switch.
// Placeholder audio for now: the first stone's sounds are one Gemini take, the words the Mac's British voice.
const PRAISE = ['excellent', 'wonderful', 'brilliant'].map(name => `/catcha/assets/audio/dad-${name}.m4a`);
const CHIME = [523.25, 659.25, 783.99];

export function createPhonicsAudio() {
  // Decoded buffers outlive the context, so one iOS gave up on is simply replaced (see audio-wake).
  let ctx = new AudioContext();
  const revive = () => wake(ctx, () => { ctx = new AudioContext(); });
  const buffers = new Map<string, AudioBuffer>();
  let current: { source: AudioBufferSourceNode; gain: GainNode } | null = null;

  async function load(url: string) {
    if (buffers.has(url)) return;
    try { buffers.set(url, await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer())); } catch { /* a missing clip stays silent */ }
  }
  function play(url: string, level = 1) {
    revive();
    const buffer = buffers.get(url);
    if (sound.muted || !buffer) return 0;
    const t = ctx.currentTime;
    if (current) { current.gain.gain.setTargetAtTime(0, t, 0.012); current.source.stop(t + 0.06); }
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = buffer; gain.gain.value = level;
    source.connect(gain).connect(ctx.destination); source.start(t);
    current = { source, gain };
    return buffer.duration;
  }
  const soundUrl = (id: string) => `/phonics/audio/sounds/${id}.m4a`, wordUrl = (text: string) => `/phonics/audio/words/${text}.m4a`;

  return {
    // iOS only starts audio from a touch: resume on the first press anywhere.
    unlock: revive,
    preload: (words: Word[]) => Promise.all([...new Set(words.flatMap(w => [wordUrl(w.text), ...w.pieces.map(p => soundUrl(p.sound))])), ...PRAISE].map(load)),
    sound: (id: string) => play(soundUrl(id)),
    // Seconds until the word has been said (0 when muted or missing).
    word: (text: string) => play(wordUrl(text)),
    praise: () => play(PRAISE[Math.floor(Math.random() * PRAISE.length)], 0.9),
    // A soft rising chime after a word is read: three sine notes, quiet under everything.
    chime() {
      if (sound.muted) return;
      const t = ctx.currentTime;
      CHIME.forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), at = t + i * 0.07;
        o.frequency.value = f; g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.06, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
        o.connect(g).connect(ctx.destination); o.start(at); o.stop(at + 0.4);
      });
    },
    close: () => void ctx.close()
  };
}

export type PhonicsAudio = ReturnType<typeof createPhonicsAudio>;

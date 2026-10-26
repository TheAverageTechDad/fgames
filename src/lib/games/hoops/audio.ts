import { haptic, type HapticPattern } from '#lib/haptics';
import { sound } from '#lib/sound';
import { FAMILY, onAsphalt } from './court';
import type { GameEvent } from './game';

// Sound design as in Pocket Farm: every effect is synthesized (a short transient for the hit, a tonal body),
// varies a little so repeats never sound copied, and scales with how hard the ball hit. Effects pan with the ball.
// Mute and vibration follow the arcade-wide preferences (`fgames_muted`, `fgames_haptics`).
export function createHoopsAudio() {
  let ctx: AudioContext | null = null, closed = false, sfx: GainNode, reverb: GainNode;
  function build(c: AudioContext) {
    const compressor = c.createDynamicsCompressor();
    compressor.threshold.value = -20; compressor.knee.value = 10; compressor.ratio.value = 3; compressor.attack.value = 0.005; compressor.release.value = 0.2;
    compressor.connect(c.destination);
    const soften = c.createBiquadFilter(); soften.type = 'lowpass'; soften.frequency.value = 7500; soften.connect(compressor);
    sfx = c.createGain(); sfx.gain.value = 0.7; sfx.connect(soften);
    // Outdoors: a short, dark slap rather than a room.
    const length = c.sampleRate * 0.5, ir = c.createBuffer(2, length, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 5; }
    const convolver = c.createConvolver(), dark = c.createBiquadFilter(); convolver.buffer = ir; dark.type = 'lowpass'; dark.frequency.value = 3000;
    reverb = c.createGain(); reverb.gain.value = 0.18; reverb.connect(convolver); convolver.connect(dark); dark.connect(compressor);
  }
  const unlock = () => {
    if (closed) return;
    try {
      if (!ctx) { ctx = new AudioContext(); build(ctx); }
      if (ctx.state === 'suspended' && !document.hidden) void ctx.resume().catch(() => {});
    } catch { /* the game plays fine silent */ }
  };
  const visibility = () => { if (!ctx) return; if (document.hidden) void ctx.suspend().catch(() => {}); else void ctx.resume().catch(() => {}); };
  // Started on the finger lifting (still a user gesture on iOS), so building it never stalls the touch that begins a drag.
  window.addEventListener('pointerup', unlock); window.addEventListener('keydown', unlock);
  document.addEventListener('visibilitychange', visibility);

  const vary = (amount = 0.04) => 1 + (Math.random() * 2 - 1) * amount;
  const panAt = (x: number) => Math.max(-0.7, Math.min(0.7, x / 6));
  function out(node: AudioNode, pan: number, wet: number, nodes: AudioNode[]) {
    const c = ctx!, p = c.createStereoPanner(); p.pan.value = pan; node.connect(p); p.connect(sfx); nodes.push(p);
    if (wet) { const send = c.createGain(); send.gain.value = wet; p.connect(send); send.connect(reverb); nodes.push(send); }
  }
  function tone(freq: number, { at = 0, type = 'sine' as OscillatorType, attack = 0.003, decay = 0.12, gain = 0.1, glide = 1, wet = 0.15, pan = 0 } = {}) {
    const c = ctx!, t = c.currentTime + at, o = c.createOscillator(), g = c.createGain(), nodes: AudioNode[] = [o, g];
    o.type = type; o.frequency.setValueAtTime(freq, t); if (glide !== 1) o.frequency.exponentialRampToValueAtTime(freq * glide, t + decay * 0.7);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.connect(g); out(g, pan, wet, nodes);
    o.start(t); o.stop(t + attack + decay + 0.05); o.onended = () => nodes.forEach(n => n.disconnect());
  }
  function noise(duration: number, { at = 0, type = 'bandpass' as BiquadFilterType, freq = 2000, q = 1, gain = 0.08, sweep = 1, wet = 0.1, pan = 0 } = {}) {
    const c = ctx!, t = c.currentTime + at, buffer = c.createBuffer(1, Math.ceil(c.sampleRate * duration), c.sampleRate), d = buffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.min(1, i / (c.sampleRate * 0.002)) * (1 - i / d.length) ** 2;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), nodes: AudioNode[] = [s, f, g];
    s.buffer = buffer; f.type = type; f.frequency.setValueAtTime(freq, t); if (sweep !== 1) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + duration); f.Q.value = q; g.gain.value = gain;
    s.connect(f); f.connect(g); out(g, pan, wet, nodes); s.start(t); s.onended = () => nodes.forEach(n => n.disconnect());
  }
  /** The ball on the ground: a round low thunk with a little rubbery pop; duller and quieter on grass. */
  function bounce(strength: number, pan: number, grass: boolean) {
    const k = Math.min(1, 0.25 + strength), f = (grass ? 95 : 125) * vary();
    tone(f, { gain: 0.22 * k, decay: grass ? 0.07 : 0.09, glide: 0.75, wet: 0.05, pan });
    noise(0.03, { type: grass ? 'lowpass' : 'bandpass', freq: grass ? 500 : 1100 * vary(0.1), q: 0.9, gain: 0.07 * k, pan });
  }
  const famPan = panAt(FAMILY[0].x);
  const RECIPES: Partial<Record<GameEvent['type'], (e: GameEvent & { speed?: number }) => void>> = {
    // Tap, tap, tap: the dribble, soft and steady.
    dribble: e => bounce(0.35, panAt(e.at.x), false),
    floor: e => bounce((e.speed ?? 4) / 8, panAt(e.at.x), !onAsphalt(e.at)),
    // The backboard: a hollow wooden thwack with a short rattle in the frame.
    board: e => {
      const k = Math.min(1, 0.3 + (e.speed ?? 4) / 9), pan = panAt(e.at.x);
      noise(0.05, { type: 'lowpass', freq: 1400, gain: 0.14 * k, pan });
      tone(205 * vary(), { gain: 0.16 * k, decay: 0.1, glide: 0.85, pan });
      noise(0.16, { freq: 420, q: 5, gain: 0.05 * k, wet: 0.2, pan });
    },
    // The rim: a bright metal ting with inharmonic partials; a soft touch is just a tick.
    rim: e => {
      const k = Math.min(1, 0.2 + (e.speed ?? 4) / 7), f = 560 * vary(0.02), pan = panAt(e.at.x);
      noise(0.012, { type: 'highpass', freq: 3200, gain: 0.08 * k, pan });
      tone(f, { gain: 0.09 * k, decay: 0.45 * k + 0.1, wet: 0.35, pan });
      tone(f * 2.76, { gain: 0.05 * k, decay: 0.28 * k + 0.05, wet: 0.35, pan });
      tone(f * 5.4, { gain: 0.025 * k, decay: 0.14, wet: 0.35, pan });
    },
    pole: e => { const pan = panAt(e.at.x); tone(180 * vary(), { gain: 0.1, decay: 0.3, wet: 0.3, pan }); tone(471, { gain: 0.04, decay: 0.2, wet: 0.3, pan }); },
    fence: e => { for (let i = 0; i < 5; i++) noise(0.025, { at: i * 0.03 * vary(0.3), type: 'highpass', freq: 2600, gain: 0.05 * (1 - i / 6), pan: panAt(e.at.x) }); },
    // Someone in the family gets hit: a soft "oof".
    fan: e => { tone(270 * vary(), { type: 'triangle', gain: 0.06, decay: 0.14, glide: 0.65, pan: panAt(e.at.x) }); noise(0.05, { type: 'lowpass', freq: 600, gain: 0.05, pan: panAt(e.at.x) }); },
    // Through the net: a soft swish, then a small chime (three notes for two points).
    score: e => {
      const pan = panAt(e.at.x);
      noise(0.35, { freq: 5200, q: 0.7, gain: 0.07, sweep: 0.35, wet: 0.2, pan });
      noise(0.22, { at: 0.08, freq: 3000, q: 0.8, gain: 0.03, sweep: 0.5, wet: 0.2, pan });
    },
    shot: e => noise(0.14, { freq: 600, q: 1.2, gain: 0.035, sweep: 3, pan: panAt(e.at.x) }),
    // Gathering the ball: a palm slap.
    pickup: e => { noise(0.03, { freq: 1800, q: 1, gain: 0.07, pan: panAt(e.at.x) }); bounce(0.2, panAt(e.at.x), false); },
    dash: () => { noise(0.22, { freq: 500, sweep: 4.8, q: 1.4, gain: 0.05 }); tone(220, { type: 'triangle', glide: 2, decay: 0.12, gain: 0.025 }); },
    skid: () => noise(0.18, { freq: 1800, sweep: 0.4, q: 2, gain: 0.04 }),
    jump: () => { tone(260, { type: 'triangle', glide: 2.8, decay: 0.16, gain: 0.05, wet: 0.15 }); noise(0.12, { freq: 700, sweep: 2.9, q: 1.2, gain: 0.03 }); },
    // Out of puff: Catcha's soft, breathy double huff.
    tired: () => { noise(0.22, { freq: 900, sweep: 0.67, q: 0.8, gain: 0.12 }); noise(0.26, { at: 0.32, freq: 800, sweep: 0.65, q: 0.8, gain: 0.1 }); }
  };
  // Tiny vibrations on Android (and iOS where it allows): light for touches, a fuller buzz for a basket.
  const BUZZ: Partial<Record<GameEvent['type'], HapticPattern>> = { dribble: 'tick', pickup: 'tick', shot: 'bump', rim: 'bump', board: 'tick', dash: 'bump', jump: 'tick', tired: 'sad' };
  const live = () => !sound.muted && ctx?.state === 'running';
  return {
    play(e: GameEvent) {
      if (!document.hidden) {
        const buzz = e.type === 'score' ? 'combo' : BUZZ[e.type];
        if (buzz) haptic(buzz);
      }
      if (live()) RECIPES[e.type]?.(e as GameEvent & { speed?: number });
    },
    /** The basket's reward chime, then the family's claps and a "yay" (bigger for two points). */
    cheer(value: 1 | 2) {
      if (!document.hidden && value === 2) haptic('celebrate');
      if (!live()) return;
      const notes = value === 2 ? [784, 988, 1319] : [784, 1047];
      notes.forEach((f, i) => { tone(f, { at: 0.12 + i * 0.07, gain: 0.04, decay: 0.6, wet: 0.5 }); tone(f * 2.01, { at: 0.12 + i * 0.07, gain: 0.012, decay: 0.3, wet: 0.5 }); });
      for (let i = 0; i < (value === 2 ? 12 : 8); i++) noise(0.022, { at: 0.2 + Math.random() * 0.8, freq: 1400 * vary(0.2), q: 0.9, gain: 0.05, wet: 0.2, pan: famPan + (Math.random() - 0.5) * 0.3 });
      tone(520, { at: 0.25, type: 'triangle', gain: 0.025, decay: 0.3, glide: 1.5, wet: 0.3, pan: famPan });
      tone(760, { at: 0.32, type: 'triangle', gain: 0.02, decay: 0.25, glide: 1.4, wet: 0.3, pan: famPan + 0.2 });
    },
    /** A near miss: the family's soft "aww". */
    aww() {
      if (!live()) return;
      tone(440, { type: 'triangle', gain: 0.025, decay: 0.35, glide: 0.82, wet: 0.3, pan: famPan });
      tone(370, { at: 0.05, type: 'triangle', gain: 0.02, decay: 0.45, glide: 0.85, wet: 0.3, pan: famPan + 0.15 });
    },
    /** Dad landing from a jump: a soft pat. */
    land() {
      if (!document.hidden) haptic('tick');
      if (live()) { tone(120, { glide: 0.6, decay: 0.12, gain: 0.07 }); noise(0.06, { type: 'lowpass', freq: 450, gain: 0.04 }); }
    },
    destroy() {
      closed = true;
      window.removeEventListener('pointerup', unlock); window.removeEventListener('keydown', unlock); document.removeEventListener('visibilitychange', visibility);
      void ctx?.close().catch(() => {});
    }
  };
}

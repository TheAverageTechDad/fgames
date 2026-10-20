import { haptic, type HapticPattern } from '#lib/haptics';
import type { FarmEvent, FarmState } from './model';

// Sound design: each effect pairs a short transient (the "hit") with a clean tonal ring, varies a little
// in pitch and timing so repeats never sound copied, and sends a touch of soft reverb for warmth.
// Repeated actions climb a pentatonic ladder, so planting a row or a run of sales plays a little melody.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const note = (root: number, step: number) => root * 2 ** (SCALE[Math.min(step, SCALE.length - 1)] / 12);
const MUSIC_URL = '/farm/audio/music.m4a';
const MUSIC_LEVEL = 0.16, CROSSFADE = 4;

export function createFarmAudio(state: FarmState) {
  let ctx: AudioContext | null = null, closed = false, master: GainNode, sfx: GainNode, music: GainNode, reverb: GainNode;
  let track: AudioBuffer | null = null, musicTimer = 0, paused = false;
  const ladders = new Map<string, { step: number; at: number }>(), last = new Map<string, number>();
  function build(c: AudioContext) {
    const compressor = c.createDynamicsCompressor();
    compressor.threshold.value = -22; compressor.knee.value = 12; compressor.ratio.value = 2.5; compressor.attack.value = 0.01; compressor.release.value = 0.25;
    master = c.createGain(); master.gain.value = state.muted ? 0 : 1; master.connect(compressor); compressor.connect(c.destination);
    // Effects sit well under the music: subtle but felt. A gentle low-pass takes the edge off every transient.
    const soften = c.createBiquadFilter(); soften.type = 'lowpass'; soften.frequency.value = 5200; soften.Q.value = 0.5; soften.connect(master);
    sfx = c.createGain(); sfx.gain.value = 0.5; sfx.connect(soften);
    music = c.createGain(); music.gain.value = 0; music.connect(master);
    // A small generated room: decaying stereo noise, darkened, so chimes bloom without echoing.
    const length = c.sampleRate * 1.6, ir = c.createBuffer(2, length, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3.2; }
    const convolver = c.createConvolver(), tone = c.createBiquadFilter(); convolver.buffer = ir; tone.type = 'lowpass'; tone.frequency.value = 3800;
    reverb = c.createGain(); reverb.gain.value = 0.28; reverb.connect(convolver); convolver.connect(tone); tone.connect(master);
  }
  const unlock = () => {
    if (closed) return;
    try {
      if (!ctx) { ctx = new AudioContext(); build(ctx); void loadMusic(); }
      if (ctx.state === 'suspended' && !document.hidden) void ctx.resume().catch(() => {});
    } catch { /* visual feedback remains available */ }
  };
  async function loadMusic() {
    try {
      const response = await fetch(MUSIC_URL);
      if (!response.ok || !ctx || closed) return;
      track = await ctx.decodeAudioData(await response.arrayBuffer());
      if (!closed) playMusic(ctx.currentTime + 0.1);
    } catch { /* the farm plays fine without music */ }
  }
  // Each pass of the track fades in over the tail of the last, so the loop never jumps.
  function playMusic(at: number) {
    if (!ctx || !track || closed) return;
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = track; source.connect(gain); gain.connect(music);
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(1, at + CROSSFADE);
    const end = at + track.duration;
    gain.gain.setValueAtTime(1, end - CROSSFADE); gain.gain.linearRampToValueAtTime(0, end);
    source.start(at); source.stop(end + 0.05); source.onended = () => { source.disconnect(); gain.disconnect(); };
    musicTimer = window.setTimeout(() => playMusic(end - CROSSFADE), Math.max(0, (end - CROSSFADE - ctx.currentTime - 1) * 1000));
    level();
  }
  function level() {
    if (!ctx) return;
    const now = ctx.currentTime;
    master.gain.setTargetAtTime(state.muted ? 0 : 1, now, 0.05);
    music.gain.setTargetAtTime(state.music ? MUSIC_LEVEL * (paused ? 0.45 : 1) : 0, now, 0.4);
  }
  const visibility = () => { if (!ctx) return; if (document.hidden) void ctx.suspend().catch(() => {}); else void ctx.resume().catch(() => {}); };
  window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
  document.addEventListener('visibilitychange', visibility);

  const vary = (amount = 0.03) => 1 + (Math.random() * 2 - 1) * amount;
  function tone(freq: number, { at = 0, type = 'sine' as OscillatorType, attack = 0.012, decay = 0.25, gain = 0.1, glide = 1, wet = 0.3, pan = 0 } = {}) {
    const c = ctx!, t = c.currentTime + at, o = c.createOscillator(), g = c.createGain(), p = c.createStereoPanner();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (glide !== 1) o.frequency.exponentialRampToValueAtTime(freq * glide, t + decay * 0.6);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    p.pan.value = pan; o.connect(g); g.connect(p); p.connect(sfx);
    const nodes: AudioNode[] = [o, g, p];
    if (wet) { const send = c.createGain(); send.gain.value = wet; p.connect(send); send.connect(reverb); nodes.push(send); }
    o.start(t); o.stop(t + attack + decay + 0.05); o.onended = () => nodes.forEach(n => n.disconnect());
  }
  function noise(duration: number, { at = 0, type = 'bandpass' as BiquadFilterType, freq = 2000, q = 1, gain = 0.08, sweep = 1 } = {}) {
    const c = ctx!, t = c.currentTime + at, buffer = c.createBuffer(1, Math.ceil(c.sampleRate * duration), c.sampleRate), d = buffer.getChannelData(0);
    // A short fade-in on every burst so noise never clicks.
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.min(1, i / (c.sampleRate * 0.004)) * (1 - i / d.length) ** 2;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buffer; f.type = type; f.frequency.setValueAtTime(freq, t); if (sweep !== 1) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + duration); f.Q.value = q; g.gain.value = gain;
    s.connect(f); f.connect(g); g.connect(sfx); s.start(t); s.onended = () => { s.disconnect(); f.disconnect(); g.disconnect(); };
  }
  // A plucked string (Karplus–Strong): woody and organic, the core of picking a crop.
  function pluck(freq: number, { at = 0, gain = 0.16, decay = 0.996 } = {}) {
    const c = ctx!, period = Math.round(c.sampleRate / freq), buffer = c.createBuffer(1, Math.ceil(c.sampleRate * 0.5), c.sampleRate), d = buffer.getChannelData(0);
    for (let i = 0; i < period; i++) d[i] = Math.random() * 2 - 1;
    for (let i = period; i < d.length; i++) d[i] = (d[i - period] + d[i - period + 1]) * 0.5 * decay;
    const s = c.createBufferSource(), g = c.createGain(), send = c.createGain();
    s.buffer = buffer; g.gain.value = gain; send.gain.value = 0.25; s.connect(g); g.connect(sfx); g.connect(send); send.connect(reverb);
    s.start(c.currentTime + at); s.onended = () => { s.disconnect(); g.disconnect(); send.disconnect(); };
  }
  // A small bell: a fundamental with gently inharmonic partials and a long, soft tail.
  function bell(freq: number, { at = 0, gain = 0.07, decay = 1.1 } = {}) {
    tone(freq, { at, gain, decay, wet: 0.55 });
    tone(freq * 2.01, { at, gain: gain * 0.35, decay: decay * 0.6, wet: 0.55 });
    tone(freq * 3.03, { at, gain: gain * 0.12, decay: decay * 0.35, wet: 0.55 });
  }
  function coin(freq: number, at = 0, gain = 0.05) {
    noise(0.012, { at, type: 'bandpass', freq: 4500, gain: gain * 0.35 });
    tone(freq, { at, gain, decay: 0.16, wet: 0.2 });
    tone(freq * 1.47, { at, gain: gain * 0.6, decay: 0.11, wet: 0.2 });
  }
  function ladder(kind: string, gap = 1.4) {
    const now = performance.now(), l = ladders.get(kind);
    const step = l && now - l.at < gap * 1000 ? l.step + 1 : 0;
    ladders.set(kind, { step, at: now }); return step;
  }
  function spaced(kind: string, ms: number) {
    const now = performance.now();
    if (now - (last.get(kind) ?? 0) < ms) return false;
    last.set(kind, now); return true;
  }
  const RECIPES: Partial<Record<FarmEvent['type'], (e: FarmEvent) => void>> = {
    // Seed bags: a soft papery rustle.
    seed: () => { if (spaced('seed', 250)) { noise(0.08, { freq: 2600, q: 0.7, gain: 0.035 }); noise(0.07, { at: 0.06, freq: 2000, q: 0.7, gain: 0.025 }); } },
    // Planting: a muffled pat of soil and a quiet marimba note that climbs along the row.
    plant: () => {
      const step = ladder('plant');
      noise(0.07, { type: 'lowpass', freq: 380, gain: 0.05 });
      tone(note(392, step), { at: 0.02, gain: 0.035, decay: 0.3, wet: 0.4 });
    },
    // Harvest: a soft pop and a plucked note on the ladder.
    harvest: () => {
      const step = ladder('harvest');
      tone(380 * vary(), { gain: 0.035, decay: 0.06, glide: 2.2, wet: 0.1 });
      noise(0.05, { freq: 1500, q: 1.2, gain: 0.02, sweep: 1.6 });
      pluck(note(523.25, step) * vary(0.005), { at: 0.02, gain: 0.07 });
      tone(note(1046.5, step), { at: 0.04, gain: 0.01, decay: 0.4, wet: 0.6 });
    },
    // Unloading: a light wooden knock and a short, soft tumble into the crates.
    delivery: e => {
      noise(0.09, { type: 'lowpass', freq: 600, gain: 0.05 });
      for (let i = 0; i < Math.min(4, e.amount); i++) noise(0.03, { at: 0.08 + i * 0.07 * vary(0.2), freq: 800 + i * 100, q: 1.5, gain: 0.018 });
    },
    // Items sold: a small coin, no more than a few a second, climbing as the shelf empties.
    sale: () => { if (spaced('sale', 150)) coin(note(1318.5, ladder('sale', 2) % 6) * vary(0.01), 0.1, 0.018); },
    // A happy shopper: the register's warm two-bell ka-ching, the one sound allowed to bloom.
    served: () => {
      bell(1046.5 * vary(0.005), { gain: 0.034 }); bell(1318.5 * vary(0.005), { at: 0.08, gain: 0.03 });
      coin(2637, 0.02, 0.012);
    },
    // Banking the pile: a short trickle of coins into a soft chord.
    cash: e => {
      const n = Math.min(6, 2 + Math.ceil(e.amount / 12));
      for (let i = 0; i < n; i++) coin(note(1318.5, i % 6) * vary(0.01), i * 0.06, 0.02);
      for (const [i, f] of [523.25, 659.25, 783.99].entries()) bell(f, { at: n * 0.06 + i * 0.03, gain: 0.018, decay: 1.4 });
    },
    // A shopper leaving empty-handed: a gentle falling sigh, never harsh.
    unhappy: () => { tone(392, { type: 'triangle', gain: 0.03, decay: 0.25, glide: 0.9, wet: 0.3 }); tone(311, { at: 0.18, type: 'triangle', gain: 0.03, decay: 0.4, glide: 0.85, wet: 0.3 }); },
    // Buying: a rising whoosh into a bright arpeggio.
    purchase: () => {
      noise(0.5, { type: 'bandpass', freq: 400, q: 0.7, gain: 0.035, sweep: 6 });
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => bell(f, { at: 0.35 + i * 0.08, gain: 0.03, decay: 1.3 }));
    },
    goal: () => { [783.99, 987.77, 1174.66, 1567.98].forEach((f, i) => bell(f, { at: i * 0.1, gain: 0.03, decay: 1.5 })); coin(3136, 0.4, 0.015); },
    // Eggs: a soft wooden tock with a little rise.
    egg: () => { const step = ladder('egg'); tone(note(587.33, step), { gain: 0.035, decay: 0.16, wet: 0.3 }); noise(0.025, { freq: 1300, q: 2, gain: 0.02 }); },
    upgrade: () => { noise(0.3, { freq: 600, q: 0.8, gain: 0.03, sweep: 4 }); [659.25, 880, 1318.5].forEach((f, i) => bell(f, { at: 0.2 + i * 0.09, gain: 0.03 })); }
  };
  return {
    play(event: FarmEvent) {
      // Shared Catcha haptics: Vibration API on Android, the switch fallback on iOS Safari.
      const pattern: Partial<Record<FarmEvent['type'], HapticPattern>> = { harvest: 'tick', cash: 'land', purchase: 'celebrate', upgrade: 'celebrate', goal: 'celebrate', unhappy: 'sad' };
      if (state.haptics && !document.hidden && pattern[event.type]) haptic(pattern[event.type]);
      if (state.muted || !ctx || ctx.state !== 'running') return;
      RECIPES[event.type]?.(event);
    },
    /** Call after the mute or music preference changes, and on pause. */
    refresh(isPaused = paused) { paused = isPaused; level(); },
    destroy() {
      closed = true; clearTimeout(musicTimer);
      window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); document.removeEventListener('visibilitychange', visibility);
      void ctx?.close().catch(() => {});
    }
  };
}

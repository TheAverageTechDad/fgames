import { haptic, type HapticPattern } from '#lib/haptics';
import { sound } from '#lib/sound';
import { FAMILY, onAsphalt } from './court';
import type { GameEvent } from './game';

// Recorded sounds from Pixabay (free to use, no credit needed), trimmed to the hit and compressed: about 130 KB in
// `static/hoops/audio`, precached for offline play. Each plays with a little pitch and level variation, pans with the
// ball and scales with how hard it hit. Until a file has loaded (or if one fails), the synthesized version plays instead.
// Mute and vibration follow the arcade-wide preferences (`fgames_muted`, `fgames_haptics`).
const MUSIC_URL = '/hoops/audio/music.m4a', MUSIC_KEY = 'hoops_music', MUSIC_LEVEL = 0.16, CROSSFADE = 4;
const readMusic = () => { try { return localStorage.getItem(MUSIC_KEY) !== 'false'; } catch { return true; } };
// Dad's praise for a streak: Catcha's own recordings, shared from its folder.
const VOICES = { excellent: '/catcha/assets/audio/dad-excellent.m4a', wonderful: '/catcha/assets/audio/dad-wonderful.m4a', brilliant: '/catcha/assets/audio/dad-brilliant.m4a' };
const SAMPLES = ['excellent', 'wonderful', 'brilliant', 'bounce-1', 'bounce-2', 'backboard', 'rim-1', 'rim-2', 'swish', 'catch', 'fence', 'pole', 'skid', 'whoosh', 'claps', 'cheer', 'aww', 'huff'] as const;
// The family's voices when they're booped (bumped into, or hit by the ball): the toddler's "ga-ga" and laughs are
// Catcha's recordings. Add Mom's and the big sister's files to their lists as they're recorded (they play as soon as
// they're listed); until then each gets a synthesized squeak or "oh".
const CATCHA = (name: string) => `/catcha/assets/audio/${name}.m4a`;
type Who = (typeof FAMILY)[number]['who'];
const FAMILY_VOICES: Record<Who, Record<'bump' | 'hit', string[]>> = {
  toddler: { bump: ['gaga-1', 'gaga-2'].map(CATCHA), hit: [1, 2, 3, 4].map(i => CATCHA(`baby-laugh-${i}`)) },
  girl: { bump: [], hit: [] },
  mom: { bump: [], hit: [] }
};

export function createHoopsAudio() {
  let ctx: AudioContext | null = null, closed = false, sfx: GainNode, crowd: GainNode, music: GainNode, reverb: GainNode;
  let track: AudioBuffer | null = null, musicTimer = 0, paused = false, musicOn = readMusic();
  // Keyed by sample name, or by URL for the family's voices.
  const buffers = new Map<string, AudioBuffer>();
  let voiceAt = -99;
  function build(c: AudioContext) {
    const compressor = c.createDynamicsCompressor();
    compressor.threshold.value = -20; compressor.knee.value = 10; compressor.ratio.value = 3; compressor.attack.value = 0.005; compressor.release.value = 0.2;
    compressor.connect(c.destination);
    // Effects sit well under everything (the fourth playtest found them distracting): low and softened, as in the farm.
    // The family's cheer is the one sound that stays up, on its own bus; the music sits under it all.
    const soften = c.createBiquadFilter(); soften.type = 'lowpass'; soften.frequency.value = 5200; soften.connect(compressor);
    sfx = c.createGain(); sfx.gain.value = 0.28; sfx.connect(soften);
    crowd = c.createGain(); crowd.gain.value = 0.7; crowd.connect(soften);
    music = c.createGain(); music.gain.value = 0; music.connect(compressor);
    // Outdoors: a short, dark slap rather than a room.
    const length = c.sampleRate * 0.5, ir = c.createBuffer(2, length, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 5; }
    const convolver = c.createConvolver(), dark = c.createBiquadFilter(); convolver.buffer = ir; dark.type = 'lowpass'; dark.frequency.value = 3000;
    reverb = c.createGain(); reverb.gain.value = 0.18; reverb.connect(convolver); convolver.connect(dark); dark.connect(compressor);
  }
  const unlock = () => {
    if (closed) return;
    try {
      if (!ctx) {
        const c = ctx = new AudioContext(); build(c);
        void loadMusic(c);
        const files = [...SAMPLES.map(name => [name, name in VOICES ? VOICES[name as keyof typeof VOICES] : `/hoops/audio/${name}.m4a`]), ...Object.values(FAMILY_VOICES).flatMap(v => [...v.bump, ...v.hit]).map(url => [url, url])];
        for (const [name, url] of files) void fetch(url).then(r => r.ok ? r.arrayBuffer() : Promise.reject()).then(b => c.decodeAudioData(b)).then(buffer => { if (!closed) buffers.set(name, buffer); }).catch(() => { /* the synthesized sound stays */ });
      }
      if (ctx.state === 'suspended' && !document.hidden) void ctx.resume().catch(() => {});
    } catch { /* the game plays fine silent */ }
  };
  async function loadMusic(c: AudioContext) {
    try {
      const response = await fetch(MUSIC_URL);
      if (!response.ok || closed) return;
      track = await c.decodeAudioData(await response.arrayBuffer());
      if (!closed) playMusic(c.currentTime + 0.1);
    } catch { /* the game plays fine without music */ }
  }
  // As in the farm: each pass of the track fades in over the tail of the last, so the loop never jumps.
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
    music.gain.setTargetAtTime(sound.muted || !musicOn ? 0 : MUSIC_LEVEL * (paused ? 0.45 : 1), ctx.currentTime, 0.3);
  }
  const visibility = () => { if (!ctx) return; if (document.hidden) void ctx.suspend().catch(() => {}); else void ctx.resume().catch(() => {}); };
  // Started on the finger lifting (still a user gesture on iOS), so building it never stalls the touch that begins a drag.
  window.addEventListener('pointerup', unlock); window.addEventListener('keydown', unlock);
  document.addEventListener('visibilitychange', visibility);

  const vary = (amount = 0.04) => 1 + (Math.random() * 2 - 1) * amount;
  const panAt = (x: number) => Math.max(-0.7, Math.min(0.7, x / 6));
  function out(node: AudioNode, pan: number, wet: number, nodes: AudioNode[], bus = sfx) {
    const c = ctx!, p = c.createStereoPanner(); p.pan.value = pan; node.connect(p); p.connect(bus); nodes.push(p);
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
  /** Plays a recording if it has loaded; false (so the caller synthesizes instead) if not. */
  function sample(name: string, { gain = 0.5, pan = 0, rate = 1, at = 0, wet = 0.1, lowpass = 0, loud = false } = {}) {
    const buffer = buffers.get(name);
    if (!buffer) return false;
    const c = ctx!, s = c.createBufferSource(), g = c.createGain(), nodes: AudioNode[] = [s, g];
    s.buffer = buffer; s.playbackRate.value = rate * vary(0.04); g.gain.value = gain * vary(0.08);
    if (lowpass) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass; s.connect(f); f.connect(g); nodes.push(f); } else s.connect(g);
    out(g, pan, wet, nodes, loud ? crowd : sfx); s.start(c.currentTime + at); s.onended = () => nodes.forEach(n => n.disconnect());
    return true;
  }
  let flip = false;
  const either = (a: string, b: string) => (flip = !flip) ? a : b;
  /** The ball on the ground: a round low thunk with a little rubbery pop; duller and quieter on grass. */
  function bounce(strength: number, pan: number, grass: boolean) {
    const k = Math.min(1, 0.25 + strength), f = (grass ? 95 : 125) * vary();
    if (sample(either('bounce-1', 'bounce-2'), { gain: 0.75 * k, pan, rate: grass ? 0.85 : 1, lowpass: grass ? 900 : 0, wet: 0.05 })) return;
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
      if (sample('backboard', { gain: 0.7 * k, pan, wet: 0.15 })) return;
      noise(0.05, { type: 'lowpass', freq: 1400, gain: 0.14 * k, pan });
      tone(205 * vary(), { gain: 0.16 * k, decay: 0.1, glide: 0.85, pan });
      noise(0.16, { freq: 420, q: 5, gain: 0.05 * k, wet: 0.2, pan });
    },
    // The rim: a bright metal ting with inharmonic partials; a soft touch is just a tick.
    rim: e => {
      const k = Math.min(1, 0.2 + (e.speed ?? 4) / 7), f = 560 * vary(0.02), pan = panAt(e.at.x);
      if (sample(either('rim-1', 'rim-2'), { gain: 0.55 * k, pan, wet: 0.3 })) return;
      noise(0.012, { type: 'highpass', freq: 3200, gain: 0.08 * k, pan });
      tone(f, { gain: 0.09 * k, decay: 0.45 * k + 0.1, wet: 0.35, pan });
      tone(f * 2.76, { gain: 0.05 * k, decay: 0.28 * k + 0.05, wet: 0.35, pan });
      tone(f * 5.4, { gain: 0.025 * k, decay: 0.14, wet: 0.35, pan });
    },
    pole: e => { const pan = panAt(e.at.x); if (sample('pole', { gain: 0.2, pan, wet: 0.25 })) return; tone(180 * vary(), { gain: 0.1, decay: 0.3, wet: 0.3, pan }); tone(471, { gain: 0.04, decay: 0.2, wet: 0.3, pan }); },
    fence: e => { if (sample('fence', { gain: 0.12, pan: panAt(e.at.x) })) return; for (let i = 0; i < 5; i++) noise(0.025, { at: i * 0.03 * vary(0.3), type: 'highpass', freq: 2600, gain: 0.015 * (1 - i / 6), pan: panAt(e.at.x) }); },
    // Someone in the family gets hit: a soft "oof".
    fan: e => { tone(270 * vary(), { type: 'triangle', gain: 0.06, decay: 0.14, glide: 0.65, pan: panAt(e.at.x) }); noise(0.05, { type: 'lowpass', freq: 600, gain: 0.05, pan: panAt(e.at.x) }); },
    // Through the net: a soft swish, then a small chime (three notes for two points).
    score: e => {
      const pan = panAt(e.at.x);
      if (sample('swish', { gain: 0.8, pan, wet: 0.2 })) return;
      noise(0.35, { freq: 5200, q: 0.7, gain: 0.07, sweep: 0.35, wet: 0.2, pan });
      noise(0.22, { at: 0.08, freq: 3000, q: 0.8, gain: 0.03, sweep: 0.5, wet: 0.2, pan });
    },
    shot: e => {
      if (!sample('whoosh', { gain: 0.3, rate: 1.25, pan: panAt(e.at.x) })) noise(0.14, { freq: 600, q: 1.2, gain: 0.035, sweep: 3, pan: panAt(e.at.x) });
      // A dunk: the slam rattles the rim and the backboard.
      if (e.type === 'shot' && e.move === 'dunk') { sample('rim-1', { gain: 0.8, wet: 0.3 }); sample('backboard', { at: 0.02, gain: 0.6 }); if (!document.hidden) haptic('celebrate'); return; }
      // A clean jump-shot release: a small sparkle.
      if (e.type === 'shot' && e.release > 0.85) { tone(1568, { at: 0.03, gain: 0.03, decay: 0.3, wet: 0.5 }); tone(2093, { at: 0.08, gain: 0.02, decay: 0.3, wet: 0.5 }); }
    },
    // Gathering the ball: a palm slap.
    pickup: e => { if (sample('catch', { gain: 0.35, pan: panAt(e.at.x) })) return; noise(0.03, { freq: 1800, q: 1, gain: 0.07, pan: panAt(e.at.x) }); bounce(0.2, panAt(e.at.x), false); },
    // The sprint has no whoosh (the playtest found it unnecessary); its dust and vibration are enough.
    skid: () => { if (!sample('skid', { gain: 0.14 })) noise(0.18, { freq: 1800, sweep: 0.4, q: 2, gain: 0.012 }); },
    jump: () => { tone(260, { type: 'triangle', glide: 2.8, decay: 0.16, gain: 0.05, wet: 0.15 }); noise(0.12, { freq: 700, sweep: 2.9, q: 1.2, gain: 0.03 }); },
    // Out of puff: Catcha's soft, breathy double huff.
    tired: () => { if (sample('huff', { gain: 0.7 })) return; noise(0.22, { freq: 900, sweep: 0.67, q: 0.8, gain: 0.12 }); noise(0.26, { at: 0.32, freq: 800, sweep: 0.65, q: 0.8, gain: 0.1 }); }
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
    /** A basket: a small chime and the family's claps; `shout` adds the kids' cheer (the one sound that stays loud). */
    cheer(value: 1 | 2, shout: boolean) {
      if (!document.hidden && value === 2) haptic('celebrate');
      if (!live()) return;
      const notes = value === 2 ? [784, 988, 1319] : [784, 1047];
      notes.forEach((f, i) => { tone(f, { at: 0.12 + i * 0.07, gain: 0.04, decay: 0.6, wet: 0.5 }); tone(f * 2.01, { at: 0.12 + i * 0.07, gain: 0.012, decay: 0.3, wet: 0.5 }); });
      // The family off to the left where they stand.
      const clapped = sample('claps', { at: 0.15, gain: value === 2 ? 0.5 : 0.38, pan: famPan, wet: 0.2 });
      if (clapped && (!shout || sample('cheer', { at: 0.1, gain: value === 2 ? 0.5 : 0.36, pan: famPan, wet: 0.2, loud: true }))) return;
      for (let i = 0; i < (value === 2 ? 12 : 8); i++) noise(0.022, { at: 0.2 + Math.random() * 0.8, freq: 1400 * vary(0.2), q: 0.9, gain: 0.05, wet: 0.2, pan: famPan + (Math.random() - 0.5) * 0.3 });
      if (!shout) return;
      tone(520, { at: 0.25, type: 'triangle', gain: 0.025, decay: 0.3, glide: 1.5, wet: 0.3, pan: famPan });
      tone(760, { at: 0.32, type: 'triangle', gain: 0.02, decay: 0.25, glide: 1.4, wet: 0.3, pan: famPan + 0.2 });
    },
    /** A near miss: the family's soft "aww". */
    aww() {
      if (!live() || sample('aww', { gain: 0.35, pan: famPan, wet: 0.25 })) return;
      tone(440, { type: 'triangle', gain: 0.025, decay: 0.35, glide: 0.82, wet: 0.3, pan: famPan });
      tone(370, { at: 0.05, type: 'triangle', gain: 0.02, decay: 0.45, glide: 0.85, wet: 0.3, pan: famPan + 0.15 });
    },
    /**
     * One of the family booped (Catcha's): a kid squeaks three quick rising notes as in Catcha, Mom a soft "oh"; then,
     * at most every four seconds, a voice: the toddler's "ga-ga" when bumped or a laugh when the ball hits her, or a giggle.
     */
    boop(who: Who, kind: 'bump' | 'hit') {
      if (!document.hidden) haptic('bump');
      if (!live()) return;
      const pan = panAt(FAMILY.find(f => f.who === who)!.x), pitch = who === 'girl' ? 0.85 : 1;
      if (who === 'mom') { tone(392 * vary(), { type: 'triangle', gain: 0.045, decay: 0.16, glide: 1.15, wet: 0.2, pan }); tone(330 * vary(), { at: 0.13, type: 'triangle', gain: 0.04, decay: 0.24, glide: 0.85, wet: 0.2, pan }); }
      else [700, 900, 1100].forEach((f, i) => tone(f * pitch, { at: i * 0.12, type: 'triangle', gain: 0.05 - i * 0.005, decay: 0.13, glide: 1.65, wet: 0.2, pan }));
      const lines = FAMILY_VOICES[who][kind].filter(url => buffers.has(url)), now = ctx!.currentTime;
      if (now - voiceAt < 4 || Math.random() > 0.8) return;
      voiceAt = now;
      if (lines.length) sample(lines[Math.floor(Math.random() * lines.length)], { at: 0.32, gain: 0.55, pan, wet: 0.15, loud: true });
      else if (who !== 'mom') { const f = (900 + Math.random() * 250) * pitch; for (let i = 0; i < 3; i++) tone(f + i * 90, { at: 0.38 + i * 0.09, type: 'triangle', gain: 0.035, decay: 0.08, glide: 1.3, wet: 0.2, pan }); }
    },
    /** Sneakers biting the court on a dunk or layup take-off. */
    squeak() { if (live() && !sample('skid', { gain: 0.16, rate: 1.1 })) noise(0.12, { freq: 2200, sweep: 1.3, q: 3, gain: 0.01 }); },
    /** Dad's praise for a streak, after the swish. */
    praise(word: 'excellent' | 'wonderful' | 'brilliant') { if (live()) sample(word, { at: 0.45, gain: 0.7, loud: true }); },
    /** Dad landing from a jump: a soft pat. */
    land() {
      if (!document.hidden) haptic('tick');
      if (live()) { tone(120, { glide: 0.6, decay: 0.12, gain: 0.07 }); noise(0.06, { type: 'lowpass', freq: 450, gain: 0.04 }); }
    },
    /** Pausing ducks the music. */
    setPaused(value: boolean) { paused = value; level(); },
    get music() { return musicOn; },
    /** The Music switch (Hoops' own, remembered on this device); also call after the Sound switch changes. */
    setMusic(value = musicOn) { musicOn = value; try { localStorage.setItem(MUSIC_KEY, String(value)); } catch { /* not remembered */ } level(); },
    destroy() {
      closed = true; clearTimeout(musicTimer);
      window.removeEventListener('pointerup', unlock); window.removeEventListener('keydown', unlock); document.removeEventListener('visibilitychange', visibility);
      void ctx?.close().catch(() => {});
    }
  };
}

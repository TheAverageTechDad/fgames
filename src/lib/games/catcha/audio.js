/**
 * Sound for Catcha — procedural WebAudio and recorded family voices.
 *
 * Palette: a toy-box. Marimba/kalimba plucks, glockenspiel bells, squeaky toy chirps, soft
 * felt-mallet footsteps. Everything sits on a C-major pentatonic so overlapping chimes never
 * clash when the room gets chaotic.
 *
 *   toy   → bright squeak + glockenspiel  (plastic, bouncy)
 *   book  → hollow wood-block / marimba   (woody, warm)
 *   cloth → airy whoosh + soft flute-ish  (fabric, gentle)
 *
 * Drop-offs climb the pentatonic with the combo count, so a streak audibly "goes up".
 *
 * Non-gameplay by construction: this module never reads or writes game state, and its cosmetic
 * variation comes from a private xorshift (not Math.random) so nothing here can leak into the sim.
 * The AudioContext is created in initAudio() and resumed by a real key press or tap.
 */

import { createSoundtrack } from "./soundtrack.js";

const MASTER_GAIN = 0.38;

/** @type {AudioContext|null} */
let ctx = null;
/** @type {GainNode|null} */
let master = null;
/** @type {GainNode|null} */
let fxSend = null;
/** @type {AudioBuffer|null} */
let noiseBuf = null;
let footSide = 1;
/** Sound effects pass through this gain so they can be muted separately from the music. */
let sfxOut = null;
let sfxMuted = (() => { try { return localStorage.getItem("cuc-sfx-muted") === "1"; } catch { return false; } })();
export function isSfxMuted() { return sfxMuted; }
export function audioState() { return ctx?.state ?? "unavailable"; }
export function setSfxMuted(value) {
  sfxMuted = !!value;
  if (sfxMuted) resetCookingVoices();
  try { localStorage.setItem("cuc-sfx-muted", sfxMuted ? "1" : "0"); } catch { /* private mode */ }
  if (sfxOut) sfxOut.gain.setTargetAtTime(sfxMuted ? 0 : 1, ctx.currentTime, 0.05);
  return sfxMuted;
}

// Private cosmetic RNG — audio only, never touches the sim.
let seed = 0x9e3779b9;
function rnd() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) % 100000) / 100000;
}
const jitter = (amt) => (rnd() * 2 - 1) * amt;

// C-major pentatonic, MIDI → Hz
const PENTA = [0, 2, 4, 7, 9];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
function penta(base, step) {
  const oct = Math.floor(step / PENTA.length);
  const idx = ((step % PENTA.length) + PENTA.length) % PENTA.length;
  return mtof(base + oct * 12 + PENTA[idx]);
}

/* ─────────────────────────────── setup ─────────────────────────────── */

export function initAudio() {
  if (ctx) return;
  const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return;
  try {
    ctx = new AC();
  } catch {
    ctx = null;
    return;
  }

  // master chain: gentle gain → soft compressor → out
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 12;
  comp.ratio.value = 3;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  master = ctx.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(comp);
  sfxOut = ctx.createGain();
  sfxOut.gain.value = sfxMuted ? 0 : 1;
  sfxOut.connect(master);
  comp.connect(ctx.destination);

  // Recorded music uses a dry path; the supplied songs already have their own room sound.
  musicBus = ctx.createGain(); musicBus.gain.value = muted ? 0 : MUSIC_GAIN; musicBus.connect(master);
  const recorded = ctx.createGain(); recorded.gain.value = 3; recorded.connect(musicBus);
  let decoder = ctx;
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  // Decode long songs at 32 kHz to bound their combined PCM storage to about 37 MB on phones.
  if (Offline) { try { decoder = new Offline(2, 1, 32000); } catch { /* use the existing context */ } }
  soundtrack = createSoundtrack({ context: ctx, output: recorded, load: async kind => {
    const response = await fetch(`/catcha/assets/audio/music-${kind}.m4a`);
    if (!response.ok) return null;
    return decoder.decodeAudioData(await response.arrayBuffer());
  } });

  // a tiny "playroom" echo: short filtered feedback delay used as a send for bells/stingers
  fxSend = ctx.createGain();
  fxSend.gain.value = 1;
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.17;
  const fb = ctx.createGain();
  fb.gain.value = 0.28;
  const damp = ctx.createBiquadFilter();
  damp.type = "lowpass";
  damp.frequency.value = 2600;
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
  fxSend.connect(delay);
  delay.connect(damp);
  damp.connect(fb);
  fb.connect(delay);
  damp.connect(wet);
  wet.connect(master);

  // 1s of white noise shared by footsteps / whooshes
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;

  const resume = () => {
    if (ctx && ctx.state !== "running") ctx.resume().catch(() => {});
  };
  window.addEventListener("keydown", resume, { capture: true });
  window.addEventListener("pointerdown", resume, { capture: true });
  window.addEventListener("touchstart", resume, { capture: true, passive: true });
  // Safari can grant audio activation only when a touch completes. Keep these retries as well
  // as the early attempt, including after an interruption; the running guard prevents duplicates.
  window.addEventListener("pointerup", resume, { capture: true });
  window.addEventListener("touchend", resume, { capture: true, passive: true });
  window.addEventListener("click", resume, { capture: true });
  resume();
  loadClips();
}

/* ─────────────────────────────── family voices ─────────────────────────────── */

// Recorded family clips (processed by assets/src/voices.sh), decoded once and played through the
// SFX bus and the playroom echo, so they mute with sounds and sit in the same room as the rest.
// Each set is picked at random but never the same clip twice running.
const A = (name) => `/catcha/assets/audio/${name}.m4a`;
const CLIP_SETS = {
  slowLines: ["voice-slow", "voice-slow-2"].map(A),
  toddlerLaugh: [A("laugh-toddler")],
  babyLaughs: [1, 2, 3, 4].map((i) => A(`baby-laugh-${i}`)),
  gaga: [A("gaga-1"), A("gaga-2")],
  mom: [1, 2, 3].map((i) => A(`mom-${i}`)),
  cookServing: [A("cook-child-here-you-go"), A("cook-child-your-food")],
  cookYum: [1, 2, 3].map((i) => A(`cook-baby-yum-${i}`)),
};
const CHEERS = { excellent: A("dad-excellent"), wonderful: A("dad-wonderful"), brilliant: A("dad-brilliant") };
const COOK_CHEERS = Object.fromEntries(["yummy", "sumptuous", "spectacular", "juicy"].map((w) => [w, A(`cook-dad-${w}`)]));
const clips = {}, lastPick = {};
let cheerClips = {};
let cookCheerClips = {};
let voiceUntil = 0, laughAt = -99, gagaAt = -99; // audio-clock bookkeeping so voices never pile up
const loadClip = (url) => fetch(url).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).catch(() => null);
function loadClips() {
  for (const [name, urls] of Object.entries(CLIP_SETS)) clips[name] = urls.map(loadClip);
  cheerClips = Object.fromEntries(Object.entries(CHEERS).map(([word, url]) => [word, loadClip(url)]));
  cookCheerClips = Object.fromEntries(Object.entries(COOK_CHEERS).map(([word, url]) => [word, loadClip(url)]));
}
/** One clip of a set: random, never the one played last time. */
function pickClip(set) {
  const list = clips[set] ?? [], n = list.length;
  if (!n) return null;
  let i = Math.floor(rnd() * n);
  if (n > 1 && i === lastPick[set]) i = (i + 1) % n;
  lastPick[set] = i;
  return list[i];
}
function playClip(buffer, t, gain, send, pan = 0) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(bus(gain, pan, send));
  src.start(t);
  return t + buffer.duration;
}
/** Dip the music under a voice from `t` to `end`. */
function duck(t, end, depth = 0.4) {
  if (!musicBus || muted || musicOptions.paused || end <= t) return;
  musicBus.gain.setTargetAtTime(MUSIC_GAIN * depth, t - 0.1, 0.06);
  musicBus.gain.setTargetAtTime(MUSIC_GAIN, end, 0.3);
}

/** Slow-down grabbed: big sister calls it, then the toddler giggles; the music dips under them. */
export function playSlowVoices() {
  if (!ready() || !clips.slowLines) return;
  Promise.all([pickClip("slowLines"), pickClip("toddlerLaugh")]).then(([line, laugh]) => {
    const t = ctx.currentTime + 0.22; // lets the pickup arpeggio sparkle first
    let end = t;
    if (line) end = playClip(line, t, 0.95, 0.1);
    if (laugh) end = playClip(laugh, end + 0.42, 0.75, 0.14); // a beat after she finishes
    voiceUntil = Math.max(voiceUntil, end);
    duck(t, end);
  });
}

/**
 * Now and then the toddler giggles while she makes mischief (a throw, slipping away from her sister).
 * `chance` per call, at most one every 9s and never over another voice, so it stays a treat.
 * `pan` places her left/right in the room. Returns true when a giggle was started.
 */
export function playBabyLaugh(pan = 0, chance = 0.35) {
  if (!ready() || !clips.babyLaughs) return false;
  const now = ctx.currentTime;
  if (now - laughAt < 9 || now < voiceUntil || rnd() > chance) return false;
  laughAt = now;
  pickClip("babyLaughs").then((b) => { if (b) voiceUntil = Math.max(voiceUntil, playClip(b, ctx.currentTime + 0.05, 0.55, 0.16, pan)); });
  return true;
}

/** Bumped by her big sister: "ga-ga!" (often, not always; at most every 4s). Returns true if played. */
export function playGaga(pan = 0) {
  if (!ready() || !clips.gaga) return false;
  const now = ctx.currentTime;
  if (now - gagaAt < 4 || now < voiceUntil || rnd() > 0.65) return false;
  gagaAt = now;
  // after the bump's squeak, as if she's answering it
  pickClip("gaga").then((b) => { if (b) voiceUntil = Math.max(voiceUntil, playClip(b, ctx.currentTime + 0.32, 0.7, 0.16, pan)); });
  return true;
}

/** Mom walks in and says one of her lines: soft and roomy, not on top of the game. */
export function playMomLine() {
  if (!ready() || !clips.mom) return;
  pickClip("mom").then((b) => {
    if (!b) return;
    const t = ctx.currentTime + 0.35, end = playClip(b, t, 0.75, 0.2);
    voiceUntil = Math.max(voiceUntil, end);
    duck(t, end, 0.55);
  });
}

/** Dad's announcer call for something big: "excellent" | "wonderful" | "brilliant". */
export function playCheer(word) {
  if (!ready() || !cheerClips[word]) return;
  cheerClips[word].then((b) => {
    if (!b) return;
    const t = ctx.currentTime + 0.12, end = playClip(b, t, 1, 0.14);
    voiceUntil = Math.max(voiceUntil, end);
    duck(t, end, 0.35);
  });
}

// Cooking dialogue uses one short queue: the chef speaks before Dad replies. Baby reactions
// are optional and only start in a quiet gap. Epoch checks discard late downloads after reset.
let cookEpoch = 0, cookPending = 0, cookTail = Promise.resolve(), cookUntil = 0;
let yumAt = -99, dadAt = -99;
const cookSources = new Set();
let cookVoiceLog = [];
export function cookingVoiceState() {
  return { pending: cookPending, active: cookSources.size,
    busyFor: Math.max(0, cookUntil - (ctx?.currentTime ?? 0)), recent: cookVoiceLog.map((v) => ({ ...v })) };
}
export function resetCookingVoices() {
  cookEpoch += 1;
  cookPending = 0;
  cookTail = Promise.resolve();
  for (const { source, output } of cookSources) {
    output.gain.cancelScheduledValues(ctx.currentTime);
    output.gain.setTargetAtTime(0, ctx.currentTime, 0.015);
    source.stop(ctx.currentTime + 0.06);
  }
  cookSources.clear();
  if (ctx && voiceUntil <= cookUntil + 0.001) voiceUntil = ctx.currentTime;
  cookUntil = 0;
  yumAt = dadAt = -99;
  cookVoiceLog = [];
  if (ctx && musicBus && !muted && !musicOptions.paused) {
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setTargetAtTime(MUSIC_GAIN, ctx.currentTime, 0.2);
  }
}
function queueCookingVoice(promise, speaker, line, pan, gain) {
  if (!ctx || ctx.state !== "running" || sfxMuted || !promise || cookPending >= 3) return false;
  const epoch = cookEpoch, requested = ctx.currentTime;
  cookPending += 1;
  // Reserve the decode gap so an existing giggle/ga-ga cannot start on top of the chef.
  voiceUntil = Math.max(voiceUntil, requested + 0.2);
  cookTail = cookTail.then(async () => {
    const buffer = await promise;
    if (epoch !== cookEpoch) return;
    cookPending -= 1;
    if (!buffer || sfxMuted || ctx.state !== "running") return;
    const t = Math.max(ctx.currentTime + 0.12, voiceUntil + 0.2);
    if (t - requested > 4) return; // an old reaction must not surface much later
    const source = ctx.createBufferSource(), output = bus(gain, pan, 0.10);
    source.buffer = buffer;
    source.connect(output);
    const entry = { source, output };
    cookSources.add(entry);
    source.onended = () => { cookSources.delete(entry); source.disconnect(); output.disconnect(); };
    source.start(t);
    cookUntil = t + buffer.duration;
    voiceUntil = cookUntil;
    duck(t, cookUntil, 0.4);
    cookVoiceLog.push({ speaker, line, start: t, end: cookUntil });
    if (cookVoiceLog.length > 12) cookVoiceLog.shift();
  }).catch(() => { /* a missing clip must never interrupt the game */ });
  return true;
}
export function playCookingServe(pan = 0) {
  const clip = pickClip("cookServing");
  return queueCookingVoice(clip, "chef", ["Here you go", "Here's your food"][lastPick.cookServing], pan, 0.9);
}
export function playCookingCheer(word) {
  if (!ctx || ctx.currentTime - dadAt < 1.5) return false;
  const accepted = queueCookingVoice(cookCheerClips[word], "dad", word, 0, 0.92);
  if (accepted) dadAt = ctx.currentTime;
  return accepted;
}
export function playCookingYum(pan = 0, chance = 0.45) {
  if (!ctx || ctx.state !== "running" || sfxMuted || cookPending || ctx.currentTime < voiceUntil || ctx.currentTime - yumAt < 9 || rnd() > chance) return false;
  const accepted = queueCookingVoice(pickClip("cookYum"), "baby", "yum yum", pan, 0.78);
  if (accepted) yumAt = ctx.currentTime;
  return accepted;
}

function ready() {
  if (!ctx || !master) return false;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return true;
}

/* ─────────────────────────────── voices ─────────────────────────────── */

/** Output bus for one sound: gain → panner → master (+ optional echo send). */
function bus(gain = 1, pan = 0, send = 0) {
  const g = ctx.createGain();
  g.gain.value = gain;
  let out = g;
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p);
    out = p;
  }
  out.connect(sfxOut);
  if (send > 0 && fxSend && !sfxMuted) {
    const s = ctx.createGain();
    s.gain.value = send;
    out.connect(s);
    s.connect(fxSend);
  }
  return g;
}

/** Percussive tone with an exponential decay. */
function tone(dest, { type = "sine", freq, t, attack = 0.004, decay = 0.3, peak = 0.5, glideTo = 0, glideTime = 0.08, detune = 0 }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + glideTime);
  o.detune.value = detune;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
  return o;
}

/** Glockenspiel-ish bell: sine fundamental + inharmonic partials that die fast. */
function bell(dest, freq, t, peak = 0.35, decay = 0.9) {
  tone(dest, { freq, t, peak, decay, attack: 0.002 });
  tone(dest, { freq: freq * 2.76, t, peak: peak * 0.35, decay: decay * 0.35, attack: 0.002 });
  tone(dest, { freq: freq * 5.4, t, peak: peak * 0.15, decay: decay * 0.15, attack: 0.001 });
}

/** Marimba: sine + a quickly-fading 4th harmonic, short and woody. */
function marimba(dest, freq, t, peak = 0.45, decay = 0.35) {
  tone(dest, { freq, t, peak, decay, attack: 0.003 });
  tone(dest, { freq: freq * 4, t, peak: peak * 0.25, decay: decay * 0.18, attack: 0.002 });
  tone(dest, { type: "triangle", freq: freq * 0.5, t, peak: peak * 0.2, decay: decay * 0.5, attack: 0.003 });
}

/** Filtered noise burst. */
function noise(dest, { t, dur = 0.08, peak = 0.3, type = "bandpass", freq = 1200, q = 1, freqTo = 0, attack = 0.003 }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
  src.connect(f);
  f.connect(g);
  g.connect(dest);
  src.start(t, rnd() * 0.8);
  src.stop(t + attack + dur + 0.05);
}

/* ─────────────────────────────── hooks ─────────────────────────────── */

/** Soft felt-sock footfalls on a wooden floor; sprinting is snappier and brighter. */
export function playFootstep(sprinting) {
  if (!ready()) return;
  const t = ctx.currentTime + 0.005;
  footSide = -footSide;
  const out = bus(sprinting ? 0.55 : 0.42, footSide * 0.18);
  const pitch = 1 + jitter(0.12);
  // thump
  tone(out, {
    freq: (sprinting ? 150 : 120) * pitch,
    glideTo: (sprinting ? 70 : 60) * pitch,
    glideTime: 0.06,
    t,
    attack: 0.002,
    decay: sprinting ? 0.06 : 0.09,
    peak: 0.5,
  });
  // scuff
  noise(out, {
    t,
    dur: sprinting ? 0.045 : 0.06,
    peak: sprinting ? 0.22 : 0.14,
    freq: (sprinting ? 2400 : 1500) * (1 + jitter(0.2)),
    q: 1.4,
  });
}

/** Picking something up: a rising "boop" with a per-kind colour. */
export function playPickup(kind) {
  if (!ready()) return;
  const t = ctx.currentTime + 0.005;
  const out = bus(0.8, jitter(0.15), 0.25);
  if (kind === "book") {
    // two hollow wood-block knocks, rising a fourth
    marimba(out, mtof(67), t, 0.5, 0.18);
    marimba(out, mtof(72), t + 0.07, 0.5, 0.3);
    noise(out, { t, dur: 0.03, peak: 0.12, freq: 900, q: 3 });
  } else if (kind === "cloth") {
    // soft fabric swish + airy rising flute
    noise(out, { t, dur: 0.18, peak: 0.18, type: "bandpass", freq: 600, freqTo: 3200, q: 0.8, attack: 0.04 });
    tone(out, { type: "sine", freq: mtof(76), glideTo: mtof(83), glideTime: 0.14, t: t + 0.03, attack: 0.03, decay: 0.28, peak: 0.28 });
    tone(out, { type: "triangle", freq: mtof(88), t: t + 0.12, attack: 0.01, decay: 0.3, peak: 0.08 });
  } else {
    // toy: squeaky rubber-duck chirp + glock tink
    tone(out, { type: "square", freq: mtof(79), glideTo: mtof(91), glideTime: 0.07, t, attack: 0.005, decay: 0.09, peak: 0.09 });
    tone(out, { type: "triangle", freq: mtof(79), glideTo: mtof(91), glideTime: 0.07, t, attack: 0.005, decay: 0.12, peak: 0.25 });
    bell(out, mtof(96), t + 0.07, 0.16, 0.45);
  }
}

/**
 * Item returned home: a happy two/three-note ding, voiced per kind, climbing the pentatonic as the
 * combo grows. Combo ≥ 3 adds a glittery sparkle run on top.
 */
export function playDropoff(kind, combo) {
  if (!ready()) return;
  const t = ctx.currentTime + 0.005;
  const c = Math.max(0, Math.min(10, (combo | 0) - 1));
  const out = bus(0.85, 0, 0.45);
  const step = c; // each combo step climbs one pentatonic note
  const n0 = penta(72, step);
  const n1 = penta(72, step + 2);
  const n2 = penta(72, step + 5); // octave above n0

  if (kind === "book") {
    // warm marimba "ta-daa"
    marimba(out, n0, t, 0.5, 0.25);
    marimba(out, n1, t + 0.08, 0.5, 0.3);
    marimba(out, n2, t + 0.16, 0.55, 0.6);
    tone(out, { type: "triangle", freq: n0 / 2, t: t + 0.16, attack: 0.01, decay: 0.5, peak: 0.18 });
  } else if (kind === "cloth") {
    // soft kalimba-ish triangle pluck + breathy puff
    noise(out, { t, dur: 0.12, peak: 0.1, freq: 1800, freqTo: 600, q: 0.7, attack: 0.02 });
    tone(out, { type: "triangle", freq: n0, t, attack: 0.006, decay: 0.35, peak: 0.35 });
    tone(out, { type: "triangle", freq: n1, t: t + 0.09, attack: 0.006, decay: 0.4, peak: 0.35 });
    tone(out, { type: "sine", freq: n2, t: t + 0.18, attack: 0.01, decay: 0.8, peak: 0.32 });
  } else {
    // toy: sparkly glockenspiel ding-ding-DING
    bell(out, n0 * 2, t, 0.26, 0.5);
    bell(out, n1 * 2, t + 0.07, 0.26, 0.5);
    bell(out, n2 * 2, t + 0.14, 0.32, 1.0);
  }

  if (combo >= 3) {
    // combo glitter: a quick rising run of tiny bells
    const runLen = Math.min(6, 2 + Math.floor(combo / 2));
    for (let i = 0; i < runLen; i++) {
      bell(out, penta(84, step + i + 3), t + 0.24 + i * 0.045, 0.1, 0.35);
    }
  }
}

/** Round start: a bouncy toy-trumpet fanfare that sits higher each round. */
export function playRoundStart(round) {
  if (!ready()) return;
  const t = ctx.currentTime + 0.02;
  const r = Math.max(0, Math.min(6, (round | 0) - 1));
  const base = 60 + [0, 2, 4, 5, 7, 9, 12][r];
  const out = bus(0.7, 0, 0.4);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2400;
  lp.Q.value = 2;
  lp.connect(out);
  // da-da-da-DAAA (1, 3, 5, 8)
  const notes = [0, 4, 7, 12];
  const times = [0, 0.11, 0.22, 0.36];
  notes.forEach((n, i) => {
    const f = mtof(base + n);
    const long = i === notes.length - 1;
    tone(lp, { type: "square", freq: f, t: t + times[i], attack: 0.01, decay: long ? 0.55 : 0.12, peak: 0.12 });
    tone(lp, { type: "sawtooth", freq: f, detune: 7, t: t + times[i], attack: 0.01, decay: long ? 0.5 : 0.1, peak: 0.06 });
    marimba(out, f * 2, t + times[i], 0.22, long ? 0.5 : 0.15);
  });
  // final chord bell shimmer + a little drum
  bell(out, mtof(base + 24), t + 0.36, 0.14, 1.2);
  bell(out, mtof(base + 28), t + 0.38, 0.1, 1.0);
  noise(out, { t: t + 0.36, dur: 0.12, peak: 0.12, type: "highpass", freq: 5000, q: 0.5 });
  tone(out, { freq: 140, glideTo: 60, glideTime: 0.12, t: t + 0.36, attack: 0.003, decay: 0.18, peak: 0.4 });
}

/** A soft confetti pop followed by a few music-box sparkles, separate from the music mute. */
export function playCelebration(finale = false) {
  if (!ready()) return;
  const t = ctx.currentTime + 0.02, out = bus(finale ? 0.42 : 0.25, 0, 0.12);
  noise(out, { t, dur: 0.11, peak: 0.16, type: "bandpass", freq: 2200, q: 0.7 });
  [84, 88, 91, ...(finale ? [96, 100] : [])].forEach((m, i) => bell(out, mtof(m), t + 0.1 + i * 0.09, 0.12, 0.8));
}

/** Game over: a gentle "wah-wah-wahhh" toy trombone, then a soft resolving music-box chord. */
export function playGameOver() {
  if (!ready()) return;
  const t = ctx.currentTime + 0.02;
  const out = bus(0.75, 0, 0.35);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1300;
  lp.Q.value = 4;
  lp.connect(out);
  const notes = [67, 66, 65, 64];
  const step = 0.32;
  notes.forEach((m, i) => {
    const s = t + i * step;
    const last = i === notes.length - 1;
    const dur = last ? 0.95 : 0.26;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(mtof(m) * 0.5, s);
    if (last) o.frequency.exponentialRampToValueAtTime(mtof(m - 1) * 0.5, s + dur);
    // "wah" vibrato on the last note
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    lfo.frequency.value = 6;
    lfoG.gain.value = last ? 5 : 0;
    lfo.connect(lfoG);
    lfoG.connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(0.22, s + 0.04);
    g.gain.setValueAtTime(0.22, s + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
    o.connect(g);
    g.connect(lp);
    o.start(s);
    lfo.start(s);
    o.stop(s + dur + 0.05);
    lfo.stop(s + dur + 0.05);
  });
  // music-box resolve: soft major chord so it ends friendly, not sad
  const end = t + notes.length * step + 0.75;
  [60, 64, 67, 72].forEach((m, i) => bell(out, mtof(m + 12), end + i * 0.06, 0.13, 1.4));
}

/* ─────────────────────────────── music ─────────────────────────────── */

// A calm lullaby loop: I–vi–IV–V pad, soft bass and a sparse kalimba melody on the pentatonic.
// Scheduled ahead from stepMusic() (called every frame), so a paused or hidden game goes quiet.
const MUSIC_GAIN = 0.32;
const BEAT = 60 / 68;
const CHORDS = [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]]; // C Am F G
let musicBus = null;
let nextBeat = 0;
let beatIndex = 0;
let melodyStep = 7;
let soundtrack = null, fallbackBus = null;
let musicOptions = { ending: false, paused: false };
let muted = (() => { try { return localStorage.getItem("cuc-music-muted") === "1"; } catch { return false; } })();

export function isMusicMuted() { return muted; }
export function musicState() { return soundtrack?.state() ?? { current: null }; }

export function setMusicMuted(value) {
  muted = !!value;
  try { localStorage.setItem("cuc-music-muted", muted ? "1" : "0"); } catch { /* private mode */ }
  if (musicBus) {
    musicBus.gain.cancelScheduledValues(ctx.currentTime); // drop a voice duck's pending restore
    musicBus.gain.setTargetAtTime(muted || musicOptions.paused ? 0 : MUSIC_GAIN, ctx.currentTime, 0.25);
  }
  soundtrack?.update({ ...musicOptions, paused: musicOptions.paused || muted });
  return muted;
}

/** 0..1 combo energy: adds a glockenspiel counter-line and a soft shaker while a streak runs. */
let energy = 0;
export function stepMusic(target = 0, options = {}) {
  if (musicBus && !!options.paused !== musicOptions.paused) {
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setTargetAtTime(options.paused || muted ? 0 : MUSIC_GAIN, ctx.currentTime, 0.08);
  }
  musicOptions = { ending: !!options.ending, paused: !!options.paused };
  soundtrack?.update({ ...musicOptions, paused: musicOptions.paused || muted });
  energy += (target - energy) * 0.04;
  if (!ctx || !master || ctx.state !== "running") return;
  // Keep the original lullaby as a graceful fallback if a recording cannot load/decode.
  if (muted || musicOptions.paused || musicOptions.ending || !soundtrack?.hasFailed("gameplay")) return;
  if (!fallbackBus) {
    fallbackBus = ctx.createGain();
    fallbackBus.gain.value = 1;
    const warm = ctx.createBiquadFilter();
    warm.type = "lowpass";
    warm.frequency.value = 2400;
    fallbackBus.connect(warm);
    warm.connect(musicBus);
    nextBeat = ctx.currentTime + 0.1;
  }
  if (nextBeat < ctx.currentTime) nextBeat = ctx.currentTime + 0.05; // resumed after a pause
  while (nextBeat < ctx.currentTime + 0.4) {
    const t = nextBeat, beat = beatIndex % 4, chord = CHORDS[Math.floor(beatIndex / 4) % CHORDS.length];
    if (beat === 0) {
      for (const m of chord) {
        tone(fallbackBus, { type: "triangle", freq: mtof(m + 12), t, attack: 0.9, decay: BEAT * 4, peak: 0.07, detune: -6 });
        tone(fallbackBus, { type: "sine", freq: mtof(m + 12), t, attack: 0.9, decay: BEAT * 4, peak: 0.06, detune: 7 });
      }
    }
    if (beat === 0 || beat === 2) tone(fallbackBus, { freq: mtof(chord[0] - 12), t, attack: 0.02, decay: BEAT * 1.6, peak: 0.16 });
    // two possible melody notes per beat, wandering the pentatonic near the chord
    for (const half of [0, 0.5]) {
      if (rnd() < (half ? 0.25 : 0.55)) {
        melodyStep = Math.max(3, Math.min(12, melodyStep + Math.round(jitter(2.4))));
        marimba(fallbackBus, penta(60, melodyStep), t + half * BEAT, 0.13, 0.9);
      }
    }
    if (energy > 0.15) {
      // streak layer: shaker on the off-beats, a bell answering the melody
      noise(fallbackBus, { t: t + BEAT / 2, dur: 0.05, peak: 0.05 * energy, type: "highpass", freq: 6000 });
      if (rnd() < energy * 0.7) bell(fallbackBus, penta(72, melodyStep + 2), t + BEAT * 0.75, 0.09 * energy, 0.7);
    }
    nextBeat += BEAT;
    beatIndex += 1;
  }
}

/** Bumping into things: a soft cushion thud for furniture, a squeaky giggle for the toddler. */
export function playBump(what) {
  if (!ready()) return;
  const t = ctx.currentTime;
  if (what === "toddler") {
    const b = bus(0.8, 0, 0.3);
    tone(b, { type: "triangle", freq: 700, glideTo: 1200, glideTime: 0.08, t, decay: 0.12, peak: 0.25 });
    tone(b, { type: "triangle", freq: 900, glideTo: 1500, glideTime: 0.08, t: t + 0.12, decay: 0.12, peak: 0.22 });
    tone(b, { type: "triangle", freq: 1100, glideTo: 1800, glideTime: 0.08, t: t + 0.24, decay: 0.15, peak: 0.2 });
  } else {
    const b = bus(0.7);
    tone(b, { freq: 140, glideTo: 70, glideTime: 0.12, t, decay: 0.16, peak: 0.45 });
    noise(b, { t, dur: 0.08, peak: 0.15, type: "lowpass", freq: 600 });
  }
}

/** Power-ups: a twinkle when one appears, a rising arpeggio when grabbed, a soft fall when it ends or is missed. */
export function playPowerup(type) {
  if (!ready()) return;
  const t = ctx.currentTime, b = bus(0.7, 0, 0.5);
  if (type === "spawn") [9, 11].forEach((s, i) => bell(b, penta(72, s), t + i * 0.09, 0.18, 0.6));
  else if (type === "pickup") [5, 7, 9, 10, 12].forEach((s, i) => bell(b, penta(72, s), t + i * 0.06, 0.25, 0.7));
  else [9, 7, 5].forEach((s, i) => marimba(b, penta(60, s), t + i * 0.1, 0.22, 0.4));
}

/** Sprint burst: a quick rising whoosh. Skid: a short scuffed brush on the floorboards. */
export function playDash() {
  if (!ready()) return;
  const t = ctx.currentTime, b = bus(0.6);
  noise(b, { t, dur: 0.22, peak: 0.28, type: "bandpass", freq: 500, freqTo: 2400, q: 1.4, attack: 0.02 });
  tone(b, { type: "triangle", freq: 220, glideTo: 440, glideTime: 0.15, t, decay: 0.12, peak: 0.08 });
}
export function playSkid() {
  if (!ready()) return;
  noise(bus(0.5), { t: ctx.currentTime, dur: 0.16, peak: 0.2, type: "bandpass", freq: 1800, freqTo: 700, q: 2 });
}

/** Jump take-off: a springy little boing with a puff of air. */
export function playJump() {
  if (!ready()) return;
  const t = ctx.currentTime, b = bus(0.6);
  tone(b, { type: "triangle", freq: 260, glideTo: 720, glideTime: 0.14, t, decay: 0.16, peak: 0.22 });
  noise(b, { t, dur: 0.12, peak: 0.12, type: "bandpass", freq: 700, freqTo: 2000, q: 1.2, attack: 0.01 });
}

/** Landing on furniture: a quiet knock on the table, a softer pat on the ottoman. Deliberately low. */
export function playLand(surface) {
  if (!ready()) return;
  const t = ctx.currentTime;
  if (surface === "table") {
    const b = bus(0.32);
    tone(b, { type: "triangle", freq: 210, glideTo: 120, glideTime: 0.05, t, decay: 0.09, peak: 0.3 });
    noise(b, { t, dur: 0.03, peak: 0.12, type: "bandpass", freq: 1800, q: 2 });
  } else {
    const b = bus(0.28);
    tone(b, { freq: 120, glideTo: 70, glideTime: 0.08, t, decay: 0.12, peak: 0.35 });
    noise(b, { t, dur: 0.06, peak: 0.1, type: "lowpass", freq: 450 });
  }
}

/** Bought something: a bright coin "ka-ching" with a little sparkle on top. */
export function playPurchase() {
  if (!ready()) return;
  const t = ctx.currentTime, b = bus(0.7, 0, 0.4);
  [0, 7, 12, 16].forEach((s, i) => bell(b, mtof(79 + s), t + i * 0.055, 0.28, 0.5));
  noise(b, { t: t + 0.18, dur: 0.25, peak: 0.08, type: "highpass", freq: 6000, attack: 0.01 });
}

/** Out of puff: a soft, breathy double huff. */
export function playHuff() {
  if (!ready()) return;
  const t = ctx.currentTime, b = bus(0.35);
  noise(b, { t, dur: 0.22, peak: 0.22, type: "bandpass", freq: 900, freqTo: 600, q: 0.8, attack: 0.03 });
  noise(b, { t: t + 0.32, dur: 0.26, peak: 0.18, type: "bandpass", freq: 800, freqTo: 520, q: 0.8, attack: 0.03 });
}

/** The bed throws you back up: a springy boing. */
export function playBoing() {
  if (!ready()) return;
  const t = ctx.currentTime, b = bus(0.4);
  tone(b, { type: "triangle", freq: 150, glideTo: 480, glideTime: 0.16, t, decay: 0.22, peak: 0.28 });
  tone(b, { type: "sine", freq: 300, glideTo: 640, glideTime: 0.14, t: t + 0.03, decay: 0.16, peak: 0.12 });
}

/** The toddler's throw: a short mischievous giggle, quieter than a bump. */
export function playGiggle() {
  if (!ready()) return;
  const t = ctx.currentTime, b = bus(0.45, jitter(0.4), 0.2), f = 900 + rnd() * 250;
  for (let i = 0; i < 3; i++) tone(b, { type: "triangle", freq: f + i * 90, glideTo: f + i * 90 + 280, glideTime: 0.06, t: t + i * 0.09, decay: 0.08, peak: 0.16 });
}

/**
 * Menu feedback, so every press feels physical: `tap` (any button), `select` (a mode), `start`
 * (play / continue / new room), `back` (home / close), `on` / `off` (toggles).
 */
export function playUi(kind) {
  if (!ready()) return;
  const t = ctx.currentTime, b = bus(0.55, 0, kind === "start" ? 0.35 : 0.12);
  tone(b, { type: "triangle", freq: 1400, glideTo: 900, glideTime: 0.03, t, decay: 0.04, peak: 0.12 }); // the click
  if (kind === "select") [7, 9].forEach((s, i) => marimba(b, penta(72, s), t + 0.02 + i * 0.06, 0.22, 0.25));
  else if (kind === "start") {
    [7, 9, 12].forEach((s, i) => bell(b, penta(72, s), t + 0.03 + i * 0.07, 0.2, 0.6));
    noise(b, { t, dur: 0.25, peak: 0.08, type: "bandpass", freq: 800, freqTo: 3200, q: 1.2, attack: 0.03 });
  } else if (kind === "back") [9, 5].forEach((s, i) => marimba(b, penta(60, s), t + 0.02 + i * 0.07, 0.22, 0.25));
  else if (kind === "on") [9, 12].forEach((s, i) => bell(b, penta(72, s), t + 0.02 + i * 0.05, 0.16, 0.4));
  else if (kind === "off") marimba(b, penta(60, 5), t + 0.02, 0.2, 0.25);
}

/* ───────────── kitchen (the cooking game) ───────────── */

/** A new order on the rail: a two-note shop-door chime. */
export function playOrder() {
  if (!ready()) return;
  const t = ctx.currentTime + 0.005, b = bus(0.55, 0, 0.35);
  bell(b, mtof(84), t, 0.2, 0.6);
  bell(b, mtof(79), t + 0.15, 0.2, 0.9);
}
/** An ingredient drops into the bowl / onto the board: a soft plop. */
export function playPlop() {
  if (!ready()) return;
  const t = ctx.currentTime, b = bus(0.6, jitter(0.1), 0.15);
  tone(b, { freq: 560, glideTo: 170, glideTime: 0.09, t, decay: 0.13, peak: 0.34 });
  noise(b, { t, dur: 0.04, peak: 0.08, type: "bandpass", freq: 1500, q: 2 });
}
/** Prep tick while she stands at it: a wooden chop on the board, a whisk swish in the bowl. */
export function playChop(station) {
  if (!ready()) return;
  const t = ctx.currentTime, b = bus(0.4, jitter(0.15));
  if (station === "board") {
    marimba(b, mtof(60 + Math.floor(rnd() * 3) * 2), t, 0.3, 0.08);
    noise(b, { t, dur: 0.025, peak: 0.12, type: "bandpass", freq: 2400, q: 3 });
  } else noise(b, { t, dur: 0.14, peak: 0.12, type: "bandpass", freq: 1200, freqTo: 3000, q: 1.5, attack: 0.03 });
}
/** Food goes on the heat: a short sizzle. */
export function playSizzle() {
  if (!ready()) return;
  const t = ctx.currentTime, b = bus(0.5);
  noise(b, { t, dur: 0.7, peak: 0.1, type: "highpass", freq: 4200, attack: 0.04 });
  tone(b, { type: "triangle", freq: 330, glideTo: 220, glideTime: 0.1, t, decay: 0.12, peak: 0.1 });
}
/** Ready: the kitchen-timer ding. */
export function playDing() {
  if (!ready()) return;
  const t = ctx.currentTime, b = bus(0.6, 0, 0.4);
  bell(b, mtof(96), t, 0.28, 1.4);
  bell(b, mtof(91), t + 0.12, 0.16, 1.1);
}
/** About to burn: two quick beeps (called every ~0.7s while it's catching). */
export function playWarn() {
  if (!ready()) return;
  const t = ctx.currentTime, b = bus(0.35);
  for (const dt of [0, 0.12]) tone(b, { type: "square", freq: 1320, t: t + dt, decay: 0.07, peak: 0.05 });
}
/** Burnt: a sad low sag with a puff. */
export function playBurnt() {
  if (!ready()) return;
  const t = ctx.currentTime, b = bus(0.5);
  tone(b, { type: "sawtooth", freq: 170, glideTo: 85, glideTime: 0.5, t, decay: 0.6, peak: 0.1 });
  noise(b, { t, dur: 0.5, peak: 0.12, type: "lowpass", freq: 700, attack: 0.05 });
}

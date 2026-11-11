import { wake } from '#lib/audio-wake.js';
import { haptic } from '#lib/haptics';
import { sound } from '#lib/sound';

// Everything is synthesised, so the garage works offline and every sound can follow the bike.
// The engine is one recorded-style crank cycle (two turns, four firing pulses that are not quite equal, which is what
// gives a four its burble), looped and pitched by rpm, then shaped by fixed "exhaust" filters so it stays an engine
// and not a chipmunk as it revs. Build sounds pair a transient with a short tonal ring; the chime climbs a pentatonic
// ladder, one step per part, so the whole build plays a tune.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
const REF_RPM = 1800, REDLINE_SOUND = 9500;

export type GarageAudio = ReturnType<typeof createGarageAudio>;

export function createGarageAudio() {
  let ctx: AudioContext | null = null, closed = false;
  let master: GainNode, sfx: GainNode, reverb: GainNode, noiseBuf: AudioBuffer, cycleBuf: AudioBuffer;
  let engine: ReturnType<typeof makeEngine> | null = null, starter: { stop: () => void } | null = null, spraying: { stop: () => void } | null = null;
  let voice = true;

  function build(c: AudioContext) {
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.005; comp.release.value = 0.2;
    master = c.createGain(); master.gain.value = sound.muted ? 0 : 0.9; master.connect(comp); comp.connect(c.destination);
    sfx = c.createGain(); sfx.gain.value = 0.55; sfx.connect(master);
    const len = c.sampleRate * 1.4, ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3; }
    const conv = c.createConvolver(), tone = c.createBiquadFilter(); conv.buffer = ir; tone.type = 'lowpass'; tone.frequency.value = 3500;
    reverb = c.createGain(); reverb.gain.value = 0.22; reverb.connect(conv); conv.connect(tone); tone.connect(master);
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const n = noiseBuf.getChannelData(0); for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
    cycleBuf = engineCycle(c);
  }
  /** One crank cycle at REF_RPM: four exhaust pulses, each a quick pressure kick ringing at two exhaust resonances. */
  function engineCycle(c: AudioContext) {
    const T = 2 * 60 / REF_RPM, frames = Math.round(c.sampleRate * T), buf = c.createBuffer(1, frames, c.sampleRate), d = buf.getChannelData(0);
    const amps = [1, 0.84, 0.95, 0.88], jitter = [0, 0.012, -0.008, 0.01];
    for (let k = 0; k < 4; k++) {
      const t0 = (k / 4 + jitter[k]) * T;
      for (let i = 0; i < frames; i++) {
        let dt = i / c.sampleRate - t0; if (dt < 0) dt += T;
        const e = Math.exp(-dt / 0.0045), e2 = Math.exp(-dt / 0.0016);
        d[i] += amps[k] * (e * (Math.sin(2 * Math.PI * 150 * dt) + 0.45 * Math.sin(2 * Math.PI * 410 * dt)) + e2 * 0.6 * (Math.random() * 2 - 1));
      }
    }
    let peak = 0; for (const v of d) peak = Math.max(peak, Math.abs(v));
    for (let i = 0; i < frames; i++) d[i] /= peak;
    return buf;
  }
  function makeEngine(c: AudioContext) {
    const out = c.createGain(); out.gain.value = 0; out.connect(master);
    const loop = c.createBufferSource(); loop.buffer = cycleBuf; loop.loop = true; loop.playbackRate.value = 200 / REF_RPM;
    const drive = c.createGain(); drive.gain.value = 1.4;
    const shaper = c.createWaveShaper(); const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(2.2 * x) / Math.tanh(2.2); }
    shaper.curve = curve; shaper.oversample = '2x';
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.8;
    const body = c.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 120; body.gain.value = 6; body.Q.value = 0.9;
    const bark = c.createBiquadFilter(); bark.type = 'peaking'; bark.frequency.value = 520; bark.gain.value = 3; bark.Q.value = 1.2;
    loop.connect(drive); drive.connect(shaper); shaper.connect(lp); lp.connect(body); body.connect(bark); bark.connect(out);
    // mechanical and intake hiss, louder with throttle
    const hiss = c.createBufferSource(); hiss.buffer = noiseBuf; hiss.loop = true;
    const hbp = c.createBiquadFilter(); hbp.type = 'bandpass'; hbp.frequency.value = 1800; hbp.Q.value = 0.6;
    const hg = c.createGain(); hg.gain.value = 0.02; hiss.connect(hbp); hbp.connect(hg); hg.connect(out);
    // at idle the rpm wanders a little: a lumpy idle, not a drone
    const lfo = c.createOscillator(), lfoGain = c.createGain(); lfo.frequency.value = 1.7; lfoGain.gain.value = 0;
    lfo.connect(lfoGain); lfoGain.connect(loop.playbackRate);
    loop.start(); hiss.start(); lfo.start();
    let rpm = 200;
    return {
      set(r: number, throttle: number) {
        const t = c.currentTime; rpm = r;
        loop.playbackRate.setTargetAtTime(r / REF_RPM, t, 0.035);
        lp.frequency.setTargetAtTime(420 + throttle * 2600 + r * 0.18, t, 0.04);
        out.gain.setTargetAtTime(0.42 + throttle * 0.28 + Math.min(1, r / REDLINE_SOUND) * 0.16, t, 0.05);
        hg.gain.setTargetAtTime(0.015 + throttle * 0.06, t, 0.05);
        lfoGain.gain.setTargetAtTime(r < 1600 ? 0.035 * r / REF_RPM : 0, t, 0.2);
      },
      get rpm() { return rpm; },
      stop(fade = 0.5) {
        const t = c.currentTime; out.gain.cancelScheduledValues(t); out.gain.setTargetAtTime(0, t, fade / 3);
        loop.playbackRate.setTargetAtTime(150 / REF_RPM, t, fade / 2);
        setTimeout(() => { for (const n of [loop, hiss, lfo]) { try { n.stop(); } catch { /* already stopped */ } } out.disconnect(); }, fade * 1000 + 300);
      }
    };
  }

  const unlock = () => {
    if (closed) return null;
    try {
      if (!ctx) { ctx = new AudioContext(); build(ctx); }
      if (!document.hidden) wake(ctx, () => { ctx = null; engine = null; starter = null; spraying = null; });
    } catch { return null; }
    return ctx;
  };
  const live = () => (ctx && !sound.muted ? ctx : null);

  function tone(f: number, at: number, dur: number, gain: number, type: OscillatorType = 'sine', dest: AudioNode = sfx, glide = 1) {
    const c = live(); if (!c) return;
    const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (glide !== 1) o.frequency.exponentialRampToValueAtTime(f * glide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02); o.onended = () => { o.disconnect(); g.disconnect(); };
  }
  function noise(at: number, dur: number, type: BiquadFilterType, f: number, gain: number, f2 = f, q = 0.8, dest: AudioNode = sfx) {
    const c = live(); if (!c) return;
    const t = c.currentTime + at, s = c.createBufferSource(), flt = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuf; s.loop = true; flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f, t); if (f2 !== f) flt.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(0.04, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(flt); flt.connect(g); g.connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.05);
    s.onended = () => { s.disconnect(); flt.disconnect(); g.disconnect(); };
  }
  const note = (step: number, root = 523.25) => root * 2 ** (SCALE[Math.min(step, SCALE.length - 1)] / 12);

  return {
    unlock,
    /** A part leaves its spot and flies in. */
    whoosh() { unlock(); noise(0, 0.38, 'bandpass', 380, 0.28, 2600, 1.4); },
    /** It seats: a thump, a knock of metal and a short ring. */
    clunk(heavy = true) {
      unlock();
      tone(heavy ? 120 : 190, 0, 0.2, 0.55, 'sine', sfx, 0.45);
      tone(heavy ? 240 : 360, 0, 0.06, 0.18, 'triangle');
      noise(0, 0.07, 'lowpass', 2200, 0.35);
      for (const [f, g, d] of [[1250, 0.05, 0.16], [2050, 0.04, 0.22], [3250, 0.05, 0.12]] as const) tone(f * (0.98 + Math.random() * 0.04), 0.004, d, g);
      haptic('land');
    },
    tighten() { unlock(); sound.playScrewDown(); },
    /** A part finished: a bell on the next note of the build's tune. */
    chime(step: number) {
      unlock();
      const c = live(); if (!c) return;
      const f = note(step);
      tone(f, 0, 1.2, 0.16, 'sine', reverb); tone(f, 0, 0.9, 0.14); tone(f * 2.76, 0, 0.35, 0.04); tone(f * 1.5, 0.09, 0.8, 0.08, 'sine', reverb);
      haptic('combo');
    },
    /** The paint can: a shake, a click, then the hiss for as long as the colour goes on. */
    spray(seconds = 0.9) {
      unlock();
      for (let i = 0; i < 3; i++) tone(1900 + i * 140, i * 0.07, 0.03, 0.05, 'square');
      noise(0.22, seconds, 'highpass', 3200, 0.22, 2600, 0.5);
      noise(0.22, seconds, 'bandpass', 6500, 0.12, 5000, 0.9);
    },
    /** Hold the starter: the motor whirrs and the engine turns over in slow, uneven chugs. */
    startCranking() {
      const c = unlock(); if (!c || sound.muted || starter) return;
      const out = c.createGain(); out.gain.value = 0; out.connect(master);
      const whirr = c.createOscillator(); whirr.type = 'sawtooth'; whirr.frequency.value = 90; whirr.frequency.linearRampToValueAtTime(128, c.currentTime + 0.6);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.9;
      const chug = c.createOscillator(); chug.type = 'triangle'; chug.frequency.value = 6.5;
      const depth = c.createGain(); depth.gain.value = 0.16; const am = c.createGain(); am.gain.value = 0.2;
      chug.connect(depth); depth.connect(am.gain); whirr.connect(bp); bp.connect(am); am.connect(out);
      const thump = c.createOscillator(); thump.type = 'sine'; thump.frequency.value = 48; const tg = c.createGain(); tg.gain.value = 0;
      const chug2 = c.createGain(); chug2.gain.value = 0.25; chug.connect(chug2); chug2.connect(tg.gain); thump.connect(tg); tg.connect(out);
      out.gain.linearRampToValueAtTime(0.9, c.currentTime + 0.08);
      whirr.start(); chug.start(); thump.start();
      starter = { stop() { const t = c.currentTime; out.gain.setTargetAtTime(0, t, 0.05); setTimeout(() => { for (const n of [whirr, chug, thump]) n.stop(); out.disconnect(); }, 400); } };
    },
    stopCranking() { starter?.stop(); starter = null; },
    /** It catches: a bark from the pipes, then the engine runs. */
    fire() {
      const c = unlock(); if (!c) return;
      this.stopCranking();
      if (!sound.muted) {
        noise(0, 0.22, 'lowpass', 900, 0.75, 300); tone(70, 0, 0.3, 0.6, 'sine', sfx, 0.6); noise(0.05, 0.6, 'bandpass', 500, 0.12, 250, 0.7, reverb);
      }
      haptic('bump');
    },
    /** rpm and throttle (0–1) each frame while the engine runs; builds the engine sound again after a mute or a wake. */
    run(rpm: number, throttle: number) {
      if (sound.muted) { if (engine) { engine.stop(0.1); engine = null; } return; }
      if (!engine && ctx && ctx.state === 'running') engine = makeEngine(ctx);
      engine?.set(rpm, throttle);
    },
    /** Lifting off from high revs: a crackle or two from the exhaust. */
    pop() { if (!engine) return; for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) noise(i * 0.06 + Math.random() * 0.03, 0.05, 'bandpass', 700 + Math.random() * 500, 0.35, 400, 1.5); },
    stopEngine() { engine?.stop(); engine = null; },
    engineRunning: () => !!engine,
    star(n: number) { unlock(); const f = note(5 + (n % 6), 659.25); tone(f, 0, 0.5, 0.12); tone(f * 1.5, 0.05, 0.45, 0.07, 'sine', reverb); haptic('tick'); },
    fanfare() { unlock(); [0, 2, 4, 5, 7].forEach((s, i) => { tone(note(s), i * 0.11, 0.6, 0.12); tone(note(s) / 2, i * 0.11, 0.6, 0.05, 'triangle'); }); haptic('celebrate'); },
    /** The roller door going up. */
    door() { unlock(); noise(0, 1.3, 'lowpass', 260, 0.35, 600); for (let i = 0; i < 9; i++) tone(900 + Math.random() * 600, 0.1 + i * 0.12, 0.03, 0.025, 'square'); },
    tap() { unlock(); tone(note(4), 0, 0.06, 0.06); },
    /** Says a part's name, for children who can't read it yet. */
    say(text: string) {
      if (!voice || sound.muted || typeof speechSynthesis === 'undefined') return;
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; u.pitch = 1.1; u.volume = 0.9;
        speechSynthesis.speak(u);
      } catch { /* no voice: the label shows the name */ }
    },
    set voice(v: boolean) { voice = v; },
    refreshMute() {
      if (!ctx) return;
      master.gain.setTargetAtTime(sound.muted ? 0 : 0.9, ctx.currentTime, 0.03);
      if (sound.muted) { this.stopCranking(); try { speechSynthesis.cancel(); } catch { /* none */ } }
    },
    close() {
      closed = true; this.stopCranking(); engine?.stop(0.1); engine = null; spraying?.stop();
      try { speechSynthesis.cancel(); } catch { /* none */ }
      if (ctx) void ctx.close().catch(() => {});
      ctx = null;
    }
  };
}

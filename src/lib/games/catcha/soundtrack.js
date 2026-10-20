/** Recorded music transport. Audio time owns playback; it never touches gameplay or its RNG. */
export const MUSIC_LOOP = { start: 22 + 2 / 3, end: 84 };
export const MUSIC_FADE = 3;
export const MUSIC_ENDING_START = 9;
const UP = Float32Array.from({ length: 64 }, (_, i) => Math.sin(i / 63 * Math.PI / 2));
const DOWN = Float32Array.from({ length: 64 }, (_, i) => Math.cos(i / 63 * Math.PI / 2));

export function createSoundtrack({ context: ctx, output, load }) {
  const buffers = new Map(), requests = new Map(), sources = new Set(), failed = new Set();
  let wanted = "gameplay", held = false, epoch = 0, pending = null, current = null;
  let resumeOffset = 0, endingFinished = false;
  const getBuffer = kind => {
    if (!requests.has(kind)) requests.set(kind, Promise.resolve().then(() => load(kind)).catch(() => null).then(buffer => {
      if (buffer) buffers.set(kind, buffer); else failed.add(kind);
      return buffer;
    }));
    return requests.get(kind);
  };
  function position(record) {
    if (!record) return resumeOffset;
    const t = record.offset + Math.max(0, ctx.currentTime - record.started);
    if (!record.source.loop) return Math.min(record.buffer.duration, t);
    const { loopStart: start, loopEnd: end } = record.source;
    return t < end ? t : start + (t - end) % (end - start);
  }
  function fade(record, up, duration) {
    const p = record.gain.gain, now = ctx.currentTime;
    const value = p.value;
    p.cancelScheduledValues(now); p.setValueAtTime(up ? 0 : value, now);
    const curve = up ? UP : Float32Array.from(DOWN, n => n * value);
    // Piecewise ramps retain the equal-power shape and can be interrupted at any point.
    // Native value curves leave a truncated interval that rejects overlapping pause fades.
    if (p.linearRampToValueAtTime) {
      for (let i = 1; i < curve.length; i++) p.linearRampToValueAtTime(curve[i], now + duration * i / 63);
    }
    else p.setTargetAtTime(up ? 1 : 0, now, duration / 5);
  }
  function stop(record, duration = 0.06) {
    record.stopped = true; fade(record, false, duration);
    record.source.stop(ctx.currentTime + duration);
  }
  function start(kind, buffer) {
    // Rapid restarts never accumulate old crossfades beneath the new track.
    for (const source of sources) if (source !== current) stop(source);
    const previous = current, source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = buffer; source.loop = kind === "gameplay";
    if (source.loop) {
      source.loopStart = Math.min(MUSIC_LOOP.start, buffer.duration / 2);
      source.loopEnd = Math.min(MUSIC_LOOP.end, buffer.duration);
    }
    source.connect(gain); gain.connect(output); gain.gain.value = 0;
    const record = { kind, buffer, source, gain, offset: resumeOffset, started: ctx.currentTime, stopped: false };
    current = record; sources.add(record);
    source.onended = () => {
      sources.delete(record); source.disconnect(); gain.disconnect();
      if (current !== record || record.stopped) return;
      current = null; resumeOffset = buffer.duration;
      if (kind === "ending") endingFinished = true;
    };
    source.start(ctx.currentTime, resumeOffset);
    fade(record, true, previous ? MUSIC_FADE : 0.7);
    if (previous) stop(previous, MUSIC_FADE);
  }
  function update({ ending = false, paused = false } = {}) {
    const next = ending ? "ending" : "gameplay", hold = paused || ctx.state !== "running";
    if (next !== wanted) {
      wanted = next; epoch += 1; pending = null;
      resumeOffset = next === "ending" ? MUSIC_ENDING_START : 0; endingFinished = false;
    }
    if (hold) {
      if (current) {
        resumeOffset = current.kind === wanted ? position(current) : wanted === "ending" ? MUSIC_ENDING_START : 0;
        for (const source of sources) stop(source);
        current = null;
      }
      if (!held) { epoch += 1; pending = null; }
      held = true;
      return;
    }
    held = false;
    if (current?.kind === wanted || pending?.kind === wanted || failed.has(wanted) || (wanted === "ending" && endingFinished)) return;
    const kind = wanted, stamp = epoch;
    pending = { kind, stamp };
    getBuffer(kind).then(buffer => {
      if (stamp !== epoch) return;
      pending = null;
      if (held || ctx.state !== "running") return;
      if (buffer) start(kind, buffer);
    });
  }
  return { update, hasFailed: kind => failed.has(kind), state: () => ({ wanted, current: current?.kind ?? null, paused: held,
    loading: pending?.kind ?? null, endingFinished, active: sources.size, fading: [...sources].filter(s => s.stopped).length,
    offset: Number(position(current).toFixed(2)), failed: [...failed],
    buffers: Object.fromEntries([...buffers].map(([kind, b]) => [kind, { seconds: b.duration, sampleRate: b.sampleRate, channels: b.numberOfChannels }])) }) };
}

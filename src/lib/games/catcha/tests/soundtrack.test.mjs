import test from "node:test";
import assert from "node:assert/strict";
import { createSoundtrack, MUSIC_FADE, MUSIC_LOOP, MUSIC_ENDING_START } from "../soundtrack.js";

function fixture({ delayed = false, missing = false } = {}) {
  const sources = [], pending = [], loads = [];
  const node = () => ({ connect() {}, disconnect() {} });
  const param = () => ({ value: 0, ramps: [], cancelScheduledValues() {}, setValueAtTime(n) { this.value = n; },
    linearRampToValueAtTime(value, time) { this.ramps.push({ value, time }); }, setTargetAtTime() {} });
  const ctx = { currentTime: 0, state: "running", createGain: () => ({ ...node(), gain: param() }),
    createBufferSource: () => {
      const s = { ...node(), start(time, offset) { Object.assign(this, { started: time, offset }); }, stop(time) { this.stopped = time; } };
      sources.push(s); return s;
    } };
  const soundtrack = createSoundtrack({ context: ctx, output: node(), load: kind => {
    loads.push(kind); const buffer = missing ? null : { duration: kind === "gameplay" ? 84 : 59.7, sampleRate: 32000, numberOfChannels: 2 };
    return delayed ? new Promise(resolve => pending.push(() => resolve(buffer))) : buffer;
  } });
  const flush = async () => { for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve)); };
  return { soundtrack, ctx, sources, pending, loads, flush };
}

test("gameplay loops its prepared seam and crossfades once into the ending at nine seconds", async () => {
  const { soundtrack: music, ctx, sources, loads, flush } = fixture();
  music.update(); await flush();
  const game = sources[0]; assert.equal(game.loop, true);
  assert.equal(game.loopStart, MUSIC_LOOP.start); assert.equal(game.loopEnd, MUSIC_LOOP.end);
  ctx.currentTime = 90; assert.equal(music.state().offset, 28.67);
  music.update({ ending: true }); await flush();
  assert.equal(sources.length, 2); assert.equal(sources[1].loop, false);
  assert.equal(sources[1].offset, 9); assert.equal(game.stopped, 90 + MUSIC_FADE);
  music.update({ ending: true }); await flush(); assert.equal(sources.length, 2);
  sources[1].onended(); music.update({ ending: true }); await flush();
  assert.equal(music.state().endingFinished, true); assert.equal(sources.length, 2);
  music.update(); await flush(); assert.equal(sources.length, 3); assert.deepEqual(loads, ["gameplay", "ending"]);
});

test("pause/mute preserves the selected song's playhead and suspended contexts do not start sources", async () => {
  const { soundtrack: music, ctx, sources, flush } = fixture();
  music.update({ ending: true }); await flush();
  ctx.currentTime = 9; music.update({ ending: true, paused: true });
  ctx.currentTime = 30; music.update({ ending: true, paused: true }); assert.equal(sources.length, 1);
  music.update({ ending: true }); await flush(); assert.equal(sources[1].offset, MUSIC_ENDING_START + 9);
  ctx.state = "suspended"; ctx.currentTime = 34; music.update({ ending: true });
  ctx.currentTime = 60; music.update({ ending: true }); await flush(); assert.equal(sources.length, 2);
  ctx.state = "running"; music.update({ ending: true }); await flush(); assert.equal(sources[2].offset, MUSIC_ENDING_START + 13);
});

test("late decodes cannot restart a song after the player changes screens or pauses", async () => {
  const { soundtrack: music, sources, pending, flush } = fixture({ delayed: true });
  music.update(); await flush(); music.update({ ending: true }); await flush();
  pending[0](); await flush(); assert.equal(sources.length, 0);
  music.update({ ending: true, paused: true }); pending[1](); await flush(); assert.equal(sources.length, 0);
  music.update({ ending: true }); await flush(); assert.equal(sources.length, 1); assert.equal(sources[0].loop, false);
  assert.equal(sources[0].offset, 9);
});

test("missing music is reported once without repeated fetches or a broken transport", async () => {
  const { soundtrack: music, loads, sources, flush } = fixture({ missing: true });
  music.update(); await flush(); music.update(); await flush();
  assert.equal(music.hasFailed("gameplay"), true); assert.deepEqual(loads, ["gameplay"]); assert.equal(sources.length, 0);
});

test("a decode completed during an audio interruption can start when the context resumes", async () => {
  const { soundtrack: music, ctx, pending, sources, flush } = fixture({ delayed: true });
  music.update(); await flush();
  ctx.state = "suspended"; pending[0](); await flush(); assert.equal(sources.length, 0);
  ctx.state = "running"; music.update(); await flush(); assert.equal(sources.length, 1);
});

test("a pause during a crossfade stops both songs and resumes the ending at its current position", async () => {
  const { soundtrack: music, ctx, sources, flush } = fixture();
  music.update(); await flush(); ctx.currentTime = 2;
  music.update({ ending: true }); await flush(); ctx.currentTime = 2.2;
  music.update({ ending: true, paused: true });
  assert(sources.every(s => s.stopped <= 2.261));
  ctx.currentTime = 10; music.update({ ending: true }); await flush();
  assert(Math.abs(sources[2].offset - (MUSIC_ENDING_START + 0.2)) < 0.001);
});

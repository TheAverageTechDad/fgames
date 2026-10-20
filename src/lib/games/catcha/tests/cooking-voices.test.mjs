import test from "node:test";
import assert from "node:assert/strict";

// Exercise the actual audio module with an advancing audio clock and controllable decodes.
// No speaker/device is needed to check scheduling, mute, or late-load cancellation.
let instance = 0;
async function setup({ delayed = false } = {}) {
  const sources = [], decodes = [];
  const param = () => ({ value: 0, setValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const node = () => ({ gain: param(), frequency: param(), Q: param(), pan: param(),
    connect() {}, disconnect() {} });
  const context = { currentTime: 100, state: "running", sampleRate: 48000, destination: {},
    resume: async () => {}, createGain: node, createDelay: () => ({ ...node(), delayTime: param() }),
    createBiquadFilter: node, createStereoPanner: node,
    createDynamicsCompressor: () => Object.assign(node(), Object.fromEntries(["threshold", "knee", "ratio", "attack", "release"].map(k => [k, param()]))),
    createBuffer: (_, size) => ({ getChannelData: () => new Float32Array(size) }),
    decodeAudioData: bytes => {
      const buffer = { duration: 1.5, url: new TextDecoder().decode(bytes) };
      return delayed ? new Promise(resolve => decodes.push(() => resolve(buffer))) : Promise.resolve(buffer);
    },
    createBufferSource: () => {
      const source = { ...node(), start(t) { this.started = t; }, stop(t) { this.stopped = t; } };
      sources.push(source); return source;
    },
  };
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  globalThis.window = { AudioContext: class { constructor() { return context; } }, addEventListener() {} };
  globalThis.fetch = async url => ({ arrayBuffer: async () => new TextEncoder().encode(url).buffer });
  const audio = await import(`../audio.js?voice-test=${++instance}`);
  audio.initAudio();
  const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
  await flush();
  return { audio, context, sources, decodes, flush };
}

test("cooking delivery precedes Dad; optional baby reactions respect the speech gap and cooldown", async () => {
  const { audio, context, flush } = await setup();
  assert.equal(audio.playCookingServe(-0.4), true);
  assert.equal(audio.playCookingCheer("sumptuous"), true);
  assert.equal(audio.playCookingYum(0.4, 1), false);
  await flush();
  const log = audio.cookingVoiceState().recent;
  assert.deepEqual(log.map(x => x.speaker), ["chef", "dad"]);
  assert.ok(log[1].start >= log[0].end + 0.19);
  context.currentTime = log[1].end + 1;
  assert.equal(audio.playCookingYum(0.4, 1), true);
  await flush();
  context.currentTime += 3;
  assert.equal(audio.playCookingYum(0.4, 1), false);
  context.currentTime += 7;
  assert.equal(audio.playCookingYum(0.4, 1), true);
});

test("reset discards a recording that finishes decoding after switching games", async () => {
  const { audio, sources, decodes, flush } = await setup({ delayed: true });
  assert.equal(audio.playCookingServe(), true);
  audio.resetCookingVoices();
  for (const finish of decodes) finish();
  await flush();
  assert.equal(sources.length, 0);
  assert.equal(audio.cookingVoiceState().pending, 0);
});

test("muting stops scheduled cooking dialogue and blocks new reactions; tidy-up keeps its own cheer", async () => {
  const { audio, sources, flush } = await setup();
  audio.playCookingServe(); audio.playCookingCheer("yummy");
  await flush();
  audio.setSfxMuted(true);
  assert.ok(sources.every(s => s.stopped !== undefined));
  assert.equal(audio.playCookingServe(), false);
  assert.equal(audio.playCookingYum(0, 1), false);
  audio.setSfxMuted(false);
  audio.playCheer("excellent");
  await flush();
  assert.match(sources.at(-1).buffer.url, /dad-excellent\.m4a/);
});

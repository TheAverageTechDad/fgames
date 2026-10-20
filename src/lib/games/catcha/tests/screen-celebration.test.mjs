import test from "node:test";
import assert from "node:assert/strict";
import { createScreenCelebration } from "../screen-celebration.js";

function capture(effect, width, height) {
  const positions = [];
  const g = { save() {}, restore() {}, rotate() {}, scale() {}, fillRect() {},
    translate(x, y) { positions.push([x / width, y / height]); } };
  effect.paint(g, width, height);
  return positions;
}

test("the finale reaches the screen's sides and upper/lower areas on phones and tablets", () => {
  const effect = createScreenCelebration(); effect.burst(7); effect.step(.7);
  for (const [width, height] of [[844, 390], [1024, 768]]) {
    const positions = capture(effect, width, height);
    assert(positions.length > 100);
    assert(positions.some(([x]) => x < .1)); assert(positions.some(([x]) => x > .9));
    assert(positions.some(([, y]) => y < .1)); assert(positions.some(([, y]) => y > .75));
  }
});

test("the party is reproducible, ends by itself and resets cleanly for the next run", () => {
  const a = createScreenCelebration(), b = createScreenCelebration();
  a.burst(1337); b.burst(1337); a.step(.5); b.step(.2); b.step(.3);
  assert.deepEqual(capture(a, 844, 390), capture(b, 844, 390));
  a.step(4); assert.equal(a.active(), false); assert.deepEqual(capture(a, 844, 390), []);
  a.burst(7); a.reset(); assert.equal(a.snapshot().remaining, 0);
  assert.deepEqual(capture(a, 844, 390), []);
});

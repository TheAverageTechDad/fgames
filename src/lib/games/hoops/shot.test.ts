import { describe, expect, it } from 'vitest';
import { createBall, stepBall, type BallEvent } from './ball';
import { RIM, type Vec3 } from './court';
import { S_IDEAL, launchVelocity, power, shotVelocity, strength } from './shot';

const ideal = (minSide: number) => ({ dx: 0, dy: -0.3 * minSide, seconds: 0.15, minSide }); // strength 0.6
const fly = (release: Vec3, v: Vec3) => { const ball = createBall(release, v), events: BallEvent[] = []; for (let i = 0; i < 180; i++) events.push(...stepBall(ball, 1 / 60)); return events; };

describe('shot', () => {
  it('gives the same strength for the same fraction of the screen on any phone', () => {
    expect(strength(ideal(375))).toBeCloseTo(strength(ideal(430)), 6);
    expect(strength(ideal(390))).toBeCloseTo(S_IDEAL, 6);
  });
  it('never lets a stronger swipe shoot softer', () => {
    let last = 0;
    for (let s = 0.1; s < 2; s += 0.05) { const p = power(s, false); expect(p).toBeGreaterThanOrEqual(last); last = p; }
  });
  it('keeps a near-ideal swipe on target and has a narrower band beyond the arc', () => {
    expect(power(S_IDEAL * 1.07, false)).toBe(1);
    expect(power(S_IDEAL * 1.07, true)).toBeGreaterThan(1);
  });
  it('survives a swipe with no measurable duration', () => {
    expect(Number.isFinite(strength({ dx: 0, dy: -100, seconds: 0, minSide: 390 }))).toBe(true);
  });
  it('launchVelocity drops the ball through the rim', () => {
    const release = { x: 1.5, y: 2.1, z: 5 };
    expect(fly(release, launchVelocity(release, RIM)).some(e => e.type === 'score')).toBe(true);
  });
  it('launches finitely from under the rim', () => {
    const v = launchVelocity({ x: RIM.x, y: 2.1, z: RIM.z + 0.05 }, RIM);
    expect([v.x, v.y, v.z].every(Number.isFinite)).toBe(true);
  });
  it('scores the same comfortable swipe from inside and beyond the arc', () => {
    for (const release of [{ x: 0, y: 2.1, z: 3 }, { x: -2, y: 2.1, z: 6.2 }]) {
      const dz = RIM.z - release.z, dx = RIM.x - release.x, len = Math.hypot(dx, dz);
      const swipe = { dx: (dx / len) * 117, dy: (dz / len) * 117, seconds: 0.15, minSide: 390 };
      expect(fly(release, shotVelocity(release, swipe)).some(e => e.type === 'score')).toBe(true);
    }
  });
  it('scores a perfect swipe from close in, the wings and beyond the arc, cleanly from mid-range', () => {
    const spots = [[0, 1.9], [1, 2.1], [-1.2, 1.7], [-2.5, 2], [3, 1.5], [0, 4], [2, 3], [3, 5], [-2.5, 5.5]];
    for (const [x, z] of spots) {
      const release = { x, y: 2.1, z }, dz = RIM.z - z, dx = RIM.x - x, len = Math.hypot(dx, dz);
      const events = fly(release, shotVelocity(release, { dx: (dx / len) * 117, dy: (dz / len) * 117, seconds: 0.15, minSide: 390 }));
      expect(events.some(e => e.type === 'score'), `scores from ${x}, ${z}`).toBe(true);
      if (len > 2.5) expect(events.findIndex(e => e.type === 'rim') < 0 || events.findIndex(e => e.type === 'rim') > events.findIndex(e => e.type === 'score'), `clean from ${x}, ${z}`).toBe(true);
    }
  });
  it('falls short on a weak swipe and misses on a sideways one', () => {
    const release = { x: 0, y: 2.1, z: 5 };
    expect(fly(release, shotVelocity(release, { dx: 0, dy: -40, seconds: 0.2, minSide: 390 })).some(e => e.type === 'score')).toBe(false);
    expect(fly(release, shotVelocity(release, { dx: 117, dy: -20, seconds: 0.15, minSide: 390 })).some(e => e.type === 'score')).toBe(false);
  });
});

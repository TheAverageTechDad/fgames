import { describe, expect, it } from 'vitest';
import { createBall, stepBall, type BallEvent } from './ball';
import { RIM, type Vec3 } from './court';
import { MAX_PULL, P_IDEAL, launchVelocity, power, shotVelocity, strength } from './shot';

const fly = (release: Vec3, v: Vec3) => { const ball = createBall(release, v), events: BallEvent[] = []; for (let i = 0; i < 180; i++) events.push(...stepBall(ball, 1 / 60)); return events; };
/** A pull straight away from the rim, `px` long: the ball goes the other way, at the rim. */
const pullFrom = (release: Vec3, px: number) => {
  const dz = RIM.z - release.z, dx = RIM.x - release.x, len = Math.hypot(dx, dz);
  return { dx: (-dx / len) * px, dy: (-dz / len) * px, minSide: 390 };
};
const ideal = 0.2 * 390;

describe('shot', () => {
  it('gives the same strength for the same fraction of the screen on any phone', () => {
    expect(strength({ dx: 0, dy: 0.2 * 375, minSide: 375 })).toBeCloseTo(strength({ dx: 0, dy: 0.2 * 430, minSide: 430 }), 6);
    expect(strength({ dx: 0, dy: ideal, minSide: 390 })).toBeCloseTo(P_IDEAL, 6);
  });
  it('caps an over-long pull', () => {
    expect(strength({ dx: 0, dy: 900, minSide: 390 })).toBe(MAX_PULL);
  });
  it('never lets a longer pull shoot softer', () => {
    let last = 0;
    for (let s = 0.02; s < MAX_PULL; s += 0.01) { const p = power(s, false); expect(p).toBeGreaterThanOrEqual(last); last = p; }
  });
  it('keeps a near-ideal pull on target and has a narrower band beyond the arc', () => {
    expect(power(P_IDEAL * 1.07, false)).toBe(1);
    expect(power(P_IDEAL * 1.07, true)).toBeGreaterThan(1);
  });
  it('gives a perfect jump-shot release a wider sweet band', () => {
    expect(power(P_IDEAL * 1.12, false, 0)).toBeGreaterThan(1);
    expect(power(P_IDEAL * 1.12, false, 1)).toBe(1);
  });
  it('helps the aim more on a perfect jump-shot release', () => {
    const release = { x: 0, y: 2.1, z: 5 }, off = { dx: Math.sin(0.25) * ideal, dy: Math.cos(0.25) * ideal, minSide: 390 };
    const heading = (bonus: number) => { const v = shotVelocity(release, off, bonus); return Math.abs(Math.atan2(v.x, -v.z)); };
    expect(heading(1)).toBeLessThan(heading(0));
  });
  it('launchVelocity drops the ball through the rim', () => {
    const release = { x: 1.5, y: 2.1, z: 5 };
    expect(fly(release, launchVelocity(release, RIM)).some(e => e.type === 'score')).toBe(true);
  });
  it('launches finitely from under the rim', () => {
    const v = launchVelocity({ x: RIM.x, y: 2.1, z: RIM.z + 0.05 }, RIM);
    expect([v.x, v.y, v.z].every(Number.isFinite)).toBe(true);
  });
  it('scores the ideal pull from close in, the wings and beyond the arc, cleanly from mid-range', () => {
    const spots = [[0, 1.9], [1, 2.1], [-1.2, 1.7], [-2.5, 2], [3, 1.5], [0, 4], [2, 3], [3, 5], [-2.5, 5.5]];
    for (const [x, z] of spots) {
      const release = { x, y: 2.1, z }, events = fly(release, shotVelocity(release, pullFrom(release, ideal)));
      expect(events.some(e => e.type === 'score'), `scores from ${x}, ${z}`).toBe(true);
      const rim = events.findIndex(e => e.type === 'rim'), score = events.findIndex(e => e.type === 'score');
      if (Math.hypot(x - RIM.x, z - RIM.z) > 2.5) expect(rim < 0 || rim > score, `clean from ${x}, ${z}`).toBe(true);
    }
  });
  it('eases the aim help off gradually instead of snapping', () => {
    const release = { x: 0, y: 2.1, z: 5 };
    const heading = (deg: number) => { const a = (deg * Math.PI) / 180, v = shotVelocity(release, { dx: Math.sin(a) * ideal, dy: Math.cos(a) * ideal, minSide: 390 }); return Math.atan2(v.x, -v.z) * 180 / Math.PI; };
    for (let deg = -85; deg < 85; deg++) expect(Math.abs(heading(deg + 1) - heading(deg))).toBeLessThan(2);
    expect(Math.abs(heading(15))).toBeLessThan(2); // a little off still goes at the rim
  });
  it('aims by where the rim is on screen, not by court directions', () => {
    // From the wing the rim sits up the screen even though on court it is almost straight across: pull straight down.
    const release = { x: 3, y: 2.1, z: 1.5 };
    expect(fly(release, shotVelocity(release, { dx: 0, dy: ideal, minSide: 390, rimAngle: -Math.PI / 2 })).some(e => e.type === 'score')).toBe(true);
  });
  it('falls short on a small pull, overshoots a long one and misses a sideways one', () => {
    const release = { x: 0, y: 2.1, z: 5 };
    expect(fly(release, shotVelocity(release, pullFrom(release, 30))).some(e => e.type === 'score')).toBe(false);
    expect(fly(release, shotVelocity(release, pullFrom(release, 160))).some(e => e.type === 'score')).toBe(false);
    expect(fly(release, shotVelocity(release, { dx: -ideal, dy: 10, minSide: 390 })).some(e => e.type === 'score')).toBe(false);
  });
});

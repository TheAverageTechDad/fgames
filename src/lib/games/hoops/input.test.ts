import { describe, expect, it } from 'vitest';
import { claimsShot, readShotGesture } from './input';

describe('hoops gestures', () => {
  const dad = { x: 200, y: 500, radius: 28 };
  it('claims a touch on Dad only while he can shoot', () => {
    expect(claimsShot({ x: 220, y: 510 }, dad)).toBe(true);
    expect(claimsShot({ x: 240, y: 500 }, dad)).toBe(false);
    expect(claimsShot({ x: 200, y: 500 }, null)).toBe(false);
  });
  it('turns a swipe past 24 px into a shot, a quick tap into a jump, and a slow nudge into nothing', () => {
    expect(readShotGesture({ x: 0, y: 0, t: 0 }, { x: 0, y: -120, t: 150 }, 390)).toEqual({ kind: 'shot', swipe: { dx: 0, dy: -120, seconds: 0.15, minSide: 390 } });
    expect(readShotGesture({ x: 0, y: 0, t: 0 }, { x: 3, y: -3, t: 120 }, 390)).toEqual({ kind: 'jump' });
    expect(readShotGesture({ x: 0, y: 0, t: 0 }, { x: 10, y: -10, t: 400 }, 390)).toEqual({ kind: 'none' });
  });
});

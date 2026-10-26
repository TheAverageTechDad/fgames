import { describe, expect, it } from 'vitest';
import { claimsShot, readPull } from './input';

describe('hoops gestures', () => {
  const dad = { x: 200, y: 500, radius: 28 };
  it('claims a touch on Dad only while he has the ball', () => {
    expect(claimsShot({ x: 220, y: 510 }, dad)).toBe(true);
    expect(claimsShot({ x: 240, y: 500 }, dad)).toBe(true); // a little off him still counts: he's small on a phone
    expect(claimsShot({ x: 260, y: 500 }, dad)).toBe(false);
    expect(claimsShot({ x: 200, y: 500 }, null)).toBe(false);
  });
  it('shoots a pull of 20 px or more and cancels one slid back onto Dad', () => {
    expect(readPull({ x: 100, y: 100 }, { x: 100, y: 180 }, 390)).toEqual({ kind: 'shoot', pull: { dx: 0, dy: 80, minSide: 390 } });
    expect(readPull({ x: 100, y: 100 }, { x: 108, y: 110 }, 390)).toEqual({ kind: 'cancel' });
  });
});

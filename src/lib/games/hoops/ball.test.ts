import { describe, expect, it } from 'vitest';
import { createBall, stepBall, type Ball, type BallEvent } from './ball';
import { BALL_R, BOARD, RIM, inBounds, isTwoPointer } from './court';

// Whole frame counts: summing a float dt can add a frame and break the fps comparison.
const run = (ball: Ball, seconds: number, dt = 1 / 60) => { const events: BallEvent[] = []; for (let i = 0; i < Math.round(seconds / dt); i++) events.push(...stepBall(ball, dt)); return events; };

describe('court', () => {
  it('scores two beyond the arc and one inside', () => {
    expect(isTwoPointer({ x: 0, z: RIM.z + 4.6 })).toBe(true);
    expect(isTwoPointer({ x: 0, z: RIM.z + 4.4 })).toBe(false);
  });
  it('knows the boundaries', () => {
    expect(inBounds({ x: 4.4, z: 7.9 })).toBe(true);
    expect(inBounds({ x: 0, z: -0.1 })).toBe(false);
  });
});

describe('ball', () => {
  it('bounces lower each time and comes to rest on the floor', () => {
    const ball = createBall({ x: 0, y: 2, z: 5 });
    const floors = run(ball, 5).filter(e => e.type === 'floor');
    expect(floors.length).toBeGreaterThan(2);
    expect(floors[1].speed).toBeLessThan(floors[0].speed);
    expect(ball.p.y).toBeCloseTo(BALL_R, 2);
  });
  it('lands in the same place at 30 and 120 fps', () => {
    const a = createBall({ x: 0, y: 2, z: 5 }, { x: 1, y: 3, z: -1 }), b = createBall({ x: 0, y: 2, z: 5 }, { x: 1, y: 3, z: -1 });
    run(a, 1.5, 1 / 30); run(b, 1.5, 1 / 120);
    expect(a.p.x).toBeCloseTo(b.p.x, 5); expect(a.p.z).toBeCloseTo(b.p.z, 5);
  });
  it('scores once when dropped through the middle of the rim', () => {
    const ball = createBall({ x: RIM.x, y: RIM.y + 1, z: RIM.z });
    expect(run(ball, 2).filter(e => e.type === 'score')).toHaveLength(1);
  });
  it('does not score coming up through the rim from below', () => {
    const ball = createBall({ x: RIM.x, y: RIM.y - 1, z: RIM.z }, { x: 0, y: 5, z: 0 });
    expect(run(ball, 0.4).filter(e => e.type === 'score')).toHaveLength(0);
  });
  it('bounces off the rim when dropped on its front edge', () => {
    const ball = createBall({ x: RIM.x, y: RIM.y + 1, z: RIM.z + RIM.radius });
    const events = run(ball, 1);
    expect(events.some(e => e.type === 'rim')).toBe(true);
    expect(events.some(e => e.type === 'score')).toBe(false);
  });
  it('rebounds off the backboard', () => {
    const ball = createBall({ x: 0, y: 3.7, z: 2 }, { x: 0, y: 0, z: -6 }); // high enough to clear the rim on the way back
    const events = run(ball, 0.5);
    expect(events.some(e => e.type === 'board')).toBe(true);
    expect(ball.v.z).toBeGreaterThan(0);
  });
  it('does not tunnel through the backboard on a 0.1 s frame', () => {
    const ball = createBall({ x: 0, y: 3.4, z: 2 }, { x: 0, y: 0, z: -40 });
    stepBall(ball, 0.1);
    expect(ball.p.z).toBeGreaterThan(BOARD.z);
  });
  it('rolls off a ball resting on the rim', () => {
    const ball = createBall({ x: RIM.x, y: RIM.y + BALL_R + RIM.tube, z: RIM.z + RIM.radius });
    run(ball, 3);
    expect(ball.p.y).toBeLessThan(RIM.y - 0.5);
  });
  it('reports out of bounds once when it lands outside', () => {
    const ball = createBall({ x: 0, y: 1, z: 9 });
    expect(run(ball, 2).filter(e => e.type === 'out')).toHaveLength(1);
  });
});

import { describe, expect, it } from 'vitest';
import { RIM, BALL_R } from './court';
import { createShootaround, heldBallPosition, jump, startShot, stepShootaround, type GameEvent, type Move, type Shootaround } from './game';

const still: Move = { x: 0, z: 0, sprint: false };
const good = { dx: 0, dy: -117, seconds: 0.15, minSide: 390 };
const run = (s: Shootaround, seconds: number, move = still) => { const events: GameEvent[] = []; for (let i = 0; i < Math.round(seconds * 60); i++) events.push(...stepShootaround(s, 1 / 60, move)); return events; };

describe('shootaround', () => {
  it('never loses the dribble while sprinting around', () => {
    const s = createShootaround();
    for (let i = 0; i < 600; i++) {
      stepShootaround(s, 1 / 60, { x: Math.cos(i / 40), z: Math.sin(i / 40), sprint: i % 200 > 100 });
      expect(s.mode).toBe('held');
      expect(Math.hypot(s.ball.p.x - s.player.x, s.ball.p.z - s.player.z)).toBeLessThan(0.8);
    }
  });
  it('bounces the dribble off the floor faster when moving', () => {
    const count = (move: Move) => run(createShootaround(), 2, move).filter(e => e.type === 'dribble').length;
    expect(count({ x: 1, z: 0, sprint: false })).toBeGreaterThan(count(still));
  });
  it('keeps Dad on the court', () => {
    const s = createShootaround();
    run(s, 5, { x: 1, z: 1, sprint: true });
    expect(s.player.x).toBeLessThanOrEqual(4.5); expect(s.player.z).toBeLessThanOrEqual(8);
  });
  it('releases after the windup and scores a good shot once, worth one inside the arc', () => {
    const s = createShootaround();
    expect(startShot(s, good)).toBe(true);
    expect(s.mode).toBe('windup');
    const events = run(s, 3);
    expect(events.filter(e => e.type === 'shot')).toHaveLength(1);
    expect(events.filter(e => e.type === 'score')).toHaveLength(1);
    expect([s.score, s.made, s.shots]).toEqual([1, 1, 1]);
  });
  it('scores two from beyond the arc', () => {
    const s = createShootaround(); s.player.z = RIM.z + 5;
    startShot(s, good); run(s, 3);
    expect(s.score).toBe(2);
  });
  it('cannot shoot without the ball', () => {
    const s = createShootaround();
    startShot(s, good); run(s, 0.3);
    expect(startShot(s, good)).toBe(false);
  });
  it('picks up a loose ball within reach', () => {
    const s = createShootaround();
    s.mode = 'loose'; s.ball.p = { x: s.player.x + 0.4, y: BALL_R, z: s.player.z }; s.ball.v = { x: 0, y: 0, z: 0 };
    expect(run(s, 0.1).some(e => e.type === 'pickup')).toBe(true);
    expect(s.mode).toBe('held');
  });
  it("returns an out-of-bounds ball to Dad's hands", () => {
    const s = createShootaround();
    s.mode = 'loose'; s.ball.p = { x: 1, y: 1, z: -0.5 }; s.ball.v = { x: 0, y: 0, z: 0 };
    run(s, 0.5); expect(s.mode).toBe('reset');
    run(s, 1); expect(s.mode).toBe('held');
    expect(heldBallPosition(s).y).toBeLessThanOrEqual(1.1);
  });
  it('jumps with a crouch first and lands', () => {
    const s = createShootaround();
    jump(s); run(s, 0.05); expect(s.player.y).toBe(0);
    run(s, 0.2); expect(s.player.y).toBeGreaterThan(0.3);
    run(s, 1); expect(s.player.y).toBe(0);
  });
});

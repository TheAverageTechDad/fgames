import { describe, expect, it } from 'vitest';
import { ARC_R, BALL_R, FENCE, POLE, RIM } from './court';
import { RUN_SPEED, cancelAim, createShootaround, heldBallPosition, jump, releasePoint, shoot, startAim, stepShootaround, type GameEvent, type Move, type Shootaround } from './game';

const still: Move = { x: 0, z: 0, sprint: false };
const ideal = { dx: 0, dy: 78, minSide: 390 }; // pull straight back: Dad starts straight out from the rim
const run = (s: Shootaround, seconds: number, move = still) => { const events: GameEvent[] = []; for (let i = 0; i < Math.round(seconds * 60); i++) events.push(...stepShootaround(s, 1 / 60, move)); return events; };
const speed = (s: Shootaround) => Math.hypot(s.player.vx, s.player.vz);

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
  it('speeds up and slows down instead of snapping', () => {
    const s = createShootaround(), right = { x: 1, z: 0, sprint: false };
    run(s, 1 / 60, right); expect(speed(s)).toBeLessThan(RUN_SPEED * 0.5);
    run(s, 0.6, right); expect(speed(s)).toBeGreaterThan(RUN_SPEED * 0.95);
    run(s, 1 / 60); expect(speed(s)).toBeGreaterThan(RUN_SPEED * 0.5);
    run(s, 0.6); expect(speed(s)).toBeLessThan(0.05);
  });
  it('keeps Dad inside the fence and out of the pole', () => {
    const s = createShootaround();
    run(s, 5, { x: 1, z: 1, sprint: true });
    expect(s.player.x).toBeLessThan(FENCE.side); expect(s.player.z).toBeLessThan(FENCE.front);
    s.player.x = 1; run(s, 4, { x: 0, z: -1, sprint: false });
    expect(s.player.z).toBeLessThan(0); // he can walk behind the baseline
    s.player.x = POLE.x; run(s, 2, { x: 0, z: 1, sprint: false }); run(s, 4, { x: 0, z: -1, sprint: false });
    expect(Math.hypot(s.player.x - POLE.x, s.player.z - POLE.z)).toBeGreaterThan(0.3);
    expect(s.player.z).toBeGreaterThan(FENCE.back);
  });
  it('plants his feet and faces the rim while aiming', () => {
    const s = createShootaround(); s.player.x = 2;
    run(s, 0.3, { x: 1, z: 0, sprint: false });
    expect(startAim(s)).toBe(true); expect(s.mode).toBe('aim');
    const x = s.player.x;
    run(s, 0.3, { x: 1, z: 0, sprint: false });
    expect(s.player.x).toBe(x);
    expect(s.player.yaw).toBeCloseTo(Math.atan2(RIM.x - s.player.x, RIM.z - s.player.z), 5);
    expect(heldBallPosition(s)).toEqual(releasePoint(s));
  });
  it('goes back to the dribble when the aim is cancelled', () => {
    const s = createShootaround(); startAim(s); cancelAim(s);
    expect(s.mode).toBe('held');
  });
  it('releases the moment the thumb lets go, from where the ball was, and scores the ideal pull once', () => {
    const s = createShootaround(); startAim(s);
    const from = releasePoint(s), event = shoot(s, ideal);
    expect(event?.type).toBe('shot'); expect(s.mode).toBe('flight'); expect(s.ball.p).toEqual(from);
    const events = run(s, 3);
    expect(events.filter(e => e.type === 'score')).toHaveLength(1);
    expect([s.score, s.made, s.shots]).toEqual([1, 1, 1]);
  });
  it('scores two from beyond the arc', () => {
    const s = createShootaround(); s.player.z = RIM.z + ARC_R + 0.8;
    startAim(s); shoot(s, ideal); run(s, 3);
    expect(s.score).toBe(2);
  });
  it('cannot aim or shoot without the ball', () => {
    const s = createShootaround();
    startAim(s); shoot(s, ideal); run(s, 0.3);
    expect(startAim(s)).toBe(false); expect(shoot(s, ideal)).toBeNull();
  });
  it('picks up a loose ball within reach', () => {
    const s = createShootaround();
    s.mode = 'loose'; s.ball.p = { x: s.player.x + 0.4, y: BALL_R, z: s.player.z }; s.ball.v = { x: 0, y: 0, z: 0 };
    expect(run(s, 0.1).some(e => e.type === 'pickup')).toBe(true);
    expect(s.mode).toBe('held');
  });
  for (const [where, p] of [['off the side', { x: FENCE.side - 0.6, y: 1.5, z: 3 }], ['behind the backboard', { x: 1.5, y: 1.5, z: -1 }]] as const) {
    it(`leaves a ball that goes out ${where} for Dad to walk over and fetch`, () => {
      const s = createShootaround();
      s.mode = 'loose'; s.ball.p = { ...p }; s.ball.v = { x: 0, y: 0, z: 0 };
      run(s, 4); // no toss back: it settles where it went and waits
      expect(Math.hypot(s.ball.p.x - s.player.x, s.ball.p.z - s.player.z)).toBeGreaterThan(2);
      let picked = false;
      for (let i = 0; i < 480 && !picked; i++) {
        const dx = s.ball.p.x - s.player.x, dz = s.ball.p.z - s.player.z, len = Math.hypot(dx, dz) || 1;
        picked = stepShootaround(s, 1 / 60, { x: dx / len, z: dz / len, sprint: false }).some(e => e.type === 'pickup');
      }
      expect(picked).toBe(true);
    });
  }
  it('jumps with a crouch first and lands', () => {
    const s = createShootaround();
    jump(s); run(s, 0.05); expect(s.player.y).toBe(0);
    run(s, 0.2); expect(s.player.y).toBeGreaterThan(0.3);
    run(s, 1); expect(s.player.y).toBe(0);
  });
});

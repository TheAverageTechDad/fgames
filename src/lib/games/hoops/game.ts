import { createBall, stepBall, type Ball, type BallEvent } from './ball';
import { BALL_R, COURT, isTwoPointer, type Vec3 } from './court';
import { shotVelocity, type Swipe } from './shot';

export type Mode = 'held' | 'windup' | 'flight' | 'loose' | 'reset';
export type Move = { x: number; z: number; sprint: boolean };
export type GameEvent = BallEvent | { type: 'dribble' | 'pickup' | 'jump'; at: Vec3 } | { type: 'shot'; value: 1 | 2; at: Vec3 };
export type Shootaround = {
  player: { x: number; y: number; z: number; yaw: number; vy: number; jumpT: number }; // jumpT < 0 when not crouching
  ball: Ball; mode: Mode; dribble: number; windupT: number; pending: Swipe | null; resetT: number;
  value: 1 | 2; score: number; shots: number; made: number;
};

// Pocket Farm's run speed and Catcha's sprint; the jump is the farm's (a 0.09 s crouch, then up).
export const RUN_SPEED = 3.6, SPRINT = 1.35, PICKUP_REACH = 0.6, HAND_HEIGHT = 1.0, RELEASE_HEIGHT = 2.1,
  WINDUP = 0.12, SHOT_HOP = 3, OUT_RESET = 1, CROUCH = 0.09, JUMP_V = 7.5, JUMP_GRAVITY = 30;
const DRIBBLE_RATE = { still: 1.6, moving: 2.2, sprint: 2.8 }; // bounces per second

export function createShootaround(): Shootaround {
  const s: Shootaround = {
    player: { x: 0, y: 0, z: 5.5, yaw: Math.PI, vy: 0, jumpT: -1 },
    ball: createBall({ x: 0, y: 0, z: 0 }), mode: 'held', dribble: 0, windupT: 0, pending: null, resetT: 0,
    value: 1, score: 0, shots: 0, made: 0
  };
  s.ball.p = heldBallPosition(s);
  return s;
}

/** Where the ball sits while Dad has it: bouncing beside his right hand, or above his head in the windup. */
export function heldBallPosition(s: Shootaround): Vec3 {
  const { player } = s, fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
  if (s.mode === 'windup') return { x: player.x + fx * 0.2, y: RELEASE_HEIGHT + player.y, z: player.z + fz * 0.2 };
  return {
    x: player.x + fx * 0.35 - fz * 0.25,
    y: BALL_R + (HAND_HEIGHT + player.y - BALL_R) * Math.abs(Math.cos(Math.PI * s.dribble)),
    z: player.z + fz * 0.35 + fx * 0.25
  };
}

const grounded = (s: Shootaround) => s.player.y === 0 && s.player.vy === 0;

export function startShot(s: Shootaround, swipe: Swipe): boolean {
  if (s.mode !== 'held') return false;
  s.mode = 'windup'; s.windupT = WINDUP; s.pending = swipe; s.value = isTwoPointer(s.player) ? 2 : 1;
  if (grounded(s)) s.player.vy = SHOT_HOP; // the small automatic shooting rise
  return true;
}

export function jump(s: Shootaround) {
  if (grounded(s) && s.player.jumpT < 0) s.player.jumpT = 0;
}

export function stepShootaround(s: Shootaround, dt: number, move: Move): GameEvent[] {
  const events: GameEvent[] = [], p = s.player;

  // Jump: crouch, then up under gravity.
  if (p.jumpT >= 0 && (p.jumpT += dt) >= CROUCH) { p.jumpT = -1; p.vy = JUMP_V; events.push({ type: 'jump', at: { x: p.x, y: 0, z: p.z } }); }
  if (p.y > 0 || p.vy > 0) {
    p.vy -= JUMP_GRAVITY * dt; p.y += p.vy * dt;
    if (p.y <= 0) { p.y = 0; p.vy = 0; }
  }

  // Movement in screen directions (the camera faces the hoop squarely); none during the windup.
  const amount = Math.min(1, Math.hypot(move.x, move.z));
  if (s.mode !== 'windup' && amount > 0.05) {
    const speed = RUN_SPEED * (move.sprint ? SPRINT : 1) * amount, ux = move.x / Math.hypot(move.x, move.z), uz = move.z / Math.hypot(move.x, move.z);
    p.x = Math.max(-COURT.halfWidth + 0.3, Math.min(COURT.halfWidth - 0.3, p.x + ux * speed * dt));
    p.z = Math.max(0.3, Math.min(COURT.depth, p.z + uz * speed * dt));
    p.yaw = Math.atan2(ux, uz);
  }

  if (s.mode === 'held') {
    const before = Math.floor(s.dribble + 0.5);
    s.dribble += dt * (amount <= 0.05 ? DRIBBLE_RATE.still : move.sprint ? DRIBBLE_RATE.sprint : DRIBBLE_RATE.moving);
    if (Math.floor(s.dribble + 0.5) > before) events.push({ type: 'dribble', at: { ...heldBallPosition(s), y: 0 } });
  }
  if (s.mode === 'windup' && (s.windupT -= dt) <= 0) {
    const release = { x: p.x, y: RELEASE_HEIGHT + p.y, z: p.z - 0.2 };
    s.ball = createBall(release, shotVelocity(release, s.pending!));
    s.mode = 'flight'; s.pending = null; s.shots++;
    events.push({ type: 'shot', value: s.value, at: release });
  }
  if (s.mode === 'held' || s.mode === 'windup') { s.ball.p = heldBallPosition(s); s.ball.v = { x: 0, y: 0, z: 0 }; return events; }
  if (s.mode === 'reset') {
    if ((s.resetT -= dt) <= 0) { s.mode = 'held'; s.ball = createBall(heldBallPosition(s)); }
    return events;
  }

  // In flight or loose, physics alone moves the ball. Any contact or a basket makes it a rebound Dad can grab.
  for (const e of stepBall(s.ball, dt)) {
    events.push(e);
    if (e.type === 'score') { s.score += s.value; s.made++; }
    if (e.type === 'out') { s.mode = 'reset'; s.resetT = OUT_RESET; s.ball.v = { x: 0, y: 0, z: 0 }; return events; }
    if (s.mode === 'flight') s.mode = 'loose';
  }
  if (s.mode === 'loose' && Math.hypot(s.ball.p.x - p.x, s.ball.p.z - p.z) < PICKUP_REACH && s.ball.p.y < 1.2 + p.y) {
    s.mode = 'held'; s.dribble = 0; s.ball.p = heldBallPosition(s);
    events.push({ type: 'pickup', at: { ...s.ball.p } });
  }
  return events;
}

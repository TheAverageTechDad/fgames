import { createBall, stepBall, type Ball, type BallEvent } from './ball';
import { BALL_R, FENCE, POLE, RIM, isTwoPointer, type Vec3 } from './court';
import { shotVelocity, type Pull } from './shot';

export type Mode = 'held' | 'aim' | 'flight' | 'loose';
export type Move = { x: number; z: number; sprint: boolean };
export type GameEvent = BallEvent | { type: 'dribble' | 'pickup' | 'jump'; at: Vec3 } | { type: 'shot'; value: 1 | 2; at: Vec3 };
export type Shootaround = {
  player: { x: number; y: number; z: number; vx: number; vz: number; yaw: number; vy: number; jumpT: number }; // jumpT < 0 when not crouching
  ball: Ball; mode: Mode; dribble: number;
  value: 1 | 2; score: number; shots: number; made: number;
};

// Pocket Farm's run speed and Catcha's sprint; the jump is the farm's (a 0.09 s crouch, then up).
// ACCEL/DECEL: how quickly he gets up to speed and pulls up (per second, exponential).
export const RUN_SPEED = 3.6, SPRINT = 1.35, ACCEL = 9, DECEL = 12, PICKUP_REACH = 0.6, HAND_HEIGHT = 1.0, RELEASE_HEIGHT = 1.85,
  SHOT_HOP = 3, CROUCH = 0.09, JUMP_V = 7.5, JUMP_GRAVITY = 30;
const DRIBBLE_RATE = { still: 1.6, moving: 2.2, sprint: 2.8 }; // bounces per second

export function createShootaround(): Shootaround {
  const s: Shootaround = {
    player: { x: 0, y: 0, z: 4, vx: 0, vz: 0, yaw: Math.PI, vy: 0, jumpT: -1 },
    ball: createBall({ x: 0, y: 0, z: 0 }), mode: 'held', dribble: 0,
    value: 1, score: 0, shots: 0, made: 0
  };
  s.ball.p = heldBallPosition(s);
  return s;
}

/** Above Dad's head, a little in front: where the ball sits while he aims and where it leaves his hands. */
export function releasePoint(s: Shootaround): Vec3 {
  const { player } = s;
  return { x: player.x + Math.sin(player.yaw) * 0.12, y: RELEASE_HEIGHT + player.y, z: player.z + Math.cos(player.yaw) * 0.12 };
}

/** Where the ball sits while Dad has it: bouncing beside his right hand, or above his head while he aims. */
export function heldBallPosition(s: Shootaround): Vec3 {
  if (s.mode === 'aim') return releasePoint(s);
  const { player } = s, fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
  return {
    x: player.x + fx * 0.2 - fz * 0.4,
    y: BALL_R + (HAND_HEIGHT + player.y - BALL_R) * Math.abs(Math.cos(Math.PI * s.dribble)),
    z: player.z + fz * 0.2 + fx * 0.4
  };
}

const grounded = (s: Shootaround) => s.player.y === 0 && s.player.vy === 0;
const faceRim = (s: Shootaround) => { s.player.yaw = Math.atan2(RIM.x - s.player.x, RIM.z - s.player.z); };

/** Dad gathers the ball overhead and plants his feet. */
export function startAim(s: Shootaround) {
  if (s.mode !== 'held') return false;
  s.mode = 'aim'; s.player.vx = s.player.vz = 0; faceRim(s);
  return true;
}
export function cancelAim(s: Shootaround) { if (s.mode === 'aim') s.mode = 'held'; }

/** Lets go: the ball leaves from where it sat, at once, and Dad hops through the shot. */
export function shoot(s: Shootaround, pull: Pull): GameEvent | null {
  if (s.mode !== 'aim' && s.mode !== 'held') return null;
  if (s.mode === 'held') faceRim(s);
  const release = releasePoint(s);
  s.value = isTwoPointer(s.player) ? 2 : 1;
  s.ball = createBall(release, shotVelocity(release, pull));
  s.mode = 'flight'; s.shots++; s.player.vx = s.player.vz = 0;
  if (grounded(s)) s.player.vy = SHOT_HOP;
  return { type: 'shot', value: s.value, at: release };
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

  // Movement in screen directions (the camera faces the hoop squarely), with momentum; feet planted while aiming.
  const amount = s.mode === 'aim' ? 0 : Math.min(1, Math.hypot(move.x, move.z));
  const top = RUN_SPEED * (move.sprint ? SPRINT : 1) * amount, len = Math.hypot(move.x, move.z) || 1;
  const k = Math.min(1, dt * (amount > 0.05 ? ACCEL : DECEL));
  p.vx += ((amount > 0.05 ? (move.x / len) * top : 0) - p.vx) * k;
  p.vz += ((amount > 0.05 ? (move.z / len) * top : 0) - p.vz) * k;
  if (Math.hypot(p.vx, p.vz) < 0.02) p.vx = p.vz = 0;
  const x = p.x + p.vx * dt, z = p.z + p.vz * dt;
  // He can leave the court to fetch a ball, as far as the fence (and the open grass at the near side).
  p.x = Math.max(-FENCE.side + 0.35, Math.min(FENCE.side - 0.35, x)); if (p.x !== x) p.vx = 0;
  p.z = Math.max(FENCE.back + 0.35, Math.min(FENCE.front - 0.35, z)); if (p.z !== z) p.vz = 0;
  const px = p.x - POLE.x, pz = p.z - POLE.z, pd = Math.hypot(px, pz), clear = POLE.radius + 0.3;
  if (pd < clear) { const k = pd > 1e-6 ? clear / pd : 1; p.x = POLE.x + (pd > 1e-6 ? px * k : clear); p.z = POLE.z + pz * k; }
  if (amount > 0.05) p.yaw = Math.atan2(move.x, move.z);
  if (s.mode === 'aim') faceRim(s);

  if (s.mode === 'held') {
    const before = Math.floor(s.dribble + 0.5), pace = Math.hypot(p.vx, p.vz) / RUN_SPEED;
    s.dribble += dt * (pace < 0.1 ? DRIBBLE_RATE.still : pace > 1.1 ? DRIBBLE_RATE.sprint : DRIBBLE_RATE.moving);
    if (Math.floor(s.dribble + 0.5) > before) events.push({ type: 'dribble', at: { ...heldBallPosition(s), y: 0 } });
  }
  if (s.mode === 'held' || s.mode === 'aim') { s.ball.p = heldBallPosition(s); s.ball.v = { x: 0, y: 0, z: 0 }; return events; }

  // In flight or loose, physics alone moves the ball. Any contact or a basket makes it a rebound Dad can grab, wherever it ends up.
  for (const e of stepBall(s.ball, dt)) {
    events.push(e);
    if (e.type === 'score') { s.score += s.value; s.made++; }
    if (s.mode === 'flight') s.mode = 'loose';
  }
  if (s.mode === 'loose' && Math.hypot(s.ball.p.x - p.x, s.ball.p.z - p.z) < PICKUP_REACH && s.ball.p.y < 1.2 + p.y) {
    s.mode = 'held'; s.dribble = 0; s.ball.p = heldBallPosition(s);
    events.push({ type: 'pickup', at: { ...s.ball.p } });
  }
  return events;
}

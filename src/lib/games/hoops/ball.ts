import { BALL_R, BOARD, FENCE, GRAVITY, POSTS, RIM, inBounds, onAsphalt, type Vec3 } from './court';

export type BallEvent = { type: 'floor' | 'rim' | 'board' | 'pole' | 'fan' | 'fence' | 'score' | 'out'; speed: number; at: Vec3 };
export type Ball = { p: Vec3; v: Vec3; acc: number; scored: boolean; out: boolean };

// A fixed 120 Hz step, so a shot flies the same at any frame rate; fast balls substep so they cannot tunnel.
export const STEP = 1 / 120;
// REST: below this impact speed (a ~5 cm hop) the ball stops bouncing and rolls.
// Grass bounces lower and grips harder than asphalt.
const FLOOR_E = 0.78, GRASS_E = 0.5, FLOOR_GRIP = 0.9, GRASS_GRIP = 0.7, ROLL = 2, GRASS_ROLL = 5, BOARD_E = 0.6, RIM_E = 0.55, POLE_E = 0.5, FENCE_E = 0.4, QUIET = 0.3, REST = 1;

export function createBall(p: Vec3, v: Vec3 = { x: 0, y: 0, z: 0 }): Ball {
  return { p: { ...p }, v: { ...v }, acc: 0, scored: false, out: false };
}

/** Pushes the ball out of contact along n (unit, pointing at the ball) at distance `reach`, bouncing with restitution e. Returns the impact speed. */
function bounce(ball: Ball, c: Vec3, n: Vec3, reach: number, e: number) {
  const { p, v } = ball;
  p.x = c.x + n.x * reach; p.y = c.y + n.y * reach; p.z = c.z + n.z * reach;
  const vn = v.x * n.x + v.y * n.y + v.z * n.z;
  if (vn >= 0) return 0;
  v.x -= (1 + e) * vn * n.x; v.y -= (1 + e) * vn * n.y; v.z -= (1 + e) * vn * n.z;
  return -vn;
}

function substep(ball: Ball, h: number, events: BallEvent[]) {
  const { p, v } = ball, y0 = p.y;
  const hit = (type: BallEvent['type'], speed: number) => { if (speed > QUIET) events.push({ type, speed, at: { ...p } }); };
  v.y -= GRAVITY * h;
  p.x += v.x * h; p.y += v.y * h; p.z += v.z * h;

  if (p.y < BALL_R) {
    p.y = BALL_R;
    const impact = -v.y, asphalt = onAsphalt(p), grip = asphalt ? FLOOR_GRIP : GRASS_GRIP;
    if (impact > REST) { v.y = impact * (asphalt ? FLOOR_E : GRASS_E); v.x *= grip; v.z *= grip; hit('floor', impact); }
    else { const roll = 1 - (asphalt ? ROLL : GRASS_ROLL) * h; v.y = 0; v.x *= roll; v.z *= roll; }
    if (!ball.out && !inBounds(p)) { ball.out = true; events.push({ type: 'out', speed: impact, at: { ...p } }); }
  }

  // Fence: three walls (sides and back) and an unseen one past the near grass.
  for (const [axis, at, sign] of [['x', FENCE.side, 1], ['x', -FENCE.side, -1], ['z', FENCE.back, -1], ['z', FENCE.front, 1]] as const) {
    if ((p[axis] + sign * BALL_R - at) * sign <= 0) continue;
    p[axis] = at - sign * BALL_R;
    if (v[axis] * sign > 0) { hit('fence', Math.abs(v[axis])); v[axis] *= -FENCE_E; }
  }

  // Backboard: the closest point of the box.
  const c = {
    x: Math.max(-BOARD.halfWidth, Math.min(BOARD.halfWidth, p.x)),
    y: Math.max(BOARD.bottom, Math.min(BOARD.top, p.y)),
    z: Math.max(BOARD.z - BOARD.halfDepth, Math.min(BOARD.z + BOARD.halfDepth, p.z))
  };
  let d = Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z);
  if (d < BALL_R) {
    const n = d > 1e-9 ? { x: (p.x - c.x) / d, y: (p.y - c.y) / d, z: (p.z - c.z) / d } : { x: 0, y: 0, z: p.z >= BOARD.z ? 1 : -1 };
    hit('board', bounce(ball, c, n, BALL_R, BOARD_E));
    // Same for a ball come to rest on top of the board: tip it off toward the court.
    if (n.y > 0.7 && Math.hypot(v.x, v.y, v.z) < 0.2) v.z += 0.3;
  }

  // The pole and the family: vertical cylinders.
  for (const post of POSTS) {
    d = Math.hypot(p.x - post.x, p.z - post.z);
    if (p.y > post.top || d >= BALL_R + post.radius) continue;
    const n = d > 1e-9 ? { x: (p.x - post.x) / d, y: 0, z: (p.z - post.z) / d } : { x: 0, y: 0, z: 1 };
    hit(post.kind, bounce(ball, { x: post.x, y: p.y, z: post.z }, n, BALL_R + post.radius, POLE_E));
  }

  // Rim: a torus. The nearest point of the ring circle, then a sphere against that point.
  const hx = p.x - RIM.x, hz = p.z - RIM.z, hd = Math.hypot(hx, hz);
  const out = hd > 1e-9 ? { x: hx / hd, z: hz / hd } : { x: 0, z: 1 };
  const q = { x: RIM.x + out.x * RIM.radius, y: RIM.y, z: RIM.z + out.z * RIM.radius };
  d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
  if (d < BALL_R + RIM.tube) {
    const n = d > 1e-9 ? { x: (p.x - q.x) / d, y: (p.y - q.y) / d, z: (p.z - q.z) / d } : { x: out.x, y: 0, z: out.z };
    hit('rim', bounce(ball, q, n, BALL_R + RIM.tube, RIM_E));
    // A ball balanced on top of the ring would sit there forever; nudge it off the outside.
    if (Math.hypot(v.x, v.y, v.z) < 0.2) { v.x += out.x * 0.3; v.z += out.z * 0.3; }
  }

  // A basket: the centre crosses the rim plane downward inside the ring, once per ball. Coming up through
  // the ring spends that chance, so a flick from underneath can't drop back in for points.
  const inside = Math.hypot(p.x - RIM.x, p.z - RIM.z) < RIM.radius;
  if (inside && y0 < RIM.y && p.y >= RIM.y) ball.scored = true;
  if (!ball.scored && y0 > RIM.y && p.y <= RIM.y && v.y < 0 && inside) {
    ball.scored = true; events.push({ type: 'score', speed: -v.y, at: { ...p } });
    // The net catches it: the ball drops out of the bottom slowly and nearly straight down.
    v.x *= 0.3; v.z *= 0.3; v.y *= 0.55;
  }
}

export function stepBall(ball: Ball, dt: number): BallEvent[] {
  const events: BallEvent[] = [];
  ball.acc += dt;
  // The epsilon keeps 1/30 s from becoming three steps instead of four.
  while (ball.acc >= STEP - 1e-9) {
    ball.acc -= STEP;
    const speed = Math.hypot(ball.v.x, ball.v.y, ball.v.z);
    const n = Math.max(1, Math.ceil(speed * STEP / (BALL_R / 2)));
    for (let i = 0; i < n; i++) substep(ball, STEP / n, events);
  }
  return events;
}

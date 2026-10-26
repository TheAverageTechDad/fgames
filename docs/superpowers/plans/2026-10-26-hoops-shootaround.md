# Hoops Shootaround Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build step 1 of the basketball game: Dad alone on a basic half court at `/hoops` with a ball and hoop, moving with the reused stick, sprint and jump, dribbling automatically, shooting by swipe, with real ball collisions and reliable scoring. This slice exists to judge on a phone whether the shooting is fun.

**Architecture:** Same shape as Pocket Farm: a Svelte shell (`HoopsGame.svelte`), a pure, tested model (`court.ts`, `ball.ts`, `shot.ts`, `game.ts`), gesture routing (`input.ts`) on top of the farm's stick (moved to `src/lib/stick-input.ts`), and a disposable Three.js scene (`scene.ts`) that only reads the model and draws it.

**Tech Stack:** SvelteKit 3, Svelte 5 runes, TypeScript, Three.js 0.185 (`GLTFLoader`), Vitest, Playwright smoke scripts.

**Spec:** `docs/superpowers/specs/2026-10-26-basketball-game-design.md` (sections "Controls and gesture ownership", "Shooting", "Passing, rebounds and physics", "Scale and starting numbers", "Build sequence" step 1).

## Global Constraints

- No new dependencies. Ball physics is hand-rolled: a sphere against the floor plane, backboard box, rim torus and pole, on a fixed 120 Hz step.
- Do not change Catcha or Pocket Farm behaviour. Extract shared code rather than fork it; `scripts/farm-smoke.mjs` keeps passing.
- Dad is `/catcha/assets/chibi-dad.glb`, fitted to `DAD_HEIGHT = 1.7` units. Arm and leg pivots are the non-mesh nodes named `arm-left`, `arm-right`, `leg-left`, `leg-right`; the head pivot is `head`.
- A touch is assigned to one action at touch-down. Shot versus movement is decided by where the touch starts, never by speed. A sprint never throws the ball.
- Shot travel is normalized by the viewport's shorter side, speed by elapsed time; minimum shot travel 24 px; aim cone ±25°; Dad's touch target at least 56 px across.
- Tap: under 250 ms and never past the stick's 5 px deadzone (the farm input's values).
- The ball is in exactly one mode: held (dribbling), windup, flight, loose, or reset. In flight and loose, physics alone moves it.
- A basket counts once, when the ball's centre crosses the rim plane downward inside the ring.
- Squash and stretch is visual only; the collision radius never changes.
- `/hoops` is not linked from the home screen in this slice.
- The user's standing rule for this repo: after every commit run `pnpm check`, then `pnpm build` and `pnpm dlx wrangler@latest pages deploy build --project-name fgames --branch main`, without asking.

## Review Focus

1. **A second finger on Dad while the first holds the stick** must start a shot, not queue a jump: the farm stick currently turns every second pointer into a jump. Pinned in Task 1 (claim runs first) and Task 7 (CDP two-finger smoke).
2. **A ball that comes to rest on top of the rim** must not sit there forever. Pinned in Task 2 (`rolls off a ball resting on the rim`).
3. **A long frame** (returning to the tab, a GC pause) must not let a fast ball tunnel through the board or rim. The scene clamps `dt` to 0.1 s and the ball substeps. Pinned in Task 2 (`does not tunnel through the backboard on a 0.1 s frame`).
4. **A shot from directly under the rim** (horizontal distance near zero, or rim above a steep line) must not produce `NaN` or `Infinity`. Pinned in Task 3 (`launches finitely from under the rim`).
5. **A ball that goes out behind the baseline or under the backboard**, where Dad cannot follow, must come back. Pinned in Task 4 (`returns an out-of-bounds ball to Dad's hands`).

---

### Task 1: Shared stick with a claim hook

**Files:**
- Move: `src/lib/games/farm/input.ts` → `src/lib/stick-input.ts`
- Modify: `src/lib/games/farm/scene.ts` (import only)

**Interfaces:**
- Produces: `createStickInput(canvas: HTMLCanvasElement, host: HTMLElement, options?: { className?: string; claim?: (e: PointerEvent) => boolean })` returning the same object the farm input returns today (`read`, `jump`, `setEnabled`, `destroy`). `className` defaults to `'farm-joystick'`. When `claim(e)` returns true, the stick ignores that pointer completely: no anchor, no capture, no jump.

- [ ] **Step 1: Move and rename**

`git mv src/lib/games/farm/input.ts src/lib/stick-input.ts`; rename `createFarmInput` to `createStickInput`; change `import type { Point } from './model'` to a local `type Point = { x: number; z: number }`; update the import in `src/lib/games/farm/scene.ts`.

- [ ] **Step 2: Add the options**

In `down`, after the `enabled`/button check and **before** the `pointer !== null` second-finger branch: `if (options?.claim?.(e)) return;`. Use `options?.className ?? 'farm-joystick'` for the stick element.

- [ ] **Step 3: Verify the farm is unchanged**

Run: `pnpm check && pnpm test`
Expected: 0 errors, all tests pass.
Run: `pnpm build && pnpm preview --host 127.0.0.1 --port 4174` (background), then `FGAMES_URL=http://127.0.0.1:4174 node scripts/farm-smoke.mjs`
Expected: the smoke passes as before.

- [ ] **Step 4: Commit**

```bash
git add src/lib/stick-input.ts src/lib/games/farm/scene.ts
git commit -m "refactor: share the farm's stick input, with a claim hook for other gestures"
```

---

### Task 2: Court and ball physics

**Files:**
- Create: `src/lib/games/hoops/court.ts`, `src/lib/games/hoops/ball.ts`
- Test: `src/lib/games/hoops/ball.test.ts`

**Interfaces:**
- Produces (`court.ts`), court axes: baseline at `z = 0`, court toward `+z`, camera at `+z` looking at the hoop; `x` across.
  ```ts
  export type Vec3 = { x: number; y: number; z: number };
  export const DAD_HEIGHT = 1.7, GRAVITY = 9.8, BALL_R = 0.16, ARC_R = 4.5;
  export const COURT = { halfWidth: 4.5, depth: 8 };
  export const RIM = { x: 0, y: 3.06, z: 1.2, radius: 0.3, tube: 0.02 };
  export const BOARD = { halfWidth: 0.9, bottom: 2.9, top: 3.95, z: 0.8, halfDepth: 0.03 };
  export const POLE = { x: 0, z: -0.4, radius: 0.08, top: 3.5 };
  export function isTwoPointer(p: { x: number; z: number }): boolean; // distance from (RIM.x, RIM.z) > ARC_R
  export function inBounds(p: { x: number; z: number }): boolean;     // |x| <= halfWidth && 0 <= z <= depth
  ```
- Produces (`ball.ts`):
  ```ts
  export type BallEvent = { type: 'floor' | 'rim' | 'board' | 'pole' | 'score' | 'out'; speed: number; at: Vec3 };
  export type Ball = { p: Vec3; v: Vec3; acc: number; scored: boolean; out: boolean };
  export const STEP = 1 / 120;
  export function createBall(p: Vec3, v?: Vec3): Ball;
  export function stepBall(ball: Ball, dt: number): BallEvent[];
  ```
  `stepBall` accumulates `dt` in `ball.acc` and runs whole `STEP`s while `acc >= STEP - 1e-9` (the epsilon keeps 1/30 s from becoming three steps instead of four), so results do not depend on frame rate. Each `STEP` is further split so the ball moves at most `BALL_R / 2` per substep. `speed` on an event is the normal impact speed (for sound and squash later).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { createBall, stepBall } from './ball';
import { BALL_R, BOARD, RIM, inBounds, isTwoPointer } from './court';

// Whole frame counts: summing a float dt can add a frame and break the fps comparison.
const run = (ball, seconds, dt = 1 / 60) => { const events = []; for (let i = 0; i < Math.round(seconds / dt); i++) events.push(...stepBall(ball, dt)); return events; };

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
    const floors = run(ball, 4).filter(e => e.type === 'floor');
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
    const ball = createBall({ x: 0, y: 3.4, z: 2 }, { x: 0, y: 0, z: -6 });
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/lib/games/hoops`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `court.ts` and `ball.ts`**

Per substep: integrate `v.y -= GRAVITY * h; p += v * h`, then resolve, in order:
- Floor: if `p.y < BALL_R`, set `p.y = BALL_R`; if `v.y < 0`, reflect with restitution 0.78 and scale `v.x`, `v.z` by 0.9; below an impact speed of 0.3, set `v.y = 0` and roll with `v.xz *= 1 - 2h`. Emit `floor` for impacts above 0.3. On the first floor contact with `!inBounds(p)`, set `ball.out = true` and emit `out`.
- Backboard: sphere against the box `|x| <= halfWidth`, `bottom <= y <= top`, `|z - BOARD.z| <= halfDepth`; push out along the closest-point normal and reflect the normal component with restitution 0.6. Pole: vertical cylinder up to `POLE.top`, restitution 0.5.
- Rim: torus. The ring point nearest the ball is `q = RIM + radius * normalize(p.x - RIM.x, 0, p.z - RIM.z)` (any horizontal direction when the ball is exactly centred). If `|p - q| < BALL_R + tube`, push out along `normalize(p - q)` and reflect the normal component with restitution 0.55. If the ball is in rim contact and its speed is under 0.2, add a 0.3 outward horizontal velocity away from the rim centre so it cannot balance on top.
- Score: before integrating, remember `y0 = p.y`. If `!ball.scored && y0 > RIM.y && p.y <= RIM.y && v.y < 0` and the horizontal distance to the rim centre is under `RIM.radius`, set `ball.scored = true` and emit `score`.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run src/lib/games/hoops`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/hoops/court.ts src/lib/games/hoops/ball.ts src/lib/games/hoops/ball.test.ts
git commit -m "feat(hoops): court dimensions and hand-rolled ball physics"
```

---

### Task 3: Shot aim and power

**Files:**
- Create: `src/lib/games/hoops/shot.ts`
- Test: `src/lib/games/hoops/shot.test.ts`

**Interfaces:**
- Consumes: `Vec3`, `RIM`, `GRAVITY`, `isTwoPointer` from `court.ts`.
- Produces:
  ```ts
  export type Swipe = { dx: number; dy: number; seconds: number; minSide: number }; // screen px, dy positive downward
  export const S_IDEAL = 0.6, AIM_CONE = (25 * Math.PI) / 180, AIM_KEEP = 0.15, BAND_NEAR = 0.08, BAND_FAR = 0.05,
    POWER_SLOPE = 0.35, MIN_SHOT_PX = 24, LAUNCH_ANGLE = (52 * Math.PI) / 180;
  export function strength(swipe: Swipe): number;
  export function power(s: number, twoPointer: boolean): number;
  export function launchVelocity(from: Vec3, to: Vec3): Vec3;
  export function shotVelocity(release: Vec3, swipe: Swipe): Vec3;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { createBall, stepBall } from './ball';
import { RIM } from './court';
import { S_IDEAL, launchVelocity, power, shotVelocity, strength } from './shot';

const ideal = (minSide: number) => ({ dx: 0, dy: -0.3 * minSide, seconds: 0.15, minSide }); // strength 0.6
const fly = (release, v) => { const ball = createBall(release, v), events = []; for (let t = 0; t < 3; t += 1 / 60) events.push(...stepBall(ball, 1 / 60)); return events; };

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
  it('falls short on a weak swipe and misses on a sideways one', () => {
    const release = { x: 0, y: 2.1, z: 5 };
    expect(fly(release, shotVelocity(release, { dx: 0, dy: -40, seconds: 0.2, minSide: 390 })).some(e => e.type === 'score')).toBe(false);
    expect(fly(release, shotVelocity(release, { dx: 117, dy: -20, seconds: 0.15, minSide: 390 })).some(e => e.type === 'score')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/lib/games/hoops/shot.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `shot.ts`**

- `strength`: `travel = hypot(dx, dy) / minSide`, `speed = travel / max(seconds, 0.05)`, return `travel * speed`.
- `power`: `r = s / S_IDEAL`, `band = twoPointer ? BAND_FAR : BAND_NEAR`; inside `|r - 1| <= band` return 1; otherwise `1 + (r - 1 - Math.sign(r - 1) * band) * POWER_SLOPE`, clamped to `[0.55, 1.45]`.
- `launchVelocity`: horizontal distance `d`, height gain `h = to.y - from.y`; angle `θ = max(LAUNCH_ANGLE, atan2(h, max(d, 0.01)) + 15°)`, capped at 80°; `v² = GRAVITY d² / (2 cos²θ (d tanθ - h))`, with `d` floored at 0.01. Horizontal velocity points from `from` to `to`.
- `shotVelocity`: the screen swipe maps straight onto the court (screen right = `+x`, screen up = `-z`). `// ponytail: assumes the camera faces the hoop squarely; project through the camera if it ever yaws.` With `α` the court angle to the rim and `β` the swipe angle, `err` is wrapped to `[-π, π]`. If `|err| <= AIM_CONE`, aim at `α + err * AIM_KEEP`; otherwise at `β`. The target is at the rim's horizontal distance along that angle, at rim height. Return `launchVelocity(release, target)` multiplied by `power(strength(swipe), isTwoPointer(release))`.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run src/lib/games/hoops`
Expected: PASS. If `scores the same comfortable swipe…` fails by a hair, check that the release point and rim centre are used consistently, not the tolerances.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/hoops/shot.ts src/lib/games/hoops/shot.test.ts
git commit -m "feat(hoops): distance-relative shot power with a rim-snapping aim cone"
```

---

### Task 4: Shootaround model

**Files:**
- Create: `src/lib/games/hoops/game.ts`
- Test: `src/lib/games/hoops/game.test.ts`

**Interfaces:**
- Consumes: `court.ts`, `ball.ts`, `shot.ts` as above.
- Produces:
  ```ts
  export type Mode = 'held' | 'windup' | 'flight' | 'loose' | 'reset';
  export type Move = { x: number; z: number; sprint: boolean };
  export type GameEvent = BallEvent | { type: 'dribble' | 'pickup' | 'jump'; at: Vec3 } | { type: 'shot'; value: 1 | 2; at: Vec3 };
  export type Shootaround = {
    player: { x: number; y: number; z: number; yaw: number; vy: number; jumpT: number }; // jumpT < 0 when not crouching
    ball: Ball; mode: Mode; dribble: number; windupT: number; pending: Swipe | null; resetT: number;
    value: 1 | 2; score: number; shots: number; made: number;
  };
  export const RUN_SPEED = 3.6, SPRINT = 1.35, PICKUP_REACH = 0.6, HAND_HEIGHT = 1.0, RELEASE_HEIGHT = 2.1,
    WINDUP = 0.12, SHOT_HOP = 3, OUT_RESET = 1, CROUCH = 0.09, JUMP_V = 7.5, JUMP_GRAVITY = 30;
  export function createShootaround(): Shootaround;     // Dad at (0, 0, 5.5) facing the hoop, ball held
  export function stepShootaround(s: Shootaround, dt: number, move: Move): GameEvent[];
  export function startShot(s: Shootaround, swipe: Swipe): boolean; // false unless mode === 'held'
  export function jump(s: Shootaround): void;                       // ignored while airborne or crouching
  export function heldBallPosition(s: Shootaround): Vec3;
  ```
  The model owns Dad's height (`player.y`) so the shooting hop and the tap jump share one vertical: farm/Catcha timing, a `CROUCH` delay, then `vy = JUMP_V` under `JUMP_GRAVITY`. The scene only reads.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { RIM, BALL_R } from './court';
import { createShootaround, heldBallPosition, jump, startShot, stepShootaround } from './game';

const still = { x: 0, z: 0, sprint: false };
const good = { dx: 0, dy: -117, seconds: 0.15, minSide: 390 };
const run = (s, seconds, move = still) => { const events = []; for (let t = 0; t < seconds; t += 1 / 60) events.push(...stepShootaround(s, 1 / 60, move)); return events; };

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
    const count = move => run(createShootaround(), 2, move).filter(e => e.type === 'dribble').length;
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/lib/games/hoops/game.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `game.ts`**

- Movement: when not in `windup`, move `RUN_SPEED * (sprint ? SPRINT : 1) * |move|` along `move`, face the movement (`yaw = atan2(x, z)`), and clamp to `|x| <= halfWidth - 0.3`, `0.3 <= z <= depth`. Screen directions map straight onto the court (as in Task 3).
- Dribble: `dribble += rate * dt` with rate 1.6 (still), 2.2 (moving), 2.8 (sprinting) bounces per second. Emit `dribble` whenever `floor(dribble + 0.5)` increases. `heldBallPosition`: 0.35 forward and 0.25 to Dad's right of `player`, at height `BALL_R + (HAND_HEIGHT + player.y - BALL_R) * |cos(π · dribble)|`; during `windup` the ball sits above the head at `RELEASE_HEIGHT + player.y` instead. While `held`/`windup`/`reset`, set `ball.p` from it each step and keep `ball.v` at zero.
- `startShot`: `held` only. Set `mode = 'windup'`, `windupT = WINDUP`, `pending = swipe`, record `value = isTwoPointer(player) ? 2 : 1`, and start the hop (`vy = SHOT_HOP` if grounded). When `windupT` runs out: `ball = createBall(release, shotVelocity(release, pending))` with release `{ player.x, RELEASE_HEIGHT + player.y, player.z - 0.2 }`, `mode = 'flight'`, `shots++`, emit `shot`.
- `flight`/`loose`: `stepBall`. A `score` event adds `value` and `made++`. The first `floor` event in flight turns `flight` into `loose`. An `out` event turns either into `reset` with `resetT = OUT_RESET`; when it runs out, `mode = 'held'`. In `loose`, the ball is picked up when its horizontal distance to Dad is under `PICKUP_REACH` and `ball.p.y < 1.2`: `mode = 'held'`, emit `pickup`.
- `jump`: farm timing. `jumpT = 0`, after `CROUCH` set `vy = JUMP_V`; integrate `player.y` with `JUMP_GRAVITY`; land at 0.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run src/lib/games/hoops`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/hoops/game.ts src/lib/games/hoops/game.test.ts
git commit -m "feat(hoops): shootaround model with dribble, windup, rebounds and resets"
```

---

### Task 5: Gesture routing

**Files:**
- Create: `src/lib/games/hoops/input.ts`
- Test: `src/lib/games/hoops/input.test.ts`

**Interfaces:**
- Consumes: `createStickInput` (Task 1), `Swipe`, `MIN_SHOT_PX` (Task 3).
- Produces:
  ```ts
  export type Target = { x: number; y: number; radius: number }; // client px
  export type ShotGesture = { kind: 'shot'; swipe: Swipe } | { kind: 'jump' } | { kind: 'none' };
  export function claimsShot(touch: { x: number; y: number }, dad: Target | null): boolean;
  export function readShotGesture(start: { x: number; y: number; t: number }, end: { x: number; y: number; t: number }, minSide: number): ShotGesture;
  export function createHoopsInput(canvas: HTMLCanvasElement, host: HTMLElement, dad: () => Target | null): {
    read(): Move; jump(): boolean; takeShot(): Swipe | null; setEnabled(value: boolean): void; destroy(): void;
  };
  ```
  `dad()` returns `null` when Dad has no ball, so touching him then is ordinary stick input (a tap still jumps).

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run src/lib/games/hoops/input.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

- `claimsShot`: `dad !== null && hypot(...) <= max(28, dad.radius)`.
- `readShotGesture`: travel at least `MIN_SHOT_PX` → shot; else under 250 ms and within 5 px → jump; else none.
- `createHoopsInput`: `createStickInput(canvas, host, { className: 'hoops-joystick', claim })`, where `claim` records `{ id, x, y, t }` as the shot pointer, calls `canvas.setPointerCapture`, and returns true when `claimsShot` holds and no shot pointer is active. On `pointerup` for that id, `readShotGesture` queues the swipe or a jump. `pointercancel`, `lostpointercapture`, window `blur` and `visibilitychange` (hidden) drop it with nothing fired. `read`/`jump` delegate to the stick, with jump also true once after a tap on Dad. `takeShot` returns and clears the queued swipe.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm vitest run src/lib/games/hoops && pnpm check`
Expected: PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/games/hoops/input.ts src/lib/games/hoops/input.test.ts
git commit -m "feat(hoops): route touches on Dad to shots and the rest to the stick"
```

---

### Task 6: Scene, shell and route

**Files:**
- Create: `src/lib/games/hoops/scene.ts`, `src/lib/games/hoops/HoopsGame.svelte`, `src/routes/hoops/+page.svelte`

**Interfaces:**
- Consumes: everything above; `installHaptics`, `haptic` from `#lib/haptics`.
- Produces: `createHoopsScene(host: HTMLElement, callbacks: { update(): void; event(e: GameEvent): void }): { ready: Promise<void>; state: Shootaround; setPaused(value: boolean): void; destroy(): void }`, following `createFarmScene`'s lifecycle (load, `compileAsync`, rAF loop that skips frames while paused or `document.hidden`, full disposal in `destroy`).

- [ ] **Step 1: Scene**

- Renderer, lights and shadows as in the farm scene (hemisphere fill plus one shadowing directional light, Neutral tone mapping). Perspective camera behind the top of the key facing the hoop squarely (no yaw: Task 3 relies on it). Frame it at 390×844 so the full court width shows, the rim's projected centre sits between 25% and 40% of the screen height from the top, and the court's near edge sits above the bottom 20%.
- Court: one plane with a `CanvasTexture` of plain asphalt grey plus white baseline, sidelines, key, free-throw line and the `ARC_R` arc. Grit and art come in step 4.
- Hoop: pole, white board with the shooter's square, orange rim torus (`RIM.radius`, `RIM.tube`), and a net of 12 line strands that stretches down for 0.3 s on `score`.
- Ball: sphere of radius `BALL_R` with a canvas seam texture and a blob shadow. On a `floor`/`dribble` event, squash to `(1.12, 0.8, 1.12)` and recover over 0.12 s; on `rim`/`board`, a 0.9 uniform pulse. The collision radius is unchanged.
- Dad: load and fit to `DAD_HEIGHT` as `fit()` does in the farm scene; collect the arm, leg and head pivots. Walk swing from the farm scene. The right arm follows the dribble height while `held`; both arms go up during `windup` and follow through for 0.25 s after the `shot` event. A ground ring under him in a team colour.
- Each frame: `dt = min(0.1, elapsed)`; `stepShootaround(state, dt, input.read())` (a pending `input.takeShot()` goes to `startShot`, and `input.jump()` to `jump`); forward events to `callbacks.event`; `callbacks.update()` at 10 Hz.
- Dad's touch target for `createHoopsInput`: project the feet and the head top; `radius = max(28, 0.45 × projected height)`; centre at mid-body; `null` unless `state.mode === 'held'`.

- [ ] **Step 2: Shell and route**

`HoopsGame.svelte` mirrors `FarmGame.svelte`'s `onMount` (fonts ready, dynamic `import('./scene')`, loading card until `ready`, an error message on failure, `host.dataset.ready = 'true'`, `installHaptics`, cleanup). HUD: a "Made 3 / 7" counter, a `+1`/`+2` pop on `score` with `haptic('land')`, and a "Pause game" button that opens a dialog with "Keep shooting" (`setPaused(false)`) and "Home" (`goto('/')`). Style `.hoops-joystick` by copying the `.farm-joystick` rule from `FarmGame.svelte`. For the smoke, write `data-shots`, `data-score`, `data-mode`, `data-dad-x`, `data-dad-y` on the host in `update` (`// ponytail: smoke hooks`). Route `src/routes/hoops/+page.svelte` with title `Hoops · Pocket Arcade`, like the farm route.

- [ ] **Step 3: Verify in the browser**

Run: `pnpm check` → 0 errors. Start `pnpm dev`, open `/hoops` at 390×844 with touch emulation. Check: Dad dribbles while standing and moving; dragging on empty court moves him and pushing far sprints; a quick tap jumps; swiping up from Dad shoots and the counter updates; a made basket swishes the net; misses bounce off the rim and board and roll; walking into the loose ball picks it up; a ball out behind the baseline comes back after a second; no console errors. Take a screenshot.

- [ ] **Step 4: Commit**

```bash
git add src/lib/games/hoops/scene.ts src/lib/games/hoops/HoopsGame.svelte src/routes/hoops/+page.svelte
git commit -m "feat(hoops): playable shootaround at /hoops"
```

---

### Task 7: Smoke test and phone check

**Files:**
- Create: `scripts/hoops-smoke.mjs`

- [ ] **Step 1: Write the smoke**

Modelled on `scripts/farm-smoke.mjs` (390×844, `hasTouch`, `isMobile`; fail on page errors and 4xx/5xx responses). Load `/hoops` and wait for `[data-ready="true"]`. Then assert:
1. A 600 ms mouse drag starting 120 px left of Dad, pushed 80 px (a sprint), leaves `data-shots` unchanged and moves `data-dad-x`.
2. A mouse swipe starting at Dad (`data-dad-x/y`), 117 px up over 150 ms, raises `data-shots` by 1; within 3 s `data-mode` reads `loose`, `reset` or `held`.
3. A 100 ms mouse click on empty court leaves `data-shots` unchanged.
4. **Two fingers** through a CDP session (`Input.dispatchTouchEvent`): finger 1 goes down on empty court and moves 40 px; finger 2 goes down on Dad, moves 117 px up and lifts. `data-shots` rises by 1 once Dad has the ball again.
5. With `page.context().setOffline(true)` after one full load, a reload of `/hoops` still reaches `data-ready`.

- [ ] **Step 2: Run it**

Run: `pnpm build && pnpm preview --host 127.0.0.1 --port 4174` (background), then `FGAMES_URL=http://127.0.0.1:4174 node scripts/hoops-smoke.mjs` and `FGAMES_URL=http://127.0.0.1:4174 node scripts/farm-smoke.mjs`
Expected: both pass.

- [ ] **Step 3: Commit and deploy**

```bash
git add scripts/hoops-smoke.mjs
git commit -m "test(hoops): browser smoke for gestures, shots and offline"
```

Then deploy per the Global Constraints.

- [ ] **Step 4: Phone check (with the user)**

Give the user the deployed `/hoops` URL. On a real phone they judge: can a comfortable swipe score from several spots; do short swipes fall short and hard ones overshoot; is Dad easy to start a swipe on, including under the rim on a large phone; does the dribble look attached. Record the devices checked and any tuning changes (`S_IDEAL`, the bands, `POWER_SLOPE`, `LAUNCH_ANGLE`, restitutions) in `src/lib/games/hoops/README.md`, in the farm README's style. The slice is done when the user says the shooting feels right. Build step 2 waits for that.

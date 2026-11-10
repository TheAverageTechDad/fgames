import { createStickInput } from '#lib/stick-input';
import type { Move } from './game';
import { MIN_PULL_PX, type Pull } from './shot';

/** Dad's touch target in client px. */
export type Target = { x: number; y: number; radius: number };
export type AimEvent = { type: 'aim' } | { type: 'shoot'; pull: Pull } | { type: 'cancel' };
type Point = { x: number; y: number };

// Holding still on Dad this long starts the aim; moving further than HOLD_SLOP first makes it ordinary movement.
// TOUCH_R: the smallest touch radius around Dad, generous because he is small on a phone.
// Keeping a pulled aim still for JUMP_HOLD_MS (STEADY_PX of wobble counts as still) jumps for a jump shot.
export const HOLD_MS = 120, HOLD_SLOP = 14, TOUCH_R = 56, JUMP_HOLD_MS = 400, STEADY_PX = 8;

export const claimsShot = (touch: Point, dad: Target | null) =>
  dad !== null && Math.hypot(touch.x - dad.x, touch.y - dad.y) <= Math.max(TOUCH_R, dad.radius);

export function readPull(origin: Point, end: Point, minSide: number): { kind: 'shoot'; pull: Pull } | { kind: 'cancel' } {
  const dx = end.x - origin.x, dy = end.y - origin.y;
  return Math.hypot(dx, dy) < MIN_PULL_PX ? { kind: 'cancel' } : { kind: 'shoot', pull: { dx, dy, minSide } };
}

/**
 * The farm's stick for moving, plus the shot: hold still on Dad (while he has the ball) to start aiming,
 * drag toward the hoop, let go. A touch on Dad that moves straight away stays movement. While aiming, keeping the
 * thumb still on the aim (or a second finger) jumps: the ball then goes at the top of the leap.
 */
export function createHoopsInput(canvas: HTMLCanvasElement, host: HTMLElement, dad: () => Target | null) {
  let held: (Point & { id: number; t: number; owned: boolean }) | null = null;
  // still: where and when the aiming thumb last settled; rose: this aim has already jumped.
  let aim: (Point & { id: number; now: Point; still: Point & { t: number }; rose: boolean }) | null = null, enabled = true, tapJump = false;
  const queue: AimEvent[] = [];
  // While aiming, any other finger touching down is the jump shot's jump, at once (not on lift) and nothing else.
  // A finger on Dad: if the stick is already steering (a second finger), take it so it can't turn into the stick's jump.
  const claim = (e: PointerEvent) => {
    if (aim) { e.preventDefault(); if (enabled && !aim.rose) { tapJump = true; aim.rose = true; } return true; }
    if (held || !claimsShot({ x: e.clientX, y: e.clientY }, dad())) return false;
    const owned = stick.busy();
    held = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, owned };
    if (owned) { e.preventDefault(); canvas.setPointerCapture(e.pointerId); }
    return owned;
  };
  const stick = createStickInput(canvas, host, { className: 'hoops-joystick', claim });
  function begin() {
    if (!held || !enabled || !dad()) { held = null; return; }
    const { id, x, y, owned } = held; held = null;
    if (!owned) { stick.releasePointer(); canvas.setPointerCapture(id); }
    aim = { id, x, y, now: { x, y }, still: { x, y, t: performance.now() }, rose: false }; queue.push({ type: 'aim' });
  }
  const forget = () => { held = null; };
  const pulled = (a: Point & { now: Point }) => Math.hypot(a.now.x - a.x, a.now.y - a.y) >= MIN_PULL_PX;
  const move = (e: PointerEvent) => {
    if (aim && e.pointerId === aim.id) {
      aim.now = { x: e.clientX, y: e.clientY };
      // Timed from when the game sees the move, not the event's own time: on a busy main thread moves arrive late, and the
      // hold should run from when the arc visibly settled.
      if (Math.hypot(e.clientX - aim.still.x, e.clientY - aim.still.y) > STEADY_PX) aim.still = { x: e.clientX, y: e.clientY, t: performance.now() };
    }
    else if (held && e.pointerId === held.id && Math.hypot(e.clientX - held.x, e.clientY - held.y) > HOLD_SLOP) forget();
  };
  const up = (e: PointerEvent) => {
    if (held && e.pointerId === held.id) {
      // A quick tap on Dad by a second finger jumps, like a second finger anywhere else.
      if (held.owned && e.type === 'pointerup' && e.timeStamp - held.t < 250) tapJump = true;
      forget();
    }
    if (!aim || e.pointerId !== aim.id) return;
    const { x, y, id } = aim; aim = null;
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    if (e.type !== 'pointerup' || !enabled) { queue.push({ type: 'cancel' }); return; }
    const result = readPull({ x, y }, { x: e.clientX, y: e.clientY }, Math.min(innerWidth, innerHeight));
    queue.push(result.kind === 'shoot' ? { type: 'shoot', pull: result.pull } : { type: 'cancel' });
  };
  const drop = () => { forget(); if (aim) { aim = null; queue.push({ type: 'cancel' }); } tapJump = false; };
  const hidden = () => { if (document.hidden) drop(); };
  const ends = ['pointerup', 'pointercancel', 'lostpointercapture'];
  canvas.addEventListener('pointermove', move);
  for (const type of ends) canvas.addEventListener(type, up as EventListener);
  window.addEventListener('blur', drop); document.addEventListener('visibilitychange', hidden);
  return {
    /**
     * Once per frame, before reading: starts the aim if the finger has stayed still on Dad for HOLD_MS. Deciding here,
     * after the browser has delivered every pending move, rather than on a timer, means a busy main thread (the first
     * touch starting audio, a slow frame) can never turn a drag into an aim.
     */
    tick(now = performance.now()) {
      if (held && now - held.t >= HOLD_MS) begin();
      if (aim && !aim.rose && pulled(aim) && now - aim.still.t >= JUMP_HOLD_MS) { aim.rose = true; tapJump = true; }
    },
    /** How far into the hold that jumps (0–1), for Dad's gathering crouch. */
    steady: (now = performance.now()) => aim && !aim.rose && pulled(aim) ? Math.min(1, (now - aim.still.t) / JUMP_HOLD_MS) : 0,
    read: (): Move => stick.read(),
    jump() { const jumped = stick.jump() || (tapJump && enabled); tapJump = false; return jumped; },
    /** The live pull while aiming (screen px from where the thumb held Dad), for drawing the arc. */
    pull: (): Pull | null => aim ? { dx: aim.now.x - aim.x, dy: aim.now.y - aim.y, minSide: Math.min(innerWidth, innerHeight) } : null,
    next: () => queue.shift() ?? null,
    setEnabled(value: boolean) { enabled = value; drop(); stick.setEnabled(value); },
    destroy() {
      drop(); stick.destroy();
      canvas.removeEventListener('pointermove', move);
      for (const type of ends) canvas.removeEventListener(type, up as EventListener);
      window.removeEventListener('blur', drop); document.removeEventListener('visibilitychange', hidden);
    }
  };
}

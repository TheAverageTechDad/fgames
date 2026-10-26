import { createStickInput } from '#lib/stick-input';
import type { Move } from './game';
import { MIN_SHOT_PX, type Swipe } from './shot';

/** Dad's touch target in client px. */
export type Target = { x: number; y: number; radius: number };
export type ShotGesture = { kind: 'shot'; swipe: Swipe } | { kind: 'jump' } | { kind: 'none' };
type Touch = { x: number; y: number; t: number };

export const claimsShot = (touch: { x: number; y: number }, dad: Target | null) =>
  dad !== null && Math.hypot(touch.x - dad.x, touch.y - dad.y) <= Math.max(28, dad.radius);

export function readShotGesture(start: Touch, end: Touch, minSide: number): ShotGesture {
  const dx = end.x - start.x, dy = end.y - start.y, travel = Math.hypot(dx, dy), ms = end.t - start.t;
  if (travel >= MIN_SHOT_PX) return { kind: 'shot', swipe: { dx, dy, seconds: ms / 1000, minSide } };
  return ms < 250 && travel <= 5 ? { kind: 'jump' } : { kind: 'none' };
}

/** A touch that starts on Dad while he has the ball is a shot (or a jump, if it is a tap); every other touch is the farm's stick. */
export function createHoopsInput(canvas: HTMLCanvasElement, host: HTMLElement, dad: () => Target | null) {
  let shot: (Touch & { id: number }) | null = null, queued: Swipe | null = null, tapJump = false, enabled = true;
  const claim = (e: PointerEvent) => {
    if (shot || !claimsShot({ x: e.clientX, y: e.clientY }, dad())) return false;
    e.preventDefault(); shot = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp };
    canvas.setPointerCapture(e.pointerId);
    return true;
  };
  const stick = createStickInput(canvas, host, { className: 'hoops-joystick', claim });
  const drop = () => {
    if (shot && canvas.hasPointerCapture(shot.id)) canvas.releasePointerCapture(shot.id);
    shot = null;
  };
  const up = (e: PointerEvent) => {
    if (!shot || e.pointerId !== shot.id) return;
    const start = shot; drop();
    if (e.type !== 'pointerup' || !enabled) return; // cancelled or lost: nothing fires
    const gesture = readShotGesture(start, { x: e.clientX, y: e.clientY, t: e.timeStamp }, Math.min(innerWidth, innerHeight));
    if (gesture.kind === 'shot') queued = gesture.swipe;
    if (gesture.kind === 'jump') tapJump = true;
  };
  const hidden = () => { if (document.hidden) drop(); };
  const types = ['pointerup', 'pointercancel', 'lostpointercapture'];
  for (const type of types) canvas.addEventListener(type, up as EventListener);
  window.addEventListener('blur', drop); document.addEventListener('visibilitychange', hidden);
  return {
    read: (): Move => stick.read(),
    jump() { const jumped = stick.jump() || (tapJump && enabled); tapJump = false; return jumped; },
    takeShot() { const swipe = queued; queued = null; return enabled ? swipe : null; },
    setEnabled(value: boolean) { enabled = value; drop(); queued = null; tapJump = false; stick.setEnabled(value); },
    destroy() {
      drop(); stick.destroy();
      for (const type of types) canvas.removeEventListener(type, up as EventListener);
      window.removeEventListener('blur', drop); document.removeEventListener('visibilitychange', hidden);
    }
  };
}

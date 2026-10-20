import type { Point } from './model';

export function createFarmInput(canvas: HTMLCanvasElement, host: HTMLElement) {
  let pointer: number | null = null, anchor = { x: 0, y: 0 }, movement: Point = { x: 0, z: 0 }, enabled = true;
  const keys = new Set<string>();
  const stick = document.createElement('div');
  stick.className = 'farm-joystick'; stick.setAttribute('aria-hidden', 'true');
  const thumb = document.createElement('div'); stick.append(thumb); host.append(stick);
  const clear = () => {
    if (pointer !== null && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
    pointer = null; movement = { x: 0, z: 0 }; keys.clear(); stick.style.display = 'none';
  };
  const down = (e: PointerEvent) => {
    if (!enabled || pointer !== null || e.button !== 0) return;
    e.preventDefault(); pointer = e.pointerId; anchor = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(pointer);
    const box = host.getBoundingClientRect();
    stick.style.cssText = `display:block;left:${anchor.x - box.left}px;top:${anchor.y - box.top}px`;
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    const dx = e.clientX - anchor.x, dy = e.clientY - anchor.y;
    const length = Math.hypot(dx, dy), limit = 44;
    const force = Math.min(1, Math.max(0, (length - 5) / (limit - 5)));
    movement = { x: length ? dx / length * force : 0, z: length ? dy / length * force : 0 };
    thumb.style.transform = `translate(${dx / Math.max(1, length / limit)}px,${dy / Math.max(1, length / limit)}px)`;
  };
  const up = (e: PointerEvent) => { if (e.pointerId === pointer) clear(); };
  const relevant = (e: KeyboardEvent) => ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(e.key);
  const keydown = (e: KeyboardEvent) => {
    if (!enabled || !relevant(e) || (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName))) return;
    e.preventDefault(); keys.add(e.key);
  };
  const keyup = (e: KeyboardEvent) => keys.delete(e.key);
  const hidden = () => { if (document.hidden) clear(); };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, up as EventListener);
  window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', hidden);
  return {
    read(): Point {
      if (!enabled) return { x: 0, z: 0 };
      return { x: movement.x + Number(keys.has('ArrowRight') || keys.has('d')) - Number(keys.has('ArrowLeft') || keys.has('a')),
        z: movement.z + Number(keys.has('ArrowDown') || keys.has('s')) - Number(keys.has('ArrowUp') || keys.has('w')) };
    },
    setEnabled(value: boolean) { enabled = value; clear(); },
    destroy() {
      clear(); stick.remove(); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.removeEventListener(type, up as EventListener);
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', hidden);
    }
  };
}

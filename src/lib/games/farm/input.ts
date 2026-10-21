import type { Point } from './model';

export function createFarmInput(canvas: HTMLCanvasElement, host: HTMLElement) {
  let pointer: number | null = null, anchor = { x: 0, y: 0 }, movement: Point = { x: 0, z: 0 }, enabled = true;
  // Catcha's jump controls: a quick tap that never steered, a second finger, or Space.
  let jumpQueued = false, downAt = 0, steered = false, sprint = false;
  const keys = new Set<string>();
  const stick = document.createElement('div');
  stick.className = 'farm-joystick'; stick.setAttribute('aria-hidden', 'true');
  const thumb = document.createElement('div'); stick.append(thumb); host.append(stick);
  const clear = () => {
    if (pointer !== null && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
    pointer = null; movement = { x: 0, z: 0 }; sprint = false; keys.clear(); stick.style.display = 'none'; jumpQueued = false;
  };
  const down = (e: PointerEvent) => {
    if (!enabled || e.button !== 0) return;
    if (pointer !== null) { e.preventDefault(); jumpQueued = true; return; }
    e.preventDefault(); pointer = e.pointerId; anchor = { x: e.clientX, y: e.clientY }; downAt = e.timeStamp; steered = false;
    canvas.setPointerCapture(pointer);
    const box = host.getBoundingClientRect();
    stick.style.cssText = `display:block;left:${anchor.x - box.left}px;top:${anchor.y - box.top}px`;
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    const dx = e.clientX - anchor.x, dy = e.clientY - anchor.y;
    const length = Math.hypot(dx, dy), limit = 44;
    const force = Math.min(1, Math.max(0, (length - 5) / (limit - 5)));
    movement = { x: length ? dx / length * force : 0, z: length ? dy / length * force : 0 }; if (force > 0) steered = true;
    // Catcha's sprint: push past the rim (and stay a little way out to keep it).
    sprint = length > limit * (sprint ? 1.1 : 1.3);
    thumb.style.transform = `translate(${dx / Math.max(1, length / limit)}px,${dy / Math.max(1, length / limit)}px)`;
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    const tap = e.type === 'pointerup' && !steered && e.timeStamp - downAt < 250;
    clear(); if (tap) jumpQueued = true;
  };
  const relevant = (e: KeyboardEvent) => ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'Shift'].includes(e.key);
  const keydown = (e: KeyboardEvent) => {
    if (!enabled || !relevant(e) || (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName))) return;
    e.preventDefault(); keys.add(e.key);
  };
  const space = (e: KeyboardEvent) => {
    if (!enabled || e.code !== 'Space' || (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName))) return;
    e.preventDefault(); if (!e.repeat) jumpQueued = true;
  };
  const keyup = (e: KeyboardEvent) => keys.delete(e.key);
  const hidden = () => { if (document.hidden) clear(); };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, up as EventListener);
  window.addEventListener('keydown', keydown); window.addEventListener('keydown', space); window.addEventListener('keyup', keyup); window.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', hidden);
  return {
    read(): Point & { sprint: boolean } {
      if (!enabled) return { x: 0, z: 0, sprint: false };
      return { sprint: sprint || keys.has('Shift'), x: movement.x + Number(keys.has('ArrowRight') || keys.has('d')) - Number(keys.has('ArrowLeft') || keys.has('a')),
        z: movement.z + Number(keys.has('ArrowDown') || keys.has('s')) - Number(keys.has('ArrowUp') || keys.has('w')) };
    },
    /** True once per jump press. */
    jump() { const jumped = jumpQueued && enabled; jumpQueued = false; return jumped; },
    setEnabled(value: boolean) { enabled = value; clear(); },
    destroy() {
      clear(); stick.remove(); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.removeEventListener(type, up as EventListener);
      window.removeEventListener('keydown', keydown); window.removeEventListener('keydown', space); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', hidden);
    }
  };
}

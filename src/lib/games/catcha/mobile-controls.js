/** Touch gestures enter the same studio context as keyboard and injected input. */
export function createMobileControls(canvas, options = {}) {
  let mobile = navigator.maxTouchPoints > 0 || matchMedia("(pointer: coarse)").matches;
  let leftHand = false;
  try { leftHand = localStorage.getItem("cleanup-left-hand") === "true"; } catch {}
  let pointerId = null;
  let anchor = null;
  let downAt = 0, dragged = false;
  let move = { x: 0, z: 0, amount: 0, extent: 0, sprint: false };
  const radius = () => Math.min(64, Math.max(42, canvas.clientHeight * 0.16));
  function clear() {
    const old = pointerId;
    pointerId = null;
    anchor = null;
    move = { x: 0, z: 0, amount: 0, extent: 0, sprint: false };
    if (old !== null && canvas.hasPointerCapture?.(old)) canvas.releasePointerCapture(old);
  }
  const snapshot = () => ({ ...move, mobile, leftHand, active: pointerId !== null,
    anchor: anchor ? { ...anchor } : null, radius: radius() });
  function point(event) {
    const box = canvas.getBoundingClientRect();
    // Upright phone: the stage is turned 90° clockwise (main.js), so screen down is stage right.
    if (document.documentElement.classList.contains("rotated")) return { x: event.clientY - box.top, y: box.right - event.clientX };
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }
  function down(event) {
    if (event.pointerType === "touch") mobile = true;
    const p = point(event);
    const button = (options.buttons?.(snapshot()) ?? []).find((b) =>
      p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
    if (button) {
      event.preventDefault();
      clear();
      if (button.action === "hand") {
        leftHand = !leftHand;
        try { localStorage.setItem("cleanup-left-hand", String(leftHand)); } catch {}
      }
      options.onAction?.(button.action);
      return;
    }
    if (event.pointerType !== "touch" || options.blocked?.()) return;
    // A second finger, or any tap up high, jumps. The lower half belongs to the thumb.
    if (pointerId !== null || p.y < canvas.clientHeight * 0.42) { event.preventDefault(); options.onAction?.("jump"); return; }
    event.preventDefault();
    pointerId = event.pointerId;
    downAt = event.timeStamp;
    dragged = false;
    // Keep the origin under the thumb even at an edge: clamping it would turn a tiny drag into sprint.
    anchor = { x: p.x, y: p.y };
    canvas.setPointerCapture?.(pointerId);
  }
  function drag(event) {
    if (event.pointerId !== pointerId || !anchor) return;
    event.preventDefault();
    const p = point(event);
    let dx = p.x - anchor.x, dz = p.y - anchor.y;
    const distance = Math.hypot(dx, dz), r = radius();
    // Past the rim the base follows the thumb (stays one radius behind it), so turning back is
    // instant instead of first sliding all the way back across the stick.
    if (distance > r) {
      anchor.x = p.x - (dx / distance) * r;
      anchor.y = p.y - (dz / distance) * r;
      dx = p.x - anchor.x; dz = p.y - anchor.y;
    }
    const extent = Math.min(1, distance / r);
    // full walking speed at 60% of the way out (a small dead zone first); sprint further out, as before
    const amount = Math.min(1, Math.max(0, (extent - 0.14) / 0.46));
    if (amount > 0) dragged = true;
    const length = Math.hypot(dx, dz);
    move = { x: length ? dx / length : 0, z: length ? dz / length : 0,
      amount, extent, sprint: amount > 0 && (move.sprint ? extent >= 0.65 : extent >= 0.8) };
  }
  function up(event) {
    if (event.pointerId !== pointerId) return;
    // a quick tap that never steered is a jump too
    const tap = event.type === "pointerup" && !dragged && event.timeStamp - downAt < 250;
    clear();
    if (tap) options.onAction?.("jump");
  }
  canvas.style.touchAction = "none";
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", drag);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("lostpointercapture", up);
  window.addEventListener("resize", clear);
  window.addEventListener("blur", () => { clear(); options.onAction?.("suspend"); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { clear(); options.onAction?.("suspend"); }
  });
  return {
    snapshot, clear,
    inject(value) {
      clear();
      const finite = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
      const x = finite(value?.x), z = finite(value?.z);
      const length = Math.hypot(x, z);
      move = { x: length ? x / length : 0, z: length ? z / length : 0,
        amount: Math.min(1, length), sprint: length > 0 && Boolean(value?.sprint) };
    },
  };
}

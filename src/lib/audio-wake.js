// iOS, and home-screen apps above all: when the app goes to the background its AudioContext becomes 'interrupted'
// (not 'suspended'), and only a resume() inside a tap brings it back. Sometimes even that leaves it 'running' with its
// clock stopped and no sound until the app is quit. So each game calls wake() from its taps: the first tap after the
// app returns (or while the context isn't running) resumes it and checks its clock a moment later. A context whose
// clock is stuck, or that still hasn't started after a few taps, is closed and `onDead` builds the owner a new one.
let returns = 0;
/** @type {WeakMap<AudioContext, number>} */
const checked = new WeakMap(), misses = new WeakMap();
/** @type {WeakSet<AudioContext>} */
const pending = new WeakSet();
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden) returns++; });

/** Plain JS so Catcha's Node tests can load it. @param {AudioContext} ctx @param {() => void} onDead */
export function wake(ctx, onDead) {
  // A running context is checked once per return to the app (never on its first run, when nothing has happened yet).
  if (ctx.state === 'running' && (checked.get(ctx) ?? 0) === returns) return;
  // Every event of a tap tries (Safari may only allow it as the finger lifts); one check covers them all.
  void ctx.resume().catch(() => {});
  if (pending.has(ctx)) return;
  pending.add(ctx); checked.set(ctx, returns);
  const before = ctx.currentTime;
  setTimeout(() => {
    pending.delete(ctx);
    if (ctx.state === 'running' && ctx.currentTime > before) return misses.delete(ctx);
    const miss = (misses.get(ctx) ?? 0) + 1;
    misses.set(ctx, miss); checked.delete(ctx);
    // Running with a stopped clock is the dead state; a context that won't start gets three taps' grace.
    if (ctx.state === 'running' || ctx.state === 'closed' || miss >= 3) { void ctx.close().catch(() => {}); onDead(); }
  }, 400);
}

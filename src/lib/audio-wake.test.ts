import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wake } from './audio-wake.js';

// The tests run in Node: a stand-in document whose visibilitychange marks a return to the app.
vi.hoisted(() => { Object.assign(globalThis, { document: Object.assign(new EventTarget(), { hidden: false }) }); });

// A stand-in AudioContext: `state`, a clock that only moves while running, and resume() that may or may not work.
function fake(state: AudioContextState, { resumes = true, ticks = true } = {}) {
  const ctx = { state, currentTime: 1, closed: false,
    resume: async () => { if (resumes) ctx.state = 'running'; }, close: async () => { ctx.closed = true; ctx.state = 'closed'; } };
  setInterval(() => { if (ctx.state === 'running' && ticks) ctx.currentTime += 0.1; }, 100);
  return ctx;
}
const as = (c: ReturnType<typeof fake>) => c as unknown as AudioContext;

describe('wake', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('brings an interrupted context back on a tap and keeps it', async () => {
    const ctx = fake('interrupted' as AudioContextState), dead = vi.fn();
    wake(as(ctx), dead);
    await vi.advanceTimersByTimeAsync(500);
    expect(ctx.state).toBe('running'); expect(dead).not.toHaveBeenCalled();
  });

  it('replaces a context that says it runs but whose clock has stopped', async () => {
    const ctx = fake('interrupted' as AudioContextState, { ticks: false }), dead = vi.fn();
    wake(as(ctx), dead);
    await vi.advanceTimersByTimeAsync(500);
    expect(ctx.closed).toBe(true); expect(dead).toHaveBeenCalledOnce();
  });

  it('gives a context that will not start three taps before replacing it', async () => {
    const ctx = fake('suspended', { resumes: false }), dead = vi.fn();
    for (let tap = 0; tap < 2; tap++) { wake(as(ctx), dead); await vi.advanceTimersByTimeAsync(500); }
    expect(dead).not.toHaveBeenCalled();
    wake(as(ctx), dead); await vi.advanceTimersByTimeAsync(500);
    expect(dead).toHaveBeenCalledOnce();
  });

  it('checks a running context again only after the app comes back', async () => {
    const ctx = fake('running', { ticks: false }), dead = vi.fn();
    wake(as(ctx), dead); await vi.advanceTimersByTimeAsync(500);
    expect(dead).not.toHaveBeenCalled();
    document.dispatchEvent(new Event('visibilitychange'));
    wake(as(ctx), dead); await vi.advanceTimersByTimeAsync(500);
    expect(dead).toHaveBeenCalledOnce();
  });
});

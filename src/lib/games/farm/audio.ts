import { haptic, type HapticPattern } from '#lib/haptics';
import type { FarmEvent, FarmState } from './model';
export function createFarmAudio(state: FarmState) {
  let context: AudioContext | null = null, closed = false;
  const unlock = () => {
    if (closed) return;
    try { context ??= new AudioContext(); if (context.state === 'suspended') void context.resume().catch(() => {}); } catch { /* visual feedback remains available */ }
  };
  window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
  let lastSound = 0;
  return {
    play(event: FarmEvent) {
      // Shared Catcha haptics: Vibration API on Android, the switch fallback on iOS Safari.
      const pattern: Partial<Record<FarmEvent['type'], HapticPattern>> = { harvest: 'tick', delivery: 'tick', cash: 'land', purchase: 'celebrate' };
      if (state.haptics && !document.hidden && pattern[event.type]) haptic(pattern[event.type]);
      if (state.muted || !context || context.state !== 'running' || performance.now() - lastSound < 65) return;
      lastSound = performance.now();
      const pitches = { seed: 480, plant: 330, harvest: 660, delivery: 440, sale: 740, served: 988, cash: 880, purchase: 1046 };
      const notes = event.type === 'purchase' ? [1, 1.25, 1.5, 2] : event.type === 'cash' || event.type === 'served' ? [1, 1.5] : [1];
      const detune = 0.96 + Math.random() * 0.08;
      notes.forEach((pitch, i) => {
        const oscillator = context!.createOscillator(), gain = context!.createGain(), t = context!.currentTime + i * 0.075;
        oscillator.type = event.type === 'plant' ? 'sine' : 'triangle';
        oscillator.frequency.setValueAtTime(pitches[event.type] * pitch * detune, t);
        oscillator.frequency.exponentialRampToValueAtTime(pitches[event.type] * pitch * detune * 0.82, t + 0.12);
        gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.055, t + 0.008); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        oscillator.connect(gain); gain.connect(context!.destination); oscillator.start(t); oscillator.stop(t + 0.2);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      });
    },
    destroy() { closed = true; window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); void context?.close().catch(() => {}); }
  };
}

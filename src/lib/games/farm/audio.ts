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
      if (state.haptics && !document.hidden && ['harvest', 'cash', 'purchase'].includes(event.type)) {
        try { navigator.vibrate?.(event.type === 'purchase' ? [25, 35, 40] : 12); } catch { /* unsupported device */ }
      }
      if (state.muted || !context || context.state !== 'running' || performance.now() - lastSound < 65) return;
      lastSound = performance.now();
      const pitches = { seed: 480, plant: 330, harvest: 660, delivery: 440, sale: 740, cash: 880, purchase: 1046 };
      const notes = event.type === 'purchase' ? [1, 1.25, 1.5] : event.type === 'cash' ? [1, 1.5] : [1];
      notes.forEach((pitch, i) => {
        const oscillator = context!.createOscillator(), gain = context!.createGain(), t = context!.currentTime + i * 0.075;
        oscillator.type = event.type === 'plant' ? 'sine' : 'triangle';
        oscillator.frequency.setValueAtTime(pitches[event.type] * pitch, t);
        oscillator.frequency.exponentialRampToValueAtTime(pitches[event.type] * pitch * 0.82, t + 0.12);
        gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.055, t + 0.008); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        oscillator.connect(gain); gain.connect(context!.destination); oscillator.start(t); oscillator.stop(t + 0.2);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      });
    },
    destroy() { closed = true; window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); void context?.close().catch(() => {}); }
  };
}

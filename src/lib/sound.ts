/**
 * Web Audio API synthesizer for crisp, low-latency, zero-asset game sound effects
 */

let audioCtx: AudioContext | null = null;
let isMuted = false;

function getContext(): AudioContext | null {
	if (typeof window === 'undefined') return null;
	if (!audioCtx) {
		const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
		if (AudioContextClass) {
			audioCtx = new AudioContextClass();
		}
	}
	if (audioCtx && audioCtx.state === 'suspended') {
		audioCtx.resume().catch(() => {});
	}
	return audioCtx;
}

export const sound = {
	get muted() {
		if (typeof window !== 'undefined') {
			const saved = localStorage.getItem('fgames_muted');
			if (saved !== null) isMuted = saved === 'true';
		}
		return isMuted;
	},

	set muted(val: boolean) {
		isMuted = val;
		if (typeof window !== 'undefined') {
			localStorage.setItem('fgames_muted', String(val));
		}
	},

	toggleMute() {
		this.muted = !this.muted;
		return this.muted;
	},

	playTap() {
		if (this.muted) return;
		const ctx = getContext();
		if (!ctx) return;

		const osc = ctx.createOscillator();
		const gain = ctx.createGain();

		osc.type = 'sine';
		osc.frequency.setValueAtTime(600, ctx.currentTime);
		osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.05);

		gain.gain.setValueAtTime(0.12, ctx.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);

		osc.connect(gain);
		gain.connect(ctx.destination);

		osc.start();
		osc.stop(ctx.currentTime + 0.06);
	},

	playUnscrew() {
		if (this.muted) return;
		const ctx = getContext();
		if (!ctx) return;

		const now = ctx.currentTime;
		const osc = ctx.createOscillator();
		const vibrato = ctx.createOscillator();
		const vibratoGain = ctx.createGain();
		const gain = ctx.createGain();

		osc.type = 'triangle';
		osc.frequency.setValueAtTime(320, now);
		osc.frequency.exponentialRampToValueAtTime(740, now + 0.16);

		vibrato.frequency.setValueAtTime(45, now);
		vibratoGain.gain.setValueAtTime(40, now);
		vibrato.connect(osc.frequency);

		gain.gain.setValueAtTime(0.15, now);
		gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

		osc.connect(gain);
		gain.connect(ctx.destination);

		vibrato.start(now);
		osc.start(now);
		vibrato.stop(now + 0.18);
		osc.stop(now + 0.18);
	},

	playScrewDown() {
		if (this.muted) return;
		const ctx = getContext();
		if (!ctx) return;

		const now = ctx.currentTime;

		// 1. Sliding down screw
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = 'triangle';
		osc.frequency.setValueAtTime(700, now);
		osc.frequency.exponentialRampToValueAtTime(320, now + 0.14);

		gain.gain.setValueAtTime(0.14, now);
		gain.gain.exponentialRampToValueAtTime(0.02, now + 0.14);

		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.start(now);
		osc.stop(now + 0.14);

		// 2. Metallic Clink impact
		setTimeout(() => {
			if (this.muted) return;
			const c = getContext();
			if (!c) return;
			const t = c.currentTime;

			const clink1 = c.createOscillator();
			const clink2 = c.createOscillator();
			const clinkGain = c.createGain();

			clink1.type = 'sine';
			clink1.frequency.setValueAtTime(1480, t);
			clink1.frequency.exponentialRampToValueAtTime(900, t + 0.1);

			clink2.type = 'square';
			clink2.frequency.setValueAtTime(2600, t);

			clinkGain.gain.setValueAtTime(0.2, t);
			clinkGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

			clink1.connect(clinkGain);
			clink2.connect(clinkGain);
			clinkGain.connect(c.destination);

			clink1.start(t);
			clink2.start(t);
			clink1.stop(t + 0.12);
			clink2.stop(t + 0.12);
		}, 110);
	},

	playBoltComplete() {
		if (this.muted) return;
		const ctx = getContext();
		if (!ctx) return;

		const now = ctx.currentTime;
		const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
		notes.forEach((freq, idx) => {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			const start = now + idx * 0.06;

			osc.type = 'sine';
			osc.frequency.setValueAtTime(freq, start);

			gain.gain.setValueAtTime(0.18, start);
			gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);

			osc.connect(gain);
			gain.connect(ctx.destination);

			osc.start(start);
			osc.stop(start + 0.3);
		});
	},

	playCarSlide() {
		if (this.muted) return;
		const ctx = getContext();
		if (!ctx) return;

		const now = ctx.currentTime;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();

		osc.type = 'triangle';
		osc.frequency.setValueAtTime(140, now);
		osc.frequency.linearRampToValueAtTime(200, now + 0.08);

		gain.gain.setValueAtTime(0.06, now);
		gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

		osc.connect(gain);
		gain.connect(ctx.destination);

		osc.start(now);
		osc.stop(now + 0.09);
	},

	playCarBump() {
		if (this.muted) return;
		const ctx = getContext();
		if (!ctx) return;

		const now = ctx.currentTime;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();

		osc.type = 'sine';
		osc.frequency.setValueAtTime(180, now);
		osc.frequency.exponentialRampToValueAtTime(60, now + 0.08);

		gain.gain.setValueAtTime(0.16, now);
		gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

		osc.connect(gain);
		gain.connect(ctx.destination);

		osc.start(now);
		osc.stop(now + 0.08);
	},

	playCarSnap() {
		if (this.muted) return;
		const ctx = getContext();
		if (!ctx) return;

		const now = ctx.currentTime;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();

		osc.type = 'sine';
		osc.frequency.setValueAtTime(320, now);
		osc.frequency.exponentialRampToValueAtTime(140, now + 0.06);

		gain.gain.setValueAtTime(0.14, now);
		gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

		osc.connect(gain);
		gain.connect(ctx.destination);

		osc.start(now);
		osc.stop(now + 0.07);
	},

	playCarExit() {
		if (this.muted) return;
		const ctx = getContext();
		if (!ctx) return;

		const now = ctx.currentTime;

		// 1. Two-tone friendly car horn ("BEEP BEEP!")
		const playHonk = (t: number) => {
			const h1 = ctx.createOscillator();
			const h2 = ctx.createOscillator();
			const hGain = ctx.createGain();

			h1.type = 'triangle';
			h2.type = 'triangle';
			h1.frequency.setValueAtTime(698.46, t); // F5
			h2.frequency.setValueAtTime(880.00, t); // A5

			hGain.gain.setValueAtTime(0.18, t);
			hGain.gain.exponentialRampToValueAtTime(0.01, t + 0.09);

			h1.connect(hGain);
			h2.connect(hGain);
			hGain.connect(ctx.destination);

			h1.start(t);
			h2.start(t);
			h1.stop(t + 0.09);
			h2.stop(t + 0.09);
		};

		playHonk(now);
		playHonk(now + 0.12);

		// 2. Accelerating Engine Zoom (whoosh driving away through exit)
		const engine = ctx.createOscillator();
		const filter = ctx.createBiquadFilter();
		const engineGain = ctx.createGain();

		engine.type = 'sawtooth';
		engine.frequency.setValueAtTime(130, now + 0.1);
		engine.frequency.exponentialRampToValueAtTime(420, now + 0.65);

		filter.type = 'lowpass';
		filter.frequency.setValueAtTime(500, now + 0.1);
		filter.frequency.linearRampToValueAtTime(1600, now + 0.65);

		engineGain.gain.setValueAtTime(0.05, now + 0.1);
		engineGain.gain.linearRampToValueAtTime(0.20, now + 0.35);
		engineGain.gain.exponentialRampToValueAtTime(0.001, now + 0.70);

		engine.connect(filter);
		filter.connect(engineGain);
		engineGain.connect(ctx.destination);

		engine.start(now + 0.1);
		engine.stop(now + 0.70);
	},

	playHaptic(pattern: number | number[] = 15) {
		if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
			try {
				navigator.vibrate(pattern);
			} catch (_) {}
		}
	},

	playError() {
		if (this.muted) return;
		const ctx = getContext();
		if (!ctx) return;

		const now = ctx.currentTime;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();

		osc.type = 'sawtooth';
		osc.frequency.setValueAtTime(140, now);
		osc.frequency.setValueAtTime(110, now + 0.08);

		gain.gain.setValueAtTime(0.15, now);
		gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

		osc.connect(gain);
		gain.connect(ctx.destination);

		osc.start(now);
		osc.stop(now + 0.16);
	},

	playVictory() {
		if (this.muted) return;
		const ctx = getContext();
		if (!ctx) return;

		const now = ctx.currentTime;
		const notes = [
			{ f: 523.25, time: 0, dur: 0.14 },    // C5
			{ f: 659.25, time: 0.12, dur: 0.14 }, // E5
			{ f: 783.99, time: 0.24, dur: 0.16 }, // G5
			{ f: 1046.50, time: 0.38, dur: 0.45 } // C6
		];

		notes.forEach(({ f, time, dur }) => {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			const t = now + time;

			osc.type = 'triangle';
			osc.frequency.setValueAtTime(f, t);

			gain.gain.setValueAtTime(0.2, t);
			gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

			osc.connect(gain);
			gain.connect(ctx.destination);

			osc.start(t);
			osc.stop(t + dur);
		});
	},

	playUnstoppable() {
		if (this.muted) return;
		const ctx = getContext();
		if (!ctx) return;

		const now = ctx.currentTime;
		// Epic triumphant chords (C major -> F major -> G major -> C high octave with fanfare)
		const melody = [
			{ f: 523.25, time: 0, dur: 0.12 },    // C5
			{ f: 659.25, time: 0.12, dur: 0.12 }, // E5
			{ f: 783.99, time: 0.24, dur: 0.14 }, // G5
			{ f: 1046.50, time: 0.38, dur: 0.4 }, // C6
			{ f: 1318.51, time: 0.55, dur: 0.6 }  // E6 triumphant sustain
		];

		melody.forEach(({ f, time, dur }) => {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			const t = now + time;

			osc.type = 'triangle';
			osc.frequency.setValueAtTime(f, t);

			gain.gain.setValueAtTime(0.22, t);
			gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

			osc.connect(gain);
			gain.connect(ctx.destination);

			osc.start(t);
			osc.stop(t + dur);
		});
	}
};

import { describe, it, expect } from 'vitest';
import { sound } from './sound';

describe('Sound System', () => {
	it('handles muted toggle cleanly', () => {
		const initial = sound.muted;
		sound.toggleMute();
		expect(sound.muted).toBe(!initial);
		sound.toggleMute();
		expect(sound.muted).toBe(initial);
	});

	it('safely calls all audio playback methods without crashing in headless mode', () => {
		expect(() => {
			sound.playTap();
			sound.playUnscrew();
			sound.playScrewDown();
			sound.playBoltComplete();
			sound.playCarSlide();
			sound.playCarBump();
			sound.playCarSnap();
			sound.playCarExit();
			sound.playError();
			sound.playVictory();
			sound.playUnstoppable();
			sound.playHaptic();
		}).not.toThrow();
	});
});

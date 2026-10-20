/**
 * Deterministic PRNG using Mulberry32 algorithm.
 * Generates uniform pseudo-random floats in [0, 1) and integers in [min, max].
 */
export function createPRNG(seed: number) {
	let s = seed >>> 0;

	function next(): number {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	function nextInt(min: number, max: number): number {
		return Math.floor(next() * (max - min + 1)) + min;
	}

	function choice<T>(array: readonly T[]): T {
		return array[nextInt(0, array.length - 1)];
	}

	function shuffle<T>(array: T[]): T[] {
		const arr = [...array];
		for (let i = arr.length - 1; i > 0; i--) {
			const j = Math.floor(next() * (i + 1));
			const temp = arr[i];
			arr[i] = arr[j];
			arr[j] = temp;
		}
		return arr;
	}

	return { next, nextInt, choice, shuffle };
}

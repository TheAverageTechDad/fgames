import type { NutColor } from './types';

export interface NutMove {
	from: number;
	to: number;
	count: number;
}

function canonicalKey(bolts: NutColor[][]): string {
	return bolts
		.map((b) => b.join(','))
		.sort()
		.join('|');
}

export function isLevelSolved(bolts: NutColor[][], capacity = 4): boolean {
	for (const bolt of bolts) {
		if (bolt.length > 0) {
			if (bolt.length !== capacity) return false;
			const color = bolt[0];
			if (!bolt.every((c) => c === color)) return false;
		}
	}
	return true;
}

export function solveNutsGame(bolts: NutColor[][], capacity = 4, maxStates = 25000): NutMove[] | null {
	if (isLevelSolved(bolts, capacity)) return [];

	const queue: { state: NutColor[][]; path: NutMove[] }[] = [];
	const visited = new Set<string>();

	queue.push({ state: bolts.map((b) => [...b]), path: [] });
	visited.add(canonicalKey(bolts));

	while (queue.length > 0 && visited.size < maxStates) {
		const { state, path } = queue.shift()!;

		if (isLevelSolved(state, capacity)) {
			return path;
		}

		// Find first empty bolt index to prune symmetric empty bolts
		const emptyIndex = state.findIndex((b) => b.length === 0);

		for (let i = 0; i < state.length; i++) {
			const src = state[i];
			if (src.length === 0) continue;

			// If bolt is already complete, do not disturb
			if (src.length === capacity && src.every((c) => c === src[0])) continue;

			const topColor = src[src.length - 1];

			// Count consecutive matching colors from top
			let consecutive = 0;
			for (let k = src.length - 1; k >= 0; k--) {
				if (src[k] === topColor) consecutive++;
				else break;
			}

			// Don't move if pure stack into empty bolt
			const isPure = src.every((c) => c === topColor);

			for (let j = 0; j < state.length; j++) {
				if (i === j) continue;
				const dst = state[j];

				if (dst.length === capacity) continue;

				if (dst.length === 0) {
					if (j !== emptyIndex || isPure) continue;
				} else if (dst[dst.length - 1] !== topColor) {
					continue;
				}

				const space = capacity - dst.length;
				const moveCount = Math.min(consecutive, space);

				if (moveCount > 0) {
					// Clone state
					const nextState = state.map((b) => [...b]);
					const nextSrc = nextState[i];
					const nextDst = nextState[j];

					for (let m = 0; m < moveCount; m++) {
						nextDst.push(nextSrc.pop()!);
					}

					const key = canonicalKey(nextState);
					if (!visited.has(key)) {
						visited.add(key);
						queue.push({
							state: nextState,
							path: [...path, { from: i, to: j, count: moveCount }]
						});
					}
				}
			}
		}
	}

	return null;
}

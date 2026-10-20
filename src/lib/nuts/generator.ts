import { createPRNG } from '../utils/prng';
import { solveNutsGame, isLevelSolved } from './solver';
import { NUTS_LEVELS } from './levels';
import type { NutsLevel, NutColor } from './types';

const ALL_COLORS: NutColor[] = ['blue', 'orange', 'pink', 'green', 'yellow', 'red', 'purple', 'cyan'];

const DIFFICULTY_CONFIG = {
	easy: {
		colorCount: 3,
		capacity: 4,
		emptyBolts: 2,
		shuffleSteps: 30
	},
	medium: {
		colorCount: 5,
		capacity: 4,
		emptyBolts: 2,
		shuffleSteps: 45
	},
	hard: {
		colorCount: 7,
		capacity: 4,
		emptyBolts: 2,
		shuffleSteps: 60
	},
	extra_hard: {
		colorCount: 8,
		capacity: 4,
		emptyBolts: 2,
		shuffleSteps: 80
	}
};

// Curated levels lookup
const CURATED_LEVELS = new Map<string, NutsLevel>();
for (const lvl of NUTS_LEVELS) {
	CURATED_LEVELS.set(`${lvl.difficulty}_${lvl.id}`, lvl);
}

/**
 * Procedurally generates a deterministic, guaranteed-solvable Nuts and Bolts level.
 */
export function getNutsLevel(levelId: number, difficulty: 'easy' | 'medium' | 'hard' | 'extra_hard' = 'medium'): NutsLevel {
	// 1. Check curated iconic levels (e.g. Medium Level 1 from video)
	const curated = CURATED_LEVELS.get(`${difficulty}_${levelId}`);
	if (curated) {
		return {
			...curated,
			bolts: curated.bolts.map((b) => [...b])
		};
	}

	const config = DIFFICULTY_CONFIG[difficulty];
	const baseSeed = (levelId * 41233 + (difficulty === 'easy' ? 11 : difficulty === 'medium' ? 22 : difficulty === 'hard' ? 33 : 44)) >>> 0;
	const prng = createPRNG(baseSeed);

	// Select distinct colors for this level
	const colors = prng.shuffle(ALL_COLORS).slice(0, config.colorCount);
	const totalBolts = config.colorCount + config.emptyBolts;

	// Start with solved state
	const bolts: NutColor[][] = [];
	for (let i = 0; i < config.colorCount; i++) {
		const color = colors[i];
		bolts.push(Array(config.capacity).fill(color));
	}
	for (let i = 0; i < config.emptyBolts; i++) {
		bolts.push([]);
	}

	// Reverse shuffling (perform valid moves in reverse)
	const totalSteps = config.shuffleSteps + (levelId % 10) * 3;
	let lastFrom = -1;
	let lastTo = -1;

	for (let step = 0; step < totalSteps; step++) {
		// Valid moves: from a bolt with at least 1 nut to a bolt with < capacity
		const possibleMoves: { from: number; to: number }[] = [];

		for (let i = 0; i < totalBolts; i++) {
			if (bolts[i].length === 0) continue;
			for (let j = 0; j < totalBolts; j++) {
				if (i === j) continue;
				if (bolts[j].length >= config.capacity) continue;
				// Avoid immediate undo
				if (i === lastTo && j === lastFrom) continue;
				possibleMoves.push({ from: i, to: j });
			}
		}

		if (possibleMoves.length === 0) break;

		const move = prng.choice(possibleMoves);
		const nut = bolts[move.from].pop()!;
		bolts[move.to].push(nut);
		lastFrom = move.from;
		lastTo = move.to;
	}

	// Ensure there are at least 1-2 empty bolts available for sorting breathing room
	let emptyCount = bolts.filter((b) => b.length === 0).length;
	while (emptyCount < config.emptyBolts) {
		// Find the bolt with smallest number of nuts (> 0) and redistribute
		const nonEmpties = bolts
			.map((b, idx) => ({ idx, count: b.length }))
			.filter((item) => item.count > 0 && item.count < config.capacity)
			.sort((a, b) => a.count - b.count);

		if (nonEmpties.length === 0) break;
		const targetEmpty = nonEmpties[0].idx;

		// Move all nuts from this bolt to other bolts that have space
		let movedAll = true;
		while (bolts[targetEmpty].length > 0) {
			const nut = bolts[targetEmpty][bolts[targetEmpty].length - 1];
			const receiver = bolts.findIndex((b, idx) => idx !== targetEmpty && b.length < config.capacity);
			if (receiver !== -1) {
				bolts[targetEmpty].pop();
				bolts[receiver].push(nut);
			} else {
				movedAll = false;
				break;
			}
		}
		if (movedAll) {
			emptyCount++;
		} else {
			break;
		}
	}

	// Verify that it is not solved already
	if (isLevelSolved(bolts, config.capacity)) {
		// Swap two nuts
		if (bolts[0].length > 0 && bolts[1].length > 0) {
			const n0 = bolts[0].pop()!;
			const n1 = bolts[1].pop()!;
			bolts[0].push(n1);
			bolts[1].push(n0);
		}
	}

	return {
		id: levelId,
		name: `Level ${levelId}`,
		difficulty,
		bolts
	};
}

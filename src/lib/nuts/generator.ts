import { createPRNG } from '../utils/prng.ts';
import { isLevelSolved } from './solver.ts';
import { NUTS_LEVELS } from './levels.ts';
import type { NutsLevel, NutColor } from './types.ts';

const ALL_COLORS: NutColor[] = ['blue', 'orange', 'green', 'yellow', 'red', 'purple'];

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
		colorCount: 5,
		capacity: 4,
		emptyBolts: 2,
		shuffleSteps: 60
	},
	extra_hard: {
		colorCount: 6,
		capacity: 4,
		emptyBolts: 2,
		shuffleSteps: 160
	}
};

// Curated levels lookup
const CURATED_LEVELS = new Map<string, NutsLevel>();
for (const lvl of NUTS_LEVELS) {
	CURATED_LEVELS.set(`${lvl.difficulty}_${lvl.id}`, lvl);
}

function hasCompleteColorSets(bolts: NutColor[][], capacity: number): boolean {
	const counts = new Map<NutColor, number>();
	for (const bolt of bolts) {
		if (bolt.length > capacity) return false;
		for (const color of bolt) counts.set(color, (counts.get(color) ?? 0) + 1);
	}
	return [...counts.values()].every((count) => count === capacity);
}

/**
 * Procedurally generates a deterministic, guaranteed-solvable Nuts and Bolts level.
 */
export function getNutsLevel(levelId: number, difficulty: 'easy' | 'medium' | 'hard' | 'extra_hard' = 'medium', preferCurated = true): NutsLevel {
	// 1. Check curated iconic levels (e.g. Medium Level 1 from video)
	const curated = CURATED_LEVELS.get(`${difficulty}_${levelId}`);
	if (preferCurated && curated && hasCompleteColorSets(curated.bolts, 4)) {
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

    // Offline candidate mode: the build script checks solvability and exact move count.
    // Six distinct colours keep advanced boards readable without pink/cyan near-duplicates.
    if (!preferCurated) {
        const pieces=prng.shuffle(colors.flatMap(color=>Array(config.capacity).fill(color)));
        const candidate: NutColor[][]=[];
        for(let i=0;i<config.colorCount;i++)candidate.push(pieces.slice(i*config.capacity,(i+1)*config.capacity));
        for(let i=0;i<config.emptyBolts;i++)candidate.push([]);
        return {id:levelId,name:`Level ${levelId}`,difficulty,capacity:config.capacity,bolts:candidate};
    }

	// Start with solved state
	const bolts: NutColor[][] = [];
	for (let i = 0; i < config.colorCount; i++) {
		const color = colors[i];
		bolts.push(Array(config.capacity).fill(color));
	}
	for (let i = 0; i < config.emptyBolts; i++) {
		bolts.push([]);
	}

	// Scramble by reversing legal moves. After removing a nut, its source must
	// still show that same colour (or be empty), so every step can be undone.
	const totalSteps = config.shuffleSteps + (levelId % 10) * 3;
	let lastFrom = -1;
	let lastTo = -1;

	for (let step = 0; step < totalSteps; step++) {
		const possibleMoves: { from: number; to: number; score: number }[] = [];
		const emptyCount = bolts.filter((bolt) => bolt.length === 0).length;

		for (let i = 0; i < totalBolts; i++) {
			const source = bolts[i];
			if (source.length === 0) continue;
			if (source.length > 1 && source.at(-1) !== source.at(-2)) continue;
			for (let j = 0; j < totalBolts; j++) {
				if (i === j) continue;
				const target = bolts[j];
				if (target.length >= config.capacity) continue;
				if (target.length === 0 && emptyCount <= 1 && source.length > 1) continue;
				if (i === lastTo && j === lastFrom) continue;
				possibleMoves.push({
					from: i,
					to: j,
					score: target.length > 0 && target.at(-1) !== source.at(-1) ? 4 : 1
				});
			}
		}

		if (possibleMoves.length === 0) break;

		const totalWeight = possibleMoves.reduce((sum, move) => sum + move.score, 0);
		let choice = prng.next() * totalWeight;
		const move = possibleMoves.find((candidate) => (choice -= candidate.score) < 0) ?? possibleMoves[0];
		const nut = bolts[move.from].pop()!;
		bolts[move.to].push(nut);
		lastFrom = move.from;
		lastTo = move.to;
	}

	// A rare scramble can return to a solved arrangement. Force one reversible
	// mixed stack while keeping every colour count intact.
	if (isLevelSolved(bolts, config.capacity)) {
		const sources = bolts
			.map((bolt, index) => ({ bolt, index }))
			.filter(({ bolt }) => bolt.length === config.capacity);
		const empty = bolts.findIndex((bolt) => bolt.length === 0);
		if (sources.length > 1 && empty >= 0) {
			bolts[empty].push(bolts[sources[0].index].pop()!);
			bolts[empty].push(bolts[sources[1].index].pop()!);
		}
	}

	return {
		id: levelId,
		name: `Level ${levelId}`,
		difficulty,
		bolts
	};
}

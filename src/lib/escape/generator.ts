import { createPRNG } from '../utils/prng.ts';
import { solveEscape } from './solver.ts';
import { ESCAPE_LEVELS } from './levels.ts';
import type { EscapeLevel, VehicleData, Orientation, FacingDirection } from './types.ts';

// Curated levels lookup
const CURATED_LEVELS = new Map<string, EscapeLevel>();
for (const lvl of ESCAPE_LEVELS) {
	CURATED_LEVELS.set(`${lvl.difficulty}_${lvl.id}`, lvl);
}

const DIFFICULTY_PARAMS = {
	easy: {
		minVehicles: 4,
		maxVehicles: 6,
		minMoves: 2,
		maxMoves: 6,
		targetStartCol: [1, 2],
		truckChance: 0.2
	},
	medium: {
		minVehicles: 7,
		maxVehicles: 10,
		minMoves: 6,
		maxMoves: 14,
		targetStartCol: [0, 1],
		truckChance: 0.35
	},
	hard: {
		minVehicles: 10,
		maxVehicles: 13,
		minMoves: 12,
		maxMoves: 22,
		targetStartCol: [0, 1],
		truckChance: 0.4
	},
	extra_hard: {
		minVehicles: 12,
		maxVehicles: 15,
		minMoves: 18,
		maxMoves: 35,
		targetStartCol: [0],
		truckChance: 0.45
	}
};

/**
 * Procedurally generates a guaranteed-solvable Escape (Rush Hour) level deterministically.
 */
export function getEscapeLevel(levelId: number, difficulty: 'easy' | 'medium' | 'hard' | 'extra_hard' = 'medium'): EscapeLevel {
	// Check if this level is one of our hand-crafted iconic levels
	const curated = CURATED_LEVELS.get(`${difficulty}_${levelId}`);
	if (curated) {
		return {
			...curated,
			vehicles: curated.vehicles.map((v) => ({ ...v }))
		};
	}

	const params = DIFFICULTY_PARAMS[difficulty];
	let bestLevel: EscapeLevel | null = null;
	let bestMoves = -1;

	// Try generation attempts with deterministic seeds
	const baseSeed = (levelId * 38237 + (difficulty === 'easy' ? 101 : difficulty === 'medium' ? 202 : difficulty === 'hard' ? 303 : 404)) >>> 0;

	for (let attempt = 0; attempt < 40; attempt++) {
		const prng = createPRNG((baseSeed + attempt * 7919) >>> 0);
		const grid = Array.from({ length: 6 }, () => Array(6).fill(false));
		const vehicles: VehicleData[] = [];

		function canPlace(row: number, col: number, len: number, ori: Orientation): boolean {
			for (let i = 0; i < len; i++) {
				const r = ori === 'V' ? row + i : row;
				const c = ori === 'H' ? col + i : col;
				if (r < 0 || r >= 6 || c < 0 || c >= 6) return false;
				if (grid[r][c]) return false;
			}
			return true;
		}

		function markGrid(row: number, col: number, len: number, ori: Orientation, val: boolean) {
			for (let i = 0; i < len; i++) {
				const r = ori === 'V' ? row + i : row;
				const c = ori === 'H' ? col + i : col;
				grid[r][c] = val;
			}
		}

		// 1. Place Target Red Truck on row 2
		const startCol = prng.choice(params.targetStartCol);
		markGrid(2, startCol, 2, 'H', true);
		vehicles.push({
			id: 'red',
			row: 2,
			col: startCol,
			length: 2,
			orientation: 'H',
			color: 'red',
			type: 'truck',
			isTarget: true,
			facing: 'RIGHT'
		});

		// 2. Place blocking vertical vehicle(s) crossing row 2 in front of the truck
		const blockerCols = [];
		for (let c = startCol + 2; c < 6; c++) blockerCols.push(c);
		const numBlockers = prng.nextInt(1, Math.min(2, blockerCols.length));
		const chosenCols = prng.shuffle(blockerCols).slice(0, numBlockers);

		for (const bc of chosenCols) {
			const len = prng.next() < params.truckChance ? 3 : 2;
			const validRows = [];
			for (let r = 0; r <= 6 - len; r++) {
				// Blocker must cross row 2
				if (r <= 2 && r + len - 1 >= 2) {
					if (canPlace(r, bc, len, 'V')) validRows.push(r);
				}
			}
			if (validRows.length > 0) {
				const br = prng.choice(validRows);
				markGrid(br, bc, len, 'V', true);
				vehicles.push({
					id: `blk_${bc}`,
					row: br,
					col: bc,
					length: len as 2 | 3,
					orientation: 'V',
					color: len === 3 ? 'purple' : 'tan',
					type: len === 3 ? 'truck' : 'car',
					subtype: len === 3 ? 'tanker' : 'suv',
					facing: prng.next() > 0.5 ? 'UP' : 'DOWN'
				});
			}
		}

		// 3. Fill board with additional puzzle vehicles
		const targetCount = prng.nextInt(params.minVehicles, params.maxVehicles);
		let placeAttempts = 0;

		const carColors: ('white' | 'blue' | 'tan')[] = ['white', 'blue', 'tan'];
		let colorIdx = 0;

		while (vehicles.length < targetCount && placeAttempts < 50) {
			placeAttempts++;
			const ori: Orientation = prng.next() > 0.5 ? 'H' : 'V';
			const len: 2 | 3 = prng.next() < params.truckChance ? 3 : 2;

			const row = ori === 'H' ? prng.nextInt(0, 5) : prng.nextInt(0, 6 - len);
			const col = ori === 'H' ? prng.nextInt(0, 6 - len) : prng.nextInt(0, 5);

			// Don't place on row 2 ahead of target if it's horizontal (only red truck can exit)
			if (ori === 'H' && row === 2) continue;

			if (canPlace(row, col, len, ori)) {
				markGrid(row, col, len, ori, true);

				const vid = `v_${vehicles.length}`;
				let color: VehicleData['color'];
				let subtype: VehicleData['subtype'];
				let facing: FacingDirection;

				if (len === 3) {
					const isTanker = prng.next() > 0.5;
					color = isTanker ? 'lilac' : 'purple';
					subtype = isTanker ? 'tanker' : 'bus';
					facing = ori === 'H' ? (prng.next() > 0.5 ? 'RIGHT' : 'LEFT') : (prng.next() > 0.5 ? 'UP' : 'DOWN');
				} else {
					color = carColors[colorIdx % carColors.length];
					colorIdx++;
					subtype = color === 'tan' ? 'suv' : 'sedan';
					facing = ori === 'H' ? (prng.next() > 0.5 ? 'RIGHT' : 'LEFT') : (prng.next() > 0.5 ? 'UP' : 'DOWN');
				}

				vehicles.push({
					id: vid,
					row,
					col,
					length: len,
					orientation: ori,
					color,
					type: len === 3 ? 'truck' : 'car',
					subtype,
					facing
				});
			}
		}

		// 4. Test solvability with fast BFS solver
		const solution = solveEscape(vehicles);
		if (solution !== null && solution.length > 0) {
			const moves = solution.length;
			if (moves >= params.minMoves && moves <= params.maxMoves) {
				return {
					id: levelId,
					name: `Level ${levelId}`,
					difficulty,
					minMoves: moves,
					vehicles
				};
			}
			if (moves > bestMoves) {
				bestMoves = moves;
				bestLevel = {
					id: levelId,
					name: `Level ${levelId}`,
					difficulty,
					minMoves: moves,
					vehicles
				};
			}
		}
	}

	// Fallback to best solvable generated level or default
	if (bestLevel) {
		return bestLevel;
	}

	// Guaranteed safe fallback from curated list
	const fallback = ESCAPE_LEVELS.find((l) => l.difficulty === difficulty) || ESCAPE_LEVELS[0];
	return {
		...fallback,
		id: levelId,
		name: `Level ${levelId}`
	};
}

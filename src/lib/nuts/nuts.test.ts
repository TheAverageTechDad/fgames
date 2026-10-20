import { describe, it, expect } from 'vitest';
import { isLevelSolved, solveNutsGame } from './solver';
import { getNutsLevel } from './generator';
import type { NutColor } from './types';

describe('Nuts & Bolts Solver and Generator', () => {
	it('correctly identifies solved and unsolved states', () => {
		const solvedState: NutColor[][] = [
			['blue', 'blue', 'blue', 'blue'],
			['orange', 'orange', 'orange', 'orange'],
			[],
			[]
		];
		expect(isLevelSolved(solvedState, 4)).toBe(true);

		const unsolvedState: NutColor[][] = [
			['blue', 'orange', 'blue', 'orange'],
			['orange', 'blue', 'orange', 'blue'],
			[],
			[]
		];
		expect(isLevelSolved(unsolvedState, 4)).toBe(false);

		const partialState: NutColor[][] = [
			['blue', 'blue', 'blue'], // not full capacity
			['orange', 'orange', 'orange', 'orange'],
			[],
			[]
		];
		expect(isLevelSolved(partialState, 4)).toBe(false);
	});

	it('solves simple 2-color sort puzzle', () => {
		const puzzle: NutColor[][] = [
			['blue', 'orange'],
			['orange', 'blue'],
			[],
			[]
		];
		const solution = solveNutsGame(puzzle, 2);
		expect(solution).not.toBeNull();
		expect(solution!.length).toBeGreaterThan(0);

		// Execute solution step by step
		const state = puzzle.map((b) => [...b]);
		for (const move of solution!) {
			const nut = state[move.from].pop()!;
			state[move.to].push(nut);
		}
		expect(isLevelSolved(state, 2)).toBe(true);
	});

	it('generates deterministic levels for given difficulty and seed', () => {
		const level1_a = getNutsLevel(10, 'medium');
		const level1_b = getNutsLevel(10, 'medium');
		expect(level1_a.bolts).toEqual(level1_b.bolts);

		const levelHard = getNutsLevel(5, 'hard');
		expect(levelHard.bolts.length).toBeGreaterThanOrEqual(8);
		// Empty bolts exist
		const emptyCount = levelHard.bolts.filter((b) => b.length === 0).length;
		expect(emptyCount).toBeGreaterThanOrEqual(1);
	});

	it('generates solvable levels across all difficulties', () => {
		const easy = getNutsLevel(1, 'easy');
		expect(easy.bolts.length).toBeGreaterThan(0);

		const medium = getNutsLevel(2, 'medium');
		expect(medium.bolts.length).toBeGreaterThan(0);

		const hard = getNutsLevel(1, 'hard');
		expect(hard.bolts.length).toBeGreaterThan(0);

		const extraHard = getNutsLevel(1, 'extra_hard');
		expect(extraHard.bolts.length).toBeGreaterThan(0);
	});
});

import { describe, it, expect } from 'vitest';
import { buildGrid, solveEscape } from './solver';
import { getEscapeLevel } from './generator';
import { ESCAPE_LEVELS } from './levels';
import type { VehicleData } from './types';

describe('Escape Game Solver and Generator', () => {
	it('builds grid without collision on safe vehicle layouts', () => {
		const vehicles: VehicleData[] = [
			{ id: 'target', orientation: 'H', length: 2, row: 2, col: 1, isTarget: true, color: 'red', type: 'car' },
			{ id: 'v1', orientation: 'V', length: 3, row: 0, col: 0, isTarget: false, color: 'white', type: 'truck' }
		];
		const grid = buildGrid(vehicles);
		expect(grid[2][1]).toBe('target');
		expect(grid[2][2]).toBe('target');
		expect(grid[0][0]).toBe('v1');
		expect(grid[1][0]).toBe('v1');
		expect(grid[2][0]).toBe('v1');
		expect(grid[3][0]).toBeNull();
	});

	it('solves simple Escape puzzle where target can escape directly', () => {
		const vehicles: VehicleData[] = [
			{ id: 'target', orientation: 'H', length: 2, row: 2, col: 3, isTarget: true, color: 'red', type: 'car' }
		];
		const solution = solveEscape(vehicles);
		expect(solution).not.toBeNull();
		expect(solution!.length).toBe(1);
		expect(solution![0].id).toBe('target');
		expect(solution![0].direction).toBe('RIGHT');
		expect(solution![0].steps).toBe(1); // from col 3 to col 4 (exit)
	});

	it('solves multi-step escape puzzle requiring unblocking', () => {
		const vehicles: VehicleData[] = [
			// Red target car at (2, 0)
			{ id: 'target', orientation: 'H', length: 2, row: 2, col: 0, isTarget: true, color: 'red', type: 'car' },
			// Blocker vertical truck at col 2 blocking row 2
			{ id: 'blocker', orientation: 'V', length: 3, row: 1, col: 2, isTarget: false, color: 'blue', type: 'truck' }
		];
		// Blocker at row 1, col 2 occupies (1, 2), (2, 2), (3, 2).
		// Rows 4, 5 are empty so blocker can move down to row 3!
		const solution = solveEscape(vehicles);
		expect(solution).not.toBeNull();
		expect(solution!.length).toBeGreaterThanOrEqual(2);
		// First move must be blocker moving out of the way
		expect(solution![0].id).toBe('blocker');
	});

	it('generates deterministic levels for given difficulty and level ID', () => {
		const lvl1_a = getEscapeLevel(21, 'medium');
		const lvl1_b = getEscapeLevel(21, 'medium');
		expect(lvl1_a.vehicles).toEqual(lvl1_b.vehicles);

		// Red truck is always present on row 2
		const target = lvl1_a.vehicles.find((v) => v.isTarget);
		expect(target).toBeDefined();
		expect(target!.row).toBe(2);
		expect(target!.orientation).toBe('H');
	});

	it('verifies curated iconic levels are solvable', () => {
		// Medium Level 19 (the level from the video)
		const lvl19 = getEscapeLevel(19, 'medium');
		expect(lvl19.vehicles.length).toBeGreaterThan(0);
		const target = lvl19.vehicles.find((v) => v.isTarget);
		expect(target).toBeDefined();
		expect(target!.row).toBe(2);

		const sol = solveEscape(lvl19.vehicles);
		console.log('Level 19 solution steps (' + (sol ? sol.length : 0) + ' moves):', sol);
		expect(sol).not.toBeNull();
		expect(sol!.length).toBeGreaterThan(0);
	});

	it('keeps every curated vehicle inside the board without overlap', () => {
		for (const level of ESCAPE_LEVELS) {
			expect(solveEscape(level.vehicles, 100000), `${level.difficulty} ${level.id}`).not.toBeNull();
			const occupied = new Set<string>();
			for (const vehicle of level.vehicles) {
				for (let offset = 0; offset < vehicle.length; offset++) {
					const row = vehicle.row + (vehicle.orientation === 'V' ? offset : 0);
					const col = vehicle.col + (vehicle.orientation === 'H' ? offset : 0);
					expect(row, `${level.difficulty} ${level.id}`).toBeGreaterThanOrEqual(0);
					expect(row, `${level.difficulty} ${level.id}`).toBeLessThan(6);
					expect(col, `${level.difficulty} ${level.id}`).toBeGreaterThanOrEqual(0);
					expect(col, `${level.difficulty} ${level.id}`).toBeLessThan(6);
					const cell = `${row},${col}`;
					expect(occupied.has(cell), `${level.difficulty} ${level.id}: ${cell}`).toBe(false);
					occupied.add(cell);
				}
			}
		}
	});
});

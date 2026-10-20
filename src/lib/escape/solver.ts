import type { VehicleData } from './types';

export interface VehicleMove {
	id: string;
	direction: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN';
	steps: number;
}

export function buildGrid(vehicles: VehicleData[]): (string | null)[][] {
	const grid: (string | null)[][] = Array.from({ length: 6 }, () => Array(6).fill(null));
	for (const v of vehicles) {
		for (let i = 0; i < v.length; i++) {
			const r = v.orientation === 'V' ? v.row + i : v.row;
			const c = v.orientation === 'H' ? v.col + i : v.col;
			if (r >= 0 && r < 6 && c >= 0 && c < 6) {
				grid[r][c] = v.id;
			}
		}
	}
	return grid;
}

function stateKey(vehicles: VehicleData[]): string {
	return vehicles.map((v) => `${v.id}:${v.row},${v.col}`).join('|');
}

export function solveEscape(vehicles: VehicleData[], maxVisited = 30000): VehicleMove[] | null {
	const target = vehicles.find((v) => v.isTarget);
	if (!target) return null;

	// If already at exit
	if (target.col === 4) return [];

	const queue: { vehicles: VehicleData[]; path: VehicleMove[] }[] = [];
	const visited = new Set<string>();

	queue.push({ vehicles: vehicles.map((v) => ({ ...v })), path: [] });
	visited.add(stateKey(vehicles));

	while (queue.length > 0 && visited.size < maxVisited) {
		const { vehicles: current, path } = queue.shift()!;
		const curTarget = current.find((v) => v.isTarget)!;

		// Check if target car can reach exit
		if (curTarget.col === 4) {
			return path;
		}

		const grid = buildGrid(current);

		for (let i = 0; i < current.length; i++) {
			const v = current[i];

			if (v.orientation === 'H') {
				// 1. Move Left
				let stepsLeft = 1;
				while (v.col - stepsLeft >= 0 && grid[v.row][v.col - stepsLeft] === null) {
					const nextVehicles = current.map((item, idx) =>
						idx === i ? { ...item, col: item.col - stepsLeft } : { ...item }
					);
					const key = stateKey(nextVehicles);
					if (!visited.has(key)) {
						visited.add(key);
						queue.push({
							vehicles: nextVehicles,
							path: [...path, { id: v.id, direction: 'LEFT', steps: stepsLeft }]
						});
					}
					stepsLeft++;
				}

				// 2. Move Right
				let stepsRight = 1;
				while (
					v.col + v.length - 1 + stepsRight < 6 &&
					grid[v.row][v.col + v.length - 1 + stepsRight] === null
				) {
					const nextVehicles = current.map((item, idx) =>
						idx === i ? { ...item, col: item.col + stepsRight } : { ...item }
					);
					const key = stateKey(nextVehicles);
					if (!visited.has(key)) {
						visited.add(key);
						queue.push({
							vehicles: nextVehicles,
							path: [...path, { id: v.id, direction: 'RIGHT', steps: stepsRight }]
						});
					}
					stepsRight++;
				}
			} else {
				// Vertical
				// 1. Move Up
				let stepsUp = 1;
				while (v.row - stepsUp >= 0 && grid[v.row - stepsUp][v.col] === null) {
					const nextVehicles = current.map((item, idx) =>
						idx === i ? { ...item, row: item.row - stepsUp } : { ...item }
					);
					const key = stateKey(nextVehicles);
					if (!visited.has(key)) {
						visited.add(key);
						queue.push({
							vehicles: nextVehicles,
							path: [...path, { id: v.id, direction: 'UP', steps: stepsUp }]
						});
					}
					stepsUp++;
				}

				// 2. Move Down
				let stepsDown = 1;
				while (
					v.row + v.length - 1 + stepsDown < 6 &&
					grid[v.row + v.length - 1 + stepsDown][v.col] === null
				) {
					const nextVehicles = current.map((item, idx) =>
						idx === i ? { ...item, row: item.row + stepsDown } : { ...item }
					);
					const key = stateKey(nextVehicles);
					if (!visited.has(key)) {
						visited.add(key);
						queue.push({
							vehicles: nextVehicles,
							path: [...path, { id: v.id, direction: 'DOWN', steps: stepsDown }]
						});
					}
					stepsDown++;
				}
			}
		}
	}

	return null;
}

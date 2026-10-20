import type { EscapeLevel } from './types';

export const ESCAPE_LEVELS: EscapeLevel[] = [
	// EASY LEVELS (Tutorial / quick wins)
	{
		id: 1,
		name: 'Level 1',
		difficulty: 'easy',
		minMoves: 2,
		vehicles: [
			{ id: 'red', row: 2, col: 1, length: 2, orientation: 'H', color: 'red', type: 'truck', isTarget: true },
			{ id: 'car1', row: 1, col: 3, length: 2, orientation: 'V', color: 'blue', type: 'car' },
			{ id: 'car2', row: 4, col: 2, length: 2, orientation: 'H', color: 'tan', type: 'car' }
		]
	},
	{
		id: 2,
		name: 'Level 2',
		difficulty: 'easy',
		minMoves: 4,
		vehicles: [
			{ id: 'red', row: 2, col: 0, length: 2, orientation: 'H', color: 'red', type: 'truck', isTarget: true },
			{ id: 'v1', row: 1, col: 2, length: 2, orientation: 'V', color: 'tan', type: 'car' },
			{ id: 'v2', row: 1, col: 3, length: 3, orientation: 'V', color: 'purple', type: 'bus' },
			{ id: 'v3', row: 0, col: 4, length: 2, orientation: 'H', color: 'blue', type: 'car' },
			{ id: 'v4', row: 4, col: 0, length: 3, orientation: 'H', color: 'lilac', type: 'truck' }
		]
	},

	// MEDIUM LEVELS
	{
		id: 1,
		name: 'Level 1',
		difficulty: 'medium',
		minMoves: 6,
		vehicles: [
			{ id: 'red', row: 2, col: 2, length: 2, orientation: 'H', color: 'red', type: 'truck', isTarget: true, facing: 'RIGHT' },
			{ id: 'white_v', row: 0, col: 1, length: 2, orientation: 'V', color: 'white', type: 'car', facing: 'UP', subtype: 'sedan' },
			{ id: 'bus_v1', row: 0, col: 5, length: 3, orientation: 'V', color: 'purple', type: 'truck', facing: 'DOWN', subtype: 'tanker' },
			{ id: 'tan_h1', row: 1, col: 2, length: 2, orientation: 'H', color: 'tan', type: 'car', facing: 'RIGHT', subtype: 'suv' },
			{ id: 'blue_v', row: 1, col: 4, length: 2, orientation: 'V', color: 'blue', type: 'car', facing: 'UP', subtype: 'sedan' },
			{ id: 'tan_h2', row: 2, col: 0, length: 2, orientation: 'H', color: 'tan', type: 'car', facing: 'RIGHT', subtype: 'suv' },
			{ id: 'bus_v2', row: 3, col: 0, length: 3, orientation: 'V', color: 'purple', type: 'bus', facing: 'DOWN', subtype: 'bus' },
			{ id: 'van_v', row: 3, col: 1, length: 3, orientation: 'V', color: 'lilac', type: 'truck', facing: 'DOWN', subtype: 'tanker' },
			{ id: 'tan_h3', row: 3, col: 4, length: 2, orientation: 'H', color: 'tan', type: 'car', facing: 'RIGHT', subtype: 'suv' },
			{ id: 'white_h', row: 4, col: 4, length: 2, orientation: 'H', color: 'white', type: 'car', facing: 'LEFT', subtype: 'sedan' },
			{ id: 'truck_h', row: 5, col: 3, length: 3, orientation: 'H', color: 'purple', type: 'truck', facing: 'LEFT', subtype: 'container' }
		]
	},
	{
		id: 2,
		name: 'Level 2',
		difficulty: 'medium',
		minMoves: 5,
		vehicles: [
			{ id: 'red', row: 2, col: 0, length: 2, orientation: 'H', color: 'red', type: 'truck', isTarget: true, facing: 'RIGHT' },
			{ id: 'c1', row: 0, col: 0, length: 2, orientation: 'H', color: 'blue', type: 'car', facing: 'RIGHT', subtype: 'sedan' },
			{ id: 'c2', row: 0, col: 3, length: 3, orientation: 'V', color: 'purple', type: 'truck', facing: 'DOWN', subtype: 'tanker' },
			{ id: 'c3', row: 1, col: 2, length: 2, orientation: 'V', color: 'tan', type: 'car', facing: 'DOWN', subtype: 'suv' },
			{ id: 'c4', row: 2, col: 4, length: 2, orientation: 'V', color: 'white', type: 'car', facing: 'UP', subtype: 'sedan' },
			{ id: 'c5', row: 3, col: 1, length: 2, orientation: 'H', color: 'tan', type: 'car', facing: 'RIGHT', subtype: 'suv' },
			{ id: 'c6', row: 4, col: 3, length: 2, orientation: 'H', color: 'blue', type: 'car', facing: 'RIGHT', subtype: 'sedan' },
			{ id: 'c7', row: 5, col: 0, length: 3, orientation: 'H', color: 'purple', type: 'truck', facing: 'LEFT', subtype: 'container' }
		]
	},

	// HARD LEVELS
	{
		id: 1,
		name: 'Level 1',
		difficulty: 'hard',
		minMoves: 16,
		vehicles: [
			{ id: 'red', row: 2, col: 1, length: 2, orientation: 'H', color: 'red', type: 'truck', isTarget: true },
			{ id: 'c1', row: 0, col: 0, length: 2, orientation: 'V', color: 'tan', type: 'car' },
			{ id: 'c2', row: 0, col: 1, length: 2, orientation: 'H', color: 'blue', type: 'car' },
			{ id: 'c3', row: 0, col: 3, length: 3, orientation: 'V', color: 'purple', type: 'bus' },
			{ id: 'c4', row: 1, col: 4, length: 2, orientation: 'H', color: 'white', type: 'car' },
			{ id: 'c5', row: 2, col: 0, length: 2, orientation: 'V', color: 'lilac', type: 'car' },
			{ id: 'c6', row: 3, col: 1, length: 2, orientation: 'H', color: 'tan', type: 'car' },
			{ id: 'c7', row: 3, col: 4, length: 2, orientation: 'V', color: 'blue', type: 'car' },
			{ id: 'c8', row: 4, col: 0, length: 2, orientation: 'H', color: 'white', type: 'car' },
			{ id: 'c9', row: 5, col: 1, length: 3, orientation: 'H', color: 'lilac', type: 'truck' }
		]
	},

	// EXTRA HARD LEVELS (Master Rush Hour puzzle)
	{
		id: 1,
		name: 'Level 1',
		difficulty: 'extra_hard',
		minMoves: 28,
		vehicles: [
			{ id: 'red', row: 2, col: 0, length: 2, orientation: 'H', color: 'red', type: 'truck', isTarget: true },
			{ id: 'v1', row: 0, col: 0, length: 2, orientation: 'H', color: 'tan', type: 'car' },
			{ id: 'v2', row: 0, col: 2, length: 2, orientation: 'V', color: 'blue', type: 'car' },
			{ id: 'v3', row: 0, col: 3, length: 3, orientation: 'V', color: 'purple', type: 'bus' },
			{ id: 'v4', row: 1, col: 4, length: 2, orientation: 'H', color: 'white', type: 'car' },
			{ id: 'v5', row: 2, col: 2, length: 2, orientation: 'V', color: 'tan', type: 'car' },
			{ id: 'v6', row: 2, col: 5, length: 3, orientation: 'V', color: 'purple', type: 'bus' },
			{ id: 'v7', row: 3, col: 0, length: 2, orientation: 'V', color: 'lilac', type: 'car' },
			{ id: 'v8', row: 3, col: 3, length: 2, orientation: 'H', color: 'blue', type: 'car' },
			{ id: 'v9', row: 4, col: 1, length: 2, orientation: 'H', color: 'white', type: 'car' },
			{ id: 'v10', row: 5, col: 1, length: 3, orientation: 'H', color: 'lilac', type: 'truck' }
		]
	}
];

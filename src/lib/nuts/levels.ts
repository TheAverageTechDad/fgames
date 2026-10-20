import type { NutsLevel } from './types.ts';

export const NUTS_LEVELS: NutsLevel[] = [
	// EASY LEVELS
	{
		id: 1,
		name: 'Easy 1',
		difficulty: 'easy',
		bolts: [
			['blue', 'orange', 'blue', 'orange'],
			['orange', 'blue', 'orange', 'blue'],
			[],
			[]
		]
	},
	{
		id: 2,
		name: 'Easy 2',
		difficulty: 'easy',
		bolts: [
			['green', 'pink', 'green', 'pink'],
			['pink', 'green', 'pink', 'green'],
			['blue', 'blue', 'orange', 'orange'],
			['orange', 'orange', 'blue', 'blue'],
			[],
			[]
		]
	},
	{
		id: 3,
		name: 'Easy 3',
		difficulty: 'easy',
		bolts: [
			['yellow', 'red', 'green', 'blue'],
			['blue', 'yellow', 'red', 'green'],
			['green', 'blue', 'yellow', 'red'],
			['red', 'green', 'blue', 'yellow'],
			[],
			[]
		]
	},

	// MEDIUM LEVELS (Level 1 is the EXACT layout from the user's video!)
	{
		id: 1,
		name: 'Level 1',
		difficulty: 'medium',
		bolts: [
			['green', 'pink', 'orange', 'blue'],
			['green', 'pink', 'green'],
			['blue', 'pink', 'pink', 'orange'],
			['blue', 'yellow', 'red', 'green'],
			['red', 'orange', 'blue'],
			['red', 'yellow', 'red'],
			['yellow', 'yellow'],
			['orange'],
			[]
		]
	},
	{
		id: 2,
		name: 'Level 2',
		difficulty: 'medium',
		bolts: [
			['cyan', 'pink', 'yellow', 'blue'],
			['green', 'orange', 'cyan', 'pink'],
			['yellow', 'blue', 'green', 'orange'],
			['pink', 'yellow', 'blue', 'green'],
			['orange', 'cyan', 'pink', 'yellow'],
			[],
			[]
		]
	},
	{
		id: 3,
		name: 'Level 3',
		difficulty: 'medium',
		bolts: [
			['red', 'blue', 'orange', 'green'],
			['yellow', 'pink', 'cyan', 'red'],
			['blue', 'orange', 'green', 'yellow'],
			['pink', 'cyan', 'red', 'blue'],
			['orange', 'green', 'yellow', 'pink'],
			['cyan', 'red', 'blue', 'orange'],
			[],
			[]
		]
	},

	// HARD LEVELS
	{
		id: 1,
		name: 'Hard 1',
		difficulty: 'hard',
		bolts: [
			['purple', 'cyan', 'red', 'yellow'],
			['pink', 'green', 'orange', 'blue'],
			['cyan', 'red', 'yellow', 'purple'],
			['green', 'orange', 'blue', 'pink'],
			['red', 'yellow', 'purple', 'cyan'],
			['orange', 'blue', 'pink', 'green'],
			['yellow', 'purple', 'cyan', 'red'],
			[],
			[]
		]
	},
	{
		id: 2,
		name: 'Hard 2',
		difficulty: 'hard',
		bolts: [
			['blue', 'purple', 'green', 'red'],
			['yellow', 'orange', 'cyan', 'pink'],
			['pink', 'blue', 'purple', 'green'],
			['red', 'yellow', 'orange', 'cyan'],
			['cyan', 'pink', 'blue', 'purple'],
			['green', 'red', 'yellow', 'orange'],
			['orange', 'cyan', 'pink', 'blue'],
			[],
			[]
		]
	},

	// EXTRA HARD LEVELS
	{
		id: 1,
		name: 'Extra Hard 1',
		difficulty: 'extra_hard',
		bolts: [
			['blue', 'red', 'green', 'yellow'],
			['orange', 'purple', 'pink', 'cyan'],
			['yellow', 'green', 'red', 'blue'],
			['cyan', 'pink', 'purple', 'orange'],
			['red', 'blue', 'yellow', 'green'],
			['purple', 'orange', 'cyan', 'pink'],
			['green', 'yellow', 'blue', 'red'],
			['pink', 'cyan', 'orange', 'purple'],
			[],
			[]
		]
	}
];

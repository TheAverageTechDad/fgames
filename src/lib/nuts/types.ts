export type NutColor = 'blue' | 'orange' | 'pink' | 'green' | 'red' | 'yellow' | 'purple' | 'cyan' | 'brown' | 'lime';

export interface NutItem {
	id: string;
	color: NutColor;
}

export interface NutTheme {
	primary: string;
	topFace: string;
	leftFace: string;
	rightFace: string;
	highlight: string;
	holeShadow: string;
	symbol: string;
	iconSvg: string;
}

export const NUT_THEMES: Record<NutColor, NutTheme> = {
	blue: {
		primary: '#2563eb',
		topFace: '#3b82f6',
		leftFace: '#1d4ed8',
		rightFace: '#1e40af',
		highlight: '#93c5fd',
		holeShadow: '#172554',
		symbol: 'drop',
		iconSvg: `<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" fill="currentColor"/>`
	},
	orange: {
		primary: '#ea580c',
		topFace: '#f97316',
		leftFace: '#c2410c',
		rightFace: '#9a3412',
		highlight: '#fdba74',
		holeShadow: '#431407',
		symbol: 'diamond',
		iconSvg: `<path d="M12 2L2 12l10 10 10-10L12 2z" fill="currentColor"/>`
	},
	pink: {
		primary: '#f472b6',
		topFace: '#ec4899',
		leftFace: '#be185d',
		rightFace: '#9d174d',
		highlight: '#fbcfe8',
		holeShadow: '#500724',
		symbol: 'crown',
		iconSvg: `<path d="M3 17h18v2H3v-2zm0-7l4 4 5-8 5 8 4-4v6H3v-6z" fill="currentColor"/>`
	},
	green: {
		primary: '#16a34a',
		topFace: '#22c55e',
		leftFace: '#15803d',
		rightFace: '#166534',
		highlight: '#86efac',
		holeShadow: '#052e16',
		symbol: 'clover',
		iconSvg: `<path d="M12 3a3 3 0 0 0-3 3c0 .77.3 1.48.78 2.01A3 3 0 0 0 6 12a3 3 0 0 0 3 3c.77 0 1.48-.3 2.01-.78A3 3 0 0 0 12 18a3 3 0 0 0 3-3c0-.77-.3-1.48-.78-2.01A3 3 0 0 0 18 12a3 3 0 0 0-3-3c-.77 0-1.48.3-2.01.78A3 3 0 0 0 12 3zm0 10v6h-2v-6h2z" fill="currentColor"/>`
	},
	red: {
		primary: '#dc2626',
		topFace: '#ef4444',
		leftFace: '#b91c1c',
		rightFace: '#991b1b',
		highlight: '#fca5a5',
		holeShadow: '#450a0a',
		symbol: 'heart',
		iconSvg: `<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="currentColor"/>`
	},
	yellow: {
		primary: '#eab308',
		topFace: '#facc15',
		leftFace: '#ca8a04',
		rightFace: '#a16207',
		highlight: '#fef08a',
		holeShadow: '#422006',
		symbol: 'sun',
		iconSvg: `<path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0-5v3m0 14v3M4.22 4.22l2.12 2.12m11.32 11.32l2.12 2.12M1 12h3m16 0h3M4.22 19.78l2.12-2.12m11.32-11.32l2.12-2.12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/>`
	},
	purple: {
		primary: '#9333ea',
		topFace: '#a855f7',
		leftFace: '#7e22ce',
		rightFace: '#6b21a8',
		highlight: '#d8b4fe',
		holeShadow: '#3b0764',
		symbol: 'star',
		iconSvg: `<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor"/>`
	},
	cyan: {
		primary: '#0891b2',
		topFace: '#06b6d4',
		leftFace: '#0e7490',
		rightFace: '#155e75',
		highlight: '#67e8f9',
		holeShadow: '#083344',
		symbol: 'moon',
		iconSvg: `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="currentColor"/>`
	},
	brown: {
		primary: '#92400e',
		topFace: '#b45309',
		leftFace: '#78350f',
		rightFace: '#5c2a0b',
		highlight: '#fcd9a8',
		holeShadow: '#2b1404',
		symbol: 'cloud',
		iconSvg: `<path d="M7 19a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 9.5a4.5 4.5 0 0 1-.5 9.5H7z" fill="currentColor"/>`
	},
	lime: {
		primary: '#65a30d',
		topFace: '#84cc16',
		leftFace: '#4d7c0f',
		rightFace: '#3f6212',
		highlight: '#d9f99d',
		holeShadow: '#1a2e05',
		symbol: 'leaf',
		iconSvg: `<path d="M20 4C9 4 4 9 4 16c0 1.4.3 2.7.8 4L6.6 18A9 9 0 0 1 14 9a10 10 0 0 0-6.7 9.6C16 20 20 13 20 4z" fill="currentColor"/>`
	}
};

export interface NutsLevel {
	id: number;
	name: string;
	difficulty: 'easy' | 'medium' | 'hard' | 'extra_hard';
	bolts: NutColor[][]; // each array represents stack from bottom to top
	capacity?: number;   // default 4
}

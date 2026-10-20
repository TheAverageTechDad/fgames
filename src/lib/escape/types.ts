export type Orientation = 'H' | 'V';
export type FacingDirection = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export interface VehicleData {
	id: string;
	row: number; // 0 to 5
	col: number; // 0 to 5
	length: 2 | 3;
	orientation: Orientation;
	color: 'red' | 'tan' | 'white' | 'blue' | 'purple' | 'lilac' | 'green' | 'yellow';
	type: 'car' | 'truck' | 'bus' | 'van';
	facing?: FacingDirection;
	subtype?: 'sedan' | 'suv' | 'tanker' | 'bus' | 'container';
	isTarget?: boolean;
}

export interface EscapeLevel {
	id: number;
	name: string;
	difficulty: 'easy' | 'medium' | 'hard' | 'extra_hard';
	minMoves?: number;
	vehicles: VehicleData[];
}

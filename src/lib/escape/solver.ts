import type { VehicleData } from './types.ts';

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

/** Breadth-first search over compact position strings; one slide is one move. */
export function solveEscape(vehicles: VehicleData[], maxVisited = Infinity): VehicleMove[] | null {
 const target = vehicles.findIndex(v => v.isTarget);
 if (target < 0) return null;
 const start = vehicles.map(v => String(v.orientation === 'H' ? v.col : v.row)).join('');
 const queue = [start];
 const parents = new Map<string, { key: string; move: VehicleMove } | null>([[start, null]]);
 for (let head = 0; head < queue.length && parents.size <= maxVisited; head++) {
  const key = queue[head];
  if (Number(key[target]) === 4) {
   const path: VehicleMove[] = [];
   let node = key;
   while (parents.get(node)) { const p = parents.get(node)!; path.push(p.move); node = p.key; }
   return path.reverse();
  }
  const grid = new Int16Array(36).fill(-1);
  vehicles.forEach((v,i) => {
   const pos = Number(key[i]);
   for(let k=0;k<v.length;k++) grid[v.orientation === 'H' ? v.row*6+pos+k : (pos+k)*6+v.col] = i;
  });
  vehicles.forEach((v,i) => {
   const pos = Number(key[i]);
   for (const sign of [-1,1]) for(let steps=1;steps<6;steps++) {
    const edge = sign < 0 ? pos-steps : pos+v.length-1+steps;
    if(edge<0 || edge>=6 || grid[v.orientation === 'H' ? v.row*6+edge : edge*6+v.col] !== -1) break;
    const next = key.slice(0,i)+String(pos+sign*steps)+key.slice(i+1);
    if(parents.has(next)) continue;
    parents.set(next,{key,move:{id:v.id,direction:v.orientation==='H' ? (sign<0?'LEFT':'RIGHT') : (sign<0?'UP':'DOWN'),steps}});
    queue.push(next);
   }
  });
 }
 return null;
}

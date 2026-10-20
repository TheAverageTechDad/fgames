import type { NutColor } from './types.ts';

export interface NutMove {
	from: number;
	to: number;
	count: number;
}

function canonicalKey(bolts: NutColor[][]): string {
	return bolts
		.map((b) => b.join(','))
		.sort()
		.join('|');
}

export function isLevelSolved(bolts: NutColor[][], capacity = 4): boolean {
	for (const bolt of bolts) {
		if (bolt.length > 0) {
			if (bolt.length !== capacity) return false;
			const color = bolt[0];
			if (!bolt.every((c) => c === color)) return false;
		}
	}
	return true;
}

/**
 * A* over grouped moves. weight 1 gives the shortest solution; big boards (9+ colours of 6) are too
 * large for that, so they search with weight > 1, which finds a near-shortest solution quickly.
 */
export function solveNutsGame(bolts: NutColor[][], capacity = 4, maxStates = Infinity, weight = 1): NutMove[] | null {
	if (isLevelSolved(bolts, capacity)) return [];

	const queue = new MinHeap<{ state: NutColor[][]; path: NutMove[] }>();
	const visited = new Map<string, number>();

	queue.push({ state: bolts.map((b) => [...b]), path: [] }, weight * lowerBound(bolts));
	visited.set(canonicalKey(bolts), 0);

	while (queue.size > 0 && visited.size < maxStates) {
		const { state, path } = queue.pop()!;

		if (isLevelSolved(state, capacity)) {
			return path;
		}

		// Find first empty bolt index to prune symmetric empty bolts
		const emptyIndex = state.findIndex((b) => b.length === 0);

		for (let i = 0; i < state.length; i++) {
			const src = state[i];
			if (src.length === 0) continue;

			// If bolt is already complete, do not disturb
			if (src.length === capacity && src.every((c) => c === src[0])) continue;

			const topColor = src[src.length - 1];

			// Count consecutive matching colors from top
			let consecutive = 0;
			for (let k = src.length - 1; k >= 0; k--) {
				if (src[k] === topColor) consecutive++;
				else break;
			}

			// Don't move if pure stack into empty bolt
			const isPure = src.every((c) => c === topColor);

			for (let j = 0; j < state.length; j++) {
				if (i === j) continue;
				const dst = state[j];

				if (dst.length === capacity) continue;

				if (dst.length === 0) {
					if (j !== emptyIndex || isPure) continue;
				} else if (dst[dst.length - 1] !== topColor) {
					continue;
				}

				const space = capacity - dst.length;
				const moveCount = Math.min(consecutive, space);

				if (moveCount > 0) {
					// Clone state
					const nextState = state.map((b) => [...b]);
					const nextSrc = nextState[i];
					const nextDst = nextState[j];

					for (let m = 0; m < moveCount; m++) {
						nextDst.push(nextSrc.pop()!);
					}

					const key = canonicalKey(nextState);
					if ((visited.get(key) ?? Infinity) > path.length + 1) {
						visited.set(key, path.length + 1);
						queue.push({
							state: nextState,
							path: [...path, { from: i, to: j, count: moveCount }]
						}, path.length + 1 + weight * lowerBound(nextState));
					}
				}
			}
		}
	}

	return null;
}

function lowerBound(bolts: NutColor[][]) {
 let runs=0; const colors=new Set<NutColor>();
 for(const b of bolts) for(let i=0;i<b.length;i++) { colors.add(b[i]); if(i===0 || b[i]!==b[i-1]) runs++; }
 return runs-colors.size;
}
class MinHeap<T> {
 items: {value:T; priority:number}[]=[];
 get size(){return this.items.length;}
 push(value:T,priority:number){
  const item={value,priority}; let i=this.items.length; this.items.push(item);
  while(i>0){const p=(i-1)>>1;if(this.items[p].priority<=priority)break;this.items[i]=this.items[p];i=p;}this.items[i]=item;
 }
 pop():T|undefined{
  if(!this.items.length)return;const first=this.items[0],last=this.items.pop()!;
  if(this.items.length){let i=0;while(i*2+1<this.items.length){let c=i*2+1;if(c+1<this.items.length&&this.items[c+1].priority<this.items[c].priority)c++;if(this.items[c].priority>=last.priority)break;this.items[i]=this.items[c];i=c;}this.items[i]=last;}
  return first.value;
 }
}

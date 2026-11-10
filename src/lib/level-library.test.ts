import {describe,it,expect} from 'vitest';
const files=import.meta.glob('../../static/levels/*/*.json',{eager:true,import:'default'});
import {difficulties, type StoredEscapeLevel,type StoredNutsLevel} from './level-library';
import {isLevelSolved} from './nuts/solver';
import {groupMoveCount} from './nuts/moves';
import {buildGrid} from './escape/solver';
const ranges={escape:[[2,6],[6,14],[12,22],[18,35]],nuts:[[7,14],[16,30],[36,50],[50,70]]};
describe('Shipped level library',()=>{
 for(const game of ['nuts','escape'] as const)for(const [di,difficulty] of difficulties.entries())it(`${game} ${difficulty}: 100 unique, ordered levels with legal winning solutions`,()=>{
 const levels=files[`../../static/levels/${game}/${difficulty}.json`] as (StoredEscapeLevel|StoredNutsLevel)[];
 expect(levels).toHaveLength(100);const seen=new Set();let previous=0;
 levels.forEach((level,index)=>{
 expect(level.id).toBe(index+1);expect(level.minMoves).toBeGreaterThanOrEqual(ranges[game][di][0]);expect(level.minMoves).toBeLessThanOrEqual(ranges[game][di][1]);expect(level.minMoves).toBeGreaterThanOrEqual(previous);previous=level.minMoves;expect(level.solution.length).toBe(level.minMoves);
 const key='bolts' in level?level.bolts.map(b=>b.join(',')).sort().join('|'):level.vehicles.map(v=>[v.isTarget?'target':'car',v.row,v.col,v.length,v.orientation].join(',')).sort().join('|');expect(seen.has(key)).toBe(false);seen.add(key);
 if('bolts' in level){const state=level.bolts.map(b=>b.map((color,i)=>({color,id:String(i)})));const capacity=level.capacity??4;
 for(const move of level.solution){expect(groupMoveCount(state[move.from],state[move.to],capacity)).toBe(move.count);for(let i=0;i<move.count;i++)state[move.to].push(state[move.from].pop()!);}
 expect(isLevelSolved(state.map(b=>b.map(n=>n.color)),capacity)).toBe(true);
 }else{
 const state=level.vehicles.map(v=>({...v}));
 for(const move of level.solution){const v=state.find(v=>v.id===move.id)!;expect(v).toBeDefined();const grid=buildGrid(state);const sign=move.direction==='LEFT'||move.direction==='UP'?-1:1;
 for(let i=1;i<=move.steps;i++){const edge=sign<0?(v.orientation==='H'?v.col:v.row)-i:(v.orientation==='H'?v.col:v.row)+v.length-1+i;expect(edge).toBeGreaterThanOrEqual(0);expect(edge).toBeLessThan(6);expect(v.orientation==='H'?grid[v.row][edge]:grid[edge][v.col]).toBeNull();}
 if(v.orientation==='H')v.col+=sign*move.steps;else v.row+=sign*move.steps;
 }expect(state.find(v=>v.isTarget)!.col).toBe(4);
 }
 });
 });
});
describe('Group transfer rules',()=>{
 it('moves three matching nuts, respects capacity and reverses the complete group',()=>{
 const src=['red','blue','blue','blue'].map((c,i)=>({id:String(i),color:c as 'red'|'blue'})),dst:typeof src=[];
 const before=structuredClone(src);const count=groupMoveCount(src,dst,4);expect(count).toBe(3);
 for(let i=0;i<count;i++)dst.push(src.pop()!);expect(src).toHaveLength(1);expect(dst).toHaveLength(3);
 for(let i=0;i<count;i++)src.push(dst.pop()!);expect(src).toEqual(before);expect(dst).toHaveLength(0);
 expect(groupMoveCount(src,[{id:'x',color:'blue'},{id:'y',color:'blue'}],3)).toBe(1);
 expect(groupMoveCount(src,[{id:'x',color:'red'}],4)).toBe(0);
 });
});

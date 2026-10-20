import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {getEscapeLevel} from '../src/lib/escape/generator.ts';
import {solveEscape} from '../src/lib/escape/solver.ts';
import {getNutsLevel} from '../src/lib/nuts/generator.ts';
import {solveNutsGame} from '../src/lib/nuts/solver.ts';
const ranges={escape:[[2,6],[6,14],[12,22],[18,35]],nuts:[[3,7],[8,12],[13,17],[18,30]]};
for(const game of ['escape','nuts']) for(const [di,difficulty] of ['easy','medium','hard','extra_hard'].entries()){
 if(process.argv.includes('--resume') && !(game==='nuts'&&process.argv.includes('--refresh-nuts'))){try{const saved=JSON.parse(await readFile(`static/levels/${game}/${difficulty}.json`,'utf8'));if(saved.length===100){console.log('Keep',game,difficulty);continue;}}catch{}}
 const levels=[],seen=new Set();const [min,max]=ranges[game][di];
 for(let seed=1;levels.length<100;seed++){
  const level=game==='escape'?getEscapeLevel(seed,difficulty):getNutsLevel(seed,difficulty,false);
  const key=game==='escape'?level.vehicles.map(v=>[v.isTarget?'target':'car',v.row,v.col,v.length,v.orientation].join(',')).sort().join('|'):level.bolts.map(b=>b.join(',')).sort().join('|');
  if(seen.has(key))continue;
  const solution=game==='escape'?solveEscape(level.vehicles):solveNutsGame(level.bolts,level.capacity??4);
  if(!solution || solution.length<min || solution.length>max)continue;
  seen.add(key);levels.push({...level,capacity:game==='nuts'?4:undefined,minMoves:solution.length,solution});
  if(levels.length%20===0)console.log(game,difficulty,levels.length,'seed',seed);
  if(seed>100000)throw Error('Generation exhausted');
 }
 levels.sort((a,b)=>a.minMoves-b.minMoves);
 levels.forEach((l,i)=>{l.id=i+1;l.name=`Level ${i+1}`;});
 await mkdir(`static/levels/${game}`,{recursive:true});
 await writeFile(`static/levels/${game}/${difficulty}.json`,JSON.stringify(levels));
 console.log('Wrote',game,difficulty,levels[0].minMoves,levels.at(-1).minMoves);
}

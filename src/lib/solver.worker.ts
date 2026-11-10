import {solveNutsGame} from './nuts/solver';
import {solveEscape} from './escape/solver';
self.onmessage=({data})=>{
 // big nut boards: try the shortest answer within a budget, else a near-shortest one (fast on phones)
 const result=data.game==='nuts'?solveNutsGame(data.state,data.capacity,100000)??solveNutsGame(data.state,data.capacity,Infinity,1.5):solveEscape(data.state);
 self.postMessage(result?.[0]??null);
};

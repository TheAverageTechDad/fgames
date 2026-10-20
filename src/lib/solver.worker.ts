import {solveNutsGame} from './nuts/solver';
import {solveEscape} from './escape/solver';
self.onmessage=({data})=>{
 const result=data.game==='nuts'?solveNutsGame(data.state,data.capacity):solveEscape(data.state);
 self.postMessage(result?.[0]??null);
};

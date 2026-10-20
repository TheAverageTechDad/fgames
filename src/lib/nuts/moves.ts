import type {NutItem} from './types';
export function groupMoveCount(source:NutItem[],target:NutItem[],capacity:number):number{
 if(!source.length||target.length>=capacity)return 0;
 const color=source.at(-1)!.color;
 if(target.length&&target.at(-1)!.color!==color)return 0;
 let count=0;for(let i=source.length-1;i>=0&&source[i].color===color;i--)count++;
 return Math.min(count,capacity-target.length);
}

export function modal(node:HTMLElement,close:()=>void){
 const previous=document.activeElement as HTMLElement|null;
 node.focus();
 const key=(event:KeyboardEvent)=>{
  if(event.key==='Escape'){event.preventDefault();close();}
  if(event.key!=='Tab')return;
  const targets=Array.from(node.querySelectorAll<HTMLElement>('button:not(:disabled),select,a[href],[tabindex="0"]'));
  if(!targets.length){event.preventDefault();return;}
  const first=targets[0],last=targets.at(-1)!;
  if(event.shiftKey&&(document.activeElement===first||document.activeElement===node)){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===node)){event.preventDefault();first.focus();}
 };
 node.addEventListener('keydown',key);
 return {destroy(){node.removeEventListener('keydown',key);previous?.focus();}};
}

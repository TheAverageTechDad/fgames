import {createNutsRenderer} from './renderer';
let renderer:ReturnType<typeof createNutsRenderer>|undefined;
self.onmessage=({data})=>{
 try{
  if(data.type==='init')renderer=createNutsRenderer(data.canvas,data.viewport,data.state,{
   bolt:index=>self.postMessage({type:'bolt',index}),settled:()=>self.postMessage({type:'settled'}),
   targets:targets=>self.postMessage({type:'targets',targets}),ready:()=>self.postMessage({type:'ready'})
  });
  if(data.type==='state')renderer?.update(data.state);
  if(data.type==='resize')renderer?.resize(data.viewport);
  if(data.type==='pointer')renderer?.pointer(data.x,data.y);
  if(data.type==='destroy')renderer?.destroy();
 }catch(error){self.postMessage({type:'error',message:error instanceof Error?error.message:String(error)});}
};

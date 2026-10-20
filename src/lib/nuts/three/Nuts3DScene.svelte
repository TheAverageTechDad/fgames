<script lang="ts">
 import {onMount} from 'svelte';
 import rendererWorkerUrl from './render.worker.ts?worker&url';
 import {createOfflineWorker} from '#lib/offline-worker';
 import Icon from '#lib/components/Icon.svelte';
 import type {NutItem} from '../types';
 import type {createNutsRenderer,SceneState} from './renderer';
 let {bolts,selectedBolt,hintMove,isWon,onBoltClick,onSettled,capacity=4,guided=false}:{bolts:NutItem[][];selectedBolt:number|null;hintMove:{from:number;to:number}|null;isWon:boolean;onBoltClick:(index:number)=>void;onSettled:()=>void;capacity?:number;guided?:boolean}=$props();
 let container:HTMLDivElement,canvas:HTMLCanvasElement;
 let worker:Worker|undefined,renderer:ReturnType<typeof createNutsRenderer>|undefined;
 let targets:{x:number;y:number}[]=$state([]),ready=$state(false),failed=$state(false);
 let alive=true,fallingBack=false;
 const snapshot=():SceneState=>$state.snapshot({bolts,selectedBolt,hintMove,isWon,capacity,guided});
 const viewport=()=>({width:container.clientWidth,height:container.clientHeight,dpr:devicePixelRatio});
 function pointer(event:PointerEvent){const rect=canvas.getBoundingClientRect();const x=((event.clientX-rect.left)/rect.width)*2-1,y=1-((event.clientY-rect.top)/rect.height)*2;worker?.postMessage({type:'pointer',x,y});renderer?.pointer(x,y);}
 async function fallback(){
  if(!alive||fallingBack)return;fallingBack=true;
  worker?.terminate();worker=undefined;
  const old=canvas;canvas=document.createElement('canvas');canvas.style.cssText='width:100%;height:100%;display:block;touch-action:none;visibility:hidden';old.replaceWith(canvas);canvas.addEventListener('pointerdown',pointer);
  try{const module=await import('./renderer');if(!alive)return;renderer=module.createNutsRenderer(canvas,viewport(),snapshot(),{bolt:onBoltClick,settled:onSettled,targets:value=>targets=value,ready:()=>{canvas.style.visibility='visible';ready=true;}});}catch{failed=true;}
 }
 onMount(()=>{
  alive=true;
  async function boot(){
   if(!canvas.transferControlToOffscreen){void fallback();return;}
   try{const nextWorker=await createOfflineWorker(rendererWorkerUrl);if(!alive){nextWorker.terminate();return;}worker=nextWorker;const offscreen=canvas.transferControlToOffscreen();
    worker.onmessage=({data})=>{if(data.type==='targets')targets=data.targets;if(data.type==='ready'){canvas.style.visibility='visible';ready=true;}if(data.type==='settled')onSettled();if(data.type==='bolt')onBoltClick(data.index);if(data.type==='error')void fallback();};
    worker.onerror=()=>void fallback();worker.postMessage({type:'init',canvas:offscreen,viewport:viewport(),state:snapshot()},[offscreen]);
   }catch{void fallback();}
  }
  void boot();
  const resize=new ResizeObserver(()=>{if(container.clientWidth&&container.clientHeight){worker?.postMessage({type:'resize',viewport:viewport()});renderer?.resize(viewport());}});resize.observe(container);
  return ()=>{alive=false;resize.disconnect();worker?.postMessage({type:'destroy'});worker?.terminate();renderer?.destroy();canvas.removeEventListener('pointerdown',pointer);};
 });
 $effect(()=>{const state=snapshot();worker?.postMessage({type:'state',state});renderer?.update(state);});
</script>
<div bind:this={container} class="scene" role="application" aria-label="Nuts 3D board">
 <canvas bind:this={canvas} onpointerdown={pointer} style="visibility:hidden"></canvas>
 {#if failed}<p class="scene-status">Your browser could not open the 3D board. Try reloading this page.</p>{:else if !ready}<p class="scene-status" role="status">Setting up the board…</p>{/if}
 {#if ready}{#each targets as target,i}<button class="bolt-target" style:left="{target.x}%" style:top="{target.y}%" onpointerdown={()=>onBoltClick(i)} onclick={e=>{if(e.detail===0)onBoltClick(i);}} aria-label={`Bolt ${i+1}: ${bolts[i]?.map(n=>n.color).join(', ')||'empty'}`} data-bolt={i}></button>{/each}{/if}
 {#if guided&&hintMove&&ready}{#each [hintMove.from,hintMove.to] as index,i}{#if targets[index]}<span class="guide-hand" style:left="{targets[index].x}%" style:top="{targets[index].y}%" aria-hidden="true"><Icon name="hand-pointing" size={32}/><b>{i+1}</b></span>{/if}{/each}{/if}
</div>
<style>.scene{position:relative;width:100%;height:100%;overflow:hidden;touch-action:none}.scene canvas{width:100%;height:100%;display:block;touch-action:none}.scene-status{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;color:#241b3a;background:#e1e8d1}.bolt-target{position:absolute;width:44px;height:70px;min-width:44px;transform:translate(-50%,-50%);background:transparent;border:0;cursor:pointer}.bolt-target:focus-visible{outline:3px solid #241b3a;background:#fff6e644;border-radius:12px}.guide-hand{position:absolute;transform:translate(-40%,20px);pointer-events:none;color:#fff6e6;filter:drop-shadow(1px 2px 1px #241b3a);display:flex;align-items:center}</style>

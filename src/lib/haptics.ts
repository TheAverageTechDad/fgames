// Catcha's vendored modules load only in the browser. Safari support is device dependent.
export type HapticPattern='tick'|'bump'|'land'|'combo'|'celebrate'|'sad';
let engine:typeof import('./feedback/haptics.js')|undefined;
export function hapticsEnabled(){try{return localStorage.getItem('fgames_haptics')!=='false';}catch{return true;}}
export function setHapticsEnabled(value:boolean){try{localStorage.setItem('fgames_haptics',String(value));}catch{}engine?.setHapticsOff(!value);}
export function haptic(name:HapticPattern='tick'){if(hapticsEnabled())engine?.haptic(name);}
export function installHaptics(){
 let active=true;
 const press=(event:PointerEvent)=>{const target=(event.target as Element|null)?.closest('button,[role="button"]');if(target && !(target instanceof HTMLButtonElement&&target.disabled))haptic('tick');};
 document.addEventListener('pointerdown',press,{capture:true});
 void import('./feedback/haptics.js').then(module=>{if(active){engine=module;if(module.isHapticsOff()===hapticsEnabled())module.setHapticsOff(!hapticsEnabled());}});
 return ()=>{active=false;document.removeEventListener('pointerdown',press,{capture:true});};
}

// Catcha's vendored modules load only in the browser. Safari support is device dependent.
export type HapticPattern='tick'|'land'|'combo'|'celebrate'|'sad';
let engine:typeof import('./feedback/haptics.js')|undefined;
export function hapticsEnabled(){try{return localStorage.getItem('fgames_haptics')!=='false';}catch{return true;}}
export function setHapticsEnabled(value:boolean){try{localStorage.setItem('fgames_haptics',String(value));}catch{}engine?.setHapticsOff(!value);}
export function haptic(name:HapticPattern='tick'){if(hapticsEnabled())engine?.haptic(name);}
export function installHaptics(){
 let active=true;
 void import('./feedback/haptics.js').then(module=>{if(active){engine=module;module.setHapticsOff(!hapticsEnabled());}});
 return ()=>{active=false;};
}

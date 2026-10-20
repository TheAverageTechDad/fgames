import {haptic, type HapticPattern} from './haptics';
let audioCtx:AudioContext|null=null;
let mute=false;
let combo=0;
function context(){
 if(typeof window==='undefined')return null;
 const Audio=window.AudioContext || (window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext;
 if(!Audio)return null;
 audioCtx??=new Audio();if(audioCtx.state==='suspended')void audioCtx.resume().catch(()=>{});return audioCtx;
}
// C-major pentatonic. Sine fundamentals with a quiet second harmonic give soft toy tones.
const notes=[261.63,293.66,329.63,392,440,523.25,587.33,659.25,783.99,880,1046.5];
function tone(f:number,duration=.12,delay=0,volume=.08){
 if(sound.muted)return;const c=context();if(!c)return;
 const t=c.currentTime+delay;
 for(const [harmonic,weight] of [[1,1],[2,.13]]){
 const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.setValueAtTime(f*harmonic,t);
 g.gain.setValueAtTime(.001,t);g.gain.linearRampToValueAtTime(volume*weight,t+.004);g.gain.exponentialRampToValueAtTime(.001,t+duration);
 o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+duration+.01);o.onended=()=>{o.disconnect();g.disconnect();};
 }
}
function noise(duration:number,frequency:number,volume:number,delay=0){
 if(sound.muted)return;const c=context();if(!c)return;const t=c.currentTime+delay;
 const buffer=c.createBuffer(1,Math.ceil(c.sampleRate*duration),c.sampleRate),data=buffer.getChannelData(0);
 for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
 const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();source.buffer=buffer;filter.type='lowpass';filter.frequency.value=frequency;
 gain.gain.setValueAtTime(volume,t);gain.gain.exponentialRampToValueAtTime(.001,t+duration);
 source.connect(filter);filter.connect(gain);gain.connect(c.destination);source.start(t);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
}
export const sound={
 get muted(){try{const saved=localStorage.getItem('fgames_muted');if(saved!==null)mute=saved==='true';}catch{}return mute;},
 set muted(value:boolean){mute=value;try{localStorage.setItem('fgames_muted',String(value));}catch{}},
 toggleMute(){this.muted=!this.muted;return this.muted;},
 playTap(){tone(notes[4],.045,0,.045);haptic('tick');},
 playUnscrew(){for(let i=0;i<4;i++)noise(.018,1600,.05,i*.035);},
 playScrewDown(){tone(notes[0],.07,0,.12);noise(.025,1000,.05);haptic('land');},
 playLocked(){tone(notes[0]/2,.06,0,.07);haptic('tick');},
 playBoltComplete(){const base=Math.min(combo++,4);[0,2,4].forEach((n,i)=>tone(notes[base+n],.2,i*.065));haptic('combo');},
 resetCombo(){combo=0;},
 playCarSlide(){noise(.14,350,.07);},
 playCarBump(){tone(notes[0]/2,.09,0,.1);haptic('sad');},
 playCarSnap(){tone(notes[1],.065,0,.06);haptic('land');},
 playCarExit(){tone(notes[5],.12);tone(notes[7],.12);noise(.45,900,.08,.08);haptic('celebrate');},
 playHaptic(pattern:HapticPattern|number|number[]='tick'){haptic(typeof pattern==='string'?pattern:Array.isArray(pattern)?'combo':'tick');},
 playError(){tone(notes[0]/2,.1,0,.09);noise(.035,500,.04);haptic('sad');},
 playVictory(){[5,7,8,10].forEach((n,i)=>tone(notes[n],.25,i*.1));haptic('celebrate');},
 playUnstoppable(){this.playVictory();}
};

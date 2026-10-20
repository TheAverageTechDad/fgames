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
// Metal on a thread. The reference game's nut sound is one hit, then a fast run of clicks that ring
// the nut's partials (Hz, read off a spectrogram of that recording). Clicks go through a resonator bank
// tuned to those partials; the first hit and the seating also ring briefly.
const METAL:[number,number][]=[[1250,.45],[2050,.55],[3250,1],[3650,.7],[7600,.5],[8400,.42],[10900,.3]];
function ring(c:AudioContext,t:number,volume:number){
 for(const [f,w,decay] of [[3250,1,.18],[7600,.55,.32],[8400,.45,.36],[10900,.3,.42]]){
  const o=c.createOscillator(),g=c.createGain();o.frequency.value=f*(.995+Math.random()*.01);
  g.gain.setValueAtTime(volume*w,t);g.gain.exponentialRampToValueAtTime(.0001,t+decay);
  o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+decay+.02);o.onended=()=>{o.disconnect();g.disconnect();};
 }
}
function thread(clicks:number,span:number,volume:number,loosening:boolean){
 if(sound.muted)return;const c=context();if(!c)return;const t=c.currentTime,rate=c.sampleRate;
 const len=Math.ceil(rate*(span+.05)),buffer=c.createBuffer(1,len,rate),data=buffer.getChannelData(0);
 for(let i=0;i<clicks;i++){
  const p=i/(clicks-1);
  // loosening speeds up as the nut frees; tightening slows as it seats
  const at=Math.max(0,span*(loosening?1-(1-p)**1.4:p**1.4)+(Math.random()-.5)*.008);
  const amp=(i===0?1:.6)*(.7+Math.random()*.3)*(1-.55*p);
  const start=Math.floor(at*rate);
  for(let k=0;k<rate*.003&&start+k<len;k++)data[start+k]+=(Math.random()*2-1)*amp*Math.exp(-k/(rate*.0005));
 }
 const source=c.createBufferSource(),out=c.createGain();source.buffer=buffer;out.gain.value=volume;out.connect(c.destination);
 const nodes:AudioNode[]=[source,out];
 for(const [f,w] of METAL){const band=c.createBiquadFilter(),g=c.createGain();band.type='bandpass';band.frequency.value=f;band.Q.value=18;g.gain.value=w;source.connect(band);band.connect(g);g.connect(out);nodes.push(band,g);}
 source.start(t);source.onended=()=>setTimeout(()=>nodes.forEach(n=>n.disconnect()),200);
 ring(c,t,volume*.035);
}
export const sound={
 get muted(){try{const saved=localStorage.getItem('fgames_muted');if(saved!==null)mute=saved==='true';}catch{}return mute;},
 set muted(value:boolean){mute=value;try{localStorage.setItem('fgames_muted',String(value));}catch{}},
 toggleMute(){this.muted=!this.muted;return this.muted;},
 playTap(){tone(notes[4],.045,0,.045);haptic('tick');},
 playUnscrew(){thread(9,.3,1.3,true);},
 playScrewDown(){thread(7,.22,1.3,false);const c=context();if(c&&!sound.muted)ring(c,c.currentTime+.24,.03);tone(notes[0]*.75,.06,.24,.06);haptic('land');},
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

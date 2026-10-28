<script lang="ts">
 import {modal} from './modal';
 import {sound} from '#lib/sound';
 import {hapticsEnabled,setHapticsEnabled,haptic} from '#lib/haptics';
 import Icon from './Icon.svelte';
 let {onClose}:{onClose:()=>void}=$props();
 let muted=$state(sound.muted),haptics=$state(hapticsEnabled());
</script>
<div class="modal-overlay" role="presentation">
 <div use:modal={onClose} class="toy-card modal-card" role="dialog" aria-modal="true" aria-label="Settings" tabindex="-1">
 <div class="modal-heading"><h2>Settings</h2><button class="toy-button icon-button round" onclick={onClose} aria-label="Close settings"><Icon name="x"/></button></div>
 <button class="setting-row" role="switch" aria-checked={!muted} onclick={()=>{muted=sound.toggleMute();sound.playTap();}}><Icon name={muted?'speaker-slash':'speaker-high'}/><span>Sound</span><strong>{muted?'Off':'On'}</strong></button>
 <button class="setting-row" role="switch" aria-checked={haptics} onclick={()=>{haptics=!haptics;setHapticsEnabled(haptics);haptic('tick');}}><Icon name="vibrate"/><span>Haptics</span><strong>{haptics?'On':'Off'}</strong></button>
 <p class="muted">Vibration depends on your device and browser.</p>
 <button class="toy-button coral" onclick={onClose}>Done</button>
 </div>
</div>

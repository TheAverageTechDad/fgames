<script lang="ts">
 import {modal} from './modal';
 import Icon from './Icon.svelte';
 let {gameType,onClose}:{gameType:'nuts'|'escape';onClose:()=>void}=$props();
</script>
<div class="modal-overlay" role="presentation"><div use:modal={onClose} class="toy-card modal-card" role="dialog" aria-modal="true" aria-label="How to play" tabindex="-1">
 <div class="modal-heading"><h2>How to play</h2><button class="toy-button icon-button round" onclick={onClose} aria-label="Close help"><Icon name="x"/></button></div>
 <Icon name={gameType==='nuts'?'nut':'car'} size={48}/>
 {#if gameType==='nuts'}<p>Tap a bolt, then tap a matching colour or an empty bolt.</p><p>The matching group moves together. Fill each bolt with one colour.</p><p>+1 Bolt gives you one extra empty bolt for this level.</p>{:else}<p>Slide cars along their lanes. Clear a path for the red car to leave on the right.</p><p>With a keyboard, focus a car and use the arrow keys.</p>{/if}
 <p>Undo takes back one move. Your three hints are shared across this game.</p>
 <button class="toy-button coral" onclick={onClose}>Got it</button>
</div></div>

<script lang="ts">
 import {modal} from './modal';
 import Icon from './Icon.svelte';
 let {moves,best,onNext,onReplay,last=false,assisted=false}:{moves:number;best:number;onNext:()=>void;onReplay:()=>void;last?:boolean;assisted?:boolean}=$props();
</script>
<div class="modal-overlay" role="presentation">
 <div use:modal={onReplay} class="toy-card win-card" role="dialog" aria-modal="true" aria-label="Level complete" tabindex="-1">
 <Icon name="trophy" size={56}/>
 <h2>{moves===best&&!assisted?'Perfect solve!':'Nicely solved!'}</h2>
 <p>Solved in {moves} moves</p><p class="muted">{assisted?'Extra bolt used':`Best possible: ${best}`}</p>
 <button class="toy-button coral" onclick={onNext}>{last?'Back to levels':'Next'}</button>
 <button class="toy-button" onclick={onReplay}>Replay</button>
 </div>
</div>

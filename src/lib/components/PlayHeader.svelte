<script lang="ts">
 import Icon from './Icon.svelte';
 let {level,difficulty,onBack,onRestart}:{level:number;difficulty:string;onBack:()=>void;onRestart:()=>void}=$props();
</script>
<header class="play-header">
 <button class="toy-button icon-button round" onclick={onBack} aria-label="Back"><Icon name="arrow-left"/></button>
 <div class="play-title"><span class="difficulty-pill">{difficulty.replace('_',' ')}</span><h1>Level {level}</h1></div>
 <button class="toy-button icon-button round" onclick={onRestart} aria-label="Restart level"><Icon name="arrow-counter-clockwise"/></button>
</header>

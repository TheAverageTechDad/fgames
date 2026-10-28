<script lang="ts">
 import Icon from './Icon.svelte';
 import SettingsModal from './SettingsModal.svelte';
 let {title,subtitle='',onBack}:{title:string;subtitle?:string;onBack?:()=>void}=$props();
 let settings=$state(false);
</script>
<header class="game-header">
 {#if onBack}<button class="toy-button icon-button round" onclick={onBack} aria-label="Back"><Icon name="arrow-left" /></button>{:else}<img src="/icons/pocket-192.png" width="44" height="44" alt="" />{/if}
 <div class="header-title"><h1>{title}</h1>{#if subtitle}<p>{subtitle}</p>{/if}</div>
 <button class="toy-button sky icon-button round" onclick={()=>settings=true} aria-label="Settings"><Icon name="gear-six" /></button>
</header>
{#if settings}<SettingsModal onClose={()=>settings=false}/>{/if}

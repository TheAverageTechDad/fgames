<script lang="ts">
 import Icon from './Icon.svelte';
 let {icon,label,skin='',badge,disabled=false,ariaLabel,onclick}:{icon:string;label:string;skin?:string;badge?:number;disabled?:boolean;ariaLabel:string;onclick:()=>void}=$props();
</script>
<button class="round-control" {onclick} {disabled} aria-label={ariaLabel}>
 <span class="round-face {skin}"><Icon name={icon} size={30}/>{#if badge!==undefined}<span class="round-badge">{badge}</span>{/if}</span>
 <span class="round-label">{label}</span>
</button>

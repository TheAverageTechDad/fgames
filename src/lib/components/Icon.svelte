<script lang="ts">
 let {name,size=24}:{name:string;size?:number}=$props();
 const icons=import.meta.glob('../icons/*.svg',{eager:true,query:'?raw',import:'default'}) as Record<string,string>;
</script>
<span class="sticker-icon" style:width="{size}px" style:height="{size}px" aria-hidden="true">{@html icons[`../icons/${name}.svg`]??''}</span>
<style>.sticker-icon{display:inline-flex;flex-shrink:0;filter:drop-shadow(0 1px 0 #fff6e6)}.sticker-icon :global(svg){width:100%;height:100%;fill:currentColor}</style>

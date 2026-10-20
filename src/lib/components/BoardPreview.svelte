<script lang="ts">
 import Vehicle from '#lib/escape/Vehicle.svelte';
 import { NUT_THEMES } from '#lib/nuts/types';
 import type {StoredEscapeLevel,StoredNutsLevel} from '#lib/level-library';
 let {game,level}:{game:'nuts'|'escape';level:StoredNutsLevel|StoredEscapeLevel}=$props();
</script>
<div class="board-preview" aria-label="Next puzzle preview">
 {#if game==='escape'&&'vehicles' in level}
 <div class="mini-parking">{#each level.vehicles as v}<div style={`position:absolute;left:${v.col/6*100}%;top:${v.row/6*100}%;width:${(v.orientation==='H'?v.length:1)/6*100}%;height:${(v.orientation==='V'?v.length:1)/6*100}%;padding:2px`}><Vehicle vehicle={v} cellSize={34} gap={0}/></div>{/each}</div>
 {:else if 'bolts' in level}
 <svg viewBox="0 0 320 190" role="img" aria-label="Nuts puzzle layout">
 {#each level.bolts as bolt,i}
  {@const cols=Math.ceil(level.bolts.length/2)}
  {@const x=24+(i%cols)*(270/Math.max(1,cols-1))}
  {@const y=i<cols?84:176}
  <path d={`M${x} ${y}v-64`} stroke="#c3b9a3" stroke-width="7" stroke-linecap="round"/>
  <path d={`M${x-13} ${y}h26`} stroke="#241b3a" stroke-width="6" stroke-linecap="round"/>
  {#each bolt as color,j}<rect x={x-13} y={y-15-j*13} width="26" height="12" rx="4" fill={NUT_THEMES[color].primary} stroke="#241b3a" stroke-width="1.5"/>{/each}
 {/each}
 </svg>
 {/if}
</div>
<style>.board-preview{height:clamp(160px,26vh,240px);width:100%;display:flex;align-items:center;justify-content:center;background:#e1e8d1;border:3px solid var(--ink);border-radius:20px;overflow:hidden}.board-preview svg{height:100%;max-width:340px}.mini-parking{position:relative;width:190px;height:190px;background:#272c29;border:5px solid var(--cream);border-radius:12px;box-shadow:0 0 0 3px var(--ink)}</style>

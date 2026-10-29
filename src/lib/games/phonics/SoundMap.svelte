<script lang="ts">
  import { isOpen, type Progress } from './settings';
  import { SETS } from './words';

  // The stepping stones, one per set of sounds, winding down the screen. Each shows its letters and up to 3 stars (one
  // per round finished); a stone stays shut until the one before it has a round. The first open stone not yet played bobs
  // (or the newest without 3 stars).
  let { progress, onPick }: { progress: Progress; onPick: (stone: number) => void } = $props();
  const SKINS = ['grape', 'mint', 'sky', 'coral'];
  const suggested = $derived.by(() => {
    const open = SETS.map((_, i) => i + 1).filter(n => isOpen(progress, n));
    return open.find(n => progress.rounds[n - 1] === 0) ?? open.findLast(n => progress.rounds[n - 1] < 3) ?? 1;
  });
</script>

<ol class="map" aria-label="Sound map">
  {#each SETS as set, i}
    {@const n = i + 1}
    {@const open = isOpen(progress, n)}
    {@const stars = Math.min(progress.rounds[i], 3)}
    <li style:--i={i} class:right={i % 2 === 1}>
      <button class="toy-button stone {open ? SKINS[i % SKINS.length] : ''}" class:shut={!open} class:next={open && n === suggested}
        disabled={!open} onclick={() => onPick(n)} aria-label={`${set.join(' ')}${open ? `, ${stars} of 3 stars` : ', not open yet'}`}>
        <span class="letters">{set.join(' ')}</span>
      </button>
      {#if open}
        <span class="stars" aria-hidden="true">
          {#each [0, 1, 2] as s}<svg viewBox="0 0 24 24" class:on={s < stars}><path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.3l6.6-.8z"/></svg>{/each}
        </span>
      {/if}
    </li>
  {/each}
</ol>

<style>
  /* The stones sit on a dotted path down the middle. */
  .map{flex:1;min-height:0;overflow-y:auto;touch-action:pan-y;list-style:none;margin:0;padding:18px 28px max(28px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:6px;background:radial-gradient(circle,var(--ink-soft) 2px,transparent 2.5px) 50% 0/14px 14px repeat-y}
  .map li{display:flex;flex-direction:column;align-items:center;gap:6px;align-self:flex-start;margin-left:6%;animation:stone-in 420ms cubic-bezier(.3,1.6,.5,1) both calc(var(--i) * 80ms)}
  .map li.right{align-self:flex-end;margin:0 6% 0 0}
  .stone{width:132px;height:132px;border-radius:50%;padding:12px;box-shadow:0 7px 0 var(--lip)}
  .stone:active:enabled{transform:translateY(5px);box-shadow:0 2px 0 var(--lip)}
  .letters{font-family:'Andika',sans-serif;font-weight:700;font-size:24px;line-height:1.15;word-spacing:.2em;text-align:center;color:var(--ink)}
  .stone.shut{opacity:1;border-style:dashed;background:#fff6e6b3;box-shadow:none}
  .stone.shut .letters{color:var(--ink-soft);opacity:.6}
  .stone.next{animation:bob 1.6s ease-in-out infinite}
  .stars{display:flex;gap:4px}
  .stars svg{width:24px;height:24px;fill:var(--cream);stroke:var(--ink);stroke-width:1.6;stroke-linejoin:round}
  .stars svg.on{fill:#ffd166}
  @keyframes stone-in{from{opacity:0;transform:translateY(16px) scale(.85)}}
  @keyframes bob{50%{transform:translateY(-6px)}}
  @media (prefers-reduced-motion:reduce){.map li,.stone.next{animation:none}}
</style>

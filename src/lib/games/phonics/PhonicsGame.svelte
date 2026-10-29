<script lang="ts">
  import confetti from 'canvas-confetti';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Icon from '#lib/components/Icon.svelte';
  import { haptic, installHaptics } from '#lib/haptics';
  import { sound } from '#lib/sound';
  import { createPhonicsAudio, type PhonicsAudio } from './audio';
  import { modal } from '#lib/components/modal';
  import ReadCard from './ReadCard.svelte';
  import { readReveal, readStone, saveReveal, saveStone, type Reveal } from './settings';
  import { round, SETS, STAR, WORDS } from './words';

  // A round of 8 words from the chosen stone. ponytail: no sound map or saved progress yet (build step 3).
  let audio = $state<PhonicsAudio | null>(null), stone = $state(readStone());
  let words = $state(round(readStone())), index = $state(0), muted = $state(sound.muted);
  const finished = $derived(index >= words.length);

  function next() {
    if (++index < words.length) return;
    audio?.praise(); haptic('celebrate');
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) confetti({ particleCount: 110, spread: 90, origin: { y: .55 }, colors: ['#7657ee', '#6ce6b8', '#ff9a6b', '#86ceff', '#ffd166'] });
  }
  function again() { words = round(stone); index = 0; }
  function toggleSound() { muted = sound.toggleMute(); }
  let attempt = $state(0), reveal = $state<Reveal>(readReveal()), settingsOpen = $state(false);
  function setReveal(value: Reveal) { reveal = value; saveReveal(value); }
  function setStone(value: number) { stone = value; saveStone(value); void audio?.preload(WORDS.filter(w => w.set === value)); again(); }

  onMount(() => {
    const removeHaptics = installHaptics(), a = createPhonicsAudio();
    audio = a;
    void a.preload(WORDS.filter(w => w.set === stone));
    const unlock = () => a.unlock();
    addEventListener('pointerdown', unlock, { capture: true });
    // Safari's edge swipe goes back a page, so a slide started near the screen's edge would leave the game. Buttons
    // there still tap. ponytail: Android's system back gesture can't be blocked from a page.
    const edge = (e: TouchEvent) => { const x = e.touches[0].clientX; if ((x < 28 || x > innerWidth - 28) && !(e.target as Element).closest('button')) e.preventDefault(); };
    addEventListener('touchstart', edge, { passive: false });
    return () => { removeHaptics(); removeEventListener('pointerdown', unlock, { capture: true }); removeEventListener('touchstart', edge); a.close(); };
  });
</script>

<div class="app-surround"><main class="app-shell phonics-screen" aria-label="Sound It Out">
  <header class="phonics-header">
    <button class="toy-button icon-button round" onclick={() => goto('/')} aria-label="Back to arcade"><Icon name="arrow-left"/></button>
    <ol class="progress" aria-label={`Word ${Math.min(index + 1, words.length)} of ${words.length}`}>
      {#each words as w, i}<li class:done={i < index} class:now={i === index}>{#if i < index}<button onclick={() => index = i} aria-label={`Read ${w.text} again`}></button>{/if}</li>{/each}
    </ol>
    <button class="toy-button icon-button round" onclick={() => settingsOpen = true} aria-label="Settings"><Icon name="gear-six"/></button>
  </header>

  {#if muted}<button class="sound-tip" onclick={toggleSound}><Icon name="speaker-slash" size={18}/> Sound is off · tap to turn it on</button>{/if}

  {#if audio && !finished}
    <!-- Read it again, or a tapped dot, remounts the card fresh. -->
    {#key `${index}:${attempt}`}<ReadCard word={words[index]} {audio} {reveal} onNext={next} onRetry={() => attempt++}/>{/key}
  {/if}

  {#if settingsOpen}
    <div class="modal-overlay" role="presentation" onclick={e => { if (e.target === e.currentTarget) settingsOpen = false; }}>
      <div use:modal={() => settingsOpen = false} class="toy-card modal-card" role="dialog" aria-modal="true" aria-label="Settings" tabindex="-1">
        <div class="modal-heading"><h2>Settings</h2><button class="toy-button icon-button round" onclick={() => settingsOpen = false} aria-label="Close"><Icon name="x"/></button></div>
        <button class="setting-row" onclick={toggleSound} aria-pressed={!muted}><Icon name={muted ? 'speaker-slash' : 'speaker-high'}/><span>Sound</span><strong>{muted ? 'Off' : 'On'}</strong></button>
        <fieldset class="reveal-choice">
          <legend>After the word is blended, say it</legend>
          <label class:on={reveal === 'pause'}><input type="radio" name="reveal" checked={reveal === 'pause'} onchange={() => setReveal('pause')}/><span><b>After 3 seconds</b><small>Your child says it first, then hears it</small></span></label>
          <label class:on={reveal === 'tap'}><input type="radio" name="reveal" checked={reveal === 'tap'} onchange={() => setReveal('tap')}/><span><b>Only when tapped</b><small>Your child taps the speaker to check</small></span></label>
        </fieldset>
        <fieldset class="reveal-choice">
          <legend>Words to read</legend>
          {#each SETS as set, i}
            {@const n = i + 1}
            <label class:on={stone === n}><input type="radio" name="stone" checked={stone === n} onchange={() => setStone(n)}/><span><b class="letters">{n > 1 ? '+ ' : ''}{set.join(' ')}</b><small>{WORDS.filter(w => w.set === n && w.picture).slice(0, 3).map(w => w.text).join(', ')}</small></span></label>
          {/each}
        </fieldset>
      </div>
    </div>
  {/if}

  {#if finished}
    <div class="modal-overlay" role="presentation">
      <div class="toy-card win-card" role="dialog" aria-modal="true" aria-label="Round complete">
        <h2>You read {words.length} words!</h2>
        <div class="read-words">
          {#each words as w, i}
            <button style:--i={i} onclick={() => audio?.word(w.text)} aria-label={`Hear ${w.text}`}><img src={w.picture ?? STAR} alt="" draggable="false"/><small>{w.text}</small></button>
          {/each}
        </div>
        <button class="toy-button mint" onclick={again}>Read more</button>
        <button class="toy-button" onclick={() => goto('/')}>Home</button>
      </div>
    </div>
  {/if}
</main></div>

<style>
  /* The game fits one screen: no scrolling, rubber-banding, pinch zoom or Chrome's swipe-to-go-back. The cards on top
     still scroll if a small phone needs it. */
  :global(html:has(.phonics-screen)),:global(body:has(.phonics-screen)){overflow:hidden;overscroll-behavior:none}
  .phonics-screen{touch-action:none;display:flex;flex-direction:column;background:linear-gradient(var(--cream),var(--cream-bottom));color:var(--ink);overflow:hidden}
  .phonics-screen :global(:is(.modal-card,.win-card)){touch-action:pan-y}
  .phonics-header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:max(14px,env(safe-area-inset-top)) 16px 4px;flex-shrink:0}
  .progress{display:flex;gap:7px;list-style:none;margin:0;padding:0}
  .progress li{width:12px;height:12px;border:2px solid var(--ink);border-radius:50%;background:var(--cream);transition:background 200ms,scale 200ms}
  .progress li.done{position:relative;background:var(--grape-bottom)}
  /* A finished word's dot goes back to it; the hit area is bigger than the dot. */
  .progress li button{position:absolute;inset:-12px -5px;padding:0;border:0;background:none;cursor:pointer}
  .progress li.now{scale:1.3;background:var(--grape-top)}
  .sound-tip{align-self:center;display:flex;align-items:center;gap:8px;min-height:40px;padding:8px 14px;border:2px solid var(--ink);border-radius:99px;background:var(--cream);color:var(--ink);font-size:14px}
  .read-words{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;width:100%}
  .read-words button{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 0 6px;border:2px solid var(--ink);border-radius:14px;background:var(--cream);color:var(--ink);animation:word-in 360ms cubic-bezier(.22,1,.36,1) both calc(120ms + var(--i) * 60ms)}
  .read-words img{width:72%;aspect-ratio:1;object-fit:cover;border:2px solid var(--ink);border-radius:10px}
  .read-words small{font-family:'Andika',sans-serif;font-weight:700;font-size:17px}
  .reveal-choice{border:0;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
  .reveal-choice legend{font-size:15px;color:var(--ink-soft);margin-bottom:8px}
  .reveal-choice label{display:flex;align-items:center;gap:12px;padding:12px;border:2px solid var(--ink);border-radius:14px;background:var(--cream);cursor:pointer}
  .reveal-choice label.on{background:var(--grape-top);color:var(--cream)}
  .reveal-choice label.on small{color:var(--cream)}
  .reveal-choice input{accent-color:var(--grape-bottom);width:20px;height:20px;margin:0;flex-shrink:0}
  .reveal-choice span{display:flex;flex-direction:column;gap:2px}
  .reveal-choice b{font-weight:400;font-size:17px}
  .reveal-choice .letters{font-family:'Andika',sans-serif;font-weight:700;font-size:20px;word-spacing:.4em}
  .reveal-choice small{font-size:13px;color:var(--ink-soft)}
  @keyframes word-in{from{opacity:0;transform:translateY(10px) scale(.8)}}
  @media (prefers-reduced-motion:reduce){.read-words button{animation:none}}
</style>

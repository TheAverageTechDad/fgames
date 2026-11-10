<script lang="ts">
  import confetti from 'canvas-confetti';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Icon from '#lib/components/Icon.svelte';
  import { haptic, installHaptics } from '#lib/haptics';
  import { sound } from '#lib/sound';
  import { createPhonicsAudio, type PhonicsAudio } from './audio';
  import { modal } from '#lib/components/modal';
  import PickCard from './PickCard.svelte';
  import ReadCard from './ReadCard.svelte';
  import { isOpen, readProgress, readReveal, saveProgress, saveReveal, type Reveal } from './settings';
  import SoundMap from './SoundMap.svelte';
  import { round, SETS, STAR, WORDS, type Word } from './words';

  // The sound map, or a round of 8 words from the stone picked on it (stone is null on the map). The 3rd, 6th and 8th
  // words are Pick cards (hear it, tap it among look-alikes) for a change of pace; the rest are read on the slider.
  const PICKS = [2, 5, 7];
  let audio = $state<PhonicsAudio | null>(null), stone = $state<number | null>(null), progress = $state(readProgress());
  let words = $state<Word[]>([]), index = $state(0), muted = $state(sound.muted), opened = $state<number | null>(null);
  const finished = $derived(stone !== null && index >= words.length);

  function next() {
    if (++index < words.length || stone === null) return;
    // A finished round is a star on its stone, and the first one opens the next stone.
    const nextStone = stone + 1, wasOpen = nextStone <= SETS.length && isOpen(progress, nextStone);
    progress.rounds[stone - 1]++; saveProgress(progress);
    opened = !wasOpen && nextStone <= SETS.length ? nextStone : null;
    audio?.praise(); haptic('celebrate');
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) confetti({ particleCount: 110, spread: 90, origin: { y: .55 }, colors: ['#7657ee', '#6ce6b8', '#ff9a6b', '#86ceff', '#ffd166'] });
  }
  function play(n: number) { stone = n; again(); }
  function again() { if (stone !== null) { words = round(stone); index = 0; attempt = 0; opened = null; } }
  function toggleSound() { muted = sound.toggleMute(); }
  let attempt = $state(0), reveal = $state<Reveal>(readReveal()), settingsOpen = $state(false);
  function setReveal(value: Reveal) { reveal = value; saveReveal(value); }
  function toggleOpen() { progress.open = !progress.open; saveProgress(progress); }

  onMount(() => {
    const removeHaptics = installHaptics(), a = createPhonicsAudio();
    audio = a;
    void a.preload(WORDS);
    const unlock = () => a.unlock();
    addEventListener('pointerdown', unlock, { capture: true }); addEventListener('pointerup', unlock, { capture: true });
    // Safari's edge swipe goes back a page, so a slide started near the screen's edge would leave the game. Buttons
    // there still tap. ponytail: Android's system back gesture can't be blocked from a page.
    const edge = (e: TouchEvent) => { const x = e.touches[0].clientX; if ((x < 28 || x > innerWidth - 28) && !(e.target as Element).closest('button')) e.preventDefault(); };
    addEventListener('touchstart', edge, { passive: false });
    return () => { removeHaptics(); removeEventListener('pointerdown', unlock, { capture: true }); removeEventListener('pointerup', unlock, { capture: true }); removeEventListener('touchstart', edge); a.close(); };
  });
</script>

<div class="app-surround"><main class="app-shell phonics-screen" aria-label="Sound It Out">
  <header class="phonics-header">
    {#if stone === null}
      <button class="toy-button icon-button round" onclick={() => goto('/')} aria-label="Back to arcade"><Icon name="arrow-left"/></button>
      <h1>Sound map</h1>
    {:else}
      <button class="toy-button icon-button round" onclick={() => stone = null} aria-label="Back to the sound map"><Icon name="arrow-left"/></button>
      <ol class="progress" aria-label={`Word ${Math.min(index + 1, words.length)} of ${words.length}`}>
        {#each words as w, i}<li class:done={i < index} class:now={i === index}>{#if i < index}<button onclick={() => index = i} aria-label={`Read ${w.text} again`}></button>{/if}</li>{/each}
      </ol>
    {/if}
    <button class="toy-button icon-button round" onclick={() => settingsOpen = true} aria-label="Settings"><Icon name="gear-six"/></button>
  </header>

  {#if muted}<button class="sound-tip" onclick={toggleSound}><Icon name="speaker-slash" size={18}/> Sound is off · tap to turn it on</button>{/if}

  {#if stone === null}
    <SoundMap {progress} onPick={play}/>
  {:else if audio && !finished}
    <!-- Read it again, or a tapped dot, remounts the card fresh. -->
    {#key `${index}:${attempt}`}
      {#if PICKS.includes(index)}<PickCard word={words[index]} {audio} onNext={next}/>
      {:else}<ReadCard word={words[index]} {audio} {reveal} onNext={next} onRetry={() => attempt++}/>{/if}
    {/key}
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
        <button class="setting-row" onclick={toggleOpen} aria-pressed={progress.open}><Icon name="check"/><span>Open every stone<small>For children who know all these sounds</small></span><strong>{progress.open ? 'On' : 'Off'}</strong></button>
      </div>
    </div>
  {/if}

  {#if finished}
    <div class="modal-overlay" role="presentation">
      <div class="toy-card win-card" role="dialog" aria-modal="true" aria-label="Round complete">
        <h2>You read {words.length} words!</h2>
        {#if stone !== null}<p class="earned">{Math.min(progress.rounds[stone - 1], 3)} of 3 stars on <b>{SETS[stone - 1].join(' ')}</b></p>{/if}
        {#if opened}<p class="opened">New sounds to try: <b>{SETS[opened - 1].join(' ')}</b></p>{/if}
        <div class="read-words">
          {#each words as w, i}
            <button style:--i={i} onclick={() => audio?.word(w.text)} aria-label={`Hear ${w.text}`}><img src={w.picture ?? STAR} alt="" draggable="false"/><small>{w.text}</small></button>
          {/each}
        </div>
        <button class="toy-button mint" onclick={again}>Read more</button>
        <button class="toy-button" onclick={() => stone = null}>Sound map</button>
      </div>
    </div>
  {/if}
</main></div>

<style>
  /* The game fits one screen: no scrolling, rubber-banding, pinch zoom or Chrome's swipe-to-go-back. The cards on top
     still scroll if a small phone needs it. */
  :global(html:has(.phonics-screen)),:global(body:has(.phonics-screen)){overflow:hidden;overscroll-behavior:none}
  .phonics-screen{touch-action:none;font-variant-ligatures:none;display:flex;flex-direction:column;background:linear-gradient(var(--cream),var(--cream-bottom));color:var(--ink);overflow:hidden}
  .phonics-screen :global(:is(.modal-card,.win-card)){touch-action:pan-y}
  .phonics-screen :global(.modal-card){gap:14px}
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
  .reveal-choice{border:0;margin:0;padding:0;display:flex;flex-direction:column;gap:7px}
  .reveal-choice legend{font-size:15px;color:var(--ink-soft);margin-bottom:4px}
  .reveal-choice label{display:flex;align-items:center;gap:12px;padding:7px 12px;border:2px solid var(--ink);border-radius:14px;background:var(--cream);cursor:pointer}
  .reveal-choice label.on{background:var(--grape-top);color:var(--cream)}
  .reveal-choice label.on small{color:var(--cream)}
  .reveal-choice input{accent-color:var(--grape-bottom);width:20px;height:20px;margin:0;flex-shrink:0}
  .reveal-choice span{display:flex;flex-direction:column;gap:2px}
  .reveal-choice b{font-weight:400;font-size:17px}
  .reveal-choice small{font-size:13px;color:var(--ink-soft)}
  .phonics-header h1{flex:1;text-align:center}
  .setting-row small{display:block;font-size:13px;color:var(--ink-soft);margin-top:2px}
  .earned,.opened{font-size:17px;color:var(--ink-soft)}
  .earned b,.opened b{font-family:'Andika',sans-serif;font-weight:700;color:var(--ink);word-spacing:.2em}
  .opened{color:var(--grape-lip)}
  @keyframes word-in{from{opacity:0;transform:translateY(10px) scale(.8)}}
  @media (prefers-reduced-motion:reduce){.read-words button{animation:none}}

  /* A phone on its side: the game fills the whole screen (notch-safe), the header gets slimmer, and the cards that sat
     in a stack go side by side. The size cut-off matches the arcade menu's landscape layout. */
  @media (orientation:landscape) and (max-height:600px){
    .app-shell.phonics-screen{max-width:none;height:100dvh;border:0;border-radius:0;box-shadow:none}
    .phonics-header{padding:max(8px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) 0 max(16px,env(safe-area-inset-left))}
    .sound-tip{position:absolute;z-index:5;left:max(16px,env(safe-area-inset-left));bottom:max(10px,env(safe-area-inset-bottom));min-height:36px;padding:6px 12px;font-size:13px}
    .phonics-screen :global(.modal-overlay){padding:10px max(12px,env(safe-area-inset-right)) 10px max(12px,env(safe-area-inset-left))}
    /* Settings and the round-complete card: two columns instead of one tall stack. */
    .phonics-screen :global(:is(.modal-card,.win-card)){max-width:660px;max-height:100%;padding:16px 22px;display:grid;grid-template-columns:1fr 1fr;gap:10px 22px;align-content:center;align-items:center}
    .phonics-screen :global(.modal-heading){grid-column:1 / -1}
    .reveal-choice{grid-column:2;grid-row:2 / span 2}
    .phonics-screen :global(.win-card h2){font-size:26px}
    .read-words{grid-column:2;grid-row:1 / span 5;gap:6px}
    .read-words button{padding:6px 0 4px}
    .read-words small{font-size:15px}
  }
</style>

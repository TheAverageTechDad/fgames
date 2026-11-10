<script lang="ts">
  import confetti from 'canvas-confetti';
  import { onDestroy, onMount, untrack } from 'svelte';
  import Icon from '#lib/components/Icon.svelte';
  import { haptic } from '#lib/haptics';
  import type { PhonicsAudio } from './audio';
  import { choices, STAR, type Word } from './words';

  // Pick: the word is said, and the child taps it among three written look-alikes (pin, pit, tin). A wrong tap wiggles
  // that word and says the target again, nothing marked wrong; the right one lifts and glows, sparkles go up and the
  // card turns over to the picture. The face-down card is a speaker: tap it to hear the word again.
  let { word, audio, onNext }: { word: Word; audio: PhonicsAudio; onNext: () => void } = $props();

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The card is keyed per word, so reading the props once is right.
  const target = untrack(() => word), options = choices(target);
  const buttons: HTMLButtonElement[] = [];
  let card: HTMLButtonElement, nextEl: HTMLButtonElement;
  let found = $state(false), saying = $state(false), tried = $state(options.map(() => false));
  let timer = 0, alive = true;

  function say(delay = 0) {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      const seconds = audio.word(target.text);
      saying = true; timer = window.setTimeout(() => saying = false, seconds * 1000);
    }, delay);
  }
  function hear() { audio.unlock(); haptic('tick'); say(); }
  function pick(i: number) {
    audio.unlock();
    if (found) return options[i].text === target.text ? hear() : undefined;
    if (options[i].text !== target.text) {
      tried[i] = true; haptic('bump');
      if (!still) buttons[i].animate([{ transform: 'none' }, { transform: 'translateX(-10px) rotate(-3deg)', offset: .2 }, { transform: 'translateX(9px) rotate(2deg)', offset: .45 }, { transform: 'translateX(-5px)', offset: .7 }, { transform: 'none' }], { duration: 440, easing: 'ease-out' });
      say(420);
      return;
    }
    found = true; clearTimeout(timer);
    const seconds = audio.word(target.text);
    haptic('celebrate');
    window.setTimeout(() => { if (alive) audio.chime(); }, seconds * 1000 + 60);
    if (!still) {
      const b = buttons[i].getBoundingClientRect();
      confetti({ particleCount: 46, spread: 70, startVelocity: 26, scalar: .8, ticks: 110, origin: { x: (b.left + b.width / 2) / innerWidth, y: b.top / innerHeight }, colors: ['#7657ee', '#6ce6b8', '#ff9a6b', '#86ceff', '#ffd166'] });
    }
    requestAnimationFrame(() => nextEl?.focus({ preventScroll: true }));
  }

  // Say the word once the card has slid in, and fetch the picture meanwhile.
  onMount(() => { new Image().src = target.picture ?? STAR; say(still ? 100 : 420); });
  onDestroy(() => { alive = false; clearTimeout(timer); });
</script>

<section class="pick-card" aria-label="Find the word you hear">
  <button class="mystery" class:open={found} class:saying bind:this={card} onclick={hear} aria-label={found ? `Hear ${target.text} again` : 'Hear the word'}>
    <span class="flip">
      <span class="face front" aria-hidden="true"><Icon name="speaker-high" size={84}/></span>
      <span class="face back"><img src={target.picture ?? STAR} alt="" draggable="false"/><span class="shine"></span></span>
    </span>
  </button>

  <div class="options">
    {#each options as option, i}
      <button class="toy-button option" class:tried={tried[i]} class:right={found && option.text === target.text} class:gone={found && option.text !== target.text}
        style:--i={i} bind:this={buttons[i]} onclick={() => pick(i)}>{option.text}</button>
    {/each}
  </div>

  <div class="after" class:shown={found} aria-hidden={!found}>
    <button class="toy-button mint next" disabled={!found} bind:this={nextEl} onclick={onNext}>Next <Icon name="arrow-right"/></button>
  </div>
</section>

<style>
  .pick-card{container-type:inline-size;flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:space-evenly;gap:12px;padding:8px 16px max(20px,env(safe-area-inset-bottom));animation:card-in 360ms cubic-bezier(.22,1,.36,1)}

  .mystery{all:unset;position:relative;width:min(46cqw,200px);aspect-ratio:1;perspective:900px;cursor:pointer;-webkit-tap-highlight-color:transparent}
  .mystery:focus-visible{outline:3px solid var(--ink);outline-offset:6px;border-radius:30px}
  .flip{position:absolute;inset:0;transform-style:preserve-3d;transition:transform 620ms cubic-bezier(.22,1,.36,1)}
  .open .flip{transform:rotateY(180deg)}
  .face{position:absolute;inset:0;display:grid;place-items:center;overflow:hidden;border:4px solid var(--ink);border-radius:30px;box-shadow:0 7px 0 var(--ink);backface-visibility:hidden;-webkit-backface-visibility:hidden}
  .front{color:var(--cream);background:radial-gradient(circle at 30% 25%,#ffffff55 0 18%,transparent 19%) 0 0/34px 34px,linear-gradient(var(--sky-top),var(--sky-bottom))}
  .mystery:active:not(.open) .front{scale:.96}
  /* The speaker breathes while the word is being said. */
  .saying .front :global(svg){animation:speak 420ms ease-in-out infinite alternate}
  .back{background:var(--cream);transform:rotateY(180deg)}
  .back img{width:100%;height:100%;object-fit:cover;display:block;-webkit-user-drag:none}
  .open .back img{animation:develop 760ms cubic-bezier(.22,1,.36,1) both 140ms}
  .shine{position:absolute;inset:0;background:linear-gradient(115deg,transparent 38%,#fff9 50%,transparent 62%);translate:-130% 0;pointer-events:none}
  .open .shine{animation:shine 900ms cubic-bezier(.22,1,.36,1) 520ms}

  .options{display:flex;flex-direction:column;gap:14px;width:min(78cqw,300px)}
  .option{width:100%;min-height:76px;font-family:'Andika',sans-serif;font-weight:700;font-size:min(52px,14cqw);line-height:1;padding:6px 14px 10px;border-radius:22px;animation:option-in 380ms cubic-bezier(.3,1.5,.5,1) both calc(160ms + var(--i) * 70ms);transition:opacity 240ms,scale 240ms cubic-bezier(.3,1.6,.5,1),translate 240ms cubic-bezier(.3,1.6,.5,1)}
  .option.tried{opacity:.55}
  .option.right{--top:var(--mint-top);--bottom:var(--mint-bottom);--lip:var(--mint-lip);opacity:1;scale:1.06;translate:0 -6px;box-shadow:0 9px 0 var(--lip),0 0 0 6px #6ce6b866}
  .option.gone{opacity:.25;scale:.94}

  .after{display:flex;visibility:hidden;scale:.6;opacity:0}
  .after.shown{visibility:visible;animation:pop-in 340ms cubic-bezier(.3,1.6,.5,1) both 420ms}
  .next{min-width:180px;min-height:58px;font-size:22px}

  @keyframes card-in{from{opacity:0;transform:translateX(28px)}}
  @keyframes option-in{from{opacity:0;transform:translateY(14px) scale(.85)}}
  @keyframes speak{to{scale:1.14}}
  @keyframes develop{from{scale:1.16;filter:blur(10px) saturate(.3)}}
  @keyframes shine{to{translate:130% 0}}
  @keyframes pop-in{from{scale:.6;opacity:0}to{scale:1;opacity:1}}
  /* A phone on its side: the picture card on the left; the three words in a row, then Next, on the right. */
  @media (orientation:landscape) and (max-height:600px){
    .pick-card{display:grid;grid-template-columns:min(56dvh,210px) minmax(0,1fr);align-content:center;justify-content:center;column-gap:clamp(24px,5vw,56px);row-gap:14px;padding:4px max(24px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(24px,env(safe-area-inset-left))}
    .mystery{grid-column:1;grid-row:1 / span 2;align-self:center;width:min(56dvh,210px)}
    .options{grid-column:2;grid-row:1;align-self:end;flex-direction:row;width:auto;gap:10px}
    .option{flex:1;min-width:0;width:auto;min-height:72px;font-size:min(44px,11.5dvh);padding:6px 8px 10px}
    .after{grid-column:2;grid-row:2;align-self:start;justify-self:center}
  }
  @media (prefers-reduced-motion:reduce){
    .pick-card,.option,.open .back img,.open .shine,.after.shown,.saying .front :global(svg){animation:none}
    .after.shown{scale:1;opacity:1}
    .flip,.option{transition-duration:1ms}
  }
</style>

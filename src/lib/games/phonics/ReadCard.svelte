<script lang="ts">
  import confetti from 'canvas-confetti';
  import { onDestroy, onMount, untrack } from 'svelte';
  import Icon from '#lib/components/Icon.svelte';
  import { haptic } from '#lib/haptics';
  import type { PhonicsAudio } from './audio';
  import { STAR, type Word } from './words';

  // One word to read. Drag the handle along the rail: each sound lights and plays as the handle reaches its letters.
  // Reaching the end closes the gaps, waits a beat for the child to say it, says the word, then turns the picture over.
  let { word, audio, onNext }: { word: Word; audio: PhonicsAudio; onNext: () => void } = $props();

  const HANDLE = 56, BEAT = 600;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  // The card is keyed per word, so reading the props once is right.
  const { pieces, text } = untrack(() => word), letters = text.length;
  // Where the handle's left edge sits when its centre reaches a third of the way into each sound's letters.
  let rail: HTMLDivElement, wordEl: HTMLDivElement, nextEl: HTMLButtonElement;
  const pieceEls: HTMLButtonElement[] = [];
  let thresholds: number[] = [], passed = pieces.map(() => false);
  let x = $state(0), dragging = $state(false), returning = $state(false), nudge = $state(false);
  let lit = $state(pieces.map(() => false));
  let stage = $state<'reading' | 'joining' | 'saying' | 'done'>('reading');
  let grab = 0, idle = 0, alive = true;

  const maxX = () => rail.clientWidth - HANDLE;
  function measure() {
    const r = rail.getBoundingClientRect();
    thresholds = pieceEls.map(el => { const b = el.getBoundingClientRect(); return b.left + b.width / 3 - r.left - HANDLE / 2; });
  }
  function pop(i: number) {
    const el = pieceEls[i]?.firstElementChild;
    el?.animate(still ? [{ color: '#7657ee' }, {}] : [{ color: '#7657ee', transform: 'none' }, { color: '#7657ee', transform: 'translateY(-8px) scale(1.12)', offset: .35 }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.3,1.5,.5,1)' });
  }
  function hop() {
    if (!still) wordEl.animate([{ transform: 'none' }, { transform: 'translateY(4px) scale(1.06,.9)', offset: .15 }, { transform: 'translateY(-14px) scale(.97,1.04)', offset: .45 }, { transform: 'translateY(0) scale(1.03,.96)', offset: .75 }, { transform: 'none' }], { duration: 520, easing: 'ease-out' });
  }
  // Nudge the handle when nothing has happened for a while, so a child who can't read sees what to move.
  function armIdle() { clearTimeout(idle); idle = window.setTimeout(() => { hint(); armIdle(); }, 3500); }
  function hint() { if (stage !== 'reading' || dragging) return; nudge = false; requestAnimationFrame(() => nudge = true); }

  function moveTo(next: number) {
    let last = -1;
    thresholds.forEach((t, i) => {
      if (next >= t && !passed[i]) { passed[i] = true; lit[i] = true; last = i; }
      else if (next < t) passed[i] = false;
    });
    x = next;
    // A flick past several sounds lights them all and plays only the last.
    if (last >= 0) { audio.sound(pieces[last].sound); haptic('tick'); pop(last); }
    if (next >= maxX() - 1) void finish();
  }
  function down(e: PointerEvent) {
    if (stage !== 'reading') return;
    audio.unlock();
    const r = rail.getBoundingClientRect();
    if (Math.abs(e.clientX - (r.left + x + HANDLE / 2)) > HANDLE) { hint(); return; }
    rail.setPointerCapture(e.pointerId);
    grab = e.clientX - (r.left + x);
    measure(); dragging = true; returning = false; nudge = false; clearTimeout(idle);
  }
  function move(e: PointerEvent) {
    if (!dragging) return;
    const r = rail.getBoundingClientRect();
    moveTo(Math.min(maxX(), Math.max(0, e.clientX - r.left - grab)));
  }
  function up() {
    if (!dragging) return;
    dragging = false;
    if (stage !== 'reading') return;
    // Let go early: spring back, dim, nothing marked wrong.
    returning = true; x = 0; lit = lit.map(() => false); passed = passed.map(() => false);
    armIdle();
  }
  function key(e: KeyboardEvent) {
    if (stage !== 'reading' || e.key !== 'ArrowRight') return;
    e.preventDefault(); measure(); returning = false;
    const next = thresholds.find(t => t > x);
    moveTo(next === undefined ? maxX() : Math.ceil(next));
  }

  async function finish() {
    dragging = false; stage = 'joining'; lit = lit.map(() => true); clearTimeout(idle);
    haptic('land');
    await wait((still ? 0 : 280) + BEAT);
    if (!alive) return;
    stage = 'saying'; hop();
    const seconds = audio.word(word.text);
    await wait(seconds * 1000 + 80);
    if (!alive) return;
    stage = 'done';
    audio.chime(); haptic('celebrate');
    if (!still) {
      const b = wordEl.getBoundingClientRect();
      confetti({ particleCount: word.picture ? 36 : 70, spread: word.picture ? 55 : 85, startVelocity: 24, scalar: .8, ticks: 110, origin: { x: (b.left + b.width / 2) / innerWidth, y: b.top / innerHeight }, colors: ['#7657ee', '#6ce6b8', '#ff9a6b', '#86ceff', '#ffd166'] });
    }
    requestAnimationFrame(() => nextEl?.focus({ preventScroll: true }));
  }
  function say() { if (stage === 'done') { audio.word(word.text); hop(); } }
  function tap(i: number) {
    audio.unlock();
    if (stage === 'done') return say();
    if (stage !== 'reading') return;
    audio.sound(pieces[i].sound); pop(i); armIdle();
  }

  // Fetch the picture while the child reads, so it's there when the card turns.
  onMount(() => { armIdle(); new Image().src = word.picture ?? STAR; });
  onDestroy(() => { alive = false; clearTimeout(idle); });
</script>

<section class="read-card" style:--n={letters} aria-label={`Read the word ${stage === 'done' ? word.text : ''}`}>
  <div class="mystery" class:open={stage === 'done'}>
    <div class="flip">
      <div class="face front" aria-hidden="true"><span>?</span></div>
      <div class="face back"><img src={word.picture ?? STAR} alt={word.picture ? word.text : 'A star'} draggable="false"/><span class="shine"></span></div>
    </div>
    {#if stage === 'done'}<button class="toy-button icon-button round speaker" onclick={say} aria-label={`Hear ${word.text} again`}><Icon name="speaker-high"/></button>{/if}
  </div>

  <div class="word" class:joined={stage !== 'reading'} bind:this={wordEl}>
    {#each pieces as piece, i}
      <button class="piece" class:lit={lit[i]} style:--i={i} bind:this={pieceEls[i]} onpointerdown={() => tap(i)} onclick={e => { if (e.detail === 0) tap(i); }} aria-label={stage === 'done' ? `Hear ${word.text}` : `Sound ${piece.spelling}`}>
        <span class="letters">{piece.spelling}</span><span class="mark" class:bar={piece.spelling.length > 1}></span>
      </button>
    {/each}
  </div>

  <div class="rail" class:full={stage !== 'reading'} bind:this={rail} style:--x="{x}px" style:--w="calc(var(--size) * {(letters * .62 + pieces.length * .26).toFixed(2)} + {HANDLE * 2}px)"
    onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onlostpointercapture={up} role="presentation">
    <div class="track"><div class="fill"></div></div>
    <span class="goal" aria-hidden="true"></span>
    <div class="handle" class:dragging class:returning class:nudge role="slider" tabindex="0" aria-label="Slide to blend the sounds" aria-valuemin="0" aria-valuemax={pieces.length} aria-valuenow={lit.filter(Boolean).length} onkeydown={key} onanimationend={() => nudge = false}></div>
  </div>

  <button class="toy-button mint next" class:shown={stage === 'done'} disabled={stage !== 'done'} bind:this={nextEl} onclick={onNext} aria-hidden={stage !== 'done'}>Next <Icon name="arrow-right"/></button>
</section>

<style>
  .read-card{container-type:inline-size;flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:space-evenly;gap:12px;padding:8px 16px max(20px,env(safe-area-inset-bottom));animation:card-in 360ms cubic-bezier(.22,1,.36,1)}
  /* Container units resolve against .read-card, so the size lives on its children. Longer words shrink to fit. */
  .read-card>*{--size:min(112px,calc((100cqw - 32px) / (var(--n) * .78)))}

  .mystery{position:relative;width:min(58cqw,236px);aspect-ratio:1;perspective:900px}
  .flip{position:absolute;inset:0;transform-style:preserve-3d;transition:transform 620ms cubic-bezier(.22,1,.36,1)}
  .open .flip{transform:rotateY(180deg)}
  .face{position:absolute;inset:0;display:grid;place-items:center;overflow:hidden;border:4px solid var(--ink);border-radius:30px;box-shadow:0 7px 0 var(--ink);backface-visibility:hidden;-webkit-backface-visibility:hidden}
  .front{background:radial-gradient(circle at 30% 25%,#ffffff55 0 18%,transparent 19%) 0 0/34px 34px,linear-gradient(var(--grape-top),var(--grape-bottom))}
  .front span{font-family:'Luckiest Guy',cursive;font-size:min(22cqw,92px);color:var(--cream);text-shadow:0 4px 0 var(--grape-lip);animation:q-bob 2.4s ease-in-out infinite}
  .back{background:var(--cream);transform:rotateY(180deg)}
  .back img{width:100%;height:100%;object-fit:cover;display:block;-webkit-user-drag:none}
  /* The picture develops as the card turns: out of a soft blur, settling from slightly large. */
  .open .back img{animation:develop 760ms cubic-bezier(.22,1,.36,1) both 140ms}
  .shine{position:absolute;inset:0;background:linear-gradient(115deg,transparent 38%,#fff9 50%,transparent 62%);translate:-130% 0;pointer-events:none}
  .open .shine{animation:shine 900ms cubic-bezier(.22,1,.36,1) 520ms}
  .speaker{position:absolute;right:-14px;bottom:-14px;animation:pop-in 300ms cubic-bezier(.3,1.6,.5,1) both 380ms}

  .word{display:flex;align-items:flex-end;justify-content:center;font-family:'Andika',sans-serif;font-weight:700;font-size:var(--size);line-height:1;color:var(--ink)}
  .piece{all:unset;display:flex;flex-direction:column;align-items:center;gap:.02em;padding:0 .13em;min-width:44px;touch-action:manipulation;cursor:pointer;transition:padding 240ms cubic-bezier(.22,1,.36,1) calc(var(--i) * 40ms)}
  .joined .piece{padding:0 .005em}
  .piece:focus-visible{outline:3px solid var(--ink);outline-offset:4px;border-radius:12px}
  .letters{display:block;line-height:1.3;padding-top:.05em;transition:color 120ms ease-out;transform-origin:50% 90%}
  .lit .letters{color:var(--grape-bottom)}
  .mark{width:.2em;height:.2em;border-radius:50%;background:var(--ink);opacity:.4;transition:background 120ms,opacity 120ms,transform 160ms cubic-bezier(.3,1.6,.5,1)}
  .piece:active .mark{transform:scale(.8)}
  .mark.bar{width:72%;height:.14em;border-radius:.07em}
  .lit .mark{background:var(--grape-bottom);opacity:1;transform:scale(1.3)}
  .joined .mark{opacity:0}

  .rail{position:relative;width:var(--w);max-width:100%;height:64px;touch-action:none}
  .track{position:absolute;left:16px;right:16px;top:50%;height:22px;margin-top:-11px;border:3px solid var(--ink);border-radius:99px;background:#241b3a0f;box-shadow:inset 0 3px 0 #241b3a14;overflow:hidden}
  .fill{height:100%;width:calc(var(--x) + 12px);background:linear-gradient(var(--grape-top),var(--grape-bottom));border-radius:99px}
  .rail:has(.returning) .fill{transition:width 340ms cubic-bezier(.34,1.56,.64,1)}
  .full .fill{width:100%;animation:rail-glow 700ms ease-out}
  .goal{position:absolute;right:0;top:4px;width:56px;height:56px;border:3px dashed #241b3a59;border-radius:50%;background:var(--cream)}
  .full .goal{border:3px solid var(--mint-lip);background:var(--mint-top);animation:goal-pop 420ms cubic-bezier(.22,1,.36,1)}
  .handle{position:absolute;left:0;top:4px;z-index:1;width:56px;height:56px;border:3px solid var(--ink);border-radius:50%;background:radial-gradient(circle at 34% 30%,#fff9 0 14%,transparent 15%),linear-gradient(var(--grape-top),var(--grape-bottom));box-shadow:0 5px 0 var(--grape-lip);transform:translateX(var(--x));cursor:grab;transition:box-shadow 120ms,scale 120ms}
  .handle::after{content:'';position:absolute;left:50%;top:50%;width:11px;height:11px;margin:-6px 0 0 -8px;border:solid var(--cream);border-width:4px 4px 0 0;border-radius:2px;rotate:45deg}
  .full .handle::after{width:7px;height:14px;margin:-10px 0 0 -5px;border-width:0 4px 4px 0;border-color:var(--cream);rotate:40deg}
  .handle.dragging{cursor:grabbing;scale:1.1;box-shadow:0 8px 0 var(--grape-lip),0 10px 18px #241b3a33}
  .handle.returning{transition:transform 340ms cubic-bezier(.34,1.56,.64,1),box-shadow 120ms,scale 120ms}
  .handle.nudge{animation:nudge 900ms cubic-bezier(.3,1.4,.5,1)}
  .handle:focus-visible{outline:3px solid var(--ink);outline-offset:4px}
  .full .handle{background:radial-gradient(circle at 34% 30%,#fff9 0 14%,transparent 15%),linear-gradient(var(--mint-top),var(--mint-bottom));box-shadow:0 5px 0 var(--mint-lip)}

  .next{min-width:180px;min-height:58px;font-size:22px;visibility:hidden;scale:.6;opacity:0}
  .next.shown{visibility:visible;animation:pop-in 340ms cubic-bezier(.3,1.6,.5,1) both 240ms}

  @keyframes card-in{from{opacity:0;transform:translateX(28px)}}
  @keyframes q-bob{50%{transform:translateY(-5px) rotate(-4deg)}}
  @keyframes develop{from{scale:1.16;filter:blur(10px) saturate(.3)}}
  @keyframes shine{to{translate:130% 0}}
  @keyframes goal-pop{40%{scale:1.14}}
  @keyframes pop-in{from{scale:.6;opacity:0}to{scale:1;opacity:1}}
  @keyframes nudge{30%{translate:18px 0}55%{translate:-3px 0}75%{translate:6px 0}}
  @keyframes rail-glow{from{filter:brightness(1.35)}}
  @media (prefers-reduced-motion:reduce){
    .read-card,.front span,.open .back img,.open .shine,.speaker,.next.shown,.handle.nudge,.full .fill,.full .goal{animation:none}
    .next.shown{scale:1;opacity:1}
    .flip,.piece,.handle.returning,.fill{transition-duration:1ms}
  }
</style>

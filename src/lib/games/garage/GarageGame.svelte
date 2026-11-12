<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Icon from '#lib/components/Icon.svelte';
  import { installHaptics, hapticsEnabled, setHapticsEnabled } from '#lib/haptics';
  import { sound } from '#lib/sound';
  import { MODES, PAINTS, piecesFor, type ModeId, type PaintId } from './steps';
  import { readGarage, saveGarage } from './storage';
  import { createGarageAudio } from './audio';
  import type { GarageScene, GarageView } from './scene';

  let host: HTMLDivElement, overlay: HTMLDivElement, pauseDialog: HTMLDialogElement;
  let engine: GarageScene | undefined;
  const store = { getItem: (k: string) => localStorage.getItem(k), setItem: (k: string, v: string) => localStorage.setItem(k, v) };
  let garage = $state(readGarage({ getItem: () => null, setItem: () => {} }));
  const audio = createGarageAudio();
  let view = $state<GarageView>({ phase: 'loading', mode: 'apprentice', stage: 'pick', held: '', placed: [], tray: [], total: 13, note: '', noteKind: '', mistakes: 0,
    boltsLeft: 0, paint: 'red', radio: true, engine: 'off', revved: false, stars: 0, starTotal: 0, progress: 0, speed: 0 });
  let error = $state(''), muted = $state(sound.muted), haptics = $state(true), saveWarning = $state(false), fading = $state(false), holding = $state(false);
  let thumbs = $state<Record<string, string>>({}), choosing = $state(false);
  // snapshot of what the garage holds, for the home card
  let bikes = $state(0), building = $state<{ placed: number; mode: ModeId } | null>(null);
  const refresh = () => { bikes = garage.bikes.length; building = garage.building ? { placed: garage.building.placed.length, mode: garage.building.mode } : null; };
  function save() { if (!saveGarage(store, garage)) saveWarning = true; refresh(); }

  const pieces = $derived(piecesFor(view.mode));
  const byId = $derived(Object.fromEntries(pieces.map(p => [p.id, p])));
  const held = $derived(byId[view.held]);
  const lastOn = $derived(byId[view.placed.at(-1) ?? '']);
  const puzzle = $derived(view.mode !== 'apprentice');
  const modeName = (id: ModeId) => MODES.find(m => m.id === id)!.name;
  const hint = $derived(view.phase !== 'build' ? '' : view.stage === 'present' ? (puzzle ? 'Where does it go? Drag it on.' : 'Drag it onto the bike')
    : view.stage === 'bolts' ? (view.boltsLeft > 1 ? 'Tap the bolts to tighten them' : 'Tap the bolt to tighten it')
    : view.stage === 'pick' ? (view.mode === 'master' && !view.placed.length ? 'Pick a part. Pinch to zoom in close.' : 'Pick a part from the bench') : '');

  function begin(kind: 'build' | 'ride' | 'new', mode?: ModeId) { audio.unlock(); sound.playTap(); choosing = false; engine?.begin(kind, mode); }
  function choose(id: PaintId) { engine?.paint(id); }
  function hold(on: boolean, e?: PointerEvent) {
    if (e) { e.preventDefault(); if (on) (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); }
    holding = on; engine?.throttle(on);
  }
  // the tray scrolls sideways; pull a part up out of it to carry it straight onto the bike
  let trayPress: { x: number; y: number; id: number; lifted: boolean } | null = null;
  function trayDown(e: PointerEvent) { trayPress = { x: e.clientX, y: e.clientY, id: e.pointerId, lifted: false }; }
  function trayMove(e: PointerEvent, part: string) {
    if (!trayPress || trayPress.id !== e.pointerId || trayPress.lifted) return;
    const dx = e.clientX - trayPress.x, dy = e.clientY - trayPress.y;
    if (dy < -14 && -dy > Math.abs(dx)) { trayPress.lifted = true; engine?.pick(part, e); }
  }
  async function ride() {
    fading = true;
    await new Promise(r => setTimeout(r, 380));
    await engine?.ride();
    setTimeout(() => (fading = false), 120);
  }
  async function park() {
    fading = true;
    await new Promise(r => setTimeout(r, 380));
    engine?.park();
    setTimeout(() => (fading = false), 120);
  }
  function toggleSound() { muted = sound.toggleMute(); engine?.refreshAudio(); }
  function toggleVoice() { garage.voice = !garage.voice; audio.voice = garage.voice; save(); }
  function toggleHaptics() { haptics = !haptics; setHapticsEnabled(haptics); }
  function pause() { hold(false); engine?.setPaused(true); pauseDialog.showModal(); }
  function resume() { engine?.setPaused(false); }
  async function home() { hold(false); await goto('/'); }

  onMount(() => {
    let cancelled = false;
    garage = readGarage(store); refresh(); audio.voice = garage.voice; haptics = hapticsEnabled();
    const previousBg = document.documentElement.style.getPropertyValue('--screen-bg');
    document.documentElement.style.setProperty('--screen-bg', '#3b4651');
    const removeHaptics = installHaptics();
    const release = () => hold(false);
    window.addEventListener('blur', release); document.addEventListener('visibilitychange', release);
    void (async () => {
      try {
        await document.fonts.ready;
        const { createGarageScene } = await import('./scene');
        if (cancelled) return;
        engine = createGarageScene(host, overlay, garage, audio, { change: v => { view = v; }, save, thumbs: t => { thumbs = t; } });
        await engine.ready;
        if (import.meta.env.DEV) (window as unknown as { garage: GarageScene }).garage = engine; // for driving it from the console while testing
        if (!cancelled) host.dataset.ready = 'true';
      } catch (err) {
        console.error('Garage failed to load', err);
        engine?.destroy(); engine = undefined;
        if (!cancelled) error = 'The garage door got stuck. Try opening it again.';
      }
    })();
    return () => {
      cancelled = true; engine?.destroy(); audio.close(); removeHaptics();
      window.removeEventListener('blur', release); document.removeEventListener('visibilitychange', release);
      document.documentElement.style.setProperty('--screen-bg', previousBg);
    };
  });
</script>

{#snippet modes()}
  <div class="modes" role="group" aria-label="How hard?">
    {#each MODES as m, i (m.id)}
      <button class="mode" class:last={garage.mode === m.id} data-mode={m.id} onclick={() => begin('new', m.id)}>
        <span class="mode-badge" aria-hidden="true"><Icon name={['hand-pointing', 'nut', 'gear-six'][i]} size={22}/></span>
        <span class="mode-text"><b>{m.name}</b><small>{m.blurb}</small></span>
      </button>
    {/each}
  </div>
{/snippet}

<div class="garage-surround">
  <main class="garage-shell" aria-label="Garage">
    <div class="garage-world" bind:this={host}></div>
    <div class="garage-overlay" bind:this={overlay}></div>

    <header class="garage-header">
      <button class="round" aria-label="Back to arcade" onclick={home}><Icon name="arrow-left" size={24}/></button>
      <div class="header-middle">
        {#if view.phase === 'build' && !puzzle}
          <ol class="pips" aria-label={`${view.placed.length} of ${view.total} parts on`}>
            {#each pieces as s (s.id)}<li class:done={view.placed.includes(s.id)} class:now={view.held === s.id && view.stage !== 'done'}></li>{/each}
          </ol>
        {:else if view.phase === 'build'}
          <div class="count" aria-label={`${view.placed.length} of ${view.total} parts on`}><Icon name="nut" size={18}/><b>{view.placed.length}</b>/{view.total}</div>
        {:else if view.phase === 'ride'}
          <div class="ride-bar" aria-label={`${Math.round(view.progress * 100)}% of the way`}><span style:transform={`scaleX(${view.progress})`}></span><i style:left={`${view.progress * 100}%`}></i></div>
          <div class="star-count" aria-label={`${view.stars} stars`}><b>★</b>{view.stars}</div>
        {:else}<h1>Garage</h1>{/if}
      </div>
      <button class="round small" aria-label={muted ? 'Turn sound on' : 'Mute sound'} aria-pressed={muted} onclick={toggleSound}><Icon name={muted ? 'speaker-slash' : 'speaker-high'} size={21}/></button>
      <button class="round small" aria-label="Pause" onclick={pause}><span class="pause-symbol" aria-hidden="true"></span></button>
    </header>

    <section class="garage-bottom">
      {#if view.phase === 'garage'}
        <div class="card home" data-home>
          {#if choosing || (!building && !bikes)}
            <h2>{bikes ? 'Build another' : 'Build a motorbike'}</h2>
            <p>Every part is a real one. How hard?</p>
            {@render modes()}
            {#if bikes}<button class="text-button" onclick={() => (choosing = false)}>Not now</button>{/if}
          {:else if building}
            <h2>{building.placed >= piecesFor(building.mode).length ? 'Nearly there!' : building.placed ? 'Half built' : 'A bare frame'}</h2>
            <p>{building.placed >= piecesFor(building.mode).length ? 'Give it some paint and fire it up.' : `${modeName(building.mode)}: ${building.placed} of ${piecesFor(building.mode).length} parts on.`}</p>
            <button class="toy-button go big" data-begin onclick={() => begin('build')}><Icon name="nut" size={26}/>{building.placed ? 'Keep building' : 'Start building'}</button>
            <button class="text-button" onclick={() => (choosing = true)}>Start again</button>
          {:else}
            <h2>{bikes === 1 ? 'Your bike' : `${bikes} bikes built`}</h2>
            <p>Take it for a ride, or build another.</p>
            <div class="row">
              <button class="toy-button go big" data-begin onclick={() => begin('ride')}><Icon name="play" size={24}/>Ride it</button>
              <button class="toy-button" onclick={() => (choosing = true)}><Icon name="plus" size={22}/>New bike</button>
            </div>
          {/if}
        </div>
      {:else if view.phase === 'build'}
        {#key view.held + view.stage}
          <div class="card step" class:done={view.stage === 'done'} class:wrong={view.noteKind === 'wrong'} role="status" data-step={view.held}>
            {#if held && view.stage !== 'pick'}
              <small>{puzzle ? 'In your hand' : `Part ${view.placed.length + (view.stage === 'done' ? 0 : 1)} of ${view.total}`}</small>
              <h2>{held.name}{#if view.stage === 'done'}<span class="tick"><Icon name="check" size={26}/></span>{/if}</h2>
            {:else if view.noteKind === 'fact' && lastOn}
              <small><Icon name="check" size={14}/> {lastOn.name}</small>
            {/if}
            {#if view.note}<p class="note" class:fact={view.noteKind === 'fact'}>{#if view.noteKind === 'fact'}<Icon name="lightbulb" size={20}/>{/if}{view.note}</p>
            {:else if hint}<p class="hint">{#if view.stage === 'present' || view.stage === 'pick'}<Icon name="hand-pointing" size={20}/>{/if}{hint}</p>{/if}
          </div>
        {/key}
        {#if puzzle && view.tray.length}
          <div class="tray" aria-label="Parts on the bench">
            {#each view.tray as id (id)}
              <button class="tile" class:held={view.held === id} data-piece={id} aria-label={byId[id]?.name} aria-pressed={view.held === id}
                onclick={() => engine?.pick(id)} onpointerdown={trayDown} onpointermove={e => trayMove(e, id)} oncontextmenu={e => e.preventDefault()}>
                {#if thumbs[id]}<img src={thumbs[id]} alt="" draggable="false">{/if}<span>{byId[id]?.name}</span>
              </button>
            {/each}
          </div>
        {/if}
      {:else if view.phase === 'paint'}
        <div class="card paint">
          <h2>Pick a colour</h2>
          <div class="swatches" role="radiogroup" aria-label="Paint colour">
            {#each PAINTS as p (p.id)}
              <button class="swatch" role="radio" aria-checked={view.paint === p.id} aria-label={p.name} style:--paint={p.color} data-paint={p.id} onclick={() => choose(p.id)}></button>
            {/each}
          </div>
          <button class="toy-button go" data-paint-done onclick={() => engine?.toStart()}><Icon name="check" size={22}/>Looks great</button>
        </div>
      {:else if view.phase === 'start'}
        <div class="controls">
          {#if view.engine !== 'running'}
            <button class="pedal start" class:busy={view.engine === 'cranking'} data-start onclick={() => { audio.unlock(); engine?.crank(); }} aria-label="Start the engine">
              <span>Start</span>
            </button>
          {:else}
            <button class="pedal vroom" class:held={holding} data-vroom aria-label="Rev the engine (hold)"
              onpointerdown={e => hold(true, e)} onpointerup={() => hold(false)} onpointercancel={() => hold(false)} oncontextmenu={e => e.preventDefault()}>
              <span>Vroom</span>
            </button>
            {#if view.revved}<button class="toy-button ride big" data-ride onclick={ride}><Icon name="play" size={24}/>Ride!</button>{/if}
          {/if}
        </div>
        <p class="caption">{view.engine === 'off' ? 'Tap start to fire it up' : view.engine === 'cranking' ? 'Turning over…' : view.revved ? 'Ready to ride!' : 'Hold to rev it'}</p>
      {:else if view.phase === 'ride'}
        <div class="controls ride-controls">
          <div class="speed" aria-live="off"><b>{view.speed}</b><small>km/h</small></div>
          <button class="pedal go-pedal" class:held={holding} data-go aria-label="Go (hold)"
            onpointerdown={e => hold(true, e)} onpointerup={() => hold(false)} onpointercancel={() => hold(false)} oncontextmenu={e => e.preventDefault()}>
            <span>Go</span>
          </button>
        </div>
      {/if}
    </section>

    {#if view.phase === 'finish'}
      <div class="finish" role="dialog" aria-label="Finished">
        <div class="card">
          <h2>You built it. You rode it!</h2>
          <p class="stars"><b>★</b> {view.stars} of {view.starTotal} stars</p>
          {#if view.mode !== 'apprentice'}<p>{modeName(view.mode)} build: {view.mistakes ? `${view.mistakes} wrong ${view.mistakes === 1 ? 'try' : 'tries'}` : 'not one part in the wrong place!'}</p>{/if}
          <button class="toy-button go big" data-park onclick={park}><Icon name="check" size={24}/>Park it in the garage</button>
        </div>
      </div>
    {/if}

    {#if saveWarning}<p class="save-warning" role="status">Saving isn’t available in this browser. Keep the page open to keep your bike.</p>{/if}
    {#if fading}<div class="fade" aria-hidden="true"></div>{/if}

    {#if view.phase === 'loading' || error}
      <div class="loading" role="status">
        <div class="loading-nut" aria-hidden="true"><Icon name="nut" size={72}/></div>
        <h2>{error ? 'Oh no!' : 'Opening the garage'}</h2>
        <p>{error || 'Laying out the tools…'}</p>
        {#if error}<button class="toy-button go" onclick={() => location.reload()}>Try again</button><button class="text-button" onclick={home}>Back to arcade</button>{/if}
      </div>
    {/if}

    <dialog class="garage-pause" bind:this={pauseDialog} onclose={resume}>
      <h2>Tea break</h2><p>Your bike is saved, right where you left it.</p>
      <div class="pause-settings">
        <button class="setting-row" onclick={toggleSound}><Icon name={muted ? 'speaker-slash' : 'speaker-high'} size={22}/><span>Sound</span><strong>{muted ? 'Off' : 'On'}</strong></button>
        <button class="setting-row" onclick={() => engine?.toggleRadio()}><Icon name="music-notes" size={22}/><span>Radio</span><strong>{view.radio ? 'On' : 'Off'}</strong></button>
        <button class="setting-row" onclick={toggleVoice}><Icon name="lightbulb" size={22}/><span>Say part names</span><strong>{garage.voice ? 'On' : 'Off'}</strong></button>
        <button class="setting-row" onclick={toggleHaptics}><Icon name="vibrate" size={22}/><span>Vibration</span><strong>{haptics ? 'On' : 'Off'}</strong></button>
      </div>
      <div class="pause-actions">
        <button class="toy-button go" onclick={() => pauseDialog.close()}>Back to the garage</button>
        <button class="text-button" onclick={home}>Back to arcade</button>
      </div>
    </dialog>
  </main>
</div>

<style>
  .garage-surround{height:100dvh;overflow:hidden;display:flex;justify-content:center;background:#3b4651;color:var(--ink)}
  .garage-shell{position:relative;width:100%;max-width:520px;height:100%;isolation:isolate;overflow:hidden;background:#d9d2c3;touch-action:none;-webkit-user-select:none;user-select:none;--top:max(12px,env(safe-area-inset-top))}
  .garage-world{position:absolute;inset:0}.garage-world :global(canvas){display:block;width:100%;height:100%;outline:none;touch-action:none}
  .garage-overlay{position:absolute;inset:0;pointer-events:none;z-index:2}

  .garage-header{position:absolute;top:0;left:0;right:0;z-index:3;display:flex;align-items:center;gap:8px;padding:var(--top) 14px 10px;pointer-events:none}
  .garage-header>*{pointer-events:auto}.header-middle{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;gap:10px}
  .garage-header h1{font-size:26px;color:#fff8ea;text-shadow:0 2px 0 #2a2f37aa;letter-spacing:.02em}
  .round{width:44px;height:44px;min-width:44px;border:2px solid var(--ink);border-radius:50%;background:#fff6e6;box-shadow:0 3px 0 #241b3a66;display:grid;place-items:center;color:var(--ink);padding:8px}
  .round:active{transform:translateY(2px);box-shadow:none}.round.small{width:40px;height:40px;min-width:40px;padding:7px}
  .pause-symbol{width:14px;height:16px;border-left:5px solid currentColor;border-right:5px solid currentColor}
  .pips{display:flex;gap:4px;margin:0;padding:6px 8px;list-style:none;border-radius:16px;background:#fff6e6e6;box-shadow:0 2px 0 #241b3a33}
  .pips li{width:9px;height:9px;border-radius:50%;background:#e5dcc8;box-shadow:inset 0 0 0 2px #cfc3aa;transition:background .3s}
  .pips li.done{background:#f5a524;box-shadow:inset 0 0 0 2px #b8730f}.pips li.now{background:#fff;box-shadow:inset 0 0 0 3px #f5a524;animation:pip 1.1s ease-in-out infinite}
  .ride-bar{position:relative;flex:1;max-width:220px;height:12px;border-radius:7px;background:#fff6e6d9;box-shadow:0 2px 0 #241b3a33;overflow:visible}
  .ride-bar span{position:absolute;inset:0;border-radius:7px;background:linear-gradient(90deg,#6ce6b8,#22b385);transform-origin:left;transition:transform .2s linear}
  .ride-bar i{position:absolute;top:50%;width:22px;height:22px;margin:-11px;border-radius:50%;background:#fff6e6;border:3px solid #22b385;transition:left .2s linear}
  .star-count{display:flex;align-items:center;gap:4px;padding:3px 10px 3px 7px;border-radius:14px;background:#fff6e6e6;font-size:20px;box-shadow:0 2px 0 #241b3a33}.star-count b{color:#f5b92e;font-weight:400}

  .garage-bottom{position:absolute;left:12px;right:12px;bottom:max(14px,calc(env(safe-area-inset-bottom) + 6px));z-index:3;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none}
  .garage-bottom>*{pointer-events:auto}
  .card{width:100%;max-width:420px;padding:14px 18px 16px;border:3px solid var(--ink);border-radius:22px;background:#fff6e6f2;box-shadow:0 5px 0 #241b3a55;text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px;animation:rise .25s ease-out}
  .card h2{font-size:28px}.card p{font-size:16px;color:var(--ink-soft)}.card small{font-size:13px;color:var(--ink-soft)}
  .card .row{display:flex;gap:10px;width:100%;margin-top:4px}.card .row>:first-child{flex:1}
  .toy-button.go{--top:#ffd36b;--bottom:#f5a524;--lip:#a8650e}.toy-button.ride{--top:#86ceff;--bottom:#3a96ee;--lip:#1d5fae;color:#fff;text-shadow:0 2px 0 #1d5fae}
  .toy-button.big{min-height:58px;font-size:23px;padding:10px 22px;margin-top:6px}.home .toy-button.big{width:100%}
  .step h2{display:flex;align-items:center;gap:8px;font-size:32px}.step .tick{display:inline-grid;place-items:center;width:38px;height:38px;border-radius:50%;background:#22b385;color:#fff;animation:pop .3s ease-out}
  .step.done{background:#eafff4f2;border-color:#137a5a}
  .hint,.note{display:flex;align-items:center;justify-content:center;gap:6px;font-size:17px!important;text-wrap:balance}
  .note.fact{color:var(--ink)!important}.note :global(.sticker-icon){color:#e2a10f}
  .step.wrong{background:#fff1e8f2;border-color:#b5482b;animation:nudge .35s ease-out}
  .count{display:flex;align-items:center;gap:5px;padding:4px 12px 4px 9px;border-radius:16px;background:#fff6e6e6;font-size:19px;box-shadow:0 2px 0 #241b3a33}.count b{font-weight:400}
  .modes{display:flex;flex-direction:column;gap:7px;width:100%;margin-top:4px}
  .mode{display:flex;align-items:center;gap:12px;width:100%;padding:8px 12px;border:3px solid var(--ink);border-radius:18px;background:#fffaf0;box-shadow:0 4px 0 #241b3a55;text-align:left;color:var(--ink)}
  .mode:active{transform:translateY(3px);box-shadow:0 1px 0 #241b3a55}.mode.last{background:#fff1c9}
  .mode-badge{display:grid;place-items:center;width:42px;height:42px;min-width:42px;border-radius:50%;background:#ffd36b;border:2px solid var(--ink)}
  .mode:nth-child(2) .mode-badge{background:#86ceff}.mode:nth-child(3) .mode-badge{background:#ff9a7a}
  .mode-text{display:flex;flex-direction:column;gap:1px}.mode-text b{font-family:'Luckiest Guy',cursive;font-weight:400;font-size:20px;letter-spacing:.02em}.mode-text small{font-size:13px;color:var(--ink-soft)}
  .tray{display:flex;gap:8px;width:calc(100% + 24px);margin:0 -12px;padding:4px 12px 6px;overflow-x:auto;scroll-snap-type:x proximity;touch-action:pan-x;scrollbar-width:none}
  .tray::-webkit-scrollbar{display:none}
  .tile{flex:0 0 auto;width:78px;padding:4px 4px 6px;border:3px solid var(--ink);border-radius:16px;background:#efe4cc;box-shadow:0 4px 0 #241b3a55;display:flex;flex-direction:column;align-items:center;gap:2px;scroll-snap-align:start;touch-action:pan-x;color:var(--ink);transition:transform .15s}
  .tile img{width:64px;height:64px;border-radius:10px;pointer-events:none;-webkit-user-drag:none}
  .tile span{font-size:11px;line-height:1.15;text-align:center;min-height:2.3em;display:flex;align-items:center}
  .tile.held{background:#ffd36b;transform:translateY(-6px);box-shadow:0 8px 0 #241b3a55}
  .swatches{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin:6px 0 4px}
  .swatch{width:40px;height:40px;border-radius:50%;border:3px solid var(--ink);background:radial-gradient(circle at 35% 30%,#ffffff88 0 18%,transparent 40%),var(--paint);box-shadow:0 3px 0 #241b3a55;transition:transform .15s}
  .swatch[aria-checked='true']{transform:scale(1.18);box-shadow:0 0 0 4px #fff6e6,0 0 0 7px var(--ink)}
  .controls{display:flex;align-items:flex-end;justify-content:center;gap:16px;width:100%}
  .pedal{width:118px;height:118px;border-radius:50%;border:4px solid var(--ink);display:grid;place-items:center;font-family:'Luckiest Guy',cursive;font-size:26px;color:#fff;text-shadow:0 2px 0 #0005;box-shadow:0 7px 0 var(--ink);touch-action:none;-webkit-touch-callout:none;transition:transform .08s,box-shadow .08s}
  .pedal span{pointer-events:none}
  .pedal.start{background:radial-gradient(circle at 40% 30%,#8af0c4,#22b385 60%,#137a5a)}
  .pedal.start.busy{transform:translateY(5px);box-shadow:0 2px 0 var(--ink);animation:shake .09s linear infinite}
  .pedal.vroom{background:radial-gradient(circle at 40% 30%,#ffb08a,#f25f3a 60%,#a83a1d)}
  .pedal.go-pedal{background:radial-gradient(circle at 40% 30%,#8af0c4,#22b385 60%,#137a5a)}
  .pedal.held{transform:translateY(6px) scale(.97);box-shadow:0 1px 0 var(--ink)}
  .ride-controls{justify-content:space-between;align-items:center}
  .speed{display:flex;flex-direction:column;align-items:center;padding:8px 14px;border-radius:18px;background:#fff6e6e6;border:3px solid var(--ink);box-shadow:0 4px 0 #241b3a55;min-width:86px}
  .speed b{font-size:34px;font-weight:400;line-height:1;font-variant-numeric:tabular-nums}.speed small{font-size:12px;color:var(--ink-soft)}
  .caption{padding:6px 14px;border-radius:14px;background:#fff6e6e6;font-size:16px;box-shadow:0 2px 0 #241b3a33}
  .finish{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;padding:20px;background:#241b3a40}
  .finish .card{max-width:360px;gap:10px;padding:22px}.finish h2{font-size:30px}.finish .stars{font-size:22px;color:var(--ink)!important}.finish .stars b{color:#f5b92e;font-weight:400}
  .fade{position:absolute;inset:0;z-index:9;background:#fff8ea;animation:fade .38s ease-in both}
  .loading{position:absolute;inset:0;z-index:10;background:#3b4651;color:#fff8ea;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:30px;text-align:center}
  .loading p{color:#cfd6dc}.loading-nut{color:#f5a524;animation:turn 1.6s linear infinite}
  .text-button{border:0;background:none;color:inherit;padding:9px;font-size:15px;min-height:40px}
  .save-warning{position:absolute;left:12px;right:12px;top:calc(var(--top) + 56px);z-index:4;padding:8px 12px;border-radius:12px;background:#fff0ba;font-size:12px;text-align:center}
  .garage-pause{margin:auto;width:calc(100% - 40px);max-width:350px;border:3px solid var(--ink);border-radius:25px;padding:24px;background:#fff6e6;color:var(--ink);box-shadow:0 7px 0 #241b3a44}
  .garage-pause::backdrop{background:#241b3a99}.garage-pause h2{font-size:30px}.garage-pause p{font-size:14px;margin:10px 0 18px;color:var(--ink-soft)}
  .garage-pause .setting-row{width:100%;margin-top:10px;font-size:16px}.garage-pause .toy-button{width:100%;margin-top:16px}.garage-pause .text-button{width:100%;color:var(--ink-soft)}

  .garage-overlay :global(.garage-bolt){position:absolute;left:0;top:0;width:58px;height:58px;margin:-29px 0 0 -29px;border-radius:50%;border:3px solid var(--ink);
    background:radial-gradient(circle at 40% 30%,#ffe08a,#f5a524 65%,#c47c12);box-shadow:0 4px 0 #241b3a88,0 0 0 0 #ffd36baa;display:grid;place-items:center;pointer-events:auto;
    animation:bolt 1.2s ease-in-out infinite;touch-action:none;padding:0}
  .garage-overlay :global(.garage-bolt svg){width:30px;height:30px;fill:var(--ink)}
  .garage-overlay :global(.garage-bolt.done){animation:bolt-done .45s ease-out forwards;pointer-events:none}
  .garage-overlay :global(.garage-hand){position:absolute;left:0;top:0;width:52px;height:52px;margin:-6px 0 0 -18px;opacity:0;transition:opacity .3s;filter:drop-shadow(0 3px 0 #241b3a66)}
  .garage-overlay :global(.garage-hand svg){width:100%;height:100%;fill:#fff;stroke:var(--ink);stroke-width:1.6}
  .garage-overlay :global(.garage-hand:not(.show)){opacity:0!important}

  @keyframes nudge{25%{translate:-6px 0}50%{translate:5px 0}75%{translate:-3px 0}}
  @keyframes pip{50%{transform:scale(1.25)}}@keyframes rise{from{opacity:0;translate:0 14px}to{opacity:1;translate:0 0}}@keyframes pop{0%{transform:scale(.3)}70%{transform:scale(1.2)}100%{transform:scale(1)}}
  @keyframes shake{25%{translate:-2px 0}75%{translate:2px 0}}@keyframes fade{0%{opacity:0}40%,60%{opacity:1}100%{opacity:1}}@keyframes turn{to{rotate:360deg}}
  @keyframes bolt{50%{box-shadow:0 4px 0 #241b3a88,0 0 0 12px #ffd36b00;transform:scale(1.08)}0%,100%{box-shadow:0 4px 0 #241b3a88,0 0 0 0 #ffd36baa}}
  @keyframes bolt-done{0%{transform:scale(1)}40%{transform:scale(1.3) rotate(90deg)}100%{transform:scale(.2) rotate(180deg);opacity:0}}
  @media(min-width:600px){.garage-surround{padding:14px}.garage-shell{height:min(960px,calc(100dvh - 28px));border-radius:28px;box-shadow:0 12px 50px #12182066;border:3px solid #2a323b}}
  /* A phone on its side: the bike fills the screen; cards shrink and sit low; the pedal moves to the thumb. */
  @media(orientation:landscape) and (max-height:600px){
    .garage-surround{padding:0}.garage-shell{max-width:none;height:100%;border:0;border-radius:0;box-shadow:none;--top:max(8px,env(safe-area-inset-top))}
    .garage-header{padding:var(--top) max(14px,env(safe-area-inset-right)) 6px max(14px,env(safe-area-inset-left))}
    .garage-bottom{left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));bottom:max(8px,env(safe-area-inset-bottom))}
    .card{max-width:380px;padding:8px 14px 10px;gap:3px}.card h2{font-size:22px}.step h2{font-size:24px}.toy-button.big{min-height:48px;font-size:19px;margin-top:2px}
    .pedal{width:96px;height:96px;font-size:22px}.swatch{width:40px;height:40px}
    .modes{flex-direction:row}.mode{flex-direction:column;text-align:center;gap:4px;padding:6px}.mode-text small{font-size:11px}.card.home{max-width:620px}
    .tile{width:68px}.tile img{width:54px;height:54px}
  }
  @media(prefers-reduced-motion:reduce){.pips li.now,.pedal.start.busy,.loading-nut{animation:none}}
</style>

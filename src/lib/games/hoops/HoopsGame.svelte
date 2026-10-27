<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Icon from '#lib/components/Icon.svelte';
  import { haptic, hapticsEnabled, installHaptics, setHapticsEnabled } from '#lib/haptics';
  import { sound } from '#lib/sound';
  import { streakWord, type GameEvent } from './game';
  import type { createHoopsScene } from './scene';

  let host: HTMLDivElement;
  let pauseDialog: HTMLDialogElement;
  let engine: ReturnType<typeof createHoopsScene> | undefined;
  let made = $state(0), shots = $state(0), streak = $state(0), pop = $state(''), popId = $state(0);
  let loading = $state(true), error = $state(''), hint = $state(false), note = $state(''), muted = $state(sound.muted), buzz = $state(hapticsEnabled()), music = $state(true);
  let popTimer: ReturnType<typeof setTimeout>, hintTimer: ReturnType<typeof setTimeout>, noteTimer: ReturnType<typeof setTimeout>;

  function update() {
    if (!engine) return;
    const s = engine.state, dad = engine.dadScreen(), rim = engine.rimScreen();
    made = s.made; shots = s.shots; streak = s.streak;
    // ponytail: smoke hooks (scripts/hoops-smoke.mjs reads these).
    Object.assign(host.dataset, { shots: String(s.shots), score: String(s.score), mode: s.mode, dadX: String(Math.round(dad.x)), dadY: String(Math.round(dad.y)), rimX: String(Math.round(rim.x)), rimY: String(Math.round(rim.y)) });
  }
  function event(e: GameEvent) {
    const say = (text: string) => { note = text; clearTimeout(noteTimer); noteTimer = setTimeout(() => { note = ''; }, 1600); };
    if (e.type === 'tired') say('Out of puff! Catch your breath');
    if (e.type === 'shot') { if (e.move === 'dunk') say('Dunk!'); else if (e.move === 'layup') say('Layup!'); else if (e.release > 0.85) say('Perfect release!'); }
    if (e.type !== 'score' || !engine) return;
    const word = streakWord(engine.state.streak);
    if (word) say(`${word[0].toUpperCase()}${word.slice(1)}! ${engine.state.streak} in a row`);
    pop = `+${engine.state.value}`; popId++;
    clearTimeout(popTimer); popTimer = setTimeout(() => { pop = ''; }, 900);
  }
  function pause() { engine?.setPaused(true); pauseDialog.showModal(); }
  function resume() { engine?.setPaused(false); }
  async function home() { await goto('/'); }

  onMount(() => {
    let cancelled = false;
    const previousBg = document.documentElement.style.getPropertyValue('--screen-bg');
    document.documentElement.style.setProperty('--screen-bg', '#f2cf98');
    const removeHaptics = installHaptics();
    void (async () => {
      try {
        await document.fonts.ready;
        const { createHoopsScene } = await import('./scene');
        if (cancelled) return;
        engine = createHoopsScene(host, { update, event });
        await engine.ready;
        music = engine.music;
        if (!cancelled) { loading = false; host.dataset.ready = 'true'; hint = true; hintTimer = setTimeout(() => { hint = false; }, 4500); }
      } catch (err) {
        console.error('Hoops failed to load', err);
        engine?.destroy();
        if (!cancelled) { loading = false; error = 'The court couldn’t load. Try opening it again.'; }
      }
    })();
    return () => {
      cancelled = true; clearTimeout(popTimer); clearTimeout(hintTimer); clearTimeout(noteTimer); engine?.destroy(); removeHaptics();
      document.documentElement.style.setProperty('--screen-bg', previousBg);
    };
  });
</script>

<div class="hoops-surround">
  <main class="hoops-shell" aria-label="Hoops">
    <div class="hoops-world" bind:this={host}></div>
    <header class="hoops-header">
      <button class="hoops-round" aria-label="Back to arcade" onclick={home}><Icon name="arrow-left" size={24}/></button>
      <div class="hoops-count" aria-label={`Made ${made} of ${shots}${streak >= 2 ? `, ${streak} in a row` : ''}`}><strong>{made}</strong><span>/ {shots}</span><small>made</small>{#if streak >= 2}<b class="hoops-streak">{streak} in a row</b>{/if}</div>
      <button class="hoops-round small" aria-label="Pause game" onclick={pause}><span class="pause-symbol" aria-hidden="true"></span></button>
    </header>
    {#if hint}<div class="hoops-hint" role="status">Hold Dad · drag to the hoop · let go</div>{/if}
    {#if note}<div class="hoops-hint note" role="status">{note}</div>{/if}
    {#if pop}{#key popId}<div class="hoops-pop" role="status">{pop}</div>{/key}{/if}
    {#if loading || error}
      <div class="hoops-loading" role="status">
        <h2>Hoops</h2>
        <p>{error || 'Warming up…'}</p>
        {#if error}<button class="toy-button" onclick={() => location.reload()}>Try again</button>{/if}
      </div>
    {/if}
    <dialog class="hoops-pause" bind:this={pauseDialog} onclose={resume}>
      <h2>Paused</h2>
      <p>Hold Dad, drag toward the hoop and let go to shoot; tap with another finger while aiming to jump, and let go at the top for a jump shot. Tap to jump near the hoop with the ball to dunk or lay it up. Drag anywhere else to move; push to the edge to sprint.</p>
      <div class="hoops-switches">
        <button class="hoops-switch" role="switch" aria-checked={!muted} onclick={() => { muted = sound.toggleMute(); engine?.setMusic(); }}>Sound <b>{muted ? 'Off' : 'On'}</b></button>
        <button class="hoops-switch" role="switch" aria-checked={music} onclick={() => { music = !music; engine?.setMusic(music); }}>Music <b>{music ? 'On' : 'Off'}</b></button>
        <button class="hoops-switch" role="switch" aria-checked={buzz} onclick={() => { buzz = !buzz; setHapticsEnabled(buzz); if (buzz) haptic('tick'); }}>Vibration <b>{buzz ? 'On' : 'Off'}</b></button>
      </div>
      <button class="toy-button" onclick={() => pauseDialog.close()}>Keep shooting</button>
      <button class="toy-button" onclick={() => { pauseDialog.close(); home(); }}>Home</button>
    </dialog>
  </main>
</div>

<style>
  .hoops-surround{height:100dvh;overflow:hidden;display:flex;justify-content:center;background:#7d5a3c;color:#3b2a1d}
  .hoops-shell{position:relative;width:100%;max-width:500px;height:100%;isolation:isolate;overflow:hidden;background:#f2cf98;touch-action:none;-webkit-user-select:none;user-select:none;--hoops-top:max(12px,env(safe-area-inset-top))}
  .hoops-world{position:absolute;inset:0;overflow:hidden}.hoops-world :global(canvas){display:block;width:100%;height:100%;outline:none;touch-action:none}
  .hoops-header{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:var(--hoops-top) 15px 12px;pointer-events:none}.hoops-header>*{pointer-events:auto}
  .hoops-round{width:43px;height:43px;min-width:43px;border:2px solid #6b4a2f;border-radius:50%;background:#fff6df;box-shadow:0 3px 0 #6b4a2f66;display:grid;place-items:center;color:#5a3d26;padding:8px}.hoops-round:active{transform:translateY(2px);box-shadow:none}.hoops-round.small{width:38px;height:38px;min-width:38px}
  .pause-symbol{width:14px;height:16px;border-left:5px solid currentColor;border-right:5px solid currentColor}
  .hoops-count{display:flex;align-items:baseline;gap:5px;padding:6px 16px;border-radius:20px;background:#fff6dfe6;box-shadow:0 3px 0 #6b4a2f44;font-variant-numeric:tabular-nums}.hoops-count strong{font-size:26px;font-weight:400}.hoops-count span{font-size:16px}.hoops-count small{font-size:12px;color:#8a6a4c}
  .hoops-count{position:relative}.hoops-streak{position:absolute;left:50%;top:calc(100% + 4px);transform:translateX(-50%);white-space:nowrap;padding:3px 10px;border-radius:12px;background:#ffcf3d;color:#5a3d26;font-size:12px;font-weight:400;box-shadow:0 2px 0 #6b4a2f44}
  .hoops-pop{position:absolute;top:18%;left:50%;transform:translateX(-50%);font-size:44px;color:#fff;text-shadow:0 4px 0 #c4502a,0 0 18px #ff9a4a99;animation:pop .9s ease-out both;pointer-events:none}
  .hoops-hint{position:absolute;bottom:calc(max(16px,env(safe-area-inset-bottom)) + 18%);left:50%;transform:translateX(-50%);width:max-content;max-width:88%;padding:9px 16px;border-radius:18px;background:#fff6dfe6;color:#5a3d26;font-size:15px;box-shadow:0 3px 0 #6b4a2f44;pointer-events:none;animation:hint 4.5s ease both}
  @keyframes hint{0%{opacity:0;translate:0 8px}8%,85%{opacity:1;translate:0 0}100%{opacity:0}}
  .hoops-hint.note{animation:hint 1.6s ease both;background:#ffe2d6;color:#8a3a22}
  .hoops-switches{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}.hoops-switch{min-height:44px;border:2px solid #6b4a2f;border-radius:14px;background:#fff;color:#3b2a1d;font-size:15px}.hoops-switch b{font-weight:400;color:#c4502a}.hoops-switch[aria-checked="false"] b{color:#8a6a4c}
  .hoops-loading{position:absolute;inset:0;background:#f2cf98;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:35px;gap:16px}.hoops-loading h2{font-size:34px}.hoops-loading p{font-size:16px;color:#8a6a4c}
  .hoops-pause{margin:auto;width:calc(100% - 40px);max-width:350px;border:3px solid #6b4a2f;border-radius:25px;padding:25px;background:#fff7e3;color:#3b2a1d;box-shadow:0 7px 0 #6b4a2f44}.hoops-pause::backdrop{background:#3b2a1d99}.hoops-pause h2{font-size:30px}.hoops-pause p{font-size:14px;margin:12px 0 20px;color:#8a6a4c}.hoops-pause button{width:100%;margin-top:12px}
  .hoops-world :global(.hoops-joystick){position:absolute;display:none;width:100px;height:100px;margin:-50px;border:2px solid #fff8e899;background:#fff8e82b;border-radius:50%;pointer-events:none;z-index:4}.hoops-world :global(.hoops-joystick>div){position:absolute;left:30px;top:30px;width:36px;height:36px;background:#fff8e8c9;border:2px solid #ffffffc9;border-radius:50%}
  @keyframes pop{0%{opacity:0;scale:.6}20%{opacity:1;scale:1.15}70%{opacity:1;scale:1}100%{opacity:0;translate:0 -20px}}
  @media(min-width:600px){.hoops-surround{padding:14px}.hoops-shell{height:min(960px,calc(100dvh - 28px));border-radius:28px;box-shadow:0 12px 50px #3b2a1d66;border:3px solid #6b4a2f}}
  @media(prefers-reduced-motion:reduce){.hoops-pop,.hoops-hint{animation:none}}
</style>

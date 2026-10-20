<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Icon from '#lib/components/Icon.svelte';
  import { createFarm, farmHint, total, CROP_CAPACITY, SEED_CAPACITY, LAND_PRICE, type FarmEvent, type FarmState } from './model';
  import { readFarm, saveFarm } from './storage';
  import type { createFarmScene } from './scene';

  let host: HTMLDivElement;
  let wallet: HTMLDivElement;
  let pauseDialog: HTMLDialogElement;
  let engine: ReturnType<typeof createFarmScene> | undefined;
  let farm: FarmState = createFarm();
  const snapshot = () => ({ wallet: farm.wallet, seeds: total(farm.seeds), produce: total(farm.produce), fields: farm.plots.length,
    muted: farm.muted, haptics: farm.haptics, hint: farmHint(farm), purchase: farm.purchaseProgress, sold: farm.sold });
  let hud = $state(snapshot());
  let loading = $state(true), error = $state(''), saveWarning = $state(false);
  let toast = $state(''), toastId = $state(0), coinId = $state(0);
  let flight = $state({ fromX: 0, fromY: 0, dx: 0, dy: 0 });
  let toastTimer: ReturnType<typeof setTimeout>;
  const store = { getItem: (key: string) => localStorage.getItem(key), setItem: (key: string, value: string) => localStorage.setItem(key, value) };
  function save() { if (!saveFarm(store, farm)) saveWarning = true; }
  function event(e: FarmEvent, target: { x: number; y: number }) {
    const messages = { seed: `+${e.amount} seeds`, plant: 'Planted!', harvest: `+${e.amount} ${e.crop === 'tomato' ? 'tomatoes' : 'cucumbers'}`,
      delivery: `${e.amount} fresh picks delivered`, sale: '', cash: `+$${e.amount}`, purchase: 'New field! Cucumbers unlocked' };
    if (messages[e.type]) {
      toast = messages[e.type]; toastId++; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast = ''; }, 1600);
    }
    if (e.type === 'purchase' || e.type === 'cash') {
      const r = wallet.getBoundingClientRect(), h = host.getBoundingClientRect();
      const w = { x: r.left + r.width / 2 - h.left, y: r.top + r.height / 2 - h.top };
      const start = e.type === 'cash' ? target : w, end = e.type === 'cash' ? w : target;
      flight = { fromX: start.x, fromY: start.y, dx: end.x - start.x, dy: end.y - start.y }; coinId++;
    }
  }
  function pause() { engine?.setPaused(true); save(); pauseDialog.showModal(); }
  function resume() { engine?.setPaused(false); }
  function toggleSound() { farm.muted = !farm.muted; hud = snapshot(); save(); }
  function toggleHaptics() { farm.haptics = !farm.haptics; hud = snapshot(); save(); }
  async function home() { save(); await goto('/'); }

  onMount(() => {
    let cancelled = false;
    const previousBg = document.documentElement.style.getPropertyValue('--screen-bg');
    document.documentElement.style.setProperty('--screen-bg', '#8db75b');
    farm = readFarm(store); hud = snapshot();
    void (async () => {
      try {
        await document.fonts.ready;
        const { createFarmScene } = await import('./scene');
        if (cancelled) return;
        engine = createFarmScene(host, farm, { update: () => { hud = snapshot(); }, event, save });
        await engine.ready;
        if (!cancelled) { loading = false; host.dataset.ready = 'true'; }
      } catch {
        engine?.destroy();
        if (!cancelled) { loading = false; error = 'Your farm couldn’t load. Try opening it again.'; }
      }
    })();
    return () => {
      cancelled = true; clearTimeout(toastTimer); engine?.destroy();
      document.documentElement.style.setProperty('--screen-bg', previousBg);
    };
  });
</script>

<div class="farm-surround">
  <main class="farm-shell" aria-label="Pocket Farm">
    <div class="farm-world" bind:this={host}></div>
    <header class="farm-header">
      <button class="farm-round" aria-label="Back to arcade" onclick={home}><Icon name="arrow-left" size={24}/></button>
      <div class="farm-brand"><h1>Pocket Farm</h1><span>Your little patch of happy</span></div>
      <div class="farm-wallet" bind:this={wallet} aria-label={`Wallet: ${hud.wallet} coins`}><span class="coin-icon" aria-hidden="true">$</span><strong data-wallet>{hud.wallet}</strong></div>
    </header>
    <div class="farm-side-controls">
      <button class="farm-round small" aria-label={hud.muted ? 'Turn sound on' : 'Mute sound'} aria-pressed={hud.muted} onclick={toggleSound}><Icon name={hud.muted ? 'speaker-slash' : 'speaker-high'} size={21}/></button>
      <button class="farm-round small" aria-label="Pause game" onclick={pause}><span class="pause-symbol" aria-hidden="true"></span></button>
    </div>
    {#if toast}
      {#key toastId}<div class="farm-toast" role="status">{toast}</div>{/key}
    {/if}
    {#if coinId > 0}
      {#key coinId}
        <div class="money-flight" aria-hidden="true" style={`left:${flight.fromX}px;top:${flight.fromY}px;--dx:${flight.dx}px;--dy:${flight.dy}px`}>
          {#each [0, 1, 2, 3, 4] as i}<span class="coin-icon" style={`--delay:${i * 55}ms`}>$</span>{/each}
        </div>
      {/key}
    {/if}
    <footer class="farm-footer">
      {#if saveWarning}<p class="save-warning" role="status">Saving is unavailable in this browser. Keep this page open to keep playing.</p>{/if}
      <div class="farm-inventory">
        <div class="inventory-pill"><svg aria-hidden="true" viewBox="0 0 32 32"><path fill="#bc8e52" d="m10 5 6 3 6-3-2 7c8 7 8 16-4 16S4 19 12 12Z"/><path fill="#568f3d" d="M17 21c-7-1-8-8-8-8s9-2 10 5c2-5 7-5 7-5s0 7-9 8"/></svg><span>Seeds <strong data-seeds>{hud.seeds}<small>/{SEED_CAPACITY}</small></strong></span></div>
        <div class="inventory-pill"><svg aria-hidden="true" viewBox="0 0 32 32"><path d="M9 13C9 0 23 0 23 13" fill="none" stroke="#94613a" stroke-width="3"/><path fill="#b77c3e" d="m3 12 4 16h18l4-16Z"/><path fill="#efbd71" d="M4 12h24v4H4zM8 20h16v3H8z"/><circle fill="#e86646" cx="12" cy="11" r="4"/><circle fill="#df5137" cx="20" cy="11" r="4"/></svg><span>Basket <strong data-produce>{hud.produce}<small>/{CROP_CAPACITY}</small></strong></span></div>
      </div>
      <div class="farm-task">
        <div class="task-heading"><span>{hud.fields === 1 ? 'Your farm is just beginning' : 'Room to grow'}</span><span class="field-count">{hud.fields} {hud.fields === 1 ? 'field' : 'fields'}</span></div>
        <p data-hint>{hud.hint}</p>
        {#if hud.fields === 1}<div class="land-progress" aria-label={`${Math.min(hud.wallet, LAND_PRICE)} of ${LAND_PRICE} coins toward the next field`}><span style:width={`${Math.min(100, hud.wallet / LAND_PRICE * 100)}%`}></span></div><div class="next-field">Next field <span>${Math.min(hud.wallet, LAND_PRICE)} / ${LAND_PRICE}</span></div>{:else}<div class="next-field">Fresh tomatoes & cucumbers <span>{hud.sold} sold</span></div>{/if}
      </div>
      <p class="move-tip">Drag to move <span>·</span> Everything else happens as you go</p>
    </footer>
    {#if hud.purchase > 0}<div class="purchase-progress" role="status">Opening your new field… <progress value={hud.purchase} max="1"></progress></div>{/if}
    {#if loading || error}
      <div class="farm-loading" role="status">
        <div class="loading-sprout" aria-hidden="true">✿</div><h2>{error ? 'A little bump in the path' : 'Getting your farm ready'}</h2>
        <p>{error || 'A fresh start, one little seed at a time.'}</p>
        {#if error}<button class="toy-button mint" onclick={() => location.reload()}>Try again</button><button class="farm-text-button" onclick={home}>Back to arcade</button>{/if}
      </div>
    {/if}
    <dialog class="farm-pause" bind:this={pauseDialog} onclose={resume}>
      <h2>A little breather</h2><p>Your farm is saved. Pick up right where you left off.</p>
      <button class="setting-row" onclick={toggleSound}><Icon name={hud.muted ? 'speaker-slash' : 'speaker-high'} size={22}/><span>Sound</span><strong>{hud.muted ? 'Off' : 'On'}</strong></button>
      <button class="setting-row" onclick={toggleHaptics}><Icon name="vibrate" size={22}/><span>Vibration</span><strong>{hud.haptics ? 'On' : 'Off'}</strong></button>
      <button class="toy-button mint" onclick={() => pauseDialog.close()}>Back to farming</button>
      <button class="farm-text-button" onclick={home}>Back to arcade</button>
    </dialog>
  </main>
</div>

<style>
  .farm-surround{height:100dvh;overflow:hidden;display:flex;justify-content:center;background:#456c3d;color:#294d35}
  .farm-shell{position:relative;width:100%;max-width:500px;height:100%;isolation:isolate;overflow:hidden;background:#8db75b;touch-action:none;-webkit-user-select:none;user-select:none}
  .farm-world{position:absolute;inset:0;overflow:hidden}.farm-world :global(canvas){display:block;width:100%;height:100%;outline:none;touch-action:none}
  .farm-header{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;gap:10px;padding:max(16px,env(safe-area-inset-top)) 15px 12px;background:linear-gradient(#68954bcc,transparent);pointer-events:none}
  .farm-header>*{pointer-events:auto}.farm-brand{flex:1;min-width:0}.farm-brand h1{font-size:26px;color:#fff9df;text-shadow:0 2px 0 #416633,1px 0 0 #416633}.farm-brand>span{display:block;font-size:11px;color:#fff4d6;margin-top:2px}
  .farm-round{width:43px;height:43px;min-width:43px;border:2px solid #49613a;border-radius:50%;background:#fff6df;box-shadow:0 3px 0 #49613a66;display:grid;place-items:center;color:#37553b;padding:8px}.farm-round:active{transform:translateY(2px);box-shadow:none}.farm-round.small{width:38px;height:38px;min-width:38px;padding:7px;background:#fff6dfed}
  .farm-wallet{display:flex;align-items:center;gap:8px;padding:7px 12px 7px 7px;border:2px solid #6d7339;border-radius:24px;background:#fff4cf;box-shadow:0 3px 0 #55753f66;min-width:82px}.farm-wallet strong{font-size:23px;font-weight:400;font-variant-numeric:tabular-nums}.coin-icon{display:grid;place-items:center;width:27px;height:27px;flex-shrink:0;background:#f7c74f;border:2px solid #d39729;border-radius:50%;color:#9a661c;font-size:19px;box-shadow:inset 0 0 0 2px #ffdf79;font-weight:400}
  .farm-side-controls{position:absolute;right:16px;top:calc(max(16px,env(safe-area-inset-top)) + 66px);display:flex;flex-direction:column;gap:10px}.pause-symbol{width:14px;height:16px;border-left:5px solid currentColor;border-right:5px solid currentColor}
  .farm-footer{position:absolute;bottom:0;left:0;right:0;padding:0 16px max(12px,env(safe-area-inset-bottom));pointer-events:none;background:linear-gradient(transparent,#6c963d66)}
  .farm-inventory{display:flex;justify-content:center;gap:10px;margin-bottom:12px}.inventory-pill{display:flex;align-items:center;gap:8px;padding:7px 14px 7px 9px;min-width:130px;border:2px solid #6b773e;border-radius:17px;background:#fff7e5f2;box-shadow:0 3px 0 #57733855;font-size:12px}.inventory-pill svg{width:32px;height:32px}.inventory-pill>span{display:flex;flex-direction:column;gap:1px}.inventory-pill strong{font-size:21px;line-height:1;font-weight:400;font-variant-numeric:tabular-nums}.inventory-pill small{font-size:13px;color:#829066;margin-left:2px}
  .farm-task{padding:13px 15px 10px;background:#fff8e9f5;border:2px solid #56703d;border-radius:19px;box-shadow:0 4px 0 #486a3766}.task-heading{display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:16px}.field-count{font-size:11px;white-space:nowrap;color:#658155;background:#e9edce;padding:4px 8px;border-radius:9px}.farm-task p{font-size:12px;color:#6d7959;margin-top:6px;min-height:17px}.land-progress{height:7px;border-radius:5px;background:#e5e7cd;margin-top:10px;overflow:hidden}.land-progress>span{display:block;height:100%;background:#e9b948;border-radius:5px;transition:width .3s}.next-field{display:flex;justify-content:space-between;margin-top:5px;font-size:11px;color:#7b855e}.next-field span{font-variant-numeric:tabular-nums}.move-tip{text-align:center;margin-top:12px;font-size:10px;color:#fff8e5;text-shadow:0 1px 2px #466932}.move-tip span{padding:0 4px}
  .farm-toast{position:absolute;top:24%;left:50%;transform:translateX(-50%);padding:9px 16px;max-width:88%;width:max-content;border-radius:20px;background:#fff7df;color:#3a6336;box-shadow:0 3px 0 #41633455;font-size:16px;animation:toast-pop .2s ease-out;pointer-events:none;text-align:center}.purchase-progress{position:absolute;top:40%;left:50%;transform:translateX(-50%);background:#fff6df;padding:12px;border-radius:16px;font-size:13px;text-align:center}.purchase-progress progress{display:block;width:100%;margin-top:6px;accent-color:#e9b948}
  .farm-loading{position:absolute;inset:0;background:#b9d68c;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:35px;gap:16px}.farm-loading h2{font-size:30px}.farm-loading p{font-size:16px;color:#5c7543}.loading-sprout{font-size:80px;line-height:1;color:#f8dc7f;text-shadow:0 4px 0 #70964b}
  .farm-pause{width:calc(100% - 40px);max-width:350px;border:3px solid #3a5839;border-radius:25px;padding:25px;background:#fff7e3;color:#294d35;box-shadow:0 7px 0 #3a583944}.farm-pause::backdrop{background:#223c2b99}.farm-pause h2{font-size:30px}.farm-pause p{font-size:14px;margin:12px 0 20px;color:#72815f}.farm-pause button{width:100%;margin-top:12px}.farm-pause .setting-row{background:#f1efd8;border-color:#cad3ae;font-size:16px}.farm-text-button{border:0;background:none;color:#5a7545;padding:9px;font-size:14px;min-height:40px}.save-warning{background:#fff0ba;border-radius:10px;font-size:12px;padding:8px;margin-bottom:8px;pointer-events:auto}
  .money-flight{position:absolute;pointer-events:none}.money-flight>span{position:absolute;animation:coin-travel .55s var(--delay) cubic-bezier(.4,0,.8,1) both;opacity:0}
  .farm-world :global(.farm-joystick){position:absolute;display:none;width:100px;height:100px;margin:-50px;border:2px solid #fff8e899;background:#fff8e82b;border-radius:50%;pointer-events:none;z-index:4}.farm-world :global(.farm-joystick>div){position:absolute;left:30px;top:30px;width:36px;height:36px;background:#fff8e8c9;border:2px solid #ffffffc9;border-radius:50%}
  @keyframes toast-pop{from{opacity:0;translate:0 10px;scale:.9}to{opacity:1;translate:0 0;scale:1}}@keyframes coin-travel{0%{opacity:0;transform:translate(0,0) scale(.6)}15%{opacity:1}85%{opacity:1}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(.7)}}
  @media(min-width:600px){.farm-surround{padding:14px}.farm-shell{height:min(960px,calc(100dvh - 28px));border-radius:28px;box-shadow:0 12px 50px #1c362e66;border:3px solid #365437}}
  @media(max-height:720px){.farm-brand h1{font-size:23px}.farm-brand>span{font-size:10px}.farm-inventory{margin-bottom:8px}.inventory-pill{padding-top:4px;padding-bottom:4px}.farm-task{padding:10px 13px 8px}.move-tip{margin-top:8px}.farm-footer{padding-left:12px;padding-right:12px}.farm-toast{top:20%}}
  @media(prefers-reduced-motion:reduce){.money-flight{display:none}.farm-toast{animation:none}}
</style>

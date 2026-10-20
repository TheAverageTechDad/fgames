<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Icon from '#lib/components/Icon.svelte';
  import { createFarm, farmGoal, currentGoal, capacity, seedCapacity, total, atBoard, upgradePrice, helperPrice, PURCHASES, UPGRADES, DECOR, HELPER_PRICES,
    type DecorId, type FarmEvent, type FarmState, type UpgradeId } from './model';
  import { installHaptics } from '#lib/haptics';
  import { readFarm, saveFarm } from './storage';
  import type { createFarmScene, ShopAction } from './scene';

  let host: HTMLDivElement;
  let wallet: HTMLDivElement;
  let pauseDialog: HTMLDialogElement;
  let engine: ReturnType<typeof createFarmScene> | undefined;
  let farm: FarmState = createFarm();
  const snapshot = () => {
    const goal = currentGoal(farm);
    return { wallet: farm.wallet, seeds: total(farm.seeds), seedCap: seedCapacity(farm), produce: total(farm.produce), capacity: capacity(farm),
      muted: farm.muted, music: farm.music, haptics: farm.haptics, atBoard: atBoard(farm),
      upgrades: (Object.keys(UPGRADES) as UpgradeId[]).map(id => ({ id, ...UPGRADES[id], level: farm.upgrades[id], price: upgradePrice(farm, id) })),
      decor: (Object.keys(DECOR) as DecorId[]).map(id => ({ id, ...DECOR[id], owned: farm.decor.includes(id) })),
      helpers: farm.helpers.length, helperPrice: helperPrice(farm), hint: farmGoal(farm).hint, moved: farm.player.x !== 0 || farm.player.z !== 0.4,
      stars: Math.round(farm.rating * 2) / 2, level: farm.goal + 1, goal: goal.text, reward: goal.reward,
      progress: Math.min(1, Math.max(0, goal.value(farm) / goal.target)) };
  };
  let hud = $state(snapshot());
  let loading = $state(true), error = $state(''), saveWarning = $state(false);
  let toast = $state(''), toastBig = $state(false), toastId = $state(0), coinId = $state(0);
  let flight = $state({ fromX: 0, fromY: 0, dx: 0, dy: 0 });
  let toastTimer: ReturnType<typeof setTimeout>;
  const store = { getItem: (key: string) => localStorage.getItem(key), setItem: (key: string, value: string) => localStorage.setItem(key, value) };
  function save() { if (!saveFarm(store, farm)) saveWarning = true; }
  function event(e: FarmEvent, target: { x: number; y: number }) {
    const bought = PURCHASES[farm.purchased - 1];
    const messages = { seed: `+${e.amount} seeds`, plant: '', served: '', sale: '', harvest: `+${e.amount} ${{ tomato: 'tomatoes', cucumber: 'cucumbers', strawberry: 'strawberries', apple: 'apples' }[e.crop as string] ?? ''}`,
      delivery: `${e.amount} fresh picks delivered`, cash: `+$${e.amount}`, unhappy: 'A shopper left without their order',
      purchase: { basket: `Bigger basket! Carry ${capacity(farm)}`, coop: 'Coop open! Collect eggs from the nests and sell them at the market',
        orchard: 'Orchard open! Pick apples under the trees and sell them at the green stand', hives: 'The bees moved in! Collect honey jars and sell them at the green stand',
        field: `New field! ${farm.plots.at(-1)?.crop === 'strawberry' ? 'Strawberries' : 'Cucumbers'} unlocked` }[bought?.kind ?? 'field'],
      goal: `Goal complete! +$${e.amount}`, egg: `+${e.amount} ${e.amount === 1 ? 'egg' : 'eggs'}`, honey: `+${e.amount} ${e.amount === 1 ? 'jar' : 'jars'} of honey`, helper: '',
      upgrade: e.id === 'helper' ? 'A farmhand joined the farm!' : e.id && e.id in DECOR ? `${DECOR[e.id as DecorId].name} added!` : e.id ? `${UPGRADES[e.id as UpgradeId].name} level ${farm.upgrades[e.id as UpgradeId]}!` : '' };
    // A goal banner stays up a little longer and is not cut short by ordinary pickups.
    if (messages[e.type] && (!toastBig || e.type === 'goal')) {
      toast = messages[e.type]; toastBig = e.type === 'goal' || e.type === 'purchase' || e.type === 'upgrade'; toastId++; clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast = ''; toastBig = false; }, e.type === 'purchase' ? 3600 : toastBig ? 2600 : 1600);
    }
    if (e.type === 'purchase' || e.type === 'cash' || e.type === 'goal' || e.type === 'upgrade') {
      const r = wallet.getBoundingClientRect(), h = host.getBoundingClientRect();
      const w = { x: r.left + r.width / 2 - h.left, y: r.top + r.height / 2 - h.top };
      const spend = e.type === 'purchase' || e.type === 'upgrade', start = spend ? w : target, end = spend ? target : w;
      flight = { fromX: start.x, fromY: start.y, dx: end.x - start.x, dy: end.y - start.y }; coinId++;
    }
  }
  function pause() { engine?.setPaused(true); save(); pauseDialog.showModal(); }
  function resume() { engine?.setPaused(false); }
  function toggleSound() { farm.muted = !farm.muted; hud = snapshot(); engine?.refreshAudio(); save(); }
  function toggleMusic() { farm.music = !farm.music; hud = snapshot(); engine?.refreshAudio(); save(); }
  // The shop sheet opens on the SHOP tile; closing it keeps it shut until she steps off and back on.
  let shopClosed = $state(false);
  $effect(() => { if (!hud.atBoard) shopClosed = false; });
  function buy(action: ShopAction) { if (engine?.shop(action)) hud = snapshot(); }
  function toggleHaptics() { farm.haptics = !farm.haptics; hud = snapshot(); save(); }
  async function home() { save(); await goto('/'); }

  onMount(() => {
    let cancelled = false;
    const previousBg = document.documentElement.style.getPropertyValue('--screen-bg');
    document.documentElement.style.setProperty('--screen-bg', '#8db75b');
    farm = readFarm(store); hud = snapshot();
    const removeHaptics = installHaptics();
    void (async () => {
      try {
        await document.fonts.ready;
        const { createFarmScene } = await import('./scene');
        if (cancelled) return;
        engine = createFarmScene(host, farm, { update: () => { hud = snapshot(); }, event, save });
        await engine.ready;
        if (!cancelled) { loading = false; host.dataset.ready = 'true'; }
      } catch (err) {
        console.error('Pocket Farm failed to load', err);
        engine?.destroy();
        if (!cancelled) { loading = false; error = 'Your farm couldn’t load. Try opening it again.'; }
      }
    })();
    return () => {
      cancelled = true; clearTimeout(toastTimer); engine?.destroy(); removeHaptics();
      document.documentElement.style.setProperty('--screen-bg', previousBg);
    };
  });
</script>

{#snippet coin(style = '')}
  <!-- Drawn rather than typed, so the $ sits dead centre whatever the font's metrics. -->
  <svg class="coin-icon" {style} viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16.8" r="15" fill="#d39729"/><circle cx="16" cy="16" r="15" fill="#f7c74f"/><circle cx="16" cy="16" r="11.6" fill="none" stroke="#ffdf79" stroke-width="1.6"/><path d="M20.3 11.6c-.9-1.5-2.4-2.3-4.3-2.3-2.3 0-3.9 1.2-3.9 3 0 4.3 8.5 2.4 8.5 6.9 0 1.9-1.8 3.3-4.3 3.3-2 0-3.6-.8-4.5-2.3M16 7v18" fill="none" stroke="#9a661c" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
{/snippet}

<div class="farm-surround">
  <main class="farm-shell" aria-label="Pocket Farm">
    <div class="farm-world" bind:this={host}></div>
    <header class="farm-header">
      <button class="farm-round" aria-label="Back to arcade" onclick={home}><Icon name="arrow-left" size={24}/></button>
      <div class="farm-brand"><h1>Pocket Farm</h1><div class="farm-stars" aria-label={`Shop rating: ${hud.stars} of 5 stars`}>{#each [1, 2, 3, 4, 5] as n}<span class:half={hud.stars === n - 0.5} class:on={hud.stars >= n}>★</span>{/each}</div></div>
      <div class="farm-wallet" bind:this={wallet} aria-label={`Wallet: ${hud.wallet} coins`}>{@render coin()}<strong data-wallet>{hud.wallet}</strong></div>
    </header>
    <div class="farm-side-controls">
      <button class="farm-round small" aria-label={hud.muted ? 'Turn sound on' : 'Mute sound'} aria-pressed={hud.muted} onclick={toggleSound}><Icon name={hud.muted ? 'speaker-slash' : 'speaker-high'} size={21}/></button>
      <button class="farm-round small" aria-label="Pause game" onclick={pause}><span class="pause-symbol" aria-hidden="true"></span></button>
    </div>
    {#if toast}
      {#key toastId}<div class="farm-toast" class:big={toastBig} role="status">{toast}</div>{/key}
    {/if}
    {#if coinId > 0}
      {#key coinId}
        <div class="money-flight" aria-hidden="true" style={`left:${flight.fromX}px;top:${flight.fromY}px;--dx:${flight.dx}px;--dy:${flight.dy}px`}>
          {#each [0, 1, 2, 3, 4] as i}{@render coin(`--delay:${i * 55}ms`)}{/each}
        </div>
      {/key}
    {/if}
    <footer class="farm-footer">
      {#if saveWarning}<p class="save-warning" role="status">Saving is unavailable in this browser. Keep this page open to keep playing.</p>{/if}
      <div class="farm-task">
        <div class="task-row">
          <span class="inventory-pill" aria-label={`Seeds ${hud.seeds} of ${hud.seedCap}`}><svg aria-hidden="true" viewBox="0 0 32 32"><path fill="#bc8e52" d="m10 5 6 3 6-3-2 7c8 7 8 16-4 16S4 19 12 12Z"/><path fill="#568f3d" d="M17 21c-7-1-8-8-8-8s9-2 10 5c2-5 7-5 7-5s0 7-9 8"/></svg><strong data-seeds>{hud.seeds}<small>/{hud.seedCap}</small></strong></span>
          <span class="inventory-pill" aria-label={`Basket ${hud.produce} of ${hud.capacity}`}><svg aria-hidden="true" viewBox="0 0 32 32"><path d="M9 13C9 0 23 0 23 13" fill="none" stroke="#94613a" stroke-width="3"/><path fill="#b77c3e" d="m3 12 4 16h18l4-16Z"/><path fill="#efbd71" d="M4 12h24v4H4zM8 20h16v3H8z"/><circle fill="#e86646" cx="12" cy="11" r="4"/><circle fill="#df5137" cx="20" cy="11" r="4"/></svg><strong data-produce>{hud.produce}<small>/{hud.capacity}</small></strong></span>
          <span class="field-count" data-level>Level {hud.level}</span>
        </div>
        <p data-hint>{hud.hint}</p>
        <div class="next-field"><span class="goal-text" data-goal>{hud.goal}</span><div class="land-progress" aria-label={`Goal ${Math.round(hud.progress * 100)}% complete`}><span style:transform={`scaleX(${hud.progress})`}></span></div><span class="reward">+${hud.reward}</span></div>
      </div>
      {#if !hud.moved}<p class="move-tip">Drag to move <span>·</span> Everything else happens as you go</p>{/if}
    </footer>
    {#if hud.atBoard && !shopClosed && !loading}
      <section class="farm-shop" aria-label="Farm shop">
        <header><h2>Farm shop</h2><button class="farm-round small" aria-label="Close shop" onclick={() => (shopClosed = true)}><Icon name="x" size={18}/></button></header>
        <div class="shop-scroll">
          <h3>Upgrades</h3>
          {#each hud.upgrades as u (u.id)}
            <div class="shop-row"><div><strong>{u.name}</strong><span>{u.detail}</span><span class="pips" aria-label={`Level ${u.level} of ${u.prices.length}`}>{#each u.prices as _, i}<i class:on={i < u.level}></i>{/each}</span></div>
              <button class="shop-buy" data-shop={u.id} disabled={u.price === null || hud.wallet < u.price} onclick={() => buy({ kind: 'upgrade', id: u.id })}>{u.price === null ? 'Max' : `$${u.price}`}</button></div>
          {/each}
          <h3>Helpers</h3>
          <div class="shop-row"><div><strong>Farmhand</strong><span>Picks ripe crops, replants and stocks the stall</span><span class="pips">{#each HELPER_PRICES as _, i}<i class:on={i < hud.helpers}></i>{/each}</span></div>
            <button class="shop-buy" data-shop="helper" disabled={hud.helperPrice === null || hud.wallet < hud.helperPrice} onclick={() => buy({ kind: 'helper' })}>{hud.helperPrice === null ? 'Hired' : `$${hud.helperPrice}`}</button></div>
          <h3>Decorations</h3>
          {#each hud.decor as d (d.id)}
            <div class="shop-row"><div><strong>{d.name}</strong><span>More shoppers and bigger tips</span></div>
              <button class="shop-buy" data-shop={d.id} disabled={d.owned || hud.wallet < d.price} onclick={() => buy({ kind: 'decor', id: d.id })}>{d.owned ? 'Added' : `$${d.price}`}</button></div>
          {/each}
        </div>
      </section>
    {/if}
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
      <button class="setting-row" onclick={toggleMusic}><Icon name={hud.music ? 'music-notes' : 'speaker-slash'} size={22}/><span>Music</span><strong>{hud.music ? 'On' : 'Off'}</strong></button>
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
  /* The same top inset as the puzzle games' header, so the back button and wallet sit on the same line. */
  .farm-shell{--farm-top:max(12px,env(safe-area-inset-top))}
  .farm-header{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;gap:8px;padding:var(--farm-top) 15px 12px;background:linear-gradient(#68954bcc,transparent);pointer-events:none}
  .farm-header>*{pointer-events:auto}.farm-brand{flex:1;min-width:0}.farm-stars{display:inline-flex;margin-top:4px;font-size:14px;line-height:1;color:#d8d9b8;text-shadow:0 1px 0 #41633466;padding:3px 7px;border-radius:10px;background:#fff6dfd9}.farm-stars .on{color:#f5b92e}.farm-stars .half{background:linear-gradient(90deg,#f5b92e 50%,#d8d9b8 50%);-webkit-background-clip:text;background-clip:text;color:transparent}
  .farm-brand h1{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;font-size:26px;color:#fff9df;text-shadow:0 2px 0 #416633,1px 0 0 #416633}
  .farm-round{width:43px;height:43px;min-width:43px;border:2px solid #49613a;border-radius:50%;background:#fff6df;box-shadow:0 3px 0 #49613a66;display:grid;place-items:center;color:#37553b;padding:8px}.farm-round:active{transform:translateY(2px);box-shadow:none}.farm-round.small{width:38px;height:38px;min-width:38px;padding:7px;background:#fff6dfed}
  .farm-wallet{display:flex;align-items:center;gap:8px;padding:7px 12px 7px 7px;border:2px solid #6d7339;border-radius:24px;background:#fff4cf;box-shadow:0 3px 0 #55753f66;min-width:82px}.farm-wallet strong{font-size:23px;font-weight:400;font-variant-numeric:tabular-nums}.coin-icon{display:block;width:28px;height:28px;flex-shrink:0}
  .farm-side-controls{position:absolute;right:16px;top:calc(var(--farm-top) + 62px);display:flex;flex-direction:column;gap:10px}.pause-symbol{width:14px;height:16px;border-left:5px solid currentColor;border-right:5px solid currentColor}
  .farm-footer{position:absolute;bottom:0;left:0;right:0;padding:0 16px max(12px,env(safe-area-inset-bottom));pointer-events:none;}
  .inventory-pill{display:flex;align-items:center;gap:5px;padding:3px 10px 3px 5px;border-radius:13px;background:#f2eed6}.inventory-pill svg{width:24px;height:24px}.inventory-pill strong{font-size:18px;line-height:1;font-weight:400;font-variant-numeric:tabular-nums}.inventory-pill small{font-size:12px;color:#829066;margin-left:1px}
  .farm-task{padding:9px 12px 9px;background:#fff8e9f2;border:2px solid #56703d;border-radius:18px;box-shadow:0 4px 0 #486a3766}.task-row{display:flex;gap:6px;align-items:center}.field-count{margin-left:auto;font-size:11px;white-space:nowrap;color:#658155;background:#e9edce;padding:4px 8px;border-radius:9px}.farm-task p{font-size:13px;color:#4f6142;margin-top:7px;min-height:17px}.next-field{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:6px;font-size:11px;color:#7b855e}.next-field span{font-variant-numeric:tabular-nums;white-space:nowrap}.next-field .goal-text{color:#3e5534;font-size:12px;overflow:hidden;text-overflow:ellipsis;max-width:55%}.next-field .reward{color:#9a661c;background:#fff0bf;padding:1px 6px;border-radius:7px}.land-progress{flex:1;height:7px;border-radius:5px;background:#e5e7cd;overflow:hidden}.land-progress>span{display:block;width:100%;height:100%;background:#e9b948;border-radius:5px;transform-origin:left;transition:transform .3s}.move-tip{text-align:center;margin-top:8px;font-size:10px;color:#fff8e5;text-shadow:0 1px 2px #466932}.move-tip span{padding:0 4px}
  .farm-toast{position:absolute;top:24%;left:50%;transform:translateX(-50%);padding:9px 16px;max-width:88%;width:max-content;border-radius:20px;background:#fff7df;color:#3a6336;box-shadow:0 3px 0 #41633455;font-size:16px;animation:toast-pop .2s ease-out;pointer-events:none;text-align:center}.farm-toast.big{font-size:21px;padding:12px 22px;background:#ffe79a;color:#6b4a12;box-shadow:0 4px 0 #b9862a88;border:2px solid #fff6d8}
  .farm-loading{position:absolute;inset:0;background:#b9d68c;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:35px;gap:16px}.farm-loading h2{font-size:30px}.farm-loading p{font-size:16px;color:#5c7543}.loading-sprout{font-size:80px;line-height:1;color:#f8dc7f;text-shadow:0 4px 0 #70964b}
  .farm-pause{margin:auto;width:calc(100% - 40px);max-width:350px;border:3px solid #3a5839;border-radius:25px;padding:25px;background:#fff7e3;color:#294d35;box-shadow:0 7px 0 #3a583944}.farm-pause::backdrop{background:#223c2b99}.farm-pause h2{font-size:30px}.farm-pause p{font-size:14px;margin:12px 0 20px;color:#72815f}.farm-pause button{width:100%;margin-top:12px}.farm-pause .setting-row{background:#f1efd8;border-color:#cad3ae;font-size:16px}.farm-text-button{border:0;background:none;color:#5a7545;padding:9px;font-size:14px;min-height:40px}.save-warning{background:#fff0ba;border-radius:10px;font-size:12px;padding:8px;margin-bottom:8px;pointer-events:auto}
  .farm-shop{position:absolute;left:12px;right:12px;bottom:calc(max(12px,env(safe-area-inset-bottom)) + 8px);max-height:62%;display:flex;flex-direction:column;background:#fff8e9;border:2px solid #56703d;border-radius:20px;box-shadow:0 5px 0 #486a3766;animation:toast-pop .2s ease-out;z-index:3}
  .farm-shop header{display:flex;align-items:center;justify-content:space-between;padding:12px 12px 6px 16px}.farm-shop h2{font-size:22px}
  .shop-scroll{overflow:auto;padding:0 12px 12px;touch-action:pan-y}.farm-shop h3{font-family:inherit;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#7b855e;margin:10px 4px 6px}
  .shop-row{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:14px;background:#f2eed6;margin-bottom:6px}.shop-row>div{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.shop-row strong{font-size:15px;font-weight:400}.shop-row span{font-size:11px;color:#6d7959}
  .pips{display:flex;gap:4px;margin-top:2px}.pips i{width:16px;height:5px;border-radius:3px;background:#dcdcc0}.pips i.on{background:#e9b948}
  .shop-buy{min-width:74px;min-height:42px;border:2px solid #b07d22;border-radius:14px;background:linear-gradient(#ffe08a,#f5c043);color:#5e3d0a;font-size:16px;box-shadow:0 3px 0 #b07d2288}.shop-buy:disabled{background:#e8e4cf;border-color:#cfcbb2;color:#8d8b78;box-shadow:none;opacity:1}
  .money-flight{position:absolute;pointer-events:none}.money-flight>.coin-icon{position:absolute;animation:coin-travel .55s var(--delay) cubic-bezier(.4,0,.8,1) both;opacity:0}
  .farm-world :global(.farm-joystick){position:absolute;display:none;width:100px;height:100px;margin:-50px;border:2px solid #fff8e899;background:#fff8e82b;border-radius:50%;pointer-events:none;z-index:4}.farm-world :global(.farm-joystick>div){position:absolute;left:30px;top:30px;width:36px;height:36px;background:#fff8e8c9;border:2px solid #ffffffc9;border-radius:50%}
  @keyframes toast-pop{from{opacity:0;translate:0 10px;scale:.9}to{opacity:1;translate:0 0;scale:1}}@keyframes coin-travel{0%{opacity:0;transform:translate(0,0) scale(.6)}15%{opacity:1}85%{opacity:1}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(.7)}}
  @media(min-width:600px){.farm-surround{padding:14px}.farm-shell{height:min(960px,calc(100dvh - 28px));border-radius:28px;box-shadow:0 12px 50px #1c362e66;border:3px solid #365437}}
    @media(max-height:720px){.farm-brand h1{font-size:23px}.farm-task{padding:7px 11px}.move-tip{margin-top:6px}.farm-footer{padding-left:12px;padding-right:12px}.farm-toast{top:20%}}
  @media(prefers-reduced-motion:reduce){.money-flight{display:none}.farm-toast{animation:none}}
</style>

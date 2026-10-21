<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import Icon from '#lib/components/Icon.svelte';
  import { createFarm, farmGoal, currentGoal, capacity, seedCapacity, total, atBoard, upgradePrice, helperPrice, nextPurchase, PURCHASES, UPGRADES, DECOR, HELPER_PRICES,
    type DecorId, type FarmEvent, type FarmState, type UpgradeId } from './model';
  import { installHaptics } from '#lib/haptics';
  import { readFarm, saveFarm, SAVE_KEY } from './storage';
  import type { createFarmScene, ShopAction } from './scene';

  let host: HTMLDivElement;
  let wallet: HTMLDivElement;
  let pauseDialog: HTMLDialogElement;
  let engine: ReturnType<typeof createFarmScene> | undefined;
  let farm: FarmState = createFarm();
  const snapshot = () => {
    const goal = currentGoal(farm), next = nextPurchase(farm);
    // While she pays for land the wallet counts down with the tile; the model spends it all at the end.
    const paying = next && farm.purchaseProgress > 0 ? Math.round(next.price * farm.purchaseProgress) : 0;
    return { wallet: farm.wallet - paying, paying: paying > 0, seeds: total(farm.seeds), seedCap: seedCapacity(farm), produce: total(farm.produce), capacity: capacity(farm),
      muted: farm.muted, music: farm.music, haptics: farm.haptics, atBoard: atBoard(farm),
      upgrades: (Object.keys(UPGRADES) as UpgradeId[]).map(id => ({ id, ...UPGRADES[id], level: farm.upgrades[id], price: upgradePrice(farm, id) })),
      decor: (Object.keys(DECOR) as DecorId[]).map(id => ({ id, ...DECOR[id], owned: farm.decor.includes(id) })),
      helpers: farm.helpers.length, helperPrice: helperPrice(farm), hint: farmGoal(farm).hint,
      stars: Math.round(farm.rating * 2) / 2, level: farm.goal + 1, goal: goal.text, reward: goal.reward,
      progress: Math.min(1, Math.max(0, goal.value(farm) / goal.target)) };
  };
  let hud = $state(snapshot());
  let loading = $state(true), error = $state(''), saveWarning = $state(false);
  let toast = $state(''), toastBig = $state(false), toastId = $state(0), coinId = $state(0);
  let flight = $state({ fromX: 0, fromY: 0, dx: 0, dy: 0 });
  // Coins dropping from the wallet into land she's paying for, one per call from the scene.
  let payCoins = $state<{ id: number; x: number; y: number; dx: number; dy: number }[]>([]), payId = 0;
  function walletPoint() {
    const r = wallet.getBoundingClientRect(), h = host.getBoundingClientRect();
    return { x: r.left + 22 - h.left, y: r.top + r.height / 2 - h.top };
  }
  function pay(at: { x: number; y: number }) {
    const w = walletPoint(), id = ++payId;
    payCoins.push({ id, x: w.x, y: w.y, dx: at.x - w.x + (Math.random() - 0.5) * 24, dy: at.y - w.y + (Math.random() - 0.5) * 12 });
    setTimeout(() => { payCoins = payCoins.filter(c => c.id !== id); }, 650);
  }
  // Guidance shows for a few seconds whenever it changes, low on the screen, then gets out of the way.
  let hintShown = $state(''), hintTimer: ReturnType<typeof setTimeout>, lastHint = '';
  $effect(() => {
    const hint = hud.hint;
    if (loading || hint === lastHint) return; // the HUD refreshes ten times a second; only a new hint restarts the clock
    lastHint = hint; hintShown = hint; clearTimeout(hintTimer);
    // If the same hint still stands 20s later, it comes back once more as a reminder.
    hintTimer = setTimeout(() => { hintShown = ''; hintTimer = setTimeout(() => { lastHint = ''; }, 20000); }, 5000);
  });
  let toastTimer: ReturnType<typeof setTimeout>;
  const store = { getItem: (key: string) => localStorage.getItem(key), setItem: (key: string, value: string) => localStorage.setItem(key, value) };
  let resetting = false;
  function save() { if (!resetting && !saveFarm(store, farm)) saveWarning = true; }
  // Starting over takes two taps, then clears the save and reloads; nothing saves on the way out.
  let confirmReset = $state(false);
  function startOver() {
    if (!confirmReset) { confirmReset = true; return; }
    resetting = true;
    try { localStorage.removeItem(SAVE_KEY); } catch { /* storage unavailable: the reload starts fresh anyway */ }
    location.reload();
  }
  function event(e: FarmEvent, target: { x: number; y: number }) {
    const bought = PURCHASES[farm.purchased - 1];
    const messages = { seed: `+${e.amount} seeds`, plant: '', served: '', sale: '', harvest: `+${e.amount} ${{ tomato: 'tomatoes', cucumber: 'cucumbers', strawberry: 'strawberries', apple: 'apples' }[e.crop as string] ?? ''}`,
      delivery: `${e.amount} fresh picks delivered`, cash: `+$${e.amount}`, unhappy: 'A shopper left without their order',
      purchase: { basket: `Bigger basket! Carry ${capacity(farm)}`, coop: 'Coop open! Collect eggs from the nests and sell them at the market',
        orchard: 'Orchard open! Pick apples under the trees and sell them at the green stand', hives: 'The bees moved in! Collect honey jars and sell them at the green stand',
        field: `New field! ${farm.plots.at(-1)?.crop === 'strawberry' ? 'Strawberries' : 'Cucumbers'} unlocked` }[bought?.kind ?? 'field'],
      goal: `Goal complete! +$${e.amount}`, egg: `+${e.amount} ${e.amount === 1 ? 'egg' : 'eggs'}`, honey: `+${e.amount} ${e.amount === 1 ? 'jar' : 'jars'} of honey`, helper: '',
      upgrade: e.id === 'helper' ? 'A farmhand joined the farm!' : e.id && e.id in DECOR ? `${DECOR[e.id as DecorId].name} added!` : e.id === 'shoes' && farm.upgrades.shoes === 1 ? 'Running shoes! Push the stick to its edge to sprint' : e.id ? `${UPGRADES[e.id as UpgradeId].name} level ${farm.upgrades[e.id as UpgradeId]}!` : '' };
    // A goal banner stays up a little longer and is not cut short by ordinary pickups.
    if (messages[e.type] && (!toastBig || e.type === 'goal')) {
      toast = messages[e.type]; toastBig = e.type === 'goal' || e.type === 'purchase' || e.type === 'upgrade'; toastId++; clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast = ''; toastBig = false; }, e.type === 'purchase' ? 3600 : toastBig ? 2600 : 1600);
    }
    if (e.type === 'purchase' || e.type === 'cash' || e.type === 'goal' || e.type === 'upgrade') {
      // Land is paid coin by coin while she stands on it (see pay), so a purchase needs no flight of its own.
      if (e.type === 'purchase') return;
      const w = walletPoint(), spend = e.type === 'upgrade', start = spend ? w : target, end = spend ? target : w;
      flight = { fromX: start.x, fromY: start.y, dx: end.x - start.x, dy: end.y - start.y }; coinId++;
    }
  }
  function pause() { engine?.setPaused(true); save(); pauseDialog.showModal(); }
  function resume() { confirmReset = false; engine?.setPaused(false); }
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
        engine = createFarmScene(host, farm, { update: () => { hud = snapshot(); }, event, save, pay });
        await engine.ready;
        if (!cancelled) { loading = false; host.dataset.ready = 'true'; }
      } catch (err) {
        console.error('Pocket Farm failed to load', err);
        engine?.destroy();
        if (!cancelled) { loading = false; error = 'Your farm couldn’t load. Try opening it again.'; }
      }
    })();
    return () => {
      cancelled = true; clearTimeout(toastTimer); clearTimeout(hintTimer); engine?.destroy(); removeHaptics();
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
      <div class="farm-status">
        <h1>Pocket Farm</h1>
        <div class="farm-stars" aria-label={`Shop rating: ${hud.stars} of 5 stars`}>{#each [1, 2, 3, 4, 5] as n}<span class:half={hud.stars === n - 0.5} class:on={hud.stars >= n}>★</span>{/each}</div>
        <div class="farm-goal" aria-label={`Goal: ${hud.goal}, ${Math.round(hud.progress * 100)}% done, reward ${hud.reward} coins`}>
          <div><span data-goal>{hud.goal}</span><b>+${hud.reward}</b></div>
          <i><span style:transform={`scaleX(${hud.progress})`}></span></i>
        </div>
      </div>
      <div class="farm-wallet" class:paying={hud.paying} bind:this={wallet} aria-label={`Wallet: ${hud.wallet} coins, level ${hud.level}`}>
        {@render coin()}<div><strong data-wallet>{hud.wallet}</strong><small data-level>Level {hud.level}</small></div>
      </div>
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
    {#each payCoins as c (c.id)}
      <div class="money-flight pay" aria-hidden="true" style={`left:${c.x}px;top:${c.y}px;--dx:${c.dx}px;--dy:${c.dy}px`}>{@render coin()}</div>
    {/each}
    <div class="farm-bottom">
      <!-- The basket: a round floating badge whose ring fills as she picks; seeds ride on its shoulder while she has any. -->
      <div class="farm-basket" class:full={hud.produce >= hud.capacity} role="img" aria-label={`Basket ${hud.produce} of ${hud.capacity}, seeds ${hud.seeds} of ${hud.seedCap}`}>
        <svg class="basket-ring" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28.5"/><circle cx="32" cy="32" r="28.5" pathLength="100" style:stroke-dasharray={`${Math.min(1, hud.produce / hud.capacity) * 100} 100`}/></svg>
        <svg class="basket-icon" aria-hidden="true" viewBox="0 0 32 32"><path d="M9 13C9 0 23 0 23 13" fill="none" stroke="#94613a" stroke-width="3"/><path fill="#b77c3e" d="m3 12 4 16h18l4-16Z"/><path fill="#efbd71" d="M4 12h24v4H4zM8 20h16v3H8z"/><circle fill="#e86646" cx="12" cy="11" r="4"/><circle fill="#df5137" cx="20" cy="11" r="4"/></svg>
        <strong data-produce>{hud.produce}<small>/{hud.capacity}</small></strong>
        {#if hud.seeds > 0}<span class="seed-badge" data-seeds><svg aria-hidden="true" viewBox="0 0 32 32"><path fill="#bc8e52" d="m10 5 6 3 6-3-2 7c8 7 8 16-4 16S4 19 12 12Z"/><path fill="#568f3d" d="M17 21c-7-1-8-8-8-8s9-2 10 5c2-5 7-5 7-5s0 7-9 8"/></svg>{hud.seeds}</span>{/if}
      </div>
      {#if saveWarning}<p class="farm-hint warning" role="status">Saving is unavailable in this browser. Keep this page open to keep playing.</p>
      {:else if hintShown}{#key hintShown}<p class="farm-hint" role="status" data-hint>{hintShown}</p>{/key}{/if}
    </div>
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
      <button class="farm-text-button reset" class:confirm={confirmReset} data-reset onclick={startOver}>{confirmReset ? 'Tap again to erase this farm and start over' : 'Start a new farm'}</button>
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
  .farm-header>*{pointer-events:auto}.farm-header{align-items:flex-start}
  .farm-status{flex:1;min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding-top:3px}
  .farm-stars{display:inline-flex;font-size:14px;line-height:1;color:#d8d9b8;text-shadow:0 1px 0 #41633466;padding:3px 7px;border-radius:10px;background:#fff6dfd9}.farm-stars .on{color:#f5b92e}.farm-stars .half{background:linear-gradient(90deg,#f5b92e 50%,#d8d9b8 50%);-webkit-background-clip:text;background-clip:text;color:transparent}
  .farm-status h1{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
  /* The goal: a slim card under the stars, like Catcha's meters along the top. */
  .farm-goal{width:min(100%,206px);padding:6px 10px 7px;border-radius:12px;background:#fff6dfe6;box-shadow:0 2px 0 #4163343d}
  .farm-goal>div{display:flex;justify-content:space-between;gap:8px;font-size:12px;line-height:1.15;color:#3e5534}.farm-goal span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.farm-goal b{font-weight:400;color:#9a661c;font-variant-numeric:tabular-nums}
  .farm-goal i{display:block;height:5px;margin-top:5px;border-radius:3px;background:#e5e7cd;overflow:hidden}.farm-goal i>span{display:block;height:100%;background:#e9b948;border-radius:3px;transform-origin:left;transition:transform .3s}
  .farm-round{width:43px;height:43px;min-width:43px;border:2px solid #49613a;border-radius:50%;background:#fff6df;box-shadow:0 3px 0 #49613a66;display:grid;place-items:center;color:#37553b;padding:8px}.farm-round:active{transform:translateY(2px);box-shadow:none}.farm-round.small{width:38px;height:38px;min-width:38px;padding:7px;background:#fff6dfed}
  .farm-wallet{display:flex;align-items:center;gap:7px;padding:5px 14px 5px 6px;border:2px solid #6d7339;border-radius:24px;background:#fff4cf;box-shadow:0 3px 0 #55753f66;min-width:86px}.coin-icon{display:block;width:28px;height:28px;flex-shrink:0}
  .farm-wallet>div{display:flex;flex-direction:column;line-height:1}.farm-wallet strong{font-size:22px;font-weight:400;font-variant-numeric:tabular-nums;transition:color .2s}.farm-wallet small{font-size:10px;color:#7d8457;margin-top:2px;white-space:nowrap}.farm-wallet.paying strong{color:#b35a1f}
  .farm-side-controls{position:absolute;right:16px;top:calc(var(--farm-top) + 62px);display:flex;flex-direction:column;gap:10px}.pause-symbol{width:14px;height:16px;border-left:5px solid currentColor;border-right:5px solid currentColor}
  /* Along the bottom: the basket badge, and beside it a hint that shows for a few seconds when there's something new to do. */
  .farm-bottom{position:absolute;left:16px;right:16px;bottom:max(16px,calc(env(safe-area-inset-bottom) + 8px));display:flex;align-items:center;gap:10px;pointer-events:none}
  .farm-basket{position:relative;flex-shrink:0;width:66px;height:66px;border-radius:50%;background:#fff6df;box-shadow:0 3px 0 #49613a66,0 0 0 2px #49613a;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px}
  .basket-ring{position:absolute;inset:0;width:100%;height:100%;rotate:-90deg}.basket-ring circle{fill:none;stroke-width:4;stroke:#e7e2c6}.basket-ring circle+circle{stroke:#e9b948;stroke-linecap:round;transition:stroke-dasharray .3s}
  .basket-icon{width:25px;height:25px}.farm-basket strong{font-size:13px;line-height:1;font-weight:400;font-variant-numeric:tabular-nums;color:#33503a}.farm-basket small{font-size:10px;color:#829066}
  .farm-basket.full .basket-ring circle+circle{stroke:#e0603f}.farm-basket.full strong{color:#c0492f}.farm-basket.full{animation:basket-full 1.4s ease-in-out infinite}
  .seed-badge{position:absolute;top:-5px;right:-9px;display:flex;align-items:center;gap:2px;height:22px;padding:0 7px 0 3px;border-radius:11px;background:#fff6df;box-shadow:0 0 0 2px #49613a;font-size:12px;color:#33503a;font-variant-numeric:tabular-nums}.seed-badge svg{width:15px;height:15px}
  .farm-hint{min-width:0;max-width:100%;width:max-content;margin:0;padding:8px 13px;border-radius:16px;background:#fff8e9e6;color:#3e5534;font-size:14px;line-height:1.25;box-shadow:0 2px 0 #4163343d;animation:hint-life 5s ease both}.farm-hint.warning{animation:none;background:#fff0ba;font-size:12px}
  .farm-toast{position:absolute;top:24%;left:50%;transform:translateX(-50%);padding:9px 16px;max-width:88%;width:max-content;border-radius:20px;background:#fff7df;color:#3a6336;box-shadow:0 3px 0 #41633455;font-size:16px;animation:toast-pop .2s ease-out;pointer-events:none;text-align:center}.farm-toast.big{font-size:21px;padding:12px 22px;background:#ffe79a;color:#6b4a12;box-shadow:0 4px 0 #b9862a88;border:2px solid #fff6d8}
  .farm-loading{position:absolute;inset:0;background:#b9d68c;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:35px;gap:16px}.farm-loading h2{font-size:30px}.farm-loading p{font-size:16px;color:#5c7543}.loading-sprout{font-size:80px;line-height:1;color:#f8dc7f;text-shadow:0 4px 0 #70964b}
  .farm-pause{margin:auto;width:calc(100% - 40px);max-width:350px;border:3px solid #3a5839;border-radius:25px;padding:25px;background:#fff7e3;color:#294d35;box-shadow:0 7px 0 #3a583944}.farm-pause::backdrop{background:#223c2b99}.farm-pause h2{font-size:30px}.farm-pause p{font-size:14px;margin:12px 0 20px;color:#72815f}.farm-pause button{width:100%;margin-top:12px}.farm-pause .setting-row{background:#f1efd8;border-color:#cad3ae;font-size:16px}.farm-text-button{border:0;background:none;color:#5a7545;padding:9px;font-size:14px;min-height:40px}.farm-pause .reset{margin-top:4px;font-size:12px;color:#9a7a5a;border-top:1px solid #e6dfc4;border-radius:0}.farm-pause .reset.confirm{color:#fff;background:#c9553f;border-radius:14px;border-top:0}
  .farm-shop{position:absolute;left:12px;right:12px;bottom:calc(max(12px,env(safe-area-inset-bottom)) + 8px);max-height:62%;display:flex;flex-direction:column;background:#fff8e9;border:2px solid #56703d;border-radius:20px;box-shadow:0 5px 0 #486a3766;animation:toast-pop .2s ease-out;z-index:3}
  .farm-shop header{display:flex;align-items:center;justify-content:space-between;padding:12px 12px 6px 16px}.farm-shop h2{font-size:22px}
  .shop-scroll{overflow:auto;padding:0 12px 12px;touch-action:pan-y}.farm-shop h3{font-family:inherit;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#7b855e;margin:10px 4px 6px}
  .shop-row{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:14px;background:#f2eed6;margin-bottom:6px}.shop-row>div{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.shop-row strong{font-size:15px;font-weight:400}.shop-row span{font-size:11px;color:#6d7959}
  .pips{display:flex;gap:4px;margin-top:2px}.pips i{width:16px;height:5px;border-radius:3px;background:#dcdcc0}.pips i.on{background:#e9b948}
  .shop-buy{min-width:74px;min-height:42px;border:2px solid #b07d22;border-radius:14px;background:linear-gradient(#ffe08a,#f5c043);color:#5e3d0a;font-size:16px;box-shadow:0 3px 0 #b07d2288}.shop-buy:disabled{background:#e8e4cf;border-color:#cfcbb2;color:#8d8b78;box-shadow:none;opacity:1}
  .money-flight{position:absolute;pointer-events:none}.money-flight>.coin-icon{position:absolute;animation:coin-travel .55s var(--delay) cubic-bezier(.4,0,.8,1) both;opacity:0}.money-flight.pay>.coin-icon{width:22px;height:22px;margin:-11px;animation-duration:.6s}
  .farm-world :global(.farm-joystick){position:absolute;display:none;width:100px;height:100px;margin:-50px;border:2px solid #fff8e899;background:#fff8e82b;border-radius:50%;pointer-events:none;z-index:4}.farm-world :global(.farm-joystick>div){position:absolute;left:30px;top:30px;width:36px;height:36px;background:#fff8e8c9;border:2px solid #ffffffc9;border-radius:50%}
  @keyframes toast-pop{from{opacity:0;translate:0 10px;scale:.9}to{opacity:1;translate:0 0;scale:1}}@keyframes coin-travel{0%{opacity:0;transform:translate(0,0) scale(.6)}15%{opacity:1}85%{opacity:1}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(.7)}}@keyframes hint-life{0%{opacity:0;translate:-8px 0}6%,88%{opacity:1;translate:0 0}100%{opacity:0}}@keyframes basket-full{50%{scale:1.06}}
  @media(min-width:600px){.farm-surround{padding:14px}.farm-shell{height:min(960px,calc(100dvh - 28px));border-radius:28px;box-shadow:0 12px 50px #1c362e66;border:3px solid #365437}}
  @media(max-height:720px){.farm-toast{top:20%}}
  @media(prefers-reduced-motion:reduce){.money-flight{display:none}.farm-toast,.farm-basket.full{animation:none}}
</style>

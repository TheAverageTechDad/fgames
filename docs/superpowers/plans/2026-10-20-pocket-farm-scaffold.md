# Pocket Farm scaffold implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. The user has asked to start building in this session.

**Goal:** Add a launchable portrait farming game to Pocket Arcade, with the reused mother character, local assets, and a playable seed-to-sale foundation.

**Architecture:** A separate `/farm` route owns a Svelte HUD and a disposable Three.js scene. A pure simulation owns inventory, crops, sales, purchases, and save validation; rendering and controls consume that state without importing Catcha's booting game. Keep the existing checkout on a feature branch so the result is immediately available in the user's workspace.

**Tech stack:** Existing Svelte 5, TypeScript, Three.js, Vitest, localStorage, Web Audio, and existing local GLB assets. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-20-farming-game-design.md`

## Global constraints

- Portrait first, no forced landscape rotation; desktop shows a portrait play area.
- One thumb moves; seed collection, planting, harvest, delivery, and money collection are automatic.
- One initial crop, free seeds, crop and supply limits, collected cash in wallet.
- First land purchase introduces cucumbers; equipment, workers, and unlimited expansion are future stages.
- Local assets, saved progress, proper cleanup on navigation, readable muted feedback.
- Working title: Pocket Farm; decorative meshes are reusable scaffold assets awaiting later Blender polish.

## Review focus

- Corrupt or unsupported saved data must recover without breaking the game.
- Full inventory must leave ripe crops intact and allow cash collection.
- Reloading during a purchase must not duplicate land or deduct cash twice.
- Touch cancellation, focus loss, hidden tabs, and navigation must release movement and resources.
- Small portrait and desktop viewports must keep HUD and farm controls usable.

## Task 1: Simulation and save foundation

Files: `src/lib/games/farm/model.ts`, `model.test.ts`, `storage.ts`, `storage.test.ts`.

Interfaces: `createFarm(): FarmState`, `stepFarm(state, dt, input): FarmEvent[]`, `purchaseLand(state): boolean`, `readFarm(storage): FarmState`, `saveFarm(storage, state): boolean`.

- [x] Write simulation tests for free seeds, planting/growth/harvest, full inventory, mixed inventory, sales/payment separation, affordable purchases, and insufficient funds.
- [x] Watch the new tests fail, then implement the state and simulation.
- [x] Add save tests for roundtrip, invalid values, wrong version, and unavailable storage; implement strict bounded recovery.
- [x] Run the targeted suite, then commit this task.

## Task 2: Portrait farm and arcade launch

Files: `src/routes/farm/+page.svelte`, `src/lib/games/farm/FarmGame.svelte`, `scene.ts`, `props.ts`, `input.ts`, `audio.ts`, `assets.ts`, `README.md`, `static/farm/assets/README.md`, `static/cards/farm-gameplay.webp`, and `src/lib/GameApp.svelte`.

Interfaces: `createFarmScene(host, state, onEvent, onReady): Promise<{ destroy(): void }>`; the scene advances Task 1's state, exposes ready state, and emits events to update HUD and sound. `createFarmInput(canvas)` returns `read()`, a joystick display snapshot, and `destroy()`.

- [x] Implement reusable crop, soil, stand, basket, market, fence, tree, and marker factories with a local asset manifest for the existing mother and customer GLBs.
- [x] Build an angled portrait camera and mother character with farm movement, carrying, planting and harvest animation hooks; add automatic interaction markers and simple customers.
- [x] Add a Svelte HUD for wallet, crop/seed capacity, next action, pause/settings, loading, recoverable errors, wallet-to-purchase animation, and home navigation.
- [x] Save valid state during play and on hide; pause while hidden; dispose input, audio, geometry, materials, animation loop, and WebGL on unmount.
- [x] Add a home-screen game card, actual scene thumbnail, and documentation of assets and remaining work.
- [x] Run type checks and build; verify direct navigation and launch from home.

## Task 3: Browser verification and handoff

Files: `scripts/farm-smoke.mjs`, `docs/verification/farm-scaffold.md`; update this checklist with results.

- [x] Verify the 390×844 and 375×667 portrait layouts and a wide desktop layout; review screenshots.
- [x] Exercise actual touch/keyboard movement and the complete seed/plant/harvest/deliver/cash/purchase loop; reload and verify state.
- [x] Verify pause, mute, cleanup after home navigation, cancellation, safe handling of invalid saves, and local assets in the production build.
- [x] Run existing tests, static checks, and production build; obtain a fresh review and fix material findings.
- [x] Commit verified scaffold and leave a local preview available.

## Execution notes

- Ruling: use a feature branch in the existing user workspace rather than move to a second checkout; this makes the scaffolding immediately reviewable in the project the user named. No changes to the user's untracked `.claude/` files.
- Ruling: this request authorises the scaffold and its playable foundation now; do not add another plan approval round. The wider design remains a staged proposal.
- Visual direction: leaf green `#75a940`, dark foliage `#294d35`, tomato red `#e65c42`, sunflower `#f5c653`, soil `#845335`, and parchment `#fff6df`. Keep the existing Lilita One/Luckiest Guy arcade type. The farm is the main surface; HUD uses compact physical counters and a small bottom task strip.

## Session 2 rulings (20 October 2026, Claude)

The user asked to continue from the Codex scaffold and to aim for the reference video's polish: an isometric layout that showcases the farm, and Catcha's tasteful finish. The scaffold was committed unchanged first (`d0cc21f`), then:

- Camera: orthographic at 45° yaw, about 47° elevation, following the farmer and clamped to the farm. The world stays axis-aligned; the joystick and arrow keys report screen directions, which the scene rotates into world movement.
- Layout: a stone cross with one quadrant each for the tomato field (top), purchasable cucumber field (right), farmhouse garden (left) and market (bottom). Balustrade on the far edges, low hedges on the near edges, a tree line behind. Tall props are kept clear of tiles further up the screen.
- Solid props: the counter, seed stands and house block movement (push-out along the shallower side). The cucumber stand only blocks once bought.
- Seed pickup now follows the spec: only as many seeds as there are empty spots for that crop (the scaffold took twice the demand).
- Customers: replaced the sale timer with a visible queue of up to three shoppers. The front shopper shows the crop and count wanted, takes stock one item at a time and pays per item onto the coin pile; an empty-handed shopper switches to a crop in stock. Shoppers are not saved, so reloading cannot lose or duplicate goods.
- Carrying: seeds and produce stack visibly in her arms (two columns, seeds at the bottom). Every transfer is animated: seeds and harvest into the stack, the stack onto the counter, produce to the shopper, coins to the pile and from the pile to her.
- Purchase: the scaffold's HUD popup is replaced by an in-world gold ring that fills on the price tile over 0.8 s, as the spec recommends. The new field pops in with confetti.
- Guidance: a bobbing arrow over the next goal and a chevron at her feet pointing to it, both driven by `farmGoal`, which also writes the hint.
- HUD: one compact task card (seeds, basket, fields, hint, progress); the movement tip disappears after she first moves.
- Haptics go through the shared Catcha module (installed on the farm route), so iPhones get feedback; the scaffold's `navigator.vibrate` was Android-only.
- Rendering: Neutral tone mapping, baked grass/paver/soil textures, rounded geometry, merged static world, cached crop templates, instanced stacks/coins/shelf, and shader precompilation behind the loading card.

Verification for this session is recorded in `docs/verification/farm-scaffold.md`.

## Session 3 rulings (20 October 2026, after the first phone playtest)

Fixes from the recording: the back button, title and wallet sat under iOS 26's blurred status-bar strip (the page reported no top inset), so the farm keeps its top controls at least 52px down on iOS; the pause dialog was pinned top-left because Tailwind's reset removes the dialog's automatic margin; the "customers paid" hint stuck forever because shoppers pay continuously, so it now only leads at 20 coins.

- Stakes (user's choice): goals plus patience. `currentGoal` walks an 11-step track (harvest, serve, buy, sell, reach stars…) then repeats a growing "serve N shoppers" goal; each pays a coin reward with a banner. The front shopper's patience (22 s) only drains while the shelf has nothing they will take; running out sends them off and costs 0.6 stars, serving gains 0.12. Stars start at 3, shorten shopper arrivals, and tip 1 coin at four stars and 2 at five. Shoppers only start coming after the first delivery, so the opening minute has no pressure.
- Progression: purchases run in order — cucumber field $40, bigger basket $60 (24 → 36), strawberry patch $120, biggest basket $200 (48) — with one price tile showing at a time.
- Space and pace: the farm grew from ±4.6 to ±6.4 with fields further apart. She runs at 3.6 and slows to 55% with a full basket; the step rate, bounce and lean follow.
- Feel: Catcha's soft instanced dust puffs (`juice.ts`) behind her feet, on harvests, plants and purchases; squash and stretch on starting, stopping and picking up.
- Life: Catcha's two girls (`chibi-sibling-sample` and `chibi-toddler`; the `*-boy` files are their boy variants) run between play spots and sometimes chase each other; blurred bird silhouettes cross high above with faint ground shadows; hand-built shoppers (eight looks: men, women and children, varied hair, skin and clothes) replace the recoloured dad.
- Time and weather: a five-minute outdoor day in Catcha's keyframe style (morning, midday, golden hour, dusk, moonlit night, dawn). Lamp posts, house windows and lamp pools glow at night with fireflies; night stays bright enough to play. A short light shower passes every few minutes. `?time=0.75` and `?rain` start at night or in the rain for checking.
- Saves stay at `pocket-farm:v1`; new fields default for older saves (purchases are inferred from the fields owned).

## Session 4 rulings (20 October 2026, after the second playtest)

- The girls now load from `chibi-sibling-sample.glb` and `chibi-toddler.glb`, which have their puffs and bows; session 3 had loaded the boy variants by mistake. The title is screen-reader only; the stars sit beside the back button.
- Birds fly at 3–4 units instead of 9 (which projected them off the top of the screen) and at 2 instead of 3.4, and each shadow falls straight down the sun's ray, so it sits under its bird.
- Money after the fields: the main track adds the chicken coop ($350) on new land past the right-hand hedge (hens lay into three nests every 4 s, up to 4 eggs each; walk past to collect; eggs sell for 4). A SHOP tile by the farmhouse door (from the first field on) opens a sheet with upgrades (sprinklers −15% growth ×3, fancy stall +1 coin per item ×3, comfy boots +10% speed ×3, seed pouch +6 ×2), two farmhands ($600, $1,200: they pick, replant and stock the stall) and five decorations (each adds to shopper arrival and tips). The goal track grows to 20 goals that walk through all of it.
- Sound: a new engine with a compressor, a generated soft reverb, transient-plus-tone recipes, small random variation, and pentatonic ladders for runs of planting, harvesting, sales and eggs. A served shopper rings a two-bell register "ka-ching"; banking coins cascades into a soft chord.
- Music: the user's track, trimmed, normalised to −18 LUFS and encoded as AAC at 32 kHz like Catcha's, then at 64 kbps after playtesting (4.0 MB → 1.35 MB, `static/farm/audio/music.m4a`). It plays at a low level, crossfades into itself, ducks while paused, stops when hidden, and has its own Music switch.
- Speech: shoppers greet or state their order on reaching the counter, nudge when impatient, and leave with a thank-you or a sigh; the order icon and patience ring show in between.
- Third playtest: effects were too loud and sharp. The effects bus is halved and low-passed at 5.2 kHz, every attack and noise burst fades in, unloading is a short soft tumble, sale coins are spaced at least 150 ms apart, and routine actions no longer buzz. The served-shopper bells remain the one sound that blooms. Music stays at its level.
- Planting was fine before and keeps its original sound and loudness (scaled for the quieter bus).
- Fourth playtest: the shimmer on the SHOP sign and fountain came from the shadow camera sliding with the view by fractions of a texel; it now moves in whole shadow-map texels (and the sign plate and fountain water sit a little proud of their backing). The scarecrow moved from the far corner to beside the tomato field. Sprinklers now show: one head per level on each field's corners, spinning and misting in turns.

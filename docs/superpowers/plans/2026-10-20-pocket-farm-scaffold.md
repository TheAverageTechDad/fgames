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

- [ ] Write simulation tests for free seeds, planting/growth/harvest, full inventory, mixed inventory, sales/payment separation, affordable purchases, and insufficient funds.
- [ ] Watch the new tests fail, then implement the state and simulation.
- [ ] Add save tests for roundtrip, invalid values, wrong version, and unavailable storage; implement strict bounded recovery.
- [ ] Run the targeted suite, then commit this task.

## Task 2: Portrait farm and arcade launch

Files: `src/routes/farm/+page.svelte`, `src/lib/games/farm/FarmGame.svelte`, `scene.ts`, `props.ts`, `input.ts`, `audio.ts`, `assets.ts`, `README.md`, `static/farm/assets/README.md`, `static/cards/farm-gameplay.webp`, and `src/lib/GameApp.svelte`.

Interfaces: `createFarmScene(host, state, onEvent, onReady): Promise<{ destroy(): void }>`; the scene advances Task 1's state, exposes ready state, and emits events to update HUD and sound. `createFarmInput(canvas)` returns `read()`, a joystick display snapshot, and `destroy()`.

- [ ] Implement reusable crop, soil, stand, basket, market, fence, tree, and marker factories with a local asset manifest for the existing mother and customer GLBs.
- [ ] Build an angled portrait camera and mother character with farm movement, carrying, planting and harvest animation hooks; add automatic interaction markers and simple customers.
- [ ] Add a Svelte HUD for wallet, crop/seed capacity, next action, pause/settings, loading, recoverable errors, wallet-to-purchase animation, and home navigation.
- [ ] Save valid state during play and on hide; pause while hidden; dispose input, audio, geometry, materials, animation loop, and WebGL on unmount.
- [ ] Add a home-screen game card, actual scene thumbnail, and documentation of assets and remaining work.
- [ ] Run type checks and build; verify direct navigation and launch from home.

## Task 3: Browser verification and handoff

Files: `scripts/farm-smoke.mjs`, `docs/verification/farm-scaffold.md`; update this checklist with results.

- [ ] Verify the 390×844 and 375×667 portrait layouts and a wide desktop layout; review screenshots.
- [ ] Exercise actual touch/keyboard movement and the complete seed/plant/harvest/deliver/cash/purchase loop; reload and verify state.
- [ ] Verify pause, mute, cleanup after home navigation, cancellation, safe handling of invalid saves, and local assets in the production build.
- [ ] Run existing tests, static checks, and production build; obtain a fresh review and fix material findings.
- [ ] Commit verified scaffold and leave a local preview available.

## Execution notes

- Ruling: use a feature branch in the existing user workspace rather than move to a second checkout; this makes the scaffolding immediately reviewable in the project the user named. No changes to the user's untracked `.claude/` files.
- Ruling: this request authorises the scaffold and its playable foundation now; do not add another plan approval round. The wider design remains a staged proposal.
- Visual direction: leaf green `#75a940`, dark foliage `#294d35`, tomato red `#e65c42`, sunflower `#f5c653`, soil `#845335`, and parchment `#fff6df`. Keep the existing Lilita One/Luckiest Guy arcade type. The farm is the main surface; HUD uses compact physical counters and a small bottom task strip.

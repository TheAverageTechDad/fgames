# Pocket Farm

Working title for the portrait farming game. Launch from the arcade or `/farm`.

- `FarmGame.svelte`: portrait shell, wallet, compact task card, feedback, pause/settings, loading/errors, and lifecycle.
- `model.ts`: independent simulation: layout, collisions, crops, inventory, load-based speed, the customer queue and patience, star rating, purchases, the goal track, and the next-step guide.
- `storage.ts`: versioned `pocket-farm:v1` save and validation, defaulting fields older saves lack. No offline growth. Customers are not saved.
- `juice.ts`: Catcha's soft dust puffs and the outdoor time-of-day keyframes.
- `scene.ts`: disposable Three.js scene: isometric follow camera, the farmer's squash and dust, plants, carry stack, shoppers, children, Dad minding the stalls (walking between them once the orchard opens), birds, day/night, rain, cash pile, guide arrow, and transfer effects. `?time=0.75` starts at night, `?rain` starts a shower.
- `world.ts`: the static farm (ground, stone paths, balustrade, hedges, house, trees, ground tiles), merged into a few draw calls.
- `props.ts`: reusable local meshes and baked canvas textures for soil, crops, stands, market, hedges, trees, bushes, lamps, tiles and the hand-built shoppers.
- `assets.ts`: shared local GLB references. Does not import or initialise Catcha.
- `input.ts`: floating one-thumb stick, mouse drag, arrows/WASD (screen directions), Catcha's jump (quick tap, second finger, Space), input cancellation and cleanup.
- `audio.ts`: gesture-unlocked sound design (transients, plucks, bells, coin clinks, ladders, soft reverb), the looping soundtrack, and haptics through the shared Catcha module.

Start: `pnpm dev`. Verify: `pnpm check`, `pnpm test`, `pnpm build`, then `FGAMES_URL=<preview url> node scripts/farm-smoke.mjs`.

## Layout and look

The farm is laid out on world axes and drawn by an orthographic camera at 45°, like the reference: the stone cross reads as two diagonals, tomatoes at the top, cucumbers on the right, strawberries on the left with the farmhouse in their corner, and the market at the bottom, with room between them to run. The camera follows her and is clamped to the farm. Tall props stay clear of the tiles behind them because a height of `h` hides `h` units of ground further up the screen.

Ground tiles (SEEDS, SELL, the price tile) are painted flat and unlit; everything else uses Neutral tone mapping, a hemisphere fill and one shadowing sun that follows the camera.

## Loop and stakes

Seed stands give free seeds, one per empty spot. She plants and harvests by walking through the soil; produce stacks in her arms and slows her down. At SELL the stack moves onto the counter. Once the shop has opened, up to three shoppers queue; the front one shows what they want with a patience ring, takes it one item at a time and pays per item onto the coin pile. If the shelf has nothing for them their patience runs out and they leave unhappy, lowering the star rating; happy shoppers raise it, and more stars bring more shoppers and tips. Walking over the coins banks them.

Purchases come one at a time on golden tiles: cucumber field, bigger basket, strawberry patch, biggest basket, chicken coop, orchard (with its own stand for apples and honey), beehives. The SHOP tile by the farmhouse sells upgrades, farmhands and decorations. The goal track (shown as the level in the task card) pays coin rewards. Nothing is ever lost and there is no game over.

## Next

Crop reassignment, more land and products, richer Blender props and farming animations, and the user's voice clips.

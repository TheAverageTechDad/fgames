# Pocket Farm

Working title for the portrait farming game. Launch from the arcade or `/farm`.

- `FarmGame.svelte`: portrait shell, wallet, compact task card, feedback, pause/settings, loading/errors, and lifecycle.
- `model.ts`: independent simulation: layout, collisions, crops, inventory, the customer queue, shop exchanges, the first land unlock, and the next-goal guide.
- `storage.ts`: versioned `pocket-farm:v1` save and validation. No offline growth. Customers are not saved.
- `scene.ts`: disposable Three.js scene: isometric follow camera, characters, plants, carry stack, shoppers, cash pile, guide arrow, and transfer effects.
- `world.ts`: the static farm (ground, stone paths, balustrade, hedges, house, trees, ground tiles), merged into a few draw calls.
- `props.ts`: reusable local meshes and baked canvas textures for soil, crops, stands, market, hedges, trees, bushes and tiles.
- `assets.ts`: shared local GLB references. Does not import or initialise Catcha.
- `input.ts`: floating one-thumb stick, mouse drag, arrows/WASD (screen directions), input cancellation and cleanup.
- `audio.ts`: gesture-unlocked sound effects with slight pitch variation; haptics through the shared Catcha module (works on iOS Safari's switch fallback).

Start: `pnpm dev`. Verify: `pnpm check`, `pnpm test`, `pnpm build`, then `FGAMES_URL=<preview url> node scripts/farm-smoke.mjs`.

## Layout and look

The farm is laid out on world axes and drawn by an orthographic camera at 45°, like the reference: the stone cross reads as two diagonals, the tomato field sits at the top, the market at the bottom, the farmhouse on the left and the purchasable field on the right. The camera follows her and is clamped to the farm. Tall props stay clear of the tiles behind them because a height of `h` hides `h` units of ground further up the screen.

Ground tiles (SEEDS, SELL, the price tile) are painted flat and unlit; everything else uses Neutral tone mapping, a hemisphere fill and one shadowing sun that follows the camera.

## Loop

Seed stands give free seeds, only as many as there are empty spots. She plants and harvests by walking through the soil. Produce and seeds stack visibly in her arms. At SELL the stack moves onto the counter. Up to three shoppers queue along the counter; the front one shows what they want, takes it one item at a time and pays per item onto the coin pile, so a reload never loses or duplicates goods. Walking over the coins banks them. Standing on the golden tile for 0.8 s buys the cucumber field and its seed stand.

## Next

Crop reassignment, capacity and equipment upgrades, more connected expansion sections, workers, purpose-made shopper models, richer Blender props and farming animations, and final sound/voice production.

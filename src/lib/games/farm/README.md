# Pocket Farm

Working title for the portrait farming game. Launch from the arcade or `/farm`.

- `FarmGame.svelte`: portrait shell, wallet, inventory, feedback, pause/settings, loading/errors, and lifecycle.
- `model.ts`: independent simulation, crop/inventory rules, shop exchanges, and first land unlock.
- `storage.ts`: versioned `pocket-farm:v1` save and validation. No offline growth.
- `scene.ts`: disposable Three.js scene, characters, farm animation, and presentation.
- `props.ts`: reusable local mesh assets for soil, crops, seed stands, market, baskets, trees, and markers.
- `assets.ts`: shared local GLB references. Does not import or initialise Catcha.
- `input.ts`: floating one-thumb stick, mouse drag, arrows/WASD, input cancellation and cleanup.
- `audio.ts`: gesture-unlocked sound effects and optional vibration.

Start: `pnpm dev`. Verify: `pnpm check`, `pnpm test`, `pnpm build`.

This scaffold supports tomatoes, a first $40 land purchase that introduces cucumbers, free seed pickup, automatic farming and stocking, customer sales, collectible cash, and local saves. Portrait layout uses device safe areas and remains upright on desktop and landscape screens.

The next stages are crop reassignment, equipment progression, workers, generated expansion sections, more distinctive customer models, richer Blender props and agricultural animations, and final sound/voice production. The first two field positions are fixed to establish the playable foundation.

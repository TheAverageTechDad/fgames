# fgames

An installable library of offline puzzles built with SvelteKit 3, Svelte 5 and Three.js r185.

Nuts & Bolts transfers matching groups with one tap, animates each nut, and undoes a whole group in one step. Escape follows the finger inside the available lane, snaps to cells, and drives the red car out before showing the result. Both games share the same controls, settings, guided first moves and result card.

## Levels and progress

The app ships 100 puzzles per game and difficulty: 800 in total. JSON files in `static/levels` contain exact shortest solutions and are ordered by move count. Generators run during development, never on the player's device. Hints solve the current position in a worker.

Each difficulty starts at Level 1. The new library uses versioned progress keys because its puzzles replace the old generated levels. Hints are saved per game and do not refill when restarting, changing difficulty or changing level. Sound and haptics preferences are saved on the device.

## Offline support

The service worker precaches routes, puzzle JSON, fonts, icons, sprites and both workers. Navigation queries select local game state and share the cached route document. Everything required for play is local after the first successful download.

The pocket arcade icon source and export instructions are in `assets/branding`. The menu art uses actual gameplay captures. Phosphor icons and both fonts are bundled with their licences.

## Development

```sh
pnpm install
pnpm dev
pnpm check
pnpm test
pnpm build
pnpm preview --host 127.0.0.1 --port 4174
```

In another terminal, run browser verification against that production preview:

```sh
pnpm exec playwright install chromium
pnpm smoke
```

`FGAMES_URL` changes the target URL. The smoke script checks fresh Level 1 starts and plays stored solutions in all eight combinations, then checks replay, navigation, hints, a small viewport and offline reloads. It records startup tasks in `test-results/smoke.json`; `FGAMES_STRICT_PERF=1` enforces the report's 50 ms startup task gate on both games.

Regenerate the library explicitly with `pnpm levels`. `node scripts/generate-levels.mjs --resume` keeps completed libraries. Every shipped solution is checked by `pnpm test` for legal moves and a winning final state.

## Rendering and device support

The retained Nuts scene runs in an OffscreenCanvas worker where supported, with a main-thread fallback for older browsers. It uses shared shaft geometry, blob shadows, adaptive resolution and no preserved drawing buffer. Rendering resources and workers are released on exit.

Haptics use Catcha's vendored modules. Android uses the Vibration API; the Safari switch fallback depends on the iOS version and browser restrictions. The preference is a real switch, and the UI does not claim that every device supports it.

## Release

```sh
pnpm build
pnpm dlx wrangler@latest pages deploy build --project-name fgames --branch main
```

See `docs/FIX_REPORT_STATUS.md` for the report mapping and device verification limits.

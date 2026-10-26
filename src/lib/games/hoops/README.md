# Hoops

Working title for the basketball game. Build step 1, the shootaround: Dad alone on a half court with a ball and a hoop. Open `/hoops` (not linked from the arcade yet). Design: `docs/superpowers/specs/2026-10-26-basketball-game-design.md`.

- `court.ts`: court axes and sizes (Dad is 1.7 units tall), the arc and the boundaries.
- `ball.ts`: the only physics body. A fixed 120 Hz step with substeps, against the floor, backboard box, rim torus and pole. A basket counts once, downward through the ring.
- `shot.ts`: pull strength (length over the screen's shorter side), distance-relative power with a sweet band, the ±25° aim cone judged against the rim's on-screen direction, and the launch that enters the rim at 45° or steeper and clears its front.
- `game.ts`: the shootaround: movement with momentum, dribble, aim (feet planted, facing the rim), instant release and hop, jump, rebounds, pickups, and out-of-bounds balls that keep bouncing and are tossed back.
- `input.ts`: hold Dad still for 0.15 s to aim (the shared stick lets go of that touch), pull back, let go; a touch on Dad that moves first is the stick (`src/lib/stick-input.ts`), as is everything else.
- `scene.ts`: the disposable Three.js scene. A camera facing the hoop squarely (`shot.ts` relies on that), framed to fit the court width; Dad's arm and leg pivots, with the ball drawn at his right hand while dribbling; the arc dots; the pickup bend; ball squash and spin; the net.
- `HoopsGame.svelte`: the shell, with the made/attempted counter, the `+1`/`+2` pop, pause, and the smoke hooks on the world element.

Verify: `pnpm check`, `pnpm test`, `pnpm build`, then `FGAMES_URL=<preview url> node scripts/hoops-smoke.mjs`.

## Tuning

The feel lives in a few constants: `P_IDEAL` (the comfortable pull, a fifth of the screen), `BAND_NEAR`/`BAND_FAR`, `POWER_SLOPE` and `ENTRY_ANGLE` in `shot.ts`; the restitutions in `ball.ts`; `COURT`, `ARC_R` and `RIM` in `court.ts`.

## Checked on

- Headless Chromium, 390×844 touch emulation (the smoke script).
- The desktop app's browser pane at 375×812 mobile emulation.
- iPhone (the first playtest recording, 26 October 2026): no makes in 15 shots with the original swipe, and movement starting on Dad turned into shots. That led to hold-pull-release shooting. The new controls aren't phone-checked yet.

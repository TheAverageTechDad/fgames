# Hoops

Working title for the basketball game. Build step 1, the shootaround: Dad alone on a half court with a ball and a hoop. Open `/hoops` (not linked from the arcade yet). Design: `docs/superpowers/specs/2026-10-26-basketball-game-design.md`.

- `court.ts`: court axes and sizes (Dad is 1.7 units tall), the arc and the boundaries.
- `ball.ts`: the only physics body. A fixed 120 Hz step with substeps, against the floor, backboard box, rim torus and pole. A basket counts once, downward through the ring.
- `shot.ts`: swipe strength (travel × speed, normalized by the screen's shorter side), distance-relative power with a sweet band, the ±25° aim cone that snaps to the rim, and the launch that enters the rim at 45° or steeper.
- `game.ts`: the shootaround: movement, dribble, windup and automatic shooting hop, jump, rebounds, pickups and out-of-bounds resets.
- `input.ts`: a touch that starts on Dad while he has the ball is a shot (a tap there jumps); everything else is the shared stick (`src/lib/stick-input.ts`).
- `scene.ts`: the disposable Three.js scene. A camera facing the hoop squarely (`shot.ts` relies on that), framed to fit the court width; Dad's arm and leg pivots; ball squash and spin; the net.
- `HoopsGame.svelte`: the shell, with the made/attempted counter, the `+1`/`+2` pop, pause, and the smoke hooks on the world element.

Verify: `pnpm check`, `pnpm test`, `pnpm build`, then `FGAMES_URL=<preview url> node scripts/hoops-smoke.mjs`.

## Tuning

The feel lives in a few constants: `S_IDEAL` (the comfortable swipe, now 30% of the screen in 0.15 s), `BAND_NEAR`/`BAND_FAR`, `POWER_SLOPE` and `ENTRY_ANGLE` in `shot.ts`; the restitutions in `ball.ts`; `COURT`, `ARC_R` and `RIM` in `court.ts`.

## Checked on

- Headless Chromium, 390×844 touch emulation (the smoke script).
- The desktop app's browser pane at 375×812 mobile emulation.
- Not yet on a real phone. That check decides whether this step is done.

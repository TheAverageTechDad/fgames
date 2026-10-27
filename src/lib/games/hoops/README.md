# Hoops

Working title for the basketball game. Build step 1, the shootaround: Dad alone on a half court with a ball and a hoop. First card on the arcade home screen, or open `/hoops`. Design: `docs/superpowers/specs/2026-10-26-basketball-game-design.md`.

- `court.ts`: court axes and sizes (Dad is 1.7 units tall), the arc and the boundaries.
- `ball.ts`: the only physics body. A fixed 120 Hz step with substeps, against the floor (grass grips harder than asphalt), the fence, backboard box, rim torus and pole. A basket counts once, downward through the ring.
- `shot.ts`: pull strength (length over the screen's shorter side), distance-relative power with a sweet band, aim help judged against the rim's on-screen direction (full to 20°, easing out to none at 80°), and the launch that enters the rim at 45° or steeper and clears its front.
- `game.ts`: the shootaround: movement with momentum, Catcha's sprint (wind-up, burst, skid) and stamina, dribble, aim (feet planted, facing the rim), instant release and hop, jump, dunks and layups (a jump with the ball within 1.3 m / 2.5 m of the rim), rebounds, pickups, and balls that go out staying put for him to fetch (he can walk off the court as far as the fence).
- `input.ts`: hold Dad still for 0.12 s (within 56 px of him, or his full on-screen height if that is more) to aim (the shared stick lets go of that touch), pull back, let go; a touch on Dad that moves first is the stick (`src/lib/stick-input.ts`), as is everything else.
- `scene.ts`: the disposable Three.js scene. A camera facing the hoop squarely (`shot.ts` relies on that) that slides after Dad; the chain-link fence; Dad's arm and leg pivots, with the ball drawn at his right hand while dribbling; the arc dots; the pickup bend; dust; the stamina gauge; the family on the sideline (`?fans=cheer`, `clap`, `watch`, `aww` or `flinch` holds them in one mood for tuning); `?speed=0.25` slows everything down for checking animation; the time of day (Pocket Farm's sky keyframes, `DAY` and `DAY_SECONDS`: a 7-minute loop from morning through a long-shadowed sunset to a short lamplit dusk; `?time=0.64` starts at sunset); ball squash and spin; the net.
- `audio.ts`: Pixabay recordings in `static/hoops/audio` (with synthesized fallbacks), the looping music (`music.m4a`, own Music switch) and synthesized sound for every ball contact, the shot, sprint, skid, jump and landing, the family's cheer and "aww", panned with the ball; vibrations through the shared haptics. Follows the arcade's mute and vibration switches.
- `HoopsGame.svelte`: the shell, with the made/attempted counter, the `+1`/`+2` pop, "Out of puff!", pause with Sound and Vibration switches, and the smoke hooks on the world element.

Verify: `pnpm check`, `pnpm test`, `pnpm build`, then `FGAMES_URL=<preview url> node scripts/hoops-smoke.mjs`.

## Tuning

The feel lives in a few constants: `P_IDEAL` (the comfortable drag toward the hoop, a fifth of the screen), `BAND_NEAR`/`BAND_FAR`, `POWER_SLOPE` and `ENTRY_ANGLE` in `shot.ts`; the restitutions in `ball.ts`; `COURT`, `ARC_R` and `RIM` in `court.ts`.

## Checked on

- Headless Chromium, 390×844 touch emulation (the smoke script).
- The desktop app's browser pane at 375×812 mobile emulation.
- iPhone (the first playtest recording, 26 October 2026): no makes in 15 shots with the original swipe, and movement starting on Dad turned into shots. That led to hold-pull-release shooting. 
- iPhone, second playtest: 7 of 23 made. Led to the bigger court and following camera, the fence instead of the toss back, the wider touch on Dad, and aim help that eases off. Not phone-checked yet.

# Garage

Build a real motorbike part by part, paint it, fire it up and take it for its first ride. Launch from the arcade or `/garage`. It's a puzzle as well as a lesson in what a motorbike is made of, at three levels:

- **Apprentice** (about 3+): 13 big parts, one at a time in a mechanic's order. Each floats beside the bike with a glowing ghost where it goes; a hand shows the drag. Nothing can go wrong.
- **Mechanic**: the same 13 parts laid out in a tray, shuffled. No ghost, no hand, no camera help. Drop a part where it belongs; a part whose mounts aren't on yet is refused ("Not yet! First the back wheel, then the chain.").
- **Master**: 28 smaller parts (crankcase, cylinders, carburettors, shocks, fork clamps, levers…), a tighter drop, so the small ones need a pinch-zoom.

Mechanic and Master run a stopwatch from the first part to the last (it pauses with the game and carries over when a build is resumed); the fastest build per mode shows on its button as "Best m:ss". Apprentice is never timed. Tapping the part in hand's tile again (it shows a ×) puts it back on the bench.

Every part that goes on shows and speaks a one-line fact about what it does. Part names are spoken as they're picked up.

- `steps.ts`: `PARTS`, the 28 parts with what each bolts onto (the build's dependency graph) and a fact; `STEPS`, the 13 big steps in a mechanic's order with where each waits, how it slides in and its camera angle; `MODES`; `piecesFor(mode)`, which turns either into what the child fits; the seven paints and the dial sweeps.
- `scene.ts`: the disposable Three.js scene and the game's flow: garage → build → paint → start → ride → finish → garage. Loads `static/garage/roadster-v2.glb` (Draco, decoder in `static/garage/draco/`). The GLB's 28 `part_*` nodes are grouped at run time into the mode's pieces. Apprentice: each step's part floats beside the bike with a glowing ghost; dragging it near the ghost, or tapping it, flies it in. Mechanic and Master: tap a part in the tray (or pull it up out of it) and it floats in front of you, shrunk to a handful; drag it onto the bike; it is judged on screen against its own place and its mounts. Then a wrench button over each bolt tightens it. The tray's pictures are rendered from the model at load. Camera: drag empty space to turn right round (kept inside the garage walls), pinch or scroll to zoom towards the fingers, two fingers to pan, double-tap to put it back. Tap the radio to switch it off and on. Engine: tap Start (it cranks, catches and idles), hold Vroom to rev (smoke, backfire pops, the rev counter's needle swings). `window.garage` exists in dev builds, with `advance(seconds)` to run the clock in a hidden tab.
- `life.ts`: Catcha's radio on the bench (speaker thump, ripples and notes while it plays), Dad (Catcha's `chibi-dad.glb`) pottering between the bench, tool chest, paint shelf and doorway, and the girls (`chibi-sibling-sample`, `chibi-toddler`) chasing round the garden outside, seen through a haze of daylight in the doorway. Loaded after the bike, so they never hold up the build.
- `room.ts`: the workshop from simple shapes and canvas textures: concrete floor, block wall, pegboard and tools, bench, roll cab, paint tins in the seven paints, tyre stack, oil drum, roller door onto a sunny day, framed photos of every bike built, and the red build stand.
- `ride.ts`: the first ride, seen from the side: a 520 m country road with rolling hills, fence, trees, cottages, clouds, 14 stars and a chequered flag. Hold Go. Gears change themselves; the wheels, speedo and rev counter move; the rider is built from rounded limbs in leathers, jeans and boots with a full-face helmet the bike's colour, posed with two-bone IK onto the measured seat, grips and pegs.
- `effects.ts`: sprite dust, sparkles, exhaust smoke, backfire flashes and paint mist.
- `audio.ts`: all synthesised. The engine is one crank cycle of four slightly unequal firing pulses, looped and pitched by rpm through fixed exhaust filters; a starter whirr with compression chugs; the catch; pops. Build sounds: whoosh, clunk, Nuts & Bolts' thread sound for each bolt, an "uh-uh" for a wrong spot, and a chime per part climbing a pentatonic ladder. The radio plays Catcha's tune through a small-speaker filter, dips under the engine and stays behind on the ride. Part names through the browser's speech (Pause → Say part names). Follows the arcade's mute and vibration switches.
- `storage.ts`: `garage:v1`: the bikes built (paint, stars, mode), the build in progress (mode, pieces on, paint), the last mode, and the voice and radio switches. Validated on read; the first format (a count of steps) reads as an Apprentice build.

## The model

The bike is generated in Blender with Sand3D from `scripts/roadster/` (one module per assembly, `spec.py` holding the geometry, `check.py` failing on clashes, floating parts and parts with no mount chain to the frame). `scripts/roadster/export.py` writes the game file:

    /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/roadster/export.py -- static/garage/roadster-v2.glb

It merges each part's pieces per material (about 125 draw calls, 425k triangles, under 1 MB), keeps the wheels and dial needles on their own pivots (`spin_*`, `needle_*`) and adds bolt markers (`bolt_<part>_<n>`: hand-placed, or the part's right-most point near its middle). A model part missing from its `STEPS` table stops the export; its ids must match `PARTS` in `steps.ts`. The arcade card uses illustrated cover art in `static/cards/garage-poster-v2.webp`.

Verify: `pnpm check`, `pnpm test`, `pnpm build`.

## Next

The chain moving on the ride, a timer or par for Master, and the next vehicles on the ladder (bicycle, scooter, car) in the same garage.

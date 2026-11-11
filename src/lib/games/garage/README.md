# Garage

Build a real motorbike part by part, paint it, fire it up and take it for its first ride. Launch from the arcade or `/garage`. For children of about 3–7: every step is a tap or a drag, nothing can go wrong, and the part names are spoken.

- `steps.ts`: the 13 build steps in a mechanic's order (engine, swingarm, back wheel, chain, forks, front wheel, exhaust, tank, seat, handlebars, headlight, tail light, footpegs), where each part waits and the way it slides in, the camera angle for each, the seven paints, and the dial sweeps.
- `scene.ts`: the disposable Three.js scene and the game's flow: garage → build → paint → start → ride → finish → garage. Loads `static/garage/roadster.glb` (Draco, decoder in `static/garage/draco/`). Each step's part floats beside the bike with a glowing ghost where it belongs; dragging it near the ghost, or tapping it, flies it in; then a wrench button over each bolt tightens it. The camera frames each step to fit the screen either way up; drag empty space to turn the bike. Engine: tap Start (it cranks, catches and idles), hold Vroom to rev (smoke, backfire pops, the rev counter's needle swings). `window.garage` exists in dev builds, with `advance(seconds)` to run the clock in a hidden tab.
- `room.ts`: the workshop from simple shapes and canvas textures: concrete floor, block wall, pegboard and tools, bench, roll cab, paint tins in the seven paints, tyre stack, oil drum, roller door onto a sunny day, framed photos of every bike built, and the red build stand.
- `ride.ts`: the first ride, seen from the side: a 520 m country road with rolling hills, fence, trees, cottages, clouds, 14 stars and a chequered flag. Hold Go. Gears change themselves; the wheels, speedo and rev counter move; Dad rides in a helmet the colour of the bike (Catcha's `chibi-dad.glb`, legs and arms posed).
- `effects.ts`: sprite dust, sparkles, exhaust smoke, backfire flashes and paint mist.
- `audio.ts`: all synthesised. The engine is one crank cycle of four slightly unequal firing pulses, looped and pitched by rpm through fixed exhaust filters; a starter whirr with compression chugs; the catch; pops. Build sounds: whoosh, clunk, Nuts & Bolts' thread sound for each bolt, and a chime per part climbing a pentatonic ladder. Part names through the browser's speech (Pause → Say part names). Follows the arcade's mute and vibration switches.
- `storage.ts`: `garage:v1`: the bikes built (paint, stars), the build in progress (parts on, paint) and the voice switch. Validated on read.

## The model

The bike is generated in Blender with Sand3D from `scripts/roadster/` (one module per assembly, `spec.py` holding the geometry, `check.py` failing on clashes, floating parts and parts with no mount chain to the frame). `scripts/roadster/export.py` writes the game file:

    /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/roadster/export.py -- static/garage/roadster.glb

It merges each step's parts per material (about 110 draw calls, 425k triangles, under 1 MB), keeps the wheels and dial needles on their own pivots (`spin_*`, `needle_*`) and adds bolt markers (`bolt_<step>_<n>`). A part missing from its `STEPS` table stops the export. The arcade card is shot from the game: `FGAMES_URL=http://localhost:5180 node scripts/garage-poster.mjs`.

Verify: `pnpm check`, `pnpm test`, `pnpm build`.

## Next

Rider choice (the girls, Mom), the chain moving on the ride, and the next vehicles on the ladder (bicycle, scooter, car) in the same garage.

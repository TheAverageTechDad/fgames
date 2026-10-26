# Dad basketball — first design

Date: 26 October 2026. Revised the same day after review (see "Changes in this revision").

Status: design decisions settled with the user (see "Decisions"); numeric values remain tuning choices. This document does not authorize implementation. No final name yet; working route `/hoops`.

## Intent

A good-looking, casual basketball game in the existing pocket arcade. Dad and two teammates play a team of three on one half court. A match fits a short break, played with one thumb in portrait, with an optional second finger. The player moves, escapes defenders, passes and judges shot strength without learning a complicated control scheme or a full ruleset.

As in the other games, the point is accessible touch controls and satisfying physical interactions. The ball, the character animation and the court should make even a short session feel good.

## Established with the user

- Portrait presentation; primarily one-thumb play, with one or two fingers supported.
- Half-court 3v3, with Dad on the player's team and two other teammates. The other five players use AI whenever they are not under direct control.
- Reuse the existing walk, sprint, jump and touch-control mechanics. Do not replace them with a new movement scheme.
- Moving while holding possession dribbles automatically. No separate dribble gesture. Pleasing ball squash and stretch.
- Tap a teammate to pass. Control follows possession: when the teammate catches the pass, that teammate becomes the controlled player.
- Swipe toward the rim to shoot. Swipe speed and travel both contribute to strength; a swipe that is too fast or too long can overshoot.
- The shot swipe starts on the controlled player; a drag starting elsewhere is movement. Accepted as the starting approach, subject to how it feels in play.
- AI defenders steal by staying very close to the ball carrier for a few seconds. Moving away and passing escape the pressure.
- Ball physics supports bouncing and colliding with physically present objects.
- The court has proper surface texture and markings; the models and overall presentation have good visual quality.
- Simple, fun and easy to put down after a few minutes, like Catcha and Pocket Farm.
- Shot power is distance-relative: a comfortable swipe scores from anywhere.
- On the player's team only the controlled player can steal; AI teammates contest and block lanes.
- No mid-match save: pause while the page is alive, lose the match if the page is killed.
- Outdoor court. Dad plays; the rest of the family watches and cheers from the side.
- The other five players are variations of Dad: with or without a beard, with or without glasses, and so on.
- Two-minute matches with the simplified rules below.

## First-version rules

| Decision | Rule | Purpose |
| --- | --- | --- |
| Opponent | One human controlling a team against an AI team | The casual game before any multiplayer. |
| Match length | Two minutes of active play; higher score wins; ties allowed | A predictable short session, no overtime. |
| First possession | The player's team starts with the ball at the top of the arc | The first touch is always offence. |
| Scoring | One point inside the arc, two outside; the shooter's position at release decides | Familiar streetball scoring. |
| Buzzer | A shot released before the clock reaches zero counts if it goes in; the match ends when that ball settles | The last-second shot is the most exciting moment in the format. |
| Shared basket | Both teams attack the same hoop; no clearing the ball beyond the arc after a turnover or rebound | Continuous, understandable action. |
| After a basket | The other team restarts at the top of the arc after a brief automatic reset that spaces players | Readable changes of possession. |
| Out of bounds | The other team restarts at a marked point near where the ball went out | Boundaries matter without an inbound sequence. |
| No-calls | No fouls, free throws, shot clock, travelling or double dribble | Walking, jumping, dribbling and shooting stay playful. |
| Stealing | Sustained close guarding steals automatically. Every opponent can; on the player's team only the controlled player can | Defence uses existing movement, not another gesture, and needs the player. |
| Difficulty | One approachable AI setting | Tune one coherent experience before modes. |
| End of match | The shared result card with the score and a one-tap rematch | Reuse the arcade's result flow; one more match is one tap. |
| Interruptions | Pause play and the clock when hidden or blurred; resume where it stopped while the page is alive. Do not persist a match in progress | A two-minute match is cheap to lose if the OS kills the page; a mid-flight save/restore is not cheap to build. |

One court, fixed teams. Dad and two neighbourhood teammates play three neighbourhood opponents. Mom, the eldest daughter (`chibi-sibling-sample`) and the toddler (`chibi-toddler`) watch from the sideline and cheer: idle bounce and clapping, a jump-and-cheer on Dad's team's baskets, a groan on a steal against him. They are scenery with reactions, not players or physics bodies. The five other players are variants of Dad, built from `chibi-dad.glb` at load time, not new models. The file already separates what needs to vary: the glasses are their own mesh (`head-dad charcoal glasses`), and skin, hair, shirt, trousers and shoes each have their own material. Each variant picks:

- glasses on or off (hide the mesh);
- a beard or none: a small new beard mesh (stubble, short, full) parented to the head pivot so it follows the head, the only new geometry;
- skin tone and hair colour (material colour swaps);
- the team jersey colour (the shirt material) and shorts (the trousers material);
- a slight height and build change (scale within about ±8%, so silhouettes differ without breaking shared animation).

All six share Dad's rig, pivots and animations. The real Dad is the only player with his exact face (glasses, no beard, his skin and hair); no variant copies that combination, and the controlled player's ground ring does the rest. Team colour comes from jerseys. Progression, upgrades, online play, tournaments and more venues are out of scope.

## Controls and gesture ownership

Keep Pocket Farm's floating stick (`src/lib/games/farm/input.ts`): drag to walk, push past the rim to sprint, a quick tap that never steered or a second finger to jump. Passing and shooting take priority when their targets are touched.

Each touch is assigned to one action at touch-down, and never fires a second action on release:

1. **On the controlled player, with possession:** a possible shot. A swipe past the shot threshold launches on release. A tap that never passes the threshold jumps.
2. **On a teammate:** a pass during possession, or a switch of control otherwise. A drag past tap tolerance becomes movement anchored at the original touch; it must not also pass, jump or shoot.
3. **Anywhere else:** the existing stick and sprint. A quick tap that never steered jumps.
4. **A second finger** while the first holds movement follows the same priorities: a teammate passes, the controlled player starts a shot, empty court jumps. One-finger play supports every essential action by lifting the movement thumb first.

Character targets follow projected positions and are enlarged to at least 56 px for small screens. When targets overlap, the controlled player wins for a shot; among teammates, the nearest to the touch wins. Opponents are never targets. A shot touch is measured from its own origin even if the player then moves. `pointercancel`, `lostpointercapture`, blur and visibility changes cancel pending gestures, as the farm input already does. With no controllable possession, a touch on the controlled player is a jump, never a shot.

Shot and movement are told apart by where the touch starts, never by speed. A sprint never throws the ball.

**Reach (playtest check).** In a portrait view looking toward the hoop, the area under the rim is near the top of the screen, which a thumb on a large phone reaches poorly. Frame the court so the rim sits no higher than about a quarter of the way down the screen. If players still struggle to start shots near the rim, add a gentle vertical-only follow toward the carrier; never rotate the camera.

## Possession and player selection

A completed pass changes control at the catch, not at the release. Until then, control stays with the passer. After an interception or a missed pass, resolve actual possession before switching to offence.

On defence: when the opponent gains possession, select the player's teammate nearest the ball carrier once. Keep that selection until the player taps another teammate or possession changes; do not hop between defenders as distances change.

When the player's team secures a loose ball or rebound, control switches to whoever secured it. While the ball is loose, the controlled character can chase it and AI teammates chase too. Tapping a teammate without possession switches control instead of passing.

A held movement finger keeps steering the new player after a control change; otherwise the new player starts with neutral input. Clear pending shot, pass and guarding state tied to the old possession. Mark the controlled player with a readable ground ring.

## Automatic dribbling and stealing

Holding the ball always means dribbling: lower and slower when standing still, faster and out in front while moving, faster still while sprinting. Shot and pass wind-ups take the ball into the hands. The dribble is guided, not simulated: the ball's height follows a bounce curve timed to the hand and the walk cycle, with the floor contact driving the squash. Ordinary movement can never lose the ball.

Steal rule: a grounded defender facing the carrier within reach (start at 0.9 m), with no other player between them, builds a guarding meter. Fill time starts at 2 s. Out of reach, the meter drains at twice the fill rate; beyond twice the reach it resets. Jumping does not clear progress. Several defenders do not stack: the strongest eligible meter counts. A teammate standing between the defender and carrier blocks the meter, which makes a natural screen.

Show the meter as a small ring segment over the carrier while it builds. When full, play a short steal animation and transfer possession. Every opponent builds a meter; on the player's team only the controlled player does. AI teammates still guard: they shadow opponents, contest shots and can intercept passes by contact, but never steal from a dribble. Reach and timing are identical for every defender that can steal. After any catch or steal, the new carrier has 0.5 s of protection to prevent ping-pong. A pass clears the meter. A stationary carrier can still be robbed.

Contact with a dribbled ball does not bypass the meter. A released pass, a shot or a loose ball is different: anyone can intercept or recover it by physical contact.

## Shooting

Aim and power are separate, so the player has one thing to judge.

**Aim.** A swipe within 25° of the line from the shooter to the rim (in court space, mapped from the camera) is aimed at the rim, with the leftover angle kept as a small sideways error that can still rim out. A swipe outside that cone goes where it was swiped. No auto-aim on purpose: a sideways swipe is a bad shot, not a corrected one.

**Power.** Strength is one number, `s = travel × speed`, each normalized: travel by the viewport's shorter side, speed by elapsed time, so the same gesture behaves the same on every phone and frame rate. `s` is judged **relative to the shot the player is taking**: the game solves the launch velocity that drops the ball through the rim from the release point at a fixed arc, and scales it by `s / s_ideal`. The same comfortable swipe scores from anywhere, which is what a player learns in a casual game; it is still a physical shot that can fall short or clang off the back of the rim. A sweet band of about ±8% at the rim, narrowing to about ±5% beyond the arc, makes two-pointers harder. Tune `s_ideal` and the bands on real phones.

Minimum swipe travel to shoot: 24 px. No power meter and no release-timing minigame. Show the shot value (`+1`/`+2`) only after it scores.

**Release.** Ball release syncs with the hand. Every shot includes a small automatic shooting rise using the existing jump presentation, so no jump input is needed to score. A shot can also release during a second-finger jump.

## Passing, rebounds and physics

Passes aim at the receiver's catch point with modest lead on their motion. They fly through space and can be intercepted. Catching and loose-ball pickup are automatic for any eligible player within reach. AI teammates get open, move to catch passes and compete for rebounds.

**Physics.** No new dependency: the ball is the only dynamic body, and everything it touches is a simple shape. Hand-roll sphere collisions against the floor plane, backboard box, rim (a torus: distance to the ring circle), pole, and vertical capsules for players, on a fixed 120 Hz step with substeps when the ball is fast. A physics engine (Rapier and similar) adds hundreds of kilobytes of WebAssembly to the offline cache for one moving sphere. The net is animation only.

The ball is always in exactly one state: held, dribbling, in flight (pass or shot), loose, or resetting after a stoppage. In flight and loose, physics alone moves it; no animation pulls it toward a hand. A basket counts once, when the ball's centre crosses the rim plane downward inside the ring. Fast shots must not tunnel through the rim or backboard. Test glancing rim hits, backboard rebounds, floor bounces and out of bounds together.

Squash and stretch is visual only; the collision sphere never changes. Court artwork does not determine friction.

## Scale and starting numbers

The chibi characters are short and Catcha's jump is big (peak 1.5 units at 0.25 s, `characters.js`), so a regulation court and a 3.05 m rim would dwarf them. Build the court to the characters, not to regulation. Starting values, all tuning choices:

| Value | Start |
| --- | --- |
| Rim height | 1.8 × Dad's height (a jump reaches the rim for blocks, not for dunks) |
| Court | about 9 m wide × 8 m deep in court units scaled to the characters, arc at about 4.5 m |
| Ball diameter | about 0.4 × Dad's head height, enough to read at phone size |
| Match | 2:00 active play |
| Guarding | 0.9 m reach, 2 s fill, 2× drain |
| Protection after catch/steal | 0.5 s |
| Tap | under 250 ms and under the stick's 5 px deadzone (the farm input's values) |
| Shot | at least 24 px travel; aim cone ±25° |
| Character tap target | at least 56 px |

## Character and asset work

Dad is `static/catcha/assets/chibi-dad.glb`. Catcha's `characters.js` loads the family with arm, leg and head pivots and has shared walking, sprinting, jumping, leaning and squash; Pocket Farm's `input.ts` and `scene.ts` already carry those conventions over. Reuse that work. Inspect the model hierarchy before choosing rig changes; basketball may need extra elbow, wrist or hand pivots, not a new rig.

Add basketball actions around the existing locomotion: moving and standing dribble, receive, pass, shoot and follow-through, defensive stance, steal, and rebound/catch. Gameplay events and hand attachment points drive animation timing so the ball never visibly leaves early, clips through the hands or teleports on a catch.

Build one polished ball, hoop, backboard, net and half court. **Art direction:** an outdoor neighbourhood court at golden hour, with a sideline bench or kerb for the watching family. A textured asphalt surface gives the grit and wear the user asked for, painted lines read clearly, and Pocket Farm's outdoor lighting keyframes (`farm/juice.ts`) and blob shadows can be reused. The net reacts visibly to a basket; a lightweight animation is enough.

## Presentation, feedback and AI

Camera: a steady elevated view looking toward the hoop, framed for portrait with the full half court in view (see "Reach"). Characters, pass targets and the rim stay readable on a small phone. Keep the bottom of the screen clear for the thumb.

HUD: score, time left, pause, and the steal meter. Clear team colours and distinct silhouettes. The first match opens with a short contextual introduction (move, pass, shoot), shown once, not a tutorial screen. Passes, dribbles, rim hits, backboard hits, steals and baskets each have their own animation, sound and optional haptic, through the existing sound and haptic preferences.

AI teammates find space, offer for passes, chase loose balls and defend after a turnover. Opponents pressure the carrier, pass and shoot. Everyone obeys the same physics; the steal rule is as above. The sideline family reacts to baskets, steals and the final buzzer, with a bigger cheer when Dad scores himself. Lightweight steering and decision timing; no plays, tactics or player stats. Tune the AI to leave readable openings rather than swarm the carrier.

## Existing-app integration

Build inside the Svelte/Three.js arcade, following Pocket Farm's layout (a Svelte shell, an independent model, a disposable scene, the input module). Add a home-screen entry and route, follow existing settings conventions, precache assets for offline play, and release resources on exit. Do not change Catcha or Pocket Farm behaviour; when sharing code (the stick, the jump), extract it rather than fork it, and keep the existing games passing their smoke checks.

Persist only preferences and, optionally, a win/loss tally. Target smooth phone play with six characters and one ball: shared geometry and materials, sensible textures, adaptive resolution before sacrificing input or physics. The builder reports the actual devices or browser conditions checked; a desktop preview cannot establish touch feel.

## Build sequence after approval

1. **Shootaround.** Dad, a ball and a hoop on a basic court, with the reused stick, sprint and jump. Dribbling, swipe shooting, collisions and scoring. Tune short, ideal and excessive swipes from several spots. Confirm movement and shot gestures never conflict. This slice decides whether the game is fun; judge it on a phone before going on.
2. Two teammates, tap to pass, control at the catch, loose-ball recovery.
3. The opposing team, guarding and steals, defensive selection, rebounds, the clock, buzzer and match rules.
4. Court art, basketball actions, net, audio, haptics, pause, result card, offline, phone verification.

## Acceptance checks

- One thumb can move, sprint, jump, dribble, pass, shoot, defend and finish a match; a second finger is optional.
- A movement drag or sprint never shoots; a pass never also jumps. Shot targets stay usable while characters move, including under the rim on a large phone.
- The same swipe behaves the same on representative portrait phone sizes; a comfortable swipe scores from different spots, harder swipes overshoot and weak swipes fall short.
- Pass control changes at the catch, passes can be intercepted, and the controlled player is always clear.
- Guarding gives readable warning and a real escape and cannot produce repeated instant steals. On the player's team, only the controlled player ever steals from a dribble.
- Dribbling looks attached to the moving character; squash and stretch recovers; released balls collide and rebound convincingly.
- A basket cannot double-count or count from below. Fast shots cannot pass through the rim or backboard. A shot released before the buzzer counts.
- Six players fit the portrait view with tappable teammates, useful spacing and readable team colours.
- A match ends on the result card, rematch is one tap, and hiding the page pauses it.
- Catcha and Pocket Farm keep their movement and input behaviour, and the new game works offline once cached.

## Decisions

Settled with the user on 26 October 2026: the other five players are variations of Dad; distance-relative shot power; only the controlled player steals for the player's team; no mid-match save; an outdoor court with Dad playing and the family cheering from the sideline; two-minute matches with the simplified scoring and restarts. Numeric values remain the builder's tuning choices.

Consequence for scope: the five other players are Dad variants (glasses on/off, beard or none, skin, hair, jersey, slight scale), so the new character art is a beard mesh and material swaps.

## Changes in this revision

- Shooting split into aim (a cone that snaps to the rim, keeping a small error) and one power number judged relative to the current shot, so one learned swipe works from anywhere.
- The court, rim and ball scaled to the chibi characters, with a starting-values table taken from the existing input and jump code.
- Added first possession, the buzzer-beater rule, the shared result card with rematch, and a thumb-reach check for shots under the rim.
- Dropped the resumable mid-match save: pause while alive, nothing persisted mid-match.
- Proposed hand-rolled ball physics instead of a physics engine dependency.
- An outdoor court that reuses the farm's lighting.
- Made the first build step a shootaround that decides whether the game is fun before the rest is built.
- Recorded the user's decisions: relative shot power, controlled-player-only steals for the player's team, no mid-match save, two-minute matches, and an outdoor court where Dad plays with neighbourhood teammates and opponents while the family cheers from the sideline.
- The five other players are variations of Dad (glasses, beard, skin, hair, jersey, slight scale) from the existing model, sharing its rig.

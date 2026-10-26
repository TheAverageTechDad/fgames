# Dad basketball — first design

Date: 26 October 2026.

Status: discussion draft for review. The agreed mechanics below are established; the explicitly labelled proposals remain recommendations. This document does not authorize implementation. The game has no final name yet.

## Intent

A good-looking, casual basketball game in the existing pocket arcade. Dad and two teammates play an opposing team of three on one half court. A match should be enjoyable during a short break, using a thumb in portrait orientation, with an optional second finger. The player moves, avoids defenders, passes, and judges shooting strength without managing a complicated control scheme or learning a full basketball ruleset.

The defining feature is the same as the other games: accessible touch controls and satisfying physical interactions. The ball, character animation, and court should make even a short session feel good.

## Established with the user

- Portrait presentation; primarily one-thumb play, with one or two fingers supported.
- Half-court 3v3, with Dad on the player's team and two other teammates. The other five players use AI whenever they are not under direct control.
- Reuse the existing walk, sprint, jump, and touch-control mechanics. Do not replace them with a new movement scheme.
- Moving while holding possession automatically dribbles the basketball. No separate dribble gesture. Include pleasing ball squash and stretch.
- Tap a teammate to pass. Control follows possession: when the teammate catches the pass, that teammate becomes the controlled player.
- Swipe toward the rim to shoot. Swipe speed and travel both contribute to strength; a swipe that is too fast or too long can overshoot.
- The proposed shooting gesture starts on the controlled player; dragging elsewhere uses the existing movement controls. The user accepted this as the starting approach, subject to how it feels in play.
- AI defenders can steal by remaining very close to the ball carrier for a few seconds. Moving away and passing are ways to escape the pressure.
- Ball physics must support bouncing and colliding with physically present objects.
- Give the court proper surface texture and markings, and give the models and overall presentation good visual quality.
- The intended experience is simple, fun, and easy to put down after a few minutes, like Catcha and Pocket Farm.

The user has not explicitly chosen the player's stealing action. Automatic stealing for both teams is the current recommendation, rather than a settled decision.

## Proposed first-version rules

These are assistant recommendations to make the draft complete and reviewable. They may be changed during design review.

| Decision | Proposed starting rule | Purpose |
| --- | --- | --- |
| Opponent | One human controlling a team against an AI team | Establish the casual game before considering multiplayer. |
| Match length | Two minutes of active play; higher score wins, ties are allowed | A predictable short session without compulsory overtime. |
| Scoring | One point inside the arc, two outside; shooter's position at release determines value | Familiar half-court scoring with few rules. |
| Shared basket | Both teams attack the same hoop; no requirement to take the ball back beyond the arc after a turnover or rebound | Keep the action understandable and continuous. |
| After a basket | Opposing team receives the ball near the top of the arc; a brief automatic reset spaces players safely | Make changes of possession readable. |
| Out of bounds | Other team receives possession at a safe marked restart point near where it went out | Physical court boundaries still matter without an inbound-control sequence. |
| Fouls and clock rules | No foul calls, free throws, shot clock, travelling, or double-dribble penalties | Walking, jumping, dribbling, and shooting remain playful. |
| Stealing | Sustained close guarding works automatically for either team | Defence uses existing movement rather than another gesture. |
| Difficulty | One approachable AI setting initially | Tune a coherent experience before adding modes. |
| Interruptions | Pause active play and the match clock when backgrounded; save a resumable local match | Support short visits and interruptions. |

The first version has one court and fixed teams. Exact teammate identities can use appropriate existing family models or modest visual variants; the builder may settle the roster without requiring new character customization. Dad must remain visually recognizable. Progression, upgrades, online multiplayer, tournaments, and multiple venues are outside this first design.

## Controls and gesture ownership

Keep the familiar floating movement control: drag to walk, push farther to sprint. Preserve the existing jump action through a quick unconsumed tap or an optional second finger. Passing and shooting take priority when their basketball targets are involved.

Each touch must be assigned to one action, without firing a second action on release:

1. A touch beginning on the controlled player's generous screen-space target reserves a possible shot while that player has possession. Swiping and releasing launches the shot. A simple tap there can retain the existing jump behaviour.
2. A touch beginning on an eligible teammate reserves team selection. A tap passes during possession or switches defenders during defence. A drag beyond the tap tolerance transitions to movement, using the original touch origin; it must not also pass, jump, or shoot.
3. A touch elsewhere uses the existing movement and sprint controls. A quick tap that never steers retains jump.
4. An optional second finger can tap a teammate, start a shot on the controlled player, or jump on unoccupied court space while the first finger holds movement. The same target priorities apply, so passing does not also jump. One-finger play must support every essential action by releasing movement before the next gesture.

Expand character touch targets for small screens without making them overlap arbitrarily. Prefer the controlled player for a shot when targets overlap; among teammates, prefer the closest visible target to the touch. Tune spacing, camera, and targets together so crowded positions remain usable. Character targets must follow their projected position.

Once a shot touch starts, track it against its original position even if the player subsequently moves. Cancelled touches, app switches, and lost touch capture cancel pending gestures cleanly. A shot requires meaningful displacement; tiny movement must not throw the ball accidentally. Starting a shot while there is no controllable possession cannot fire one.

Shooting and movement must be distinguishable by their starting targets, not by assuming that every fast movement gesture is a shot. A sprint must never throw the ball.

## Possession and player selection

A completed pass changes control at the catch, not when the ball leaves the passer. Until then, control stays with the passer. After an interception or missed pass, resolve actual possession before switching to offence.

Proposed defensive selection: when the opponent gains possession, select the player's nearest teammate to the opposing ball carrier once. Keep that selection until the player taps another teammate or possession changes; do not continually switch between defenders as their distances change.

When the player's team recovers a loose ball or rebound, control switches to the teammate who secures it. While the ball is loose, the current controlled character remains available to pursue it, and other teammates can pursue it through AI. Tapping a teammate while the player's team has no possession switches control instead of issuing a pass.

Maintain the player's current movement intention through a control change when a movement finger is still held. With no active movement touch, the new player begins under neutral input. Clear pending shot, pass, and guarding state tied to the previous possession so a held input cannot cause an accidental new action. Mark the currently controlled player clearly with a readable ground ring.

## Automatic dribbling and stealing

Dribbling follows movement automatically, and the player may also bounce or hold the ball naturally while stationary. Hand, ball, and foot motion must remain synchronized. Start with a guided dribble driven by the character's motion and a stable physical floor bounce; arbitrary simulation drift must not make ordinary movement lose the ball.

Proposed steal rule: a grounded, facing defender within a short reach of the ball carrier and with no obstacle between them accumulates guarding time. Start tuning around two seconds. A brief gap can decay progress quickly; fully escaping the reach resets the threat. Jumping does not instantly erase existing guarding progress and cannot become an unlimited defence against stealing.

Show a small, readable threat indicator while a defender is close enough to build a steal. Once it fills, perform a short, readable steal animation and transfer possession. Use the same range and timing rules for AI and human defenders. Multiple nearby defenders must not multiply the timer into an instant steal; use the strongest eligible guarding threat.

Proposed short protection after a catch or steal prevents immediate possession ping-pong; begin tuning around half a second. A pass clears the old carrier's guarding threat, but holding the ball indefinitely beside a defender must still be risky. A stationary carrier can be guarded and robbed.

Incidental contact with a controlled dribble does not bypass the guarding timer. A released pass, shot, or genuinely loose ball is different: opponents can intercept or recover it through physical contact without waiting for a steal timer.

## Shooting, passing, rebounds, and physical presence

Use an actual flight path and collision response for the released ball. Aim comes from the swipe direction, mapped consistently from the camera view to the court. Shot strength increases monotonically with normalized swipe travel and speed, allowing short shots and clear overshoots. Normalize against the playable viewport and use elapsed time so a familiar gesture behaves consistently across phone sizes and frame rates. Capacitive touch pressure is not required.

The builder may settle the strength curve, arc, and small amount of aim forgiveness during playtesting. Assistance must preserve the player's chosen strength and direction: bad swipes must be able to miss, and weak swipes must be able to fall short. There is no compulsory power meter or separate release-timing minigame.

Synchronize ball release with the hand animation. Existing jump mechanics remain usable; a shot can release during an existing jump when a second finger is used, but a separate jump input must not be necessary to score. The builder may add a small automatic shooting rise using the existing jump presentation if it improves one-thumb play.

Passes target a teammate's catch position, with modest prediction of their motion. They travel through space and can be intercepted; they do not teleport or pass through defenders. Catching and loose-ball pickup occur automatically when a reachable, eligible player secures the ball. AI supports open passing lanes, moves to catch passes, and competes for rebounds.

The floor, backboard, rim, and relevant court objects have physical presence. Character colliders prevent overlapping players and allow plausible interception or jumping blocks of a released ball. Keep colliders simple enough for reliable phone performance. Decorative details outside the action need no unnecessary simulation. The first court has no extra obstacle course inside its playing area.

Use one consistent ball state: controlled/held, guided dribble, released pass or shot, loose, or resetting after a stoppage. During released flight, stable physics owns ball movement; an animation must not also pull it toward a hand. A basket counts once when the ball crosses the hoop opening downward from above. Side or upward entry cannot score.

The builder chooses the collision implementation and fixed simulation step after inspecting the existing project. Fast shots must not tunnel through the rim or backboard. Exact gravity, friction, restitution, ball size, pickup reach, and arc are tuning choices. Test glancing rim hits, backboard rebounds, floor bounces, and out-of-bounds behaviour together.

Ball squash and stretch is visual: preserve the intended physical collision shape and restore the ball's shape after impact. Court roughness in the artwork does not automatically determine friction; tune appearance and play separately.

## Character and asset work

The current project already contains Dad at `static/catcha/assets/chibi-dad.glb`. Catcha's `characters.js` loads Dad with articulated arm, leg, and head pivots, and includes shared walking, sprinting, jumping, leaning, and squash behaviour. Pocket Farm's `input.ts` explicitly carries over the same control conventions.

Reuse that work. Inspect the model hierarchy and source assets before choosing any rig changes. Basketball may require extra elbow, wrist, or hand articulation for convincing handling; do not assume a complete model replacement or a skeletal-rig rebuild is necessary.

Add basketball actions around the existing locomotion: moving and stationary dribbles, receiving a pass, passing, shooting and follow-through, defensive stance, stealing, and rebound/catch reactions. Existing jumping supports airborne actions. Gameplay events and hand attachment points must drive animation timing so the physical ball never visibly detaches early, clips through the hands, or teleports on a catch.

Build one polished ball, hoop, backboard, net, and half court. Give the floor visible material grain or grit, subtle wear, and clearly drawn boundaries and scoring lines. Settle indoor wood versus outdoor textured surfacing as an art-direction choice; a cohesive court matters more than adding venues. Use shadows and restrained lighting to ground the characters and ball. The net should visibly react to a made basket; a lightweight animation is sufficient.

## Presentation, feedback, and AI

Proposed camera: a steady elevated view looking toward the hoop, framed for portrait play with the full half court visible. Characters, passing targets, and the rim must stay readable on a small phone. Avoid frequent camera rotation or dramatic moves that disrupt aiming. Leave useful action above the thumb and keep the bottom movement area clear.

Show only the score, remaining match time, pause control, and necessary player/steal feedback. Use clear team colours and distinguishable character silhouettes. A short contextual introduction can demonstrate movement, a pass, and a shot without a long tutorial. Make passes, dribbles, rim hits, backboard hits, steals, and baskets feel distinct through animation, sound, and existing optional haptics. Use existing sound and haptic preferences.

AI teammates seek useful space, offer passes, move toward loose balls, and defend when possession changes. Opponents pursue the carrier, maintain guarding pressure, pass, and shoot. They obey the same ball physics and steal rules. The builder chooses lightweight steering and decision timing; elaborate tactics, play calling, and individual player statistics are unnecessary. Tune AI to leave readable opportunities rather than surrounding the carrier constantly.

## Existing-app integration and delivery boundaries

Build within the existing Svelte/Three.js arcade, reusing shared behaviour where practical. Add a home-screen game entry and its own route, follow existing settings conventions, bundle required assets for offline availability, and release game resources when leaving. Reuse should not change Catcha or Pocket Farm's existing behaviour.

Save only what the interruption experience needs: score, active time remaining, teams, player positions, possession, and enough ball state to resume predictably. If interrupted during ball flight, pause and restore the ball rather than silently awarding a basket or turnover. No accounts or backend are required for this proposal.

Target smooth phone play with six characters and one ball. Reuse geometry and materials where appropriate, keep texture sizes sensible, and adapt rendering quality before sacrificing responsive input or physics consistency. The builder should report the actual devices or browser conditions checked; a desktop preview alone cannot establish phone touch feel.

## Suggested build sequence after design approval

This is a sequence for validating the design, not the detailed implementation plan.

1. Inspect and reuse the existing Dad articulation, movement, sprint, jump, and input. Put Dad on a basic half court with a ball and hoop. Confirm movement gestures and shot gestures never conflict.
2. Establish synchronized dribbling, swipe-controlled shooting, ball collisions, and reliable scoring. Tune short, accurate, and excessive swipes.
3. Add the two teammates, tapping to pass, control at the catch, and loose-ball recovery.
4. Add the opposing team, automatic guarding/steals, defensive selection, rebounds, and the short match rules.
5. Finish court materials, character basketball actions, net feedback, audio, haptics, pause/resume, offline integration, and phone verification.

Keep the first playable slice small enough to judge the actual feel before polishing all six characters and the environment. It must still reuse the established controls from the start.

## Acceptance checks

- One thumb can move, sprint, jump, dribble, pass, shoot, defend, and finish a match; a second finger is optional.
- A movement drag or sprint never launches a shot; a pass never also jumps. Shot targets remain usable while characters move.
- The same swipe behaves consistently across representative portrait phone sizes; faster or longer swipes can overshoot and weak swipes can fall short.
- Pass control changes at the catch, defenders can intercept, and the new controlled player is always clear.
- Guarding gives readable warning and a genuine escape opportunity, follows the same rules for both teams, and cannot create instant repeated steals.
- Dribbling looks attached to the moving character, squash and stretch recovers, and released balls collide and rebound convincingly.
- Scoring cannot double-count a bounce or accept entry from below. Fast shots cannot pass through physical court objects.
- Six players fit the portrait view with tappable teammates, useful spacing, and readable team colours.
- A short match ends cleanly; pausing, backgrounding, resuming, and leaving the game preserve the intended experience.
- Existing games keep their movement and input behaviour, and the new game works offline after its assets have been cached.

## Decisions still requiring design review

The user has established the controls, possession-following selection, automatic dribble, physical ball, Dad reuse, and casual half-court format. Review the proposed automatic stealing for the human player, defensive selection, two-minute matches, simplified scoring/restarts, and art-direction defaults before approving this document. Numeric balance values remain builder tuning choices.

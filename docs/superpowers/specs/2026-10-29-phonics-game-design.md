# Phonics reading game — first design

Date: 29 October 2026.

Status: direction settled with the user (see "Established with the user"); everything under "My calls" is open to change. No final name; working title **Sound It Out**, route `/phonics`.

## Intent

A new game in the pocket arcade that helps children read words confidently by sounding them out, the way UK schools teach it (systematic synthetic phonics). Children arrive knowing the letter sounds ("sss", not "ess"). This game is the next step: blend those sounds into words, then read new words without guessing.

The heart of it is the blending slider from the Readino clip the user shared: a short word, a mark under each sound, and a handle the child drags along. Each sound plays as the handle passes it, so a slow drag says "s… a… t" and reaching the end says "sat". As with the other games, the touch has to feel lovely: every press, drag and success gets motion, sound and a little haptic.

## Established with the user

- UK phonics: pure sounds, never letter names, never an "uh" tacked on ("sss", not "suh").
- Builds on letter sounds the child already knows. The user's own child is in Reception and knows them.
- For every family that uses fgames, not only the user's: roughly ages 3½ to 7, a little younger and older too.
- Lives in fgames as its own tile.
- The core mechanic is the Readino-style blending slider.
- Sounds and words are generated with Google's Gemini speech model (`gemini-3.8-flash-tts`, the one in AI Studio).
- Success: a child looks at a word they haven't seen before, sounds it out, and says it.

## Goals, non-goals, anti-goals

Goals
- A child can play a round alone, without reading any instructions, after a parent has picked the starting point once.
- A round takes about three minutes and always ends happy.
- New sounds arrive in the order schools teach them, and a word only ever uses sounds the child has met.

Non-goals (for now)
- Speech recognition (the child reading aloud into the mic and being marked).
- Accounts, several child profiles on one device, a parent dashboard.
- Alternative spellings (Phase 5: ay, ou, ie, ea, split digraphs such as a-e) and sentences or books.

Anti-goals (a failure even if it works)
- Any letter name, or a sound with "uh" on the end.
- The picture showing before the word is read. Children must decode, not guess from the picture (UK phonics teaching is explicit about this).
- A word that uses a sound the child hasn't met yet.
- Anything that feels like failure: no red crosses, buzzers, lives or timers.
- Rude or awkward words that can turn up in phonics lists (tit, git, nob and the like).
- American spellings or pronunciation (mom, color).

## What the child sees: the Read card

Portrait, one hand, the same 460 px-wide shell and cream-and-ink toy look as the rest of the arcade.

From top to bottom:
1. **Header.** The round back button, a row of 8 progress dots that fill as words are read, and the sound switch.
2. **Mystery card.** A face-down card with a soft "?" pattern. It stays closed until the word has been blended.
3. **The word.** Lower case, very large (about 20% of the screen width, at most 112 px), in Andika, a font made for beginning readers with single-storey **a** and **g**. Andika is SIL OFL and gets bundled in `static/fonts` with its licence, like the arcade's other fonts; check the bundled build really draws single-storey a and g. Longer words shrink so they fit with a 16 px gutter on each side. Letters start slightly spread apart.
4. **Sound buttons.** The marks UK classrooms use: a dot under each one-letter sound and a short bar under each two- or three-letter sound (sh, ck, igh). Each has a hit area of at least 44 px.
5. **Blending rail.** A rounded track under the whole word with an arrow at the right end (the arrow teachers draw under words) and a round grape-coloured handle at the left.

### Interactions

- **Tap a sound button.** That sound plays. Its letters lift about 8 px and turn grape, the button squashes, and a light haptic fires; then they settle back with a small spring.
- **Drag the handle.** The handle follows the finger along the rail. As it reaches each sound's letters (measured against where they're drawn on screen), those letters light up grape, stay lit, and the sound plays, once per pass. A sound made of two or three letters lights as one. The rail fills behind the handle. Dragging back and passing a sound again plays it again. If a new sound starts while the last is still playing, the last one fades out over about 40 ms, so a quick drag runs the sounds together naturally. A flick that jumps past several sounds in one move lights them all but plays only the last. Sounds play through Web Audio from buffers loaded when the card opens, as Hoops does, so each one starts the instant its letters light. Haptics go through the shared `#lib/haptics`.
- **Let go before the end.** The handle springs back to the start in about 300 ms, the lit letters dim, and nothing is marked wrong.
- **Reach the end.**
  1. The letters slide together and close the gaps (staggered, about 250 ms).
  2. A short pause (about 0.6 s) gives the child a moment to say the word first.
  3. The word is spoken. The word does a small squash-and-hop, a small burst of sparkles goes up (`canvas-confetti`, already installed), a soft chime plays (the shared `sound.ts` tones), and the success haptic fires.
  4. The mystery card flips to the picture (scales 0.6 → 1.05 → 1 with a slight tilt that settles).
  5. A speaker button appears next to the word, and a big mint **Next** button pops in.
- **After reading.** Tapping the word or the speaker says it again. The speaker never appears before the first blend, so hearing the word can't replace reading it.
- **Words with no picture** (it, in, an) get a bigger sparkle burst instead of a flip.
- **Reduced motion.** When the device asks for reduced motion, every move becomes a fade and confetti is skipped.
- **Sound off.** If the arcade's sound switch is off, a tip with a one-tap switch shows on the card. Without sound the game doesn't work.

### Round end

After 8 words, a card shows the pictures of the words read in that round. Tapping one says its word again. Dad's existing Catcha praise recordings play (Excellent, Wonderful, Brilliant), and the set's stone on the map gains a star. Buttons: **Again** and **Map**.

## Progression: the sound map

A path of stepping stones, one per set of new sounds, in the order the DfE-validated programmes broadly share (Letters and Sounds, Little Wandle). Small differences between school programmes don't matter, because a word only uses sounds from its own set and earlier ones.

| Stage | Sets (one stone each) | Words like |
| --- | --- | --- |
| 1 · Phase 2 | s a t p i n · m d g o · c k ck e u r · h b f l ff ll ss | sat, pin, dog, duck, bell |
| 2 · Phase 3 | j v w x · y z zz qu · ch sh th ng nk · ai ee igh oa · oo oo ar or · ur ow oi ear · air er | jam, fox, ship, rain, moon, star |
| 3 · Phase 4 | adjacent consonants, one stone per pattern: cvcc · ccvc · longer | tent, frog, stamp |

- Schools teach s a t p, then i n, a week or so apart, but four letters make only a handful of words (at, sat, pat, tap), so the first stone holds all six. The clip's words (sap, pit, in, an) come from exactly these.
- Every stone is open. Tapping a stone starts a round of 8 words from that set, shuffled with no repeats, topped up from earlier sets when a set is small. On a first visit the map opens at stone 1. A one-line note for parents says to tap the stone that matches what their child is learning at school, so no separate settings screen is needed.
- A stone gets a star for each round finished, up to 3. Progress is saved on the device (`localStorage`, `phonics_progress_v1`), like the other games.

## Words, pictures and sounds

**Word lists.** One hand-written file, `src/lib/games/phonics/words.ts`. Each word has its text, its split into sounds (`ch|i|ck`), its set, and an optional emoji. A piece can name its sound when its spelling has two (th in *this*, oo in *book*). Each set has about 12 to 24 words, mostly ones that can be pictured. A unit test checks that:
- each word's pieces join back into the word;
- every piece is taught in the word's set or earlier;
- every piece has a sound file;
- no word is on the banned list.

**Pictures.** The device's own emoji (🐱 cat, 🐷 pig, ☀️ sun, 🚌 bus), drawn very large. They're free, offline and instant. They'll look a little different on iPhone and Android, which is fine. Bundling Noto Emoji is the upgrade if that ever matters.

**Sound files.** One file per sound and one per word, all `.m4a` like the arcade's other audio:
- `static/phonics/audio/sounds/{id}.m4a`: about 44 sound ids. Spellings that make the same sound share a file (c, k and ck all use `k`; ff uses `f`; ll uses `l`; ss uses `s`). Sounds that need it get their own id: `th` (thin) and `dh` (this), short `oo` (book) and long `oo` (moon).
- `static/phonics/audio/words/{word}.m4a`

Both folders are precached for offline play, like Hoops' audio.

**Making the sounds** (a dev-time job; nothing calls Gemini while a child plays). `scripts/phonics-voice.mjs` calls `gemini-3.8-flash-tts` with `GEMINI_API_KEY` from the environment (the user creates the key in AI Studio) and one British voice used for everything. The user picks that voice by ear from short samples of three or four British-sounding candidates.
- **Words:** one take each, with a warm, clear style direction ("a friendly British primary teacher, saying one word clearly").
- **Sounds:** four takes each, with a style direction naming the pure sound and an example word ("only the sound /s/ as in sun, held, no vowel after it"). The takes go to a review folder, and the user listens in Finder with Quick Look and deletes the bad ones.
- **Encoding:** the script then trims silence, evens out the loudness and encodes the first surviving take to `.m4a` with ffmpeg.
- **Fallback:** any sound Gemini can't do cleanly (the quick stops p, t, k, b, d, g are the likely trouble) is recorded by the user, using the Oxford Owl phonics audio guide as a by-ear reference, and dropped in under the same name. No code changes.

**Until the real sounds exist,** placeholder audio comes from the Mac's British voice (`say -v Daniel`). Its single sounds will often be wrong; they're only there to test the feel of the interactions. The tile stays off the home screen until the user has approved the real sounds, so no other family hears a wrong "suh". The user reaches the game directly at `/phonics`.

## Build order

1. **The Read card.** A dozen set-1 and set-2 words with placeholder audio, at `/phonics`, hidden from home. All the interactions, motion, sound and haptics above. Deployed for the user to try on their iPhone.
2. **Real sounds.** The Gemini script, the user's pick of takes, and recordings for any gaps.
3. **The whole game.** The full word lists for stages 1 to 3, the sound map, rounds, round end and saved progress.
4. **The home tile.** Poster art, plus offline precache checked.
5. **Next activity: Pick.** The child hears a word and taps it among three written words that differ by one sound (pin / pit / tin). A wrong tap wiggles the card and says the word again; a right one lifts, glows and sparkles.

Later ideas, not planned: Build a word (spelling by dragging letters into slots), Real or alien (nonsense words sorted into a treasure chest or a bin, as in the Year 1 phonics check), tricky words (the, to, I, go), stretchy sounds that hold while the finger rests ("sssss"), parents recording sounds in their own voice, and Phase 5 spellings.

## My calls

These are the decisions I made on the user's behalf; any can change:
- the working title and route;
- 8 words per round, every stone open (no locking), and s a t p i n together on the first stone;
- the 0.6 s pause before the word is spoken;
- the handle springing back on an early release;
- the speaker button hidden until the first blend;
- emoji for pictures, Andika for the word font;
- one Gemini voice for everything;
- the build order, with Pick as the second activity.

## Left to the builder

Exact timings and easing, colours within the arcade palette, sizes within the stated minimums, the stepping-stone art and the take-review mechanics.

## Verify

`pnpm check`, the word-list test, a build and deploy, then the user plays it on their iPhone.

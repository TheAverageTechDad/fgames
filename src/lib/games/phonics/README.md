# Sound It Out

Working title for the phonics reading game. Build step 1, the Read card: rounds of 8 words from the first stone (s a t p i n). Open `/phonics`; it has no home tile until the real sounds are approved. Design: `docs/superpowers/specs/2026-10-29-phonics-game-design.md`.

- `words.ts`: the sets in school order, the words split into sounds (`ch|i|ck`, `th:dh|i|s`), the banned list and `round()`. `words.test.ts` checks every spelling is taught, every audio file exists and no banned word slips in.
- `audio.ts`: decoded buffers for instant playback, each clip fading the last over ~40 ms, the word chime and Dad's praise (Catcha's recordings). Follows the arcade's mute switch.
- `ReadCard.svelte`: one word. Sound buttons (dot per sound, bar for two-letter sounds), the blending rail (drag, or ArrowRight on the handle) ending in a goal ring, the join, a 0.6 s beat, the spoken word, then the card turns and the picture develops out of a blur with a shine, and Next. An idle handle nudges itself after 3.5 s.
- `PhonicsGame.svelte`: the shell: back, 8 progress dots, the sound switch, the round-end card.

Audio in `static/phonics/audio`, all one Gemini 3.8 Flash TTS voice (Fola, AI Studio): `sounds/{id}.m4a` (s a t p i n, from one batched request) and `words/{word}.m4a` (two batched requests with a warm "you read it!" style). Batches are cut at their silences, peak-normalised and checked with Whisper. Replace any file under the same name; no code changes.

Pictures in `static/phonics/pictures/{word}.webp` (and `star.webp` for words with none): Image Playground, Illustration style, "…centred, filling the picture, on a plain pale cream background, simple children's picture book", captured at 2x, the app's rounded corners cropped off, 480 px WebP. Font: Andika Bold, Latin subset, `static/fonts`.

Verify: `pnpm check`, `npx vitest run src/lib/games/phonics`, `pnpm build`.

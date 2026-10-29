# Sound It Out

Working title for the phonics reading game. Build step 1, the Read card: rounds of 8 words from the first stone (s a t p i n). Open `/phonics`; it has no home tile until the real sounds are approved. Design: `docs/superpowers/specs/2026-10-29-phonics-game-design.md`.

- `words.ts`: the sets in school order, the words split into sounds (`ch|i|ck`, `th:dh|i|s`), the banned list and `round()`. `words.test.ts` checks every spelling is taught, every audio file exists and no banned word slips in.
- `audio.ts`: decoded buffers for instant playback, each clip fading the last over ~40 ms, the word chime and Dad's praise (Catcha's recordings). Follows the arcade's mute switch.
- `ReadCard.svelte`: one word. Sound buttons (dot per sound, bar for two-letter sounds), the blending rail (drag, or ArrowRight on the handle), the join, a 0.6 s beat, the spoken word, the picture flip and Next. An idle handle nudges itself after 3.5 s.
- `PhonicsGame.svelte`: the shell: back, 8 progress dots, the sound switch, the round-end card.

Audio in `static/phonics/audio`: `sounds/{id}.m4a` (s a t p i n, one Gemini 3.8 Flash TTS take) and `words/{word}.m4a` (placeholders from the Mac's `say -v Daniel`). Replace any file under the same name; no code changes. Font: Andika Bold, Latin subset, `static/fonts`.

Verify: `pnpm check`, `npx vitest run src/lib/games/phonics`, `pnpm build`.

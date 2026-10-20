# Fix report implementation

The October 20 report is implemented in the existing Svelte games. The Three scene, nut motion and Escape solver were retained.

| Report area | Result |
| --- | --- |
| B1: numbering | All difficulties start at 1; the replacement library has versioned progress. |
| B2–B3: level generation and repeats | 800 bundled JSON puzzles; unique layouts, exact stored solutions, validated ranges and increasing move counts. No generation runs in the app. |
| B4: hint pot | One saved pot for each game, shared across levels and difficulties. |
| B5: navigation | Home, difficulty and play routes; browser back and refresh work. App back buttons respect the entry path. |
| B6: debug exposure | Production query shortcuts are ignored. The scene is no longer exposed on window. Legal level selection is clamped to unlocked progress. |
| B7: haptics | Catcha's two modules are vendored; named patterns and a real saved setting. Safari support remains OS dependent. |
| B8: double selection | Four large difficulty buttons each trigger one selection and neutral tick. |
| B9: rendering | Camera uses actual bolt bounds; merged reusable geometry, blob shadows, adaptive graphics policy and no preserved drawing buffer. The scene runs in a worker on supported browsers. Escape fills the available square space. |
| B10: move guards | Nuts unlocks after the final landing; Escape locks during snapping and departure, guards pointer identity and cancels safely. |
| B11: capacity | Transfer rules, hint solver and win checks read the level capacity. |
| Group moves | The full matching group that fits transfers with a short stagger; Undo reverses the group. |
| Controls and copy | One gear per screen; Restart at the bottom; no in-game level arrows, fake badges or offline pill; consistent “red car” and “+1 Bolt”. |
| Visual design | Shared cream/candy tokens, bundled Luckiest Guy and Lilita One, Phosphor sticker icons, real gameplay card captures and board previews. |
| Sound | Soft pentatonic tones, ratchet clicks, landing tocks, blocker bumps, horn/whoosh and completion chimes. |
| Transitions and results | Short screen entrances, one result card with moves versus optimum, Next and Replay, car departure before the card. |
| Guided play | The first two moves on first entry are marked on each game board; help remains available from difficulty selection. |

## Verification

`pnpm test` replays all 800 stored solutions and checks layout uniqueness, difficulty ranges and legal moves. Browser smoke checks play the first stored solution in all eight game/difficulty combinations and check replay, fresh numbering, back/refresh, persistent hints, camera bounds and offline route reloads.

Mobile review sizes are 390 × 844 and 375 × 667, including Extra Hard with the extra bolt. Desktop review uses 1024 × 900.

Physical iPhone Safari, iPhone home-screen install and cheap Android checks have not been run here. Haptic feel, actual device frame rate and browser gesture behaviour must not be represented as physically verified. The vendored Safari haptic workaround is restricted on some newer iOS releases.

Items explicitly marked “Later” in the report (hidden nuts, statistics and game-specific settings) remain outside this release.

Release verification: 21 unit tests passed; all eight production browser journeys passed with `FGAMES_STRICT_PERF=1` and no startup tasks above 50 ms. Offline reload and offline hints passed. Service-worker registration runs once through the root layout, which handles expected offline update failures. Both the background renderer and the main-thread fallback passed rapid-tap guards, Next and Level 2 reload checks. The deterministic design scan returned no findings; no suppressions were added.

The measured startup results are stored in `verification/browser-smoke.json`.

# Pocket Farm verification

20 October 2026, after the isometric polish pass on top of the Codex scaffold.

| Check | Result |
| --- | --- |
| `pnpm check` | 0 errors, 0 warnings |
| `pnpm test` | 39 Vitest tests (18 farm model/save) and 60 Catcha node tests pass |
| `pnpm build` | Static build written; `/farm` prerendered and precached by the offline worker |
| `node scripts/farm-smoke.mjs` against `vite preview` | Pass, no page errors, no failed requests |

The smoke run, in headless Chromium at 390×844 with touch:

- A real one-thumb drag moves her; touch cancellation releases movement.
- Seeds (9, one per empty spot) → planting → 8 s growth → harvest (stops at 24, leaving the last plant ripe) → SELL → queued shoppers buy and pay per item → coins banked → standing on the price tile buys the cucumber field → reload restores two fields and the wallet with no second charge.
- Back to the arcade tears the renderer down; relaunching from the Pocket Farm card gives one canvas and keeps the mute setting.
- 390×844, 375×667 and 1024×900 keep the portrait shell upright and within the viewport, with no horizontal scroll.

Reviewed by eye in the dev build at 375×812: the opening view, a mid-game field with a carried stack, the purchase tile and its reveal, ripe cucumbers, and the carrying pose.

Not verified here: a physical iPhone (haptics use the shared module's Safari switch fallback, which depends on the iOS version), frame rate on older phones, and sound balance.

## After the first phone playtest (same day)

`pnpm check` clean; `pnpm test` 42 Vitest tests (21 farm) and 60 Catcha tests pass; `pnpm build` and the farm smoke against `vite preview` pass with no page errors or failed requests. The smoke now also checks the purchase track and goal rewards, and walks at the load-dependent speed.

Reviewed in headless Chromium at 390×844: a fresh start, a three-field mid-game, night (`?time=0.78`), a shower (`?rain`), the centred pause dialog, and shoppers queueing with patience rings. The iOS top-inset fix uses an iOS-only CSS rule that desktop Chromium cannot exercise, so it still needs a look on the iPhone.

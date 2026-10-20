# Catcha

Copied from `~/AI Games/clean-up-chase` at `f8651ef` (2026-10-20). **This copy is canonical**; the
original repo stays live at clean-up-chase.pages.dev and only gets hotfixes.

- Route: `src/routes/catcha/+page.svelte` (boots `main.js`). Links in and out must be full page loads
  (`data-sveltekit-reload` / `location.href`): Catcha has no destroy, the reload is the cleanup.
- Assets: `static/catcha/assets/`, referenced as `/catcha/assets/...`.
- Tests: `node --test src/lib/games/catcha/tests/` (node:test, so vitest skips them).
- Changes from the original: asset URLs, share URL, and an "arcade" home button on the picker card.
- Not wired in fgames yet: Play Together (needs the `catcha-rooms` Worker behind `/api/room`) and
  analytics (`BUILD.commit` stays "dev", so it's off).

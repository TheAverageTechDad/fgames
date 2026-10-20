# fgames 🎮

Two offline puzzle games built with **SvelteKit 3**, **Svelte 5**, **Three.js**, and the **Web Audio API**. The app can be installed and played without a network connection after its first visit.

---

## 🕹️ Featured Games

### 1. Nuts & Bolts 3D (Screw Sort)
- **3D Visuals**: Interactive Three.js board with colorful nuts, metallic bolts, and lift and spin animations.
- **Gameplay**:
  - Color-matching sorting logic with undo stack, hint pathfinding solver, and extra bolt unlocking.
  - Deterministic levels across four difficulty tiers, generated through reversible moves so each puzzle can be solved.
  - Procedural sound synthesis (metallic clicks, thread unscrewing, satisfying stack thuds).

### 2. Escape (Traffic Rush Hour)
- **Pixel-crisp 2D Assets**: Clean top-down toy vehicles with subtle shadows, headlights, and directional indicators.
- **Gameplay**:
  - Unblock the red hero car to escape the grid through the exit gate.
  - Interactive BFS solver providing real-time hints and optimal move sequences.
- The board scales to narrow phones and vehicles also support arrow-key movement.
  - Procedural level generator ensuring every level has a guaranteed valid, non-trivial solution.

---

## 📱 Progressive Web App (PWA)

- **Installable**: Full web app manifest with custom responsive icons (192px, 512px, maskable, Apple touch icon).
- **Offline after first visit**: The Service Worker caches the app shell, locally hosted fonts, game assets, and vehicle sprites. Navigations use the latest version when online and the cached shell when offline.
- **Mobile First**: Touch-optimized controls, haptic vibration support, and responsive layouts.

---

## 🚀 Tech Stack

- **Framework**: [SvelteKit 3](https://svelte.dev/) + [Svelte 5](https://svelte.dev/) (Runes mode)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **3D Graphics**: [Three.js](https://threejs.org/)
- **Audio**: Web Audio API (Synthesizer & procedural sound effects)
- **Testing**: [Vitest](https://vitest.dev/)
- **Deployment**: [Cloudflare Pages](https://pages.cloudflare.com/)

---

## 🛠️ Development

```bash
# Install dependencies
pnpm install

# Start local dev server
pnpm dev

# Run unit tests
pnpm test

# Typecheck
pnpm check

# Build for production
pnpm build

# Preview production build
pnpm preview
```

## Deployment

Build and publish to the existing Cloudflare Pages project on the active Wrangler account:

```bash
pnpm build
pnpm dlx wrangler@latest pages deploy build --project-name fgames
```

---

## 📄 License

MIT

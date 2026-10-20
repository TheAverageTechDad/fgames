# fgames 🎮

A collection of polished offline puzzle games built with **SvelteKit 3**, **Svelte 5**, **Tailwind CSS v4**, **Three.js**, and modern **Web Audio API**. Designed as an installable Progressive Web App (PWA) with full offline precaching.

---

## 🕹️ Featured Games

### 1. Nuts & Bolts 3D (Screw Sort)
- **3D Physics & Visuals**: Fully interactive Three.js 3D board with metallic & matte nuts, realistic helical screw threads, chamfered hexagonal geometry, and smooth lift/spin animations.
- **Gameplay**:
  - Color-matching sorting logic with undo stack, hint pathfinding solver, and extra bolt unlocking.
  - Procedurally generated, deterministic levels across multiple difficulty tiers (Easy, Medium, Hard, Expert).
  - Procedural sound synthesis (metallic clicks, thread unscrewing, satisfying stack thuds).

### 2. Escape (Traffic Rush Hour)
- **Pixel-crisp 2D Assets**: Clean top-down toy vehicles with subtle shadows, headlights, and directional indicators.
- **Gameplay**:
  - Unblock the red hero car to escape the grid through the exit gate.
  - Interactive BFS solver providing real-time hints and optimal move sequences.
  - Special abilities: **Unstoppable Car** booster to smash blocking obstacles.
  - Procedural level generator ensuring every level has a guaranteed valid, non-trivial solution.

---

## 📱 Progressive Web App (PWA)

- **Installable**: Full web app manifest with custom responsive icons (192px, 512px, maskable, Apple touch icon).
- **100% Offline**: Built-in Service Worker precaches all application bundles, fonts, static assets, and vehicle sprites using a Cache-First strategy.
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

---

## 📄 License

MIT

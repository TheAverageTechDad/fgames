/** Graphics policy only: no scene, gameplay clock, device-model guesses or gameplay RNG. */
export const GRAPHICS_KEY = "cuc-graphics-v1";
export const GRAPHICS_MODES = [
  { id: "auto", name: "Auto", lines: ["Sharp and smooth", "Adjusts as you play"], ratio: 2, pixels: 3000000, shadow: 1024, shadowHz: 30 },
  { id: "battery", name: "Battery Saver", lines: ["30 fps, softer scene", "Runs cool"], ratio: 1.5, pixels: 1500000, shadow: 1024, shadowHz: 15, fps: 30 },
  { id: "high", name: "High", lines: ["Sharper scene", "Fixed quality"], ratio: 2.5, pixels: 4500000, shadow: 1536, shadowHz: 30 },
  { id: "ultra", name: "Ultra", lines: ["Maximum detail", "Uses more power"], ratio: 3, pixels: 6000000, shadow: 2048, shadowHz: 30 },
];
export const graphicsMode = (id) => GRAPHICS_MODES.find((m) => m.id === id) ?? GRAPHICS_MODES[0];
export function createGraphicsPolicy(storage = null) {
  let id = "auto";
  try { id = graphicsMode(storage?.getItem(GRAPHICS_KEY)).id; } catch { /* private mode */ }
  let ratio, fps = 0, sum, frames, slow, fast, warmup, cooldown;
  function reset() { ratio = graphicsMode(id).ratio; sum = frames = slow = fast = 0; warmup = 3000; cooldown = 0; }
  reset();
  return {
    get mode() { return graphicsMode(id); },
    get fps() { return fps; },
    setMode(next, persist = true) {
      id = graphicsMode(next).id; reset();
      if (persist) try { storage?.setItem(GRAPHICS_KEY, id); } catch { /* private mode */ }
      return id;
    },
    dimensions(width, height, dpr = 1) {
      width = Math.max(1, width); height = Math.max(1, height);
      dpr = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
      // Native UI, bounded GPU allocation on very large screens. Scene has its own target.
      const screenRatio = Math.min(dpr, 3, Math.sqrt(6000000 / (width * height)));
      const sceneRatio = Math.min(screenRatio, ratio, Math.sqrt(graphicsMode(id).pixels / (width * height)));
      return { screenRatio, sceneRatio, screenWidth: Math.max(1, Math.floor(width * screenRatio)),
        screenHeight: Math.max(1, Math.floor(height * screenRatio)),
        sceneWidth: Math.max(1, Math.floor(width * sceneRatio)), sceneHeight: Math.max(1, Math.floor(height * sceneRatio)) };
    },
    /** Sustained slow play steps down; sustained spare time recovers. Manual modes stay fixed. */
    sample(ms, active = true) {
      if (!Number.isFinite(ms) || ms < 4 || ms > 100) { sum = frames = slow = fast = 0; return false; }
      sum += ms; frames += 1;
      if (!active) { slow = fast = 0; warmup = 3000; }
      else { warmup = Math.max(0, warmup - ms); cooldown = Math.max(0, cooldown - ms); }
      if (sum < 1200) return false;
      const average = sum / frames;
      fps = Math.round(1000 / average); sum = frames = 0;
      if (id !== "auto" || !active || warmup || cooldown) { slow = fast = 0; return false; }
      slow = average > 22 ? slow + 1 : 0;
      fast = average < 18 ? fast + 1 : 0;
      // Never above the mode's own ratio: a fast phone would otherwise climb to 2.5× and just run hot.
      const next = slow >= 2 ? Math.max(1.25, ratio - .25) : fast >= 6 ? Math.min(graphicsMode(id).ratio, ratio + .25) : ratio;
      if (next === ratio) return false;
      ratio = next; slow = fast = 0; cooldown = 3000;
      return true;
    },
  };
}

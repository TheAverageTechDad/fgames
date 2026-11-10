/**
 * The HUD: the one screen, drawn into the canvas (M4.2a moved it out of `studio.js`).
 *
 * Every readout, bar, crosshair and flash goes through `__studio.hud`, which paints a 2D canvas
 * and composites it as ONE quad over the world after each render. It is tagged `hud`, counted
 * once, and part of capture() — so the judge's picture is the user's picture. DOM UI is invisible
 * to the canvas capture, and two builders who each learned that once painted their own HUD quads;
 * the user got three.
 *
 * It lives here, beside `studio.js`, because it is the only part of the contract that needs
 * three: the contract itself must be importable by a game with no import map, another version of
 * three, or no three in its graph at all, and `studio.js` reaches this file through a dynamic
 * import the first time a game actually draws a HUD item. It is a CONTRACT FILE and ships with
 * every shape: withholding it would leave a bundled game with a dynamic import of a file that is
 * not there, and Vite and Rollup both fail on an unresolvable static-literal dynamic import.
 */

import * as THREE from "three";

/** The screen flash fades by this factor per simulation step. */
const FLASH_DECAY = 0.86;

/** The font a text item is drawn in unless it names its own. */
const HUD_FONT = "ui-sans-serif, system-ui, sans-serif";
/** The resolution the HUD's sizes are written for; larger screens scale them up. */
const DESIGN_HEIGHT = 720;

/** The overlay: a 2D canvas as the texture of one full-frame quad, in its own orthographic scene. */
function createOverlay() {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const surface = document.createElement("canvas");
  surface.width = 2;
  surface.height = 2;
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.name = "studio-hud";
  quad.userData.tag = "hud";
  quad.frustumCulled = false;
  scene.add(quad);
  const overlay = { scene, camera, surface, texture: null, quad, scratch: document.createElement("canvas"), flashed: false };
  newTexture(overlay);
  return overlay;
}

/** The size to paint at: the renderer's drawing buffer, or the game canvas's own size without one. */
function drawingSize(deps) {
  const canvas = deps.canvas();
  const renderer = deps.renderer();
  if (renderer && typeof renderer.getDrawingBufferSize === "function") {
    const v = renderer.getDrawingBufferSize(new THREE.Vector2());
    return { width: Math.max(2, Math.round(v.x)), height: Math.max(2, Math.round(v.y)) };
  }
  return { width: Math.max(2, canvas?.width ?? 2), height: Math.max(2, canvas?.height ?? 2) };
}

function paintText(g, item, width, height, scale, cssScale) {
  const px = Math.round((item.size ?? 16) * (item.css ? cssScale : scale));
  g.font = `${item.weight ?? 600} ${px}px ${item.font ?? HUD_FONT}`;
  g.textAlign = item.align ?? "left";
  g.textBaseline = "top";
  if (item.shadow !== false) {
    g.shadowColor = "rgba(0,0,0,0.85)";
    g.shadowBlur = 2 * scale;
    g.shadowOffsetY = 1 * scale;
  }
  g.fillStyle = item.color ?? "#e8eef8";
  const lines = String(item.text ?? "").split("\n");
  // Optional chunky outline (`stroke`, `strokeWidth` in CSS px) and `rotate` (radians, about x/y).
  g.save();
  if (item.alpha !== undefined) g.globalAlpha = Math.max(0, Math.min(1, item.alpha));
  g.translate(item.x * width, item.y * height);
  if (item.rotate) g.rotate(item.rotate);
  if (item.letterSpacing !== undefined && "letterSpacing" in g) g.letterSpacing = `${item.letterSpacing * cssScale}px`;
  lines.forEach((line, i) => {
    if (item.stroke) {
      g.save();
      g.shadowColor = "transparent";
      g.strokeStyle = item.stroke;
      g.lineJoin = "round";
      g.lineWidth = (item.strokeWidth ?? 4) * cssScale;
      g.strokeText(line, 0, i * px * 1.25);
      g.restore();
    }
    g.fillText(line, 0, i * px * 1.25);
  });
  g.restore();
  g.shadowBlur = 0;
  g.shadowOffsetY = 0;
}

function paintBar(g, item, width, height) {
  const x = item.x * width;
  const y = item.y * height;
  const w = (item.w ?? 0.2) * width;
  const h = (item.h ?? 0.018) * height;
  g.fillStyle = item.back ?? "rgba(0,0,0,0.55)";
  g.fillRect(x, y, w, h);
  g.fillStyle = item.color ?? "#e8eef8";
  g.fillRect(x, y, w * Math.max(0, Math.min(1, item.fraction ?? 0)), h);
}

function paintCrosshair(g, item, width, height, scale) {
  const cx = width / 2;
  const cy = height / 2;
  const gap = ((item.gap ?? 4) + (item.spread ?? 0)) * scale;
  const len = (item.size ?? 10) * scale;
  g.strokeStyle = item.color ?? "#ffffff";
  g.lineWidth = (item.thickness ?? 2) * scale;
  g.beginPath();
  g.moveTo(cx - gap - len, cy);
  g.lineTo(cx - gap, cy);
  g.moveTo(cx + gap, cy);
  g.lineTo(cx + gap + len, cy);
  g.moveTo(cx, cy - gap - len);
  g.lineTo(cx, cy - gap);
  g.moveTo(cx, cy + gap);
  g.lineTo(cx, cy + gap + len);
  g.stroke();
  if (item.dot) {
    g.fillStyle = item.color ?? "#ffffff";
    g.fillRect(cx - 1 * scale, cy - 1 * scale, 2 * scale, 2 * scale);
  }
}

function paintItem(g, item, width, height, scale, cssScale) {
  if (item.type === "text") paintText(g, item, width, height, scale, cssScale);
  else if (item.type === "paint") {
    // Cosmetic batches paint into the same HUD texture, above the UI, without another overlay.
    g.save(); item.painter(g, width, height); g.restore();
  }
  else if (item.type === "image" && (item.image?.complete || item.image?.getContext) && (item.image.naturalWidth || item.image.width) > 0) {
    // An HTMLImageElement or an offscreen canvas (procedural icons).
    const image = item.image;
    const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
    const crop = item.crop ?? { x: 0, y: 0, w: 1, h: 1 };
    const sw = iw * crop.w, sh = ih * crop.h;
    const boxW = item.w * width, boxH = item.h * height;
    const fit = Math.min(boxW / sw, boxH / sh);
    const dw = sw * fit, dh = sh * fit;
    g.drawImage(image, iw * crop.x, ih * crop.y, sw, sh,
      item.x * width + (boxW - dw) / 2, item.y * height + (boxH - dh) * (item.alignY === "bottom" ? 1 : 0.5), dw, dh);
  }
  else if (item.type === "bar") paintBar(g, item, width, height);
  else if (item.type === "crosshair" && item.visible !== false) paintCrosshair(g, item, width, height, scale);
  else if (item.type === "panel" || item.type === "circle") {
    g.beginPath();
    if (item.type === "circle") g.arc(item.x * width, item.y * height, item.radius * cssScale, item.arc?.[0] ?? 0, item.arc?.[1] ?? Math.PI * 2);
    if (item.arc) g.lineCap = "round";
    else g.roundRect(item.x * width, item.y * height, item.w * width, item.h * height, (item.radius ?? 12) * cssScale);
    if (Array.isArray(item.fill)) {
      // Vertical gradient: [top, bottom].
      const top = item.y * height - (item.type === "circle" ? item.radius * cssScale : 0);
      const h = item.type === "circle" ? item.radius * cssScale * 2 : item.h * height;
      const grad = g.createLinearGradient(0, top, 0, top + h);
      item.fill.forEach((c, i) => grad.addColorStop(i / (item.fill.length - 1), c));
      g.fillStyle = grad;
      g.fill();
    } else if (item.fill) { g.fillStyle = item.fill; g.fill(); }
    if (item.stroke) { g.strokeStyle = item.stroke; g.lineWidth = (item.lineWidth ?? 2) * cssScale; g.stroke(); }
  }
}

/** A canvas-pixel box `[x0, y0, x1, y1]` an item can touch when painted (padded for strokes, shadows, glyph overhang). */
function boundsOf(g, item, width, height, scale, cssScale) {
  const pad = 3;
  if (item.type === "text") {
    const px = Math.round((item.size ?? 16) * (item.css ? cssScale : scale));
    g.font = `${item.weight ?? 600} ${px}px ${item.font ?? HUD_FONT}`;
    const lines = String(item.text ?? "").split("\n");
    let w = 0;
    for (const line of lines) w = Math.max(w, g.measureText(line).width + (item.letterSpacing ?? 0) * cssScale * line.length);
    const h = lines.length * px * 1.25 + px * 0.25;
    const left = item.align === "center" ? -w / 2 : item.align === "right" ? -w : 0;
    const e = (item.stroke ? (item.strokeWidth ?? 4) * cssScale / 2 : 0) + (item.shadow !== false ? 3 * scale : 0) + px * 0.15 + pad;
    const ox = item.x * width, oy = item.y * height;
    if (!item.rotate) return [ox + left - e, oy - e, ox + left + w + e, oy + h + e];
    const c = Math.cos(item.rotate), sn = Math.sin(item.rotate), xs = [], ys = [];
    for (const [x, y] of [[left - e, -e], [left + w + e, -e], [left - e, h + e], [left + w + e, h + e]]) { xs.push(ox + x * c - y * sn); ys.push(oy + x * sn + y * c); }
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  if (item.type === "panel" || item.type === "image") {
    const e = (item.stroke ? (item.lineWidth ?? 2) * cssScale : 0) + pad;
    const w = item.type === "panel" ? (item.w ?? 1) : item.w;
    const h = item.type === "panel" ? (item.h ?? 1) : item.h;
    return [item.x * width - e, item.y * height - e, (item.x + w) * width + e, (item.y + h) * height + e];
  }
  if (item.type === "circle") {
    const r = item.radius * cssScale + (item.stroke ? (item.lineWidth ?? 2) * cssScale : 0) + pad;
    return [item.x * width - r, item.y * height - r, item.x * width + r, item.y * height + r];
  }
  return [0, 0, width, height]; // bars, crosshair, custom painters: the whole screen
}
const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/** Copy one painted rectangle of the canvas into the already-uploaded texture (false: not possible, upload it all). */
function uploadRect(overlay, renderer, [x0, y0, x1, y1]) {
  const props = renderer?.properties?.get(overlay.texture);
  const gl = renderer?.getContext?.();
  if (!gl || !props?.__webglTexture || props.__version !== overlay.texture.version || !renderer.state?.bindTexture) return false;
  const w = x1 - x0, h = y1 - y0, scratch = overlay.scratch;
  scratch.width = w; scratch.height = h; // exact size: texSubImage2D uploads the whole source
  scratch.getContext("2d").drawImage(overlay.surface, x0, y0, w, h, 0, 0, w, h);
  const state = renderer.state;
  // through three's state: it caches unpack flags, and a flag changed behind its back flips its next upload
  const store = (key, value) => (state.pixelStorei ? state.pixelStorei(key, value) : gl.pixelStorei(key, value));
  state.bindTexture(gl.TEXTURE_2D, props.__webglTexture);
  store(gl.UNPACK_FLIP_Y_WEBGL, overlay.texture.flipY);
  store(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, overlay.texture.premultiplyAlpha);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, overlay.texture.flipY ? overlay.surface.height - y1 : y0, gl.RGBA, gl.UNSIGNED_BYTE, scratch);
  return true;
}

function newTexture(overlay) {
  overlay.texture?.dispose();
  overlay.texture = new THREE.CanvasTexture(overlay.surface);
  overlay.texture.colorSpace = THREE.SRGBColorSpace;
  // drawn 1:1 on screen: mipmaps would only cost a full rebuild on every upload
  overlay.texture.generateMipmaps = false;
  overlay.texture.minFilter = THREE.LinearFilter;
  overlay.quad.material.map = overlay.texture;
  overlay.quad.material.needsUpdate = true;
}

/**
 * Paint the HUD onto the overlay's canvas at the drawing size. Usually only the rectangles around
 * items that changed are cleared, repainted (every item crossing them, in order, clipped) and copied
 * into the texture: a draining bar or a popping banner costs its own patch, not a full-screen
 * repaint + upload (which on a 3× phone screen was enough to drop frames). A flash, a resize, a
 * custom painter or a change covering much of the screen repaints it all.
 */
function paint(overlay, items, state, deps) {
  const { surface } = overlay;
  const { width, height } = drawingSize(deps);
  if (surface.width !== width || surface.height !== height) {
    surface.width = width;
    surface.height = height;
    // WebGL texture storage keeps its initial dimensions. Recreate only the texture on resize.
    newTexture(overlay);
    state.full = true;
  }
  const g = surface.getContext("2d");
  const scale = Math.max(1, Math.min(width, height) / DESIGN_HEIGHT);
  const cssScale = height / Math.max(1, deps.canvas()?.clientHeight ?? height);
  const flashing = state.flashAlpha > 0.01;
  let rects = null;
  if (!state.full && !flashing && !overlay.flashed) {
    rects = [];
    for (const id of state.changed) {
      if (state.bounds.has(id)) rects.push(state.bounds.get(id));
      const item = items.get(id);
      if (item) { const b = boundsOf(g, item, width, height, scale, cssScale); state.bounds.set(id, b); rects.push(b); }
      else state.bounds.delete(id);
    }
    // merge touching patches; many patches or a big area → just repaint everything
    for (let merged = true; merged;) {
      merged = false;
      for (let i = 0; i < rects.length && !merged; i++) for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        if (a[0] <= b[2] + 8 && b[0] <= a[2] + 8 && a[1] <= b[3] + 8 && b[1] <= a[3] + 8) {
          rects[i] = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
          rects.splice(j, 1); merged = true; break;
        }
      }
    }
    rects = rects.map((r) => [Math.max(0, Math.floor(r[0])), Math.max(0, Math.floor(r[1])), Math.min(width, Math.ceil(r[2])), Math.min(height, Math.ceil(r[3]))])
      .filter((r) => r[2] > r[0] && r[3] > r[1]);
    const area = rects.reduce((sum, r) => sum + (r[2] - r[0]) * (r[3] - r[1]), 0);
    if (rects.length > 6 || area > width * height * 0.4) rects = null;
  }
  const renderer = deps.renderer();
  if (rects) {
    for (const r of rects) {
      g.save();
      g.beginPath(); g.rect(r[0], r[1], r[2] - r[0], r[3] - r[1]); g.clip();
      g.clearRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
      for (const [id, item] of items) {
        const b = state.bounds.get(id);
        if (b && overlaps(b, r)) { g.save(); paintItem(g, item, width, height, scale, cssScale); g.restore(); }
      }
      g.restore();
      if (!uploadRect(overlay, renderer, r)) overlay.texture.needsUpdate = true;
    }
  } else {
    g.clearRect(0, 0, width, height);
    state.bounds.clear();
    for (const [id, item] of items) {
      state.bounds.set(id, boundsOf(g, item, width, height, scale, cssScale));
      g.save(); paintItem(g, item, width, height, scale, cssScale); g.restore();
    }
    if (flashing) {
      g.globalAlpha = Math.min(1, state.flashAlpha);
      g.fillStyle = state.flashColor;
      g.fillRect(0, 0, width, height);
      g.globalAlpha = 1;
    }
    overlay.texture.needsUpdate = true;
  }
  overlay.flashed = flashing;
  state.changed.clear();
  state.full = false;
  state.dirty = false;
}

/**
 * Equality of two HUD items: arrays (gradient fills, arcs) element by element and small plain
 * objects (an image's `crop`) key by key. A fresh `{ crop: {...} }` every step used to count as a
 * change, so the start and end cards repainted and re-uploaded the whole screen every frame.
 */
function sameItem(a, b, depth = 0) {
  if (a === b) return true;
  if (depth > 2 || !a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((v, i) => sameItem(v, b[i], depth + 1));
  // only plain objects compare by content; canvases, images and painters compare by identity (above)
  if (Object.getPrototypeOf(a) !== Object.prototype || Object.getPrototypeOf(b) !== Object.prototype) return false;
  const keys = Object.keys(b);
  return keys.length === Object.keys(a).length && keys.every((k) => sameItem(a[k], b[k], depth + 1));
}

/** What a game draws with: `__studio.hud.text(id, text)`, `.bar`, `.crosshair`, `.flash`, and the rest. */
function hudApi(items, state) {
  // A game re-sends its whole HUD every step: repaint (and re-upload the full-screen texture) only
  // when an item actually changed, so a still menu or pause card costs nothing per frame.
  function set(id, item, onTop = false) {
    const key = String(id);
    if (onTop && items.has(key)) {
      let last;
      for (const id of items.keys()) last = id;
      // A rebuilt dialog must not cover a still-active cosmetic batch.
      if (last !== key) { items.delete(key); state.dirty = state.full = true; }
    }
    if (sameItem(items.get(key), item)) return;
    if (item.type === "paint" || item.type === "bar" || item.type === "crosshair") state.full = true;
    items.set(key, item);
    state.changed.add(key);
    state.dirty = true;
  }
  return {
    text: (id, text, opts = {}) => set(id, { type: "text", text, x: 0.02, y: 0.03, ...opts }),
    bar: (id, fraction, opts = {}) => set(id, { type: "bar", fraction, x: 0.02, y: 0.94, ...opts }),
    panel: (id, opts = {}) => set(id, { type: "panel", x: 0, y: 0, w: 1, h: 1, ...opts }),
    circle: (id, opts = {}) => set(id, { type: "circle", x: 0.5, y: 0.5, radius: 24, ...opts }),
    image: (id, image, opts = {}) => set(id, { type: "image", image, x: 0, y: 0, w: 1, h: 1, ...opts }),
    paint: (id, painter, revision = 0) => set(id, { type: "paint", painter, revision }, true),
    crosshair: (opts = {}) => set("crosshair", { type: "crosshair", visible: true, ...opts }),
    flash: (color = "#ffffff", alpha = 0.5) => {
      state.flashColor = color;
      state.flashAlpha = Math.max(state.flashAlpha, Math.min(1, Number(alpha) || 0));
      state.dirty = true;
    },
    remove: (id) => {
      if (items.delete(String(id))) { state.changed.add(String(id)); state.dirty = true; }
    },
    clear: () => {
      items.clear();
      state.dirty = state.full = true;
    },
    get: (id) => items.get(String(id)) ?? null,
    items: () => [...items.keys()],
    enable: (on = true) => {
      state.enabled = Boolean(on);
      state.dirty = state.full = true;
    },
  };
}

/** Render the overlay over the frame already drawn, without clearing it, to the screen. */
function composeOver(renderer, { scene, camera }) {
  const autoClear = renderer.autoClear;
  const target = typeof renderer.getRenderTarget === "function" ? renderer.getRenderTarget() : null;
  try {
    renderer.autoClear = false;
    if (target && typeof renderer.setRenderTarget === "function") renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  } finally {
    renderer.autoClear = autoClear;
  }
}

/**
 * A 2D canvas painted on demand, uploaded as a texture on one full-frame quad in its own
 * orthographic scene, composited after the world render without clearing. The quad is tagged
 * `hud` and named `studio-hud`; `count('hud') === 1` is the harness's proof that a game has
 * exactly one HUD.
 *
 * `deps.renderer()` and `deps.canvas()` are accessors, not values: the renderer a game passed to
 * `installStudio` and the one the studio attached to are read at the moment they are used.
 */
export function createHud(deps) {
  const items = new Map();
  const overlay = createOverlay();
  // changed: ids set/removed since the last paint; bounds: where each item was last painted; full: repaint everything
  const state = { flashAlpha: 0, flashColor: "#ffffff", dirty: true, enabled: true, changed: new Set(), bounds: new Map(), full: true };
  return {
    api: hudApi(items, state),
    scene: overlay.scene,
    get flashAlpha() {
      return state.flashAlpha;
    },
    /** Something on the HUD changed since it was last painted (the frame must be drawn again). */
    get dirty() {
      return state.dirty || state.flashAlpha > 0;
    },
    set flashAlpha(v) {
      state.flashAlpha = v;
      state.dirty = true;
    },
    /** Called once per simulation step: the flash fades on simulated time, never the wall clock. */
    tick() {
      if (state.flashAlpha > 0) {
        state.flashAlpha *= FLASH_DECAY;
        if (state.flashAlpha < 0.01) state.flashAlpha = 0;
        state.dirty = true;
      }
    },
    /** Composite the overlay onto the current frame. No renderer, or nothing to draw: no-op. */
    compose() {
      const renderer = deps.renderer();
      const cannotDraw = !renderer || typeof renderer.render !== "function" || !state.enabled;
      if (cannotDraw) return;
      if (items.size === 0 && state.flashAlpha <= 0) return;
      if (state.dirty) paint(overlay, items, state, deps);
      composeOver(renderer, overlay);
    },
    summary() {
      const crosshair = items.get("crosshair");
      return {
        items: [...items.keys()],
        crosshair: crosshair ? crosshair.visible !== false : false,
        flash: Number(state.flashAlpha.toFixed(3)),
      };
    },
  };
}

/**
 * Dressing the kids: a wardrobe item's `look` becomes a fabric texture (cloth grain in its colour,
 * a seamless print on top) painted onto the matching material of the kid's model.
 *
 *   dressKid(bigSib.group, "sister", { top: "sister-top-stars", bottom: …, shoes: … });
 *   swatchFor(item)   // a small round canvas of the fabric for shop tiles
 *
 * Textures are made on first use and cached by look, so trying things on is instant the second time.
 */
import * as THREE from "three";
import { bakeTexture, makeRng } from "./materials.js";
import { SLOT_MATERIALS, itemById } from "./shop-catalog.js";

const SIZE = 256;
const css = (hex) => `#${hex.toString(16).padStart(6, "0")}`;
const RAINBOW = ["#f26b5b", "#ffa94d", "#ffd95a", "#7fcf8f", "#6fb7f0", "#a98be8"];

/** Draw `fn(x, y)` at (x, y) and wherever it would cross an edge, so the tile repeats seamlessly. */
function tiled(x, y, r, fn) {
  for (const dx of [0, -SIZE, SIZE]) for (const dy of [0, -SIZE, SIZE]) {
    const px = x + dx, py = y + dy;
    if (px > -r && px < SIZE + r && py > -r && py < SIZE + r) fn(px, py);
  }
}
function star(g, x, y, r) {
  g.beginPath();
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.fill();
}
function heart(g, x, y, r) {
  g.beginPath(); g.moveTo(x, y + r * 0.9);
  g.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.3, x, y - r * 0.45);
  g.bezierCurveTo(x + r * 0.7, y - r * 1.3, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
  g.fill();
}

function drawPrint(g, { print, accent = 0xffffff }) {
  g.fillStyle = g.strokeStyle = css(accent);
  if (print === "stripes") for (let y = 0; y < SIZE; y += 32) g.fillRect(0, y, SIZE, 13);
  else if (print === "rainbow") RAINBOW.forEach((c, i) => { g.fillStyle = c; g.globalAlpha = 0.92; g.fillRect(0, (i * SIZE) / 6, SIZE, SIZE / 6 + 1); });
  else if (print === "dots") for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    tiled(col * 32 + (row % 2) * 16, row * 32 + 16, 9, (x, y) => { g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); });
  }
  else if (print === "stars") for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
    tiled(col * 64 + (row % 2) * 32 + 16, row * 64 + 32, 16, (x, y) => star(g, x, y, 12));
  }
  else if (print === "hearts") for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
    tiled(col * 64 + (row % 2) * 32 + 16, row * 64 + 32, 18, (x, y) => heart(g, x, y, 10));
  }
  else if (print === "check") {
    g.globalAlpha = 0.45;
    for (let i = 0; i < SIZE; i += 32) { g.fillRect(i, 0, 16, SIZE); g.fillRect(0, i, SIZE, 16); }
  } else if (print === "denim") {
    g.globalAlpha = 0.16; g.strokeStyle = "#0b1b3a"; g.lineWidth = 2;
    for (let i = -SIZE; i < SIZE * 2; i += 6) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + SIZE, SIZE); g.stroke(); }
    g.globalAlpha = 0.9; g.strokeStyle = css(accent); g.setLineDash([7, 6]); g.lineWidth = 3;
    for (const y of [60, 188]) { g.beginPath(); g.moveTo(0, y); g.lineTo(SIZE, y); g.stroke(); }
    g.setLineDash([]);
  } else if (print === "snowflakes") {
    // six-armed snowflakes with little side twigs
    g.lineWidth = 3; g.lineCap = "round";
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) tiled(col * 64 + (row % 2) * 32 + 16, row * 64 + 32, 18, (x, y) => {
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3, ex = x + Math.cos(a) * 13, ey = y + Math.sin(a) * 13;
        g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke();
        const mx = x + Math.cos(a) * 8, my = y + Math.sin(a) * 8;
        for (const s of [-1, 1]) { g.beginPath(); g.moveTo(mx, my); g.lineTo(mx + Math.cos(a + s * 0.7) * 5, my + Math.sin(a + s * 0.7) * 5); g.stroke(); }
      }
    });
  } else if (print === "eggs") {
    // pastel painted eggs with a zigzag band
    const pastel = ["#ff9fc2", "#9fd0ff", "#ffe066", "#8fe0c0", "#c3a6f0"];
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) tiled(col * 64 + (row % 2) * 32 + 16, row * 64 + 32, 18, (x, y) => {
      g.fillStyle = pastel[(row * 4 + col) % pastel.length]; g.beginPath(); g.ellipse(x, y, 10, 13, 0, 0, 7); g.fill();
      g.strokeStyle = css(accent); g.lineWidth = 2.5; g.beginPath();
      for (let k = 0; k <= 4; k++) g.lineTo(x - 9 + k * 4.5, y + (k % 2 ? -3 : 3)); g.stroke();
    });
  } else if (print === "bats") {
    // little flapping bats, nose-to-tail rows
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) tiled(col * 64 + (row % 2) * 32 + 16, row * 64 + 32, 22, (x, y) => {
      g.beginPath(); g.moveTo(x, y + 4);
      g.lineTo(x - 7, y - 3); g.lineTo(x - 18, y - 6); g.lineTo(x - 13, y + 3); g.lineTo(x - 7, y + 2);
      g.lineTo(x, y + 9); g.lineTo(x + 7, y + 2); g.lineTo(x + 13, y + 3); g.lineTo(x + 18, y - 6); g.lineTo(x + 7, y - 3); g.closePath(); g.fill();
    });
  } else if (print === "pumpkins") {
    // round smiling pumpkins with a green stalk (the accent)
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) tiled(col * 64 + (row % 2) * 32 + 16, row * 64 + 32, 20, (x, y) => {
      g.fillStyle = "#ffb04a"; g.beginPath(); g.ellipse(x, y, 13, 11, 0, 0, 7); g.fill();
      g.fillStyle = css(accent); g.fillRect(x - 2, y - 15, 4, 6);
      g.fillStyle = "#5a2a0a"; g.fillRect(x - 6, y - 4, 3, 3); g.fillRect(x + 3, y - 4, 3, 3); g.fillRect(x - 5, y + 3, 10, 2);
    });
  } else if (print === "sparkle") {
    const rng = makeRng(5);
    for (let i = 0; i < 70; i++) {
      const x = rng() * SIZE, y = rng() * SIZE, r = 1.5 + rng() * 3;
      g.globalAlpha = 0.45 + rng() * 0.55;
      tiled(x, y, 8, (px, py) => { g.fillRect(px - r, py - 0.8, r * 2, 1.6); g.fillRect(px - 0.8, py - r, 1.6, r * 2); });
    }
  }
  g.globalAlpha = 1;
}

const fabrics = new Map();
/** The texture for a look: cloth grain in its colour with the print painted on. Cached. */
export function fabric(look) {
  const key = JSON.stringify(look);
  if (fabrics.has(key)) return fabrics.get(key);
  const base = new THREE.Color(look.color);
  const baked = bakeTexture({ kind: "cloth", seed: 77, size: SIZE, repeat: 2,
    palette: [base.clone().multiplyScalar(0.86).getHex(), base.getHex(), base.clone().lerp(new THREE.Color(0xffffff), 0.12).getHex()] });
  if (look.print) {
    drawPrint(baked.map.image.getContext("2d"), look);
    baked.map.needsUpdate = true;
  }
  fabrics.set(key, baked.map);
  return baked.map;
}

const swatches = new Map();
/** A round, ink-outlined fabric swatch for the shop tiles (canvas, cached per item). */
export function swatchFor(item) {
  if (swatches.has(item.id)) return swatches.get(item.id);
  const c = document.createElement("canvas");
  c.width = c.height = 96;
  const g = c.getContext("2d");
  g.save(); g.beginPath(); g.arc(48, 48, 42, 0, 7); g.clip();
  if (item.look) g.drawImage(fabric(item.look).image, 0, 0, SIZE / 2, SIZE / 2, 6, 6, 84, 84);
  else { g.fillStyle = css(item.swatch ?? 0xcccccc); g.fillRect(0, 0, 96, 96); }
  g.restore();
  g.lineWidth = 6; g.strokeStyle = "#241b3a"; g.beginPath(); g.arc(48, 48, 42, 0, 7); g.stroke();
  swatches.set(item.id, c);
  return c;
}

/** Paint a kid's outfit onto their model. `outfit` maps slot → item id; unknown/default → as shipped. */
export function dressKid(group, kid, outfit) {
  let mats = group.userData.outfitMaterials;
  if (!mats) {
    mats = {};
    group.traverse((o) => {
      if (o.isMesh && o.material?.name) (mats[o.material.name] ??= new Set()).add(o.material);
    });
    group.userData.outfitMaterials = mats;
  }
  for (const [slot, name] of Object.entries(SLOT_MATERIALS[kid])) {
    const look = itemById(outfit?.[slot])?.look;
    // One equipped outfit paints every model variant, including the one currently hidden.
    for (const material of mats[name] ?? []) {
      material.userData.shippedMap ??= material.map;
      material.map = look ? fabric(look) : material.userData.shippedMap;
    }
  }
}

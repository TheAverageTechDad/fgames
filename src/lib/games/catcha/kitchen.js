/**
 * The kitchen for the cooking game: same footprint as the playroom (room.js ROOM, so movement and
 * the camera work unchanged), counters on three walls plus an island, and the eleven stations dealt
 * into the counter slots by `kitchenLayout(seed)` (cooking.js). Also every food model, their HUD
 * thumbnails, the floor zones, cooker progress rings and steam/smoke.
 *
 *   const kitchen = createKitchen(scene, renderer);
 *   kitchen.applyLayout(seed);            // move the stations for this run
 *   kitchen.sync(dt, k, view)             // show what's in each bowl/pan, the carried food, rings
 *
 * Everything sits in `kitchen.group` (tag "kitchen"), hidden while the tidy-up game runs.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { bakeTexture, flat, standardMaterial } from "./materials.js";
import { ROOM } from "./room.js";
import { batchStatic } from "./static-batch.js";
import { buildHotplate, buildOven } from "./kitchen-appliances.js";
import { COOKERS, DINING_SPOTS, PREP, RECIPES, SLOTS, SUPPLIES, cookerLevel, kitchenLayout, seededRng } from "./cooking.js";

export const COUNTER_H = 1.35;
const DEPTH = 1.6, SLOT_W = 2.4, ZONE_OUT = 1.75;
export const ZONE_R = 1.25;
const FOOD_SIZE = 1.35;

/* ───────────── materials ───────────── */

/** A baked material whose colour map gets a pattern drawn over it (tiles, grout). */
function patterned({ kind, seed, palette, repeat = 1, bumpScale = 0.01, roughness = 0.85, draw }) {
  const size = 512;
  const baked = bakeTexture({ kind, seed, palette, size });
  draw(baked.map.image.getContext("2d"), size);
  baked.map.needsUpdate = true;
  for (const t of [baked.map, baked.roughnessMap, baked.bumpMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  const m = new THREE.MeshStandardMaterial({ map: baked.map, roughnessMap: baked.roughnessMap, bumpMap: baked.bumpMap, bumpScale, roughness });
  m.userData.baked = kind;
  return m;
}

function makeMaterials() {
  return {
    floor: patterned({ kind: "plaster", seed: 21, palette: [0xf3ead9, 0xf6efe1, 0xf9f3e8], repeat: 1,
      draw(g, s) { // 4×4 checker of mint and cream tiles with soft grout
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2) { g.fillStyle = "rgba(122,200,178,0.78)"; g.fillRect(x * s / 4, y * s / 4, s / 4, s / 4); }
        g.strokeStyle = "rgba(160,140,120,0.35)"; g.lineWidth = s * 3 / 256;
        for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * s / 4, 0); g.lineTo(i * s / 4, s); g.stroke(); g.beginPath(); g.moveTo(0, i * s / 4); g.lineTo(s, i * s / 4); g.stroke(); }
      } }),
    wall: standardMaterial({ kind: "plaster", seed: 22, repeat: 2, bumpScale: 0.008, roughness: 0.95, palette: [0xfbe9d7, 0xfdeedf, 0xfff3e6] }),
    splash: patterned({ kind: "plaster", seed: 23, palette: [0xffffff, 0xfbfbf8, 0xf4f6f6], repeat: 1,
      draw(g, s) { // little white wall tiles with a coral accent row
        g.fillStyle = "rgba(255,138,110,0.55)"; g.fillRect(0, s * 0.75, s, s / 8);
        g.strokeStyle = "rgba(150,170,175,0.6)"; g.lineWidth = s * 3 / 256;
        for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(0, i * s / 8); g.lineTo(s, i * s / 8); g.stroke(); }
        for (let r = 0; r < 8; r++) for (let i = 0; i <= 4; i++) { const x = i * s / 4 + (r % 2) * s / 8; g.beginPath(); g.moveTo(x, r * s / 8); g.lineTo(x, (r + 1) * s / 8); g.stroke(); }
      } }),
    cabinet: standardMaterial({ kind: "wood", seed: 24, repeat: 1, bumpScale: 0.01, roughness: 0.8, palette: [0x86cdb9, 0x90d4c1, 0x9adbc9] }),
    top: standardMaterial({ kind: "wood", seed: 25, repeat: 1, bumpScale: 0.012, roughness: 0.7, palette: [0xe0b483, 0xe8c294, 0xd6a874] }),
    trim: standardMaterial({ kind: "plaster", seed: 26, repeat: 1, bumpScale: 0.006, palette: [0xfff9f0, 0xffffff, 0xfdf6ea] }),
    enamel: standardMaterial({ kind: "plaster", seed: 27, repeat: 1, bumpScale: 0.004, roughness: 0.45, palette: [0xbfe8f2, 0xc8edf5, 0xd2f1f7] }),
    white: standardMaterial({ kind: "plaster", seed: 28, repeat: 1, bumpScale: 0.004, roughness: 0.5, palette: [0xf7f4ee, 0xfbf9f4, 0xffffff] }),
    metal: standardMaterial({ kind: "metal", seed: 29, repeat: 1, bumpScale: 0.004, roughness: 0.35, metalness: 0.6, palette: [0xb9c2cc, 0xc7cfd8, 0xd4dbe2] }),
    wood: standardMaterial({ kind: "wood", seed: 30, repeat: 1, bumpScale: 0.015, roughness: 0.85, palette: [0xc8925e, 0xd29f6c, 0xbd8652] }),
    cushion: standardMaterial({ kind: "cloth", seed: 31, repeat: 1, bumpScale: 0.02, roughness: 0.95, palette: [0xff9fc2, 0xffaacb, 0xffb6d3] }),
    hob: standardMaterial({ kind: "metal", seed: 32, repeat: 1, bumpScale: 0.004, roughness: 0.5, palette: [0x34333f, 0x3b3a47, 0x423f4f] }),
    glass: Object.assign(standardMaterial({ kind: "metal", seed: 35, bumpScale: 0, roughness: 0.15, metalness: 0.2,
      palette: [0x444654, 0x454755, 0x464856] }), { transparent: true, opacity: 0.42, depthWrite: false }),
    pane: new THREE.MeshBasicMaterial({ color: 0xcdeeff }),
  };
}

/* ───────────── small builders ───────────── */

const mats = new Map();
const m = (color) => { if (!mats.has(color)) mats.set(color, flat(color)); return mats.get(color); };
function add(g, geo, mat, x = 0, y = 0, z = 0, s = null, r = null) {
  const mesh = new THREE.Mesh(geo, typeof mat === "number" ? m(mat) : mat);
  mesh.position.set(x, y, z);
  if (s) mesh.scale.set(...(Array.isArray(s) ? s : [s, s, s]));
  if (r) mesh.rotation.set(...r);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
const rbox = (w, h, d, r = 0.08) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2));
const ball = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
const cyl = (rt, rb, h, seg = 20) => new THREE.CylinderGeometry(rt, rb, h, seg);
/** A bowl/pot shell from a profile (outer wall, rim, inner wall). */
function shell(r, h, wall = 0.05, flare = 1.15) {
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(r * 0.8, 0), new THREE.Vector2(r * flare, h), new THREE.Vector2(r * flare - wall, h),
    new THREE.Vector2(r * 0.8 - wall, wall), new THREE.Vector2(0, wall)];
  return new THREE.LatheGeometry(pts, 24);
}

/** A counter cabinet `w` wide, built facing +z with its back to the wall. */
function cabinet(K, w, doors = true) {
  const g = new THREE.Group();
  add(g, rbox(w - 0.04, COUNTER_H - 0.14, DEPTH - 0.12, 0.06), K.cabinet, 0, (COUNTER_H - 0.14) / 2, -0.04);
  add(g, rbox(w, 0.14, DEPTH, 0.05), K.top, 0, COUNTER_H - 0.07, 0);
  add(g, new THREE.BoxGeometry(w - 0.1, 0.12, 0.06), 0x5a9f8c, 0, 0.06, DEPTH / 2 - 0.08); // kick plate shadow line
  if (doors) {
    const n = Math.max(1, Math.round(w / 1.2));
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (i + 0.5) * (w / n);
      add(g, rbox(w / n - 0.14, COUNTER_H - 0.42, 0.04, 0.03), K.trim, x, (COUNTER_H - 0.1) / 2 + 0.04, DEPTH / 2 - 0.08).scale.set(1, 1, 1);
      add(g, rbox(w / n - 0.26, COUNTER_H - 0.56, 0.04, 0.03), K.cabinet, x, (COUNTER_H - 0.1) / 2 + 0.04, DEPTH / 2 - 0.05);
      add(g, ball(0.06, 8, 6), 0xf2c46b, x + (i % 2 ? -1 : 1) * (w / n / 2 - 0.22), COUNTER_H * 0.62, DEPTH / 2 - 0.01);
    }
  }
  return batchStatic(g);
}

/* ───────────── food ───────────── */

/** Each ingredient, prepped food and dish as a template group, sized to read from the game camera. */
export function makeFood() {
  const T = {};
  const plate = (g, r = 0.46) => { add(g, cyl(r, r * 0.8, 0.06, 24), 0xfaf7f0, 0, 0.03, 0); add(g, cyl(r * 0.72, r * 0.72, 0.005, 24), 0xeee6d8, 0, 0.062, 0); };
  const smallBowl = (g, fill, r = 0.3) => {
    add(g, shell(r, 0.3, 0.04, 1.2), 0xf6f1e7, 0, 0, 0);
    add(g, cyl(r * 1.12, r * 1.12, 0.02, 24), fill, 0, 0.25, 0);
  };
  let g;
  g = T.egg = new THREE.Group(); add(g, ball(0.2), 0xfff1db, 0, 0.26, 0, [1, 1.3, 1]);
  g = T.flour = new THREE.Group();
  add(g, rbox(0.5, 0.62, 0.36, 0.12), 0xf4ecdc, 0, 0.31, 0); add(g, new THREE.BoxGeometry(0.51, 0.14, 0.37), 0x4a8fe0, 0, 0.3, 0);
  add(g, ball(0.12, 10, 8), 0xf4ecdc, 0, 0.66, 0, [1.3, 0.7, 1]);
  g = T.milk = new THREE.Group();
  add(g, rbox(0.34, 0.5, 0.34, 0.03), 0xffffff, 0, 0.25, 0); add(g, new THREE.BoxGeometry(0.35, 0.16, 0.35), 0x4aa7ff, 0, 0.3, 0);
  add(g, new THREE.CylinderGeometry(0.24, 0.24, 0.34, 3), 0x4aa7ff, 0, 0.58, 0, [1, 1, 1], [0, 0, Math.PI / 2]).scale.set(0.5, 1, 1);
  g = T.chocolate = new THREE.Group();
  add(g, rbox(0.56, 0.09, 0.34, 0.03), 0x6b3e22, 0, 0.05, 0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) add(g, rbox(0.15, 0.04, 0.13, 0.02), 0x7d4a2a, -0.18 + i * 0.18, 0.11, -0.075 + j * 0.15);
  add(g, rbox(0.28, 0.1, 0.36, 0.02), 0xe2452b, 0.16, 0.06, 0);
  g = T.carrot = new THREE.Group();
  add(g, new THREE.ConeGeometry(0.13, 0.62, 12), 0xff8a2a, 0, 0.14, 0, null, [Math.PI / 2, 0, 0]);
  for (const a of [-0.4, 0, 0.4]) add(g, new THREE.ConeGeometry(0.04, 0.3, 6), 0x5fb52e, Math.sin(a) * 0.08, 0.2, -0.42, null, [-Math.PI / 2 + a * 0.5, 0, a]);
  g = T.tomato = new THREE.Group();
  add(g, ball(0.24), 0xf2493a, 0, 0.22, 0, [1, 0.85, 1]);
  add(g, new THREE.ConeGeometry(0.13, 0.06, 5), 0x4f9a2a, 0, 0.42, 0); add(g, cyl(0.02, 0.02, 0.1, 6), 0x4f9a2a, 0, 0.47, 0);
  g = T.cheese = new THREE.Group();
  const wedge = new THREE.Shape([new THREE.Vector2(-0.3, -0.2), new THREE.Vector2(0.34, -0.2), new THREE.Vector2(-0.3, 0.24)]);
  add(g, new THREE.ExtrudeGeometry(wedge, { depth: 0.26, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }), 0xffd23f, 0, 0.03, 0.18, null, [-Math.PI / 2, 0, 0]);
  for (const [x, z] of [[-0.12, 0.05], [0.06, -0.08], [-0.2, -0.12]]) add(g, ball(0.05, 8, 6), 0xe0a81a, x, 0.32, z, [1, 0.4, 1]);
  g = T.dough = new THREE.Group(); add(g, ball(0.3), 0xf3d9a6, 0, 0.17, 0, [1, 0.58, 1]);
  g = T.pumpkin = new THREE.Group(); // Halloween
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(g, ball(0.16), 0xff8a2a, Math.cos(a) * 0.12, 0.2, Math.sin(a) * 0.12, [1, 1.15, 1]); }
  add(g, ball(0.2), 0xff8a2a, 0, 0.21, 0); add(g, cyl(0.03, 0.04, 0.12, 6), 0x5c8a2e, 0, 0.44, 0);

  // prepped (out of the bowl / off the board)
  g = T["prep-pancakes"] = new THREE.Group(); smallBowl(g, 0xffe28a);
  g = T["prep-cookies"] = new THREE.Group(); smallBowl(g, 0xd9a86a);
  for (const [x, z] of [[-0.1, 0.05], [0.12, -0.04], [0, -0.14], [0.05, 0.14]]) add(g, ball(0.04, 6, 5), 0x4a2a16, x, 0.27, z);
  g = T["prep-soup"] = new THREE.Group(); plate(g, 0.4);
  for (let i = 0; i < 7; i++) { const a = i * 0.9; add(g, cyl(0.07, 0.07, 0.04, 10), i % 2 ? 0xf2493a : 0xff8a2a, Math.cos(a) * 0.2, 0.09, Math.sin(a) * 0.2); }
  g = T["prep-pumpkinSoup"] = new THREE.Group(); plate(g, 0.4);
  for (let i = 0; i < 8; i++) { const a = i * 0.8; add(g, rbox(0.1, 0.08, 0.1, 0.02), i % 3 ? 0xff8a2a : 0xffa94d, Math.cos(a) * 0.2, 0.1, Math.sin(a) * 0.2); }
  g = T["prep-hotChocolate"] = new THREE.Group(); smallBowl(g, 0x7a4a2a);
  g = T["prep-carrotCake"] = new THREE.Group(); smallBowl(g, 0xf0a860);
  for (const [x, z] of [[-0.1, 0.05], [0.12, -0.04], [0.02, 0.13]]) add(g, rbox(0.05, 0.03, 0.05, 0.01), 0xff8a2a, x, 0.27, z);
  g = T["prep-pizza"] = new THREE.Group();
  add(g, cyl(0.44, 0.44, 0.06, 24), 0xf3d9a6, 0, 0.03, 0); add(g, cyl(0.37, 0.37, 0.02, 24), 0xe0402e, 0, 0.07, 0);
  for (let i = 0; i < 8; i++) { const a = i * 0.8; add(g, rbox(0.08, 0.03, 0.08, 0.01), 0xfff0a0, Math.cos(a) * 0.22, 0.09, Math.sin(a) * 0.22); }

  // dishes
  g = T.pancakes = new THREE.Group(); plate(g);
  for (let i = 0; i < 3; i++) add(g, cyl(0.32, 0.32, 0.08, 22), 0xe8a84e, 0, 0.11 + i * 0.085, 0);
  add(g, cyl(0.24, 0.27, 0.02, 22), 0xb5651d, 0, 0.36, 0); add(g, rbox(0.12, 0.07, 0.12, 0.02), 0xfff2a8, 0, 0.4, 0);
  g = T.soup = new THREE.Group(); smallBowl(g, 0xf26b3a, 0.34);
  for (const [x, z] of [[-0.1, 0.06], [0.1, -0.05], [0.02, 0.13]]) add(g, ball(0.03, 6, 5), 0x5fb52e, x, 0.28, z);
  g = T.pumpkinSoup = new THREE.Group(); smallBowl(g, 0xff8a2a, 0.34);
  add(g, new THREE.TorusGeometry(0.11, 0.025, 6, 16), 0xfff3dc, 0, 0.27, 0, null, [Math.PI / 2, 0, 0]); // a swirl of cream
  for (const [x, z] of [[-0.14, 0.1], [0.15, -0.08], [0.05, 0.16]]) add(g, ball(0.03, 6, 5), 0x6b8f3a, x, 0.28, z);
  g = T.hotChocolate = new THREE.Group(); // a mug with marshmallows
  add(g, cyl(0.24, 0.21, 0.42, 20), 0xfaf7f0, 0, 0.21, 0); add(g, cyl(0.21, 0.21, 0.02, 20), 0x6b3a1f, 0, 0.4, 0);
  add(g, new THREE.TorusGeometry(0.11, 0.035, 6, 14), 0xfaf7f0, 0.26, 0.22, 0);
  for (const [x, z] of [[-0.07, 0.05], [0.07, -0.03], [0, -0.09], [0.05, 0.09]]) add(g, rbox(0.07, 0.06, 0.07, 0.02), 0xfff3f6, x, 0.43, z);
  g = T.carrotCake = new THREE.Group(); plate(g); // a slice with frosting and a little carrot
  add(g, rbox(0.42, 0.26, 0.3, 0.03), 0xd9894a, 0, 0.19, 0); add(g, rbox(0.43, 0.06, 0.31, 0.03), 0xfff6e6, 0, 0.34, 0);
  add(g, new THREE.ConeGeometry(0.035, 0.14, 8), 0xff8a2a, 0, 0.4, 0, null, [0, 0, Math.PI / 2]);
  g = T.cookies = new THREE.Group(); plate(g);
  for (const [x, z, y] of [[-0.14, 0.08, 0.1], [0.16, 0.06, 0.1], [0, -0.14, 0.1], [0.01, 0.02, 0.16]]) {
    add(g, cyl(0.15, 0.15, 0.05, 16), 0xd99a4e, x, y, z);
    add(g, ball(0.03, 6, 5), 0x4a2a16, x + 0.05, y + 0.03, z); add(g, ball(0.03, 6, 5), 0x4a2a16, x - 0.05, y + 0.03, z - 0.04);
  }
  g = T.pizza = new THREE.Group();
  add(g, cyl(0.47, 0.47, 0.07, 26), 0xe0a85c, 0, 0.035, 0); add(g, cyl(0.4, 0.4, 0.02, 26), 0xffc93a, 0, 0.08, 0);
  for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3; add(g, cyl(0.07, 0.07, 0.02, 12), 0xd2352a, Math.cos(a) * 0.24, 0.1, Math.sin(a) * 0.24); }

  // burnt dishes: the same shapes, charred
  for (const t of Object.values(T)) batchStatic(t);
  const char = new Map();
  for (const id of Object.keys(RECIPES)) {
    const b = T[id].clone();
    b.traverse((o) => {
      if (!o.isMesh) return;
      if (!char.has(o.material)) char.set(o.material, flat(new THREE.Color(o.material.color).lerp(new THREE.Color(0x2a1a12), 0.82).getHex()));
      o.material = char.get(o.material);
    });
    T[`burnt-${id}`] = b;
  }
  // drawn a size up from life (like the toys) so it reads from the game camera
  for (const [id, t] of Object.entries(T)) { t.scale.multiplyScalar(FOOD_SIZE); t.userData.tag = id.startsWith("burnt") ? "food-burnt" : "food"; }
  return T;
}

/* ───────────── thumbnails ───────────── */

/** Renders objects into small sticker canvases (ink + cream outline) for the HUD and the beacons. */
export function makeSnapshotter(renderer) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff6ea, 0x9a8f86, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const cam = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
  const rt = new THREE.WebGLRenderTarget(128, 128, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  let px = new Uint8Array(128 * 128 * 4);
  const color = new THREE.Color();
  return function snapshot(object, { tilt = 0.75, size: pixels = 128 } = {}) {
    const S = Math.max(128, Math.min(1024, Math.round(pixels)));
    if (rt.width !== S) rt.setSize(S, S);
    if (px.length !== S * S * 4) px = new Uint8Array(S * S * 4);
    const o = object.clone();
    scene.add(o);
    const box = new THREE.Box3().setFromObject(o), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const dist = Math.max(size.x, size.y, size.z) / (2 * Math.tan((cam.fov * Math.PI) / 360)) * 1.2;
    cam.position.copy(center).add(new THREE.Vector3(0, Math.sin(tilt), Math.cos(tilt)).multiplyScalar(dist));
    cam.lookAt(center);
    const prevTarget = renderer.getRenderTarget(), prevAlpha = renderer.getClearAlpha();
    renderer.getClearColor(color);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, S, S, px);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(color, prevAlpha);
    scene.remove(o);
    const raw = document.createElement("canvas");
    raw.width = raw.height = S;
    const img = raw.getContext("2d").createImageData(S, S);
    for (let y = 0; y < S; y++) img.data.set(px.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4); // GL rows are bottom-up
    raw.getContext("2d").putImageData(img, 0, 0);
    // sticker: ink silhouette, then cream silhouette, then the picture
    const sil = (fill) => {
      const c = document.createElement("canvas"); c.width = c.height = S;
      const g = c.getContext("2d"); g.drawImage(raw, 0, 0); g.globalCompositeOperation = "source-in"; g.fillStyle = fill; g.fillRect(0, 0, S, S);
      return c;
    };
    const out = document.createElement("canvas");
    out.width = out.height = S;
    const g = out.getContext("2d");
    g.translate(S * 0.08, S * 0.08); g.scale(0.84, 0.84);
    const detail = S / 128, steps = S > 128 ? 64 : 16;
    for (const [c, radius] of [[sil("#241b3a"), 9], [sil("#fff6e6"), 5]]) {
      const r = radius * detail;
      for (let a = 0; a < steps; a++) g.drawImage(c, Math.cos(a / steps * Math.PI * 2) * r, Math.sin(a / steps * Math.PI * 2) * r + (radius > 6 ? 3 * detail : 0));
    }
    g.drawImage(raw, 0, 0);
    return out;
  };
}
function dimmed(canvas) {
  const c = document.createElement("canvas"); c.width = canvas.width; c.height = canvas.height;
  const g = c.getContext("2d"); g.globalAlpha = 0.3; g.drawImage(canvas, 0, 0);
  return c;
}

/* ───────────── sprites ───────────── */

function spriteFrom(canvas, scale, tag) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  // These are navigation/progress stickers, so scenery must never obscure their information.
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true }));
  s.scale.setScalar(scale);
  s.renderOrder = 3;
  s.userData.tag = tag;
  return s;
}
/** A chunky down arrow: "come here". */
function arrowCanvas(fill) {
  const c = document.createElement("canvas"); c.width = c.height = 96;
  const g = c.getContext("2d");
  const path = () => { g.beginPath(); g.moveTo(30, 10); g.lineTo(66, 10); g.lineTo(66, 44); g.lineTo(84, 44); g.lineTo(48, 84); g.lineTo(12, 44); g.lineTo(30, 44); g.closePath(); };
  g.lineJoin = "round";
  g.translate(0, 4); path(); g.fillStyle = "#241b3a"; g.fill(); g.lineWidth = 12; g.strokeStyle = "#241b3a"; g.stroke();
  g.translate(0, -4); path(); g.lineWidth = 12; g.stroke(); g.fillStyle = fill; g.fill();
  return c;
}
/** A progress ring with the dish's sticker in the middle (cooker / prep). Redrawn only when it changes. */
function makeRing(thumbs) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const sprite = spriteFrom(c, 1.45, "cook-ring");
  sprite.visible = false;
  let key = "";
  return {
    sprite,
    draw(kind, level, recipe, flash) {
      const k = `${kind}:${Math.round(level * 48)}:${recipe}:${flash}`;
      if (k === key) return;
      key = k;
      const g = c.getContext("2d");
      g.clearRect(0, 0, 128, 128);
      const col = { cooking: "#3dd68c", prep: "#ffb627", ready: "#ffc531", warn: flash ? "#ff4d3a" : "#ffc531", burnt: "#5a4636" }[kind];
      g.fillStyle = "#241b3a"; g.beginPath(); g.arc(64, 68, 54, 0, 7); g.fill();
      g.fillStyle = kind === "burnt" ? "#7a6a5e" : "#fff6e6"; g.beginPath(); g.arc(64, 64, 54, 0, 7); g.fill();
      g.lineWidth = 12; g.strokeStyle = "rgba(36,27,58,0.15)"; g.beginPath(); g.arc(64, 64, 44, 0, 7); g.stroke();
      g.strokeStyle = col; g.lineCap = "round";
      const full = kind === "ready" || kind === "burnt" ? 1 : kind === "warn" ? 1 - level : level;
      g.beginPath(); g.arc(64, 64, 44, -Math.PI / 2, -Math.PI / 2 + Math.max(0.02, full) * Math.PI * 2); g.stroke();
      g.lineWidth = 6; g.strokeStyle = "#241b3a"; g.beginPath(); g.arc(64, 64, 54, 0, 7); g.stroke();
      const art = recipe && (kind === "burnt" ? thumbs[`burnt-${recipe}`] : kind === "prep" || kind === "cooking" ? thumbs[recipe] : thumbs[recipe]);
      if (art) g.drawImage(art, 30, 30, 68, 68);
      if (kind === "warn" || kind === "burnt") {
        g.font = "bold 46px sans-serif"; g.textAlign = "center"; g.lineWidth = 9; g.strokeStyle = "#241b3a";
        g.strokeText("!", 100, 46); g.fillStyle = "#ff4d3a"; g.fillText("!", 100, 46);
      }
      sprite.material.map.needsUpdate = true;
    },
  };
}
function puffTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, "rgba(255,255,255,0.95)"); grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ───────────── stations ───────────── */

const ZONE_COLORS = { supply: 0x4aa7ff, prep: 0xffb627, cook: 0xff7a4d, hatch: 0x22b385, bin: 0x9a8fb0 };
const KIND = { fridge: "supply", pantry: "supply", veg: "supply", bowl: "prep", board: "prep", pan: "cook", pot: "cook", oven: "cook", hatch: "hatch", bin: "bin", seat: null };

function buildStation(id, K, food) {
  const g = new THREE.Group();
  g.userData.tag = `kitchen-${id}`;
  const anchor = new THREE.Group();
  g.add(anchor);
  const top = COUNTER_H;
  let replaces = false, extra = {};
  const clone = (key, x, y, z, s = 1, ry = 0) => { const c = food[key].clone(); c.position.set(x, y, z); c.scale.setScalar(s); c.rotation.y = ry; g.add(c); return c; }; // props at life size
  if (id === "fridge") {
    replaces = true;
    add(g, rbox(2.2, 3.5, 1.5, 0.22), K.enamel, 0, 1.78, -0.02);
    add(g, new THREE.BoxGeometry(2.1, 0.05, 0.02), 0x6aa7b8, 0, 2.45, 0.74);
    for (const [y, h] of [[2.95, 0.6], [1.6, 1.2]]) add(g, new THREE.CapsuleGeometry(0.06, h, 4, 8), K.metal, 0.8, y, 0.8);
    for (const [x, y, c] of [[-0.5, 2.9, 0xff5d4a], [-0.1, 3.05, 0xffd23f], [-0.6, 1.6, 0x4aa7ff], [0, 1.2, 0x9bd94f]]) add(g, cyl(0.1, 0.1, 0.05, 12), c, x, y, 0.76, null, [Math.PI / 2, 0, 0]);
    add(g, rbox(0.7, 0.5, 0.03, 0.02), 0xfff6e6, -0.35, 2.0, 0.76); // a crayon drawing stuck on
    add(g, new THREE.BoxGeometry(0.5, 0.06, 0.035), 0xff8fb1, -0.35, 2.05, 0.77);
  } else if (id === "pantry") {
    replaces = true;
    add(g, new THREE.BoxGeometry(2.3, 3.4, 0.1), K.wood, 0, 1.7, -0.72);
    for (const x of [-1.1, 1.1]) add(g, new THREE.BoxGeometry(0.1, 3.4, 1.5), K.wood, x, 1.7, -0.02);
    for (const y of [0.1, 1.15, 2.2, 3.35]) add(g, new THREE.BoxGeometry(2.3, 0.1, 1.5), K.wood, 0, y, -0.02);
    clone("flour", -0.5, 0.15, -0.1, 1.2); clone("flour", 0.3, 0.15, -0.2, 1.2, 0.4);
    clone("chocolate", -0.4, 1.2, 0.1, 1.2, 0.2); clone("chocolate", 0.4, 1.28, -0.1, 1.2, -0.3);
    clone("dough", 0, 2.25, 0, 1.4);
    for (const [x, c] of [[-0.75, 0xffb627], [0.75, 0xf26b5b]]) { add(g, cyl(0.2, 0.2, 0.42, 14), c, x, 2.46, -0.1); add(g, cyl(0.21, 0.21, 0.08, 14), 0xfff6e6, x, 2.71, -0.1); }
  } else if (id === "veg") {
    const crate = new THREE.Group();
    for (const z of [-0.4, 0.4]) add(crate, new THREE.BoxGeometry(1.7, 0.4, 0.08), K.wood, 0, 0.2, z);
    for (const x of [-0.82, 0.82]) add(crate, new THREE.BoxGeometry(0.08, 0.4, 0.8), K.wood, x, 0.2, 0);
    add(crate, new THREE.BoxGeometry(1.7, 0.05, 0.8), K.wood, 0, 0.03, 0);
    crate.position.y = top;
    batchStatic(crate);
    g.add(crate);
    for (let i = 0; i < 3; i++) clone("carrot", -0.55 + i * 0.22, top + 0.25, -0.05 + (i % 2) * 0.12, 1, 0.3 + i);
    for (let i = 0; i < 3; i++) clone("tomato", 0.25 + (i % 2) * 0.3, top + 0.1 + (i === 2 ? 0.18 : 0), -0.12 + i * 0.12, 0.95);
  } else if (id === "bowl") {
    add(g, shell(0.5, 0.5, 0.05, 1.25), 0xfff0d6, 0, top, 0);
    add(g, cyl(0.03, 0.03, 0.8, 8), K.metal, 0.35, top + 0.6, 0.1, null, [0.2, 0, -0.45]);
    anchor.position.set(0, top + 0.12, 0);
    extra.contents = { spread: 0.2, scale: 0.6 };
  } else if (id === "board") {
    add(g, rbox(1.7, 0.1, 1.0, 0.04), K.wood, 0, top + 0.05, 0);
    add(g, cyl(0.08, 0.08, 1.1, 12), 0xe8c294, -0.1, top + 0.18, -0.55, null, [0, 0, Math.PI / 2]);
    anchor.position.set(0, top + 0.1, 0.05);
    extra.contents = { spread: 0.42, scale: 0.8 };
  } else if (id === "pan" || id === "pot") {
    extra = buildHotplate(g, K, top, id);
    anchor.position.set(0, extra.foodY, extra.foodZ);
  } else if (id === "oven") {
    replaces = true;
    extra = buildOven(g, K, top, DEPTH);
    anchor.position.set(0, extra.foodY, extra.foodZ);
  } else if (id === "hatch") {
    // Retain the serving rule id; its world marker now belongs to the dining table.
  } else if (id === "bin") {
    replaces = true;
    add(g, cyl(0.55, 0.48, 1.15, 22), standardMaterial({ kind: "metal", seed: 33, palette: [0x4aa79a, 0x52b2a5, 0x5bbdb0], roughness: 0.4, metalness: 0.3 }), 0, 0.58, 0);
    const hinge = new THREE.Group();
    hinge.userData.tag = "kitchen-bin-lid";
    hinge.position.set(0, 1.2, -0.5);
    g.add(hinge);
    add(hinge, cyl(0.58, 0.58, 0.1, 22), K.metal, 0, 0, 0.5);
    extra.lid = hinge;
    add(g, rbox(0.4, 0.06, 0.2, 0.02), K.metal, 0, 0.05, 0.55);
  } else if (id === "seat") {
    add(g, rbox(1.3, 0.16, 1.1, 0.07), K.cushion, 0, top + 0.08, 0.05);
  }
  batchStatic(g, [extra.soup, extra.glow, extra.heat]);
  return { id, kind: KIND[id], group: g, anchor, replaces, ...extra };
}

/* ───────────── the kitchen ───────────── */

export function createKitchen(scene, renderer) {
  const K = makeMaterials();
  const group = new THREE.Group();
  group.userData.tag = "kitchen";
  group.visible = false;
  scene.add(group);

  // shell: floor, three walls, backsplash band, window, baseboard (the front is the open cutaway)
  const floor = add(group, new THREE.BoxGeometry(ROOM.hx * 2, 0.6, ROOM.hz * 2), K.floor, 0, -0.3, 0);
  for (const key of ["map", "roughnessMap", "bumpMap"])
    floor.material[key].repeat.set(ROOM.hx * 2 / 5.2, ROOM.hz * 2 / 5.2);
  floor.castShadow = false;
  const wall = (w, h, d, x, y, z, mat = K.wall) => add(group, new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  wall(ROOM.hx * 2 + 1.2, ROOM.wall, 0.6, 0, ROOM.wall / 2, -ROOM.hz - 0.3);
  wall(0.6, ROOM.wall, ROOM.hz * 2 + 1.2, -ROOM.hx - 0.3, ROOM.wall / 2, 0);
  wall(0.6, ROOM.wall, ROOM.hz * 2 + 1.2, ROOM.hx + 0.3, ROOM.wall / 2, 0);
  const splashH = 1.3;
  for (const [w, d, x, z, rx] of [[ROOM.hx * 2, 0.06, 0, -ROOM.hz + 0.03, 9], [0.06, 16, -ROOM.hx + 0.03, -2, 6], [0.06, 16, ROOM.hx - 0.03, -2, 6]]) {
    const s = wall(w, splashH, d, x, COUNTER_H + splashH / 2, z, K.splash.clone());
    for (const key of ["map", "roughnessMap", "bumpMap"]) {
      s.material[key] = K.splash[key].clone(); s.material[key].needsUpdate = true; s.material[key].repeat.set(rx, 1);
    }
  }
  const frame = wall(4.6, 1.6, 0.2, 0, 3.4, -ROOM.hz + 0.05, K.trim);
  frame.castShadow = false;
  wall(4.1, 1.15, 0.12, 0, 3.4, -ROOM.hz + 0.12, K.pane).name = "window-pane"; // daylight.js tints the sky
  wall(0.1, 1.2, 0.14, 0, 3.4, -ROOM.hz + 0.16, K.trim);
  // a row of hanging utensils on the left wall rail and a shelf of jars on the right, so the upper walls aren't bare
  wall(0.08, 0.08, 8, -ROOM.hx + 0.1, 3.3, -2, K.metal);
  for (let i = 0; i < 5; i++) {
    const z = -5 + i * 1.5, u = new THREE.Group();
    add(u, cyl(0.025, 0.025, 0.6, 6), 0x8a5a3a, 0, -0.3, 0);
    add(u, i % 2 ? shell(0.16, 0.08, 0.02, 1.05) : ball(0.12, 10, 8), i % 2 ? K.metal : 0xd99a4e, 0, i % 2 ? -0.68 : -0.7, 0, i % 2 ? null : [1, 0.5, 0.25], i % 2 ? [Math.PI / 2, 0, Math.PI / 2] : null);
    u.position.set(-ROOM.hx + 0.2, 3.3, z);
    group.add(u);
  }
  wall(0.5, 0.1, 6, ROOM.hx - 0.25, 3.1, -2, K.wood);
  for (let i = 0; i < 6; i++) {
    const c = [0xffb627, 0xf26b5b, 0x7fcf8f, 0x6fb7f0, 0xb59cf2, 0xff8fb1][i];
    add(group, cyl(0.17, 0.17, 0.42 + (i % 3) * 0.08, 14), c, ROOM.hx - 0.3, 3.36 + (i % 3) * 0.04, -4.5 + i * 1);
    add(group, cyl(0.18, 0.18, 0.07, 14), 0xfff6e6, ROOM.hx - 0.3, 3.6 + (i % 3) * 0.08, -4.5 + i * 1);
  }

  // wall cupboards either side of the window, and a striped runner rug down the middle of the floor
  // (one over each back-wall slot; hidden where the fridge, pantry needs the wall)
  const cupboards = new Map();
  SLOTS.forEach((sl, i) => {
    if (sl.run !== "back" || sl.x === 0) return;
    const c = new THREE.Group();
    add(c, rbox(2.3, 1.15, 0.8, 0.06), K.cabinet, 0, 0, 0);
    for (const dx of [-0.55, 0.55]) { add(c, rbox(1.0, 0.95, 0.04, 0.03), K.trim, dx, 0, 0.41); add(c, rbox(0.82, 0.77, 0.04, 0.03), K.cabinet, dx, 0, 0.43); }
    add(c, ball(0.06, 8, 6), 0xf2c46b, -0.12, -0.3, 0.46); add(c, ball(0.06, 8, 6), 0xf2c46b, 0.12, -0.3, 0.46);
    c.position.set(sl.x, 3.5, -ROOM.hz + 0.4);
    c.userData.tag = "counter";
    batchStatic(c);
    group.add(c);
    cupboards.set(i, c);
  });
  const rug = add(group, rbox(9, 0.03, 3.6, 0.015), patterned({ kind: "cloth", seed: 34, palette: [0xf08a6a, 0xf29676, 0xf4a283], repeat: 1, bumpScale: 0.02, roughness: 0.95,
    draw(g, sz) { g.fillStyle = "rgba(255,246,230,0.85)"; for (let i = 0; i < 4; i++) g.fillRect(0, sz * (0.1 + i * 0.25), sz, sz * 0.06); } }), 0, 0.015, 5);
  rug.castShadow = false;
  rug.userData.tag = "rug";

  // counters: a cabinet per slot (hidden where a station brings its own body) plus fixed fillers
  const yaw = (f) => Math.atan2(f[0], f[1]);
  const slotCabinets = SLOTS.map((s) => {
    const c = cabinet(K, SLOT_W);
    c.position.set(s.x, 0, s.z);
    c.rotation.y = yaw(s.face);
    c.userData.tag = "counter";
    group.add(c);
    return c;
  });
  const fillers = new THREE.Group(); fillers.userData.tag = "counter"; group.add(fillers);
  const fill = (run, from, to) => {
    const s = SLOTS.find((x) => x.run === run), w = to - from, c = cabinet(K, w, w > 1.2);
    const mid = (from + to) / 2;
    if (run === "back") c.position.set(mid, 0, s.z); else c.position.set(s.x, 0, mid);
    c.rotation.y = yaw(s.face);
    c.userData.tag = "counter";
    // Fixed fillers have no layout/visibility handles, so they can share a handful of draws.
    c.updateMatrix();
    for (const mesh of [...c.children]) { mesh.applyMatrix4(c.matrix); fillers.add(mesh); }
  };
  for (const [a, b] of [[-11.4, -9.6], [-7.2, -5.4], [-3, -1.2], [1.2, 3], [5.4, 7.2], [9.6, 11.4]]) fill("back", a, b);
  for (const run of ["left", "right"]) for (const [a, b] of [[-10, -6.2], [-3.8, -2], [0.4, 2.2], [4.6, 6]]) fill(run, a, b);
  batchStatic(fillers);
  // the island's back is a plain panel (its stations face the camera)
  const obstacles = [
    { id: "counter-back", x: 0, z: -9.2, hx: 11.4, hz: DEPTH / 2 },
    { id: "counter-left", x: -12.2, z: -2, hx: DEPTH / 2, hz: 8 },
    { id: "counter-right", x: 12.2, z: -2, hx: DEPTH / 2, hz: 8 },
    { id: "island", x: 0, z: 0, hx: SLOT_W + 0.05, hz: DEPTH / 2 },
  ];

  // Family dining table: two stools, a baby high chair and an open serving side, moved per seed
  const table = new THREE.Group();
  table.userData.tag = "kitchen-table";
  add(table, cyl(1.2, 1.2, 0.14, 30), K.top, 0, 1.18, 0);
  add(table, cyl(0.14, 0.2, 1.1, 12), K.wood, 0, 0.56, 0);
  add(table, cyl(0.6, 0.7, 0.08, 20), K.wood, 0, 0.04, 0);
  for (const [x, z] of [[-0.52, 0], [0.52, 0], [0, -0.65]]) {
    add(table, cyl(0.3, 0.28, 0.035, 22), 0xfaf7f0, x, 1.27, z);
    add(table, cyl(0.09, 0.08, 0.2, 12), K.cushion, x + 0.25, 1.38, z + 0.4);
  }
  add(table, rbox(0.85, 0.14, 0.7, 0.06), K.cushion, 0, 0.95, -1.75);
  add(table, rbox(0.85, 0.65, 0.12, 0.06), K.wood, 0, 1.23, -2.1);
  for (const x of [-0.32, 0.32]) for (const z of [-1.5, -2])
    add(table, cyl(0.055, 0.055, 0.92, 8), K.wood, x, 0.46, z);
  for (const x of [-1.65, 1.65]) {
    add(table, cyl(0.42, 0.42, 0.12, 18), K.cushion, x, 0.78, 0);
    for (const a of [0.6, 2.2, 3.8, 5.4]) add(table, cyl(0.04, 0.04, 0.74, 6), K.wood, x + Math.cos(a) * 0.28, 0.37, Math.sin(a) * 0.28);
  }
  batchStatic(table);
  group.add(table);
  const tableSpot = { id: "table", x: 0, z: 0, hx: 2.05, hz: 1.2, top: 1.25 };
  const highChair = { id: "high-chair", x: 0, z: 0, hx: 0.5, hz: 0.48, top: 0.95 };
  obstacles.push(tableSpot, highChair);
  const meal = new THREE.Group(); meal.userData.tag = "dining-meal"; table.add(meal);
  // The front approach remains open during cooking; this extra place appears at the finale.
  const familyPlace = new THREE.Group(); familyPlace.userData.tag = "dining-chef-place";
  familyPlace.visible = false; table.add(familyPlace);
  add(familyPlace, cyl(0.4, 0.4, 0.12, 18), K.cushion, 0, 0.78, 1.75);
  for (const a of [0.6, 2.2, 3.8, 5.4])
    add(familyPlace, cyl(0.04, 0.04, 0.74, 6), K.wood, Math.cos(a) * 0.26, 0.37, 1.75 + Math.sin(a) * 0.26);
  add(familyPlace, cyl(0.3, 0.28, 0.035, 22), 0xfaf7f0, 0, 1.27, 0.65);
  batchStatic(familyPlace);
  let mealRecipe = null;

  const food = makeFood();
  const snapshot = makeSnapshotter(renderer);
  const thumbs = {};
  for (const [id, t] of Object.entries(food)) if (!id.startsWith("prep-")) thumbs[id] = snapshot(t);
  for (const id of Object.keys(RECIPES)) thumbs[`prep-${id}`] = snapshot(food[`prep-${id}`]);
  const dim = Object.fromEntries(Object.entries(thumbs).map(([id, c]) => [id, dimmed(c)]));

  const arrowTex = { supply: arrowCanvas("#4aa7ff"), prep: arrowCanvas("#ffb627"), cook: arrowCanvas("#ff7a4d"), hatch: arrowCanvas("#3dd68c"), bin: arrowCanvas("#b9a8d8") };
  const puffTex = puffTexture();
  const stations = ["fridge", "pantry", "veg", "bowl", "board", "pan", "pot", "oven", "hatch", "bin", "seat"].map((id) => {
    const st = buildStation(id, K, food);
    group.add(st.group);
    st.x = st.z = st.zx = st.zz = 0;
    if (st.kind) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(ZONE_R - 0.22, ZONE_R, 40),
        new THREE.MeshBasicMaterial({ color: ZONE_COLORS[st.kind], transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.userData.tag = "kitchen-zone";
      group.add(ring);
      st.ring = ring;
      st.arrow = spriteFrom(arrowTex[st.kind], 0.95, "kitchen-arrow");
      st.arrow.visible = false;
      group.add(st.arrow);
      st.call = 0;
    }
    if (SUPPLIES[id]) {
      // a sticker of what's kept here, floating over it
      const list = SUPPLIES[id], c = document.createElement("canvas");
      c.width = 128 * list.length; c.height = 128;
      list.forEach((ing, i) => c.getContext("2d").drawImage(thumbs[ing], i * 112, 0));
      st.label = spriteFrom(c, 1, "kitchen-label");
      st.label.scale.set(1.4 * list.length, 1.58, 1);
      st.label.userData.baseScale = st.label.scale.clone();
      group.add(st.label);
    }
    if (id === "hatch") {
      // the goal: a bell over the dining table
      const bell = new THREE.Group();
      add(bell, cyl(0.3, 0.34, 0.06, 18), K.metal, 0, 0.03, 0);
      add(bell, ball(0.24, 16, 10), new THREE.MeshStandardMaterial({ color: 0xffc531, metalness: 0.5, roughness: 0.3 }), 0, 0.08, 0, [1, 0.85, 1]);
      add(bell, ball(0.05, 8, 6), 0xffc531, 0, 0.31, 0);
      st.label = spriteFrom(snapshot(bell, { tilt: 0.35 }), 1.3, "kitchen-label");
      group.add(st.label);
    }
    if (PREP.includes(id) || COOKERS.includes(id)) { st.ringUi = makeRing(thumbs); group.add(st.ringUi.sprite); }
    if (COOKERS.includes(id)) {
      st.puffs = Array.from({ length: 6 }, (_, i) => {
        const p = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0 }));
        p.userData = { tag: "kitchen-steam", t: i / 6 };
        group.add(p);
        return p;
      });
    }
    if (id === "bin") {
      st.binPuffs = Array.from({ length: 4 }, () => {
        const p = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0 }));
        p.userData.tag = "kitchen-bin-puff";
        p.visible = false;
        group.add(p);
        return p;
      });
    }
    st.shown = [];
    return st;
  });
  const byId = Object.fromEntries(stations.map((s) => [s.id, s]));

  // clones of food for bowls, pans, hands and the floor, made on first use
  const cache = new Map();
  const model = (key, slot = 0) => {
    const k = `${key}#${slot}`;
    if (!cache.has(k)) { const c = food[key].clone(); c.userData.tag = food[key].userData.tag; cache.set(k, c); }
    return cache.get(k);
  };
  // what each cook carries over their head: [0] this device's player, [1] the other parent in a duo
  const holders = [0, 1].map((i) => {
    const g = new THREE.Group(); g.userData.tag = "food-held"; group.add(g);
    return { group: g, key: null, slot: i ? "held2" : "held" };
  });

  function applyLayout(seed) {
    const layout = kitchenLayout(seed);
    slotCabinets.forEach((c) => { c.visible = true; });
    for (const [i, c] of cupboards) c.visible = !["fridge", "pantry"].some((id) => layout[id] === i);
    for (const st of stations) {
      const slot = SLOTS[layout[st.id]];
      st.slot = layout[st.id];
      st.x = slot.x; st.z = slot.z;
      st.face = slot.face;
      st.group.position.set(slot.x, 0, slot.z);
      st.group.rotation.y = yaw(slot.face);
      st.zx = slot.x + slot.face[0] * ZONE_OUT;
      st.zz = slot.z + slot.face[1] * ZONE_OUT;
      if (st.replaces) slotCabinets[st.slot].visible = false;
      if (st.ring) st.ring.position.set(st.zx, 0.035, st.zz);
      const lift = st.id === "fridge" || st.id === "pantry" ? 4.2 : st.id === "hatch" ? 3.6 : 2.7;
      if (st.label) st.label.position.set(slot.x + slot.face[0] * 0.4, lift, slot.z + slot.face[1] * 0.4);
      if (st.arrow) st.arrow.userData.base = new THREE.Vector3(slot.x + slot.face[0] * 0.9, (st.label ? lift + 0.95 : lift), slot.z + slot.face[1] * 0.9);
      if (st.ringUi) st.ringUi.sprite.position.set(slot.x + slot.face[0] * 0.3, COUNTER_H + 1.5, slot.z + slot.face[1] * 0.3);
    }
    const spots = DINING_SPOTS;
    const [tx, tz] = spots[Math.floor(seededRng(seed + 7)() * spots.length)];
    Object.assign(tableSpot, { x: tx, z: tz });
    table.position.set(tx, 0, tz);
    Object.assign(highChair, { x: tx, z: tz - 1.75 });
    const serving = byId.hatch;
    Object.assign(serving, { x: tx, z: tz, face: [0, 1], zx: tx, zz: tz + 2.15 });
    serving.group.position.set(tx, 0, tz);
    serving.ring.position.set(serving.zx, 0.035, serving.zz);
    serving.label.position.set(tx, 1.45, serving.zz);
    serving.arrow.userData.base.set(tx, 2.5, serving.zz);
    group.userData.layout = { ...layout, table: [tx, tz] };
    return layout;
  }

  /** Where the little sister sits (world), and the way she faces. */
  function seat() {
    const st = byId.seat;
    return { x: st.x + st.face[0] * 0.1, y: COUNTER_H + 0.14, z: st.z + st.face[1] * 0.1, yaw: yaw(st.face), face: st.face };
  }

  /** Show `keys` (food template ids) on a station's anchor, reusing clones. */
  function show(st, keys) {
    const sig = keys.join(",");
    if (st.shownSig === sig) return;
    st.shownSig = sig;
    for (const o of st.shown) st.anchor.remove(o);
    st.shown = keys.map((key, i) => {
      const o = model(key, `${st.id}${i}`);
      const n = keys.length, spread = st.contents?.spread ?? 0;
      o.position.set(n > 1 ? Math.cos(i / n * Math.PI * 2) * spread : 0, 0, n > 1 ? Math.sin(i / n * Math.PI * 2) * spread * 0.7 : 0);
      o.scale.setScalar((st.contents?.scale ?? 1) * FOOD_SIZE);
      o.rotation.y = i * 1.3;
      st.anchor.add(o);
      return o;
    });
  }

  let t = 0;
  /**
   * Per frame: food in bowls/pans/oven, the carried food over her head, rings, arrows, steam.
   * `calling` is a Set of station ids worth walking to now.
   */
  function sync(dt, k, settings, { player, calling, prepping, primary = null, discard = 0, lift = 3.1, partner = null }) {
    t += dt;
    for (const id of PREP) {
      const st = byId[id], p = k.prep[id];
      show(st, p.result ? [`prep-${p.result.recipe}`] : p.contents);
      const recipe = p.result?.recipe ?? (p.order !== null ? k.orders.find((o) => o.id === p.order)?.recipe : null);
      const full = recipe && !p.result && p.contents.length === RECIPES[recipe].needs.length;
      st.ringUi.sprite.visible = !!(p.progress > 0 || full);
      if (st.ringUi.sprite.visible) st.ringUi.draw("prep", p.progress, recipe, false);
      st.anchor.rotation.y = prepping === id ? Math.sin(t * 14) * 0.25 : 0; // stirring / chopping wobble
    }
    for (const id of COOKERS) {
      const st = byId[id], c = k.cookers[id], level = cookerLevel(c, settings);
      const warn = c.state === "ready" && settings.burnAfter && level > 0.45;
      if (id === "pot") {
        show(st, []);
        st.soup.visible = c.state !== "empty";
        st.soup.material = m(c.state === "burnt" ? 0x3a2418 : c.state === "ready" ? 0xf26b3a : 0xffa04a);
        st.soup.position.y = st.foodY + (c.state === "cooking" ? Math.sin(t * 9) * 0.015 : 0);
      } else show(st, c.state === "empty" ? [] : c.state === "cooking" ? [`prep-${c.dish}`] : c.state === "burnt" ? [`burnt-${c.dish}`] : [c.dish]);
      if (st.heat) {
        st.heat.visible = c.state === "cooking";
        st.heat.material.opacity = 0.8 + Math.sin(t * 6) * 0.08;
      }
      if (st.glow) {
        st.glow.visible = c.state === "cooking" || c.state === "ready";
        st.glow.material.opacity = c.state === "cooking" ? 0.65 + Math.sin(t * 6) * 0.06 : 0.35;
      }
      st.ringUi.sprite.visible = c.state !== "empty";
      if (c.state !== "empty") st.ringUi.draw(c.state === "burnt" ? "burnt" : warn ? "warn" : c.state === "ready" ? "ready" : "cooking", level, c.dish, Math.sin(t * 12) > 0);
      if (c.state === "ready" && !warn) st.ringUi.sprite.scale.setScalar(1.45 + Math.abs(Math.sin(t * 5)) * 0.15);
      else st.ringUi.sprite.scale.setScalar(1.45);
      // steam while cooking, wisps when ready, dark smoke when it's catching or burnt
      const smoky = warn || c.state === "burnt", rate = c.state === "empty" ? 0 : smoky ? 1 : c.state === "cooking" ? 0.7 : 0.4;
      const base = st.anchor.getWorldPosition(tmp);
      for (const p of st.puffs) {
        p.userData.t = (p.userData.t + dt * (smoky ? 0.9 : 0.6)) % 1;
        const u = p.userData.t;
        p.visible = rate > 0;
        if (!p.visible) continue;
        p.position.set(base.x + Math.sin(u * 7 + p.userData.seed) * 0.25, base.y + 0.2 + u * 1.6, base.z + Math.cos(u * 5 + p.userData.seed) * 0.2);
        p.scale.setScalar(0.35 + u * (smoky ? 1.1 : 0.7));
        p.material.color.setHex(smoky ? 0x4a3f3a : 0xffffff);
        p.material.opacity = Math.sin(u * Math.PI) * rate * (smoky ? 0.8 : 0.5);
      }
    }
    // the carried thing rides over her head, like the toys do (a duo's other parent: `partner`)
    [[k.carried, player, lift], [partner?.carried, partner?.pos, partner?.lift ?? lift]].forEach(([c, at, up], i) => {
      const h = holders[i], key = !c ? null : c.type === "ing" ? c.id : c.type === "prep" ? `prep-${c.recipe}` : c.burnt ? `burnt-${c.recipe}` : c.recipe;
      if (key !== h.key) {
        h.group.clear();
        if (key) h.group.add(model(key, h.slot));
        h.key = key;
      }
      if (key) {
        h.group.position.set(at.x, at.y + up + Math.sin(t * 5 + i) * 0.05, at.z);
        h.group.rotation.y += dt * 1.5;
      }
    });
    for (const st of stations) {
      if (!st.ring) continue;
      const main = st.id === primary;
      const want = calling.has(st.id) || main;
      const discarded = st.id === "bin" && discard > 0;
      if (st.id === "bin") {
        const elapsed = discarded ? 1.2 - discard : 1.2;
        // A quick lid flap, then a tiny clack/wobble as it closes. No new meshes per disposal.
        st.lid.rotation.x = discarded ? -Math.sin(Math.min(1, elapsed / 0.65) * Math.PI) * 1.05 : 0;
        const clack = discarded && elapsed > 0.55 ? Math.sin((elapsed - 0.55) * 30) * Math.max(0, 1 - (elapsed - 0.55) / 0.45) : 0;
        st.group.rotation.y = yaw(st.face) + clack * 0.07;
        const puff = Math.max(0, Math.min(1, (elapsed - 0.18) / 0.9));
        st.binPuffs.forEach((p, i) => {
          p.visible = discarded && puff > 0 && puff < 1;
          if (!p.visible) return;
          const angle = i * Math.PI / 2, spread = 0.15 + puff * 0.5;
          p.position.set(st.x + st.face[0] * 0.35 + Math.cos(angle) * spread,
            1.3 + puff * 0.8, st.z + st.face[1] * 0.35 + Math.sin(angle) * spread);
          p.scale.setScalar(0.2 + puff * 0.45);
          p.material.opacity = Math.sin(puff * Math.PI) * 0.65;
        });
      }
      st.call += ((want ? 1 : 0) - st.call) * Math.min(1, dt * 6);
      st.ring.material.color.setHex(discarded ? 0xffb627 : ZONE_COLORS[st.kind]);
      st.ring.material.opacity = discarded ? 0.65 + Math.abs(Math.sin(t * 9)) * 0.3 : 0.28 + st.call * (main ? 0.68 : 0.4);
      st.ring.scale.setScalar(discarded ? 1.08 + Math.abs(Math.sin(t * 9)) * 0.12 : 1 + st.call * 0.08 * (1 + Math.sin(t * 6)));
      st.arrow.visible = st.call > 0.05;
      if (st.arrow.visible) {
        st.arrow.position.copy(st.arrow.userData.base);
        st.arrow.position.y += Math.abs(Math.sin(t * 4.5)) * 0.35;
        st.arrow.scale.setScalar((main ? 1.35 : 1.05) * st.call);
        st.arrow.material.opacity = main ? 1 : 0.65;
      }
      if (st.label?.userData.baseScale) st.label.scale.copy(st.label.userData.baseScale).multiplyScalar(main ? 1.08 : 1);
      if (st.label) st.label.position.y += (st.arrow.userData.base.y - 0.95 + Math.sin(t * 2 + st.slot) * 0.08 - st.label.position.y) * Math.min(1, dt * 4);
    }
  }
  const tmp = new THREE.Vector3();
  stations.forEach((st, i) => st.puffs?.forEach((p, j) => { p.userData.seed = i * 7 + j; }));

  // ingredients knocked onto the floor
  const floorMeshes = new Map();
  function syncFloor(list) {
    for (const [item, mesh] of floorMeshes) if (!list.includes(item)) { group.remove(mesh); floorMeshes.delete(item); }
    for (const item of list) {
      let mesh = floorMeshes.get(item);
      if (!mesh) { mesh = food[item.id].clone(); mesh.userData.tag = "food-floor"; group.add(mesh); floorMeshes.set(item, mesh); }
      mesh.position.set(item.x, item.y, item.z);
      mesh.rotation.set(item.rx, item.ry, 0);
      mesh.visible = item.life > 3 || Math.sin(item.life * 18) > -0.3; // blinks before it's gone
    }
  }

  function setMeal(recipe = null) {
    meal.clear(); mealRecipe = recipe;
    if (!recipe) return;
    const places = [[-0.52, 0], [0.52, 0], [0, -0.65], ...(familyPlace.visible ? [[0, 0.65]] : [])];
    places.forEach(([x, z], i) => {
      const dish = model(recipe, `dining-${i}`);
      dish.position.set(x, 1.3, z); dish.scale.setScalar(0.62); dish.rotation.y = i * 1.2;
      meal.add(dish);
    });
  }
  function setFamilyPlace(on) {
    familyPlace.visible = on; setMeal(mealRecipe);
    for (const st of stations) {
      if (st.ring) st.ring.visible = !on;
      if (st.label) st.label.visible = !on;
      if (on) { if (st.arrow) st.arrow.visible = false; if (st.ringUi) st.ringUi.sprite.visible = false; }
    }
  }
  function diningTable() {
    const { x, z } = tableSpot;
    return { x, z, meal: mealRecipe, mom: { x: x - 1.65, z, yaw: Math.PI / 2 },
      dad: { x: x + 1.65, z, yaw: -Math.PI / 2 }, baby: { x, y: 0.59, z: z - 1.75, yaw: 0 },
      chef: { x, y: 0.02, z: z + 1.75, yaw: Math.PI }, chefApproach: { x, z: z + 2.65 },
      momApproach: { x: x - 2.65, z }, dadApproach: { x: x + 2.65, z } };
  }
  applyLayout(1337);
  // Cabinet trim/knobs lie against larger opaque bodies; their separate shadows add little.
  // Keep the full visible geometry and shadows from bodies, food, utensils and the family.
  group.traverse(o => {
    if (o.isMesh && (o.material === K.trim || o.material === m(0xf2c46b))) {
      o.castShadow = false; o.userData.shadowDetailOmitted = true;
    }
  });
  return { diningTable, setMeal, setFamilyPlace, group, obstacles, stations, byId, thumbs, dim, food, snapshot, applyLayout, seat, sync, syncFloor };
}

/**
 * Litter: the toy/book/sock pool, flight-and-bounce physics, pickup-on-contact, carry stack and
 * station drop-off scoring. Split out of main.js so the characters/visuals worker can reskin the
 * three primitives (NOTES.md: "a real toy, book and sock would read better") without touching
 * the room, the kids or the sim/HUD glue in main.js.
 *
 * Score and combo state live on the shared `state` object (main.js owns it); this module only
 * mutates the fields the drop-off scoring needs (`score`, `returned`, `combo`, `comboTimer`,
 * `bestCombo`, `carried`) and reports every pickup/drop-off through `onEvent(type, data)` so
 * main.js (and, later, audio/juice) can react without this file knowing about HUD, sound or
 * particles.
 *
 *   import { KINDS, createItemLayer, spawnItem, resetItems, messCount, stepItems, stepPickup,
 *            stepCarry, stepDropoff } from "./items.js";
 */
import * as THREE from "three";
import { flat, standardMaterial } from "./materials.js";
import { POWERUPS, BLINK_TIME } from "./powerups.js";
import { RUG, resolveObstacles } from "./room.js";

/** Each litter kind, its look, and the storage spot it belongs in. */
export const KINDS = {
  toy: { home: "bin", color: 0xff5d4a, label: "toy", where: "red toy bin" },
  book: { home: "shelf", color: 0x4aa7ff, label: "book", where: "blue shelf" },
  cloth: { home: "hamper", color: 0x9bd94f, label: "sock", where: "green hamper" },
};

/**
 * Each kind's look, built once as a template Group and cloned for the pool (clones share geometry
 * and materials). Templates are modelled in their resting pose; `REST[kind]` (from each model's
 * box) is the height of the group origin when the item lies on the floor.
 *   toy   → a sitting teddy bear (red, cream snout/belly)
 *   book  → a hardcover: blue covers + spine around a cream page block, gold title band, ribbon
 *   cloth → a striped sock lying on its side: leg tube, foot, white cuff/heel/toe
 */
const matCache = new Map();
function m(color) {
  let mm = matCache.get(color);
  if (!mm) {
    mm = flat(color);
    matCache.set(color, mm);
  }
  return mm;
}
function add(g, geo, color, x, y, z, s, r) {
  const mesh = new THREE.Mesh(geo, m(color));
  mesh.position.set(x, y, z);
  if (s) mesh.scale.set(s[0], s[1], s[2]);
  if (r) mesh.rotation.set(r[0], r[1], r[2]);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}
const ball = (r, w = 12, h = 9) => new THREE.SphereGeometry(r, w, h);

function makeTeddy() {
  const g = new THREE.Group();
  const fur = KINDS.toy.color;
  const cream = 0xffe2b8;
  const ink = 0x2a1f24;
  add(g, ball(0.22), fur, 0, -0.06, 0, [1, 1.05, 0.9]); // body
  add(g, ball(0.12, 10, 8), cream, 0, -0.06, 0.15, [1, 1.1, 0.5]); // belly patch
  add(g, ball(0.19), fur, 0, 0.24, 0.02); // head
  for (const sx of [-1, 1]) {
    add(g, ball(0.075, 8, 6), fur, sx * 0.14, 0.39, 0, [1, 1, 0.7]); // ears
    add(g, ball(0.04, 8, 6), cream, sx * 0.14, 0.39, 0.04, [1, 1, 0.5]); // inner ears
    add(g, ball(0.028, 6, 5), ink, sx * 0.07, 0.29, 0.18); // eyes
    add(g, ball(0.08, 8, 6), fur, sx * 0.22, -0.02, 0.06, [0.8, 1.2, 0.8], [0.4, 0, sx * 0.5]); // arms
    add(g, ball(0.09, 8, 6), fur, sx * 0.12, -0.22, 0.14, [0.9, 0.75, 1.2]); // legs
    add(g, ball(0.05, 8, 6), cream, sx * 0.12, -0.22, 0.25, [1, 1, 0.4]); // paw pads
  }
  add(g, ball(0.085, 10, 8), cream, 0, 0.2, 0.17, [1.1, 0.85, 0.7]); // snout
  add(g, ball(0.032, 6, 5), ink, 0, 0.23, 0.225); // nose
  // a ribbon bow so it reads as a toy even from straight above
  add(g, new THREE.ConeGeometry(0.06, 0.1, 5), 0xffd166, 0.06, 0.07, 0.15, null, [0, 0, Math.PI / 2]);
  add(g, new THREE.ConeGeometry(0.06, 0.1, 5), 0xffd166, -0.06, 0.07, 0.15, null, [0, 0, -Math.PI / 2]);
  return g;
}

function makeBook() {
  const g = new THREE.Group();
  const cover = KINDS.book.color;
  const W = 0.6;
  const D = 0.78;
  add(g, new THREE.BoxGeometry(W, 0.05, D), cover, 0, -0.1, 0); // back cover
  add(g, new THREE.BoxGeometry(W, 0.05, D), cover, 0, 0.1, 0); // front cover
  add(g, new THREE.BoxGeometry(W - 0.07, 0.16, D - 0.06), 0xfff4d6, 0.03, 0, 0); // pages
  add(g, new THREE.CylinderGeometry(0.125, 0.125, D, 8, 1, false, Math.PI, Math.PI), cover, -W / 2 + 0.01, 0, 0, null, [Math.PI / 2, 0, 0]); // rounded spine
  add(g, new THREE.BoxGeometry(0.34, 0.012, 0.16), 0xffd166, 0.04, 0.13, -0.12); // title band
  add(g, new THREE.BoxGeometry(0.18, 0.012, 0.05), 0xffd166, 0.04, 0.13, 0.08); // subtitle
  add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.012, 5), 0xff5d4a, 0.04, 0.13, 0.22); // cover star dot
  add(g, new THREE.BoxGeometry(0.06, 0.01, 0.22), 0xff5d4a, 0.12, 0.0, D / 2 + 0.07, null, [0, 0.2, 0]); // ribbon
  return g;
}

function makeSock() {
  const g = new THREE.Group();
  const knit = KINDS.cloth.color;
  const white = 0xfdf6e8;
  const flatTube = [1, 1, 0.7]; // tubes turned onto Z: local z is world height
  // leg tube, lying along Z
  add(g, new THREE.CapsuleGeometry(0.155, 0.4, 4, 10), knit, -0.08, 0, -0.12, [1, 1, 0.7], [Math.PI / 2, 0, 0]);
  // foot, lying along X from the heel
  add(g, new THREE.CapsuleGeometry(0.15, 0.3, 4, 10), knit, 0.12, 0, 0.2, [0.7, 1, 1], [0, 0, Math.PI / 2]);
  const patch = 0xff8fb1;
  add(g, ball(0.165, 10, 8), patch, -0.08, 0, 0.21, [1, 0.72, 1]); // heel patch
  add(g, ball(0.16, 10, 8), patch, 0.36, 0, 0.2, [1.1, 0.72, 1]); // toe cap
  add(g, new THREE.CylinderGeometry(0.19, 0.17, 0.14, 10), white, -0.08, 0, -0.43, flatTube, [Math.PI / 2, 0, 0]); // ribbed cuff
  add(g, new THREE.CylinderGeometry(0.13, 0.13, 0.02, 10), 0x4f7a22, -0.08, 0, -0.505, flatTube, [Math.PI / 2, 0, 0]); // opening
  for (const z of [-0.27, -0.13]) {
    add(g, new THREE.CylinderGeometry(0.162, 0.162, 0.05, 10), patch, -0.08, 0, z, flatTube, [Math.PI / 2, 0, 0]); // stripes
  }
  g.scale.setScalar(1.2);
  return g;
}

/** Litter is drawn a size up from life so a teddy, a book and a sock read from the top-down camera. */
const LITTER_SIZE = 1.3;
function sized(inner) {
  inner.scale.multiplyScalar(LITTER_SIZE);
  const outer = new THREE.Group();
  outer.add(inner);
  return outer;
}
const TEMPLATES = { toy: sized(makeTeddy()), book: sized(makeBook()), cloth: sized(makeSock()) };
/** A litter kind's model (the game picker draws its stickers from these). Don't mutate it. */
export const litterModel = (kind) => TEMPLATES[kind];
// Each kind's box (template space), so a tumbling item is kept above whatever it lands on instead of
// sinking through it: `bottomOffset` is how high the origin sits when the lowest corner touches down.
const BOXES = Object.fromEntries(Object.entries(TEMPLATES).map(([kind, t]) => {
  t.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(t);
  return [kind, { c: box.getCenter(new THREE.Vector3()), h: box.getSize(new THREE.Vector3()).multiplyScalar(0.5) }];
}));
/** Origin height when lying flat on the floor (floor top is y = 0), straight from each model's box. */
const REST = Object.fromEntries(Object.entries(BOXES).map(([kind, { c, h }]) => [kind, h.y - c.y]));
const _rot = new THREE.Matrix4();
function bottomOffset(item, squashed = false) {
  const { c, h } = BOXES[item.kind];
  const e = _rot.makeRotationFromEuler(item.mesh.rotation).elements; // row 1 = e[1], e[5], e[9]
  const s = squashed ? item.mesh.scale : ONE; // the squash scales in the item's own frame
  return Math.abs(e[1]) * h.x * s.x + Math.abs(e[5]) * h.y * s.y + Math.abs(e[9]) * h.z * s.z
    - (e[1] * c.x * s.x + e[5] * c.y * s.y + e[9] * c.z * s.z);
}
const ONE = new THREE.Vector3(1, 1, 1);
/** Low furniture litter can come to rest on (Medium/Hard: table, ottoman, bed); null = floor only. */
let surfaces = null;
export function setLitterSurfaces(list) { surfaces = list; }
/** What's under (x, z): the floor, the rug's top, or a low piece's top. */
function groundAt(x, z) {
  let top = Math.hypot(x - RUG.x, z - RUG.z) < RUG.r ? RUG.top : 0;
  if (surfaces) for (const o of surfaces) {
    if (o.top && o.top > top && Math.abs(x - o.x) < o.hx && Math.abs(z - o.z) < o.hz) top = o.top;
  }
  return top;
}
const TAU = Math.PI * 2;
const nearestTurn = (a) => a - TAU * Math.round(a / TAU);

/** Live litter: in flight, on the floor, or in the player's arms. Module-local: one game at a time. */
const items = [];
const itemPool = { toy: [], book: [], cloth: [] };
let nextId = 1; // stable ids, so an online guest can match the host's items between snapshots
let layer = null;

export function createItemLayer(scene) {
  layer = new THREE.Group();
  layer.userData.tag = "litter";
  scene.add(layer);
  return layer;
}

export function spawnItem(kind, x, z, vx, vz, rng) {
  // item.mesh is one Group per item; its position/rotation/scale drive the whole shape
  const mesh = itemPool[kind].pop() ?? TEMPLATES[kind].clone();
  mesh.userData.tag = "litter";
  mesh.userData.kind = kind;
  mesh.visible = true;
  mesh.position.set(x, 1.1, z);
  mesh.rotation.set(rng() * 3, rng() * 6, rng() * 3);
  mesh.scale.setScalar(1);
  layer.add(mesh);
  const item = {
    id: nextId++,
    kind,
    mesh,
    vx,
    vz,
    vy: 3.4 + rng() * 1.4,
    py: 1.1, // physical height of the origin; the drawn height adds the squash lift on top
    spin: (rng() - 0.5) * 7,
    grounded: false,
    carried: false,
    age: 0,
    squash: 0,
  };
  items.push(item);
  return item;
}

function recycle(item) {
  layer.remove(item.mesh);
  item.mesh.visible = false;
  itemPool[item.kind].push(item.mesh);
  const i = items.indexOf(item);
  if (i >= 0) items.splice(i, 1);
}

/** The closest item lying on the floor (not carried), or null — Mom's next target. */
export function nearestFloorItem(x, z) {
  let best = null, bestD = Infinity;
  for (const item of items) {
    if (item.carried || item.flying) continue;
    const d = Math.hypot(item.mesh.position.x - x, item.mesh.position.z - z);
    if (d < bestD) { bestD = d; best = item; }
  }
  return best;
}

/** Where the floor litter lies (a probe for the harness). */
export const floorSpots = () => items.filter((it) => !it.carried && !it.flying).map((it) => ({ kind: it.kind, x: Math.round(it.mesh.position.x * 10) / 10, z: Math.round(it.mesh.position.z * 10) / 10 }));

/** Put an item straight back (Mom tidying): recycles it and returns its kind. */
export function tidyItem(item) {
  recycle(item);
  return item.kind;
}

/** A returned item leaves the carry stack and arcs into its station instead of vanishing. */
const FLIGHT = 0.38;
function launchHome(item, station, combo) {
  const p = item.mesh.position;
  item.flying = { t: 0, fx: p.x, fy: p.y, fz: p.z, tx: station.x, tz: station.z, delay: item.flightDelay ?? 0, station, combo };
}
function stepFlight(item, dt, onLand) {
  const f = item.flying;
  if (f.delay > 0) { f.delay -= dt; return; }
  f.t = Math.min(1, f.t + dt / FLIGHT);
  const k = f.t;
  item.mesh.position.set(f.fx + (f.tx - f.fx) * k, f.fy + (1.2 - f.fy) * k + Math.sin(k * Math.PI) * 1.8, f.fz + (f.tz - f.fz) * k);
  item.mesh.rotation.x += dt * 9;
  item.mesh.scale.setScalar(k > 0.8 ? 1 - (k - 0.8) * 4 : 1);
  if (k >= 1) {
    f.station.pulse = 1;
    onLand?.(item.kind, f.station, f.combo, item.mesh.position);
    item.flying = null;
    recycle(item);
  }
}

/** Clears every live item back to the pool — call from `resetGame`. */
export function resetItems() {
  for (const item of [...items]) recycle(item);
  mirrorItems([], [], 0);
}

/**
 * Online host → guest: every live item as [id, kind, x, y, z, rx, ry, rz, scale, where]
 * (where: 0 floor, 1 carried, 2 flying, 3 in `dadCarry`, the guest's own stack).
 */
export const ITEM_FIELDS = 10;
const KIND_IDS = Object.keys(KINDS);
const r3 = (v) => Math.round(v * 1000) / 1000;
export function itemsSnapshot(dadCarry = []) {
  const out = [];
  for (const it of items) {
    const m = it.mesh;
    out.push(it.id, KIND_IDS.indexOf(it.kind), r3(m.position.x), r3(m.position.y), r3(m.position.z),
      r3(m.rotation.x), r3(m.rotation.y), r3(m.rotation.z), r3(m.scale.x), dadCarry.includes(it) ? 3 : it.carried ? 1 : it.flying ? 2 : 0);
  }
  return out;
}
/**
 * The guest's copy of the host's items, part way (`k`) between snapshots `a` and `b` (matched by
 * id). Returns how many lie on the floor (the mess count for the HUD). Items in the guest's own
 * stack ride on `carrier` right now (as on the host), not where the host last saw them.
 */
const mirrored = new Map();
export function mirrorItems(a, b, k, carrier = null, dt = 0) {
  let stacked = 0;
  const before = new Map(), seen = new Set();
  for (let i = 0; i < a.length; i += ITEM_FIELDS) before.set(a[i], i);
  let mess = 0;
  for (let i = 0; i < b.length; i += ITEM_FIELDS) {
    const id = b[i], kind = KIND_IDS[b[i + 1]], j = before.get(id);
    seen.add(id);
    let mesh = mirrored.get(id);
    if (!mesh) {
      mesh = itemPool[kind].pop() ?? TEMPLATES[kind].clone();
      Object.assign(mesh.userData, { tag: "litter", kind });
      mesh.visible = true;
      layer.add(mesh);
      mirrored.set(id, mesh);
      mesh.position.set(b[i + 2], b[i + 3], b[i + 4]);
    }
    const v = (o) => (j === undefined ? b[i + o] : a[j + o] + (b[i + o] - a[j + o]) * k);
    const turn = (o) => (j === undefined ? b[i + o] : a[j + o] + nearestTurn(b[i + o] - a[j + o]) * k);
    if (b[i + 9] === 3 && carrier) {
      const p = carrier.group.position, e = Math.min(1, dt * 14);
      carryTarget.set(p.x, (carrier.carryY ?? 3.2) + stacked++ * 0.65, p.z);
      mesh.position.lerp(carryTarget, e);
      mesh.rotation.set(mesh.rotation.x * (1 - e), mesh.rotation.y + dt * 2, mesh.rotation.z * (1 - e));
      mesh.scale.setScalar(1);
      continue;
    }
    mesh.position.set(v(2), v(3), v(4));
    mesh.rotation.set(turn(5), turn(6), turn(7));
    mesh.scale.setScalar(v(8));
    if (b[i + 9] === 0) mess++;
  }
  for (const [id, mesh] of mirrored) {
    if (seen.has(id)) continue;
    layer.remove(mesh);
    mesh.visible = false;
    itemPool[mesh.userData.kind].push(mesh);
    mirrored.delete(id);
  }
  return mess;
}

export function messCount() {
  let n = 0;
  for (const it of items) if (!it.carried && !it.flying) n++;
  return n;
}

/** `onLand(kind, station, combo, position)` fires when a returned item drops into its station. */
export function stepItems(dt, ROOM, safeObstacles = null, onLand = null) {
  for (const item of [...items]) {
    item.age += dt;
    if (item.flying) { stepFlight(item, dt, onLand); continue; }
    if (item.carried) continue;
    if (!item.grounded) {
      item.vy -= 16 * dt;
      item.mesh.position.x += item.vx * dt;
      item.mesh.position.z += item.vz * dt;
      item.py += item.vy * dt;
      item.mesh.rotation.y += item.spin * dt;
      item.mesh.rotation.x += item.spin * 0.6 * dt;
      item.vx *= 1 - 2.2 * dt;
      item.vz *= 1 - 2.2 * dt;
      // Solid ground: the lowest corner of the tumbling item never goes below the floor / rug / top.
      const ground = groundAt(item.mesh.position.x, item.mesh.position.z), off = bottomOffset(item);
      if (item.py - off <= ground) {
        item.py = ground + off;
        item.squash = Math.min(1, Math.abs(item.vy) / 7 + 0.35); // every contact squashes it
        if (item.vy < -1.8) {
          // a little bounce: loses most of its height, skids, tumbles slower
          item.vy *= -0.42;
          item.vx *= 0.65;
          item.vz *= 0.65;
          item.spin *= 0.55;
        } else {
          // settle: tip over onto its resting side over a moment rather than snapping flat
          item.grounded = true;
          item.vy = 0;
          item.settle = 1;
          item.mesh.rotation.x = nearestTurn(item.mesh.rotation.x);
          item.mesh.rotation.z = nearestTurn(item.mesh.rotation.z);
        }
      }
      item.mesh.position.y = item.py;
      const pos = item.mesh.position;
      pos.x = THREE.MathUtils.clamp(pos.x, -ROOM.hx + 0.5, ROOM.hx - 0.5);
      pos.z = THREE.MathUtils.clamp(pos.z, -ROOM.hz + 0.5, ROOM.hz - 0.5);
    } else {
      const ground = groundAt(item.mesh.position.x, item.mesh.position.z);
      if (item.settle > 0) {
        item.settle = Math.max(0, item.settle - dt * 6);
        const k = item.settle > 0 ? Math.min(1, dt * 14) : 1;
        item.mesh.rotation.x *= 1 - k;
        item.mesh.rotation.z *= 1 - k;
        item.mesh.position.y = ground + bottomOffset(item);
      } else {
        // a gentle bob marks what is still lying around
        item.mesh.position.y = ground + REST[item.kind] + (1 + Math.sin(item.age * 3 + item.mesh.position.x)) * 0.035;
        item.mesh.rotation.y += dt * 0.5;
      }
    }
    // landing squash-and-stretch: a damped wobble back to round
    if (item.squash > 0) {
      item.squash = Math.max(0, item.squash - dt * 3.5);
      const y = 1 - 0.32 * item.squash * Math.cos((1 - item.squash) * Math.PI * 3);
      item.mesh.scale.set(1 / Math.sqrt(y), y, 1 / Math.sqrt(y));
      // the scale pivots on the origin, so keep the bottom planted: lift while stretched, lower the
      // origin while squashed (it reads as pressing into the floor, never through it)
      item.mesh.position.y += bottomOffset(item, true) - bottomOffset(item);
    }
    // Easy's small floor cap must not get stuck on items hidden inside furniture.
    if (safeObstacles && item.grounded) resolveObstacles(safeObstacles, item.mesh.position, 0.45);
  }
}

/** Auto-pickup on contact, up to `carryLimit`. Appends picked items to `state.carried`. */
export function stepPickup(state, bigSib, pickupRadius, carryLimit, onEvent) {
  if (state.carried.length >= carryLimit) return;
  const p = bigSib.group.position;
  for (const item of items) {
    if (item.carried || item.flying) continue;
    const near = Math.hypot(item.mesh.position.x - p.x, item.mesh.position.z - p.z) < pickupRadius;
    if (!near) continue;
    item.carried = true;
    item.squash = 0;
    item.mesh.scale.setScalar(1);
    state.carried.push(item);
    onEvent?.("pickup", { kind: item.kind, position: p });
    if (state.carried.length >= carryLimit) return;
  }
}

const carryTarget = new THREE.Vector3();

export function stepCarry(dt, state, bigSib) {
  const p = bigSib.group.position;
  const k = Math.min(1, dt * 14);
  state.carried.forEach((item, i) => {
    carryTarget.set(p.x, (bigSib.carryY ?? 3.2) + i * 0.65, p.z); // a grown-up carries higher
    item.mesh.position.lerp(carryTarget, k);
    item.mesh.rotation.y += dt * 2;
    // settle upright so the stack reads by shape: teddy sitting, book flat, sock lying
    item.mesh.rotation.x *= 1 - k;
    item.mesh.rotation.z *= 1 - k;
  });
}

/** Matching-kind drop-off inside a station ring: scores, advances combo, recycles the item. */
export function stepDropoff(state, bigSib, stations, dropoffRadius, onEvent) {
  if (!state.carried.length) return;
  const p = bigSib.group.position;
  for (const s of stations) {
    if (Math.hypot(s.x - p.x, s.z - p.z) > dropoffRadius) continue;
    const matching = state.carried.filter((it) => it.kind === s.kind);
    if (!matching.length) continue;
    matching.forEach((item, i) => { item.flightDelay = i * 0.08; });
    for (const item of matching) {
      // the faster it comes back, the more it is worth
      const speedBonus = Math.max(0, 1 - item.age / 14);
      const points = state.mode === "easy" ? 100 : Math.round(40 + 120 * speedBonus) + state.combo * 10;
      state.score += points;
      state.returned += 1;
      state.combo += 1;
      state.comboTimer = 3.5;
      state.bestCombo = Math.max(state.bestCombo, state.combo);
      s.stored += 1;
      state.carried.splice(state.carried.indexOf(item), 1);
      launchHome(item, s, state.combo);
      onEvent?.("dropoff", { kind: item.kind, points, combo: state.combo, station: s, position: p });
    }
  }
}

/** Power-up floor token: a bobbing bubble with a modelled icon (snail, basket, magnet). */
export function createPowerupToken(scene) {
  const tint = (hex, seed) => {
    const c = new THREE.Color(hex);
    const mat = standardMaterial({ kind: "plaster", seed, palette: [c.clone().multiplyScalar(0.8).getHex(), hex, c.clone().lerp(new THREE.Color(0xffffff), 0.3).getHex()], bumpScale: 0.1 });
    mat.emissive = c; mat.emissiveIntensity = 0.35;
    return mat;
  };
  const silver = tint(0xdfe6ee, 4);
  const group = new THREE.Group();
  group.userData.tag = "powerup";
  const icons = {};
  const piece = (icon, geo, mat, pos, rot) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...pos);
    if (rot) mesh.rotation.set(...rot);
    mesh.castShadow = true;
    icon.add(mesh);
  };
  for (const [kind, info] of Object.entries(POWERUPS)) {
    const icon = new THREE.Group(), mat = tint(info.color, kind.length * 7);
    if (kind === "slow") {
      piece(icon, new THREE.TorusGeometry(0.26, 0.14, 12, 24), mat, [0, 0.12, 0]);
      piece(icon, new THREE.SphereGeometry(0.12, 12, 8), mat, [0, 0.12, 0]);
      piece(icon, new THREE.CapsuleGeometry(0.11, 0.55, 4, 10), tint(0xffd6a0, 3), [0, -0.18, 0.05], [0, 0, Math.PI / 2]);
      for (const x of [0.32, 0.42]) piece(icon, new THREE.SphereGeometry(0.05, 8, 6), silver, [x, 0.05, 0.08]);
    } else if (kind === "carry") {
      piece(icon, new THREE.CylinderGeometry(0.42, 0.32, 0.4, 20, 1, true), mat, [0, -0.08, 0]);
      piece(icon, new THREE.CircleGeometry(0.32, 20), mat, [0, -0.28, 0], [Math.PI / 2, 0, 0]);
      piece(icon, new THREE.TorusGeometry(0.42, 0.05, 8, 24), silver, [0, 0.12, 0], [Math.PI / 2, 0, 0]);
      piece(icon, new THREE.TorusGeometry(0.34, 0.04, 8, 16, Math.PI), silver, [0, 0.12, 0]);
    } else if (kind === "mom") {
      // a plump heart: two lobes and a point
      for (const x of [-0.17, 0.17]) piece(icon, new THREE.SphereGeometry(0.24, 16, 12), mat, [x, 0.1, 0]);
      piece(icon, new THREE.ConeGeometry(0.33, 0.45, 20), mat, [0, -0.2, 0], [Math.PI, 0, 0]);
    } else {
      piece(icon, new THREE.TorusGeometry(0.3, 0.12, 10, 20, Math.PI), mat, [0, 0, 0], [0, 0, Math.PI]);
      for (const x of [-0.3, 0.3]) piece(icon, new THREE.CylinderGeometry(0.12, 0.12, 0.2, 12), silver, [x, 0.1, 0]);
    }
    icon.visible = false;
    icons[kind] = icon;
    group.add(icon);
  }
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.75, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, roughness: 0.1, emissive: 0xffffff, emissiveIntensity: 0.15, depthWrite: false }));
  group.add(bubble);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.05, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.userData.tag = "powerup";
  scene.add(group, ring);
  group.visible = ring.visible = false;
  let t = 0;
  return {
    /** Mirror `pu.field` ({kind, x, z, life} or null) into the scene. */
    sync(field, dt) {
      group.visible = ring.visible = !!field;
      if (!field) return;
      t += dt;
      for (const [kind, icon] of Object.entries(icons)) icon.visible = kind === field.kind;
      ring.material.color.setHex(POWERUPS[field.kind].color);
      // blink faster as the token is about to vanish
      const blink = field.life < BLINK_TIME && Math.sin(t * (10 + (BLINK_TIME - field.life) * 6)) < 0;
      group.visible = !blink;
      group.position.set(field.x, 1.2 + Math.sin(t * 2.6) * 0.18, field.z);
      group.rotation.y = t * 1.6;
      ring.position.set(field.x, 0.15, field.z);
      ring.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
    },
  };
}

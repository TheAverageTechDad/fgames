/**
 * Game feel for Clean-Up Chase — particle bursts and screen shake on top of the sim in main.js.
 *
 *   initJuice(scene);                    // once, after the room/characters exist
 *   stepJuice(dt, camera);               // every simulation step, before the camera reads shakeOffset()
 *   burstPickup(position, color, rng);   // a colourful pop where the big sibling scooped something up
 *   burstDropoff(position, color, rng);  // confetti fountain + floor shockwave at the home spot, and a
 *                                        // camera punch — all three escalate with back-to-back returns
 *   shake(amount); shakeOffset();        // decaying camera punch (main.js adds the offset each frame)
 *
 * Purely cosmetic: nothing here writes `state`, the score, the timer or any gameplay value.
 *
 * Randomness: every burst is driven by a small local PRNG seeded from the event itself (position,
 * colour, combo level). The `rng` argument is accepted but deliberately NOT consumed — main.js
 * passes the game's own stream, and drawing from it would shift every later toddler drop, i.e.
 * the cosmetics would change the game. Seeding from the event keeps a capture at a given seed
 * pixel-identical while leaving the sim untouched. No Math.random, no wall clock.
 *
 * Cost: four InstancedMeshes (confetti, puffs, sparkles, stars) + a pool of 8 shockwave rings,
 * all allocated once in initJuice. Per-frame work writes into preallocated typed arrays/matrices.
 */
import * as THREE from "three";
import { createScreenCelebration } from "./screen-celebration.js";

const TAG = "juice";
const PARTY = [0xff7a4d, 0x86ceff, 0x6ce6b8, 0xffd23f, 0xff7aa8, 0xa993ff];
let celebrationCount = 0, celebrationLeft = 0;
const screenCelebration = createScreenCelebration();

// ───────────────────────────── deterministic local randomness ─────────────────────────────

let seedState = 0x9e3779b9;
function reseed(a, b, c, d) {
  let h = 0x811c9dc5 ^ (a | 0);
  h = Math.imul(h ^ (b | 0), 0x01000193);
  h = Math.imul(h ^ (c | 0), 0x01000193);
  h = Math.imul(h ^ (d | 0), 0x01000193);
  seedState = h >>> 0 || 1;
}
function rand() {
  // mulberry32
  seedState = (seedState + 0x6d2b79f5) >>> 0;
  let t = seedState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rr = (a, b) => a + (b - a) * rand();

// ───────────────────────────── particle pools ─────────────────────────────

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _white = new THREE.Color(0xffffff);
function uploadRange(attribute, count) {
  attribute.clearUpdateRanges(); attribute.addUpdateRange(0, count); attribute.needsUpdate = true;
}

/**
 * One pool = one InstancedMesh + flat typed arrays. `curve` shapes the scale over life:
 *  "pop"   — snaps up to full size fast, holds, then shrinks to nothing (confetti, stars)
 *  "puff"  — swells while shrinking out (soft dust / smoke balls)
 */
class Pool {
  constructor(scene, geometry, material, size, { gravity = 0, drag = 0, bounce = false, curve = "pop", billboard = false }) {
    this.n = size;
    this.gravity = gravity;
    this.drag = drag;
    this.bounce = bounce;
    this.curve = curve;
    this.billboard = billboard;
    this.mesh = new THREE.InstancedMesh(geometry, material, size);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.userData.tag = TAG;
    this.mesh.name = "juice-" + material.name;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    for (let i = 0; i < size; i++) this.mesh.setColorAt(i, _white);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.pos = new Float32Array(size * 3);
    this.vel = new Float32Array(size * 3);
    this.rot = new Float32Array(size * 3);
    this.spin = new Float32Array(size * 3);
    this.age = new Float32Array(size);
    this.life = new Float32Array(size).fill(0);
    this.scale = new Float32Array(size);
    this.color = new Float32Array(size * 3).fill(1);
    if (billboard) {
      this.alpha = new Float32Array(size);
      geometry.setAttribute("puffAlpha", new THREE.InstancedBufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    }
    this.cursor = 0;
    this.alive = 0;
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < size; i++) this.mesh.setMatrixAt(i, _m);
    this.mesh.visible = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  clear() {
    this.life.fill(0);
    this.age.fill(0);
    this.cursor = 0;
    this.alive = 0;
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < this.n; i++) this.mesh.setMatrixAt(i, _m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = false;
    this.mesh.count = 0;
  }

  spawn(x, y, z, vx, vy, vz, life, scale, color, spin = 8) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.n;
    const k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.rot[k] = rand() * 6.28; this.rot[k + 1] = rand() * 6.28; this.rot[k + 2] = rand() * 6.28;
    this.spin[k] = rr(-spin, spin); this.spin[k + 1] = rr(-spin, spin); this.spin[k + 2] = rr(-spin, spin);
    this.age[i] = 0;
    this.life[i] = life;
    this.scale[i] = scale;
    this.color[k] = color.r; this.color[k + 1] = color.g; this.color[k + 2] = color.b;
    this.mesh.visible = true;
  }

  step(dt) {
    let alive = 0;
    const damp = Math.max(0, 1 - this.drag * dt);
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      const k = i * 3;
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      if (t >= 1) {
        this.life[i] = 0;
        continue;
      }
      alive++;
      this.vel[k + 1] -= this.gravity * dt;
      this.vel[k] *= damp; this.vel[k + 1] *= damp; this.vel[k + 2] *= damp;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.bounce && this.pos[k + 1] < 0.08) {
        this.pos[k + 1] = 0.08;
        this.vel[k + 1] = Math.abs(this.vel[k + 1]) * 0.35;
        this.vel[k] *= 0.6; this.vel[k + 2] *= 0.6;
        this.spin[k] *= 0.5; this.spin[k + 2] *= 0.5;
      }
      this.rot[k] += this.spin[k] * dt;
      this.rot[k + 1] += this.spin[k + 1] * dt;
      this.rot[k + 2] += this.spin[k + 2] * dt;

      let sc;
      if (this.curve === "puff") sc = (0.55 + 0.9 * t) * (1 - t * t);
      else sc = Math.min(1, t * 9) * (t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1);
      sc *= this.scale[i];

      if (this.billboard) _q.identity();
      else { _e.set(this.rot[k], this.rot[k + 1], this.rot[k + 2]); _q.setFromEuler(_e); }
      _p.set(this.pos[k], this.pos[k + 1], this.pos[k + 2]);
      _s.set(sc, sc, sc);
      _m.compose(_p, _q, _s);
      // Upload/render live instances only; slot storage stays stable for deterministic bursts.
      this.mesh.setMatrixAt(alive - 1, _m);
      this.mesh.setColorAt(alive - 1, _c.fromArray(this.color, k));
      if (this.alpha) this.alpha[alive - 1] = Math.min(1, t * 10) * (1 - t) * (1 - t);
    }
    this.alive = alive;
    if (alive > 0) {
      uploadRange(this.mesh.instanceMatrix, alive * 16);
      uploadRange(this.mesh.instanceColor, alive * 3);
      if (this.alpha) uploadRange(this.mesh.geometry.attributes.puffAlpha, alive);
    }
    this.mesh.count = alive;
    this.mesh.visible = alive > 0;
  }
}

/** Soft camera-facing dust: two triangles per puff, one shared texture and one pooled draw. */
function softPuffMaterial() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), glow = g.createRadialGradient(32, 32, 0, 32, 32, 31);
  glow.addColorStop(0, "rgba(255,255,255,0.8)");
  glow.addColorStop(.35, "rgba(255,255,255,0.65)");
  glow.addColorStop(.7, "rgba(255,255,255,0.2)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = glow; g.fillRect(0, 0, 64, 64);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map, name: "puff", color: 0xffffff,
    transparent: true, depthWrite: false, alphaTest: .005, opacity: .8 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = "attribute float puffAlpha;\nvarying float vPuffAlpha;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `
      vPuffAlpha = puffAlpha;
      vec4 mvPosition = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);
      mvPosition.xy += position.xy * vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
      gl_Position = projectionMatrix * mvPosition;
    `);
    shader.fragmentShader = "varying float vPuffAlpha;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <alphatest_fragment>", "diffuseColor.a *= vPuffAlpha;\n#include <alphatest_fragment>");
  };
  material.customProgramCacheKey = () => "catcha-soft-instanced-puffs-v1";
  material.userData.baked = "soft-dust";
  return material;
}

/** Expanding flat floor rings — a shockwave you can read from the top-down camera. */
class Rings {
  constructor(scene, size) {
    this.items = [];
    const geo = new THREE.RingGeometry(0.78, 1, 40);
    for (let i = 0; i < size; i++) {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 3;
      mesh.visible = false;
      mesh.userData.tag = TAG;
      mesh.name = "juice-ring";
      scene.add(mesh);
      this.items.push({ mesh, age: 0, life: 0, from: 0.3, to: 2, delay: 0, alpha: 0.9 });
    }
    this.cursor = 0;
  }
  spawn(x, y, z, color, from, to, life, delay = 0, alpha = 0.9) {
    const r = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    r.mesh.position.set(x, y, z);
    r.mesh.material.color.setHex(color);
    r.age = -delay;
    r.life = life;
    r.from = from;
    r.to = to;
    r.alpha = alpha;
    r.mesh.visible = false;
  }
  step(dt) {
    for (const r of this.items) {
      if (r.life <= 0) continue;
      r.age += dt;
      if (r.age < 0) continue;
      const t = r.age / r.life;
      if (t >= 1) {
        r.life = 0;
        r.mesh.visible = false;
        continue;
      }
      const ease = 1 - (1 - t) * (1 - t) * (1 - t);
      r.mesh.scale.setScalar(r.from + (r.to - r.from) * ease);
      r.mesh.material.opacity = r.alpha * (1 - t);
      r.mesh.visible = true;
    }
  }
}

// ───────────────────────────── module state ─────────────────────────────

let confetti = null; // tumbling paper chips, gravity + floor bounce
let puffs = null; // soft balls that swell and vanish
let sparkles = null; // small spinning diamonds, light gravity
let stars = null; // bigger gold stars for the combo flourish
let rings = null;
let ready = false;

const stations = []; // { x, z, color: THREE.Color, hex, acc }
let player = null;
const lastPlayer = new THREE.Vector3();
let dustAcc = 0;
/** 1 right after a sprint burst, decays to 0: the dust trail starts big and tapers to normal. */
let dashBoost = 0;
let ambientT = 0;

// combo as juice sees it: back-to-back burstDropoff calls inside COMBO_WINDOW (mirrors main.js's 3.5s)
const COMBO_WINDOW = 3.5;
let comboLevel = 0;
let comboClock = 0;

// shake: trauma decays; offset is a deterministic damped wobble
let trauma = 0;
let shakeTime = 0;
const shakeWanted = { x: 0, y: 0, z: 0 };
const shakePrev = { x: 0, y: 0, z: 0 };
const shakeOut = { x: 0, y: 0, z: 0 };

const colA = new THREE.Color();
const colB = new THREE.Color();
const GOLD = 0xffd23f;
const CREAM = 0xfff4dc;

function nearestStation(x, z) {
  let best = null;
  let bd = Infinity;
  for (const s of stations) {
    const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return bd < 36 ? best : null;
}

// ───────────────────────────── public API ─────────────────────────────

/** Call once after the scene has its room/characters, before the first frame. */
export function initJuice(scene) {
  if (ready) return;
  ready = true;

  const chipGeo = new THREE.BoxGeometry(0.34, 0.07, 0.22);
  const chipMat = new THREE.MeshLambertMaterial({ color: 0xffffff, name: "confetti", emissive: 0x222222 });
  confetti = new Pool(scene, chipGeo, chipMat, 260, { gravity: 13, drag: 1.2, bounce: true, curve: "pop" });

  const puffGeo = new THREE.PlaneGeometry(.92, .92);
  puffs = new Pool(scene, puffGeo, softPuffMaterial(), 120, { gravity: -1.2, drag: 3.5, curve: "puff", billboard: true });

  const sparkGeo = new THREE.OctahedronGeometry(0.22, 0);
  sparkGeo.scale(1, 1.7, 1);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff, name: "sparkle", toneMapped: false });
  sparkles = new Pool(scene, sparkGeo, sparkMat, 220, { gravity: 2.5, drag: 1.6, curve: "pop" });

  // a chunky five-point star, extruded so it reads as a cartoon pickup star from above
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? 0.42 : 0.18;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const starGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
  starGeo.center();
  const starMat = new THREE.MeshLambertMaterial({ color: 0xffffff, name: "star", emissive: 0x4a3a00 });
  stars = new Pool(scene, starGeo, starMat, 60, { gravity: 9, drag: 1.0, bounce: true, curve: "pop" });

  rings = new Rings(scene, 10);

  scene.traverse((o) => {
    const tag = o.userData?.tag;
    if (tag === "player" && !player) player = o;
    if (typeof tag === "string" && /^station-(bin|shelf|hamper)$/.test(tag)) {
      let hex = 0xffffff;
      o.traverse((c) => {
        if (c.geometry?.type === "RingGeometry" && c.material?.color) hex = c.material.color.getHex();
      });
      o.updateWorldMatrix(true, false);
      const wp = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
      stations.push({ group: o, x: wp.x, z: wp.z, hex, color: new THREE.Color(hex), acc: 0 });
    }
  });
  resetJuice();
}

/** Clear the previous run and move ambience with its actual storage groups after a reshuffle. */
export function resetJuice() {
  if (!ready) return;
  for (const pool of [confetti, puffs, sparkles, stars]) pool.clear();
  rings.cursor = 0;
  for (const r of rings.items) { r.life = 0; r.age = 0; r.mesh.visible = false; }
  comboLevel = 0;
  celebrationCount = celebrationLeft = 0;
  screenCelebration.reset();
  comboClock = 0;
  dustAcc = 0;
  dashBoost = 0;
  ambientT = 0;
  trauma = 0;
  shakeTime = 0;
  seedState = 0x9e3779b9;
  for (const vector of [shakeWanted, shakePrev, shakeOut]) { vector.x = 0; vector.y = 0; vector.z = 0; }
  for (const s of stations) {
    s.group.updateWorldMatrix(true, false);
    s.x = s.group.matrixWorld.elements[12];
    s.z = s.group.matrixWorld.elements[14];
    s.acc = 0;
  }
  if (player) lastPlayer.copy(player.position);

}

/** Call every simulation step, after the camera has been positioned for this frame. */
export function stepJuice(dt, _camera) {
  if (!ready) return;
  ambientT += dt;
  celebrationLeft = Math.max(0, celebrationLeft - dt);
  screenCelebration.step(dt);

  // combo window
  if (comboLevel > 0) {
    comboClock -= dt;
    if (comboClock <= 0) comboLevel = 0;
  }


  // running dust: little cream puffs kicked up behind the big sibling's feet
  if (player) {
    const p = player.position;
    const dx = p.x - lastPlayer.x;
    const dz = p.z - lastPlayer.z;
    const speed = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
    if (speed > 1.5 && speed < 40) {
      dustAcc += dt * (speed > 8 ? 18 : 11) * (1 + dashBoost * 1.5);
      while (dustAcc >= 1) {
        dustAcc -= 1;
        const nx = -dx / (speed * dt);
        const nz = -dz / (speed * dt);
        colA.setHex(CREAM);
        puffs.spawn(
          p.x + nx * 0.35 + rr(-0.2, 0.2), 0.18, p.z + nz * 0.35 + rr(-0.2, 0.2),
          nx * rr(0.8, 1.6) + rr(-0.5, 0.5), rr(0.6, 1.2), nz * rr(0.8, 1.6) + rr(-0.5, 0.5),
          rr(0.45, 0.6) * (1 + dashBoost * 0.5), rr(0.7, 1.05) * (1 + dashBoost * 1.3), colA, 2,
        );
      }
    } else dustAcc = 0;
    lastPlayer.copy(p);
    dashBoost = Math.max(0, dashBoost - dt * 1.4);
  }

  confetti.step(dt);
  puffs.step(dt);
  sparkles.step(dt);
  stars.step(dt);
  rings.step(dt);

  // shake. main.js lerps the camera from its *previous* (already shaken) position by k = 3·dt and
  // then adds our offset, so a raw offset would integrate into drift. Hand back the difference that
  // makes the camera's net displacement equal the wanted wobble this frame.
  trauma = Math.max(0, trauma - dt * 2.6);
  shakeTime += dt;
  const amp = trauma * trauma;
  const decay = 1 - Math.min(1, dt * 3);
  shakeWanted.x = amp * Math.sin(shakeTime * 47) * 0.9;
  shakeWanted.y = amp * (Math.sin(shakeTime * 61 + 1.3) * 0.6 - 0.35 * trauma);
  shakeWanted.z = amp * Math.sin(shakeTime * 53 + 2.1) * 0.9;
  shakeOut.x = shakeWanted.x - decay * shakePrev.x;
  shakeOut.y = shakeWanted.y - decay * shakePrev.y;
  shakeOut.z = shakeWanted.z - decay * shakePrev.z;
  shakePrev.x = shakeWanted.x;
  shakePrev.y = shakeWanted.y;
  shakePrev.z = shakeWanted.z;
}

/** A litter item was just picked up at `position` (a Vector3-like `{x,y,z}`). */
export function burstPickup(position, color, _rng) {
  if (!ready || !position) return;
  const x = position.x;
  const z = position.z;
  reseed(x * 997, z * 991, color, 7);
  colA.setHex(color);
  colB.copy(colA).lerp(_white, 0.55);

  // a puff ring that pops outward at hip height
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.4;
    const sp = rr(3.2, 4.4);
    puffs.spawn(x, 0.7, z, Math.cos(a) * sp, rr(0.5, 1.6), Math.sin(a) * sp, rr(0.35, 0.5), rr(0.55, 0.8), i % 2 ? colA : colB, 3);
  }
  // sparkles leaping up out of the grab
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2;
    const sp = rr(1.2, 3.2);
    sparkles.spawn(x, 0.9, z, Math.cos(a) * sp, rr(4.5, 7.5), Math.sin(a) * sp, rr(0.45, 0.65), rr(0.9, 1.4), i % 3 ? colA : _white, 10);
  }
  rings.spawn(x, 0.16, z, color, 0.3, 1.9, 0.4, 0, 0.85);
  shake(0.12);
}

/** A litter item was just returned at `position`. Escalates with back-to-back returns. */
export function burstDropoff(position, color, _rng) {
  if (!ready || !position) return;
  comboLevel = Math.min(comboLevel + 1, 8);
  comboClock = COMBO_WINDOW;
  const lvl = comboLevel; // 1 = first return, 2+ = combo
  const boost = 1 + 0.35 * (lvl - 1);

  const st = nearestStation(position.x, position.z);
  const sx = st ? st.x : position.x;
  const sz = st ? st.z : position.z;
  reseed(sx * 997, sz * 991, color, lvl * 131 + Math.floor(position.x * 53 + position.z * 29));
  colA.setHex(color);
  colB.copy(colA).lerp(_white, 0.5);

  // confetti fountain out of the home spot, in the item's colour, white and gold
  const chips = Math.min(150, Math.round(36 * boost));
  for (let i = 0; i < chips; i++) {
    const a = rand() * Math.PI * 2;
    const sp = rr(1.8, 4.2) * Math.sqrt(boost);
    // combos mix gold into the confetti
    const gold = lvl >= 2 && i % 4 === 2;
    if (gold) _c.setHex(GOLD);
    const c = gold ? _c : i % 5 === 0 ? _white : i % 5 === 1 ? colB : colA;
    confetti.spawn(sx + rr(-0.4, 0.4), 1.4, sz + rr(-0.4, 0.4), Math.cos(a) * sp, rr(6, 9.5) * Math.min(1.5, Math.sqrt(boost)), Math.sin(a) * sp,
      rr(0.6, 0.85), rr(0.9, 1.3), c, 14);
  }
  // fat colour puffs bursting out at floor level
  const pn = Math.min(22, 12 + 2 * lvl);
  for (let i = 0; i < pn; i++) {
    const a = (i / pn) * Math.PI * 2;
    const sp = rr(4.5, 6) * Math.min(1.6, Math.sqrt(boost));
    puffs.spawn(sx, 0.5, sz, Math.cos(a) * sp, rr(0.4, 1.4), Math.sin(a) * sp, rr(0.45, 0.6), rr(0.9, 1.25), i % 2 ? colA : colB, 3);
  }
  // sparkle spray at the player too, so the moment reads even if the camera lags behind
  for (let i = 0; i < 10 + 2 * lvl; i++) {
    const a = rand() * Math.PI * 2;
    sparkles.spawn(position.x, 1.0, position.z, Math.cos(a) * rr(1.5, 3.5), rr(4, 7), Math.sin(a) * rr(1.5, 3.5), rr(0.45, 0.7), rr(1, 1.5), i % 2 ? colA : _white, 10);
  }
  // floor shockwaves: one per combo step (up to three), staggered
  const waves = Math.min(3, lvl);
  for (let w = 0; w < waves; w++) {
    rings.spawn(sx, 0.17 + w * 0.01, sz, w === 2 ? GOLD : color, 0.6, (3.2 + w * 0.9) * Math.min(1.5, Math.sqrt(boost)), 0.55, w * 0.09, 0.95);
  }

  // big moment: a 3+ combo throws a gold star crown and a white flash ring
  if (lvl >= 3) {
    const sn = Math.min(18, 6 + 3 * (lvl - 2));
    for (let i = 0; i < sn; i++) {
      const a = (i / sn) * Math.PI * 2;
      _c.setHex(GOLD);
      stars.spawn(sx, 2.0, sz, Math.cos(a) * 4.2, rr(7, 9), Math.sin(a) * 4.2, rr(0.7, 0.85), rr(1.1, 1.5), _c, 7);
    }
    rings.spawn(sx, 0.2, sz, 0xffffff, 1, 6.5, 0.6, 0.05, 0.8);
  }

  shake(Math.min(0.62, 0.3 + 0.08 * (lvl - 1)));
}

/** Rainbow fountains at a completed goal; wins also burst across the whole screen. */
export function burstCelebration(position, finale = false) {
  if (!ready || !position) return;
  celebrationCount += 1; celebrationLeft = finale ? 3.6 : 2.1;
  if (finale) screenCelebration.burst((position.x * 997 ^ position.z * 991 ^ 0xcafe) >>> 0);
  reseed(position.x * 997, position.z * 991, 0xcafe, finale ? 31 : 17);
  const fountains = finale ? [-2.8, 2.8] : [0];
  for (const offset of fountains) {
    const x = position.x + offset, z = position.z;
    const chips = finale ? 88 : 52;
    for (let i = 0; i < chips; i++) {
      const a = rand() * Math.PI * 2, speed = rr(1.3, finale ? 3 : 2.1);
      _c.setHex(PARTY[i % PARTY.length]);
      confetti.spawn(x + rr(-0.25, 0.25), 1.15, z + rr(-0.25, 0.25), Math.cos(a) * speed,
        rr(finale ? 8 : 5, finale ? 12 : 8), Math.sin(a) * speed, rr(celebrationLeft - 0.4, celebrationLeft), rr(0.7, 1), _c, 10);
    }
    for (let i = 0; i < (finale ? 16 : 8); i++) {
      const a = rand() * Math.PI * 2;
      _c.setHex(i % 2 ? GOLD : 0xffffff);
      sparkles.spawn(x, 1.6, z, Math.cos(a) * 2, rr(4, 7), Math.sin(a) * 2, rr(1.3, 2.2), rr(0.7, 1), _c, 6);
    }
  }
}

/** Last HUD item: crisp confetti in front of the room, walls and result card. */
export function drawCelebration(hud) {
  if (screenCelebration.active()) hud.paint("screen-celebration", screenCelebration.paint, screenCelebration.snapshot().revision);
  else hud.remove("screen-celebration");
}

/** Adds a camera-shake impulse (trauma, 0..1); main.js adds `shakeOffset()` each frame. */
export function shake(amount) {
  trauma = Math.min(1, trauma + Math.max(0, amount || 0));
}

/** The offset to add to the camera position this frame, `{x,y,z}` (a reused object — read, don't keep). */
export function shakeOffset() {
  return shakeOut;
}

/** Read-only view for debugging / probes. */
export function juiceStats() {
  return {
    stationPositions: stations.map(({ x, z, hex }) => ({ x, z, color: hex })),
    particles: (confetti?.alive ?? 0) + (puffs?.alive ?? 0) + (sparkles?.alive ?? 0) + (stars?.alive ?? 0),
    comboLevel,
    trauma: Number(trauma.toFixed(3)),
    celebration: { bursts: celebrationCount, remaining: Number(celebrationLeft.toFixed(2)), screen: screenCelebration.snapshot() },
  };
}

/** A soft collision: a dust puff for furniture, a ring of little stars for bumping the toddler. */
export function burstBump(position, color, toddler = false) {
  if (!ready || !position) return;
  const x = position.x, z = position.z;
  reseed(x * 613, z * 617, color, toddler ? 3 : 5);
  colA.setHex(color);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    puffs.spawn(x, 0.4, z, Math.cos(a) * 2.2, rr(0.3, 0.9), Math.sin(a) * 2.2, rr(0.3, 0.45), rr(0.4, 0.6), colA, 3);
  }
  if (toddler) {
    _c.setHex(GOLD);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      stars.spawn(x, 1.9, z, Math.cos(a) * 1.6, rr(2.5, 3.5), Math.sin(a) * 1.6, rr(0.6, 0.8), rr(0.5, 0.7), _c, 6);
    }
  }
  shake(toddler ? 0.2 : 0.1);
}

/** Sprint burst: a fat cloud kicked out behind the feet, a floor ring and a little camera kick. */
export function burstDash(position, dirX, dirZ) {
  if (!ready || !position) return;
  const x = position.x - dirX * 0.5, z = position.z - dirZ * 0.5;
  reseed(x * 431, z * 433, 7, 11);
  colA.setHex(CREAM);
  for (let i = 0; i < 12; i++) {
    const side = rr(-1, 1);
    puffs.spawn(x - dirZ * side * 0.4, 0.25, z + dirX * side * 0.4,
      -dirX * rr(2.5, 4.5) - dirZ * side * 1.5, rr(0.6, 1.6), -dirZ * rr(2.5, 4.5) + dirX * side * 1.5,
      rr(0.55, 0.8), rr(1.1, 1.6), colA, 2);
  }
  rings.spawn(x, 0.16, z, CREAM, 0.3, 1.6, 0.35, 0, 0.7);
  dashBoost = 1;
  shake(0.14);
}

/** Skidding out of a sprint: a low spray of dust thrown forward. */
export function burstSkid(position, dirX, dirZ) {
  if (!ready || !position) return;
  reseed(position.x * 211, position.z * 223, 3, 5);
  colA.setHex(CREAM);
  for (let i = 0; i < 6; i++) {
    puffs.spawn(position.x + dirX * 0.3, 0.15, position.z + dirZ * 0.3,
      dirX * rr(1.5, 2.8) + rr(-0.8, 0.8), rr(0.2, 0.6), dirZ * rr(1.5, 2.8) + rr(-0.8, 0.8),
      rr(0.35, 0.5), rr(0.6, 0.9), colA, 2);
  }
}

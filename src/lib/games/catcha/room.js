/**
 * The playroom: walls, floor, furniture-as-obstacles and the three storage stations the big
 * sibling returns litter to. Split out of main.js so the room/difficulty worker can grow it
 * (new obstacles, wider floor, more stations) without touching characters, items or the sim loop.
 *
 *   import { ROOM, buildRoom, insideObstacle, resolveObstacles, growRoomForRound } from "./room.js";
 *   const { room, obstacles, stations } = await buildRoom({ scene, DROPOFF_RADIUS, KINDS });
 *   // every frame: resolveObstacles(pos, radius) keeps a character out of furniture + walls
 *   // each round: growRoomForRound(round, { scene, obstacles, stations }) — the ramp's room side
 */
import * as THREE from "three";
import { standardMaterial } from "./materials.js";
import { loadAsset } from "./assets.js";
import { FURNITURE, STORAGE, createRoomLayout } from "./room-layout.js";

export const ROOM = { hx: 13, hz: 10, wall: 4.2 };
/** The round rug: its top is the floor height for anything that lands on it. */
export const RUG = { x: 0, z: 1.5, r: 6.2, top: 0.09 };

/** Room/furniture materials — shared by every piece `buildRoom` places. */
export function makeRoomMaterials() {
  return {
    floor: standardMaterial({ kind: "wood", seed: 4, repeat: 2, bumpScale: 0.015, roughness: 0.93,
      palette: [0xd4b999, 0xd9c2a5, 0xe0cab0] }),
    rug: standardMaterial({ kind: "cloth", seed: 9, repeat: 2, bumpScale: 0.018, roughness: 0.96,
      palette: [0x66a69c, 0x75b1a4, 0x83bbae] }),
    wall: standardMaterial({
      kind: "plaster",
      seed: 2,
      repeat: 2,
      bumpScale: 0.008,
      roughness: 0.95,
      palette: [0xf2ecde, 0xf5eedf, 0xf8f2e9],
    }),
    trim: standardMaterial({ kind: "plaster", seed: 6, repeat: 1, bumpScale: 0.008,
      palette: [0xf4eddf, 0xfff9f0, 0xffffff] }),
    wainscot: standardMaterial({ kind: "plaster", seed: 8, repeat: 2, bumpScale: 0.012,
      palette: [0xcfddd3, 0xd8e5d9, 0xdfe9e0] }),
  };
}

/** Axis-aligned footprints every character and the toddler's target-picker gets pushed out of. */
export function insideObstacle(obstacles, x, z, pad) {
  for (const o of obstacles) {
    if (Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad) return true;
  }
  return false;
}

/** Push a position out of any footprint along the shallowest axis, then clamp into the room. */
export function resolveObstacles(obstacles, pos, radius) {
  for (const o of obstacles) {
    const dx = pos.x - o.x;
    const dz = pos.z - o.z;
    const ox = o.hx + radius - Math.abs(dx);
    const oz = o.hz + radius - Math.abs(dz);
    if (ox > 0 && oz > 0) {
      if (ox < oz) pos.x += Math.sign(dx || 1) * ox;
      else pos.z += Math.sign(dz || 1) * oz;
    }
  }
  pos.x = THREE.MathUtils.clamp(pos.x, -ROOM.hx + radius, ROOM.hx - radius);
  pos.z = THREE.MathUtils.clamp(pos.z, -ROOM.hz + radius, ROOM.hz - radius);
}

/**
 * Builds the walls, floor, furniture and storage stations into `scene`. Returns the pieces the
 * rest of the game needs: `room` (the Group, already in the scene), `obstacles` (shared, mutable
 * — push more in for a round-based hazard), `stations` (`{id, kind, x, z, group, ring, stored,
 * pulse}`), and `applyLayout(seed)` to reposition them deterministically on reset.
 */
export async function buildRoom({ scene, DROPOFF_RADIUS, KINDS }) {
  const mats = makeRoomMaterials();
  const room = new THREE.Group();
  room.userData.tag = "room";
  scene.add(room);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(ROOM.hx * 2, 0.6, ROOM.hz * 2), mats.floor);
  floor.position.y = -0.3;
  floor.receiveShadow = true;
  room.add(floor);

  const rug = new THREE.Mesh(new THREE.CylinderGeometry(RUG.r, RUG.r, 0.08, 36), mats.rug);
  rug.position.set(RUG.x, RUG.top - 0.04, RUG.z);
  rug.receiveShadow = true;
  room.add(rug);
  const rugBorder = new THREE.Mesh(new THREE.RingGeometry(6.02, 6.14, 64), mats.trim);
  rugBorder.rotation.x = -Math.PI / 2;
  rugBorder.position.set(0, 0.095, 1.5);
  rugBorder.receiveShadow = true;
  room.add(rugBorder);

  function addWall(w, h, d, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.wall);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    m.castShadow = true;
    room.add(m);
    return m;
  }
  addWall(ROOM.hx * 2 + 1.2, ROOM.wall, 0.6, 0, ROOM.wall / 2, -ROOM.hz - 0.3);
  addWall(0.6, ROOM.wall, ROOM.hz * 2 + 1.2, -ROOM.hx - 0.3, ROOM.wall / 2, 0);
  addWall(0.6, ROOM.wall, ROOM.hz * 2 + 1.2, ROOM.hx + 0.3, ROOM.wall / 2, 0);

  // Sage lower panels and slim rails make the cutaway walls feel like a cared-for nursery.
  for (const [w, d, x, z] of [[26, 0.12, 0, -9.94], [0.12, 20, -12.94, 0], [0.12, 20, 12.94, 0]]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, 1.12, d), mats.wainscot);
    panel.position.set(x, 0.68, z);
    panel.receiveShadow = true;
    room.add(panel);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d + (w > d ? 0.05 : 0)), mats.trim);
    rail.position.set(x, 1.29, z);
    room.add(rail);
  }

  // baseboards: they read the room edge clearly from the raised camera
  for (const [w, d, x, z] of [
    [ROOM.hx * 2, 0.35, 0, -ROOM.hz + 0.15],
    [0.35, ROOM.hz * 2, -ROOM.hx + 0.15, 0],
    [0.35, ROOM.hz * 2, ROOM.hx - 0.15, 0],
  ]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), mats.trim);
    base.position.set(x, 0.25, z);
    room.add(base);
  }

  // a bright window so the back wall is not a blank slab
  const frame = new THREE.Mesh(new THREE.BoxGeometry(6, 3.6, 0.3), mats.trim);
  frame.position.set(3.5, 2.5, -ROOM.hz - 0.1);
  room.add(frame);
  // unlit, so the window reads as daylight rather than another shaded slab
  const pane = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3, 0.2), new THREE.MeshBasicMaterial({ color: 0xcdeeff }));
  pane.position.set(3.5, 2.5, -ROOM.hz - 0.02);
  pane.name = "window-pane"; // daylight.js tints the sky through the day
  room.add(pane);
  for (const [w, h] of [[0.14, 3.15], [5.5, 0.14]]) {
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.13), mats.trim);
    mullion.position.set(3.5, 2.5, -9.8);
    room.add(mullion);
  }

  const obstacles = [];
  const furniture = new Map();
  const stations = [];
  const loaded = await Promise.all([...FURNITURE, ...STORAGE].map(async (item) => [item.id,
    await loadAsset(item.asset, { tag: item.id === "bed" ? "bed" : "furniture", material: item.material })]));
  const models = new Map(loaded);
  // Low pieces you can jump onto: their real top height (measured before the radio joins the
  // table). The bed's mattress is springy: landing on it bounces you off.
  const surfaces = {};
  for (const item of FURNITURE) {
    const group = models.get(item.id);
    room.add(group);
    furniture.set(item.id, group);
    if (["table", "ottoman", "bed"].includes(item.id)) {
      // the bed is measured by its blanket: the headboard frame stands much higher than the mattress
      let part = group;
      if (item.id === "bed") group.traverse((o) => { if (o.isMesh && /blanket/i.test(o.name)) part = o; });
      surfaces[item.id] = { top: new THREE.Box3().setFromObject(part).max.y, bouncy: item.id === "bed" };
    }
  }
  for (const item of STORAGE) {
    const group = new THREE.Group();
    group.userData.tag = `station-${item.id}`;
    const model = models.get(item.id);
    model.userData.tag = `station-${item.id}-model`;
    group.add(model);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(DROPOFF_RADIUS - 0.35, DROPOFF_RADIUS, 32),
      new THREE.MeshBasicMaterial({ color: KINDS[item.kind].color, transparent: true,
        opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    group.add(ring);
    room.add(group);
    const decor = createStationDecor(group, model, KINDS[item.kind].color, item.kind);
    stations.push({ ...item, x: 0, z: 0, group, model, ring, decor, stored: 0, pulse: 0 });
  }

  function applyLayout(seed) {
    const layout = createRoomLayout(seed);
    // Keep array and object identities: movement, delivery and AI share these references.
    obstacles.length = 0;
    for (const item of layout.furniture) {
      const group = furniture.get(item.id);
      group.position.set(item.x, 0, item.z);
      group.rotation.y = item.turn * Math.PI / 2;
      obstacles.push({ id: item.id, x: item.x, z: item.z, hx: item.hx, hz: item.hz, ...surfaces[item.id] });
    }
    for (const item of layout.stations) {
      const station = stations.find((s) => s.id === item.id);
      station.x = item.x;
      station.z = item.z;
      station.group.position.set(item.x, 0, item.z);
      station.model.rotation.y = item.turn * Math.PI / 2;
      station.stored = 0;
      station.pulse = 0;
      station.ring.scale.setScalar(1);
      station.ring.material.opacity = 0.55;
      obstacles.push({ id: item.id, x: item.x, z: item.z, hx: item.hx, hz: item.hz });
    }
    room.userData.layout = layout.id;
    return layout;
  }
  applyLayout(1337);
  const radio = await createRadio(furniture.get("table"));
  return { room, mats, obstacles, stations, applyLayout, radio };
}

// Phosphor Icons, fill weight (MIT): what each home spot takes.
const KIND_ICONS = {
  toy: "M165.78,224H208a16,16,0,0,0,16-16V170.35A8,8,0,0,0,212.94,163a23.37,23.37,0,0,1-8.94,1.77c-13.23,0-24-11.1-24-24.73s10.77-24.73,24-24.73a23.37,23.37,0,0,1,8.94,1.77A8,8,0,0,0,224,109.65V72a16,16,0,0,0-16-16H171.78a35.36,35.36,0,0,0,.22-4,36,36,0,0,0-72,0,35.36,35.36,0,0,0,.22,4H64A16,16,0,0,0,48,72v32.22a35.36,35.36,0,0,0-4-.22,36,36,0,0,0,0,72,35.36,35.36,0,0,0,4-.22V208a16,16,0,0,0,16,16h42.22",
  book: "M232,48H168a32,32,0,0,0-32,32v87.73a8.17,8.17,0,0,1-7.47,8.25,8,8,0,0,1-8.53-8V80A32,32,0,0,0,88,48H24a8,8,0,0,0-8,8V200a8,8,0,0,0,8,8H96a24,24,0,0,1,24,23.94,7.9,7.9,0,0,0,5.12,7.55A8,8,0,0,0,136,232a24,24,0,0,1,24-24h72a8,8,0,0,0,8-8V56A8,8,0,0,0,232,48ZM208,168H168.27a8.17,8.17,0,0,1-8.25-7.47,8,8,0,0,1,8-8.53h39.73a8.17,8.17,0,0,1,8.25,7.47A8,8,0,0,1,208,168Zm0-32H168.27a8.17,8.17,0,0,1-8.25-7.47,8,8,0,0,1,8-8.53h39.73a8.17,8.17,0,0,1,8.25,7.47A8,8,0,0,1,208,136Zm0-32H168.27A8.17,8.17,0,0,1,160,96.53,8,8,0,0,1,168,88h39.73A8.17,8.17,0,0,1,216,95.47,8,8,0,0,1,208,104Z",
  cloth: "M192,16H104A16,16,0,0,0,88,32v76.69L49.25,147.43a58.92,58.92,0,0,0,83.32,83.32L201,162.34a23.85,23.85,0,0,0,7-17V32A16,16,0,0,0,192,16Zm0,16h0V56H104V32Zm-2.34,119L157.8,182.88a48,48,0,0,1,34.2-70.2v32.69A8,8,0,0,1,189.66,151Z",
};

/**
 * A home spot's beacon: a sticker of what goes there bobbing above it, and a slow ring of glowing
 * motes circling its drop ring. `step(dt, calling)`: while the player carries a match the sticker
 * bounces bigger and the motes hurry, so "bring it here" reads at a glance.
 */
function createStationDecor(group, model, color, kind) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const hex = `#${color.toString(16).padStart(6, "0")}`;
  g.fillStyle = "#241b3a"; g.beginPath(); g.arc(64, 68, 56, 0, 7); g.fill(); // drop
  g.fillStyle = "#fff6e6"; g.strokeStyle = "#241b3a"; g.lineWidth = 8;
  g.beginPath(); g.arc(64, 62, 54, 0, 7); g.fill(); g.stroke();
  g.strokeStyle = hex; g.lineWidth = 5; g.beginPath(); g.arc(64, 62, 45, 0, 7); g.stroke();
  const path = new Path2D(KIND_ICONS[kind]);
  g.save(); g.translate(30, 28); g.scale(68 / 256, 68 / 256);
  g.lineJoin = "round"; g.strokeStyle = "#241b3a"; g.lineWidth = 26; g.stroke(path);
  g.fillStyle = hex; g.fill(path); g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sticker = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sticker.userData.tag = "station-marker";
  const top = new THREE.Box3().setFromObject(model).max.y - group.position.y;
  const baseY = Math.max(top, 1.2) + 1.1;
  sticker.position.y = baseY;
  sticker.renderOrder = 2;
  group.add(sticker);

  const MOTES = 7;
  const glow = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.35);
  const motes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 10, 8),
    new THREE.MeshBasicMaterial({ color: glow, toneMapped: false }), MOTES);
  motes.userData.tag = "station-motes";
  motes.frustumCulled = false;
  group.add(motes);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const phase = color % 97; // each spot starts its orbit somewhere different
  let t = 0, spin = 0, call = 0;
  return {
    step(dt, calling) {
      t += dt;
      call += ((calling ? 1 : 0) - call) * Math.min(1, dt * 6);
      spin += dt * (0.35 + call * 1.1);
      const bounce = call * Math.abs(Math.sin(t * 6)) * 0.35;
      sticker.position.y = baseY + Math.sin(t * 2 + phase) * 0.12 + bounce;
      sticker.scale.setScalar(1.9 + call * 0.6);
      const radius = 2.15;
      for (let i = 0; i < MOTES; i++) {
        const a = spin + phase + (i / MOTES) * Math.PI * 2;
        p.set(Math.cos(a) * radius, 0.35 + Math.sin(t * 2.4 + i * 1.7) * 0.18 + call * 0.25, Math.sin(a) * radius);
        const twinkle = 0.75 + 0.25 * Math.sin(t * 5 + i * 2.3);
        sc.setScalar(twinkle * (1 + call * 0.5));
        motes.setMatrixAt(i, m.compose(p, q, sc));
      }
      motes.instanceMatrix.needsUpdate = true;
    },
  };
}

/**
 * The music radio on the coffee table (it moves with the table's layout; the kitchen has one on a
 * counter: `createRadio(parent, { position, turn })`). `step(dt, playing)`
 * pulses the speaker, sends ripple rings out of it and floats little notes up while music plays.
 */
export async function createRadio(table, { position = [1.05, 1.33, -0.35], turn = 0.3 } = {}) {
  const group = await loadAsset("radio", { tag: "radio" });
  group.position.set(...position);
  group.rotation.y = turn;
  table.add(group);
  const speaker = group.getObjectByName("speaker");
  const origin = speaker.position.clone();
  const waves = [0, 1, 2].map(() => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.018, 6, 28),
      new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0, depthWrite: false }));
    ring.position.copy(origin);
    ring.userData.tag = "radio";
    group.add(ring);
    return ring;
  });
  const noteCanvas = document.createElement("canvas");
  noteCanvas.width = noteCanvas.height = 64;
  const g = noteCanvas.getContext("2d");
  g.font = "bold 52px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = 8; g.strokeStyle = "#2b2350"; g.strokeText("♪", 32, 34);
  g.fillStyle = "#fff6e2"; g.fillText("♪", 32, 34);
  const noteTex = new THREE.CanvasTexture(noteCanvas);
  noteTex.colorSpace = THREE.SRGBColorSpace;
  const notes = [0, 1].map(() => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTex, transparent: true, opacity: 0, depthWrite: false }));
    sprite.scale.setScalar(0.32);
    sprite.userData.tag = "radio";
    group.add(sprite);
    return sprite;
  });
  let t = 0, level = 0;
  return {
    group,
    step(dt, playing) {
      t += dt;
      level += ((playing ? 1 : 0) - level) * Math.min(1, dt * 3);
      speaker.scale.setScalar(1 + level * 0.08 * Math.abs(Math.sin(t * Math.PI * 68 / 60)));
      waves.forEach((ring, i) => {
        const p = (t * 0.7 + i / 3) % 1;
        ring.position.z = origin.z + 0.05 + p * 0.55;
        ring.scale.setScalar(0.8 + p * 1.8);
        ring.material.opacity = (1 - p) * 0.75 * level;
      });
      notes.forEach((note, i) => {
        const p = (t * 0.35 + i * 0.5) % 1;
        note.position.set(origin.x + Math.sin(t * 2 + i * 3) * 0.15 + (i ? 0.25 : -0.05), 0.9 + p * 0.9, origin.z);
        note.material.opacity = Math.sin(p * Math.PI) * level;
      });
    },
  };
}

/**
 * The ramp's room side — called once per round advance with the room this run built. A no-op
 * today (round-based difficulty is toddler-only: see `difficulty()` in main.js); the room/
 * difficulty worker's job is to make later rounds add a new obstacle, open a side of the room,
 * or otherwise change the floor plan a player has to route around. Keep `obstacles` and
 * `stations` arrays the same identity (push/splice in place) — `main.js` holds no other
 * reference to them.
 */
export function growRoomForRound(_round, _ctx) {
  // intentionally empty — the room/difficulty worker fills this in.
}

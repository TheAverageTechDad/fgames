import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ROOM } from './room';

// Life around the bike: Catcha's radio on the workbench, Dad pottering about the garage, and the girls running
// round the garden outside the roller door (bright and hazy from in here; turn the camera to catch them).
// The people are Catcha's chibi models, moved by swinging their limb pivots.
const BENCH = { x: -2.25, y: 0.95, z: ROOM.back + 0.42 };
type Person = { root: THREE.Group; arms: THREE.Object3D[]; legs: THREE.Object3D[]; head: THREE.Object3D | null; phase: number };

function person(scene: THREE.Group, height: number): Person {
  const pivot = (name: string) => { let found: THREE.Object3D | null = null; scene.traverse(o => { if (!found && !(o instanceof THREE.Mesh) && o.name.startsWith(name)) found = o; }); return found as THREE.Object3D | null; };
  const box = new THREE.Box3().setFromObject(scene), k = height / box.getSize(new THREE.Vector3()).y;
  scene.scale.setScalar(k); scene.position.y = -box.min.y * k;
  scene.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
  const root = new THREE.Group(); root.add(scene);
  return { root, arms: ['arm-right', 'arm-left'].map(pivot).filter(Boolean) as THREE.Object3D[], legs: ['leg-right', 'leg-left'].map(pivot).filter(Boolean) as THREE.Object3D[], head: pivot('head'), phase: 0 };
}
function stride(p: Person, amount: number, rate: number, dt: number) {
  p.phase += dt * rate;
  const s = Math.sin(p.phase) * amount;
  p.legs.forEach((l, i) => { l.rotation.x = i ? -s : s; });
  p.arms.forEach((a, i) => { a.rotation.x = i ? s * 0.8 : -s * 0.8; });
}
/** A note sprite like the playroom radio's. */
function noteTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!; g.font = 'bold 52px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = '#2b2350'; g.strokeText('♪', 32, 34); g.fillStyle = '#fff6e2'; g.fillText('♪', 32, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export async function createLife(parent: THREE.Object3D) {
  const group = new THREE.Group(); parent.add(group);
  const loader = new GLTFLoader();
  const [radioFile, dadFile, bigFile, littleFile] = await Promise.all(['radio', 'chibi-dad', 'chibi-sibling-sample', 'chibi-toddler']
    .map(n => loader.loadAsync(`/catcha/assets/${n}.glb`)));

  // the radio, on the bench by the pegboard, turned towards the bike
  const radio = radioFile.scene, rbox = new THREE.Box3().setFromObject(radio), rsize = rbox.getSize(new THREE.Vector3());
  const rk = 0.34 / Math.max(rsize.x, rsize.z);
  radio.scale.setScalar(rk); radio.position.set(BENCH.x - 0.55, BENCH.y - rbox.min.y * rk, BENCH.z + 0.06); radio.rotation.y = 0.45;
  radio.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.add(radio);
  const speaker = radio.getObjectByName('speaker'), origin = speaker?.position.clone() ?? new THREE.Vector3();
  const waveGeo = new THREE.TorusGeometry(0.24, 0.018, 6, 28);
  const waves = [0, 1, 2].map(() => {
    const ring = new THREE.Mesh(waveGeo, new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0, depthWrite: false }));
    ring.position.copy(origin); radio.add(ring); return ring;
  });
  const noteTex = noteTexture();
  const notes = [0, 1].map(() => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTex, transparent: true, opacity: 0, depthWrite: false }));
    s.scale.setScalar(0.32); radio.add(s); return s;
  });

  // Dad, wandering between the bench, the paint shelf and the door, always behind or beside the bike
  const dad = person(dadFile.scene, 1.5); group.add(dad.root);
  // (the corner is only a turning point, so the walk from the door back to the bench goes round behind the bike)
  const stops = [
    { x: BENCH.x - 1.0, z: BENCH.z + 0.6, face: Math.PI * 0.92, wait: 7 },   // at the end of the bench, by the radio (not behind the bike)
    { x: -3.5, z: ROOM.back + 1.15, face: Math.PI * 0.85, wait: 5 },     // at the tool chest
    { x: 1.75, z: ROOM.back + 0.75, face: Math.PI, wait: 5 },            // looking over the paint tins
    { x: 3.95, z: 0.35, face: Math.PI / 2, wait: 7 },                    // in the doorway, watching the girls
    { x: 3.3, z: ROOM.back + 1.05, face: NaN, wait: 0 }                  // round the corner, back to the bench
  ];
  let stop = 0, waiting = 3, facing = 0;
  dad.root.position.set(stops[0].x, 0, stops[0].z); dad.root.rotation.y = stops[0].face;

  // the girls outside, chasing each other round the lawn
  const big = person(bigFile.scene, 1.05), little = person(littleFile.scene, 0.78);
  group.add(big.root, little.root);
  const yard = { x: ROOM.right + 1.7, z: 0.55, rx: 0.85, rz: 1.25 };
  let lap = 0;

  let t = 0, level = 0;
  return {
    group, radio,
    update(dt: number, playing: boolean, eye: THREE.Vector3) {
      t += dt;
      // radio: the speaker thumps, rings ripple out and notes float up while it plays
      level += ((playing ? 1 : 0) - level) * Math.min(1, dt * 3);
      speaker?.scale.setScalar(1 + level * 0.08 * Math.abs(Math.sin(t * Math.PI * 68 / 60)));
      waves.forEach((ring, i) => {
        const p = (t * 0.7 + i / 3) % 1;
        ring.position.z = origin.z + 0.05 + p * 0.55; ring.scale.setScalar(0.8 + p * 1.8);
        (ring.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.75 * level;
      });
      notes.forEach((note, i) => {
        const p = (t * 0.35 + i * 0.5) % 1;
        note.position.set(origin.x + Math.sin(t * 2 + i * 3) * 0.15 + (i ? 0.25 : -0.05), 0.9 + p * 0.9, origin.z);
        note.material.opacity = Math.sin(p * Math.PI) * level;
      });

      // Dad walks to the next stop, turns to face what he came for, and waits a while
      const goal = stops[stop], pos = dad.root.position, dx = goal.x - pos.x, dz = goal.z - pos.z, d = Math.hypot(dx, dz);
      if (d > 0.04) {
        const v = Math.min(d, dt * 0.95); pos.x += dx / d * v; pos.z += dz / d * v;
        facing = Math.atan2(dx, dz); stride(dad, 0.5, 7.5, dt); pos.y = Math.abs(Math.sin(dad.phase)) * 0.025;
      } else {
        if (!Number.isNaN(goal.face)) facing = goal.face;
        stride(dad, 0, 0, dt); pos.y = 0;
        dad.arms.forEach((a, i) => { a.rotation.x *= 0.9; if (stop === 0) a.rotation.x = -0.9 + Math.sin(t * 5 + i * 2) * 0.12; });   // tinkering at the bench
        waiting -= dt; if (waiting <= 0) { stop = (stop + 1) % stops.length; waiting = stops[stop].wait; }
      }
      dad.root.visible = Math.hypot(eye.x - pos.x, eye.z - pos.z) > 1.4;   // ponytail: he steps out of shot rather than filling the lens when the camera swings round to the back wall
      let turn = facing - dad.root.rotation.y; turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      dad.root.rotation.y += turn * Math.min(1, dt * 6);
      if (dad.head) dad.head.rotation.y = Math.sin(t * 0.4) * 0.25;

      // the girls: round and round, the little one never quite catching up, both bouncing as they run
      lap += dt * (0.75 + 0.25 * Math.sin(t * 0.3));
      for (const [kid, a, rate, hop] of [[big, lap, 15, 0.06], [little, lap - 0.9 - 0.3 * Math.sin(t * 0.5), 18, 0.05]] as const) {
        const x = yard.x + Math.cos(a) * yard.rx, z = yard.z + Math.sin(a) * yard.rz;
        kid.root.position.set(x, Math.abs(Math.sin(kid.phase)) * hop, z);
        kid.root.rotation.y = Math.atan2(-Math.sin(a) * yard.rx, Math.cos(a) * yard.rz);   // facing along the loop
        stride(kid, 0.8, rate, dt);
      }
    },
    dispose() {
      waveGeo.dispose(); noteTex.dispose();
      group.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) { if (o instanceof THREE.Mesh) o.geometry.dispose(); for (const m of [o.material].flat()) m.dispose(); } });
      group.removeFromParent();
    }
  };
}
export type Life = Awaited<ReturnType<typeof createLife>>;

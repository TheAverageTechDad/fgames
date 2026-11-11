import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { IDLE_RPM, REDLINE, SPEEDO_SWEEP, TACH_SWEEP } from './steps';
import type { GarageAudio } from './audio';

// The first ride: out of the garage and along a country road to a chequered flag, seen from the side.
// Hold the pedal to go, let go to roll to a stop. Stars float over the road; riding through one collects it.
// Game axes as in the garage: x along the road, y up, z towards the camera.
export const ROAD_LENGTH = 520;
const TOP_SPEED = 24, GEARS = [7.5, 12, 16, 19.5, 22.5, 26];
const RIDER = '/catcha/assets/chibi-dad.glb';
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** The road's height: flat at the garage and the finish, rolling hills between. */
export const roadHeight = (x: number) => smooth(25, 70, x) * (1 - smooth(ROAD_LENGTH - 70, ROAD_LENGTH - 20, x)) *
  (1.5 * Math.sin(x / 38) + 0.8 * Math.sin(x / 15.5 + 1.3) + 0.35 * Math.sin(x / 7.7 + 0.4));
const slope = (x: number) => (roadHeight(x + 0.4) - roadHeight(x - 0.4)) / 0.8;
const rand = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function canvasTexture(w: number, h: number, paint: (c: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h; paint(canvas.getContext('2d')!);
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
/** A strip along x that follows the road's height: across z from z0 to z1 (flat), or standing up from y0 to y1 at z0. */
function strip(x0: number, x1: number, step: number, z0: number, z1: number, lift = 0, uScale = 1, standing?: [number, number]) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const n = Math.ceil((x1 - x0) / step);
  for (let i = 0; i <= n; i++) {
    const x = x0 + i * step, y = roadHeight(x) + lift;
    if (standing) pos.push(x, y + standing[0], z0, x, y + standing[1], z0); else pos.push(x, y, z0, x, y, z1);
    if (uScale < 0) uv.push(-x * uScale, -z0 * uScale, -x * uScale, -z1 * uScale);   // negative: texture tiles every 1/|uScale| m both ways
    else uv.push(x * uScale, 0, x * uScale, 1);
    if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }   // wound to face up (and out, standing)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}

type Ctx = {
  scene: THREE.Scene; renderer: THREE.WebGLRenderer; camera: THREE.PerspectiveCamera; bike: THREE.Object3D;
  pivots: Record<string, { node: THREE.Object3D; base: THREE.Quaternion }>; audio: GarageAudio;
  key: THREE.DirectionalLight; hemi: THREE.HemisphereLight; helmet: string;
  onStar: (n: number, total: number) => void; onFinish: (stars: number) => void;
};
export type Ride = Awaited<ReturnType<typeof createRide>>;

export async function createRide(o: Ctx) {
  const { scene, camera, bike, pivots, audio, key, hemi } = o;
  const world = new THREE.Group(); scene.add(world);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };
  const std = (color: THREE.ColorRepresentation, roughness = 0.8, extra: THREE.MeshStandardMaterialParameters = {}) => keep(new THREE.MeshStandardMaterial({ color, roughness, ...extra }));
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, cast = false) => { keep(geo); const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.castShadow = cast; world.add(m); return m; };

  // sky, haze and sunshine
  const sky = keep(canvasTexture(4, 256, c => { const g = c.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#4f9ff0'); g.addColorStop(0.62, '#a9d6ff'); g.addColorStop(1, '#e7f4ff'); c.fillStyle = g; c.fillRect(0, 0, 4, 256); }));
  scene.background = sky; scene.fog = new THREE.Fog('#dcefff', 70, 300);
  hemi.color.set('#e4f2ff'); hemi.groundColor.set('#6f8f4c'); hemi.intensity = 1.5; key.intensity = 2.8;
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 30 }); key.shadow.camera.updateProjectionMatrix();

  // ground, road and verges
  const grass = keep(canvasTexture(256, 256, c => {
    const r = rand(11); c.fillStyle = '#7fbf57'; c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) { c.fillStyle = r() > 0.5 ? 'rgba(70,130,50,0.35)' : 'rgba(170,215,110,0.35)'; c.fillRect(r() * 256, r() * 256, 2, 3); }
  }));
  const asphalt = keep(canvasTexture(256, 128, c => {
    const r = rand(5); c.fillStyle = '#5b5e63'; c.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 2200; i++) { c.fillStyle = r() > 0.5 ? 'rgba(40,42,46,0.4)' : 'rgba(140,142,146,0.3)'; c.fillRect(r() * 256, r() * 128, 2, 2); }
    c.fillStyle = '#f2f0e6'; c.fillRect(0, 6, 256, 6); c.fillRect(0, 116, 256, 6); c.fillRect(0, 61, 128, 6);
  })); asphalt.repeat.set(1 / 6, 1);
  add(strip(-80, ROAD_LENGTH + 160, 1, -220, 60, -0.02, -1 / 5), std('#ffffff', 0.95, { map: grass }));
  add(strip(-80, ROAD_LENGTH + 160, 1, -1.7, 1.7, 0.012, 1), std('#ffffff', 0.85, { map: asphalt }));
  add(strip(-80, ROAD_LENGTH + 160, 1, -2.0, -1.7, 0.006), std('#c9b98f', 0.95));
  add(strip(-80, ROAD_LENGTH + 160, 1, 1.7, 2.0, 0.006), std('#c9b98f', 0.95));

  // a wooden fence behind the road: posts and two rails
  const wood = std('#9b7048', 0.85);
  const posts = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(0.1, 1, 0.1)), wood, Math.ceil((ROAD_LENGTH + 140) / 2.5));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
  for (let i = 0; i < posts.count; i++) { const x = -40 + i * 2.5; posts.setMatrixAt(i, m4.compose(p3.set(x, roadHeight(x) + 0.45, -3.2), q.identity(), s3.set(1, 0.9, 1))); }
  posts.castShadow = true; world.add(posts);
  for (const y of [0.42, 0.78]) { const rail = add(strip(-40, ROAD_LENGTH + 100, 1, -3.15, 0, 0, 1, [y, y + 0.08]), wood); (rail.material as THREE.Material).side = THREE.DoubleSide; }

  // trees and bushes: two instanced meshes each, coloured per instance
  const r = rand(23), trees: { x: number; z: number; s: number }[] = [], bushes: { x: number; z: number; s: number }[] = [];
  for (let x = -60; x < ROAD_LENGTH + 140; x += 3 + r() * 7) trees.push({ x, z: -6 - r() * 40, s: 0.8 + r() * 0.9 });
  for (let x = -40; x < ROAD_LENGTH + 120; x += 9 + r() * 16) bushes.push({ x, z: 3.2 + r() * 4, s: 0.35 + r() * 0.35 });
  const trunkGeo = keep(new THREE.CylinderGeometry(0.12, 0.18, 1.6, 7)), leafGeo = keep(new THREE.IcosahedronGeometry(1.1, 1));
  const trunks = new THREE.InstancedMesh(trunkGeo, std('#7a5232'), trees.length), crowns = new THREE.InstancedMesh(leafGeo, std('#ffffff', 0.9, { flatShading: true }), trees.length + bushes.length);
  const greens = ['#4f9a3c', '#3f8a3a', '#6aab45', '#5b9e3a', '#2f7a3a'].map(c => new THREE.Color(c));
  trees.forEach((t, i) => {
    const y = roadHeight(t.x);
    trunks.setMatrixAt(i, m4.compose(p3.set(t.x, y + 0.8 * t.s, t.z), q.identity(), s3.set(t.s, t.s, t.s)));
    crowns.setMatrixAt(i, m4.compose(p3.set(t.x, y + 2.2 * t.s, t.z), q.setFromEuler(new THREE.Euler(r(), r(), r())), s3.set(t.s, t.s * 1.15, t.s)));
    crowns.setColorAt(i, greens[i % greens.length]);
  });
  bushes.forEach((b, i) => {
    crowns.setMatrixAt(trees.length + i, m4.compose(p3.set(b.x, roadHeight(b.x) + 0.3 * b.s, b.z), q.identity(), s3.set(b.s * 1.4, b.s, b.s)));
    crowns.setColorAt(trees.length + i, greens[(i + 2) % greens.length]);
  });
  trunks.castShadow = crowns.castShadow = true; world.add(trunks, crowns);

  // far hills, cottages and clouds
  const hillMat = std('#ffffff', 1, { flatShading: true });
  const hillGeo = keep(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2));
  const hills = new THREE.InstancedMesh(hillGeo, hillMat, 22);
  for (let i = 0; i < hills.count; i++) {
    const x = -120 + i * 34 + r() * 20, w = 40 + r() * 50;
    hills.setMatrixAt(i, m4.compose(p3.set(x, -2, -90 - r() * 120), q.identity(), s3.set(w, 12 + r() * 22, 30 + r() * 20)));
    hills.setColorAt(i, new THREE.Color(['#86b85f', '#77a956', '#93c06a', '#6f9f50'][i % 4]));
  }
  world.add(hills);
  const wall = std('#f4ecdc', 0.9), roof = std('#c4553b', 0.7);
  for (const [x, z] of [[60, -22], [210, -30], [330, -19], [455, -27]]) {
    const y = roadHeight(x), house = add(new THREE.BoxGeometry(5, 3, 4), wall, true); house.position.set(x, y + 1.5, z);
    const top = add(new THREE.ConeGeometry(3.7, 2, 4), roof, true); top.position.set(x, y + 4, z); top.rotation.y = Math.PI / 4; top.scale.set(1, 1, 0.85);
  }
  // the garage you rode out of, behind the start
  const shed = add(new THREE.BoxGeometry(6, 3.4, 5), std('#d9d2c3', 0.9), true); shed.position.set(-7, 1.7, -0.4);
  const opening = add(new THREE.PlaneGeometry(3, 2.6), std('#3a3530', 1)); opening.position.set(-3.99, 1.3, 0.2); opening.rotation.y = Math.PI / 2;
  const cloudMat = keep(new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false }));
  const clouds = new THREE.Group(); world.add(clouds);
  const blob = keep(new THREE.SphereGeometry(1, 12, 8));
  for (let i = 0; i < 16; i++) {
    const c = new THREE.Group(); c.position.set(-80 + i * 45 + r() * 30, 26 + r() * 18, -120 - r() * 80);
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(blob, cloudMat); b.position.set(k * 3.2 - 5, (k % 2) * 1.4, r() * 2); b.scale.setScalar(3 + r() * 2.5); c.add(b); }
    clouds.add(c);
  }

  // the finish: two poles, a beam over the road and a big chequered flag facing you
  const checker = keep(canvasTexture(256, 128, c => { for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) { c.fillStyle = (i + j) % 2 ? '#1c1c1e' : '#fafafa'; c.fillRect(i * 32, j * 32, 32, 32); } }));
  checker.wrapS = checker.wrapT = THREE.ClampToEdgeWrapping;
  const fy = roadHeight(ROAD_LENGTH), pole = std('#e8e6e0', 0.5);
  for (const z of [-2.6, 2.6]) { const p = add(new THREE.CylinderGeometry(0.07, 0.07, 3.6, 12), pole, true); p.position.set(ROAD_LENGTH, fy + 1.8, z); }
  const beam = add(new THREE.BoxGeometry(0.3, 0.5, 5.4), std('#ffffff', 0.6, { map: checker }), true); beam.position.set(ROAD_LENGTH, fy + 3.4, 0);
  const flag = add(new THREE.PlaneGeometry(1.6, 0.8), std('#ffffff', 0.7, { map: checker, side: THREE.DoubleSide }), true); flag.position.set(ROAD_LENGTH + 0.8, fy + 3.0, 2.6);

  // stars to collect along the way
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const rr = i % 2 ? 0.12 : 0.28, a = Math.PI / 2 + i * Math.PI / 5; (i ? starShape.lineTo.bind(starShape) : starShape.moveTo.bind(starShape))(Math.cos(a) * rr, Math.sin(a) * rr); }
  const starGeo = keep(new THREE.ExtrudeGeometry(starShape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 }));
  starGeo.center();
  const starMat = std('#ffcf3a', 0.3, { metalness: 0.4, emissive: '#7a5200', emissiveIntensity: 0.6 });
  const stars = Array.from({ length: 14 }, (_, i) => {
    const x = 45 + i * 32, mesh = new THREE.Mesh(starGeo, starMat);
    mesh.position.set(x, roadHeight(x) + 1.25 + (i % 3 === 1 ? 0.3 : 0), 0); mesh.castShadow = true; world.add(mesh);
    return { x, mesh, got: false, t: 0 };
  });
  let collected = 0;

  // the rider: Dad, sat on the seat, hands on the bars, in a helmet the colour of the bike
  const rider = new THREE.Group();
  try {
    const gltf = await new GLTFLoader().loadAsync(RIDER);
    const model = gltf.scene, box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
    model.scale.setScalar(1.42 / size.y); model.position.y = -box.min.y * model.scale.y;
    model.rotation.y = Math.PI / 2;                                     // faces +z as built; turn it to face along the road
    rider.add(model); rider.updateMatrixWorld(true);              // scale first, so the head is measured at its real size
    model.traverse(m => { if (m instanceof THREE.Mesh) m.castShadow = true; });
    const joint = (n: string) => model.getObjectByName(n);
    for (const side of ['left', 'right']) {
      const legNode = joint(`leg-${side}`); if (legNode) legNode.rotation.x = -1.45;
      const armNode = joint(`arm-${side}`); if (armNode) { armNode.rotation.x = -1.2; armNode.rotation.z = (side === 'left' ? -1 : 1) * 0.12; }
    }
    const head = joint('head');
    if (head) {
      rider.updateMatrixWorld(true);
      const hb = new THREE.Box3().setFromObject(head, true), hc = hb.getCenter(new THREE.Vector3()), hs = hb.getSize(new THREE.Vector3());
      const radius = Math.max(hs.x, hs.y, hs.z) * 0.58;
      const shell = new THREE.Mesh(keep(new THREE.SphereGeometry(radius, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.6)), std(o.helmet, 0.25, { metalness: 0.1 }));
      const visor = new THREE.Mesh(keep(new THREE.SphereGeometry(radius * 1.02, 24, 12, -Math.PI * 0.32, Math.PI * 0.64, Math.PI * 0.36, Math.PI * 0.2)),
        std('#1b2230', 0.1, { metalness: 0.6, transparent: true, opacity: 0.85 }));
      const helmet = new THREE.Group(); helmet.add(shell, visor);
      helmet.position.copy(rider.worldToLocal(hc.clone())); helmet.position.y += radius * 0.12;
      helmet.rotation.y = Math.PI / 2; rider.add(helmet);
      shell.castShadow = true;
    }
  } catch (e) { console.warn('Rider did not load; the bike rides on its own', e); }
  rider.position.set(-0.42, 0.42, 0); bike.add(rider);

  // ride state
  let s = 0, v = 0, wheel = 0, wheelie = 0, finished = false, rpm = IDLE_RPM, gear = 0, throttleS = 0, puffT = 0;
  const camPos = new THREE.Vector3(-2, 1.2, 6), camLook = new THREE.Vector3();
  const rearAxle = new THREE.Vector3(-0.7425, 0.315, 0), qz = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0);
  const spin = (name: string, angle: number) => { const p = pivots[name]; if (p) p.node.quaternion.copy(p.base).multiply(qz.setFromAxisAngle(Y, angle)); };
  bike.position.set(0, 0, 0); bike.rotation.set(0, 0, 0);

  function update(dt: number, throttle: boolean) {
    const on = throttle && !finished;
    throttleS += ((on ? 1 : 0) - throttleS) * Math.min(1, dt * 8);
    // power falls away towards top speed; off the throttle it rolls and slows; past the flag it brakes to a stop
    const a = on ? 5.8 * (1 - v / TOP_SPEED) + 0.6 : finished ? -9 : -1.6 - v * 0.04;   // past the flag it pulls up within ~30 m
    v = Math.max(0, Math.min(TOP_SPEED, v + a * dt));
    s += v * dt;
    if (!finished && s >= ROAD_LENGTH) { finished = true; o.onFinish(collected); }
    // a little wheelie when it launches hard from slow
    wheelie += ((on && v < 6 ? 0.14 : 0) - wheelie) * Math.min(1, dt * (on ? 3 : 5));
    const pitch = Math.atan(slope(s)) + wheelie;
    bike.position.set(s, roadHeight(s), 0);
    bike.quaternion.setFromAxisAngle(Z, pitch);
    // keep the back tyre on the road while the front lifts: turn about the rear axle, not the middle of the bike
    const lift = rearAxle.clone().applyQuaternion(bike.quaternion).sub(rearAxle);
    bike.position.sub(lift); bike.position.y += Math.sin(s * 1.7) * 0.003 * Math.min(1, v / 5);
    wheel += v * dt;
    spin('spin_front-wheel', -wheel / 0.2999); spin('spin_rear-wheel', -wheel / 0.3149);
    // gears change themselves; the revs climb through each one and drop at the change
    while (gear < GEARS.length - 1 && v > GEARS[gear]) gear++;
    while (gear > 0 && v < GEARS[gear - 1] * 0.8) gear--;
    const lo = gear ? GEARS[gear - 1] * 0.62 : 0, hi = GEARS[gear];
    const want = v < 0.3 && !on ? IDLE_RPM : Math.max(IDLE_RPM, 2200 + (REDLINE - 2400) * Math.min(1, (v - lo) / (hi - lo)) * (0.85 + 0.15 * throttleS));
    rpm += (want - rpm) * Math.min(1, dt * 7);
    audio.run(rpm, throttleS);
    spin('needle_tachometer', -TACH_SWEEP(rpm)); spin('needle_speedometer', -SPEEDO_SWEEP(v * 3.6));
    // stars
    for (const st of stars) {
      if (st.got) {
        st.t += dt; st.mesh.position.y += dt * 3; st.mesh.scale.setScalar(Math.max(0.01, 1 + st.t * 2 - st.t * st.t * 9));
        if (st.t > 0.5) st.mesh.visible = false; continue;
      }
      st.mesh.rotation.y += dt * 2.4;
      if (Math.abs(st.x - s) < 0.9) { st.got = true; collected++; audio.star(collected); o.onStar(collected, stars.length); }
    }
    clouds.position.x += dt * 0.6;
    // the camera rides alongside, a little ahead, further back in an upright phone and at speed
    const vHalf = camera.fov * Math.PI / 360, hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const dist = Math.max(1.75 / Math.tan(hHalf), 1.35 / Math.tan(vHalf)) + v * 0.06;
    const y = roadHeight(s);
    camPos.lerp(p3.set(s + 0.6 + v * 0.18, y + 1.0 + dist * 0.2, dist), Math.min(1, dt * 3));
    camLook.lerp(p3.set(s + 0.6 + v * 0.22, y + 0.7, 0), Math.min(1, dt * 4));
    camera.position.copy(camPos); camera.lookAt(camLook);
    key.position.set(s + 4, y + 9, 6); key.target.position.set(s, y, 0); key.target.updateMatrixWorld();
    puffT += dt;
    return { progress: Math.min(1, s / ROAD_LENGTH), speed: Math.round(v * 3.6), puff: on && puffT > 0.12 ? (puffT = 0, true) : false };
  }
  camPos.set(1, 1.6, 8); camLook.set(0.6, 0.7, 0);

  return {
    total: stars.length,
    update,
    dispose() {
      bike.remove(rider);
      rider.traverse(m => { if (m instanceof THREE.Mesh) { m.geometry.dispose(); for (const mat of [m.material].flat()) mat.dispose(); } });
      scene.remove(world);
      for (const d of disposables) d.dispose();
      for (const im of [posts, trunks, crowns, hills]) im.dispose();
      for (const p of Object.values(pivots)) p.node.quaternion.copy(p.base);
    }
  };
}

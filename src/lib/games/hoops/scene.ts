import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createPuffs, createSky, type SkyKey } from '../farm/juice';
import { createFarmProps } from '../farm/props';
import { LAMPS, buildHoopsWorld, createBirds } from './world';
import { createHoopsAudio } from './audio';
import { STEP, stepBall, type Ball } from './ball';
import { ARC_R, BALL_R, BOARD, COURT, DAD_HEIGHT, FAMILY, FENCE, GRAVITY, POLE, RIM, onAsphalt } from './court';
import { DASH_WINDUP, JUMP_V, RUN_SPEED, streakWord, cancelAim, createShootaround, jump, releasePoint, shoot, startAim, stepShootaround, type GameEvent } from './game';
import { createHoopsInput, type Target } from './input';
import { MIN_PULL_PX, shotVelocity, type Pull } from './shot';

const DAD = '/catcha/assets/chibi-dad.glb';
// The family on the sideline: Catcha's Mom and the two girls.
const FAMILY_ASSETS = { mom: '/catcha/assets/chibi-mom.glb', girl: '/catcha/assets/chibi-sibling-sample.glb', toddler: '/catcha/assets/chibi-toddler.glb' };
type Mood = 'idle' | 'watch' | 'clap' | 'cheer' | 'aww' | 'flinch';
const CHEER_Z = 2.3;
// The court texture covers the asphalt: the lines plus a dark border.
const PAD = { minX: -COURT.halfWidth - 0.4, maxX: COURT.halfWidth + 0.4, minZ: -0.6, maxZ: COURT.depth + 0.3 }, PX = 100;
// A day on the court, a little slower than Pocket Farm's 300 s: morning, midday, golden hour, a sunset with long
// shadows, then a short blue dusk under the street lamps (dim, never dark) before dawn comes round again.
const DAY_SECONDS = 420;
const DAY: SkyKey[] = [
  { t: 0, sun: ['#ffd9b0', 2.2], hemi: ['#fff1e2', '#7f9a62', 1.35], bg: '#f3dcbc', glow: 0, x: -9, y: 8 },
  { t: 0.25, sun: ['#ffe2b0', 2.6], hemi: ['#fff4e0', '#6f8a55', 1.4], bg: '#f6d7a4', glow: 0, x: -3, y: 13 },
  { t: 0.5, sun: ['#ffbf7a', 2.35], hemi: ['#ffe6c8', '#86885a', 1.3], bg: '#f5c38c', glow: 0, x: 5, y: 9 },
  { t: 0.64, sun: ['#ff9a6a', 1.5], hemi: ['#f2cdb6', '#6e6c5e', 1.1], bg: '#eaab8c', glow: 0.5, x: 9, y: 4.5 },
  { t: 0.74, sun: ['#b9c3e2', 0.85], hemi: ['#c9ccdc', '#525c5c', 1.05], bg: '#8d92b0', glow: 1, x: -3, y: 11 },
  { t: 0.88, sun: ['#b9c3e2', 0.85], hemi: ['#c9ccdc', '#525c5c', 1.05], bg: '#8d92b0', glow: 1, x: -3, y: 11 },
  { t: 1, sun: ['#ffd9b0', 2.2], hemi: ['#fff1e2', '#7f9a62', 1.35], bg: '#f3dcbc', glow: 0, x: -9, y: 8 }
];
const turn = (from: number, to: number, k: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * Math.min(1, k);

function canvasTexture(width: number, height: number, paint: (c: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  paint(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

function courtTexture() {
  return canvasTexture((PAD.maxX - PAD.minX) * PX, (PAD.maxZ - PAD.minZ) * PX, c => {
    const X = (x: number) => (x - PAD.minX) * PX, Z = (z: number) => (z - PAD.minZ) * PX;
    c.fillStyle = '#62666d'; c.fillRect(0, 0, c.canvas.width, c.canvas.height);
    // Asphalt grit: a fine speckle of light and dark stones.
    for (let i = 0; i < 34000; i++) {
      c.fillStyle = Math.random() < 0.5 ? '#ffffff14' : '#00000018';
      c.fillRect(Math.random() * c.canvas.width, Math.random() * c.canvas.height, 2, 2);
    }
    c.strokeStyle = '#f4f1e8'; c.lineWidth = 6;
    c.strokeRect(X(-COURT.halfWidth), Z(0), COURT.halfWidth * 2 * PX, COURT.depth * PX);
    c.fillStyle = '#c9603c55'; c.fillRect(X(-1.45), Z(0), 2.9 * PX, 3.5 * PX); c.strokeRect(X(-1.45), Z(0), 2.9 * PX, 3.5 * PX); // the key
    c.beginPath(); c.arc(X(0), Z(3.5), 1.1 * PX, 0, Math.PI); c.stroke();
    c.beginPath(); c.moveTo(X(RIM.x + ARC_R), Z(0)); c.arc(X(RIM.x), Z(RIM.z), ARC_R * PX, 0, Math.PI); c.lineTo(X(RIM.x - ARC_R), Z(0)); c.stroke(); // the arc and its corner lines
  });
}

function ballTexture() {
  return canvasTexture(512, 256, c => {
    c.fillStyle = '#e0702a'; c.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 3000; i++) { c.fillStyle = Math.random() < 0.5 ? '#ffffff12' : '#00000014'; c.fillRect(Math.random() * 512, Math.random() * 256, 2, 2); }
    c.strokeStyle = '#2b1a12'; c.lineWidth = 6;
    for (const x of [0, 128, 256, 384]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 256); c.stroke(); }
    c.beginPath(); c.moveTo(0, 128); c.lineTo(512, 128); c.stroke();
  });
}

export function createHoopsScene(host: HTMLElement, callbacks: { update(): void; event(e: GameEvent): void }) {
  const state = createShootaround();
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.04;
  const canvas = renderer.domElement; canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Basketball court. Drag to move, push far to sprint, tap to jump. Hold Dad, drag toward the hoop and let go to shoot.');
  canvas.dataset.hoopsCanvas = ''; host.append(canvas);

  const scene = new THREE.Scene(), fog = new THREE.Fog('#f6d7a4', 30, 60); scene.background = new THREE.Color('#f6d7a4'); scene.fog = fog;
  const hemi = new THREE.HemisphereLight('#fff4e0', '#6f8a55', 1.4); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe2b0', 2.6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  sun.target.position.set(0, 0, 6); scene.add(sun, sun.target);
  // ?time=0.6 starts at that point of the day (0 morning … 0.64 sunset … 0.74 dusk), like the farm's.
  const sky = createSky({ scene, hemi, sun }, DAY);
  let dayClock = DAY_SECONDS * (Number(new URLSearchParams(location.search).get('time')) || 0.08);
  const daylight = (dt: number) => {
    const day = sky.set((dayClock += dt) / DAY_SECONDS);
    sun.position.copy(sun.target.position).add(day.sun); fog.color.copy(scene.background as THREE.Color);
    props.glow.emissiveIntensity = day.glow * 1.6; haloMaterial.opacity = day.glow * 0.55;
    return day;
  };

  // An elevated view facing the hoop squarely (shot.ts relies on no yaw) that slides after Dad, never turning.
  // WIDE: how much court shows across at the point it looks at; the rim stays in view wherever he goes.
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  const target = new THREE.Vector3(), aim = new THREE.Vector3(), VIEW = new THREE.Vector3(0, Math.sin(0.62), Math.cos(0.62)), WIDE = 7.4;
  const probe = new THREE.Vector3();
  // rimShake: a dunk's wobble in the rim and backboard (and a nudge of the camera), fading over 0.6 s.
  let distance = 14, rimShake = 0;
  const follow = (k: number) => {
    const p = state.player;
    aim.set(Math.max(-2.3, Math.min(2.3, p.x * 0.55)) + (Math.random() - 0.5) * 0.12 * rimShake, 1 + (Math.random() - 0.5) * 0.12 * rimShake, Math.max(2.6, Math.min(8, p.z - 0.4)));
    target.lerp(aim, k);
    camera.position.copy(target).addScaledVector(VIEW, distance); camera.lookAt(target); camera.updateMatrixWorld();
  };
  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
    distance = Math.max(10, WIDE / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
    follow(1);
  };
  const observer = new ResizeObserver(resize); observer.observe(host); resize();

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(thing: T) => { disposables.push(thing); return thing; };
  const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => keep(new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra }));

  // Court
  const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(PAD.maxX - PAD.minX, PAD.maxZ - PAD.minZ)), keep(new THREE.MeshStandardMaterial({ map: keep(courtTexture()), roughness: 0.95 })));
  ground.rotation.x = -Math.PI / 2; ground.position.set((PAD.minX + PAD.maxX) / 2, 0, (PAD.minZ + PAD.maxZ) / 2); ground.receiveShadow = true; scene.add(ground);
  // The neighbourhood around the court (Pocket Farm's props) and its birds.
  const props = createFarmProps(), world = new THREE.Group(); scene.add(world);
  const worldGeometry = buildHoopsWorld(props, world);
  // A warm halo round each street lamp's bulb from dusk (the hedge hides the sidewalk, so no pools on the ground).
  const haloMaterial = keep(new THREE.SpriteMaterial({ blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0,
    map: props.canvasTexture(64, 64, c => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, '#ffd890'); g.addColorStop(1, '#ffd89000'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }) }));
  for (const at of LAMPS) { const halo = new THREE.Sprite(haloMaterial); halo.position.set(at.x, 1.82, at.z); halo.scale.setScalar(1.3); scene.add(halo); }
  const birds = createBirds(scene, props, daylight(0).sun);
  // Chain-link fence on the back and sides: posts, a top rail and a see-through mesh. The ball bounces off it (ball.ts).
  {
    const H = 2.4, link = keep(canvasTexture(64, 64, c => {
      c.strokeStyle = '#d8dde0cc'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(0, 32); c.lineTo(32, 0); c.lineTo(64, 32); c.lineTo(32, 64); c.closePath(); c.stroke();
    }));
    link.wrapS = link.wrapT = THREE.RepeatWrapping;
    const steel = mat('#5d6a63', { metalness: 0.5, roughness: 0.5 }), post = keep(new THREE.CylinderGeometry(0.05, 0.05, H, 8));
    const runs: [number, number, number, number][] = [[-FENCE.side, FENCE.back, FENCE.side, FENCE.back], [-FENCE.side, FENCE.back, -FENCE.side, FENCE.front], [FENCE.side, FENCE.back, FENCE.side, FENCE.front]];
    for (const [x0, z0, x1, z1] of runs) {
      const length = Math.hypot(x1 - x0, z1 - z0), angle = Math.atan2(x1 - x0, z1 - z0), mid = [(x0 + x1) / 2, (z0 + z1) / 2];
      const texture = keep(link.clone()); texture.repeat.set(length / 0.35, H / 0.35);
      const panel = new THREE.Mesh(keep(new THREE.PlaneGeometry(length, H)), keep(new THREE.MeshStandardMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.6 })));
      panel.position.set(mid[0], H / 2, mid[1]); panel.rotation.y = angle - Math.PI / 2; scene.add(panel);
      const rail = new THREE.Mesh(keep(new THREE.BoxGeometry(0.06, 0.06, length)), steel);
      rail.position.set(mid[0], H, mid[1]); rail.rotation.y = angle; scene.add(rail);
      for (let i = 0, n = Math.ceil(length / 2); i <= n; i++) {
        const m = new THREE.Mesh(post, steel); m.position.set(x0 + ((x1 - x0) * i) / n, H / 2, z0 + ((z1 - z0) * i) / n); m.castShadow = true; scene.add(m);
      }
    }
  }

  // Hoop: pole, arm, board, rim and a net that stretches on a basket.
  const steel = mat('#3c4651', { metalness: 0.4, roughness: 0.5 });
  const pole = new THREE.Mesh(keep(new THREE.CylinderGeometry(POLE.radius, POLE.radius, POLE.top, 16)), steel); pole.position.set(POLE.x, POLE.top / 2, POLE.z);
  const arm = new THREE.Mesh(keep(new THREE.BoxGeometry(0.1, 0.1, BOARD.z - POLE.z)), steel); arm.position.set(0, 3.3, (BOARD.z + POLE.z) / 2);
  const boardFace = keep(canvasTexture(360, 210, c => {
    c.fillStyle = '#f7f7f2'; c.fillRect(0, 0, 360, 210); c.strokeStyle = '#d4553a'; c.lineWidth = 10; c.strokeRect(5, 5, 350, 200); c.strokeRect(120, 90, 120, 90);
  }));
  const board = new THREE.Mesh(keep(new THREE.BoxGeometry(BOARD.halfWidth * 2, BOARD.top - BOARD.bottom, BOARD.halfDepth * 2)), mat('#ffffff', { map: boardFace, roughness: 0.4 }));
  board.position.set(0, (BOARD.top + BOARD.bottom) / 2, BOARD.z);
  const rim = new THREE.Mesh(keep(new THREE.TorusGeometry(RIM.radius, RIM.tube, 10, 40)), mat('#e8541f', { roughness: 0.4, metalness: 0.3 }));
  rim.rotation.x = Math.PI / 2; rim.position.set(RIM.x, RIM.y, RIM.z);
  const bracket = new THREE.Mesh(keep(new THREE.BoxGeometry(0.12, 0.04, RIM.z - RIM.radius - BOARD.z)), rim.material);
  bracket.position.set(0, RIM.y, (BOARD.z + RIM.z - RIM.radius) / 2);
  for (const m of [pole, arm, board, rim, bracket]) { m.castShadow = true; scene.add(m); }
  // The net: strands crossing both ways from the rim to a smaller bottom hoop. A basket snaps the bottom down and in,
  // swaying the way the ball went, then it springs back; a rim touch gives it a little shiver.
  const net = new THREE.Group(); net.position.set(RIM.x, RIM.y, RIM.z); scene.add(net);
  const NET_N = 12, netPositions = new Float32Array(NET_N * 3 * 2 * 3);
  const netGeometry = keep(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(netPositions, 3)));
  net.add(new THREE.LineSegments(netGeometry, keep(new THREE.LineBasicMaterial({ color: '#ffffff' }))));
  let netT = 9, netKick = 0, swayX = 0, swayZ = 0;
  const shapeNet = (drop: number, squeeze: number) => {
    const bottom = (i: number, k = 0) => {
      const a = (i / NET_N) * Math.PI * 2, r = 0.18 * (1 - squeeze);
      return [Math.cos(a) * r + swayX * drop, -0.42 - drop * (1 + k), Math.sin(a) * r + swayZ * drop];
    };
    let n = 0;
    const put = (v: number[]) => { netPositions.set(v, n); n += 3; };
    for (let i = 0; i < NET_N; i++) {
      const a = (i / NET_N) * Math.PI * 2, top = [Math.cos(a) * RIM.radius, 0, Math.sin(a) * RIM.radius];
      put(top); put(bottom(i + 1.5)); put(top); put(bottom(i - 1.5)); put(bottom(i)); put(bottom(i + 1));
    }
    netGeometry.attributes.position.needsUpdate = true; netGeometry.computeBoundingSphere();
  };
  shapeNet(0, 0);

  // Ball, with a soft shadow that shrinks as it rises.
  const shadowMat = keep(new THREE.MeshBasicMaterial({ color: '#1e2a1a', transparent: true, opacity: 0.25, depthWrite: false }));
  const shadowDisc = (radius: number) => { const m = new THREE.Mesh(keep(new THREE.CircleGeometry(radius, 24)), shadowMat); m.rotation.x = -Math.PI / 2; m.position.y = 0.02; scene.add(m); return m; };
  const ball = new THREE.Mesh(keep(new THREE.SphereGeometry(BALL_R, 32, 16)), mat('#ffffff', { map: keep(ballTexture()), roughness: 0.7 }));
  // No sun shadow for the ball: it fell off to one side and made it hard to tell where the ball was. One clear shadow
  // sits straight below it instead, and on a rebound a soft ring marks where it will come down.
  scene.add(ball);
  const ballShadowMat = keep(new THREE.MeshBasicMaterial({ color: '#1e2a1a', transparent: true, opacity: 0.45, depthWrite: false }));
  const ballShadow = new THREE.Mesh(keep(new THREE.CircleGeometry(BALL_R * 1.1, 24)), ballShadowMat); ballShadow.rotation.x = -Math.PI / 2; scene.add(ballShadow);
  const landingMat = keep(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
  const landing = new THREE.Mesh(keep(new THREE.RingGeometry(0.17, 0.24, 32)), landingMat); landing.rotation.x = -Math.PI / 2; landing.position.y = 0.03; scene.add(landing);
  /** Where a loose ball next touches the ground: its own physics run ahead on a copy, up to two seconds. */
  const predictLanding = (b: Ball) => {
    const ghost: Ball = { p: { ...b.p }, v: { ...b.v }, acc: 0, scored: true, out: true };
    for (let i = 0; i < 240; i++) for (const e of stepBall(ghost, STEP)) if (e.type === 'floor') return e.at;
    return null;
  };
  let ballSquash = 0, ballPulse = 0;
  // The aim: dots along the rising half of the arc the ball will fly.
  const DOTS = 9, dots = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(0.055, 10, 6)), keep(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 })), DOTS);
  dots.count = 0; dots.frustumCulled = false; scene.add(dots);
  const dotMatrix = new THREE.Matrix4();

  // Dad, with a ground ring that marks the controlled player.
  const dad = new THREE.Group(), body = new THREE.Group(); dad.add(body); scene.add(dad);
  const dadShadow = shadowDisc(0.36);
  const ring = new THREE.Mesh(keep(new THREE.RingGeometry(0.44, 0.52, 40)), keep(new THREE.MeshBasicMaterial({ color: '#ffcf3d', transparent: true, opacity: 0.9, depthWrite: false })));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.025; scene.add(ring);
  // Catcha's stamina gauge around the ring: neon green while it drains, red when he's out of puff. One segment per 1/64.
  const gauge = new THREE.Mesh(keep(new THREE.RingGeometry(0.56, 0.65, 64, 1, Math.PI / 2, Math.PI * 2)), keep(new THREE.MeshBasicMaterial({ color: '#3dff8a', transparent: true, opacity: 0.95, depthWrite: false })));
  gauge.rotation.x = -Math.PI / 2; gauge.position.y = 0.027; gauge.visible = false; scene.add(gauge);
  // Catcha's soft dust: kicked up while running, a burst on a sprint, thrown forward in a skid.
  const puffs = createPuffs(scene);
  const dust = (x: number, z: number, n: number, push = { x: 0, z: 0 }, spread = 0.25) => {
    const hex = onAsphalt({ x, z }) ? '#ddd6c8' : '#e6f5c0';
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 0.4 + Math.random() * 0.6;
      puffs.spawn(x + Math.cos(a) * spread, 0.12, z + Math.sin(a) * spread, Math.cos(a) * s + push.x, 0.5 + Math.random() * 0.5, Math.sin(a) * s + push.z, 0.55, 0.55 + Math.random() * 0.4, hex);
    }
  };
  const audio = createHoopsAudio();
  // The family: each faces Dad, sways, claps while a shot is up, jumps and cheers a basket, slumps at a near miss, flinches if hit.
  const fans = FAMILY.map((spec, i) => {
    const group = new THREE.Group(), body = new THREE.Group(); group.add(body); group.position.set(spec.x, 0, spec.z); scene.add(group);
    shadowDisc(spec.radius + 0.06).position.set(spec.x, 0.02, spec.z);
    return { spec, group, body, joints: [] as THREE.Object3D[], model: null as THREE.Object3D | null, mood: 'idle' as Mood, moodT: 0, hop: 0, y: 0, vy: 0, phase: i * 1.7 };
  });
  const setMood = (mood: Mood, seconds: number, hop = false) => fans.forEach((f, i) => {
    f.mood = mood; f.moodT = seconds;
    if (hop) f.hop = 0.04 + i * 0.07 + Math.random() * 0.05;
  });
  // ?fans=cheer (or watch, aww, flinch) holds the family in one mood, for tuning poses like the farm's ?time=.
  const holdMood = new URLSearchParams(location.search).get('fans') as Mood | null;
  // ?speed=0.25 slows the whole game down, for checking animation.
  const timeScale = Number(new URLSearchParams(location.search).get('speed')) || 1;
  let shotLive = false, rimTouched = false, clock = 0, wasAir = false, runDust = 0, lastMove: string | undefined;
  const joints: THREE.Object3D[] = [];
  // The right hand: the bottom of the right arm in the arm's own space, measured in the rest pose.
  let rightArm: THREE.Object3D | null = null;
  const handLocal = new THREE.Vector3(), hand = new THREE.Vector3(), pickupFrom = new THREE.Vector3();
  let model: THREE.Object3D | null = null, disposed = false, paused = false, loaded = false, frame = 0, previous = performance.now(), hudClock = 0;
  let stepPhase = 0, squash = 1, followT = 0, pickupT = 0, lean = 0, landT = 0;
  const PICKUP = 0.28;

  const disposeObject = (root: THREE.Object3D) => root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.dispose();
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) { for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose(); m.dispose(); }
  });
  /** Scales a loaded character to a height, feet on the ground, and collects its arm and leg pivots. */
  const fit = (root: THREE.Object3D, height: number, into: THREE.Object3D[]) => {
    root.scale.multiplyScalar(height / new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y);
    root.position.y -= new THREE.Box3().setFromObject(root).min.y;
    root.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } else if (/^(arm-|leg-)/.test(o.name)) into.push(o); });
    return root;
  };
  const loader = new GLTFLoader();
  const ready = Promise.all([loader.loadAsync(DAD), ...fans.map(f => loader.loadAsync(FAMILY_ASSETS[f.spec.who]))]).then(([gltf, ...family]) => {
    if (disposed) { [gltf, ...family].forEach(g => disposeObject(g.scene)); return; }
    family.forEach((g, i) => { const f = fans[i]; f.model = fit(g.scene, f.spec.height, f.joints); f.body.add(f.model); });
    model = fit(gltf.scene, DAD_HEIGHT, joints);
    body.add(model);
    // The model's arms are named as seen from its front, so 'arm-left' is Dad's right hand.
    rightArm = joints.find(j => j.name === 'arm-left') ?? null;
    if (rightArm) {
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(rightArm);
      rightArm.worldToLocal(handLocal.set((box.min.x + box.max.x) / 2, box.min.y + 0.04, (box.min.z + box.max.z) / 2));
    }
    return renderer.compileAsync(scene, camera);
  }).then(() => { if (!disposed) { loaded = true; previous = performance.now(); callbacks.update(); } });

  /** Dad on screen in client px: his middle, and a radius from his projected height. */
  const dadScreen = (): Target => {
    const rect = canvas.getBoundingClientRect(), p = state.player;
    const feet = probe.set(p.x, p.y, p.z).project(camera), fy = feet.y, fx = feet.x;
    const head = probe.set(p.x, p.y + DAD_HEIGHT, p.z).project(camera);
    const toY = (y: number) => rect.top + (1 - y) * rect.height / 2;
    return { x: rect.left + (fx + 1) * rect.width / 2, y: (toY(fy) + toY(head.y)) / 2, radius: toY(fy) - toY(head.y) };
  };
  const input = createHoopsInput(canvas, host, () => state.mode === 'held' ? dadScreen() : null);
  /** The pull with the rim's on-screen direction from Dad, so aim is judged against the rim the player sees. */
  const rimScreen = () => {
    const rect = canvas.getBoundingClientRect(), rim = probe.set(RIM.x, RIM.y, RIM.z).project(camera);
    return { x: rect.left + (rim.x + 1) * rect.width / 2, y: rect.top + (1 - rim.y) * rect.height / 2 };
  };
  const aimed = (pull: Pull): Pull => {
    const from = dadScreen(), rim = rimScreen();
    return { ...pull, rimAngle: Math.atan2(rim.y - from.y, rim.x - from.x) };
  };

  function feedback(e: GameEvent) {
    audio.play(e);
    // The family follows each shot, not the same way every time: a basket always gets claps, and only sometimes a
    // jumping, shouting cheer (more often for two points); a miss only sometimes gets a slump, and a rim-out an "aww".
    if (e.type === 'shot') { shotLive = true; rimTouched = false; setMood('watch', 3); }
    if (e.type === 'rim' && shotLive) rimTouched = true;
    if (e.type === 'score' && shotLive) {
      shotLive = false;
      // A dunk always brings the house down.
      const shout = lastMove === 'dunk' || Math.random() < (state.value === 2 ? 0.55 : 0.3);
      audio.cheer(state.value, shout);
      if (shout) setMood('cheer', state.value === 2 ? 1.6 : 1.2, true); else setMood('clap', 1.3);
    }
    if (e.type === 'floor' && shotLive) { shotLive = false; setMood(Math.random() < 0.5 ? 'aww' : 'idle', 0.9); if (rimTouched && Math.random() < 0.3) audio.aww(); }
    if (e.type === 'fan') { const hit = fans.reduce((a, f) => Math.hypot(f.spec.x - e.at.x, f.spec.z - e.at.z) < Math.hypot(a.spec.x - e.at.x, a.spec.z - e.at.z) ? f : a); hit.mood = 'flinch'; hit.moodT = 0.45; }
    const p = state.player, back = { x: -Math.sin(dad.rotation.y) * 1.2, z: -Math.cos(dad.rotation.y) * 1.2 };
    if (e.type === 'dash') dust(p.x, p.z, 6, back);
    if (e.type === 'skid') dust(p.x + Math.sin(dad.rotation.y) * 0.3, p.z + Math.cos(dad.rotation.y) * 0.3, 5, { x: -back.x, z: -back.z });
    if (e.type === 'jump') { dust(p.x, p.z, state.drive ? 7 : 3, undefined, state.drive ? 0.3 : 0.15); if (state.drive) audio.squeak(); }
    if (e.type === 'shot') { lastMove = e.move; if (e.move === 'dunk') rimShake = 1; }
    if (e.type === 'floor' || e.type === 'dribble') ballSquash = 1;
    if (e.type === 'rim' || e.type === 'board' || e.type === 'pole') ballPulse = 1;
    if (e.type === 'score') {
      netT = 0; netKick = 1; const v = state.ball.v, sp = Math.hypot(v.x, v.z) || 1; swayX = (v.x / sp) * 0.25; swayZ = (v.z / sp) * 0.25;
      // A little burst of sparkle out of the bottom of the net, more for two points.
      for (let i = 0; i < (state.value === 2 ? 10 : 6); i++) {
        const a = Math.random() * Math.PI * 2;
        puffs.spawn(RIM.x + Math.cos(a) * 0.15, RIM.y - 0.35, RIM.z + Math.sin(a) * 0.15, Math.cos(a) * 1.2, -0.3 + Math.random() * 0.8, Math.sin(a) * 1.2, 0.45, 0.22 + Math.random() * 0.12, '#fff6d0');
      }
      const word = streakWord(state.streak);
      if (word) audio.praise(word);
    }
    if (e.type === 'rim' && netT > 0.6) { netT = 0; netKick = 0.25; swayX = swayZ = 0; }
    if (e.type === 'shot') followT = 0.25;
    if (e.type === 'pickup') { pickupT = PICKUP; pickupFrom.copy(ball.position); }
    callbacks.event(e);
  }

  const visibility = () => { previous = performance.now(); };
  document.addEventListener('visibilitychange', visibility);
  function animate(now: number) {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    const dt = Math.min(0.1, Math.max(0, (now - previous) / 1000)) * timeScale; previous = now;
    if (paused || document.hidden || !loaded) return;
    input.tick();
    for (let e = input.next(); e; e = input.next()) {
      if (e.type === 'aim') startAim(state);
      if (e.type === 'cancel') cancelAim(state);
      if (e.type === 'shoot') { const shot = shoot(state, aimed(e.pull)); if (shot) feedback(shot); }
    }
    if (input.jump()) jump(state);
    const events = stepShootaround(state, dt, input.read()); events.forEach(feedback);
    follow(Math.min(1, dt * 3.5));

    // Dad moves exactly as Catcha's characters do (characters.js stepPlayer): the same step rate for his speed, bounce,
    // lean, squash and stretch, arm and leg swing, sprint wind-up and skid, and jump crouch and leap. Hoops adds the
    // basketball on top: the dribbling hand, the aim, the follow-through and the pickup bend.
    const p = state.player, speed = Math.hypot(p.vx, p.vz), moving = speed > 0.3;
    const aiming = state.mode === 'aim', shooting = aiming || followT > 0;
    const facing = shooting ? Math.atan2(RIM.x - p.x, RIM.z - p.z) : p.yaw, delta = Math.atan2(Math.sin(facing - dad.rotation.y), Math.cos(facing - dad.rotation.y));
    dad.rotation.y += Math.max(-10 * dt, Math.min(10 * dt, delta));
    stepPhase += dt * (moving ? 13 * (speed / RUN_SPEED) : 2);
    const air = p.y > 0, crouching = p.jumpT >= 0, rise = air ? Math.max(0, Math.min(1, 0.5 - p.vy / (2 * JUMP_V))) : -1;
    followT = Math.max(0, followT - dt); pickupT = Math.max(0, pickupT - dt); landT = Math.max(0, landT - dt); clock += dt;
    if (wasAir && !air) { audio.land(); dust(p.x, p.z, 5, undefined, 0.2); landT = 0.16; }
    wasAir = air;
    const winding = p.dashT >= 0 && p.dashT < DASH_WINDUP, sprinting = p.dashT >= DASH_WINDUP, skidding = p.skidT > 0;
    const bend = pickupT > 0 ? Math.sin((pickupT / PICKUP) * Math.PI) : 0;
    const squashTo = crouching ? 0.72 : state.drive && rise >= 0 ? 1.16 : rise >= 0 ? (rise < 0.35 ? 1.18 : 1.04) : landT > 0 ? 0.78
      : winding ? 0.86 : sprinting && p.dashT < DASH_WINDUP + 0.14 ? 1.1 : aiming ? 0.94 : 1 - bend * 0.12;
    const leanTo = crouching ? 0.3 : rise >= 0 ? (rise < 0.6 ? 0.2 : -0.1) : winding ? -0.2 : skidding ? -0.22 : sprinting ? 0.24 : moving ? 0.06 : 0;
    squash += (squashTo - squash) * Math.min(1, dt * 16);
    lean += (leanTo + 0.6 * bend - lean) * Math.min(1, dt * 16);
    body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    body.rotation.x = lean;
    // Catcha's bounce: two little hops per stride, higher in a sprint.
    dad.position.set(p.x, p.y + (moving && !air && !crouching && !winding ? Math.abs(Math.sin(stepPhase)) * (sprinting ? 0.14 : 0.09) : 0), p.z);
    // Dust from his feet as he runs, more the faster he goes.
    runDust = moving && !air ? runDust + dt * (2 + 6 * Math.min(1.5, speed / RUN_SPEED) ** 2) : 0;
    for (; runDust >= 1; runDust--) dust(p.x - Math.sin(dad.rotation.y) * 0.25, p.z - Math.cos(dad.rotation.y) * 0.25, 1, { x: -p.vx * 0.15, z: -p.vz * 0.15 }, 0.12);
    // The stamina gauge, only while it matters.
    gauge.visible = p.dashT >= 0 || state.stamina < 1;
    if (gauge.visible) {
      gauge.geometry.setDrawRange(0, Math.max(1, Math.round(state.stamina * 64)) * 6);
      (gauge.material as THREE.MeshBasicMaterial).color.set(state.tired ? '#ff6b5b' : '#3dff8a');
      gauge.position.set(p.x, 0.027, p.z);
    }
    // Limbs as Catcha sets them, straight onto the pose each frame (no smoothing, which made the run float).
    const swing = Math.sin(stepPhase) * (moving ? (sprinting ? 0.8 : 0.5) : 0.06), beat = state.dribble - Math.floor(state.dribble);
    for (const joint of joints) {
      const isArm = joint.name.startsWith('arm'), side = joint.name.includes('right') ? 1 : -1;
      let to = isArm ? -swing * side * (sprinting ? 1.1 : 0.7) + (sprinting ? 0.25 : winding ? 0.6 : 0) : swing * side;
      if (crouching) to = isArm ? 0.9 : 0;
      else if (rise >= 0) to = isArm ? -2.2 + rise * 1.5 + (side > 0 ? 0.25 : 0) : rise < 0.7 ? (side > 0 ? -0.75 : 0.55) : -0.3;
      // A dunk: both arms up with the ball, then hanging on the rim with the knees tucked. A layup: one arm reaching up.
      if (state.drive && !crouching) {
        const hanging = state.drive.hang > 0 || state.drive.released;
        if (state.drive.kind === 'dunk') to = isArm ? (hanging ? -2.6 : -2.95) : hanging ? (side > 0 ? -0.9 : 0.5) : to;
        else to = isArm ? (joint === rightArm ? -2.95 : -0.6) : to;
      }
      if (isArm && bend > 0) to = -1.3 * bend - 0.2;
      else if (isArm && shooting) to = aiming ? -2.75 : -2.3;
      // The dribbling hand keeps a light smoothing so it rides the ball's beat without snapping.
      if (joint === rightArm && state.mode === 'held' && !crouching && rise < 0) joint.rotation.x += (-0.55 + 0.3 * Math.sin(2 * Math.PI * beat) - joint.rotation.x) * Math.min(1, dt * 30);
      else joint.rotation.x = to;
    }
    dadShadow.position.set(p.x, 0.02, p.z); dadShadow.scale.setScalar(1 - Math.min(0.4, p.y * 0.4));
    ring.position.set(p.x, 0.025, p.z);

    // Ball: drawn at the hand while dribbling, scooped up from the floor on a pickup, otherwise where the physics has it.
    const b = state.ball.p;
    ball.position.set(b.x, b.y, b.z);
    if (state.mode === 'held' && rightArm) {
      dad.updateMatrixWorld(true); rightArm.localToWorld(hand.copy(handLocal));
      // Out from his side and a little ahead, so it bounces clear of his legs.
      const out = Math.hypot(hand.x - p.x, hand.z - p.z) || 1, fx = Math.sin(dad.rotation.y), fz = Math.cos(dad.rotation.y);
      ball.position.set(hand.x + ((hand.x - p.x) / out) * 0.1 + fx * 0.12, BALL_R + (hand.y - 2 * BALL_R) * Math.abs(Math.cos(Math.PI * state.dribble)), hand.z + ((hand.z - p.z) / out) * 0.1 + fz * 0.12);
      if (pickupT > 0) ball.position.lerpVectors(pickupFrom, ball.position, 1 - pickupT / PICKUP);
    }
    // The aim: dots up to the top of the arc the release will fly.
    const pull = aiming ? input.pull() : null;
    dots.count = 0;
    if (pull && Math.hypot(pull.dx, pull.dy) >= MIN_PULL_PX) {
      const from = releasePoint(state), v = shotVelocity(from, aimed(pull)), apex = Math.max(0.05, v.y / GRAVITY);
      for (let i = 1; i <= DOTS; i++) {
        const t = (apex * i) / DOTS, size = 1 - (i / DOTS) * 0.45;
        dotMatrix.makeScale(size, size, size).setPosition(from.x + v.x * t, from.y + v.y * t - 0.5 * GRAVITY * t * t, from.z + v.z * t);
        dots.setMatrixAt(dots.count++, dotMatrix);
      }
      dots.instanceMatrix.needsUpdate = true;
    }
    const v = state.ball.v, spin = Math.hypot(v.x, v.z) * dt / BALL_R;
    if (spin > 0) ball.rotateOnWorldAxis(probe.set(v.z, 0, -v.x).normalize(), spin);
    ballSquash = Math.max(0, ballSquash - dt / 0.12); ballPulse = Math.max(0, ballPulse - dt / 0.15);
    const flat = 0.2 * ballSquash * (b.y < BALL_R * 1.4 ? 1 : 0), pulse = 1 - 0.1 * ballPulse;
    ball.scale.set((1 + flat * 0.6) * pulse, (1 - flat) * pulse, (1 + flat * 0.6) * pulse); ball.position.y -= BALL_R * flat;
    ballShadow.position.set(b.x, 0.021, b.z); ballShadow.scale.setScalar(Math.max(0.75, 1 - b.y * 0.06)); ballShadowMat.opacity = Math.max(0.22, 0.45 - b.y * 0.05);
    const land = state.mode === 'loose' && b.y > BALL_R + 0.1 ? predictLanding(state.ball) : null;
    if (land) landing.position.set(land.x, 0.03, land.z);
    landingMat.opacity += ((land ? 0.55 : 0) - landingMat.opacity) * Math.min(1, dt * 10);
    landing.visible = landingMat.opacity > 0.02;

    if (netT < 1.6) {
      netT += dt;
      const k = netKick * Math.exp(-netT * 4.5);
      shapeNet(0.22 * k * Math.cos(netT * 15), 0.35 * netKick * Math.exp(-netT * 5));
    }
    rimShake = Math.max(0, rimShake - dt / 0.6);
    rim.rotation.x = Math.PI / 2 + Math.sin(clock * 45) * 0.12 * rimShake; board.rotation.z = Math.sin(clock * 38) * 0.02 * rimShake;
    daylight(dt); puffs.step(dt); birds.update(dt, target);
    for (const f of fans) {
      if (holdMood) { f.mood = holdMood; f.moodT = 1; }
      if ((f.moodT -= dt) <= 0) f.mood = 'idle';
      const t = clock + f.phase, toddler = f.spec.who === 'toddler';
      f.group.rotation.y = turn(f.group.rotation.y, Math.atan2(p.x - f.spec.x, p.z - f.spec.z), dt * 4);
      if (f.hop > 0 && (f.hop -= dt) <= 0) f.vy = toddler ? 3 : 2.5;
      if (f.y > 0 || f.vy > 0) {
        f.vy -= 14 * dt; f.y += f.vy * dt;
        // The toddler can't stop bouncing while everyone cheers.
        if (f.y <= 0) { f.y = 0; f.vy = toddler && f.mood === 'cheer' && f.moodT > 0.35 ? 2.4 : 0; }
      }
      f.group.position.y = f.y;
      const tilt = f.mood === 'aww' ? 0.32 : f.mood === 'flinch' ? -0.35 : f.mood === 'watch' ? 0.12 : f.mood === 'clap' ? 0.05 : 0;
      f.body.rotation.x += (tilt - f.body.rotation.x) * Math.min(1, dt * 8);
      f.body.rotation.z = Math.sin(t * (f.mood === 'cheer' ? 9 : 1.6)) * (f.mood === 'cheer' ? 0.1 : 0.04);
      const stretch = f.y > 0 ? 1.08 : f.mood === 'aww' ? 0.95 : 1;
      f.body.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
      for (const joint of f.joints) {
        const arm = joint.name.startsWith('arm'), side = joint.name.includes('right') ? 1 : -1;
        const to = !arm ? (f.y > 0 ? side * 0.4 : 0)
          : f.mood === 'cheer' ? 0
          : f.mood === 'watch' || f.mood === 'clap' ? -1.2 + Math.sin(t * 20) * 0.22
          : f.mood === 'flinch' ? -1.6 : f.mood === 'aww' ? 0.15 : Math.sin(t * 2 + side) * 0.08;
        joint.rotation.x += (to - joint.rotation.x) * Math.min(1, dt * 14);
        // Arms thrown up and out to the sides for a cheer, waving (the pivots aren't mirrored, so the sides rotate opposite ways);
        // raised forward they'd point at the camera and hide behind those big heads.
        if (arm) joint.rotation.z += ((f.mood === 'cheer' ? side * (CHEER_Z + Math.sin(t * 14) * 0.25) : 0) - joint.rotation.z) * Math.min(1, dt * 14);
      }
    }
    renderer.render(scene, camera);
    hudClock += dt;
    if (hudClock > 0.1 || events.length) { hudClock = 0; callbacks.update(); }
  }
  frame = requestAnimationFrame(animate);

  return {
    ready, state, dadScreen, rimScreen,
    get music() { return audio.music; },
    /** The Music switch; with no value, re-reads the Sound switch. */
    setMusic(value?: boolean) { audio.setMusic(value); },
    setPaused(value: boolean) { paused = value; audio.setPaused(value); input.setEnabled(!value); previous = performance.now(); if (!value) canvas.focus({ preventScroll: true }); },
    destroy() {
      if (disposed) return;
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); input.destroy(); audio.destroy(); puffs.dispose(); birds.dispose(); worldGeometry.forEach(g => g.dispose()); props.dispose();
      document.removeEventListener('visibilitychange', visibility);
      if (model) disposeObject(model);
      for (const f of fans) if (f.model) disposeObject(f.model);
      disposables.forEach(d => d.dispose()); sun.shadow.map?.dispose(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    }
  };
}

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { IDLE_RPM, PARTS, REDLINE, TACH_SWEEP, paintColor, piecesFor, type ModeId, type PaintId, type Piece } from './steps';
import { ROOM, buildRoom, buildStand } from './room';
import { createEffects } from './effects';
import { createRide, type Ride } from './ride';
import { createLife, type Life } from './life';
import { sound } from '#lib/sound';
import type { GarageAudio } from './audio';
import type { Garage } from './storage';

export type Phase = 'loading' | 'garage' | 'build' | 'paint' | 'start' | 'ride' | 'finish';
/** pick: nothing in hand (Mechanic, Master); present: a part in hand; fly: going on; bolts: waiting for taps; done: on. */
export type Stage = 'pick' | 'present' | 'fly' | 'bolts' | 'done';
export type GarageView = {
  phase: Phase; mode: ModeId; stage: Stage; held: string; placed: string[]; tray: string[]; total: number;
  /** What the card says: a part's fact once it is on, or why a part didn't go where it was put. */
  note: string; noteKind: '' | 'fact' | 'wrong';
  mistakes: number; boltsLeft: number; paint: PaintId; radio: boolean;
  /** Mechanic and Master: whole seconds on the build's stopwatch, and whether the finished time beat the mode's best. */
  time: number; newBest: boolean;
  engine: 'off' | 'cranking' | 'running'; revved: boolean;
  stars: number; starTotal: number; progress: number; speed: number;
};
type Callbacks = { change: (view: GarageView) => void; save: () => void; thumbs: (images: Record<string, string>) => void };
type Rt = { def: Piece; node: THREE.Group; home: { centre: THREE.Vector3; radius: number }; bolts: THREE.Vector3[] };

const ease = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const easeIn = (t: number) => t * t * t;
const v3 = (a: readonly number[]) => new THREE.Vector3(a[0], a[1], a[2]);
const RAD = Math.PI / 180;
const ZOOM = { min: 0.26, max: 1.25 };

export function createGarageScene(host: HTMLElement, overlay: HTMLElement, garage: Garage, audio: GarageAudio, callbacks: Callbacks) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  const canvas = renderer.domElement; canvas.dataset.garageCanvas = '';
  canvas.setAttribute('aria-label', 'The garage. Drag to turn round, pinch to zoom.'); host.append(canvas);

  const scene = new THREE.Scene(); scene.background = new THREE.Color('#d9d2c3');
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environment = envTex; scene.environmentIntensity = 0.75;
  const hemi = new THREE.HemisphereLight('#fff6e8', '#7d7468', 1.1); scene.add(hemi);
  const key = new THREE.DirectionalLight('#fff4e2', 2.4); key.position.set(1.6, 4.2, 2.4); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -1.7, right: 1.7, top: 1.7, bottom: -1.7, near: 0.5, far: 9 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 3; scene.add(key, key.target);
  const fill = new THREE.PointLight('#ffe9c9', 6, 9, 1.6); fill.position.set(-1.5, 2.6, 2.2); scene.add(fill);
  const daylight = new THREE.PointLight('#dff1ff', 10, 10, 1.4); daylight.position.set(5.2, 2, 0.6); scene.add(daylight);

  const room = buildRoom(scene), stand = buildStand(); scene.add(stand.group);
  const fx = createEffects(scene);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 400);
  let life: Life | null = null;

  let width = 1, height = 1;
  const resize = () => {
    const r = host.getBoundingClientRect(); if (!r.width || !r.height) return;
    width = r.width; height = r.height; renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize); observer.observe(host); resize();

  // ---- state ------------------------------------------------------------------------------------------------------
  const view: GarageView = { phase: 'loading', mode: garage.building?.mode ?? garage.mode, stage: 'pick', held: '', placed: [], tray: [], total: 0,
    note: '', noteKind: '', mistakes: 0, time: 0, newBest: false, boltsLeft: 0, paint: garage.building?.paint ?? garage.bikes.at(-1)?.paint ?? 'red', radio: garage.radio,
    engine: 'off', revved: false, stars: 0, starTotal: 0, progress: 0, speed: 0 };
  let changed = true;
  const set = (patch: Partial<GarageView>) => { Object.assign(view, patch); changed = true; };

  let bike: THREE.Object3D = new THREE.Group();
  const parts: Record<string, THREE.Object3D> = {};
  let frameNode: THREE.Object3D | null = null, paintMat: THREE.MeshStandardMaterial | null = null;
  const pivots: Record<string, { node: THREE.Object3D; base: THREE.Quaternion }> = {};
  const partBolts: Record<string, THREE.Vector3[]> = {};
  let pieces: Rt[] = [];
  const done = new Set<string>();
  let held = -1, timer = 0;
  const puzzle = () => view.mode !== 'apprentice';

  // ---- camera: framed by the game, turned, pinched and panned by the child ------------------------------------
  const goal = { target: new THREE.Vector3(0, 0.55, 0), az: 25, el: 12, radius: 1.3 };
  const cam = { target: goal.target.clone(), az: 25, el: 12, dist: 5, lift: 0.1 };
  let userAz = 0, userEl = 0, posed = false, zoom = 1;
  const pan = new THREE.Vector3();
  const frame = (target: THREE.Vector3, radius: number, az: number, el: number) => { goal.target.copy(target); goal.radius = radius; goal.az = az; goal.el = el; };
  const wholeBike = (az = 25, el = 12) => frame(new THREE.Vector3(0, 0.52, 0), 1.18, az, el);
  const resetView = () => { zoom = 1; pan.set(0, 0, 0); userAz = 0; userEl = 0; };
  const fitAngle = () => { const vHalf = camera.fov * RAD / 2, hHalf = Math.atan(Math.tan(vHalf) * camera.aspect); return Math.min(Math.atan(Math.tan(vHalf) * 0.72), hHalf * 0.94); };
  const aim = new THREE.Vector3();
  function placeCamera(dt: number, snap = false) {
    // Fit the framing sphere in the screen's narrower direction, leaving room for the bars along the top and bottom.
    const dist = goal.radius * zoom / Math.sin(fitAngle());
    const busy = touches.size > 0 || drag?.kind === 'orbit';
    const k = snap ? 1 : 1 - Math.exp(-dt * (busy ? 14 : 3.2));
    cam.target.lerp(aim.copy(goal.target).add(pan), k); cam.dist += (dist - cam.dist) * k;
    cam.az += (goal.az + userAz - cam.az) * k; cam.el += (Math.max(-5, Math.min(62, goal.el + userEl)) - cam.el) * k;
    const az = cam.az * RAD, el = cam.el * RAD;
    // turned right round, the camera would end up through a wall: it comes in closer instead (the front is open)
    const dir = tmp2.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    let reach = cam.dist;
    for (const [axis, lo, hi] of [['x', ROOM.left + 0.25, ROOM.right - 0.25], ['y', 0.15, ROOM.height - 0.2], ['z', ROOM.back + 0.25, 40]] as const) {
      const d = dir[axis], from = cam.target[axis];
      if (d > 1e-4) reach = Math.min(reach, (hi - from) / d); else if (d < -1e-4) reach = Math.min(reach, (lo - from) / d);
    }
    camera.position.copy(cam.target).addScaledVector(dir, Math.max(0.3, reach));
    // the bottom bar is the taller one, so the bike sits a touch above the middle (well above it over the garage's home card)
    cam.lift += ((view.phase === 'garage' ? 0.42 : 0.1) - cam.lift) * k;
    camera.lookAt(cam.target.x, cam.target.y - goal.radius * zoom * cam.lift, cam.target.z);
  }

  // ---- loading ------------------------------------------------------------------------------------------------------
  const draco = new DRACOLoader().setDecoderPath('/garage/draco/');
  const loader = new GLTFLoader().setDRACOLoader(draco);
  // a new file name for every new model: for one visit after a deploy, the old offline cache still answers for the old name
  const ready = loader.loadAsync('/garage/roadster-v2.glb').then(gltf => {
    frameNode = gltf.scene.getObjectByName('part_frame') ?? null;
    bike = frameNode?.parent ?? gltf.scene;
    scene.add(gltf.scene);
    bike.traverse(o => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true; o.receiveShadow = true;
        const m = o.material as THREE.MeshStandardMaterial;
        if (m.name === 'paint') paintMat = m;
        if (m.transparent) o.castShadow = false;
      }
      if (o.name.startsWith('spin_') || o.name.startsWith('needle_')) pivots[o.name] = { node: o, base: o.quaternion.clone() };
      const b = /^bolt_(.+)_(\d+)$/.exec(o.name);
      if (b) (partBolts[b[1]] ??= [])[Number(b[2])] = o.getWorldPosition(new THREE.Vector3());
    });
    for (const p of PARTS) {
      const node = bike.getObjectByName(`part_${p.id}`);
      if (!node) throw new Error(`roadster-v2.glb has no part_${p.id}`);
      parts[p.id] = node;
    }
    if (paintMat) paintMat.color.set(paintColor(view.paint));
    const b = garage.building;
    setup(b ? b.mode : garage.mode, b ? b.placed : garage.bikes.length ? 'all' : [], b?.time ?? 0);
    stand.group.visible = !!b || !garage.bikes.length;
    room.setPhotos(garage.bikes);
    wholeBike(); placeCamera(0, true);
    set({ phase: 'garage' });
    // the radio and the family aren't needed to start building; they arrive when they've loaded
    createLife(room.group).then(l => { if (disposed) l.dispose(); else life = l; }).catch(e => console.warn('Garage life did not load', e));
  });
  ready.finally(() => draco.dispose());
  audio.radio(garage.radio);

  /** Group the bike's parts into this mode's pieces; `placed` are on already, the rest wait in the tray. */
  function setup(mode: ModeId, placed: string[] | 'all', time = 0) {
    for (const p of pieces) { for (const child of [...p.node.children]) bike.add(child); p.node.removeFromParent(); }
    const defs = piecesFor(mode);
    pieces = defs.map(def => {
      const node = new THREE.Group(); node.name = `piece_${def.id}`; bike.add(node);
      for (const id of def.members) { const n = parts[id]; n.position.set(0, 0, 0); node.add(n); }
      const sphere = new THREE.Box3().setFromObject(node).getBoundingSphere(new THREE.Sphere());
      // every part keeps its own bolts in Master; a big step shows its two nearest the camera's side
      let bolts = def.members.flatMap(id => partBolts[id] ?? []).filter(Boolean);
      if (mode !== 'master') bolts = bolts.sort((a, b) => b.z - a.z).slice(0, 2);
      return { def, node, home: { centre: sphere.center.clone(), radius: sphere.radius }, bolts };
    });
    done.clear();
    for (const p of pieces) if (placed === 'all' || placed.includes(p.def.id)) done.add(p.def.id);
    for (const p of pieces) { p.node.visible = done.has(p.def.id); p.node.position.set(0, 0, 0); p.node.scale.setScalar(1); }
    held = -1;
    const tray = mode === 'apprentice' ? [] : shuffle(pieces.filter(p => !done.has(p.def.id)).map(p => p.def.id));
    timer = time;
    set({ mode, placed: [...done], tray, total: pieces.length, held: '', stage: 'pick', note: '', noteKind: '', mistakes: 0, time: Math.floor(time), newBest: false });
    if (mode !== 'apprentice') renderThumbs();
  }
  function shuffle<T>(list: T[]) { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; }

  /** A small picture of each piece for the parts tray, drawn with the game's own renderer and lights. */
  function renderThumbs() {
    const S = 120, px = renderer.getPixelRatio(), out: Record<string, string> = {};
    const pad = document.createElement('canvas'); pad.width = pad.height = 144; const g = pad.getContext('2d')!;
    const shot = new THREE.PerspectiveCamera(26, 1, 0.01, 30);
    const before = { bg: scene.background, room: room.group.visible, stand: stand.group.visible, frame: frameNode?.visible ?? true };
    const shown = pieces.map(p => p.node.visible), at = bike.position.clone();
    scene.background = new THREE.Color('#efe4cc'); room.group.visible = false; stand.group.visible = false;
    if (frameNode) frameNode.visible = false; bike.position.set(0, 0, 0);
    for (const p of pieces) p.node.visible = false;
    renderer.setScissorTest(true);
    for (const p of pieces) {
      if (done.has(p.def.id)) continue;
      p.node.visible = true;
      const { centre, radius } = p.home, az = (p.def.step.az + 12) * RAD, el = 20 * RAD, d = radius / Math.sin(12.5 * RAD);
      shot.position.set(centre.x + d * Math.sin(az) * Math.cos(el), centre.y + d * Math.sin(el), centre.z + d * Math.cos(az) * Math.cos(el));
      shot.lookAt(centre);
      renderer.setViewport(0, 0, S, S); renderer.setScissor(0, 0, S, S);
      renderer.render(scene, shot);
      g.clearRect(0, 0, 144, 144);
      g.drawImage(canvas, 0, canvas.height - S * px, S * px, S * px, 0, 0, 144, 144);
      out[p.def.id] = pad.toDataURL('image/webp', 0.85);
      p.node.visible = false;
    }
    renderer.setScissorTest(false); renderer.setViewport(0, 0, width, height);
    scene.background = before.bg; room.group.visible = before.room; stand.group.visible = before.stand;
    if (frameNode) frameNode.visible = before.frame; bike.position.copy(at);
    pieces.forEach((p, i) => { p.node.visible = shown[i]; });
    callbacks.thumbs(out);
  }

  // ---- build ------------------------------------------------------------------------------------------------------
  let ghost: THREE.Object3D | null = null, ghostMat: THREE.MeshBasicMaterial | null = null, near = 0;
  let flight: { t: number; from: THREE.Vector3; s0: number; via: THREE.Vector3 } | null = null;
  let back: { t: number; from: THREE.Vector3; s0: number } | null = null;
  let bob = 0, idleFor = 0, doneAt = 0, noteAt = 0;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  /** Where a piece's middle is now, and putting it somewhere (its node holds it at `scale` about that middle). */
  const centreOf = (p: Rt, out = new THREE.Vector3()) => out.copy(p.home.centre).multiplyScalar(p.node.scale.x).add(p.node.position);
  const placeAt = (p: Rt, centre: THREE.Vector3, scale: number) => { p.node.scale.setScalar(scale); p.node.position.copy(centre).addScaledVector(p.home.centre, -scale); };
  /** In hand: Apprentice parts wait beside their place; puzzle parts float low in the middle of the screen, kept small. */
  function rest(p: Rt, out: THREE.Vector3) {
    if (!puzzle()) return { centre: out.copy(p.home.centre).add(v3(p.def.step.wait)), scale: 1 };
    // on a plane well in front of the bike, so a part in hand never sinks into it
    const look = camera.getWorldDirection(tmp2), r = rayAt(width / 2, height * 0.6);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(look, out.copy(camera.position).addScaledVector(look, camera.position.distanceTo(cam.target) * 0.55));
    if (!r.intersectPlane(plane, out)) out.copy(cam.target);
    return { centre: out, scale: Math.min(1, Math.max(0.2, 70 / pxRadius(out, p.home.radius))) };
  }

  function makeGhost(node: THREE.Object3D) {
    ghostMat = new THREE.MeshBasicMaterial({ color: '#8fe3ff', transparent: true, opacity: 0.3, depthWrite: false });
    const g = node.clone(true); g.position.set(0, 0, 0); g.scale.setScalar(1);
    g.traverse(o => { if (o instanceof THREE.Mesh) { o.material = ghostMat!; o.castShadow = false; o.receiveShadow = false; o.renderOrder = 2; } });
    g.visible = true; node.parent!.add(g); return g;
  }
  function clearGhost() { if (ghost) { ghost.removeFromParent(); ghost = null; ghostMat?.dispose(); ghostMat = null; } }
  function present(i: number) {
    const p = pieces[i]; held = i;
    p.node.visible = true; back = null; flight = null;
    const r = rest(p, tmp); placeAt(p, r.centre, r.scale);
    if (!puzzle()) {
      ghost = makeGhost(p.node);
      const wait = p.home.centre.clone().add(v3(p.def.step.wait));
      frame(p.home.centre.clone().lerp(wait, 0.5), p.home.centre.distanceTo(wait) / 2 + p.home.radius * 0.95 + 0.06, p.def.step.az, p.def.step.el);
      resetView();
    } else fx.puff(r.centre, 6, 0.12);
    idleFor = 0; near = 0;
    set({ phase: 'build', held: p.def.id, stage: 'present', boltsLeft: 0, note: '', noteKind: '' });
    audio.say(p.def.name);
  }
  /** Mechanic and Master: take a part from the tray (and, with a pointer, start dragging it straight away). */
  function pick(id: string, e?: PointerEvent) {
    if (view.phase !== 'build' || !puzzle() || flight || (view.stage !== 'pick' && view.stage !== 'present')) return;
    const i = pieces.findIndex(p => p.def.id === id); if (i < 0 || done.has(id)) return;
    audio.unlock();
    if (held === i && !e) {
      // a second tap on the same part puts it back on the bench, hands empty
      if (view.stage !== 'present') return;
      pieces[i].node.visible = false; held = -1; back = null;
      set({ stage: 'pick', held: '' }); audio.tap(); return;
    }
    if (held !== i) { if (held >= 0) pieces[held].node.visible = false; present(i); }
    if (e) {
      drag = { id: e.pointerId, kind: 'part', x: 0, y: 0, x0: 0, y0: 0, t0: performance.now(), moved: true, grab: new THREE.Vector3() };
      const p = pointer(e), pc = pieces[held]; drag.x = drag.x0 = p.x; drag.y = drag.y0 = p.y;
      plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(tmp), centreOf(pc)); back = null;
      if (rayAt(p.x, p.y).intersectPlane(plane, hit)) placeAt(pc, hit, pc.node.scale.x);   // straight under the finger
      hideHand();
    }
  }
  function fit() {
    if (view.phase !== 'build' || view.stage !== 'present' || flight || held < 0) return;
    const p = pieces[held];
    back = null; flight = { t: 0, from: centreOf(p), s0: p.node.scale.x, via: v3(p.def.step.entry) };
    set({ stage: 'fly' }); audio.whoosh(); hideHand();
  }
  /** Mechanic and Master: where was it dropped? On its own place with its mounts on: it goes on. Otherwise it comes back. */
  function judge() {
    const p = pieces[held], c = toScreen(centreOf(p, tmp));
    const within = (q: Rt) => { const s = toScreen(q.home.centre), r = pxRadius(q.home.centre, q.home.radius); return Math.hypot(c.x - s.x, c.y - s.y) <= Math.max(view.mode === 'master' ? 16 : 30, r * (view.mode === 'master' ? 0.32 : 0.6)); };
    if (within(p)) {
      const missing = p.def.needs.find(n => !done.has(n));
      if (!missing) { fit(); return; }
      const need = pieces.find(q => q.def.id === missing)!;
      return wrong(`Not yet! First the ${need.def.name.toLowerCase()}, then the ${p.def.name.toLowerCase()}.`);
    }
    const mid = new THREE.Vector3(0, 0.55, 0), b = toScreen(mid);
    if (Math.hypot(c.x - b.x, c.y - b.y) < pxRadius(mid, 0.85)) return wrong('Hmm. That’s not where it goes.');
    back = { t: 0, from: centreOf(p), s0: p.node.scale.x };
  }
  function wrong(text: string) {
    const p = pieces[held];
    back = { t: 0, from: centreOf(p), s0: p.node.scale.x };
    set({ note: text, noteKind: 'wrong', mistakes: view.mistakes + 1 }); noteAt = clock;
    audio.bonk(); shake = 0.004;
  }
  function landed() {
    const p = pieces[held];
    p.node.position.set(0, 0, 0); p.node.scale.setScalar(1); flight = null;
    clearGhost();
    audio.clunk(p.home.radius > 0.25);
    fx.puff(p.home.centre, 8, 0.35); shake = 0.012;
    if (p.bolts.length) { showBolts(p.bolts); set({ stage: 'bolts', boltsLeft: p.bolts.length }); } else finishStep();
  }
  function finishStep() {
    const p = pieces[held];
    done.add(p.def.id);
    garage.building = { mode: view.mode, placed: [...done], paint: view.paint, time: timer }; callbacks.save();
    audio.chime(Math.round((done.size - 1) * 13 / Math.max(1, pieces.length - 1))); fx.sparkle(p.home.centre, 16, p.home.radius * 0.8);
    set({ stage: 'done', placed: [...done], tray: view.tray.filter(id => id !== p.def.id), note: p.def.fact, noteKind: 'fact' }); doneAt = clock;
    setTimeout(() => { if (view.note === p.def.fact) audio.say(p.def.fact); }, 650);
  }
  function next() {
    held = -1;
    if (done.size >= pieces.length) { stopClock(); toPaint(); return; }
    if (puzzle()) { set({ stage: 'pick', held: '' }); return; }
    present(pieces.findIndex(p => !done.has(p.def.id)));
  }

  // Bolts: a button over each one; a tap spins a bolt head in.
  let boltButtons: { el: HTMLButtonElement; at: THREE.Vector3; done: boolean }[] = [];
  const spinning: { mesh: THREE.Mesh; t: number; axis: THREE.Vector3; at: THREE.Vector3 }[] = [];
  const boltGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.012, 6), boltMat = new THREE.MeshStandardMaterial({ color: '#dfe3e7', metalness: 1, roughness: 0.2 });
  function showBolts(points: THREE.Vector3[]) {
    clearBolts();
    boltButtons = points.map((at, n) => {
      const el = document.createElement('button');
      el.className = 'garage-bolt'; el.type = 'button'; el.setAttribute('aria-label', `Tighten bolt ${n + 1}`);
      el.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M21.6 4.2a7 7 0 0 0-8.3 9.5L4.6 22.4a2.6 2.6 0 0 0 3.7 3.7l8.7-8.7a7 7 0 0 0 9.5-8.3l-4 4-3.7-1-1-3.7z"/></svg>';
      el.addEventListener('pointerdown', e => { e.stopPropagation(); tighten(n); });
      overlay.append(el); return { el, at, done: false };
    });
  }
  function clearBolts() { for (const b of boltButtons) b.el.remove(); boltButtons = []; }
  function tighten(n: number) {
    const b = boltButtons[n]; if (!b || b.done) return;
    b.done = true; b.el.classList.add('done'); setTimeout(() => b.el.remove(), 450);
    const toCamera = camera.position.clone().sub(b.at).normalize();
    const mesh = new THREE.Mesh(boltGeo, boltMat); mesh.position.copy(b.at).addScaledVector(toCamera, 0.05);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toCamera); scene.add(mesh);
    spinning.push({ mesh, t: 0, axis: toCamera, at: b.at.clone() });
    audio.tighten(); fx.sparkle(b.at, 5, 0.04);
    const left = boltButtons.filter(x => !x.done).length;
    set({ boltsLeft: left });
    if (!left) setTimeout(() => { if (view.stage === 'bolts') { clearBolts(); finishStep(); } }, 420);
  }

  // A hand that shows how to drag the part on, after a few seconds without a try (Apprentice only).
  const hand = document.createElement('div'); hand.className = 'garage-hand'; hand.setAttribute('aria-hidden', 'true');
  hand.innerHTML = '<svg viewBox="0 0 32 32"><path d="M12 3.5a2.5 2.5 0 0 1 5 0V14l1-.2V10a2.4 2.4 0 0 1 4.8 0v4.5l.7-.1a2.3 2.3 0 0 1 4.5.6v6.5c0 5.5-3.9 9-9 9h-1.6c-3 0-5.4-1.3-7.2-3.8L4.4 19.4a2.4 2.4 0 0 1 3.9-2.8L12 21z"/></svg>';
  overlay.append(hand);
  function hideHand() { hand.classList.remove('show'); }

  // ---- input: one finger drags a part or turns the camera; two pinch to zoom and pan --------------------------------
  const ndc = new THREE.Vector2(), ray = new THREE.Raycaster(), plane = new THREE.Plane(), hit = new THREE.Vector3();
  const toScreen = (p: THREE.Vector3) => { const v = p.clone().project(camera); return { x: (v.x + 1) / 2 * width, y: (1 - v.y) / 2 * height, behind: v.z > 1 }; };
  const pxRadius = (centre: THREE.Vector3, r: number) => r / (camera.position.distanceTo(centre) * Math.tan(camera.fov * RAD / 2)) * height / 2;
  let drag: { id: number; kind: 'part' | 'orbit' | 'ghost'; x: number; y: number; x0: number; y0: number; t0: number; moved: boolean; grab: THREE.Vector3 } | null = null;
  const touches = new Map<number, { x: number; y: number }>();
  let pinch: { d: number; x: number; y: number } | null = null, lastTap = { t: 0, x: 0, y: 0 };
  function pointer(e: PointerEvent | WheelEvent) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function rayAt(x: number, y: number) { ndc.set(x / width * 2 - 1, -(y / height) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.ray; }
  const canLook = () => view.phase !== 'loading' && view.phase !== 'ride' && view.phase !== 'finish';
  function zoomBy(f: number, x: number, y: number) {
    const z = Math.min(ZOOM.max, Math.max(ZOOM.min, zoom * f)); if (z === zoom) return;
    // zoom towards the point under the fingers: it stays put on screen
    plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(tmp), cam.target);
    if (rayAt(x, y).intersectPlane(plane, hit)) { const shift = hit.sub(cam.target).multiplyScalar(1 - z / zoom); pan.add(shift); cam.target.add(shift); }
    cam.dist *= z / zoom; zoom = z; clampPan();
  }
  function panBy(dx: number, dy: number) {
    const wpp = 2 * cam.dist * Math.tan(camera.fov * RAD / 2) / height;
    const right = tmp.setFromMatrixColumn(camera.matrixWorld, 0), up = tmp2.setFromMatrixColumn(camera.matrixWorld, 1);
    const shift = right.multiplyScalar(-dx * wpp).addScaledVector(up, dy * wpp);
    pan.add(shift); cam.target.add(shift); clampPan();
  }
  function clampPan() { if (pan.length() > 1.1) pan.setLength(1.1); }
  function down(e: PointerEvent) {
    if (!canLook()) return;
    audio.unlock();
    const p = pointer(e); touches.set(e.pointerId, p);
    try { canvas.setPointerCapture(e.pointerId); } catch { /* already gone */ }
    if (touches.size === 2) {
      // a second finger: whatever the first was doing stops, and the pair pinches
      if (drag?.kind === 'part' && held >= 0) back = { t: 0, from: centreOf(pieces[held]), s0: pieces[held].node.scale.x };
      drag = null;
      const [a, b] = [...touches.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      return;
    }
    if (drag || touches.size > 2) return;
    let kind: 'part' | 'orbit' | 'ghost' = 'orbit';
    const grab = new THREE.Vector3();
    if (view.phase === 'build' && view.stage === 'present' && !flight && held >= 0) {
      const pc = pieces[held], c = centreOf(pc), s = toScreen(c), r = pxRadius(c, pc.home.radius * pc.node.scale.x);
      const g = toScreen(pc.home.centre), gr = pxRadius(pc.home.centre, pc.home.radius);
      if (Math.hypot(p.x - s.x, p.y - s.y) < r * 0.85 + 28) {
        kind = 'part'; back = null;
        plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), c);
        rayAt(p.x, p.y).intersectPlane(plane, hit); grab.copy(hit).sub(c);
      } else if (!puzzle() && Math.hypot(p.x - g.x, p.y - g.y) < gr * 0.7 + 20) kind = 'ghost';
    }
    drag = { id: e.pointerId, kind, x: p.x, y: p.y, x0: p.x, y0: p.y, t0: performance.now(), moved: false, grab };
    idleFor = 0; hideHand();
  }
  function move(e: PointerEvent) {
    const t = touches.get(e.pointerId); if (t) Object.assign(t, pointer(e));
    if (pinch) {
      if (touches.size < 2) return;
      const [a, b] = [...touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y), x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      panBy(x - pinch.x, y - pinch.y); zoomBy(pinch.d / Math.max(1, d), x, y);
      pinch = { d, x, y }; return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    const p = pointer(e), dx = p.x - drag.x, dy = p.y - drag.y; drag.x = p.x; drag.y = p.y;
    if (Math.hypot(p.x - drag.x0, p.y - drag.y0) > 8) drag.moved = true;
    if (drag.kind === 'part' && held >= 0) {
      if (rayAt(p.x, p.y).intersectPlane(plane, hit)) {
        // picked up, a part grows back to its real size, so it can be matched against the gap it fills
        const pc = pieces[held], s = pc.node.scale.x + (1 - pc.node.scale.x) * 0.25;
        placeAt(pc, hit.sub(drag.grab), s);
      }
    } else if (drag.moved && canLook()) {
      userAz -= dx * 0.35; userEl += dy * 0.2;
      if (view.phase === 'build' && !puzzle()) userAz = Math.max(-80, Math.min(80, userAz));
      userEl = Math.max(-15, Math.min(50, userEl));
    }
  }
  function up(e: PointerEvent) {
    touches.delete(e.pointerId);
    if (pinch) { if (touches.size < 2) pinch = null; return; }
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    const tap = !d.moved && performance.now() - d.t0 < 450;
    if (view.phase === 'build' && view.stage === 'present' && held >= 0 && (d.kind === 'part' || d.kind === 'ghost')) {
      if (!puzzle()) {
        if (tap || near > 0.6) fit();
        else if (d.kind === 'part') back = { t: 0, from: centreOf(pieces[held]), s0: 1 };
      } else if (!tap && e.type !== 'pointercancel') judge();
      else back = { t: 0, from: centreOf(pieces[held]), s0: pieces[held].node.scale.x };
      return;
    }
    if (tap && d.kind === 'orbit') {
      if (life && rayAt(d.x, d.y) && ray.intersectObject(life.radio, true).length) { toggleRadio(); return; }
      // a double tap on nothing puts the camera back
      const now = performance.now();
      if (now - lastTap.t < 320 && Math.hypot(d.x - lastTap.x, d.y - lastTap.y) < 40) { resetView(); lastTap.t = 0; } else lastTap = { t: now, x: d.x, y: d.y };
    }
  }
  function wheel(e: WheelEvent) { if (!canLook()) return; e.preventDefault(); const p = pointer(e); zoomBy(Math.exp(e.deltaY * 0.0015), p.x, p.y); }
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('wheel', wheel, { passive: false });
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);

  function toggleRadio() {
    garage.radio = !garage.radio; callbacks.save();
    audio.click(); audio.radio(garage.radio); set({ radio: garage.radio });
  }

  // ---- paint, start, ride -------------------------------------------------------------------------------------------
  let paintFrom = new THREE.Color(), paintTo = new THREE.Color(), paintT = 1;
  function paint(id: PaintId) {
    if (!paintMat) return;
    paintFrom.copy(paintMat.color); paintTo.set(paintColor(id)); paintT = 0;
    set({ paint: id }); audio.spray(0.8);
    if (garage.building) { garage.building.paint = id; callbacks.save(); }
    const tank = pieces.find(p => p.def.members.includes('tank'))!;
    fx.mist(tank.home.centre, paintColor(id), camera.position);
  }
  /** The build's done: its time is kept with the bike, and becomes the mode's best if it beat it. */
  function stopClock() {
    if (!puzzle() || !garage.building) return;
    const t = Math.max(1, Math.round(timer)), best = garage.best[view.mode], newBest = !best || t < best;
    if (newBest) garage.best[view.mode] = t;
    garage.building.time = t; callbacks.save();
    set({ time: t, newBest });
  }
  let standDrop = 0, standGoing = false;
  function toPaint() { set({ phase: 'paint', held: '', note: '', noteKind: '' }); frame(new THREE.Vector3(0.05, 0.8, 0), 0.62, 24, 22); resetView(); }
  function toStart() {
    set({ phase: 'start', engine: 'off', revved: false }); standGoing = true; resetView();
    frame(new THREE.Vector3(-0.1, 0.5, 0), 1.08, 38, 10);
  }
  let rpm = 0, throttle = 0, throttleHeld = false, crankT = 0, shake = 0, lastPop = 0;
  function crank() {
    if (view.engine !== 'off' || view.phase !== 'start') return;
    crankT = 0; set({ engine: 'cranking' }); audio.startCranking();
  }
  function throttleOn(on: boolean) { throttleHeld = on; if (on) audio.unlock(); }
  let ride: Ride | null = null;
  async function startRide() {
    if (view.phase !== 'start' || view.engine !== 'running') return;
    set({ phase: 'ride', stars: 0, progress: 0, speed: 0 });
    audio.door();
    room.group.visible = false; stand.group.visible = false;
    ride = await createRide({ scene, renderer, camera, bike, pivots, audio, key, hemi, helmet: paintColor(view.paint), onStar: (n, total) => set({ stars: n, starTotal: total }),
      onFinish: stars => finishRide(stars) });
    set({ starTotal: ride.total });
  }
  function finishRide(stars: number) {
    garage.bikes.push({ paint: view.paint, stars, built: Date.now(), mode: view.mode, ...(puzzle() ? { time: view.time } : {}) }); garage.building = null; callbacks.save();
    room.setPhotos(garage.bikes);
    set({ phase: 'finish', stars });
    audio.fanfare();
  }
  /** Back from the ride: the bike is parked on the mat in the garage, ready to ride again or to make way for a new one. */
  function park() {
    ride?.dispose(); ride = null;
    bike.position.set(0, 0, 0); bike.rotation.set(0, 0, 0);
    room.group.visible = true; stand.group.visible = false;
    scene.background = new THREE.Color('#d9d2c3'); scene.fog = null; hemi.intensity = 1.1; key.intensity = 2.4;
    hemi.color.set('#fff6e8'); hemi.groundColor.set('#7d7468');
    Object.assign(key.shadow.camera, { left: -1.7, right: 1.7, top: 1.7, bottom: -1.7, near: 0.5, far: 9 }); key.shadow.camera.updateProjectionMatrix();
    key.position.set(1.6, 4.2, 2.4); key.target.position.set(0, 0, 0);
    audio.stopEngine(); rpm = 0; throttleHeld = false;
    set({ phase: 'garage', engine: 'off', revved: false });
    wholeBike(); resetView();
  }
  /** From the garage: carry on building, ride the finished bike again, or clear the stand for a new one in a mode. */
  function begin(kind: 'build' | 'ride' | 'new', mode: ModeId = garage.mode) {
    if (view.phase !== 'garage') return;
    audio.unlock();
    if (kind === 'ride') { stand.group.visible = false; toStart(); return; }
    if (kind === 'new') {
      // the old bike comes apart, last part first, back to the bare frame on its stand
      garage.mode = mode; garage.building = { mode, placed: [], paint: view.paint, time: 0 }; callbacks.save();
      strip = { t: 0, from: pieces.filter(p => p.node.visible), mode }; stand.group.visible = true; standDrop = 0; stand.posts.position.y = 0;
      set({ phase: 'build', stage: 'done', held: '', note: '', noteKind: '' });
      wholeBike(); resetView();
      return;
    }
    stand.group.visible = true;
    if (done.size >= pieces.length) { toPaint(); return; }
    wholeBike(); resetView();
    set({ phase: 'build' }); next();
  }
  let strip: { t: number; from: Rt[]; mode: ModeId } | null = null;

  // ---- frame loop ---------------------------------------------------------------------------------------------------
  let clock = 0, last = performance.now(), raf = 0, paused = false, disposed = false;
  function tick(now: number) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (paused || disposed) return;
    clock += dt;
    if (view.phase !== 'loading') update(dt);
    fx.update(dt, camera);
    renderer.render(scene, camera);
    if (changed) { changed = false; callbacks.change({ ...view }); }
  }
  function update(dt: number) {
    const phase = view.phase;
    if (phase === 'garage' && !posed) { goal.az = 25 + Math.sin(clock * 0.18) * 16; }
    if (phase === 'build') updateBuild(dt);
    if (phase === 'build' && puzzle() && !strip && done.size < pieces.length) {
      timer += dt;   // ponytail: frame time, capped at 50 ms a frame, so it runs a touch slow below 20 fps
      if (Math.floor(timer) !== view.time) set({ time: Math.floor(timer) });
    }
    if (paintMat && paintT < 1) { paintT = Math.min(1, paintT + dt / 0.8); paintMat.color.copy(paintFrom).lerp(paintTo, ease(paintT)); }
    if (standGoing) {
      standDrop = Math.min(1, standDrop + dt / 0.8); stand.posts.position.y = -0.14 * ease(standDrop);
      if (standDrop >= 1) { standGoing = false; stand.group.visible = false; }
    }
    if (phase === 'start' || phase === 'ride' || phase === 'finish') updateEngine(dt);
    if (ride) {
      const r = ride.update(dt, phase === 'ride' && throttleHeld);
      if (phase === 'ride') { view.progress = r.progress; view.speed = r.speed; if (clock % 0.2 < dt) changed = true; }
      if (r.puff) for (const p of mufflerTips()) fx.smoke(p.at, p.dir, 1);
    } else placeCamera(dt);
    // the radio plays in the garage, dips under the engine, and stays behind when you ride out
    audio.radioDuck(ride ? 0 : view.engine === 'running' ? 0.3 : 1);
    if (life && !ride) life.update(dt, garage.radio && !sound.muted);
    if (view.noteKind === 'wrong' && clock - noteAt > 3.2) set({ note: '', noteKind: '' });
    for (let i = spinning.length - 1; i >= 0; i--) {
      const s = spinning[i]; s.t += dt / 0.4;
      s.mesh.position.copy(s.at).addScaledVector(s.axis, 0.05 * (1 - ease(Math.min(1, s.t))));
      s.mesh.rotateY(dt * 40 * (1 - Math.min(1, s.t)));
      if (s.t > 2.2) { s.mesh.removeFromParent(); spinning.splice(i, 1); }
    }
    // a knock rattles the whole bike for a moment; a running engine keeps it trembling
    if (ride === null) {
      shake = Math.max(0, shake - dt * 0.05);
      const tremble = view.engine === 'running' ? 0.0005 + throttle * 0.0012 : 0;
      const a = shake + tremble;
      bike.position.set((Math.random() - 0.5) * a * 0.6, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a * 0.6);
      shake *= 1 - Math.min(1, dt * 9);
    }
    // bolt buttons follow the bike on screen
    for (const b of boltButtons) { const s = toScreen(b.at); b.el.style.translate = `${s.x}px ${s.y}px`; }
  }
  function updateBuild(dt: number) {
    if (strip) {
      // taking the last bike apart: parts fly off in reverse order, then the build starts again from the frame
      strip.t += dt;
      const each = Math.min(0.12, 1.6 / Math.max(1, strip.from.length)), list = strip.from;
      list.forEach((p, i) => {
        const order = list.length - 1 - i, t = Math.min(1, Math.max(0, (strip!.t - order * each) / 0.35));
        p.node.position.copy(v3(p.def.step.wait)).multiplyScalar(2.2 * easeIn(t)); p.node.visible = t < 1;
      });
      if (strip.t > list.length * each + 0.5) {
        const mode = strip.mode; strip = null;
        if (paintMat) paintMat.color.set(paintColor(view.paint));
        setup(mode, []); set({ phase: 'build' }); next();
      }
      return;
    }
    const p = held >= 0 ? pieces[held] : null;
    if (view.stage === 'present' && p) {
      idleFor += dt; bob += dt;
      const dragging = drag?.kind === 'part';
      if (!dragging && !back && !flight) { const r = rest(p, tmp); r.centre.y += Math.sin(bob * 2.2) * 0.012 * r.scale; placeAt(p, r.centre, r.scale); }
      if (back) {
        back.t = Math.min(1, back.t + dt / 0.3);
        const r = rest(p, tmp); placeAt(p, r.centre.lerp(back.from, 1 - ease(back.t)), back.s0 + (r.scale - back.s0) * ease(back.t));
        if (back.t >= 1) back = null;
      }
      if (!puzzle()) {
        // how close the part is to its place, on screen: the ghost glows brighter as it nears
        const a = toScreen(centreOf(p, tmp)), b = toScreen(p.home.centre), r = pxRadius(p.home.centre, p.home.radius);
        near = dragging ? Math.max(0, 1 - Math.hypot(a.x - b.x, a.y - b.y) / (r * 0.9 + 50)) : 0;
        if (ghostMat) ghostMat.opacity = 0.18 + 0.12 * (0.5 + 0.5 * Math.sin(clock * 4)) + near * 0.4;
        if (idleFor > 3.2 && !dragging) {
          hand.classList.add('show');
          const k = (idleFor % 2.2) / 2.2, t = ease(Math.min(1, k / 0.75));
          hand.style.translate = `${a.x + (b.x - a.x) * t}px ${a.y + (b.y - a.y) * t}px`;
          hand.style.opacity = String(k > 0.85 ? (1 - k) / 0.15 : 1);
        }
      }
    }
    if (flight && p) {
      flight.t = Math.min(1, flight.t + dt / 0.6);
      const t = flight.t, via = tmp2.copy(p.home.centre).add(flight.via);
      if (t < 0.6) { const u = ease(t / 0.6); placeAt(p, tmp.lerpVectors(flight.from, via, u).setY(tmp.y + Math.sin(u * Math.PI) * 0.06), flight.s0 + (1 - flight.s0) * u); }
      else placeAt(p, tmp.copy(p.home.centre).addScaledVector(flight.via, 1 - easeIn((t - 0.6) / 0.4)), 1);
      if (t >= 1) landed();
    }
    if (view.stage === 'done' && clock - doneAt > (puzzle() ? 1.0 : 1.8)) next();
  }
  function updateEngine(dt: number) {
    if (view.engine === 'cranking') {
      crankT += dt; rpm = 260 + Math.sin(crankT * 40) * 60;
      shake = Math.max(shake, 0.002);
      if (crankT > 1.15) {
        audio.fire(); set({ engine: 'running' }); rpm = 2300; shake = 0.01;
        for (const p of mufflerTips()) fx.smoke(p.at, p.dir, 6);
      }
    } else if (view.engine === 'running') {
      const want = view.phase === 'ride' ? -1 : throttleHeld ? 1 : 0;
      if (want >= 0) {
        throttle += ((want ? 1 : 0) - throttle) * Math.min(1, dt * (want ? 10 : 6));
        const target = IDLE_RPM + throttle * (REDLINE - IDLE_RPM);
        const before = rpm;
        rpm += (target - rpm) * Math.min(1, dt * (target > rpm ? 3.2 : 2.2));
        if (before > 6500 && !throttleHeld && clock - lastPop > 0.25 && Math.random() < 0.3) {
          lastPop = clock; audio.pop();
          for (const p of mufflerTips()) fx.flame(p.at, p.dir);
        }
        if (throttleHeld && !view.revved && rpm > 5000) set({ revved: true });
        audio.run(rpm, throttle);
        if (Math.random() < dt * (1 + throttle * 6)) for (const p of mufflerTips()) fx.smoke(p.at, p.dir, 1);
      }
    }
    if (view.phase !== 'ride') {
      const tach = pivots.needle_tachometer;
      if (tach) tach.node.quaternion.copy(tach.base).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -TACH_SWEEP(rpm)));
    }
  }
  /** Where the two mufflers end, and the way their gas leaves them, on the bike as it stands now. */
  function mufflerTips() {
    return [1, -1].map(s => ({ at: bike.localToWorld(new THREE.Vector3(-0.881, 0.415, s * 0.226)), dir: new THREE.Vector3(-0.95, 0.31, 0).transformDirection(bike.matrixWorld) }));
  }
  raf = requestAnimationFrame(tick);

  return {
    ready, begin, fit, pick, paint, crank, park, toggleRadio,
    toStart() { if (view.phase === 'paint') toStart(); },
    ride: startRide,
    throttle: throttleOn,
    setPaused(p: boolean) { paused = p; if (p) { audio.stopCranking(); throttleHeld = false; } last = performance.now(); },
    refreshAudio() { audio.refreshMute(); },
    /** Frames the whole bike from a fixed angle (the arcade card is shot this way). */
    look(az: number, el: number, radius: number) { posed = true; frame(new THREE.Vector3(0, 0.55, 0), radius, az, el); resetView(); placeCamera(0, true); },
    /** Testing only: run the clock forward without waiting for frames (a hidden browser tab gets none). */
    advance(seconds: number) { for (let t = 0; t < seconds; t += 1 / 60) { clock += 1 / 60; update(1 / 60); fx.update(1 / 60, camera); } renderer.render(scene, camera); if (changed) { changed = false; callbacks.change({ ...view }); } },
    /** Testing only: where a piece's place is on screen, and whether it is on. */
    probe(id: string) { const p = pieces.find(q => q.def.id === id); if (!p) return null; const s = toScreen(p.home.centre), now = toScreen(centreOf(p)); return { x: s.x, y: s.y, r: pxRadius(p.home.centre, p.home.radius), on: done.has(id), now, shown: p.node.visible, scale: p.node.scale.x, zoom }; },
    destroy() {
      disposed = true; cancelAnimationFrame(raf); observer.disconnect(); clearBolts(); hand.remove();
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('wheel', wheel);
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      ride?.dispose(); life?.dispose(); room.dispose(); fx.dispose(); envTex.dispose(); pmrem.dispose(); boltGeo.dispose(); boltMat.dispose();
      scene.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of [o.material].flat()) m.dispose(); } });
      renderer.dispose(); canvas.remove();
    }
  };
}
export type GarageScene = ReturnType<typeof createGarageScene>;

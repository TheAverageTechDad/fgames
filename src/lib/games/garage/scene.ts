import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { IDLE_RPM, REDLINE, STEPS, TACH_SWEEP, paintColor, type PaintId } from './steps';
import { buildRoom, buildStand } from './room';
import { createEffects } from './effects';
import { createRide, type Ride } from './ride';
import type { GarageAudio } from './audio';
import type { Garage } from './storage';

export type Phase = 'loading' | 'garage' | 'build' | 'paint' | 'start' | 'ride' | 'finish';
export type Stage = 'present' | 'fly' | 'bolts' | 'done';
export type GarageView = {
  phase: Phase; step: number; stage: Stage; boltsLeft: number; paint: PaintId;
  engine: 'off' | 'cranking' | 'running'; revved: boolean;
  stars: number; starTotal: number; progress: number; speed: number;
};
type Callbacks = { change: (view: GarageView) => void; save: () => void };

const ease = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
const easeIn = (t: number) => t * t * t;
const v3 = (a: readonly number[]) => new THREE.Vector3(a[0], a[1], a[2]);
const RAD = Math.PI / 180;

export function createGarageScene(host: HTMLElement, overlay: HTMLElement, garage: Garage, audio: GarageAudio, callbacks: Callbacks) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  const canvas = renderer.domElement; canvas.dataset.garageCanvas = '';
  canvas.setAttribute('aria-label', 'The garage. Drag the bike to turn it round.'); host.append(canvas);

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

  let width = 1, height = 1;
  const resize = () => {
    const r = host.getBoundingClientRect(); if (!r.width || !r.height) return;
    width = r.width; height = r.height; renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize); observer.observe(host); resize();

  // ---- state ------------------------------------------------------------------------------------------------------
  const view: GarageView = { phase: 'loading', step: 0, stage: 'present', boltsLeft: 0, paint: garage.building?.paint ?? garage.bikes.at(-1)?.paint ?? 'red',
    engine: 'off', revved: false, stars: 0, starTotal: 0, progress: 0, speed: 0 };
  let changed = true;
  const set = (patch: Partial<GarageView>) => { Object.assign(view, patch); changed = true; };

  let bike: THREE.Object3D = new THREE.Group();
  const steps: THREE.Object3D[] = [], homes: { centre: THREE.Vector3; radius: number }[] = [];
  let frameStep: THREE.Object3D | null = null, paintMat: THREE.MeshStandardMaterial | null = null;
  const pivots: Record<string, { node: THREE.Object3D; base: THREE.Quaternion }> = {};
  const bolts: Record<string, THREE.Vector3[]> = {};
  let placed = 0;

  // ---- camera -----------------------------------------------------------------------------------------------------
  const goal = { target: new THREE.Vector3(0, 0.55, 0), az: 25, el: 12, radius: 1.3 };
  const cam = { target: goal.target.clone(), az: 25, el: 12, dist: 5 };
  let userAz = 0, userEl = 0, cameraFree = true, posed = false;
  const frame = (target: THREE.Vector3, radius: number, az: number, el: number) => { goal.target.copy(target); goal.radius = radius; goal.az = az; goal.el = el; };
  const wholeBike = (az = 25, el = 12) => frame(new THREE.Vector3(0, 0.52, 0), 1.18, az, el);
  function placeCamera(dt: number, snap = false) {
    // Fit the framing sphere in the screen's narrower direction, leaving room for the bars along the top and bottom.
    const vHalf = camera.fov * RAD / 2, hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const fit = Math.min(Math.atan(Math.tan(vHalf) * 0.72), hHalf * 0.94);
    const dist = goal.radius / Math.sin(fit);
    const k = snap ? 1 : 1 - Math.exp(-dt * 3.2);
    cam.target.lerp(goal.target, k); cam.dist += (dist - cam.dist) * k;
    cam.az += (goal.az + userAz - cam.az) * k; cam.el += (Math.max(-5, Math.min(60, goal.el + userEl)) - cam.el) * k;
    const az = cam.az * RAD, el = cam.el * RAD;
    camera.position.set(cam.target.x + cam.dist * Math.sin(az) * Math.cos(el), cam.target.y + cam.dist * Math.sin(el), cam.target.z + cam.dist * Math.cos(az) * Math.cos(el));
    // the bottom bar is the taller one, so the bike sits a touch above the middle
    camera.lookAt(cam.target.x, cam.target.y - goal.radius * 0.1, cam.target.z);
  }

  // ---- loading ------------------------------------------------------------------------------------------------------
  const draco = new DRACOLoader().setDecoderPath('/garage/draco/');
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const ready = loader.loadAsync('/garage/roadster.glb').then(gltf => {
    bike = gltf.scene.getObjectByName('step_frame')?.parent ?? gltf.scene;
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
      if (b) (bolts[b[1]] ??= [])[Number(b[2])] = o.getWorldPosition(new THREE.Vector3());
    });
    frameStep = bike.getObjectByName('step_frame') ?? null;
    for (const s of STEPS) {
      const node = bike.getObjectByName(`step_${s.id}`);
      if (!node) throw new Error(`roadster.glb has no step_${s.id}`);
      steps.push(node);
      const box = new THREE.Box3().setFromObject(node), sphere = box.getBoundingSphere(new THREE.Sphere());
      homes.push({ centre: sphere.center.clone(), radius: sphere.radius });
    }
    if (paintMat) paintMat.color.set(paintColor(view.paint));
    placed = garage.building ? garage.building.steps : garage.bikes.length ? STEPS.length : 0;
    steps.forEach((node, i) => { node.visible = i < placed; });
    stand.group.visible = placed < STEPS.length || !!garage.building;
    room.setPhotos(garage.bikes);
    wholeBike(); placeCamera(0, true);
    set({ phase: 'garage', step: placed });
  });
  ready.finally(() => draco.dispose());

  // ---- build ------------------------------------------------------------------------------------------------------
  let ghost: THREE.Object3D | null = null, ghostMat: THREE.MeshBasicMaterial | null = null, near = 0;
  let flight: { t: number; from: THREE.Vector3; via: THREE.Vector3 } | null = null;
  let back: { t: number; from: THREE.Vector3 } | null = null;
  let bob = 0, idleFor = 0, doneAt = 0;
  const waitPos = (i: number) => v3(STEPS[i].wait);

  function makeGhost(node: THREE.Object3D) {
    ghostMat = new THREE.MeshBasicMaterial({ color: '#8fe3ff', transparent: true, opacity: 0.3, depthWrite: false });
    const g = node.clone(true); g.position.set(0, 0, 0);
    g.traverse(o => { if (o instanceof THREE.Mesh) { o.material = ghostMat!; o.castShadow = false; o.receiveShadow = false; o.renderOrder = 2; } });
    g.visible = true; node.parent!.add(g); return g;
  }
  function present(i: number) {
    const s = STEPS[i], node = steps[i], home = homes[i];
    node.visible = true; node.position.copy(waitPos(i));
    ghost = makeGhost(node);
    const wait = home.centre.clone().add(waitPos(i));
    frame(home.centre.clone().lerp(wait, 0.5), home.centre.distanceTo(wait) / 2 + home.radius * 0.95 + 0.06, s.az, s.el);
    userAz = 0; userEl = 0; idleFor = 0; near = 0;
    set({ phase: 'build', step: i, stage: 'present', boltsLeft: 0 });
    audio.say(s.name);
  }
  function fit() {
    if (view.phase !== 'build' || view.stage !== 'present' || flight) return;
    const node = steps[view.step];
    back = null; flight = { t: 0, from: node.position.clone(), via: v3(STEPS[view.step].entry) };
    set({ stage: 'fly' }); audio.whoosh(); hideHand();
  }
  function landed() {
    const i = view.step, node = steps[i], home = homes[i];
    node.position.set(0, 0, 0); flight = null;
    if (ghost) { ghost.removeFromParent(); ghost = null; ghostMat?.dispose(); ghostMat = null; }
    audio.clunk(home.radius > 0.25);
    fx.puff(home.centre, 8, 0.35); shake = 0.012;
    const points = bolts[STEPS[i].id] ?? [];
    if (points.length) { showBolts(points); set({ stage: 'bolts', boltsLeft: points.length }); } else finishStep();
  }
  function finishStep() {
    const i = view.step;
    placed = i + 1;
    garage.building = { steps: placed, paint: view.paint }; callbacks.save();
    audio.chime(i); fx.sparkle(homes[i].centre, 16, homes[i].radius * 0.8);
    set({ stage: 'done' }); doneAt = clock;
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

  // A hand that shows how to drag the part on, after a few seconds without a try.
  const hand = document.createElement('div'); hand.className = 'garage-hand'; hand.setAttribute('aria-hidden', 'true');
  hand.innerHTML = '<svg viewBox="0 0 32 32"><path d="M12 3.5a2.5 2.5 0 0 1 5 0V14l1-.2V10a2.4 2.4 0 0 1 4.8 0v4.5l.7-.1a2.3 2.3 0 0 1 4.5.6v6.5c0 5.5-3.9 9-9 9h-1.6c-3 0-5.4-1.3-7.2-3.8L4.4 19.4a2.4 2.4 0 0 1 3.9-2.8L12 21z"/></svg>';
  overlay.append(hand);
  function hideHand() { hand.classList.remove('show'); }

  // ---- input ------------------------------------------------------------------------------------------------------
  const ndc = new THREE.Vector2(), ray = new THREE.Raycaster(), plane = new THREE.Plane(), hit = new THREE.Vector3();
  const toScreen = (p: THREE.Vector3) => { const v = p.clone().project(camera); return { x: (v.x + 1) / 2 * width, y: (1 - v.y) / 2 * height, behind: v.z > 1 }; };
  const pxRadius = (centre: THREE.Vector3, r: number) => r / (camera.position.distanceTo(centre) * Math.tan(camera.fov * RAD / 2)) * height / 2;
  let drag: { id: number; kind: 'part' | 'orbit' | 'ghost'; x: number; y: number; x0: number; y0: number; t0: number; moved: boolean; grab: THREE.Vector3 } | null = null;
  function pointer(e: PointerEvent) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function rayAt(x: number, y: number) { ndc.set(x / width * 2 - 1, -(y / height) * 2 + 1); ray.setFromCamera(ndc, camera); return ray.ray; }
  function partCentre() { const i = view.step; return homes[i].centre.clone().add(steps[i].position); }
  function down(e: PointerEvent) {
    if (drag || view.phase === 'loading') return;
    audio.unlock();
    const p = pointer(e); let kind: 'part' | 'orbit' | 'ghost' = 'orbit';
    const grab = new THREE.Vector3();
    if (view.phase === 'build' && view.stage === 'present' && !flight) {
      const c = partCentre(), s = toScreen(c), r = pxRadius(c, homes[view.step].radius);
      const g = toScreen(homes[view.step].centre), gr = pxRadius(homes[view.step].centre, homes[view.step].radius);
      if (Math.hypot(p.x - s.x, p.y - s.y) < r * 0.85 + 28) {
        kind = 'part'; back = null;
        plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), c);
        rayAt(p.x, p.y).intersectPlane(plane, hit); grab.copy(hit).sub(steps[view.step].position);
      } else if (Math.hypot(p.x - g.x, p.y - g.y) < gr * 0.7 + 20) kind = 'ghost';
    }
    drag = { id: e.pointerId, kind, x: p.x, y: p.y, x0: p.x, y0: p.y, t0: performance.now(), moved: false, grab };
    canvas.setPointerCapture(e.pointerId); idleFor = 0; hideHand();
  }
  function move(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    const p = pointer(e), dx = p.x - drag.x, dy = p.y - drag.y; drag.x = p.x; drag.y = p.y;
    if (Math.hypot(p.x - drag.x0, p.y - drag.y0) > 8) drag.moved = true;
    if (drag.kind === 'part') {
      if (rayAt(p.x, p.y).intersectPlane(plane, hit)) steps[view.step].position.copy(hit).sub(drag.grab);
    } else if (drag.moved && view.phase !== 'ride') {
      userAz -= dx * 0.35; userEl += dy * 0.2; cameraFree = true;
      if (view.phase === 'build') userAz = Math.max(-80, Math.min(80, userAz));
      userEl = Math.max(-15, Math.min(35, userEl));
    }
  }
  function up(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    const tap = !d.moved && performance.now() - d.t0 < 450;
    if (view.phase === 'build' && view.stage === 'present') {
      if (d.kind === 'part' || d.kind === 'ghost') {
        if (tap || near > 0.6) fit();
        else if (d.kind === 'part') back = { t: 0, from: steps[view.step].position.clone() };
      }
    }
  }
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

  // ---- paint, start, ride -------------------------------------------------------------------------------------------
  let paintFrom = new THREE.Color(), paintTo = new THREE.Color(), paintT = 1;
  function paint(id: PaintId) {
    if (!paintMat) return;
    paintFrom.copy(paintMat.color); paintTo.set(paintColor(id)); paintT = 0;
    set({ paint: id }); audio.spray(0.8);
    if (garage.building) { garage.building.paint = id; callbacks.save(); }
    const tank = homes[STEPS.findIndex(s => s.id === 'tank')];
    fx.mist(tank.centre, paintColor(id), camera.position);
  }
  let standDrop = 0, standGoing = false;
  function toPaint() { set({ phase: 'paint' }); frame(new THREE.Vector3(0.05, 0.8, 0), 0.62, 24, 22); userAz = 0; userEl = 0; }
  function toStart() {
    set({ phase: 'start', engine: 'off', revved: false }); standGoing = true; userAz = 0; userEl = 0;
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
    room.group.visible = false; stand.group.visible = false; frameVisible(true);
    ride = await createRide({ scene, renderer, camera, bike, pivots, audio, key, hemi, helmet: paintColor(view.paint), onStar: (n, total) => set({ stars: n, starTotal: total }),
      onFinish: stars => finishRide(stars) });
    set({ starTotal: ride.total });
  }
  function frameVisible(v: boolean) { steps.forEach(s => { s.visible = v; }); if (frameStep) frameStep.visible = true; }
  function finishRide(stars: number) {
    garage.bikes.push({ paint: view.paint, stars, built: Date.now() }); garage.building = null; callbacks.save();
    room.setPhotos(garage.bikes);
    set({ phase: 'finish', stars });
    audio.fanfare();
  }
  /** Back from the ride: the bike is parked on the mat in the garage, ready to ride again or to make way for a new one. */
  function park() {
    ride?.dispose(); ride = null;
    bike.position.set(0, 0, 0); bike.rotation.set(0, 0, 0);
    room.group.visible = true; stand.group.visible = false; placed = STEPS.length;
    scene.background = new THREE.Color('#d9d2c3'); scene.fog = null; hemi.intensity = 1.1; key.intensity = 2.4;
    Object.assign(key.shadow.camera, { left: -1.7, right: 1.7, top: 1.7, bottom: -1.7 }); key.shadow.camera.updateProjectionMatrix();
    key.position.set(1.6, 4.2, 2.4); key.target.position.set(0, 0, 0);
    audio.stopEngine(); rpm = 0; throttleHeld = false;
    set({ phase: 'garage', engine: 'off', revved: false, step: STEPS.length });
    wholeBike(); userAz = 0; userEl = 0;
  }
  /** From the garage: carry on building, ride the finished bike again, or clear the stand for a new one. */
  function begin(kind: 'build' | 'ride' | 'new') {
    if (view.phase !== 'garage') return;
    audio.unlock();
    if (kind === 'ride') { stand.group.visible = false; toStart(); return; }
    if (kind === 'new') {
      // the old bike comes apart, last part first, back onto the frame on its stand
      garage.building = { steps: 0, paint: view.paint }; callbacks.save();
      strip = { t: 0, from: placed }; stand.group.visible = true; standDrop = 0; stand.posts.position.y = 0;
      set({ phase: 'build', step: 0, stage: 'done' });
      return;
    }
    if (placed >= STEPS.length) { stand.group.visible = true; toPaint(); return; }
    present(placed);
  }
  let strip: { t: number; from: number } | null = null;

  // ---- frame loop ---------------------------------------------------------------------------------------------------
  let clock = 0, last = performance.now(), raf = 0, paused = false, disposed = false;
  const tmp = new THREE.Vector3();
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
    if (phase === 'garage' && !posed) { goal.az = 25 + Math.sin(clock * 0.18) * 16; userAz *= 1 - Math.min(1, dt * 0.3); }
    if (phase === 'build') updateBuild(dt);
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
    // bolt buttons and the hand follow the bike on screen
    for (const b of boltButtons) { const s = toScreen(b.at); b.el.style.translate = `${s.x}px ${s.y}px`; }
  }
  function updateBuild(dt: number) {
    if (strip) {
      // taking the last bike apart: parts fly off in reverse order, then the build starts again from the frame
      strip.t += dt;
      const each = 0.12, gone = Math.floor(strip.t / each);
      for (let i = 0; i < strip.from; i++) {
        const order = strip.from - 1 - i, t = Math.min(1, Math.max(0, (strip.t - order * each) / 0.35));
        steps[i].position.copy(v3(STEPS[i].wait)).multiplyScalar(2.2 * easeIn(t)); steps[i].visible = t < 1;
      }
      if (gone > strip.from + 3) {
        strip = null; placed = 0;
        steps.forEach(s => { s.visible = false; s.position.set(0, 0, 0); });
        if (paintMat) paintMat.color.set(paintColor(view.paint));
        present(0);
      }
      wholeBike(); return;
    }
    const i = view.step, node = steps[i];
    if (view.stage === 'present' && node) {
      idleFor += dt; bob += dt;
      const dragging = drag?.kind === 'part';
      if (!dragging && !back && !flight) node.position.copy(waitPos(i)).add(tmp.set(0, Math.sin(bob * 2.2) * 0.012, 0));
      if (back) { back.t = Math.min(1, back.t + dt / 0.3); node.position.lerpVectors(back.from, waitPos(i), ease(back.t)); if (back.t >= 1) back = null; }
      // how close the part is to its place, on screen: the ghost glows brighter as it nears
      const a = toScreen(partCentre()), b = toScreen(homes[i].centre), r = pxRadius(homes[i].centre, homes[i].radius);
      near = dragging ? Math.max(0, 1 - Math.hypot(a.x - b.x, a.y - b.y) / (r * 0.9 + 50)) : 0;
      if (ghostMat) ghostMat.opacity = 0.18 + 0.12 * (0.5 + 0.5 * Math.sin(clock * 4)) + near * 0.4;
      if (idleFor > 3.2 && !dragging) {
        hand.classList.add('show');
        const k = (idleFor % 2.2) / 2.2, t = ease(Math.min(1, k / 0.75));
        hand.style.translate = `${a.x + (b.x - a.x) * t}px ${a.y + (b.y - a.y) * t}px`;
        hand.style.opacity = String(k > 0.85 ? (1 - k) / 0.15 : 1);
      }
    }
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / 0.6);
      const t = flight.t, via = flight.via;
      if (t < 0.6) { const u = ease(t / 0.6); node.position.lerpVectors(flight.from, via, u); node.position.y += Math.sin(u * Math.PI) * 0.06; }
      else node.position.copy(via).multiplyScalar(1 - easeIn((t - 0.6) / 0.4));
      if (t >= 1) landed();
    }
    if (view.stage === 'done' && clock - doneAt > 0.9) {
      if (placed < STEPS.length) present(placed); else toPaint();
    }
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
    ready, begin, fit, paint, crank, park,
    toStart() { if (view.phase === 'paint') toStart(); },
    ride: startRide,
    throttle: throttleOn,
    setPaused(p: boolean) { paused = p; if (p) { audio.stopCranking(); throttleHeld = false; } last = performance.now(); },
    refreshAudio() { audio.refreshMute(); },
    /** Frames the whole bike from a fixed angle (the arcade card is shot this way). */
    look(az: number, el: number, radius: number) { posed = true; frame(new THREE.Vector3(0, 0.55, 0), radius, az, el); userAz = 0; userEl = 0; placeCamera(0, true); },
    /** Testing only: run the clock forward without waiting for frames (a hidden browser tab gets none). */
    advance(seconds: number) { for (let t = 0; t < seconds; t += 1 / 60) { clock += 1 / 60; update(1 / 60); fx.update(1 / 60, camera); } renderer.render(scene, camera); if (changed) { changed = false; callbacks.change({ ...view }); } },
    destroy() {
      disposed = true; cancelAnimationFrame(raf); observer.disconnect(); clearBolts(); hand.remove();
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
      ride?.dispose(); room.dispose(); fx.dispose(); envTex.dispose(); pmrem.dispose(); boltGeo.dispose(); boltMat.dispose();
      scene.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of [o.material].flat()) m.dispose(); } });
      renderer.dispose(); canvas.remove();
    }
  };
}
export type GarageScene = ReturnType<typeof createGarageScene>;

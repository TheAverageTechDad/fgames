import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FARM_ASSETS } from './assets';
import { COLORS, coinIcon, cropIcon, createFarmProps, mergeByMaterial, tile, tileText } from './props';
import { buildFarmWorld, groundTile } from './world';
import { createFarmInput } from './input';
import { createFarmAudio } from './audio';
import { stepFarm, farmGoal, total, distance, FIELDS, SPOTS, STANDS, GROW_SECONDS, LAND_PRICE, ARRIVE_SECONDS, CROPS, type FarmState, type FarmEvent, type Cell, type Crop, type Point } from './model';

type Callbacks = {
  update: () => void;
  event: (event: FarmEvent, screen: { x: number; y: number }) => void;
  save: () => void;
};
type Flight = { mesh: THREE.Object3D; from: THREE.Vector3; to: () => THREE.Vector3; delay: number; age: number; duration: number; lift: number };
type Shopper = { id: number; group: THREE.Group; joints: THREE.Object3D[]; bubble: THREE.Sprite; draw: (text: string, crop: Crop | null) => void; text: string; leaving: number; walk: number };

// 45° isometric view from the (+x, +z) corner: world (-x, -z) is screen up.
const VIEW = new THREE.Vector3(1, 1.5, 1).normalize();
const SUN = new THREE.Vector3(-4, 12, 7);
const ISO = Math.SQRT1_2;
// Shoppers queue along the counter, arriving from the right and leaving down the lane at the bottom.
const SHOPPER_SLOT = (i: number) => new THREE.Vector3(2.65 + i * 0.72, 0, 2.9);
const SHOPPER_SPAWN = new THREE.Vector3(7.8, 0, 2.9);
const SHOPPER_EXIT = new THREE.Vector3(2.65, 0, 8);
const ease = (t: number) => 1 - (1 - t) ** 3;
const pop = (t: number) => t >= 1 ? 1 : 1 + Math.sin(t * Math.PI) * 0.25 * (1 - t) + (ease(t) - 1);

export function createFarmScene(host: HTMLElement, state: FarmState, callbacks: Callbacks) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.04;
  const canvas = renderer.domElement; canvas.tabIndex = 0; canvas.setAttribute('aria-label', 'Farm. Drag to move, or use arrow keys.');
  canvas.dataset.farmCanvas = ''; host.append(canvas);
  const input = createFarmInput(canvas, host), audio = createFarmAudio(state), props = createFarmProps();
  const scene = new THREE.Scene(); scene.background = new THREE.Color(COLORS.grass);
  scene.add(new THREE.HemisphereLight('#fffaf0', '#6f9450', 1.45));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.5); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3; scene.add(sun, sun.target);
  const camera = new THREE.OrthographicCamera(-3, 3, 6, -6, 0.1, 100);
  const focus = new THREE.Vector3(), aim = new THREE.Vector3();
  const focusTarget = () => {
    // The player sits a little above centre, clear of the bottom task card.
    const x = Math.max(-2.7, Math.min(2.7, state.player.x)), z = Math.max(-2.7, Math.min(2.9, state.player.z));
    return aim.set(x + 0.55, 0, z + 0.55);
  };
  focus.copy(focusTarget());
  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height);
    const halfWidth = 3.35, halfHeight = halfWidth * height / width;
    Object.assign(camera, { left: -halfWidth, right: halfWidth, top: halfHeight, bottom: -halfHeight }); camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize); observer.observe(host); resize();

  const world = new THREE.Group(); scene.add(world);
  buildFarmWorld(props, world);
  const merged = mergeByMaterial(world);

  // Fields, their plants and seed stands; the second field opens with the first purchase.
  const fieldRoot = new THREE.Group(); scene.add(fieldRoot);
  const plants = new Map<string, { cell: Cell; group: THREE.Group; leaves: THREE.Object3D; fruit: THREE.Object3D; stage: Cell['stage']; changed: number }>();
  const beds: { group: THREE.Group; born: number }[] = [];
  let renderedPlots = 0, time = 0;
  function addPlots(animate: boolean) {
    for (const plot of state.plots.slice(renderedPlots)) {
      const bed = new THREE.Group(); fieldRoot.add(bed);
      props.fieldBed(bed, FIELDS[plot.id].x, FIELDS[plot.id].z);
      for (const cell of plot.cells) {
        const plant = props.crop(plot.crop); plant.group.position.set(cell.x, 0.17, cell.z); plant.group.rotation.y = (cell.x * 7 + cell.z * 3) % Math.PI; bed.add(plant.group);
        plants.set(cell.id, { cell, ...plant, stage: cell.stage, changed: -1 });
      }
      if (plot.id === 1) {
        const stand = props.seedStand('cucumber'); stand.position.set(STANDS[1].x, 0, STANDS[1].z); bed.add(stand);
        groundTile(props, bed, SPOTS.cucumberSeeds.x, SPOTS.cucumberSeeds.z, 1.3, 0.8, (c, w, h) => {
          tile(c, w, h, { dash: [2.2, 1.4] }); cropIcon(c, 'cucumber', w * 0.24, h * 0.52, h * 0.2); tileText(c, 'SEEDS', w * 0.6, h * 0.53, h * 0.38);
        });
      }
      beds.push({ group: bed, born: animate ? time : -10 });
    }
    renderedPlots = state.plots.length; expansion.visible = state.plots.length < 2;
  }
  const expansion = new THREE.Group(); scene.add(expansion);
  props.rbox(expansion, COLORS.lawn, SPOTS.expansion.x, 0.01, SPOTS.expansion.z, 2.95, 0.04, 2.95, 0.02);
  groundTile(props, expansion, SPOTS.expansion.x, SPOTS.expansion.z, 2.6, 2.6, (c, w, h) => {
    tile(c, w, h, { fill: '#e9f7c955', radius: 0.14 });
    c.fillStyle = '#ffffffcc'; c.beginPath(); c.roundRect(w * 0.27, h * 0.2, w * 0.46, h * 0.3, h * 0.04); c.fill();
    for (let i = 0; i < 3; i++) { c.fillStyle = '#7b4a2d'; c.fillRect(w * 0.31, h * (0.25 + i * 0.08), w * 0.38, h * 0.04); }
    cropIcon(c, 'cucumber', w * 0.66, h * 0.24, h * 0.06);
    coinIcon(c, w * 0.32, h * 0.68, h * 0.08); tileText(c, String(LAND_PRICE), w * 0.58, h * 0.68, h * 0.17);
  });
  const ringMaterial = new THREE.MeshBasicMaterial({ color: '#ffd84f', toneMapped: false, transparent: true, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.BufferGeometry(), ringMaterial); ring.rotation.x = -Math.PI / 2; ring.position.set(SPOTS.expansion.x, 0.05, SPOTS.expansion.z); ring.renderOrder = 2; expansion.add(ring);
  let ringShown = -1;
  addPlots(false);

  // Customers' produce on the counter, the cash pile, and the farmer's carried stack.
  const sphere = new THREE.SphereGeometry(1, 14, 10), coinGeometry = new THREE.CylinderGeometry(0.12, 0.12, 0.045, 18);
  const instanced = (geometry: THREE.BufferGeometry, color: string, count: number, parent: THREE.Object3D) => {
    const m = new THREE.InstancedMesh(geometry, props.material(color), count); m.castShadow = true; m.count = 0; m.frustumCulled = false; parent.add(m); return m;
  };
  const shelf = { tomato: instanced(sphere, COLORS.tomato, 9, scene), cucumber: instanced(sphere, COLORS.cucumber, 9, scene) };
  const coins = instanced(coinGeometry, COLORS.coin, 36, scene);
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3(), position = new THREE.Vector3(), euler = new THREE.Euler();
  const place = (m: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, ry = 0) => {
    m.setMatrixAt(i, matrix.compose(position.set(x, y, z), quaternion.setFromEuler(euler.set(0, ry, 0)), scale.set(sx, sy, sz)));
  };
  let shelfKey = '', cashKey = -1, stackKey = '';
  function updateShelfAndCash() {
    const key = `${state.stock.tomato}:${state.stock.cucumber}`;
    if (key !== shelfKey) {
      shelfKey = key;
      CROPS.forEach((crop, c) => {
        const m = shelf[crop], n = Math.min(9, state.stock[crop]); m.count = n;
        for (let i = 0; i < n; i++) place(m, i, 1.9 + c * 0.65 + (i % 3 - 1) * 0.14, 1.12 + Math.floor(i / 3) * 0.08, 2.0 + (Math.floor(i / 3) % 2 - 0.5) * 0.12,
          crop === 'tomato' ? 0.085 : 0.05, crop === 'tomato' ? 0.08 : 0.05, crop === 'tomato' ? 0.085 : 0.15, i);
        m.instanceMatrix.needsUpdate = true;
      });
    }
    const n = Math.min(36, Math.ceil(state.cash / 2));
    if (n !== cashKey) {
      cashKey = n; coins.count = n;
      for (let i = 0; i < n; i++) { const s = i % 6; place(coins, i, SPOTS.cash.x + (s % 3 - 1) * 0.26, 0.03 + Math.floor(i / 6) * 0.047, SPOTS.cash.z + (Math.floor(s / 3) - 0.5) * 0.26, 1, 1, 1, i * 0.7); }
      coins.instanceMatrix.needsUpdate = true;
    }
  }
  groundTile(props, scene, SPOTS.cash.x, SPOTS.cash.z, 1.0, 0.8, (c, w, h) => tile(c, w, h, { fill: '#ffffff26', stroke: '#ffffff99', radius: 0.2 }));

  const farmer = new THREE.Group(); farmer.position.set(state.player.x, 0, state.player.z); scene.add(farmer);
  const stack = new THREE.Group(); stack.position.set(0, 0.78, 0.36); farmer.add(stack);
  const carried = { seed: instanced(sphere, COLORS.burlap, 12, stack), tomato: instanced(sphere, COLORS.tomato, 24, stack), cucumber: instanced(sphere, COLORS.cucumber, 24, stack) };
  let stackHeight = 0;
  function updateStack() {
    const key = `${total(state.seeds)}:${state.produce.tomato}:${state.produce.cucumber}`;
    if (key === stackKey) return;
    stackKey = key;
    // Two columns: seed bags at the bottom, then the harvest piled on top.
    let y = 0;
    const layer = (m: THREE.InstancedMesh, n: number, h: number, s: [number, number, number], turn: number) => {
      m.count = n;
      for (let i = 0; i < n; i++) place(m, i, (i % 2 - 0.5) * 0.21, y + Math.floor(i / 2) * h + h / 2, ((i * 7) % 3 - 1) * 0.015, ...s, i * turn);
      y += Math.ceil(n / 2) * h; m.instanceMatrix.needsUpdate = true;
    };
    layer(carried.seed, total(state.seeds), 0.15, [0.1, 0.08, 0.09], 0.9);
    layer(carried.tomato, state.produce.tomato, 0.17, [0.1, 0.095, 0.1], 0.9);
    layer(carried.cucumber, state.produce.cucumber, 0.12, [0.07, 0.065, 0.19], 0);
    stackHeight = y;
  }
  const stackTop = () => stack.localToWorld(new THREE.Vector3(0, stackHeight + 0.1, 0));
  const shadowDisc = (radius: number) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), new THREE.MeshBasicMaterial({ color: '#2f4a22', transparent: true, opacity: 0.2, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.04; return m;
  };
  const farmerShadow = shadowDisc(0.34); scene.add(farmerShadow);

  // Guide: a bobbing marker over the next goal and a chevron at her feet pointing to it.
  const guide = new THREE.Group(); scene.add(guide);
  const arrow = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, toneMapped: false, map: props.canvasTexture(128, 160, c => {
    c.beginPath(); c.moveTo(64, 150); c.lineTo(118, 84); c.lineTo(86, 84); c.lineTo(86, 14); c.lineTo(42, 14); c.lineTo(42, 84); c.lineTo(10, 84); c.closePath();
    c.lineJoin = 'round'; c.lineWidth = 12; c.strokeStyle = '#ffffff'; c.stroke(); c.fillStyle = '#ffc928'; c.fill();
    c.fillStyle = '#ffe48a'; c.fillRect(50, 20, 12, 60);
  }) }));
  arrow.scale.set(0.42, 0.52, 1); arrow.center.set(0.5, 0); arrow.renderOrder = 5; guide.add(arrow);
  const arrowShape = new THREE.Shape([new THREE.Vector2(0, 0.32), new THREE.Vector2(0.28, 0), new THREE.Vector2(0.12, 0), new THREE.Vector2(0.12, -0.24), new THREE.Vector2(-0.12, -0.24), new THREE.Vector2(-0.12, 0), new THREE.Vector2(-0.28, 0)]);
  const chevron = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape).rotateX(-Math.PI / 2).rotateY(Math.PI), new THREE.MeshBasicMaterial({ color: '#7fe3ff', transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, toneMapped: false }));
  chevron.renderOrder = 4; scene.add(chevron);

  const effectRoot = new THREE.Group(); scene.add(effectRoot);
  const flights: Flight[] = [];
  const pulses: { mesh: THREE.Mesh; age: number }[] = [];
  const confetti: { mesh: THREE.Mesh; velocity: THREE.Vector3; age: number }[] = [];
  const pulseGeometry = new THREE.RingGeometry(0.75, 1, 32).rotateX(-Math.PI / 2);
  function fly(make: () => THREE.Object3D, from: THREE.Vector3, to: () => THREE.Vector3, count: number, { delay = 0, gap = 0.06, duration = 0.45, lift = 0.7 } = {}) {
    for (let i = 0; i < count; i++) { const mesh = make(); mesh.visible = false; effectRoot.add(mesh); flights.push({ mesh, from: from.clone(), to, delay: delay + i * gap, age: 0, duration, lift }); }
  }
  const item = (kind: Crop | 'seed' | 'coin') => () => {
    if (kind === 'coin') { const m = new THREE.Mesh(coinGeometry, props.material(COLORS.coin)); m.rotation.x = Math.PI / 2; return m; }
    const m = new THREE.Mesh(sphere, props.material(kind === 'seed' ? COLORS.burlap : COLORS[kind]));
    m.scale.set(...(kind === 'cucumber' ? [0.07, 0.065, 0.19] : kind === 'seed' ? [0.1, 0.08, 0.09] : [0.1, 0.095, 0.1]) as [number, number, number]);
    return m;
  };
  function pulse(at: Point, color: string, size = 0.5) {
    const mesh = new THREE.Mesh(pulseGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, toneMapped: false }));
    mesh.position.set(at.x, 0.06, at.z); mesh.scale.setScalar(size * 0.3); mesh.userData.size = size; mesh.renderOrder = 3; effectRoot.add(mesh); pulses.push({ mesh, age: 0 });
  }
  const v3 = (p: Point, y: number) => new THREE.Vector3(p.x, y, p.z);

  // Shoppers are recoloured copies of one model, recycled once they walk off.
  let customerSource: THREE.Object3D | null = null;
  const shoppers = new Map<number, Shopper>(), spare: Shopper[] = [], ownedMaterials: THREE.Material[] = [];
  const outfits = [['#d9604c', '#3c4a63'], ['#4f7fb8', '#6b4b32'], ['#e0a93b', '#2f3b4f'], ['#7d5ba6', '#4a3a2a'], ['#3f9a8a', '#3c4a63'], ['#e27fa0', '#2f3b4f']];
  function makeShopper(id: number): Shopper {
    const reused = spare.pop();
    const shopper = reused ?? (() => {
      const group = new THREE.Group(), model = customerSource!.clone(true), joints: THREE.Object3D[] = [];
      const [shirt, trousers] = outfits[(id * 5) % outfits.length];
      model.traverse(o => {
        if (/^(arm-|leg-)/.test(o.name) && !(o instanceof THREE.Mesh)) joints.push(o);
        if (o instanceof THREE.Mesh && !Array.isArray(o.material) && /shirt|trousers/.test(o.material.name)) {
          o.material = o.material.clone(); (o.material as THREE.MeshStandardMaterial).color.set(/shirt/.test(o.material.name) ? shirt : trousers); ownedMaterials.push(o.material);
        }
      });
      group.add(model, shadowDisc(0.28));
      const bubbleCanvas = document.createElement('canvas'); bubbleCanvas.width = 200; bubbleCanvas.height = 132;
      const context = bubbleCanvas.getContext('2d')!, texture = new THREE.CanvasTexture(bubbleCanvas); texture.colorSpace = THREE.SRGBColorSpace;
      const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false, toneMapped: false })); bubble.scale.set(0.72, 0.475, 1); bubble.position.y = 1.95; group.add(bubble);
      const draw = (text: string, crop: Crop | null) => {
        context.clearRect(0, 0, 200, 132);
        context.fillStyle = '#284034'; context.beginPath(); context.roundRect(8, 8, 184, 96, 30); context.fill();
        context.beginPath(); context.moveTo(84, 100); context.lineTo(100, 126); context.lineTo(116, 100); context.fill();
        if (crop) { cropIcon(context, crop, 62, 58, 24); tileText(context, text, 134, 60, 58); } else tileText(context, text, 100, 60, 62, '#ff8fa8');
        texture.needsUpdate = true;
      };
      return { id, group, joints, bubble, draw, text: '', leaving: 0, walk: 0 };
    })();
    Object.assign(shopper, { id, leaving: 0, text: '' }); shopper.bubble.visible = false;
    shopper.group.position.copy(SHOPPER_SPAWN); shopper.group.visible = true; scene.add(shopper.group); shoppers.set(id, shopper);
    return shopper;
  }
  function updateShoppers(dt: number) {
    if (!customerSource) return;
    const live = new Set(state.customers.map(c => c.id));
    for (const shopper of shoppers.values()) if (!live.has(shopper.id) && !shopper.leaving) {
      shopper.leaving = time; shopper.draw('♥', null); shopper.text = '♥'; shopper.bubble.visible = true;
    }
    state.customers.forEach((c, i) => {
      const shopper = shoppers.get(c.id) ?? makeShopper(c.id), slot = SHOPPER_SLOT(i), g = shopper.group.position;
      const goal = c.wait > 0 ? SHOPPER_SPAWN.clone().lerp(slot, 1 - c.wait / ARRIVE_SECONDS) : slot;
      walkTo(shopper, goal, 3, dt);
      const front = i === 0 && c.wait === 0 && distance({ x: g.x, z: g.z }, { x: slot.x, z: slot.z }) < 0.1;
      const text = front ? String(c.want - c.got) : '';
      shopper.bubble.visible = front;
      if (front && text + c.crop !== shopper.text) { shopper.text = text + c.crop; shopper.draw(text, c.crop); }
      if (front || shopper.walk < 0.02) shopper.group.rotation.y = Math.PI;
    });
    for (const shopper of shoppers.values()) if (shopper.leaving) {
      walkTo(shopper, SHOPPER_EXIT, 2.2, dt);
      shopper.bubble.visible = time - shopper.leaving < 0.9;
      if (shopper.group.position.distanceTo(SHOPPER_EXIT) < 0.1) { shopper.group.removeFromParent(); shoppers.delete(shopper.id); spare.push(shopper); }
    }
  }
  function walkTo(shopper: Shopper, goal: THREE.Vector3, speed: number, dt: number) {
    const p = shopper.group.position, dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz), step = Math.min(d, speed * dt);
    if (d > 0.001) { p.x += dx / d * step; p.z += dz / d * step; }
    shopper.walk = dt ? step / dt : 0;
    if (shopper.walk > 0.2) shopper.group.rotation.y = Math.atan2(dx, dz);
    const swing = shopper.walk > 0.2 ? Math.sin(time * 11 + shopper.id) * 0.5 : 0;
    shopper.joints.forEach(j => { j.rotation.x = swing * (j.name.includes('right') ? 1 : -1) * (j.name.startsWith('arm') ? -0.7 : 1); });
    p.y = shopper.walk > 0.2 ? Math.abs(Math.sin(time * 11 + shopper.id)) * 0.03 : 0;
  }

  let disposed = false, paused = false, loaded = false, frame = 0, previous = performance.now(), saveClock = 0, hudClock = 0, actionTime = 0, faceCell: Point | null = null;
  const joints: THREE.Object3D[] = [];
  function disposeObject(root: THREE.Object3D) {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    root.traverse(o => {
      if (o instanceof THREE.Mesh) geometries.add(o.geometry);
      if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
  }
  function fit(model: THREE.Object3D, height: number) {
    const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
    model.scale.multiplyScalar(height / size.y);
    const fitted = new THREE.Box3().setFromObject(model); model.position.y -= fitted.min.y;
    model.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
    return model;
  }
  const loader = new GLTFLoader();
  const loadedModels: THREE.Object3D[] = [];
  const load = async (url: string) => {
    const gltf = await loader.loadAsync(url);
    if (disposed) disposeObject(gltf.scene); else loadedModels.push(gltf.scene);
    return gltf;
  };
  const ready = Promise.all([load(FARM_ASSETS.farmer), load(FARM_ASSETS.customer)]).then(([mother, customer]) => {
    if (disposed) return;
    const model = fit(mother.scene, 1.65); farmer.add(model);
    model.traverse(o => { if (!(o instanceof THREE.Mesh) && /^(arm-|leg-)/.test(o.name)) joints.push(o); });
    customerSource = fit(customer.scene, 1.5);
    updateStack(); updateShelfAndCash();
    camera.position.copy(focus).addScaledVector(VIEW, 30); camera.lookAt(focus);
  // Keep the loading card up until shaders are ready, so the farm appears in one piece.
  }).then(() => disposed ? undefined : renderer.compileAsync(scene, camera)).then(() => {
    if (disposed) return;
    loaded = true; previous = performance.now(); callbacks.update();
  });

  function feedback(event: FarmEvent) {
    audio.play(event);
    const at = v3(event.at, 0.7);
    if (event.type === 'seed') fly(item('seed'), at, stackTop, Math.min(6, event.amount), { gap: 0.05 });
    if (event.type === 'plant') { fly(item('seed'), stackTop(), () => v3(event.at, 0.2), 1, { duration: 0.3, lift: 0.3 }); pulse(event.at, '#f0c999', 0.45); }
    if (event.type === 'harvest') { fly(item(event.crop!), v3(event.at, 0.4), stackTop, event.amount, { gap: 0.07 }); pulse(event.at, '#c8f07a', 0.5); }
    if (event.type === 'plant' || event.type === 'harvest') { actionTime = 0.32; faceCell = event.at; }
    if (event.type === 'delivery') {
      const top = stackTop();
      fly(item('tomato'), top, () => v3(SPOTS.counter, 1.15), Math.min(8, event.amount), { gap: 0.05, lift: 0.5 });
      pulse(SPOTS.market, '#ffffff', 0.6);
    }
    if (event.type === 'sale') {
      fly(item(event.crop!), v3(SPOTS.counter, 1.15), () => SHOPPER_SLOT(0).setY(1.0), 1, { duration: 0.3, lift: 0.3 });
      fly(item('coin'), SHOPPER_SLOT(0).setY(1.0), () => v3(SPOTS.cash, 0.3), 1, { delay: 0.25, duration: 0.4, lift: 0.5 });
    }
    if (event.type === 'cash') { fly(item('coin'), v3(SPOTS.cash, 0.2), () => farmer.position.clone().setY(1.0), Math.min(10, Math.ceil(event.amount / 2)), { gap: 0.035, duration: 0.35 }); pulse(SPOTS.cash, '#ffe07a', 0.7); }
    if (event.type === 'purchase') {
      addPlots(true); callbacks.save(); pulse(SPOTS.expansion, '#ffe07a', 2.2);
      const colors = ['#ffd23f', '#ff7aa2', '#7fe3ff', '#9be15d', '#ffffff'];
      for (let i = 0; i < 40; i++) {
        const mesh = new THREE.Mesh(sphere, props.material(colors[i % colors.length])); mesh.scale.set(0.06, 0.02, 0.09);
        mesh.position.set(SPOTS.expansion.x, 0.3, SPOTS.expansion.z); effectRoot.add(mesh);
        const a = i * 2.4; confetti.push({ mesh, age: 0, velocity: new THREE.Vector3(Math.cos(a) * (1 + i % 3), 4.5 + (i % 5) * 0.5, Math.sin(a) * (1 + i % 3)) });
      }
    }
    if (event.type === 'cash' || event.type === 'delivery') callbacks.save();
    const point = new THREE.Vector3(event.at.x, 0.8, event.at.z).project(camera);
    callbacks.event(event, { x: (point.x + 1) * host.clientWidth / 2, y: (1 - point.y) * host.clientHeight / 2 });
  }
  const visibility = () => { previous = performance.now(); if (document.hidden) callbacks.save(); };
  document.addEventListener('visibilitychange', visibility);
  function animate(now: number) {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    const dt = Math.min(0.1, Math.max(0, (now - previous) / 1000)); previous = now;
    if (paused || document.hidden || !loaded) return;
    time += dt;
    // The stick reports screen directions; turn them into the rotated world.
    const screen = input.read(), move = { x: (screen.x + screen.z) * ISO, z: (screen.z - screen.x) * ISO };
    const events = stepFarm(state, dt, move); events.forEach(feedback);
    const moving = Math.hypot(move.x, move.z) > 0.05, carrying = total(state.produce) + total(state.seeds) > 0;
    farmer.position.set(state.player.x, moving ? Math.abs(Math.sin(time * 12)) * 0.04 : 0, state.player.z);
    const facing = moving ? Math.atan2(move.x, move.z) : faceCell && actionTime > 0 ? Math.atan2(faceCell.x - state.player.x, faceCell.z - state.player.z) : null;
    if (facing !== null) farmer.rotation.y += Math.atan2(Math.sin(facing - farmer.rotation.y), Math.cos(facing - farmer.rotation.y)) * Math.min(1, dt * 14);
    farmerShadow.position.set(state.player.x, 0.04, state.player.z);
    actionTime = Math.max(0, actionTime - dt);
    for (const joint of joints) {
      const arm = joint.name.startsWith('arm'), side = joint.name.includes('right') ? 1 : -1;
      const swing = moving ? Math.sin(time * 12) * 0.5 * side : 0;
      joint.rotation.x = arm ? (actionTime > 0 ? -0.5 - 0.6 * Math.sin(actionTime / 0.32 * Math.PI) : carrying ? -1.15 : -swing * 0.7) : swing;
    }
    updateStack();
    // The pile leans back a little as she walks and settles when she stops.
    stack.rotation.x += ((moving ? -0.09 : 0) + Math.sin(time * 9) * (moving ? 0.015 : 0) - stack.rotation.x) * Math.min(1, dt * 8);
    updateShelfAndCash();
    for (const plant of plants.values()) {
      const { cell, group, leaves, fruit } = plant;
      if (cell.stage !== plant.stage) { plant.stage = cell.stage; plant.changed = time; }
      const since = time - plant.changed;
      group.visible = cell.stage !== 'empty';
      const growth = cell.stage === 'ripe' ? 1 : 0.25 + cell.age / GROW_SECONDS * 0.75;
      leaves.scale.setScalar(growth * (cell.stage === 'growing' && since < 0.4 ? pop(since / 0.4) : 1));
      fruit.visible = cell.stage === 'ripe'; fruit.scale.setScalar(cell.stage === 'ripe' ? pop(Math.min(1, since / 0.45)) : 0.01);
      group.rotation.z = Math.sin(time * 1.8 + cell.x * 3) * (cell.stage === 'ripe' ? 0.05 : 0.025);
    }
    for (const bed of beds) bed.group.scale.setScalar(bed.born < 0 ? 1 : pop(Math.min(1, (time - bed.born) / 0.6)));
    if (expansion.visible) {
      const progress = state.purchaseProgress, affordable = state.wallet >= LAND_PRICE;
      if (Math.abs(progress - ringShown) > 0.01) {
        ringShown = progress; ring.geometry.dispose();
        ring.geometry = progress > 0 ? new THREE.RingGeometry(1.0, 1.16, 64, 1, Math.PI / 2, -progress * Math.PI * 2) : new THREE.BufferGeometry();
      }
      expansion.position.y = affordable ? Math.abs(Math.sin(time * 3)) * 0.015 : 0;
    }
    updateShoppers(dt);
    const goal = farmGoal(state).at;
    guide.visible = !!goal && distance(state.player, goal) > 0.8;
    if (goal) guide.position.set(goal.x, (state.plots.some(p => p.cells.includes(goal as Cell)) ? 0.55 : 0.3) + Math.abs(Math.sin(time * 4)) * 0.15, goal.z);
    chevron.visible = !!goal && distance(state.player, goal) > 1.8;
    if (goal && chevron.visible) {
      const a = Math.atan2(goal.x - state.player.x, goal.z - state.player.z);
      chevron.position.set(state.player.x + Math.sin(a) * 0.75, 0.2, state.player.z + Math.cos(a) * 0.75); chevron.rotation.y = a;
      (chevron.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(time * 5) * 0.25;
    }
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i]; f.age += dt;
      const t = Math.min(1, Math.max(0, (f.age - f.delay) / f.duration));
      f.mesh.visible = f.age >= f.delay;
      f.mesh.position.lerpVectors(f.from, f.to(), ease(t)); f.mesh.position.y += Math.sin(t * Math.PI) * f.lift;
      if (t >= 1) { f.mesh.removeFromParent(); flights.splice(i, 1); }
    }
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i]; p.age += dt; const t = p.age / 0.45;
      p.mesh.scale.setScalar(p.mesh.userData.size * (0.3 + ease(Math.min(1, t)) * 0.9)); (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t);
      if (t >= 1) { p.mesh.removeFromParent(); (p.mesh.material as THREE.Material).dispose(); pulses.splice(i, 1); }
    }
    for (let i = confetti.length - 1; i >= 0; i--) {
      const c = confetti[i]; c.age += dt; c.velocity.y -= 9 * dt; c.mesh.position.addScaledVector(c.velocity, dt); c.mesh.rotation.x += dt * 9; c.mesh.rotation.z += dt * 6;
      if (c.mesh.position.y < 0.03) { c.mesh.position.y = 0.03; c.velocity.set(0, 0, 0); }
      if (c.age > 1.8) { c.mesh.removeFromParent(); confetti.splice(i, 1); }
    }
    focus.lerp(focusTarget(), 1 - Math.exp(-dt * 5));
    camera.position.copy(focus).addScaledVector(VIEW, 30); camera.lookAt(focus);
    sun.position.copy(focus).add(SUN); sun.target.position.copy(focus);
    renderer.render(scene, camera);
    hudClock += dt; saveClock += dt;
    if (hudClock > 0.1 || events.length) { hudClock = 0; callbacks.update(); }
    if (saveClock > 2) { saveClock = 0; callbacks.save(); }
  }
  frame = requestAnimationFrame(animate);
  return {
    ready,
    setPaused(value: boolean) { paused = value; input.setEnabled(!value); previous = performance.now(); if (!value) canvas.focus({ preventScroll: true }); },
    destroy() {
      if (disposed) return;
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); input.destroy(); audio.destroy();
      document.removeEventListener('visibilitychange', visibility); callbacks.save();
      for (const s of [...shoppers.values(), ...spare]) s.group.removeFromParent();
      disposeObject(scene); merged.forEach(g => g.dispose());
      loadedModels.forEach(disposeObject); ownedMaterials.forEach(m => m.dispose()); props.dispose(); sphere.dispose(); coinGeometry.dispose();
      for (const s of [...shoppers.values(), ...spare]) { s.bubble.material.map?.dispose(); s.bubble.material.dispose(); }
      sun.shadow.map?.dispose(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    }
  };
}

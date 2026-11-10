import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FARM_ASSETS } from './assets';
import { COLORS, SHELF_X, coinIcon, cropIcon, createFarmProps, mergeByMaterial, seeded, tile, tileText } from './props';
import { buildFarmWorld, groundTile, LAMPS } from './world';
import { createPuffs, createSky } from './juice';
import { createStickInput } from '#lib/stick-input';
import { createFarmAudio } from './audio';
import { stepFarm, farmGoal, nextPurchase, speed, canSprint, total, distance, hasCoop, hasOrchard, hasHives, stallFor, boardOpen, buyUpgrade, buyDecor, hireHelper,
  BOUNDS, PRODUCTS, PURCHASES, FIELDS, GROW, SPOTS, NESTS, HIVES, STALLS, YARD, ORCHARD, DECOR, ARRIVE_SECONDS, PATIENCE_SECONDS, RUN_SPEED,
  type FarmState, type FarmEvent, type Cell, type Crop, type Product, type Point, type DecorId, type UpgradeId } from './model';
export type ShopAction = { kind: 'upgrade'; id: UpgradeId } | { kind: 'decor'; id: DecorId } | { kind: 'helper' };

type Callbacks = {
  update: () => void;
  event: (event: FarmEvent, screen: { x: number; y: number }) => void;
  save: () => void;
  /** While she stands on a price tile, once per coin: where the tile is on screen, for coins flying from the wallet. */
  pay: (screen: { x: number; y: number }) => void;
};
type Flight = { mesh: THREE.Object3D; from: THREE.Vector3; to: () => THREE.Vector3; delay: number; age: number; duration: number; lift: number };
type Walker = { group: THREE.Group; joints: THREE.Object3D[]; phase: number; walk: number; squash: number };
type Shopper = Walker & { id: number; bubble: THREE.Sprite; draw: (key: string, paint: (c: CanvasRenderingContext2D) => void) => void; key: string; leaving: number; happy: boolean; frontAt: number };
// What shoppers say: a greeting as they reach the counter, a nudge when kept waiting, a thank-you or a sigh as they go.
const SAY = {
  hello: ['Hello!', 'Ooh, fresh!', 'Smells lovely!', 'Morning!', 'What a farm!', 'Yum, yum!', 'Hi there!'],
  order: ['Just one, please', 'Two, please!', 'Three, please!'],
  waiting: ['Hello?', 'Still waiting…', 'Any more?', 'Hmm…', 'Tick tock…'],
  thanks: ['Thank you!', 'Delicious!', 'See you soon!', 'So fresh!', 'Lovely!', 'Yum!', 'Perfect!'],
  grumpy: ['Never mind…', 'Maybe later', 'Hmph!', 'Oh well…']
};
const pick = (list: string[], id: number, salt = 0) => list[(id * 7 + salt * 3) % list.length];

// 45° isometric view from the (+x, +z) corner: world (-x, -z) is screen up.
const VIEW = new THREE.Vector3(1, 1.5, 1).normalize();
const ISO = Math.SQRT1_2;
const DAY_SECONDS = 300;
// Shoppers queue along the counter, arriving from the right and leaving down the lane at the bottom.
// The orchard stand's queue runs west along its counter; its shoppers walk up the stone path from the south.
const SHOPPER_SLOT = (i: number, stall = 0) => stall
  ? new THREE.Vector3(SPOTS.standCounter.x + 0.25 - i * 0.72, 0, SPOTS.standCounter.z + 0.9)
  : new THREE.Vector3(SPOTS.counter.x + 0.25 + i * 0.72, 0, SPOTS.counter.z + 0.9);
const SHOPPER_SPAWN = [new THREE.Vector3(12, 0, SPOTS.counter.z + 0.9), new THREE.Vector3(0.25, 0, 19)];
const SHOPPER_EXIT = [new THREE.Vector3(SPOTS.counter.x + 0.25, 0, 12), new THREE.Vector3(-0.25, 0, 19)];
// Orchard shoppers come up the road and in through the gate in the south fence, never through the fence.
const SHOPPER_DOOR = [null, new THREE.Vector3(0, 0, 9.4)];
// Along a path through an optional door: the first 70% of the walk reaches the door, the rest the goal.
function along(from: THREE.Vector3, door: THREE.Vector3 | null, to: THREE.Vector3, t: number) {
  if (!door) return from.clone().lerp(to, t);
  return t < 0.7 ? from.clone().lerp(door, t / 0.7) : door.clone().lerp(to, (t - 0.7) / 0.3);
}
// Where the children play: points on the paths and lawns, clear of the fields.
const PLAYGROUND: Point[] = [{ x: 0, z: 0 }, { x: -5.5, z: 0 }, { x: 5.5, z: 0 }, { x: 0, z: -5.5 }, { x: 0, z: 5.5 }, { x: -1.4, z: 5.2 },
  { x: 4.0, z: 5.7 }, { x: -5.6, z: 3.4 }, { x: 0.3, z: -3 }, { x: -3, z: 0.2 }, { x: 4.8, z: 0.5 }, { x: 1.2, z: 4.6 }];
// Dad keeps the stalls from the end of each counter, clear of the queue. Once the orchard opens he walks between them
// on the stone: behind the market counter, down the main path through the hedge gap, and behind the orchard stand.
const DAD_ROUTE: Point[] = [{ x: 4.4, z: 2.15 }, { x: 3.95, z: 1.85 }, { x: 0, z: 1.85 }, { x: 0, z: 6.98 }, { x: -2.75, z: 6.98 }, { x: -3.2, z: 7.25 }];
const ease = (t: number) => 1 - (1 - t) ** 3;
const pop = (t: number) => t >= 1 ? 1 : 1 + Math.sin(t * Math.PI) * 0.25 * (1 - t) + (ease(t) - 1);
const turn = (from: number, to: number, k: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * Math.min(1, k);

export function createFarmScene(host: HTMLElement, state: FarmState, callbacks: Callbacks) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.04;
  const canvas = renderer.domElement; canvas.tabIndex = 0; canvas.setAttribute('aria-label', 'Farm. Drag to move, or use arrow keys. Tap or press Space to jump.');
  canvas.dataset.farmCanvas = ''; host.append(canvas);
  const input = createStickInput(canvas, host), audio = createFarmAudio(state), props = createFarmProps();
  const scene = new THREE.Scene(); scene.background = new THREE.Color(COLORS.grass);
  const hemi = new THREE.HemisphereLight('#fffaf0', '#6f9450', 1.45); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1d6', 2.5); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03; scene.add(sun, sun.target);
  const sky = createSky({ scene, hemi, sun }), puffs = createPuffs(scene);
  const TEXEL = 18 / 2048, WORLD_UP = new THREE.Vector3(0, 1, 0), lightDir = new THREE.Vector3(), lightRight = new THREE.Vector3(), lightUp = new THREE.Vector3(), shadowFocus = new THREE.Vector3();
  const camera = new THREE.OrthographicCamera(-3, 3, 6, -6, 0.1, 100);
  const focus = new THREE.Vector3(), aim = new THREE.Vector3();
  // The player sits a little above centre, clear of the bottom task card.
  // A new area gets a short tour: the camera glides over to show it, then comes back to her.
  let tour: { x: number; z: number; until: number } | null = null;
  // Follow her, held a little inside the land she owns so the view never drifts far past its edges.
  // LIFT puts her a touch below centre: the HUD lives along the top now.
  const LIFT = -0.25;
  const focusTarget = () => {
    if (tour && time < tour.until) return aim.set(tour.x + LIFT, 0, tour.z + LIFT);
    const minX = (hasOrchard(state) ? ORCHARD.minX : -BOUNDS) + 1.4, maxX = (hasCoop(state) ? YARD.maxX : BOUNDS) - 1.4;
    const minZ = -BOUNDS + 1.4, maxZ = (hasOrchard(state) ? ORCHARD.maxZ : BOUNDS) - 1.2;
    return aim.set(Math.max(minX, Math.min(maxX, state.player.x)) + LIFT, 0, Math.max(minZ, Math.min(maxZ, state.player.z)) + LIFT);
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

  // Fields, their plants, seed stands and SEEDS tiles; more open as they are bought.
  const fieldRoot = new THREE.Group(); scene.add(fieldRoot);
  const plants = new Map<string, { cell: Cell; crop: Crop; trees: boolean; group: THREE.Group; leaves: THREE.Object3D; fruit: THREE.Object3D; stage: Cell['stage']; changed: number }>();
  const beds: { group: THREE.Group; born: number }[] = [];
  let renderedPlots = 0, time = 0;
  function addPlots(animate: boolean) {
    for (const plot of state.plots.slice(renderedPlots)) {
      // The bed pops in around its own centre, so its contents sit in an offset inner group.
      const field = FIELDS[plot.id], bed = new THREE.Group(); bed.position.set(field.x, 0, field.z); fieldRoot.add(bed);
      const inner = new THREE.Group(); inner.position.set(-field.x, 0, -field.z); bed.add(inner);
      const trees = !!field.trees;
      if (!trees) props.fieldBed(inner, field.x, field.z);
      for (const cell of plot.cells) {
        const plant = props.crop(plot.crop); plant.group.position.set(cell.x, trees ? 0 : 0.17, cell.z); plant.group.rotation.y = (cell.x * 7 + cell.z * 3) % Math.PI; inner.add(plant.group);
        if (trees) { plant.group.add(shadowDisc(0.6)); plant.group.scale.setScalar(0.85); }
        plants.set(cell.id, { cell, crop: plot.crop, trees, ...plant, stage: cell.stage, changed: -1 });
      }
      // Stands face away from their field, towards the path.
      if (field.stand && field.tile) {
        const stand = props.seedStand(plot.crop); stand.position.set(field.stand.x, 0, field.stand.z); stand.rotation.y = field.stand.z < field.z ? Math.PI : 0;
        inner.add(stand);
        groundTile(props, inner, field.tile.x, field.tile.z, 1.3, 0.8, (c, w, h) => {
          tile(c, w, h, { dash: [2.2, 1.4] }); cropIcon(c, plot.crop, w * 0.24, h * 0.52, h * 0.2); tileText(c, 'SEEDS', w * 0.6, h * 0.53, h * 0.38);
        });
      }
      beds.push({ group: bed, born: animate ? time : -10 });
    }
    renderedPlots = state.plots.length;
  }

  // The next purchase: a painted price tile, and a gold ring that fills while she stands on it.
  const offer = new THREE.Group(); scene.add(offer);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: '#ffd84f', toneMapped: false, transparent: true, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.BufferGeometry(), ringMaterial); ring.rotation.x = -Math.PI / 2; ring.renderOrder = 2; scene.add(ring);
  // The price sits on its own decal so it can count down as she pays.
  let offerFor = -1, ringShown = -1, priceTile: THREE.Mesh | null = null, priceShown = -1, payClock = 0;
  const drawPrice = (amount: number) => (c: CanvasRenderingContext2D, w: number, h: number) => {
    c.clearRect(0, 0, w, h); coinIcon(c, w * 0.32, h * 0.7, h * 0.08); tileText(c, String(amount), w * 0.58, h * 0.7, h * 0.17);
  };
  function updateOffer() {
    if (offerFor === state.purchased) return;
    offerFor = state.purchased;
    offer.traverse(o => { if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial) { o.material.map?.dispose(); o.material.dispose(); } });
    offer.clear();
    const next = nextPurchase(state);
    ring.visible = !!next;
    if (!next) return;
    const field = next.kind === 'field' ? FIELDS[next.field!] : null, size = field ? 2.6 : 1.3;
    if (field) props.rbox(offer, COLORS.lawn, next.at.x, 0.01, next.at.z, 2.95, 0.04, 2.95, 0.02);
    groundTile(props, offer, next.at.x, next.at.z, size, size, (c, w, h) => {
      tile(c, w, h, { fill: '#e9f7c955', radius: 0.14 });
      if (next.kind === 'coop' || next.kind === 'hives') {
        // A little house: the coop is red with an egg, the hive is cream with a honey jar.
        c.fillStyle = next.kind === 'coop' ? '#b8453a' : '#fff3dc'; c.fillRect(w * 0.32, h * 0.27, w * 0.36, h * 0.22);
        c.fillStyle = next.kind === 'coop' ? '#6e4a36' : '#c9553f'; c.beginPath(); c.moveTo(w * 0.27, h * 0.29); c.lineTo(w * 0.5, h * 0.15); c.lineTo(w * 0.73, h * 0.29); c.fill();
        cropIcon(c, next.kind === 'coop' ? 'egg' : 'honey', w * 0.5, h * 0.4, h * 0.06);
      } else if (next.kind === 'orchard') {
        c.fillStyle = '#8a5a35'; c.fillRect(w * 0.47, h * 0.3, w * 0.06, h * 0.2);
        c.fillStyle = '#4e8f37'; c.beginPath(); c.arc(w * 0.5, h * 0.27, h * 0.14, 0, Math.PI * 2); c.fill();
        for (const [dx, dy] of [[-0.07, -0.02], [0.06, 0.02], [0, -0.09]]) cropIcon(c, 'apple', w * (0.5 + dx), h * (0.27 + dy), h * 0.03);
      } else if (field) {
        c.fillStyle = '#ffffffcc'; c.beginPath(); c.roundRect(w * 0.27, h * 0.2, w * 0.46, h * 0.3, h * 0.04); c.fill();
        for (let i = 0; i < 3; i++) { c.fillStyle = '#7b4a2d'; c.fillRect(w * 0.31, h * (0.25 + i * 0.08), w * 0.38, h * 0.04); }
        cropIcon(c, field.crop, w * 0.66, h * 0.24, h * 0.06);
      } else {
        c.fillStyle = '#b77c3e'; c.beginPath(); c.moveTo(w * 0.28, h * 0.26); c.lineTo(w * 0.72, h * 0.26); c.lineTo(w * 0.64, h * 0.5); c.lineTo(w * 0.36, h * 0.5); c.fill();
        c.strokeStyle = '#94613a'; c.lineWidth = h * 0.035; c.beginPath(); c.arc(w * 0.5, h * 0.26, w * 0.16, Math.PI, 0); c.stroke();
        tileText(c, '+12', w * 0.5, h * 0.37, h * 0.12);
      }
    });
    priceTile = groundTile(props, offer, next.at.x, next.at.z, size, size, drawPrice(next.price)); priceTile.position.y += 0.002; priceShown = next.price;
    ring.position.set(next.at.x, 0.05, next.at.z); ring.userData.radius = field ? 1.08 : 0.62; ringShown = -1;
  }
  addPlots(false); updateOffer();

  // Produce on the counter, the coin pile, and the farmer's carried stack.
  const sphere = new THREE.SphereGeometry(1, 14, 10), coinGeometry = new THREE.CylinderGeometry(0.12, 0.12, 0.045, 18);
  const instanced = (geometry: THREE.BufferGeometry, color: string, count: number, parent: THREE.Object3D) => {
    const m = new THREE.InstancedMesh(geometry, props.material(color), count); m.castShadow = true; m.count = 0; m.frustumCulled = false; parent.add(m); return m;
  };
  const SHAPE: Record<Product | 'seed', [number, number, number]> = { tomato: [0.1, 0.095, 0.1], cucumber: [0.07, 0.065, 0.19], strawberry: [0.075, 0.085, 0.075], egg: [0.065, 0.085, 0.065], apple: [0.1, 0.1, 0.1], honey: [0.08, 0.1, 0.08], seed: [0.1, 0.08, 0.09] };
  const shelf = Object.fromEntries(PRODUCTS.map(c => [c, instanced(sphere, COLORS[c], 9, scene)])) as Record<Product, THREE.InstancedMesh>;
  const coins = instanced(coinGeometry, COLORS.coin, 72, scene);
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3(), position = new THREE.Vector3(), euler = new THREE.Euler();
  const place = (m: THREE.InstancedMesh, i: number, x: number, y: number, z: number, [sx, sy, sz]: [number, number, number], ry = 0) => {
    m.setMatrixAt(i, matrix.compose(position.set(x, y, z), quaternion.setFromEuler(euler.set(0, ry, 0)), scale.set(sx, sy, sz)));
  };
  let shelfKey = '', cashKey = '', stackKey = '';
  function updateShelfAndCash() {
    const key = PRODUCTS.map(c => state.stock[c]).join(':');
    if (key !== shelfKey) {
      shelfKey = key;
      PRODUCTS.forEach(crop => {
        // Each product sits in its own crate on the counter of the stall that sells it.
        const stall = STALLS[stallFor(crop)], c = stall.accepts.indexOf(crop), m = shelf[crop], n = Math.min(9, state.stock[crop]); m.count = n;
        for (let i = 0; i < n; i++) place(m, i, stall.counter.x + SHELF_X[c] + (i % 3 - 1) * 0.12, 1.1 + Math.floor(i / 3) * 0.08, stall.counter.z + (Math.floor(i / 3) % 2 - 0.5) * 0.1,
          SHAPE[crop].map(v => v * 0.85) as [number, number, number], crop === 'cucumber' ? 0 : i);
        m.instanceMatrix.needsUpdate = true;
      });
    }
    const piles = [state.cash, state.standCash].map(c => Math.min(36, Math.ceil(c / 2))), key2 = piles.join(':');
    if (key2 !== cashKey) {
      cashKey = key2; let n = 0;
      piles.forEach((count, p) => { const at = STALLS[p].cash; for (let i = 0; i < count; i++) { const s = i % 6; place(coins, n++, at.x + (s % 3 - 1) * 0.26, 0.03 + Math.floor(i / 6) * 0.047, at.z + (Math.floor(s / 3) - 0.5) * 0.26, [1, 1, 1], i * 0.7); } });
      coins.count = n; coins.instanceMatrix.needsUpdate = true;
    }
  }
  groundTile(props, scene, SPOTS.cash.x, SPOTS.cash.z, 1.0, 0.8, (c, w, h) => tile(c, w, h, { fill: '#ffffff26', stroke: '#ffffff99', radius: 0.2 }));

  const farmer = new THREE.Group(); farmer.position.set(state.player.x, 0, state.player.z); scene.add(farmer);
  const body = new THREE.Group(); farmer.add(body);
  const stack = new THREE.Group(); stack.position.set(0, 0.78, 0.36); body.add(stack);
  const carried = { seed: instanced(sphere, COLORS.burlap, 24, stack), ...Object.fromEntries(PRODUCTS.map(c => [c, instanced(sphere, COLORS[c], 120, stack)])) } as Record<Product | 'seed', THREE.InstancedMesh>;
  let stackHeight = 0;
  function updateStack() {
    const key = `${total(state.seeds)}:${PRODUCTS.map(c => state.produce[c]).join(':')}`;
    if (key === stackKey) return;
    stackKey = key;
    // Seed bags at the bottom, then the harvest piled on top: two columns, widening to three and then a
    // 2×2 block as a big basket fills, so the pile stays a pile rather than a tower.
    let y = 0;
    const load = total(state.produce) + total(state.seeds), cols = load > 60 ? 4 : load > 30 ? 3 : 2;
    const spot = (i: number): [number, number] => cols === 4 ? [(i % 2 - 0.5) * 0.21, (Math.floor(i / 2) % 2 - 0.5) * 0.2] : [(i % cols - (cols - 1) / 2) * 0.21, ((i * 7) % 3 - 1) * 0.015];
    const layer = (kind: Product | 'seed', n: number, h: number) => {
      const m = carried[kind]; m.count = Math.min(n, 120);
      for (let i = 0; i < m.count; i++) { const [x, z] = spot(i); place(m, i, x, y + Math.floor(i / cols) * h + h / 2, z, SHAPE[kind], kind === 'cucumber' ? 0 : i * 0.9); }
      y += Math.ceil(m.count / cols) * h; m.instanceMatrix.needsUpdate = true;
    };
    layer('seed', total(state.seeds), 0.15);
    layer('tomato', state.produce.tomato, 0.17);
    layer('strawberry', state.produce.strawberry, 0.15);
    layer('cucumber', state.produce.cucumber, 0.12);
    layer('egg', state.produce.egg, 0.14);
    layer('apple', state.produce.apple, 0.18);
    layer('honey', state.produce.honey, 0.18);
    stackHeight = y;
  }
  const stackTop = () => stack.localToWorld(new THREE.Vector3(0, stackHeight + 0.1, 0));
  function shadowDisc(radius: number) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), new THREE.MeshBasicMaterial({ color: '#2f4a22', transparent: true, opacity: 0.2, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.04; return m;
  }
  const farmerShadow = shadowDisc(0.34); scene.add(farmerShadow);

  // Guide: a bobbing arrow over the next goal and a chevron at her feet pointing to it.
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
  const item = (kind: Product | 'seed' | 'coin') => () => {
    if (kind === 'coin') { const m = new THREE.Mesh(coinGeometry, props.material(COLORS.coin)); m.rotation.x = Math.PI / 2; return m; }
    const m = new THREE.Mesh(sphere, props.material(kind === 'seed' ? COLORS.burlap : COLORS[kind])); m.scale.set(...SHAPE[kind]); return m;
  };
  function pulse(at: Point, color: string, size = 0.5) {
    const mesh = new THREE.Mesh(pulseGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, toneMapped: false }));
    mesh.position.set(at.x, 0.06, at.z); mesh.scale.setScalar(size * 0.3); mesh.userData.size = size; mesh.renderOrder = 3; effectRoot.add(mesh); pulses.push({ mesh, age: 0 });
  }
  function burst(at: THREE.Vector3, count = 40) {
    const colors = ['#ffd23f', '#ff7aa2', '#7fe3ff', '#9be15d', '#ffffff'];
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(sphere, props.material(colors[i % colors.length])); mesh.scale.set(0.06, 0.02, 0.09);
      mesh.position.copy(at); effectRoot.add(mesh);
      const a = i * 2.4; confetti.push({ mesh, age: 0, velocity: new THREE.Vector3(Math.cos(a) * (1 + i % 3), 4.5 + (i % 5) * 0.5, Math.sin(a) * (1 + i % 3)) });
    }
  }
  const dust = (x: number, z: number, n: number, spread = 0.25, hex = '#fff6e0') => {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 0.6 + Math.random(); puffs.spawn(x + Math.cos(a) * spread, 0.15, z + Math.sin(a) * spread, Math.cos(a) * s, 0.5 + Math.random() * 0.6, Math.sin(a) * s, 0.5, 0.45 + Math.random() * 0.3, hex); }
  };
  const v3 = (p: Point, y: number) => new THREE.Vector3(p.x, y, p.z);

  // Shoppers: hand-built men, women and children in varied outfits, recycled once they walk off.
  const rand = seeded(7);
  const LOOKS = [
    { height: 1.45, skin: '#8a5a3c', shirt: '#4f7fb8', legs: '#3c4a63', hair: '#2a1d16', style: 'short' },
    { height: 1.4, skin: '#f0c6a0', shirt: '#e27fa0', legs: '#5a4a7a', hair: '#c9873f', style: 'pony', dress: true },
    { height: 1.0, skin: '#c98d62', shirt: '#f2b33d', legs: '#3f6fa8', hair: '#2a1d16', style: 'curly' },
    { height: 1.5, skin: '#e2b48c', shirt: '#3f9a8a', legs: '#4a3a2a', hair: '#d24a3a', style: 'cap' },
    { height: 1.42, skin: '#5c3a26', shirt: '#7d5ba6', legs: '#2f3b4f', hair: '#1b1412', style: 'bun', dress: true },
    { height: 0.95, skin: '#f3d0b0', shirt: '#7fc06a', legs: '#c25b4a', hair: '#f0d27a', style: 'short' },
    { height: 1.38, skin: '#b07850', shirt: '#f08a5d', legs: '#3c4a63', hair: '#3a2a20', style: 'long' },
    { height: 1.48, skin: '#f0c6a0', shirt: '#6d8f4a', legs: '#5a4636', hair: '#9a9a9a', style: 'short' }
  ] as const;
  const shoppers = new Map<number, Shopper>(), spare: Shopper[][] = LOOKS.map(() => []);
  const bubbleTextures: THREE.Texture[] = [];
  function makeShopper(id: number, stall: number): Shopper {
    const look = id % LOOKS.length;
    const shopper = spare[look].pop() ?? (() => {
      const group = props.person({ ...LOOKS[look], seed: id }), joints: THREE.Object3D[] = [];
      group.traverse(o => { if (/^(arm-|leg-)/.test(o.name)) joints.push(o); });
      group.add(shadowDisc(0.26 * LOOKS[look].height / 1.45));
      const bubbleCanvas = document.createElement('canvas'); bubbleCanvas.width = 200; bubbleCanvas.height = 132;
      const context = bubbleCanvas.getContext('2d')!, texture = new THREE.CanvasTexture(bubbleCanvas); texture.colorSpace = THREE.SRGBColorSpace; bubbleTextures.push(texture);
      const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false, toneMapped: false })); bubble.scale.set(0.72, 0.475, 1); bubble.position.y = LOOKS[look].height + 0.5; group.add(bubble);
      const made: Shopper = { id, group, joints, bubble, key: '', leaving: 0, happy: true, frontAt: 0, phase: rand() * 6, walk: 0, squash: 1, draw: (key, paint) => {
        if (key === made.key) return;
        made.key = key; context.clearRect(0, 0, 200, 132);
        context.fillStyle = '#284034'; context.beginPath(); context.roundRect(8, 8, 184, 96, 30); context.fill();
        context.beginPath(); context.moveTo(84, 100); context.lineTo(100, 126); context.lineTo(116, 100); context.fill();
        paint(context); texture.needsUpdate = true;
      } };
      return made;
    })();
    Object.assign(shopper, { id, leaving: 0, key: '', happy: true, frontAt: 0 }); shopper.bubble.visible = false; shopper.group.userData.look = look;
    shopper.group.userData.stall = stall; shopper.group.userData.through = false;
    shopper.group.position.copy(SHOPPER_SPAWN[stall]); shopper.group.visible = true; scene.add(shopper.group); shoppers.set(id, shopper);
    return shopper;
  }
  const grumpy = new Set<number>();
  // A short line of speech, shrunk to fit the bubble.
  function phrase(c: CanvasRenderingContext2D, text: string, width = 168, cx = 100) {
    tileText(c, text, cx, 58, Math.min(40, width / (text.length * 0.5)));
  }
  function updateShoppers(dt: number) {
    const live = new Set(state.customers.map(c => c.id));
    for (const shopper of shoppers.values()) if (!live.has(shopper.id) && !shopper.leaving) {
      shopper.leaving = time; shopper.happy = !grumpy.delete(shopper.id); shopper.bubble.visible = true;
      const words = pick(shopper.happy ? SAY.thanks : SAY.grumpy, shopper.id);
      shopper.draw(`bye:${words}`, c => { phrase(c, words, 124, 86); tileText(c, shopper.happy ? '♥' : '…', 166, 58, 40, shopper.happy ? '#ff8fa8' : '#ffb28a'); });
    }
    const places = STALLS.map(() => 0);
    state.customers.forEach(c => {
      const i = places[c.stall]++;
      const shopper = shoppers.get(c.id) ?? makeShopper(c.id, c.stall), slot = SHOPPER_SLOT(i, c.stall), g = shopper.group.position;
      const goal = c.wait > 0 ? along(SHOPPER_SPAWN[c.stall], SHOPPER_DOOR[c.stall], slot, 1 - c.wait / ARRIVE_SECONDS) : slot;
      walkTo(shopper, goal, 7, dt);
      const front = i === 0 && c.wait === 0 && Math.hypot(g.x - slot.x, g.z - slot.z) < 0.1;
      shopper.bubble.visible = front;
      if (front && !shopper.frontAt) shopper.frontAt = time;
      const since = time - shopper.frontAt, left = c.patience / PATIENCE_SECONDS;
      // Speech first, then the order: a greeting on arrival, and a nudge every few seconds once they're impatient.
      const talk = front && c.got === 0 && (since < 1.5 ? (shopper.id % 2 ? pick(SAY.hello, c.id) : SAY.order[c.want - 1]) : left < 0.35 && since % 3 < 1.2 ? pick(SAY.waiting, c.id, Math.floor(since / 3)) : '');
      if (front && talk) shopper.draw(`say:${talk}`, ctx => phrase(ctx, talk));
      else if (front) {
        // The ring round the order drains as their patience does: green, then amber, then red.
        const step = Math.ceil(left * 12) / 12, colour = step > 0.5 ? '#9be15d' : step > 0.25 ? '#ffc23f' : '#ff6a5a';
        shopper.draw(`${c.crop}:${c.want - c.got}:${step}`, ctx => {
          ctx.lineWidth = 7; ctx.strokeStyle = '#ffffff22'; ctx.beginPath(); ctx.arc(62, 56, 32, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = colour; ctx.beginPath(); ctx.arc(62, 56, 32, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * step); ctx.stroke();
          cropIcon(ctx, c.crop, 62, 58, 20); tileText(ctx, String(c.want - c.got), 140, 60, 58);
        });
      }
      // Getting impatient: a little foot-tap bounce.
      if (front && left < 0.25) g.y = Math.abs(Math.sin(time * 14)) * 0.05;
      if (front || shopper.walk < 0.02) shopper.group.rotation.y = turn(shopper.group.rotation.y, Math.PI, dt * 10);
    });
    for (const shopper of shoppers.values()) if (shopper.leaving) {
      const stall = shopper.group.userData.stall as number, door = SHOPPER_DOOR[stall], exit = SHOPPER_EXIT[stall];
      // Out through the door first, if this stall has one.
      if (door && !shopper.group.userData.through && shopper.group.position.distanceTo(door) < 0.15) shopper.group.userData.through = true;
      walkTo(shopper, door && !shopper.group.userData.through ? door : exit, shopper.happy ? 2.2 : 3, dt);
      shopper.bubble.visible = time - shopper.leaving < 1.2;
      if (shopper.group.position.distanceTo(exit) < 0.1) { shopper.group.removeFromParent(); shoppers.delete(shopper.id); spare[shopper.group.userData.look].push(shopper); }
    }
  }
  // Walk animation shared by shoppers and children: legs and arms swing, a bob, a little squash on each step.
  function animateWalker(w: Walker, moving: boolean, rate: number, dt: number) {
    w.phase += dt * rate;
    const swing = moving ? Math.sin(w.phase) * 0.6 : 0;
    w.joints.forEach(j => { j.rotation.x = swing * (j.name.includes('right') ? 1 : -1) * (j.name.startsWith('arm') ? -0.8 : 1); });
    w.group.position.y = moving ? Math.abs(Math.sin(w.phase)) * 0.05 : 0;
    w.squash += ((moving ? 1 + Math.cos(w.phase * 2) * 0.04 : 1) - w.squash) * Math.min(1, dt * 12);
    w.group.scale.set(1 / Math.sqrt(w.squash), w.squash, 1 / Math.sqrt(w.squash));
  }
  function walkTo(w: Walker, goal: THREE.Vector3, speedLimit: number, dt: number) {
    const p = w.group.position, dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz), step = Math.min(d, speedLimit * dt);
    if (d > 0.001) { p.x += dx / d * step; p.z += dz / d * step; }
    w.walk = dt ? step / dt : 0;
    if (w.walk > 0.2) w.group.rotation.y = turn(w.group.rotation.y, Math.atan2(dx, dz), dt * 12);
    animateWalker(w, w.walk > 0.2, 11, dt);
  }

  // The children: Catcha's two girls run between play spots, sometimes chasing each other.
  const kids: (Walker & { target: Point; rest: number; chase: boolean; jump: number })[] = [];
  function updateKids(dt: number) {
    kids.forEach((kid, i) => {
      const p = kid.group.position;
      if (kid.rest > 0) { kid.rest -= dt; animateWalker(kid, false, 0, dt); kid.walk = 0; }
      else {
        if (kid.chase && i > 0) kid.target = { x: kids[0].group.position.x, z: kids[0].group.position.z };
        const dx = kid.target.x - p.x, dz = kid.target.z - p.z, d = Math.hypot(dx, dz), run = kid.chase ? 3.2 : 2.6, step = Math.min(d, run * dt);
        if (d > 0.05) { p.x += dx / d * step; p.z += dz / d * step; kid.group.rotation.y = turn(kid.group.rotation.y, Math.atan2(dx, dz), dt * 10); }
        animateWalker(kid, d > 0.05, 15, dt);
        if (d > 0.05 && Math.random() < dt * 5) puffs.spawn(p.x, 0.12, p.z, -dx / d * 0.6, 0.5, -dz / d * 0.6, 0.45, 0.35);
        if (d < (kid.chase && i > 0 ? 0.6 : 0.1)) {
          kid.rest = 0.6 + Math.random() * 2.2; kid.chase = Math.random() < 0.35;
          kid.target = PLAYGROUND[Math.floor(Math.random() * PLAYGROUND.length)];
        }
        // Now and then she jumps mid-run, the way the player does.
        if (d > 1 && kid.jump <= 0 && Math.random() < dt * 0.3) { kid.jump = KID_JUMP; kid.squash = 0.75; }
      }
      // Catcha's jump: a quick crouch, half a second in the air, a squash and a puff on landing.
      if (kid.jump > 0) {
        kid.jump = Math.max(0, kid.jump - dt);
        const air = (KID_JUMP - CROUCH - kid.jump) / (KID_JUMP - CROUCH);
        p.y = air > 0 ? Math.sin(air * Math.PI) * 0.45 : 0;
        if (kid.jump === 0) { kid.squash = 0.8; dust(p.x, p.z, 3, 0.15); }
      }
    });
  }

  // Dad: scenery, outside the model. He minds a stall for a while, then (with the orchard open) strolls to the other one.
  let dad!: Walker & { goal: number; next: number; rest: number; tidy: number };
  const dadGoal = new THREE.Vector3();
  function updateDad(dt: number) {
    const p = dad.group.position, near = (i: number) => Math.hypot(DAD_ROUTE[i].x - p.x, DAD_ROUTE[i].z - p.z) < 0.01;
    if (dad.next !== dad.goal && near(dad.next)) dad.next += Math.sign(dad.goal - dad.next);
    if (!near(dad.next)) { walkTo(dad, dadGoal.set(DAD_ROUTE[dad.next].x, 0, DAD_ROUTE[dad.next].z), 1.6, dt); return; }
    if ((dad.rest -= dt) <= 0 && hasOrchard(state)) {
      dad.rest = 15 + Math.random() * 15; dad.goal = dad.goal ? 0 : DAD_ROUTE.length - 1; dad.next += Math.sign(dad.goal - dad.next); return;
    }
    // At the counter's end: glancing about, and every few seconds turning to straighten the produce.
    animateWalker(dad, false, 0, dt);
    if ((dad.tidy -= dt) < -1.2) dad.tidy = 3 + Math.random() * 5;
    const side = dad.goal ? 1 : -1, reach = dad.tidy < 0 ? Math.sin(-dad.tidy / 1.2 * Math.PI) : 0;
    dad.group.rotation.y = turn(dad.group.rotation.y, dad.tidy < 0 ? side * Math.PI / 2 : side * 0.45 + Math.sin(time * 0.6) * 0.25, dt * 5);
    dad.joints.forEach(j => { if (j.name.startsWith('arm')) j.rotation.x = -reach * (j.name.includes('right') ? 1.1 + Math.sin(time * 14) * 0.15 : 0.35); });
  }

  // Birds glide high above, soft and blurred like something close to the lens, trailing faint shadows.
  const birdFrames = [0, 1].map(frame => props.canvasTexture(128, 64, c => {
    c.filter = 'blur(3px)'; c.fillStyle = '#2b3a33';
    const up = frame ? -14 : 12;
    c.beginPath(); c.moveTo(14, 32 + up); c.quadraticCurveTo(40, 28, 64, 36); c.quadraticCurveTo(88, 28, 114, 32 + up); c.quadraticCurveTo(88, 40, 64, 44); c.quadraticCurveTo(40, 40, 14, 32 + up); c.fill();
  }));
  const sunOffset = new THREE.Vector3(0, 12, 7), screenDown = new THREE.Vector3(1, 0, 1).normalize();
  // The shadow is the bird itself laid flat on the ground, wings across the line of flight.
  const birdShadow = new THREE.PlaneGeometry(0.7, 0.35).rotateX(-Math.PI / 2).rotateY(Math.PI / 4);
  const birds: { sprite: THREE.Sprite; shade: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; velocity: THREE.Vector3; flap: number }[] = [];
  let nextFlock = 6;
  function updateBirds(dt: number, night: number) {
    nextFlock -= dt;
    if (nextFlock <= 0 && night < 0.6) {
      nextFlock = 14 + Math.random() * 18;
      const dir = new THREE.Vector3(1, 0, -1).normalize().multiplyScalar(Math.random() < 0.5 ? 1 : -1), side = new THREE.Vector3(-dir.z, 0, dir.x);
      // Flocks cross the top of the screen, above the player, with their shadows over the fields there.
      const start = focus.clone().addScaledVector(dir, -14).addScaledVector(screenDown, -(2.2 + Math.random() * 2));
      for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: birdFrames[0], transparent: true, opacity: 0.8, depthWrite: false, depthTest: false }));
        sprite.scale.set(0.8, 0.4, 1); sprite.renderOrder = 6;
        sprite.position.copy(start).addScaledVector(dir, -i * 0.8).addScaledVector(side, (i % 2 ? 1 : -1) * i * 0.5).setY(3.2 + Math.random() * 0.6);
        const shade = new THREE.Mesh(birdShadow, new THREE.MeshBasicMaterial({ map: birdFrames[0], transparent: true, opacity: 0.22, depthWrite: false }));
        effectRoot.add(sprite, shade);
        birds.push({ sprite, shade, velocity: dir.clone().multiplyScalar(2 + Math.random() * 0.3), flap: Math.random() * 6 });
      }
    }
    for (let i = birds.length - 1; i >= 0; i--) {
      const b = birds[i]; b.sprite.position.addScaledVector(b.velocity, dt); b.flap += dt * 7;
      // The shadow falls straight away from the sun, so it sits under the bird on screen.
      const lift = b.sprite.position.y / 12;
      b.sprite.material.map = b.shade.material.map = birdFrames[Math.sin(b.flap) > 0 ? 0 : 1];
      b.shade.position.set(b.sprite.position.x - sunOffset.x * lift, 0.06, b.sprite.position.z - sunOffset.z * lift);
      if (b.sprite.position.distanceTo(focus) > 24) { b.sprite.removeFromParent(); b.shade.removeFromParent(); b.sprite.material.dispose(); b.shade.material.dispose(); birds.splice(i, 1); }
    }
  }

  // Night: lamp pools on the ground and fireflies over the greenery.
  const poolTexture = props.canvasTexture(64, 64, c => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, '#ffd890'); g.addColorStop(1, '#ffd89000'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
  const poolMaterial = new THREE.MeshBasicMaterial({ map: poolTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 });
  const poolGeometry = new THREE.PlaneGeometry(3, 3).rotateX(-Math.PI / 2);
  for (const at of [...LAMPS, { x: SPOTS.house.x + 1.5, z: SPOTS.house.z }]) {
    const pool = new THREE.Mesh(poolGeometry, poolMaterial); pool.position.set(at.x, 0.05, at.z); pool.renderOrder = 2; scene.add(pool);
  }
  const fireflyMaterial = new THREE.SpriteMaterial({ map: poolTexture, color: '#e8ff9a', blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 });
  // Fireflies live all over the farm, mostly by hedges, trees and fields, and each glows on its own slow rhythm,
  // so only a few show at a time instead of a swarm on screen.
  const fireflies = Array.from({ length: 36 }, (_, i) => {
    const s = new THREE.Sprite(fireflyMaterial); s.scale.setScalar(0);
    s.userData.home = new THREE.Vector3(-8 + rand() * 18, 0.4 + rand() * 0.9, -7 + rand() * 19); s.userData.phase = rand() * 20; s.userData.rate = 0.25 + rand() * 0.35;
    scene.add(s); return s;
  });

  // Now and then a light shower drifts over: streaks, splashes and a slightly greyer light.
  const RAIN = 150, SHOWER = 22;
  const rain = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, 0.5, 0.012), new THREE.MeshBasicMaterial({ color: '#eef6ff', transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }), RAIN);
  rain.frustumCulled = false; rain.count = 0; scene.add(rain);
  const drops = Array.from({ length: RAIN }, () => new THREE.Vector3((rand() - 0.5) * 16, rand() * 9, (rand() - 0.5) * 16));
  // ?rain starts a shower straight away, for checking it.
  let raining = 0, nextRain = new URLSearchParams(location.search).has('rain') ? 1 : 90 + rand() * 90;
  function updateRain(dt: number) {
    nextRain -= dt;
    if (nextRain <= 0) { raining = SHOWER; nextRain = 140 + Math.random() * 120; }
    raining = Math.max(0, raining - dt);
    const strength = raining > 0 ? Math.min(1, raining / 3, (SHOWER - raining) / 3) : 0;
    rain.count = raining > 0 ? Math.round(RAIN * Math.max(0.15, strength)) : 0;
    for (let i = 0; i < rain.count; i++) {
      const d = drops[i]; d.y -= dt * 14;
      if (d.y < 0) { d.y += 9; if (Math.random() < 0.25) puffs.spawn(focus.x + d.x, 0.08, focus.z + d.z, 0, 0.3, 0, 0.3, 0.18, '#e8f4ff'); }
      rain.setMatrixAt(i, matrix.compose(position.set(focus.x + d.x - d.y * 0.15, d.y, focus.z + d.z), quaternion.setFromEuler(euler.set(0, 0, 0.15)), scale.set(1, 1, 1)));
    }
    rain.instanceMatrix.needsUpdate = true;
    return strength;
  }


  // The coop yard: a paddock past the hedge with the coop, nest boxes and hens pottering about.
  const yard = new THREE.Group(); scene.add(yard);
  const eggs = instanced(sphere, COLORS.egg, NESTS.length * 4, scene);
  const hens: { group: THREE.Group; target: THREE.Vector3; rest: number; phase: number }[] = [];
  let yardBuilt = false, eggKey = '';
  function addYard() {
    if (yardBuilt || !hasCoop(state)) return;
    yardBuilt = true;
    const [x0, x1, z0, z1] = [7.0, 10.95, -4.55, 1.5];
    props.fence(yard, x0, z0, x1, z0); props.fence(yard, x1, z0, x1, z1); props.fence(yard, x0, z1, x1, z1);
    props.fence(yard, x0, z0, x0, -0.85); props.fence(yard, x0, 0.85, x0, z1);
    props.rbox(yard, '#e6d397', 9.4, 0.012, -2.4, 3.3, 0.02, 1.2, 0.02);
    props.surface(yard, 'paver', 8.15, 0.02, 0, 2.3, 1.2, 2);
    const coop = props.coop(); coop.position.set(SPOTS.coop.x, 0, SPOTS.coop.z); yard.add(coop);
    for (const nest of NESTS) { const box = props.nestBox(); box.position.set(nest.x, 0, nest.z); yard.add(box); }
    for (let i = 0; i < 5; i++) {
      const group = props.hen(i); group.position.set(8 + i * 0.6, 0, -0.8 - (i % 2)); group.add(shadowDisc(0.16)); yard.add(group);
      hens.push({ group, target: group.position.clone(), rest: rand() * 2, phase: rand() * 6 });
    }
  }
  function updateYard(dt: number) {
    if (!yardBuilt) return;
    const key = state.nests.join(':');
    if (key !== eggKey) {
      eggKey = key; let n = 0;
      NESTS.forEach((nest, i) => { for (let k = 0; k < state.nests[i]; k++) place(eggs, n++, nest.x + (k % 2 - 0.5) * 0.14, 0.3 + Math.floor(k / 2) * 0.06, nest.z + (Math.floor(k / 2) - 0.5) * 0.1, SHAPE.egg, k); });
      eggs.count = n; eggs.instanceMatrix.needsUpdate = true;
    }
    for (const hen of hens) {
      const p = hen.group.position, body = hen.group.userData.body as THREE.Group;
      if (hen.rest > 0) { hen.rest -= dt; body.rotation.x = Math.max(0, Math.sin(time * 9 + hen.phase)) * 0.5; continue; }
      const d = p.distanceTo(hen.target);
      if (d < 0.05) { hen.rest = 0.8 + Math.random() * 2.5; hen.target.set(7.5 + Math.random() * 3, 0, -1.6 + Math.random() * 2.8); continue; }
      p.addScaledVector(hen.target.clone().sub(p).normalize(), Math.min(d, dt * 0.9));
      hen.group.rotation.y = turn(hen.group.rotation.y, Math.atan2(hen.target.x - p.x, hen.target.z - p.z), dt * 8);
      body.rotation.x = 0; p.y = Math.abs(Math.sin(time * 16 + hen.phase)) * 0.03;
    }
  }

  // The board by the farmhouse door opens the shop sheet once the first field is bought.
  const boardRoot = new THREE.Group(); scene.add(boardRoot);
  const sign = props.signboard(); sign.position.set(SPOTS.board.x + 0.35, 0, SPOTS.board.z - 0.85); sign.rotation.y = Math.PI / 4; boardRoot.add(sign);
  groundTile(props, boardRoot, SPOTS.board.x, SPOTS.board.z, 1.2, 1.0, (c, w, h) => { tile(c, w, h, { fill: '#fff3c855', dash: [2.2, 1.4] }); coinIcon(c, w * 0.24, h * 0.52, h * 0.15); tileText(c, 'SHOP', w * 0.6, h * 0.53, h * 0.34); });

  // Decorations appear where they belong when bought; the windmill turns and the fountain splashes.
  const decorations = new Map<DecorId, { group: THREE.Group; born: number }>();
  const FACING: Record<DecorId, number> = { arch: 0, scarecrow: Math.PI / 2, benches: Math.PI / 4, fountain: 0, windmill: Math.PI / 4 };
  function syncDecor(animate: boolean) {
    for (const id of state.decor) if (!decorations.has(id)) {
      const group = props.decoration(id); group.position.set(DECOR[id].at.x, 0, DECOR[id].at.z); group.rotation.y = FACING[id]; scene.add(group);
      decorations.set(id, { group, born: animate ? time : -10 });
    }
  }

  // Farmhands in straw hats, carrying a crate that fills as they pick.
  const HAND_LOOKS = [{ height: 1.45, skin: '#8a5a3c', shirt: '#5d8f4a', legs: '#3f5f8a', hair: '#2a1d16', style: 'hat' as const, seed: 3 },
    { height: 1.4, skin: '#f0c6a0', shirt: '#c9704a', legs: '#3f5f8a', hair: '#7a4a2a', style: 'hat' as const, seed: 4 }];
  const farmhands: (Walker & { items: THREE.InstancedMesh; last: THREE.Vector3; key: number })[] = [];
  function syncHelpers() {
    while (farmhands.length < state.helpers.length) {
      const group = props.person(HAND_LOOKS[farmhands.length % 2]), joints: THREE.Object3D[] = [];
      group.traverse(o => { if (/^(arm-|leg-)/.test(o.name)) joints.push(o); });
      const box = props.crate(group, 0, 0.62, 0.3, 0.42), items = instanced(sphere, COLORS.tomato, 9, box);
      group.add(shadowDisc(0.26)); const h = state.helpers[farmhands.length]; group.position.set(h.x, 0, h.z); scene.add(group);
      farmhands.push({ group, joints, phase: 0, walk: 0, squash: 1, items, last: group.position.clone(), key: -1 });
      dust(h.x, h.z, 10, 0.5);
    }
  }
  function updateHelpers(dt: number) {
    farmhands.forEach((hand, i) => {
      const h = state.helpers[i], g = hand.group.position, dx = h.x - g.x, dz = h.z - g.z, moving = Math.hypot(dx, dz) > 0.002;
      g.x = h.x; g.z = h.z;
      if (moving) hand.group.rotation.y = turn(hand.group.rotation.y, Math.atan2(dx, dz), dt * 12);
      animateWalker(hand, moving, 10, dt);
      hand.joints.forEach(j => { if (j.name.startsWith('arm')) j.rotation.x = -1.1; });
      const load = total(h.carry);
      if (load !== hand.key) {
        hand.key = load; hand.items.count = Math.min(9, load);
        const crop = PRODUCTS.find(c => h.carry[c] > 0) ?? 'tomato';
        hand.items.material = props.material(COLORS[crop]);
        for (let k = 0; k < hand.items.count; k++) place(hand.items, k, (k % 3 - 1) * 0.11, 0.3 + Math.floor(k / 3) * 0.07, (Math.floor(k / 3) % 2 - 0.5) * 0.08, SHAPE[crop], k);
        hand.items.instanceMatrix.needsUpdate = true;
      }
    });
  }
  // Sprinklers: one head per upgrade level on each field's corners, spinning and misting in turns.
  const CORNERS = [[1.35, 1.35], [-1.35, 1.35], [1.35, -1.35]];
  const sprinklers: { arm: THREE.Group; x: number; z: number; phase: number }[] = [];
  const sprinklerRoot = new THREE.Group(); scene.add(sprinklerRoot);
  let sprinklerKey = '';
  function updateSprinklers(dt: number) {
    const key = `${state.plots.length}:${state.upgrades.sprinkler}`;
    if (key !== sprinklerKey) {
      sprinklerKey = key; sprinklerRoot.clear(); sprinklers.length = 0;
      state.plots.forEach((plot, p) => CORNERS.slice(0, state.upgrades.sprinkler).forEach(([dx, dz], i) => {
        const f = FIELDS[plot.id], head = props.sprinkler(), x = f.x + dx * Math.sign(-f.x || 1), z = f.z + dz * Math.sign(-f.z || 1);
        head.position.set(x, 0.1, z); sprinklerRoot.add(head);
        sprinklers.push({ arm: head.userData.arm, x, z, phase: p * 2.3 + i * 1.1 });
      }));
    }
    for (const s of sprinklers) {
      const on = (time + s.phase) % 9 < 5;
      if (!on) continue;
      s.arm.rotation.y += dt * 5;
      for (let n = 0; n < 2 && Math.random() < dt * 40; n++) {
        const a = s.arm.rotation.y + n * Math.PI, v = 1.3 + Math.random() * 0.6;
        puffs.spawn(s.x + Math.cos(a) * 0.15, 0.55, s.z - Math.sin(a) * 0.15, Math.cos(a) * v, 0.6, -Math.sin(a) * v, 0.7, 0.32, '#bfe6ff');
      }
    }
  }
  // The stalls are rebuilt as the Fancy stall level rises; the orchard stand appears with the orchard.
  const stalls: (THREE.Group | null)[] = [null, null];
  let stallKey = '', stallBorn = -10;
  function syncStall(animate: boolean) {
    const key = `${state.upgrades.stall}:${hasOrchard(state)}`;
    if (key === stallKey) return;
    stallKey = key; stallBorn = animate ? time : -10;
    STALLS.forEach((spot, i) => {
      stalls[i]?.removeFromParent();
      stalls[i]?.traverse(o => { if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial) { o.material.map?.dispose(); o.material.dispose(); } });
      stalls[i] = null;
      if (i === 1 && !hasOrchard(state)) return;
      const stall = props.market(state.upgrades.stall, i ? '#5f9a52' : COLORS.tomato); stall.position.set(spot.counter.x, 0, spot.counter.z); scene.add(stall);
      stalls[i] = stall;
    });
  }
  syncStall(false);

  // The orchard meadow: a fence, the stand's SELL tile and coin pad. The trees themselves are a plot.
  const orchardRoot = new THREE.Group(); scene.add(orchardRoot);
  let orchardBuilt = false;
  function addOrchard() {
    if (orchardBuilt || !hasOrchard(state)) return;
    orchardBuilt = true;
    const [x0, x1, z0, z1] = [-8.65, 0.95, 6.75, 13.05];
    // The south fence has a gate where the road comes in from the south.
    props.fence(orchardRoot, x0, z1, -0.85, z1); props.fence(orchardRoot, x0, z0 + 0.1, x0, z1); props.fence(orchardRoot, x1, 9.4, x1, z1 - 0.4);
    for (const x of [-0.85, 0.85]) props.rbox(orchardRoot, '#8a5a35', x, 0.5, z1, 0.18, 1.0, 0.18, 0.04);
    props.fence(orchardRoot, x0, z0 + 0.1, -6.65, z0 + 0.1);
    // A mown meadow under the trees and a gravel strip for the apiary, so each part reads at a glance.
    props.rbox(orchardRoot, '#93c858', -5.5, 0.008, 9.25, 5.6, 0.01, 3.9, 0.02);
    props.rbox(orchardRoot, '#e6d397', -5.3, 0.01, 12.0, 4.4, 0.01, 1.2, 0.02);
    groundTile(props, orchardRoot, SPOTS.stand.x, SPOTS.stand.z, 1.2, 0.8, (c, w, h) => { tile(c, w, h, { dash: [2.2, 1.4] }); tileText(c, 'SELL', w / 2, h * 0.53, h * 0.44); });
    groundTile(props, orchardRoot, SPOTS.standCash.x, SPOTS.standCash.z, 1.0, 0.8, (c, w, h) => tile(c, w, h, { fill: '#ffffff26', stroke: '#ffffff99', radius: 0.2 }));
    for (const [x, z] of [[-8.0, 7.4], [-0.4, 12.3], [-8.0, 12.4], [-2.4, 12.4], [-0.6, 10.6]]) { const b = props.bush(0.38, x * 3 + z); b.position.set(x, 0, z); orchardRoot.add(b); }
  }
  // Beehives with jars of honey in front and a few bees looping round each.
  const hiveRoot = new THREE.Group(); scene.add(hiveRoot);
  const jars = instanced(sphere, COLORS.honey, HIVES.length * 3, scene), bees = instanced(sphere, '#f5c043', HIVES.length * 4, scene);
  let hivesBuilt = false, jarKey = '';
  function addHives() {
    if (hivesBuilt || !hasHives(state)) return;
    hivesBuilt = true;
    for (const h of HIVES) { const hive = props.beehive(); hive.position.set(h.x, 0, h.z); hive.rotation.y = Math.PI / 4; hive.scale.setScalar(1.3); hive.add(shadowDisc(0.35)); hiveRoot.add(hive); }
  }
  function updateHives() {
    if (!hivesBuilt) return;
    const key = state.hives.join(':');
    if (key !== jarKey) {
      jarKey = key; let n = 0;
      HIVES.forEach((h, i) => { for (let k = 0; k < state.hives[i]; k++) place(jars, n++, h.x + (k - 1) * 0.2 + 0.3, 0.12, h.z + 0.3 + (k - 1) * 0.2, SHAPE.honey, 0); });
      jars.count = n; jars.instanceMatrix.needsUpdate = true;
    }
    bees.count = HIVES.length * 4;
    HIVES.forEach((h, i) => { for (let k = 0; k < 4; k++) { const a = time * (2 + k * 0.4) + k * 1.6 + i; place(bees, i * 4 + k, h.x + Math.cos(a) * 0.55, 1.0 + Math.sin(a * 2.3) * 0.25, h.z + Math.sin(a) * 0.55, [0.05, 0.04, 0.06]); } });
    bees.instanceMatrix.needsUpdate = true;
  }
  addOrchard(); addHives();
  addYard(); syncDecor(false);
  let disposed = false, paused = false, loaded = false, frame = 0, previous = performance.now(), saveClock = 0, hudClock = 0, actionTime = 0, faceCell: Point | null = null;
  // Catcha's jump, same timing (a 0.09s crouch, half a second in the air), scaled down to the farmer.
  const CROUCH = 0.09, GRAVITY = 30, JUMP_V = 7.5, HOP_TIME = 0.32, KID_JUMP = CROUCH + 0.5;
  let jumpT = -1, airborne = false, vy = 0, feetY = 0, landT = 0, hopT = 0, jumps = 0, wasDashing = false, dashTime = 0;
  let squash = 1, lean = 0, wasMoving = false, stepPhase = 0, dustClock = 0, dayClock = DAY_SECONDS * (Number(new URLSearchParams(location.search).get('time')) || 0.06);
  // ?time=0.7 starts at that point of the day (0 morning … 0.72 night), like Catcha's ?season=.
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
  const ready = Promise.all([load(FARM_ASSETS.farmer), load(FARM_ASSETS.dad), load(FARM_ASSETS.olderGirl), load(FARM_ASSETS.youngerGirl)]).then(([mother, father, ...girls]) => {
    if (disposed) return;
    const model = fit(mother.scene, 1.65); body.add(model);
    model.traverse(o => { if (!(o instanceof THREE.Mesh) && /^(arm-|leg-)/.test(o.name)) joints.push(o); });
    const dadGroup = new THREE.Group(), dadJoints: THREE.Object3D[] = [];
    dadGroup.add(fit(father.scene, 1.7), shadowDisc(0.32)); dadGroup.position.set(DAD_ROUTE[0].x, 0, DAD_ROUTE[0].z); scene.add(dadGroup);
    dadGroup.traverse(o => { if (!(o instanceof THREE.Mesh) && /^(arm-|leg-)/.test(o.name)) dadJoints.push(o); });
    dad = { group: dadGroup, joints: dadJoints, phase: 0, walk: 0, squash: 1, goal: 0, next: 0, rest: 15 + rand() * 15, tidy: 2 };
    girls.forEach((girl, i) => {
      const group = new THREE.Group(), kid = fit(girl.scene, i ? 0.8 : 1.15), kidJoints: THREE.Object3D[] = [];
      kid.traverse(o => { if (!(o instanceof THREE.Mesh) && /^(arm-|leg-)/.test(o.name)) kidJoints.push(o); });
      group.add(kid, shadowDisc(0.24)); group.position.set(PLAYGROUND[i + 1].x, 0, PLAYGROUND[i + 1].z); scene.add(group);
      kids.push({ group, joints: kidJoints, phase: i, walk: 0, squash: 1, target: PLAYGROUND[i + 4], rest: i, chase: false, jump: 0 });
    });
    updateStack(); updateShelfAndCash(); syncHelpers();
    camera.position.copy(focus).addScaledVector(VIEW, 30); camera.lookAt(focus);
  // Keep the loading card up until shaders are ready, so the farm appears in one piece.
  }).then(() => disposed ? undefined : renderer.compileAsync(scene, camera)).then(() => {
    if (disposed) return;
    loaded = true; previous = performance.now(); callbacks.update();
  });

  function feedback(event: FarmEvent) {
    audio.play(event);
    const at = v3(event.at, 0.7);
    if (event.type === 'seed') { fly(item('seed'), at, stackTop, Math.min(6, event.amount), { gap: 0.05 }); squash = 0.85; }
    if (event.type === 'plant') { fly(item('seed'), stackTop(), () => v3(event.at, 0.2), 1, { duration: 0.3, lift: 0.3 }); pulse(event.at, '#f0c999', 0.45); dust(event.at.x, event.at.z, 3, 0.15, '#d9b48a'); }
    if (event.type === 'harvest') { fly(item(event.crop!), v3(event.at, 0.4), stackTop, event.amount, { gap: 0.07 }); pulse(event.at, '#c8f07a', 0.5); dust(event.at.x, event.at.z, 4, 0.2, '#e6f5c0'); squash = 0.84; }
    if (event.type === 'plant' || event.type === 'harvest') { actionTime = 0.32; faceCell = event.at; }
    if (event.type === 'delivery') {
      const stall = STALLS[event.stall ?? 0];
      fly(item(stall.accepts[0]), stackTop(), () => v3(stall.counter, 1.15), Math.min(8, event.amount), { gap: 0.05, lift: 0.5 });
      pulse(stall.sell, '#ffffff', 0.6); squash = 1.15; hopT = HOP_TIME; // Catcha's happy hop on every delivery
    }
    if (event.type === 'sale') {
      const s = event.stall ?? 0;
      fly(item(event.crop!), v3(STALLS[s].counter, 1.15), () => SHOPPER_SLOT(0, s).setY(1.0), 1, { duration: 0.3, lift: 0.3 });
      fly(item('coin'), SHOPPER_SLOT(0, s).setY(1.0), () => v3(STALLS[s].cash, 0.3), 1, { delay: 0.25, duration: 0.4, lift: 0.5 });
    }
    if (event.type === 'unhappy') {
      const s = SHOPPER_SLOT(0, event.stall ?? 0); dust(s.x, s.z, 6, 0.3, '#9aa0a0');
      for (const id of shoppers.keys()) if (!state.customers.some(c => c.id === id) && !shoppers.get(id)!.leaving) grumpy.add(id);
    }
    if (event.type === 'cash') { fly(item('coin'), v3(event.at, 0.2), () => farmer.position.clone().setY(1.0), Math.min(10, Math.ceil(event.amount / 2)), { gap: 0.035, duration: 0.35 }); pulse(event.at, '#ffe07a', 0.7); }
    if (event.type === 'purchase') { addPlots(true); updateOffer(); callbacks.save(); pulse(event.at, '#ffe07a', 2.2); burst(v3(event.at, 0.3)); dust(event.at.x, event.at.z, 14, 1.2); }
    if (event.type === 'honey') { fly(item('honey'), v3(event.at, 0.8), stackTop, event.amount, { gap: 0.08 }); pulse(event.at, '#ffd27a', 0.5); squash = 0.86; }
    if (event.type === 'egg') { fly(item('egg'), v3(event.at, 0.35), stackTop, event.amount, { gap: 0.06 }); pulse(event.at, '#fff2c2', 0.45); squash = 0.86; }
    if (event.type === 'helper') dust(event.at.x, event.at.z, 2, 0.15, '#e6f5c0');
    if (event.type === 'upgrade') { burst(v3(event.at, 0.6), 30); pulse(event.at, '#ffe07a', 1.4); dust(event.at.x, event.at.z, 10, 0.6); }
    if (event.type === 'purchase') {
      addYard(); addOrchard(); addHives(); syncStall(true);
      const kind = PURCHASES[state.purchased - 1]?.kind, show = { coop: { x: 8.8, z: -1.6 }, orchard: { x: -3.6, z: 9.4 }, hives: HIVES[1], field: event.at, basket: null }[kind ?? 'basket'];
      if (show) tour = { ...show, until: time + 3.2 };
    }
    if (event.type === 'goal') { burst(farmer.position.clone().setY(1.6), 30); pulse(state.player, '#ffe07a', 1.2); squash = 1.25; callbacks.save(); }
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
    const from = { ...state.player };
    const sprinting = screen.sprint && canSprint(state);
    const events = stepFarm(state, dt, { ...move, sprint: screen.sprint }); events.forEach(feedback);
    const moving = dt > 0 && distance(from, state.player) / dt > 0.3, carrying = total(state.produce) + total(state.seeds) > 0;
    // Running is quick and bouncy; a full basket slows her to a heavy walk.
    const pace = (speed(state, sprinting) / RUN_SPEED - 0.55) / 0.45;
    // Catcha's sprint: a burst of dust and a whoosh as it starts, a skid when it ends.
    const dashing = sprinting && moving;
    if (dashing !== wasDashing) {
      // A burst behind her as it starts; a skid (dust thrown forward) only after a real sprint.
      if (dashing || dashTime > 0.3) {
        const bx = -Math.sin(farmer.rotation.y), bz = -Math.cos(farmer.rotation.y), k = dashing ? 1 : -1;
        for (let i = 0; i < 5; i++) puffs.spawn(state.player.x + bx * 0.3, 0.15, state.player.z + bz * 0.3, k * bx * (1 + Math.random()) + Math.random() - 0.5, 0.5 + Math.random() * 0.5, k * bz * (1 + Math.random()) + Math.random() - 0.5, 0.55, 0.6);
        audio.cue(dashing ? 'dash' : 'skid'); if (!dashing) squash = 0.82;
      }
      wasDashing = dashing; dashTime = 0;
    }
    dashTime += dt;
    stepPhase += dt * (moving ? 8 + 6 * pace : 0);
    if (input.jump() && jumpT < 0 && !airborne) jumpT = 0;
    if (jumpT >= 0 && (jumpT += dt) >= CROUCH) {
      jumpT = -1; airborne = true; vy = JUMP_V; host.dataset.jumps = String(++jumps); audio.cue('jump'); dust(state.player.x, state.player.z, 3, 0.15);
    }
    if (airborne) {
      vy -= GRAVITY * dt; feetY += vy * dt;
      if (feetY <= 0 && vy <= 0) { feetY = vy = 0; airborne = false; landT = 0.16; audio.cue('land'); dust(state.player.x, state.player.z, 5, 0.25); }
    }
    landT = Math.max(0, landT - dt); hopT = Math.max(0, hopT - dt);
    // 0 at take-off, 1 coming down.
    const crouching = jumpT >= 0, air = airborne ? THREE.MathUtils.clamp(0.5 - vy / (2 * JUMP_V), 0, 1) : -1, grounded = !crouching && air < 0;
    const bob = moving && grounded ? Math.abs(Math.sin(stepPhase)) * (0.02 + 0.05 * pace) : 0;
    farmer.position.set(state.player.x, feetY + bob + (hopT > 0 ? Math.sin((1 - hopT / HOP_TIME) * Math.PI) * 0.35 : 0), state.player.z);
    const facing = moving ? Math.atan2(move.x, move.z) : faceCell && actionTime > 0 ? Math.atan2(faceCell.x - state.player.x, faceCell.z - state.player.z) : null;
    if (facing !== null) farmer.rotation.y = turn(farmer.rotation.y, facing, dt * 14);
    // Catcha's body language: squash on starting, stopping and picking up; lean into a run, sit back under load.
    if (moving !== wasMoving) { squash = moving ? 0.86 : 0.9; if (!moving) dust(state.player.x, state.player.z, 2, 0.2); wasMoving = moving; }
    // Jumping as in Catcha: crouch forward, stretch on take-off, lean back to land, squash on touch-down.
    const squashTo = crouching ? 0.72 : air >= 0 ? (air < 0.35 ? 1.18 : 1.04) : landT > 0 ? 0.78 : moving ? 1 + Math.cos(stepPhase * 2) * 0.035 : 1;
    const leanTo = crouching ? 0.3 : air >= 0 ? (air < 0.6 ? 0.2 : -0.1) : moving ? 0.16 * pace - 0.06 * (1 - pace) : 0;
    const settle = Math.min(1, dt * (grounded && landT <= 0 ? 10 : 16));
    squash += (squashTo - squash) * settle; lean += (leanTo - lean) * settle;
    body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash)); body.rotation.x = lean;
    if (moving && grounded) {
      dustClock += dt * (5 + 8 * pace);
      while (dustClock >= 1) {
        dustClock -= 1;
        const bx = -Math.sin(farmer.rotation.y), bz = -Math.cos(farmer.rotation.y);
        puffs.spawn(state.player.x + bx * 0.3 + (Math.random() - 0.5) * 0.25, 0.15, state.player.z + bz * 0.3 + (Math.random() - 0.5) * 0.25,
          bx * (0.6 + Math.random()), 0.6 + Math.random() * 0.5, bz * (0.6 + Math.random()), 0.5, 0.45 + 0.35 * pace);
      }
    } else dustClock = 0;
    farmerShadow.position.set(state.player.x, 0.04, state.player.z); farmerShadow.scale.setScalar(1 - Math.min(0.4, farmer.position.y * 0.4));
    actionTime = Math.max(0, actionTime - dt);
    for (const joint of joints) {
      const arm = joint.name.startsWith('arm'), side = joint.name.includes('right') ? 1 : -1;
      const swing = moving && grounded ? Math.sin(stepPhase) * (0.3 + 0.35 * pace) * side : 0;
      // In a jump the arms swing back, then up (unless they hold the basket); the legs split like a leap, then reach down.
      joint.rotation.x = arm
        ? (actionTime > 0 ? -0.5 - 0.6 * Math.sin(actionTime / 0.32 * Math.PI) : carrying ? -1.15 : crouching ? 0.9 : air >= 0 ? -2.2 + air * 1.5 + (side > 0 ? 0.25 : 0) : -swing * 0.7)
        : crouching ? 0 : air >= 0 ? (air < 0.7 ? (side > 0 ? -0.75 : 0.55) : -0.3) : swing;
    }
    updateStack();
    // The pile leans back a little as she walks and settles when she stops.
    stack.rotation.x += ((moving ? -0.09 : 0) + Math.sin(stepPhase) * (moving ? 0.02 : 0) - stack.rotation.x) * Math.min(1, dt * 8);
    updateShelfAndCash();
    for (const plant of plants.values()) {
      const { cell, group, leaves, fruit, crop } = plant;
      if (cell.stage !== plant.stage) { plant.stage = cell.stage; plant.changed = time; }
      const since = time - plant.changed;
      group.visible = cell.stage !== 'empty';
      const growth = plant.trees ? 1 : cell.stage === 'ripe' ? 1 : 0.25 + cell.age / GROW[crop] * 0.75;
      if (plant.trees) group.visible = true;
      leaves.scale.setScalar(growth * (!plant.trees && cell.stage === 'growing' && since < 0.4 ? pop(since / 0.4) : 1));
      fruit.visible = cell.stage === 'ripe'; fruit.scale.setScalar(cell.stage === 'ripe' ? pop(Math.min(1, since / 0.45)) : 0.01);
      group.rotation.z = Math.sin(time * 1.8 + cell.x * 3) * (cell.stage === 'ripe' ? 0.05 : 0.025) * (plant.trees ? 0.25 : 1);
    }
    for (const bed of beds) bed.group.scale.setScalar(bed.born < 0 ? 1 : pop(Math.min(1, (time - bed.born) / 0.6)));
    updateOffer();
    const next = nextPurchase(state);
    if (next) {
      const progress = state.purchaseProgress, r = ring.userData.radius as number;
      if (Math.abs(progress - ringShown) > 0.01) {
        ringShown = progress; ring.geometry.dispose();
        ring.geometry = progress > 0 ? new THREE.RingGeometry(r, r + 0.15, 64, 1, Math.PI / 2, -progress * Math.PI * 2) : new THREE.BufferGeometry();
      }
      offer.position.y = state.wallet >= next.price ? Math.abs(Math.sin(time * 3)) * 0.015 : 0;
      // Paying: coins stream from the wallet into the land and its price counts down to nothing.
      const left = Math.ceil(next.price * (1 - progress));
      if (priceTile && left !== priceShown) {
        priceShown = left;
        const texture = (priceTile.material as THREE.MeshBasicMaterial).map as THREE.CanvasTexture, canvas = texture.image as HTMLCanvasElement;
        drawPrice(left)(canvas.getContext('2d')!, canvas.width, canvas.height); texture.needsUpdate = true;
      }
      if (progress > 0 && (payClock -= dt) <= 0) {
        payClock = 0.075;
        const point = new THREE.Vector3(next.at.x, 0.1, next.at.z).project(camera);
        callbacks.pay({ x: (point.x + 1) * host.clientWidth / 2, y: (1 - point.y) * host.clientHeight / 2 });
        audio.cue('pay');
      }
      if (progress <= 0) payClock = 0;
    }
    updateShoppers(dt); updateKids(dt); updateDad(dt); updateYard(dt); updateHelpers(dt); updateSprinklers(dt);
    boardRoot.visible = boardOpen(state);
    if (stallBorn >= 0) for (const st of stalls) st?.scale.setScalar(pop(Math.min(1, (time - stallBorn) / 0.6)));
    updateHives();
    for (const [id, d] of decorations) {
      if (d.born >= 0) d.group.scale.setScalar(pop(Math.min(1, (time - d.born) / 0.6)));
      if (id === 'windmill') (d.group.userData.sails as THREE.Group).rotation.z += dt * 0.7;
      if (id === 'fountain' && Math.random() < dt * 10) puffs.spawn(DECOR.fountain.at.x + (Math.random() - 0.5) * 0.2, 1.0, DECOR.fountain.at.z + (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 1.2, 0.8, (Math.random() - 0.5) * 1.2, 0.5, 0.22, '#d8f2ff');
    }
    // Time of day loops every few minutes; a shower greys the light a little.
    dayClock += dt;
    const day = sky.set(dayClock / DAY_SECONDS), wet = updateRain(dt); sunOffset.copy(day.sun);
    hemi.intensity *= 1 - wet * 0.15; sun.intensity *= 1 - wet * 0.4;
    props.glow.emissiveIntensity = day.glow * 1.6; poolMaterial.opacity = day.glow * 0.45; fireflyMaterial.opacity = day.glow * 0.9;
    fireflies.forEach(f => {
      const h = f.userData.home as THREE.Vector3, ph = f.userData.phase as number;
      f.position.set(h.x + Math.sin(time * 0.4 + ph) * 0.8, h.y + Math.sin(time * 0.9 + ph) * 0.2, h.z + Math.cos(time * 0.3 + ph) * 0.8);
      // A glow for about a third of each cycle, then dark.
      const glow = Math.sin(time * f.userData.rate * Math.PI * 2 + ph);
      f.scale.setScalar(glow > 0.45 ? 0.1 + (glow - 0.45) * 0.22 : 0);
    });
    updateBirds(dt, day.glow);
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
    puffs.step(dt);
    focus.lerp(focusTarget(), 1 - Math.exp(-dt * 5));
    camera.position.copy(focus).addScaledVector(VIEW, 30); camera.lookAt(focus);
    // The shadow camera follows the view in whole shadow-map texels; sliding it by fractions makes thin surfaces shimmer.
    const forward = lightDir.copy(day.sun).normalize().negate(), right = lightRight.crossVectors(forward, WORLD_UP).normalize(), up = lightUp.crossVectors(right, forward);
    const a = focus.dot(right), b = focus.dot(up);
    shadowFocus.copy(focus).addScaledVector(right, Math.round(a / TEXEL) * TEXEL - a).addScaledVector(up, Math.round(b / TEXEL) * TEXEL - b);
    sun.position.copy(shadowFocus).add(day.sun); sun.target.position.copy(shadowFocus);
    renderer.render(scene, camera);
    hudClock += dt; saveClock += dt;
    if (hudClock > 0.1 || events.length) { hudClock = 0; callbacks.update(); }
    if (saveClock > 2) { saveClock = 0; callbacks.save(); }
  }
  frame = requestAnimationFrame(animate);
  return {
    ready,
    setPaused(value: boolean) { paused = value; input.setEnabled(!value); audio.refresh(value); previous = performance.now(); if (!value) canvas.focus({ preventScroll: true }); },
    /** Mute and music switches changed. */
    refreshAudio() { audio.refresh(); },
    /** Buy from the board's sheet; false (and nothing spent) when it can't be bought. */
    shop(action: ShopAction) {
      const ok = action.kind === 'upgrade' ? buyUpgrade(state, action.id) : action.kind === 'decor' ? buyDecor(state, action.id) : hireHelper(state);
      if (!ok) return false;
      syncDecor(true); syncHelpers(); syncStall(true);
      if (action.kind === 'decor') tour = { ...DECOR[action.id].at, until: time + 2.4 };
      feedback({ type: 'upgrade', at: action.kind === 'decor' ? DECOR[action.id].at : action.kind === 'upgrade' && action.id === 'stall' ? SPOTS.counter : SPOTS.board, amount: 0, id: action.kind === 'helper' ? 'helper' : action.id });
      callbacks.save(); callbacks.update();
      return true;
    },
    destroy() {
      if (disposed) return;
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); input.destroy(); audio.destroy();
      document.removeEventListener('visibilitychange', visibility); callbacks.save();
      for (const s of [...shoppers.values(), ...spare.flat()]) scene.add(s.group);
      disposeObject(scene); merged.forEach(g => g.dispose()); puffs.dispose();
      loadedModels.forEach(disposeObject); props.dispose(); sphere.dispose(); coinGeometry.dispose();
      bubbleTextures.forEach(t => t.dispose()); birdFrames.forEach(t => t.dispose()); birdShadow.dispose();
      sun.shadow.map?.dispose(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    }
  };
}

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FARM_ASSETS } from './assets';
import { createFarmProps } from './props';
import { createFarmInput } from './input';
import { createFarmAudio } from './audio';
import { stepFarm, SPOTS, total, GROW_SECONDS, type FarmState, type FarmEvent, type Cell, type Crop } from './model';

type Callbacks = {
  update: () => void;
  event: (event: FarmEvent, screen: { x: number; y: number }) => void;
  save: () => void;
};
export function createFarmScene(host: HTMLElement, state: FarmState, callbacks: Callbacks) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setClearColor('#8db75b'); renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  const canvas = renderer.domElement; canvas.tabIndex = 0; canvas.setAttribute('aria-label', 'Farm. Drag to move, or use arrow keys.');
  canvas.dataset.farmCanvas = ''; host.append(canvas);
  const input = createFarmInput(canvas, host), audio = createFarmAudio(state), props = createFarmProps();
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#8db75b');
  scene.add(new THREE.HemisphereLight('#fff8df', '#66814d', 1.8));
  const sun = new THREE.DirectionalLight('#fff3ce', 2); sun.position.set(-5, 12, 5); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -8; sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 9; sun.shadow.camera.bottom = -9; sun.shadow.normalBias = 0.04;
  scene.add(sun); sun.target.position.set(0, 0, -1); scene.add(sun.target);
  const camera = new THREE.OrthographicCamera(-5, 5, 10, -10, 0.1, 80);
  const focus = new THREE.Vector3(0, 0, -0.2);
  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height);
    const halfWidth = 4.5, halfHeight = halfWidth * height / width;
    camera.left = -halfWidth; camera.right = halfWidth; camera.top = halfHeight; camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize); observer.observe(host); resize();

  // A compact, readable starter farm. The section layout is isolated from simulation rules.
  props.box(scene, '#82ad50', 0, -0.22, 0, 32, 0.4, 38);
  props.box(scene, '#a8c671', 0, -0.012, 0, 8.6, 0.05, 11.4);
  props.box(scene, '#d9c38a', 0, 0.015, 1.9, 7.8, 0.035, 2.5);
  props.box(scene, '#d9c38a', 0, 0.012, -0.8, 1.05, 0.035, 7.8);
  for (let i = 0; i < 11; i++) {
    const z = -5.2 + i;
    for (const x of [-4.15, 4.15]) {
      props.box(scene, '#f3e6b9', x, 0.36, z, 0.12, 0.76, 0.12);
      if (i < 10) for (const y of [0.27, 0.56]) props.box(scene, '#e4d39c', x, y, z + 0.5, 0.08, 0.09, 1.05);
    }
  }
  for (let i = 0; i < 9; i++) {
    const x = -4 + i;
    props.box(scene, '#f3e6b9', x, 0.36, -5.6, 0.12, 0.76, 0.12);
    if (i < 8) for (const y of [0.27, 0.56]) props.box(scene, '#e4d39c', x + 0.5, y, -5.6, 1.05, 0.09, 0.08);
  }
  for (let i = 0; i < 14; i++) {
    const t = props.tree(1.8 + (i % 3) * 0.3);
    t.position.set((i % 2 ? 1 : -1) * (5.05 + (i % 3) * 0.6), 0, -7 + Math.floor(i / 2) * 2.4); scene.add(t);
  }
  for (let i = 0; i < 7; i++) {
    const t = props.tree(2 + (i % 3) * 0.35); t.position.set(-5.4 + i * 1.8, 0, -8.4 - (i % 2) * 0.8); scene.add(t);
  }
  const shed = new THREE.Group(); shed.position.set(-1.25, 0, -7.25); scene.add(shed);
  props.box(shed, '#d9b875', 0, 0.7, 0, 1.8, 1.4, 1.25);
  props.box(shed, '#79563a', 0, 0.45, 0.64, 0.55, 0.9, 0.04);
  props.box(shed, '#c8dfc4', 0.57, 0.85, 0.65, 0.4, 0.4, 0.04);
  for (const side of [-1, 1]) {
    const roof = props.box(shed, '#9a6248', side * 0.48, 1.5, 0, 1.1, 0.13, 1.6); roof.rotation.z = -side * 0.4;
  }
  props.ball(scene, '#82b3a2', 2.1, 0.03, -7.1, 1.1, 0.025, 0.7);
  for (let i = 0; i < 8; i++) props.ball(scene, '#a7ae83', 2.1 + Math.cos(i * Math.PI / 4) * 1.1, 0.05, -7.1 + Math.sin(i * Math.PI / 4) * 0.7, 0.15, 0.1, 0.12);
  for (let i = 0; i < 24; i++) {
    const x = Math.sin(i * 15.3) * 3.7, z = 4.2 + Math.cos(i * 9.1) * 0.55;
    props.ball(scene, i % 3 ? '#f6e6a4' : '#f1b86d', x, 0.12, z, 0.055);
  }
  const seedStand = props.seedStand('tomato'); seedStand.position.set(SPOTS.seeds.x, 0, SPOTS.seeds.z - 0.3); scene.add(seedStand);
  const seedRing = props.marker('#fff1b4'); seedRing.position.set(SPOTS.seeds.x, 0.04, SPOTS.seeds.z); scene.add(seedRing);
  const market = props.market(); market.position.set(SPOTS.market.x, 0, SPOTS.market.z - 0.9); scene.add(market);
  const marketRing = props.marker('#fff1b4', 0.7); marketRing.position.set(SPOTS.market.x, 0.04, SPOTS.market.z); scene.add(marketRing);
  // Combine stationary props by material; crops, characters and purchase state stay independent.
  scene.updateMatrixWorld(true);
  const batches = new Map<string, { material: THREE.Material; shadow: boolean; meshes: THREE.Mesh[]; geometries: THREE.BufferGeometry[] }>();
  scene.traverse(o => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    const key = `${o.material.uuid}:${o.castShadow}`;
    let batch = batches.get(key);
    if (!batch) { batch = { material: o.material, shadow: o.castShadow, meshes: [], geometries: [] }; batches.set(key, batch); }
    batch.meshes.push(o); batch.geometries.push(o.geometry.clone().applyMatrix4(o.matrixWorld));
  });
  batches.forEach(batch => {
    const geometry = mergeGeometries(batch.geometries, false);
    if (geometry) {
      const mesh = new THREE.Mesh(geometry, batch.material); mesh.castShadow = batch.shadow; mesh.receiveShadow = true; scene.add(mesh);
      batch.meshes.forEach(m => m.removeFromParent());
    }
    batch.geometries.forEach(g => g.dispose());
  });
  const cash = new THREE.Group(); cash.position.set(SPOTS.cash.x, 0, SPOTS.cash.z); scene.add(cash);
  const cashRing = props.marker('#f7cb55', 0.5); cash.add(cashRing);
  for (let i = 0; i < 5; i++) props.cylinder(cash, '#f5c653', (i % 2) * 0.22 - 0.1, 0.1 + Math.floor(i / 2) * 0.08, 0, 0.13, 0.07);
  const cashSign = props.label('Collect', '#294d35', '#ffdc78', 1.1); cashSign.position.set(0, 0.85, 0); cash.add(cashSign);
  const expansion = new THREE.Group(); scene.add(expansion);
  props.box(expansion, '#94b75c', SPOTS.expansion.x, 0.015, SPOTS.expansion.z, 3, 0.04, 3.1);
  for (let i = 0; i < 4; i++) for (const side of [-1, 1]) {
    props.box(expansion, '#e3d598', SPOTS.expansion.x + side * 1.45, 0.08, SPOTS.expansion.z + (i - 1.5) * 0.9, 0.08, 0.04, 0.5);
    props.box(expansion, '#e3d598', SPOTS.expansion.x + (i - 1.5) * 0.85, 0.08, SPOTS.expansion.z + side * 1.5, 0.5, 0.04, 0.08);
  }
  const buyRing = props.marker('#ffda77', 0.8); buyRing.position.set(SPOTS.expansion.x, 0.08, SPOTS.expansion.z); expansion.add(buyRing);
  props.box(expansion, '#946c45', SPOTS.expansion.x, 0.5, SPOTS.expansion.z, 0.1, 1, 0.1);
  const buySign = props.label('New field  $40', '#3c5634', '#ffe399', 2.05); buySign.position.set(SPOTS.expansion.x, 1.15, SPOTS.expansion.z); expansion.add(buySign);

  const fieldRoot = new THREE.Group(); scene.add(fieldRoot);
  const plants = new Map<string, { cell: Cell; group: THREE.Group; fruit: THREE.Group; crop: Crop }>();
  let renderedPlots = 0;
  function addPlots() {
    for (const plot of state.plots.slice(renderedPlots)) {
      const centerX = plot.id === 0 ? -1.85 : 1.85;
      props.box(fieldRoot, '#986540', centerX, 0.04, -1.85, 2.95, 0.1, 3.05);
      for (let i = 0; i < 3; i++) props.box(fieldRoot, '#754b31', centerX + (i - 1) * 0.75, 0.1, -1.85, 0.62, 0.11, 2.8);
      for (const cell of plot.cells) {
        const plant = props.crop(plot.crop); plant.group.position.set(cell.x, 0.15, cell.z); fieldRoot.add(plant.group);
        plants.set(cell.id, { cell, ...plant, crop: plot.crop });
      }
      const tag = props.label(plot.crop === 'tomato' ? 'Tomatoes' : 'Cucumbers', '#fff6df', '#496740', 1.55);
      tag.position.set(centerX, 0.45, -3.56); fieldRoot.add(tag);
      if (plot.id === 1) {
        const supply = props.seedStand('cucumber'); supply.position.set(SPOTS.cucumberSeeds.x, 0, SPOTS.cucumberSeeds.z); fieldRoot.add(supply);
        const ring = props.marker('#fff1b4'); ring.position.set(SPOTS.cucumberSeeds.x, 0.04, SPOTS.cucumberSeeds.z); fieldRoot.add(ring);
      }
    }
    renderedPlots = state.plots.length; expansion.visible = state.plots.length < 2;
  }
  addPlots();
  const farmer = new THREE.Group(); farmer.position.set(state.player.x, 0.12, state.player.z); scene.add(farmer);
  const basket = props.crate(farmer, 0, 0.57, 0.48, 0.55); basket.visible = false;
  const basketFruit = props.ball(basket, '#ed5840', 0, 0.35, 0, 0.19);
  const farmerShadow = new THREE.Mesh(new THREE.CircleGeometry(0.37, 24), new THREE.MeshBasicMaterial({ color: '#344a29', transparent: true, opacity: 0.18, depthWrite: false }));
  farmerShadow.rotation.x = -Math.PI / 2; farmerShadow.position.y = 0.03; scene.add(farmerShadow);
  const customerRoot = new THREE.Group(); scene.add(customerRoot);
  const effectRoot = new THREE.Group(); scene.add(effectRoot);
  const particles: { mesh: THREE.Mesh; origin: THREE.Vector3; age: number; target: THREE.Vector3 }[] = [];
  let disposed = false, paused = false, loaded = false, frame = 0, previous = performance.now(), time = 0, saveClock = 0, hudClock = 0, actionTime = 0;
  const joints: THREE.Object3D[] = [];
  const customers: THREE.Group[] = [];
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
    loadedModels.push(gltf.scene);
    if (disposed) disposeObject(gltf.scene);
    return gltf;
  };
  const ready = Promise.all([load(FARM_ASSETS.farmer), load(FARM_ASSETS.customer)]).then(([mother, customer]) => {
    if (disposed) { disposeObject(mother.scene); disposeObject(customer.scene); return; }
    const model = fit(mother.scene, 1.65); farmer.add(model);
    model.traverse(o => { if (!('isMesh' in o) && /^(arm-|leg-)/.test(o.name)) joints.push(o); });
    for (let i = 0; i < 3; i++) {
      const person = new THREE.Group(); person.add(fit(customer.scene.clone(true), 1.12));
      person.rotation.y = Math.PI; customerRoot.add(person); customers.push(person);
    }
    loaded = true; previous = performance.now(); callbacks.update();
  });

  function feedback(event: FarmEvent) {
    audio.play(event);
    if (event.type === 'plant' || event.type === 'harvest') actionTime = 0.35;
    const color = ['cash', 'sale', 'purchase'].includes(event.type) ? '#ffd15b' : event.type === 'plant' ? '#c6a175' : event.crop === 'cucumber' ? '#5a9f41' : '#f16a43';
    for (let i = 0; i < (event.type === 'purchase' ? 15 : 4); i++) {
      const mesh = props.ball(effectRoot, color, event.at.x, 0.6, event.at.z, 0.09);
      const target = event.type === 'harvest' || event.type === 'seed' ? new THREE.Vector3(state.player.x, 1, state.player.z) : new THREE.Vector3(event.at.x + Math.sin(i * 2.4) * 0.8, 1.2 + i % 3 * 0.2, event.at.z + Math.cos(i * 2.4) * 0.6);
      particles.push({ mesh, origin: mesh.position.clone(), age: 0, target });
    }
    if (event.type === 'purchase') { addPlots(); callbacks.save(); }
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
    const move = input.read();
    const events = stepFarm(state, dt, move); events.forEach(feedback);
    const moving = Math.hypot(move.x, move.z) > 0.05;
    farmer.position.set(state.player.x, 0.1 + (moving ? Math.abs(Math.sin(time * 12)) * 0.045 : 0), state.player.z);
    if (moving) {
      const target = Math.atan2(move.x, move.z), diff = Math.atan2(Math.sin(target - farmer.rotation.y), Math.cos(target - farmer.rotation.y));
      farmer.rotation.y += diff * Math.min(1, dt * 14);
    }
    farmerShadow.position.set(state.player.x, 0.04, state.player.z);
    actionTime = Math.max(0, actionTime - dt);
    for (const joint of joints) {
      const arm = joint.name.startsWith('arm'), side = joint.name.includes('right') ? 1 : -1;
      joint.rotation.x = arm && actionTime > 0 ? -0.75 * Math.sin(actionTime / 0.35 * Math.PI) : moving ? Math.sin(time * 12) * 0.45 * side * (arm ? 0.7 : 1) : 0;
    }
    basket.visible = total(state.produce) + total(state.seeds) > 0;
    basketFruit.visible = total(state.produce) > 0;
    basket.scale.setScalar(0.85 + total(state.produce) / 24 * 0.25);
    cash.visible = state.cash > 0; cashSign.position.y = 0.9 + Math.sin(time * 3) * 0.04;
    buyRing.scale.setScalar(1 + Math.sin(time * 2.5) * 0.035);
    for (const { cell, group, fruit } of plants.values()) {
      group.visible = cell.stage !== 'empty';
      const growth = cell.stage === 'ripe' ? 1 : 0.18 + cell.age / GROW_SECONDS * 0.82;
      group.scale.setScalar(growth); group.rotation.z = Math.sin(time * 1.8 + cell.x * 3) * 0.035;
      fruit.visible = cell.stage === 'ripe';
    }
    customers.forEach((person, i) => {
      const cycle = (time * 0.35 + i * 1.9 + state.sold * 0.12) % 5.8;
      person.position.set(2.1 + i % 2 * 0.32, 0.08, 2.5 + cycle * 0.35);
      person.scale.setScalar(0.94 + i * 0.04);
      person.visible = i === 0 || total(state.stock) > 0;
    });
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.age += dt; const t = Math.min(1, p.age / 0.65);
      p.mesh.position.lerpVectors(p.origin, p.target, t); p.mesh.position.y += Math.sin(t * Math.PI) * 0.45;
      p.mesh.scale.setScalar(0.1 * (1 - t * 0.8));
      if (t >= 1) { p.mesh.removeFromParent(); particles.splice(i, 1); }
    }
    // A small follow keeps new sections readable without rotating the portrait view.
    focus.x += (state.player.x * 0.08 - focus.x) * dt * 3;
    focus.z += (state.player.z * 0.08 - 0.4 - focus.z) * dt * 3;
    camera.position.set(focus.x, 12, focus.z + 13); camera.lookAt(focus);
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
      document.removeEventListener('visibilitychange', visibility); callbacks.save(); disposeObject(scene);
      loadedModels.forEach(disposeObject); props.dispose();
      sun.shadow.map?.dispose(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    }
  };
}

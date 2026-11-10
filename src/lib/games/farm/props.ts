import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Crop, Product } from './model';

// Seeded so the farm dresses itself the same way on every visit.
export function seeded(seed: number) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}
export const COLORS = {
  grass: '#79b545', lawn: '#86c04f', hedge: '#9cc43c', hedgeDark: '#7fa830', foliage: '#4e8f37', foliageLight: '#6fad45',
  cypress: '#3f7d3a', soil: '#7b4a2d', ridge: '#8f5836', paver: '#ddd3be', stone: '#efe5cb', wood: '#b9824a', woodDark: '#8a5a35',
  tomato: '#e5463a', cucumber: '#3f8a35', strawberry: '#e8344f', egg: '#fbf1dc', apple: '#d8402f', honey: '#f0a32a', leaf: '#4f9a3c', burlap: '#d9bd8c', coin: '#f5c043', roof: '#c9553f', cream: '#fff6df'
};
type Draw = (c: CanvasRenderingContext2D, w: number, h: number) => void;
// Crate positions along the counter, one per crop, shared with the scene's shelf display.
export const SHELF_X = [-0.69, -0.23, 0.23, 0.69];
// Collapse every mesh under `root` into one mesh per material: hundreds of props become a few draw calls.
// Returns the merged geometries so the caller can dispose them.
export function mergeByMaterial(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert(), batches = new Map<string, { material: THREE.Material; shadow: boolean; meshes: THREE.Mesh[] }>();
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || Array.isArray(o.material)) return;
    const key = `${o.material.uuid}:${o.castShadow}`;
    const batch = batches.get(key);
    if (batch) batch.meshes.push(o); else batches.set(key, { material: o.material, shadow: o.castShadow, meshes: [o] });
  });
  const merged: THREE.BufferGeometry[] = [];
  batches.forEach(({ material, shadow, meshes }) => {
    const parts = meshes.map(m => { const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); return g.applyMatrix4(inverse.clone().multiply(m.matrixWorld)); });
    const geometry = mergeGeometries(parts, false);
    parts.forEach(g => g.dispose());
    if (!geometry) return;
    const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = shadow; mesh.receiveShadow = true; mesh.renderOrder = meshes[0].renderOrder;
    meshes.forEach(m => m.removeFromParent()); root.add(mesh); merged.push(geometry);
  });
  return merged;
}

export function createFarmProps() {
  const materials = new Map<string, THREE.Material>();
  const geometries = new Map<string, THREE.BufferGeometry>();
  const textures: THREE.Texture[] = [];
  // Lit windows and lamp bulbs: the day cycle turns `emissiveIntensity` up at dusk.
  const glow = new THREE.MeshStandardMaterial({ color: '#cfe6ee', emissive: '#ffc96a', emissiveIntensity: 0, roughness: 0.4 });
  materials.set('glow', glow);
  function material(color: string, roughness = 0.82) {
    let m = materials.get(color);
    if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness }); materials.set(color, m); }
    return m;
  }
  function geometry(key: string, make: () => THREE.BufferGeometry) {
    let g = geometries.get(key);
    if (!g) { g = make(); geometries.set(key, g); }
    return g;
  }
  function mesh(parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) {
    const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz);
    o.castShadow = sy * (g.boundingBox?.max.y ?? 1) > 0.05; o.receiveShadow = true; parent.add(o); return o;
  }
  const box = (p: THREE.Object3D, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
    mesh(p, geometry('box', () => new THREE.BoxGeometry(1, 1, 1)), material(color), x, y, z, sx, sy, sz);
  // Rounded boxes keep their bevels, so each size gets its own cached geometry.
  const rbox = (p: THREE.Object3D, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, r = 0.06) =>
    mesh(p, geometry(`rb${sx}:${sy}:${sz}:${r}`, () => new RoundedBoxGeometry(sx, sy, sz, 3, Math.min(r, sx / 2, sy / 2, sz / 2))), material(color), x, y, z);
  const ball = (p: THREE.Object3D, color: string, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) =>
    mesh(p, geometry('ball', () => new THREE.SphereGeometry(1, 18, 14)), material(color), x, y, z, sx, sy, sz);
  const cylinder = (p: THREE.Object3D, color: string, x: number, y: number, z: number, r: number, h: number) =>
    mesh(p, geometry('cyl', () => new THREE.CylinderGeometry(1, 1, 1, 16)), material(color), x, y, z, r, h, r);

  function canvasTexture(w: number, h: number, draw: Draw) {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    draw(canvas.getContext('2d')!, w, h);
    const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; textures.push(t); return t;
  }
  const tiles = new Map<string, THREE.CanvasTexture>();
  function tiled(kind: 'grass' | 'paver' | 'soil') {
    let t = tiles.get(kind);
    if (t) return t;
    const rand = seeded(kind.length * 977);
    t = canvasTexture(256, 256, (c, w, h) => {
      if (kind === 'paver') {
        c.fillStyle = '#b8ab92'; c.fillRect(0, 0, w, h);
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
          const l = 80 + rand() * 7;
          c.fillStyle = `hsl(40 ${18 + rand() * 8}% ${l}%)`; c.beginPath(); c.roundRect(x * 64 + 3, y * 64 + 3, 58, 58, 6); c.fill();
          c.fillStyle = '#ffffff22'; c.fillRect(x * 64 + 6, y * 64 + 5, 50, 4);
        }
      } else {
        const [base, spots] = kind === 'grass' ? ['#79b545', ['#82bd4c', '#71ab3f', '#8bc455']] : ['#7b4a2d', ['#6d4027', '#8a5637', '#5f3822']];
        c.fillStyle = base; c.fillRect(0, 0, w, h);
        for (let i = 0; i < 260; i++) {
          c.fillStyle = spots[i % 3]; c.globalAlpha = 0.35 + rand() * 0.4;
          const x = rand() * w, y = rand() * h, r = kind === 'grass' ? 6 + rand() * 18 : 1 + rand() * 3;
          for (const [dx, dy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) { c.beginPath(); c.arc(x + dx, y + dy, r, 0, Math.PI * 2); c.fill(); }
        }
        c.globalAlpha = 1;
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping; tiles.set(kind, t); return t;
  }
  // A flat textured surface; `scale` is the world size of one texture tile.
  function surface(p: THREE.Object3D, kind: 'grass' | 'paver' | 'soil', x: number, y: number, z: number, w: number, d: number, scale: number) {
    const t = tiled(kind).clone(); t.repeat.set(w / scale, d / scale); t.offset.set(x / scale, z / scale); t.needsUpdate = true; textures.push(t);
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }); materials.set(`surface${materials.size}`, m);
    const o = new THREE.Mesh(geometry('plane', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), m);
    o.position.set(x, y, z); o.scale.set(w, 1, d); o.receiveShadow = true; p.add(o); return o;
  }
  // Painted ground tiles in the reference's style: bright, flat, unlit.
  function decal(p: THREE.Object3D, x: number, z: number, w: number, d: number, draw: Draw) {
    const t = canvasTexture(Math.round(w * 160), Math.round(d * 160), draw);
    const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }); materials.set(`decal${materials.size}`, m);
    const o = new THREE.Mesh(geometry('plane', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), m);
    o.position.set(x, 0.035, z); o.scale.set(w, 1, d); o.renderOrder = 1; p.add(o); return o;
  }
  function label(text: string, color = '#294d35', bg = '#fff6df', width = 1.65) {
    const t = canvasTexture(512, 144, c => {
      c.fillStyle = bg; c.beginPath(); c.roundRect(2, 2, 508, 140, 32); c.fill();
      c.font = '60px "Lilita One", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(text, 256, 76);
    });
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, toneMapped: false }));
    sprite.scale.set(width, width * 144 / 512, 1); return sprite;
  }

  function hedge(p: THREE.Object3D, x: number, z: number, w: number, d: number, h = 0.42) {
    rbox(p, COLORS.hedgeDark, x, h * 0.3, z, w, h * 0.6, d, 0.1);
    rbox(p, COLORS.hedge, x, h * 0.62, z, w + 0.02, h * 0.76, d + 0.02, 0.13);
  }
  // Cream stone balustrade from a to b along one axis.
  function balustrade(p: THREE.Object3D, ax: number, az: number, bx: number, bz: number) {
    const length = Math.hypot(bx - ax, bz - az), along = bx !== ax, posts = Math.round(length / 1.5);
    const at = (t: number): [number, number] => [ax + (bx - ax) * t, az + (bz - az) * t];
    for (let i = 0; i <= posts; i++) {
      const [x, z] = at(i / posts);
      rbox(p, COLORS.stone, x, 0.36, z, 0.26, 0.72, 0.26, 0.04); rbox(p, '#f7f0dc', x, 0.76, z, 0.34, 0.08, 0.34, 0.03);
      if (i < posts) for (let k = 1; k < 6; k++) { const [bx2, bz2] = at((i + k / 6) / posts); cylinder(p, COLORS.stone, bx2, 0.34, bz2, 0.045, 0.42); }
    }
    const cx = (ax + bx) / 2, cz = (az + bz) / 2;
    rbox(p, '#f7f0dc', cx, 0.6, cz, along ? length : 0.16, 0.08, along ? 0.16 : length, 0.03);
    rbox(p, COLORS.stone, cx, 0.08, cz, along ? length : 0.2, 0.12, along ? 0.2 : length, 0.03);
  }
  function cypress(height = 2.4) {
    const g = new THREE.Group();
    cylinder(g, COLORS.woodDark, 0, 0.15, 0, 0.07, 0.3);
    ball(g, COLORS.cypress, 0, height * 0.48, 0, 0.42, height * 0.5, 0.42);
    ball(g, '#4b8c42', -0.08, height * 0.62, 0.12, 0.26, height * 0.3, 0.26);
    return g;
  }
  function roundTree(height = 2.4, seed = 1) {
    const g = new THREE.Group(), r = seeded(seed + 3);
    cylinder(g, COLORS.woodDark, 0, height * 0.25, 0, 0.11, height * 0.5);
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + r();
      ball(g, i % 2 ? COLORS.foliageLight : COLORS.foliage, Math.cos(a) * 0.35 * (i > 0 ? 1 : 0), height * (0.62 + r() * 0.15), Math.sin(a) * 0.35 * (i > 0 ? 1 : 0), height * (0.3 - i * 0.03));
    }
    return g;
  }
  function bush(radius = 0.4, seed = 1, flowers = '#fff2c2') {
    const g = new THREE.Group(), r = seeded(seed + 11);
    for (let i = 0; i < 3; i++) ball(g, i ? COLORS.foliageLight : COLORS.foliage, (r() - 0.5) * radius, radius * 0.7, (r() - 0.5) * radius, radius * (0.75 + r() * 0.2), radius * 0.7, radius * (0.75 + r() * 0.2));
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2, d = radius * (0.3 + r() * 0.55);
      ball(g, flowers, Math.cos(a) * d, radius * (1.05 + r() * 0.25) - d * 0.35, Math.sin(a) * d, 0.065);
      ball(g, '#f3c444', Math.cos(a) * d, radius * (1.1 + r() * 0.2) - d * 0.35, Math.sin(a) * d, 0.03);
    }
    return g;
  }
  function crate(p: THREE.Object3D, x: number, y: number, z: number, size = 0.5) {
    const g = new THREE.Group(); g.position.set(x, y, z); p.add(g);
    rbox(g, COLORS.wood, 0, 0.13, 0, size, 0.26, size * 0.72, 0.03);
    for (const a of [-1, 1]) rbox(g, '#d8a465', 0, 0.24, a * size * 0.34, size + 0.03, 0.07, 0.05, 0.02);
    return g;
  }
  // Plants grow from a sprout: `leaves` and `fruit` are scaled separately as they mature.
  const templates = new Map<Crop, { leaves: THREE.Group; fruit: THREE.Group }>();
  function crop(kind: Crop) {
    let template = templates.get(kind);
    if (!template) {
      template = buildCrop(kind);
      for (const part of [template.leaves, template.fruit]) mergeByMaterial(part).forEach(g => geometries.set(g.uuid, g));
      templates.set(kind, template);
    }
    const group = new THREE.Group(), leaves = template.leaves.clone(), fruit = template.fruit.clone(); group.add(leaves, fruit);
    return { group, leaves, fruit };
  }
  function buildCrop(kind: Crop) {
    const leaves = new THREE.Group(), fruit = new THREE.Group();
    if (kind === 'apple') {
      // An apple tree: the canopy stays, the apples come and go.
      cylinder(leaves, COLORS.woodDark, 0, 0.5, 0, 0.1, 1.0);
      for (const [x, y, z, r, c] of [[0, 1.45, 0, 0.62, COLORS.foliage], [-0.32, 1.3, 0.2, 0.42, COLORS.foliageLight], [0.3, 1.35, -0.18, 0.44, COLORS.foliageLight], [0.05, 1.8, 0.05, 0.4, '#5d9c3e']] as const) ball(leaves, c, x, y, z, r);
      // Apples sit on the outside of the canopy, big enough to read from the camera.
      for (let i = 0; i < 10; i++) {
        const a = i * 0.63, h = 1.15 + (i % 3) * 0.25, d = 0.6 + (i % 2) * 0.08;
        ball(fruit, i % 5 ? COLORS.apple : '#e6c13a', Math.cos(a) * d, h, Math.sin(a) * d, 0.11);
      }
    } else if (kind === 'tomato') {
      cylinder(leaves, '#c8a06b', 0.12, 0.33, -0.08, 0.018, 0.66);
      cylinder(leaves, '#3f7a35', 0, 0.2, 0, 0.03, 0.4);
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26;
        ball(leaves, i % 2 ? COLORS.leaf : '#64ad45', Math.sin(a) * 0.13, 0.2 + i * 0.07, Math.cos(a) * 0.13, 0.15, 0.1, 0.13);
      }
      for (let i = 0; i < 4; i++) {
        const a = i * 1.57 + 0.4;
        ball(fruit, COLORS.tomato, Math.sin(a) * 0.16, 0.2 + (i % 2) * 0.14, Math.cos(a) * 0.16, 0.085);
        ball(fruit, '#3f7a35', Math.sin(a) * 0.16, 0.28 + (i % 2) * 0.14, Math.cos(a) * 0.16, 0.035, 0.015, 0.035);
      }
    } else if (kind === 'strawberry') {
      // A low clump of trefoil leaves with white flowers; berries hang over the edge.
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9, d = 0.06 + (i % 3) * 0.05, leaf = ball(leaves, i % 2 ? '#3f8f3a' : '#57a843', Math.sin(a) * d, 0.1 + (i % 2) * 0.05, Math.cos(a) * d, 0.11, 0.05, 0.09);
        leaf.rotation.set(Math.cos(a) * 0.4, a, -Math.sin(a) * 0.4);
      }
      for (let i = 0; i < 3; i++) { const a = i * 2.1 + 1; ball(leaves, '#fffaf0', Math.sin(a) * 0.1, 0.2, Math.cos(a) * 0.1, 0.035, 0.02, 0.035); ball(leaves, '#f3c444', Math.sin(a) * 0.1, 0.21, Math.cos(a) * 0.1, 0.015); }
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26 + 0.3, d = 0.2;
        ball(fruit, COLORS.strawberry, Math.sin(a) * d, 0.08, Math.cos(a) * d, 0.055, 0.07, 0.055);
        ball(fruit, '#3f8f3a', Math.sin(a) * d, 0.15, Math.cos(a) * d, 0.04, 0.012, 0.04);
      }
    } else {
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26, leaf = cylinder(leaves, i % 2 ? COLORS.leaf : '#5aa442', Math.sin(a) * 0.12, 0.14 + (i % 3) * 0.06, Math.cos(a) * 0.12, 0.12, 0.02);
        leaf.rotation.set(Math.cos(a) * 0.6, 0, -Math.sin(a) * 0.6);
      }
      cylinder(leaves, '#3f7a35', 0, 0.15, 0, 0.025, 0.3);
      ball(leaves, '#f6d34a', 0.05, 0.34, 0.08, 0.04);
      // Cucumbers hang outside the leaves so a ripe plant reads at a glance.
      for (let i = 0; i < 3; i++) {
        const a = i * 2.1 + 0.3, c = ball(fruit, COLORS.cucumber, Math.sin(a) * 0.24, 0.16 + (i % 2) * 0.08, Math.cos(a) * 0.24, 0.06, 0.18, 0.06);
        c.rotation.set(Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35);
        ball(fruit, '#9fd36b', Math.sin(a) * 0.26, 0.2 + (i % 2) * 0.08, Math.cos(a) * 0.26, 0.02, 0.08, 0.02);
      }
    }
    return { leaves, fruit };
  }
  function fieldBed(p: THREE.Object3D, x: number, z: number) {
    const g = new THREE.Group(); g.position.set(x, 0, z); p.add(g);
    rbox(g, '#6a3f26', 0, 0.05, 0, 2.95, 0.12, 2.95, 0.05);
    surface(g, 'soil', 0, 0.115, 0, 2.85, 2.85, 1.4);
    for (let i = -1; i <= 1; i++) rbox(g, COLORS.ridge, 0, 0.13, i * 0.8, 2.6, 0.1, 0.5, 0.05);
    return g;
  }
  function seedStand(kind: Crop) {
    const g = new THREE.Group();
    rbox(g, COLORS.woodDark, 0, 0.2, 0, 0.95, 0.4, 0.42, 0.04);
    rbox(g, COLORS.wood, 0, 0.42, 0, 1.02, 0.07, 0.48, 0.03);
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 0.3;
      ball(g, COLORS.burlap, x, 0.6, 0, 0.14, 0.17, 0.13);
      ball(g, '#c4a271', x, 0.76, 0, 0.07, 0.04, 0.07);
      ball(g, COLORS[kind], x, 0.61, 0.12, 0.055, kind === 'cucumber' ? 0.04 : 0.055, 0.02);
    }
    return g;
  }
  // The stall dresses up with each Fancy stall level: fresh paint and bunting, then flower boxes and lanterns,
  // then a FARM FRESH sign on top and baskets of produce either side.
  // `awning` sets the stripe colour: tomato red at the market, leaf green at the orchard stand.
  function market(level = 0, awning = COLORS.tomato) {
    const g = new THREE.Group(), body = level ? (awning === COLORS.tomato ? '#5f9a70' : '#b8743e') : COLORS.woodDark, slat = level ? '#fff3dc' : '#9d6a3e';
    rbox(g, body, 0, 0.36, 0, 1.9, 0.72, 0.8, 0.05);
    for (let i = 0; i < 5; i++) box(g, slat, -0.76 + i * 0.38, 0.36, 0.405, 0.04, 0.62, 0.01);
    rbox(g, '#d9a865', 0, 0.75, 0, 2.02, 0.08, 0.9, 0.03);
    for (const x of [-0.92, 0.92]) rbox(g, COLORS.woodDark, x, 0.95, -0.36, 0.08, 1.9, 0.08, 0.03);
    for (let i = 0; i < 8; i++) {
      const stripe = box(g, i % 2 ? '#fff3dc' : awning, -0.875 + i * 0.25, 1.82, -0.2, 0.25, 0.06, 0.7); stripe.rotation.x = 0.32;
      rbox(g, i % 2 ? '#fff3dc' : awning, -0.875 + i * 0.25, 1.66, 0.13, 0.25, 0.16, 0.04, 0.02);
    }
    for (const x of SHELF_X) crate(g, x, 0.79, 0, 0.42);
    rbox(g, '#6b8fb0', 0.8, 0.9, -0.3, 0.22, 0.18, 0.16, 0.04);
    if (level >= 1) for (let i = 0; i < 9; i++) {
      const flag = mesh(g, geometry('flag', () => new THREE.ConeGeometry(0.07, 0.16, 3)), material(['#f5c043', '#4f7fb8', '#e8344f', '#7fc06a'][i % 4]), -0.88 + i * 0.22, 1.47, 0.17);
      flag.rotation.x = Math.PI;
    }
    if (level >= 2) {
      for (const x of [-0.55, 0.55]) {
        rbox(g, '#8a5a35', x, 0.12, 0.55, 0.7, 0.2, 0.22, 0.04);
        for (let i = 0; i < 5; i++) { ball(g, COLORS.foliage, x - 0.26 + i * 0.13, 0.26, 0.55, 0.08); ball(g, ['#f6a5b5', '#fff2c2', '#e8344f'][i % 3], x - 0.26 + i * 0.13, 0.33, 0.6, 0.045); }
      }
      for (const x of [-0.92, 0.92]) { cylinder(g, '#3d4a3f', x, 1.5, 0.05, 0.012, 0.25); ball(g, '#fff3c8', x, 1.36, 0.05, 0.07, 0.09, 0.07).material = glow; }
    }
    if (level >= 3) {
      rbox(g, COLORS.woodDark, 0, 2.18, -0.45, 1.3, 0.42, 0.06, 0.03);
      const sign = new THREE.Mesh(geometry('plane-v', () => new THREE.PlaneGeometry(1, 1)), new THREE.MeshBasicMaterial({ map: canvasTexture(256, 80, (c, w, h) => {
        c.fillStyle = '#2f3b33'; c.beginPath(); c.roundRect(4, 4, w - 8, h - 8, 12); c.fill();
        c.font = '44px "Lilita One", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#ffe48a'; c.fillText('FARM FRESH', w / 2, h / 2 + 2);
      }), toneMapped: false }));
      materials.set(`sign${materials.size}`, sign.material as THREE.Material);
      sign.scale.set(1.2, 0.36, 1); sign.position.set(0, 2.18, -0.41); g.add(sign);
      for (const [x, color] of [[-1.25, COLORS.tomato], [1.25, COLORS.strawberry]] as const) {
        const basket = crate(g, x, 0, 0.1, 0.4);
        for (let i = 0; i < 5; i++) ball(basket, color, (i % 3 - 1) * 0.1, 0.3 + Math.floor(i / 3) * 0.06, (i % 2 - 0.5) * 0.08, 0.08);
      }
    }
    return g;
  }
  function house() {
    const g = new THREE.Group();
    rbox(g, '#c9b28c', 0, 0.12, 0, 2.5, 0.24, 2.1, 0.05);
    rbox(g, '#fbf0d6', 0, 0.85, 0, 2.2, 1.3, 1.8, 0.05);
    for (const side of [-1, 1]) {
      const roof = rbox(g, COLORS.roof, 0, 1.78, side * 0.5, 2.5, 0.14, 1.25, 0.05); roof.rotation.x = side * 0.62;
    }
    rbox(g, '#e3d3b0', 0, 1.65, 0, 2.1, 0.5, 0.3, 0.03);
    rbox(g, '#a6503e', 0.65, 2.05, -0.35, 0.28, 0.6, 0.28, 0.03);
    rbox(g, '#8a5a35', 1.11, 0.62, 0.3, 0.05, 0.85, 0.5, 0.03);
    ball(g, COLORS.coin, 1.14, 0.62, 0.45, 0.03);
    for (const z of [-0.45]) { rbox(g, '#ffffff', 1.11, 0.9, z, 0.05, 0.45, 0.45, 0.03); rbox(g, '#9fd0e3', 1.13, 0.9, z, 0.03, 0.36, 0.36, 0.02).material = glow; }
    for (const x of [-0.5, 0.45]) { rbox(g, '#ffffff', x, 0.9, 0.91, 0.45, 0.45, 0.05, 0.03); rbox(g, '#9fd0e3', x, 0.9, 0.93, 0.36, 0.36, 0.03, 0.02).material = glow; }
    for (const x of [-0.5, 0.45]) rbox(g, '#e46a4f', x, 0.62, 1.0, 0.5, 0.12, 0.16, 0.04);
    return g;
  }
  // A chibi shopper or child built from rounded shapes. Limb pivots are named like the Catcha
  // models (arm-left, leg-right…) so the same walk code swings them.
  type Look = { height: number; skin: string; shirt: string; legs: string; hair: string; style: 'short' | 'bun' | 'long' | 'cap' | 'curly' | 'pony' | 'hat'; dress?: boolean; seed: number };
  function person(look: Look) {
    const root = new THREE.Group(), k = look.height / 1.45, body = new THREE.Group(); root.add(body); body.scale.setScalar(k);
    const limb = (name: string, x: number, y: number, color: string, end: string, length: number, width: number) => {
      const pivot = new THREE.Group(); pivot.name = name; pivot.position.set(x, y, 0); body.add(pivot);
      rbox(pivot, color, 0, -length / 2, 0, width, length, width, width / 2);
      ball(pivot, end, 0, -length + 0.02, name.startsWith('leg') ? 0.03 : 0, width * 0.62, width * 0.5, width * (name.startsWith('leg') ? 0.85 : 0.6));
      return pivot;
    };
    for (const side of [-1, 1]) limb(`leg-${side < 0 ? 'left' : 'right'}`, side * 0.09, 0.42, look.legs, '#3d3a3a', 0.36, 0.13);
    rbox(body, look.shirt, 0, 0.62, 0, 0.36, 0.42, 0.24, 0.1);
    if (look.dress) mesh(body, geometry('skirt', () => new THREE.CylinderGeometry(0.16, 0.27, 0.3, 16)), material(look.shirt), 0, 0.44, 0);
    for (const side of [-1, 1]) limb(`arm-${side < 0 ? 'left' : 'right'}`, side * 0.23, 0.78, look.shirt, look.skin, 0.3, 0.1).rotation.z = side * 0.12;
    const head = new THREE.Group(); head.position.y = 1.08; body.add(head);
    ball(head, look.skin, 0, 0, 0, 0.27, 0.25, 0.25);
    for (const side of [-1, 1]) {
      ball(head, '#2a2220', side * 0.09, 0.0, 0.225, 0.035, 0.045, 0.02);
      ball(head, '#ffffff', side * 0.09 + 0.012, 0.018, 0.24, 0.011);
      ball(head, '#f19a8a', side * 0.15, -0.07, 0.19, 0.045, 0.025, 0.02);
    }
    ball(head, '#7a3b30', 0, -0.1, 0.235, 0.04, 0.015, 0.015);
    const hair = (x: number, y: number, z: number, sx: number, sy = sx, sz = sx) => ball(head, look.hair, x, y, z, sx, sy, sz);
    if (look.style === 'hat') {
      hair(0, 0.02, -0.03, 0.27, 0.22, 0.27);
      cylinder(head, '#e8c46a', 0, 0.16, 0, 0.42, 0.03); cylinder(head, '#d9b257', 0, 0.25, 0, 0.2, 0.17); cylinder(head, '#c0503a', 0, 0.2, 0, 0.205, 0.05);
    } else if (look.style === 'cap') {
      mesh(head, geometry('cap', () => new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2)), material(look.hair), 0, 0.04, 0, 0.29, 0.24, 0.28);
      const brim = cylinder(head, look.hair, 0, 0.07, 0.2, 0.17, 0.025); brim.scale.z = 0.12; brim.rotation.x = 0.15;
    } else {
      mesh(head, geometry('cap', () => new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2)), material(look.hair), 0, 0.02, -0.02, 0.29, 0.27, 0.28);
      if (look.style === 'bun') hair(0, 0.27, -0.06, 0.11);
      if (look.style === 'pony') { hair(0, 0.1, -0.27, 0.08); hair(0, -0.04, -0.31, 0.06, 0.12, 0.06); }
      if (look.style === 'long') hair(0, -0.08, -0.12, 0.26, 0.28, 0.2);
      if (look.style === 'curly') { const r = seeded(look.seed); for (let i = 0; i < 9; i++) { const a = i * 0.7; hair(Math.cos(a) * 0.2, 0.12 + r() * 0.1, Math.sin(a) * 0.2 - 0.05, 0.1); } }
    }
    for (const part of [body, head]) part.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = true; });
    return root;
  }
  function lamp() {
    const g = new THREE.Group();
    cylinder(g, '#3d4a3f', 0, 0.06, 0, 0.13, 0.12);
    cylinder(g, '#3d4a3f', 0, 0.85, 0, 0.04, 1.6);
    rbox(g, '#3d4a3f', 0, 1.68, 0, 0.26, 0.05, 0.26, 0.02);
    const bulb = ball(g, '#fff3c8', 0, 1.82, 0, 0.12, 0.14, 0.12); bulb.material = glow;
    mesh(g, geometry('lampTop', () => new THREE.ConeGeometry(0.17, 0.14, 4)), material('#3d4a3f'), 0, 2.0, 0).rotation.y = Math.PI / 4;
    return g;
  }
  function fence(p: THREE.Object3D, ax: number, az: number, bx: number, bz: number) {
    const length = Math.hypot(bx - ax, bz - az), along = bx !== ax, posts = Math.max(1, Math.round(length / 1.1));
    for (let i = 0; i <= posts; i++) rbox(p, '#a8754a', ax + (bx - ax) * i / posts, 0.35, az + (bz - az) * i / posts, 0.12, 0.7, 0.12, 0.03);
    for (const y of [0.3, 0.55]) rbox(p, '#c48f5c', (ax + bx) / 2, y, (az + bz) / 2, along ? length : 0.06, 0.08, along ? 0.06 : length, 0.02);
  }
  // A sprinkler head on a short post; `arm` spins while it sprays.
  function sprinkler() {
    const g = new THREE.Group(), arm = new THREE.Group();
    cylinder(g, '#6f7a74', 0, 0.2, 0, 0.03, 0.4); ball(g, '#9aa6a0', 0, 0.42, 0, 0.06, 0.04, 0.06);
    arm.position.y = 0.45; g.add(arm); rbox(arm, '#b9c4be', 0, 0, 0, 0.28, 0.03, 0.04, 0.01); ball(arm, '#4f8fc9', 0.14, 0, 0, 0.025);
    g.userData.arm = arm;
    return g;
  }
  // A beehive: stacked painted boxes on legs with a little roof; bees are drawn by the scene.
  function beehive() {
    const g = new THREE.Group();
    for (const [x, z] of [[-0.18, -0.15], [0.18, -0.15], [-0.18, 0.15], [0.18, 0.15]]) rbox(g, COLORS.woodDark, x, 0.1, z, 0.05, 0.2, 0.05, 0.01);
    for (let i = 0; i < 3; i++) rbox(g, i % 2 ? '#f3e2b0' : '#fff3dc', 0, 0.3 + i * 0.2, 0, 0.5, 0.19, 0.44, 0.03);
    const roof = rbox(g, '#c9553f', 0, 0.94, 0, 0.6, 0.08, 0.54, 0.03); roof.rotation.x = 0.06;
    rbox(g, '#3a2a1e', 0, 0.25, 0.225, 0.2, 0.04, 0.02, 0.01);
    return g;
  }
  function coop() {
    const g = new THREE.Group();
    rbox(g, '#b8453a', 0, 0.62, 0, 2.0, 1.0, 1.0, 0.05);
    for (const side of [-1, 1]) { const roof = rbox(g, '#6e4a36', 0, 1.33, side * 0.32, 2.2, 0.1, 0.78, 0.04); roof.rotation.x = side * 0.62; }
    rbox(g, '#fff3dc', 0, 0.14, 0, 2.1, 0.14, 1.06, 0.04);
    rbox(g, '#fff3dc', -0.55, 0.6, 0.52, 0.42, 0.6, 0.04, 0.02); rbox(g, '#6e4a36', -0.55, 0.55, 0.535, 0.32, 0.48, 0.03, 0.02);
    const ramp = rbox(g, '#c48f5c', -0.55, 0.15, 0.85, 0.32, 0.04, 0.6, 0.02); ramp.rotation.x = 0.45;
    for (const x of [0.25, 0.75]) { rbox(g, '#fff3dc', x, 0.85, 0.52, 0.3, 0.3, 0.03, 0.02); rbox(g, '#9fd0e3', x, 0.85, 0.535, 0.22, 0.22, 0.02, 0.01).material = glow; }
    return g;
  }
  function nestBox() {
    const g = new THREE.Group();
    rbox(g, '#a8754a', 0, 0.12, 0, 0.55, 0.24, 0.45, 0.04);
    ball(g, '#e9c66e', 0, 0.24, 0, 0.24, 0.07, 0.19);
    return g;
  }
  function hen(seed = 1) {
    const g = new THREE.Group(), body = new THREE.Group(), r = seeded(seed + 5), white = r() > 0.35;
    g.add(body);
    ball(body, white ? '#fbf6ec' : '#b8743e', 0, 0.22, 0, 0.17, 0.15, 0.2);
    ball(body, white ? '#f1e9da' : '#9a5a2e', 0, 0.3, -0.16, 0.08, 0.12, 0.06);
    ball(body, white ? '#fbf6ec' : '#b8743e', 0, 0.38, 0.13, 0.1);
    ball(body, '#e2463a', 0, 0.49, 0.13, 0.035, 0.05, 0.06);
    ball(body, '#f3b23a', 0, 0.37, 0.24, 0.035, 0.025, 0.05);
    for (const side of [-1, 1]) ball(body, '#1e1a18', side * 0.06, 0.4, 0.2, 0.018);
    for (const side of [-1, 1]) cylinder(g, '#f3b23a', side * 0.06, 0.05, 0, 0.015, 0.1);
    g.userData.body = body;
    return g;
  }
  function signboard() {
    const g = new THREE.Group();
    for (const x of [-0.45, 0.45]) rbox(g, COLORS.woodDark, x, 0.55, 0, 0.08, 1.1, 0.08, 0.02);
    rbox(g, COLORS.wood, 0, 0.95, 0, 1.15, 0.55, 0.07, 0.03);
    const plate = new THREE.Mesh(geometry('plane-v', () => new THREE.PlaneGeometry(1, 1)), new THREE.MeshBasicMaterial({ map: canvasTexture(256, 112, (c, w, h) => {
      c.fillStyle = '#fff3d6'; c.beginPath(); c.roundRect(6, 6, w - 12, h - 12, 18); c.fill();
      c.font = '48px "Lilita One", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#5a3a20'; c.fillText('Upgrades', w / 2, h / 2 + 3);
    }), toneMapped: false }));
    materials.set(`sign${materials.size}`, plate.material as THREE.Material);
    plate.scale.set(1.0, 0.44, 1); plate.position.set(0, 0.95, 0.07); g.add(plate);
    return g;
  }
  // Decorations: each returns its group; the windmill also hands back its sails to turn.
  function decoration(id: 'arch' | 'scarecrow' | 'benches' | 'fountain' | 'windmill') {
    const g = new THREE.Group(), r = seeded(id.length * 31);
    if (id === 'arch') {
      for (const x of [-0.9, 0.9]) rbox(g, '#f3ead2', x, 0.9, 0, 0.12, 1.8, 0.12, 0.03);
      for (let i = 0; i <= 14; i++) {
        const a = Math.PI * i / 14, x = Math.cos(a) * 0.9, y = 1.8 + Math.sin(a) * 0.55;
        ball(g, COLORS.foliage, x, y, 0, 0.13); ball(g, ['#f6a5b5', '#fff2c2', '#e8344f'][i % 3], x + (r() - 0.5) * 0.1, y + 0.05, 0.1, 0.07);
      }
    } else if (id === 'scarecrow') {
      cylinder(g, COLORS.woodDark, 0, 0.8, 0, 0.04, 1.6); rbox(g, COLORS.woodDark, 0, 1.2, 0, 1.0, 0.06, 0.06, 0.02);
      rbox(g, '#5a7fb0', 0, 1.1, 0, 0.42, 0.45, 0.22, 0.08); ball(g, COLORS.burlap, 0, 1.52, 0, 0.17);
      cylinder(g, '#e8c46a', 0, 1.66, 0, 0.3, 0.03); cylinder(g, '#d9b257', 0, 1.74, 0, 0.14, 0.14);
      for (const side of [-1, 1]) ball(g, '#e8c46a', side * 0.52, 1.18, 0, 0.07, 0.05, 0.05);
    } else if (id === 'benches') {
      for (const x of [-0.75, 0.75]) {
        const b = new THREE.Group(); b.position.x = x; g.add(b);
        rbox(b, '#a8754a', 0, 0.42, 0, 1.0, 0.06, 0.36, 0.02); rbox(b, '#a8754a', 0, 0.68, -0.16, 1.0, 0.24, 0.05, 0.02);
        for (const lx of [-0.42, 0.42]) rbox(b, '#3d4a3f', lx, 0.2, 0, 0.06, 0.4, 0.34, 0.02);
      }
      ball(g, COLORS.foliage, 0, 0.3, -0.05, 0.25); ball(g, '#f6a5b5', 0, 0.5, 0.05, 0.08);
    } else if (id === 'fountain') {
      cylinder(g, COLORS.stone, 0, 0.15, 0, 0.62, 0.3); cylinder(g, '#8fd0e8', 0, 0.32, 0, 0.54, 0.02);
      cylinder(g, COLORS.stone, 0, 0.55, 0, 0.1, 0.6); cylinder(g, COLORS.stone, 0, 0.85, 0, 0.3, 0.1); cylinder(g, '#8fd0e8', 0, 0.92, 0, 0.25, 0.02);
      ball(g, '#cdeefa', 0, 1.0, 0, 0.08, 0.14, 0.08);
    } else {
      const h = 4.2;
      mesh(g, geometry('tower', () => new THREE.CylinderGeometry(0.55, 1.0, 1, 16)), material('#f3ead2'), 0, h / 2, 0, 1, h, 1);
      mesh(g, geometry('towerCap', () => new THREE.ConeGeometry(0.72, 0.9, 16)), material(COLORS.roof), 0, h + 0.4, 0);
      rbox(g, '#8a5a35', 0, 0.45, 0.95, 0.4, 0.8, 0.06, 0.03);
      const sails = new THREE.Group(); sails.position.set(0, h - 0.1, 0.75); g.add(sails);
      for (let i = 0; i < 4; i++) {
        const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2; sails.add(arm);
        rbox(arm, '#8a5a35', 0, 1.1, 0, 0.08, 2.2, 0.05, 0.02); rbox(arm, '#fff6e6', 0.18, 1.35, 0.02, 0.32, 1.5, 0.02, 0.01);
      }
      ball(sails, '#6e4a36', 0, 0, 0.04, 0.12);
      g.userData.sails = sails;
    }
    return g;
  }
  return {
    beehive, sprinkler, fence, coop, nestBox, hen, signboard, decoration,
    glow, person, lamp, material, box, rbox, ball, cylinder, surface, decal, label, canvasTexture, hedge, balustrade, cypress, roundTree, bush, crate, crop, fieldBed, seedStand, market, house,
    dispose() { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); }
  };
}
export type FarmProps = ReturnType<typeof createFarmProps>;

// Canvas helpers for the painted ground tiles.
export function tile(c: CanvasRenderingContext2D, w: number, h: number, { fill = '#ffffff22', stroke = '#ffffff', dash = [] as number[], radius = 0.16 } = {}) {
  const line = Math.min(w, h) * 0.05, r = Math.min(w, h) * radius;
  c.beginPath(); c.roundRect(line, line, w - line * 2, h - line * 2, r);
  c.fillStyle = fill; c.fill(); c.setLineDash(dash.map(d => d * line)); c.lineWidth = line; c.strokeStyle = stroke; c.stroke(); c.setLineDash([]);
}
export function tileText(c: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color = '#ffffff') {
  c.font = `${size}px "Lilita One", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineJoin = 'round'; c.lineWidth = size * 0.16; c.strokeStyle = '#00000022'; c.strokeText(text, x, y + size * 0.06); c.fillStyle = color; c.fillText(text, x, y);
}
export function coinIcon(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.fillStyle = '#d39729'; c.beginPath(); c.arc(x, y + r * 0.12, r, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#f7c74f'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.font = `${r * 1.3}px "Lilita One", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#9a661c'; c.fillText('$', x, y + r * 0.06);
}
export function cropIcon(c: CanvasRenderingContext2D, crop: Product, x: number, y: number, r: number) {
  c.beginPath();
  if (crop === 'tomato') { c.fillStyle = '#e5463a'; c.arc(x, y, r, 0, Math.PI * 2); }
  else if (crop === 'cucumber') { c.fillStyle = '#3f8a35'; c.ellipse(x, y, r * 0.55, r * 1.1, 0.6, 0, Math.PI * 2); }
  else if (crop === 'egg') { c.fillStyle = '#fbf1dc'; c.ellipse(x, y + r * 0.05, r * 0.72, r * 0.95, 0, 0, Math.PI * 2); }
  else if (crop === 'apple') { c.fillStyle = '#d8402f'; c.arc(x - r * 0.3, y, r * 0.75, 0, Math.PI * 2); c.arc(x + r * 0.3, y, r * 0.75, 0, Math.PI * 2); }
  else if (crop === 'honey') { c.fillStyle = '#f0a32a'; c.roundRect(x - r * 0.75, y - r * 0.6, r * 1.5, r * 1.5, r * 0.3); c.fill(); c.beginPath(); c.fillStyle = '#c9553f'; c.roundRect(x - r * 0.85, y - r * 0.95, r * 1.7, r * 0.45, r * 0.15); }
  else { c.fillStyle = '#e8344f'; c.moveTo(x, y + r * 1.05); c.bezierCurveTo(x - r * 1.3, y - r * 0.1, x - r * 0.7, y - r * 0.95, x, y - r * 0.7); c.bezierCurveTo(x + r * 0.7, y - r * 0.95, x + r * 1.3, y - r * 0.1, x, y + r * 1.05); }
  c.fill();
  if (crop === 'strawberry') { c.fillStyle = '#ffe9a0'; for (const [dx, dy] of [[-0.3, -0.2], [0.3, -0.2], [0, 0.15], [-0.25, 0.4], [0.25, 0.4]]) { c.beginPath(); c.arc(x + dx * r, y + dy * r, r * 0.07, 0, Math.PI * 2); c.fill(); } }
  c.fillStyle = '#ffffff55'; c.beginPath(); c.ellipse(x - r * 0.3, y - r * 0.35, r * 0.25, r * 0.15, -0.6, 0, Math.PI * 2); c.fill();
  if (crop === 'egg' || crop === 'honey') return;
  c.fillStyle = '#4f9a3c'; c.beginPath(); c.ellipse(x + (crop === 'cucumber' ? r * 0.45 : 0), y - r * (crop === 'cucumber' ? 0.85 : 0.9), r * 0.35, r * 0.16, 0.3, 0, Math.PI * 2); c.fill();
}

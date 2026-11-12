import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAINTS } from './steps';

// The workshop around the bike, built from simple shapes and canvas textures (a few draw calls, no downloads).
// Game axes: x forward along the bike, y up, z towards the usual camera. The back wall is behind the bike (−z),
// the workbench behind its tail (−x) and the roller door ahead of it (+x), open onto a sunny day.
export const ROOM = { back: -2.7, left: -4.6, right: 4.8, height: 3.3, doorWidth: 3.0 };

function canvasTexture(w: number, h: number, paint: (c: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  paint(canvas.getContext('2d')!);
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const rand = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function concrete() {
  return canvasTexture(1024, 1024, c => {
    const r = rand(7);
    c.fillStyle = '#a7a39b'; c.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 26; i++) { // soft blotches: the floor has been mopped a thousand times
      const x = r() * 1024, y = r() * 1024, g = c.createRadialGradient(x, y, 0, x, y, 80 + r() * 220);
      g.addColorStop(0, `rgba(${r() > 0.5 ? '120,116,108' : '190,186,176'},0.18)`); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, 1024, 1024);
    }
    for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(${r() > 0.5 ? '60,58,54' : '235,232,224'},${0.05 + r() * 0.12})`; c.fillRect(r() * 1024, r() * 1024, 1.6, 1.6); }
    c.strokeStyle = 'rgba(70,66,60,0.35)'; c.lineWidth = 3; c.strokeRect(0, 0, 1024, 1024); // saw-cut joints every 2 m
  }, [7, 6]);
}
function blockWall() {
  return canvasTexture(1024, 1024, c => {
    const r = rand(3);
    c.fillStyle = '#d9d2c3'; c.fillRect(0, 0, 1024, 1024);
    const bw = 256, bh = 128;
    for (let row = 0; row < 8; row++) for (let col = -1; col < 5; col++) {
      const x = col * bw + (row % 2) * bw / 2, y = row * bh, shade = 214 + Math.floor(r() * 14);
      c.fillStyle = `rgb(${shade},${shade - 6},${shade - 18})`; c.fillRect(x + 4, y + 4, bw - 8, bh - 8);
    }
    c.fillStyle = '#5f7f8c'; c.fillRect(0, 640, 1024, 384);            // painted dado, the bottom 1.2 m
    c.fillStyle = 'rgba(255,255,255,0.08)';
    for (let row = 5; row < 8; row++) for (let col = -1; col < 5; col++) c.fillRect(col * bw + (row % 2) * bw / 2 + 4, row * bh + 4, bw - 8, 3);
    c.fillStyle = '#4c6a76'; c.fillRect(0, 636, 1024, 10);
  }, [5, 1]);
}
function pegboard() {
  return canvasTexture(1024, 512, c => {
    c.fillStyle = '#c99c62'; c.fillRect(0, 0, 1024, 512);
    c.fillStyle = 'rgba(80,50,20,0.55)';
    for (let x = 16; x < 1024; x += 32) for (let y = 16; y < 512; y += 32) { c.beginPath(); c.arc(x, y, 4.5, 0, Math.PI * 2); c.fill(); }
    c.strokeStyle = '#8a6334'; c.lineWidth = 10; c.strokeRect(0, 0, 1024, 512);
  });
}
function shutter() {
  return canvasTexture(256, 512, c => {
    for (let y = 0; y < 512; y += 32) {
      const g = c.createLinearGradient(0, y, 0, y + 32); g.addColorStop(0, '#c9ccd0'); g.addColorStop(0.5, '#e6e8ea'); g.addColorStop(1, '#9ea3a8');
      c.fillStyle = g; c.fillRect(0, y, 256, 32);
    }
  }, [6, 1]);
}
/** A framed photo of a bike the child built, in its colour, with the stars from its first ride. */
export function bikePicture(color: string, stars: number) {
  return canvasTexture(256, 200, c => {
    c.fillStyle = '#fff8ea'; c.fillRect(0, 0, 256, 200);
    c.fillStyle = '#cfe7f5'; c.fillRect(14, 14, 228, 140);
    c.strokeStyle = '#2a2c30'; c.lineWidth = 9; c.lineCap = 'round'; c.lineJoin = 'round';
    for (const x of [70, 186]) { c.beginPath(); c.arc(x, 118, 28, 0, Math.PI * 2); c.stroke(); }
    c.lineWidth = 7; c.beginPath(); c.moveTo(70, 118); c.lineTo(112, 96); c.lineTo(150, 98); c.lineTo(186, 118); c.moveTo(150, 98); c.lineTo(168, 58); c.lineTo(156, 50); c.stroke();
    c.fillStyle = color; c.beginPath(); c.ellipse(130, 78, 30, 15, -0.08, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2a2c30'; c.fillRect(66, 76, 46, 12);
    c.fillStyle = '#f2b705'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center';
    c.fillText('★'.repeat(Math.min(3, Math.max(1, Math.ceil(stars / 8)))), 128, 190);
  });
}

function merged(parts: THREE.BufferGeometry[]) { return mergeGeometries(parts.map(g => g.index ? g.toNonIndexed() : g)); }

export function buildRoom(scene: THREE.Scene) {
  const group = new THREE.Group(); scene.add(group);
  const std = (color: THREE.ColorRepresentation, roughness = 0.7, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, cast = true) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; group.add(m); return m;
  };
  const W = ROOM.right - ROOM.left, cx = (ROOM.right + ROOM.left) / 2;

  // floor, rubber mat under the bike, and the oil stains every garage has
  const floor = add(new THREE.PlaneGeometry(40, 30), std('#ffffff', 0.86, 0, { map: concrete() }), 0, 0, 0, false);
  floor.rotation.x = -Math.PI / 2;
  const mat = add(new THREE.BoxGeometry(2.8, 0.012, 1.25), std('#2d3033', 0.95), 0, 0.006, 0, false);
  mat.receiveShadow = true;
  const stain = std('#4a463f', 0.35, 0, { transparent: true, opacity: 0.16, depthWrite: false });
  for (const [x, z, r] of [[1.6, 1.1, 0.16], [-2.0, 0.9, 0.2]]) { const s = add(new THREE.CircleGeometry(r, 24), stain, x, 0.002, z, false); s.rotation.x = -Math.PI / 2; s.scale.set(1, 0.7, 1); }

  // walls: back, the tail end, and the door wall with its opening
  const wallMat = std('#ffffff', 0.92, 0, { map: blockWall() });
  add(new THREE.PlaneGeometry(W, ROOM.height), wallMat, cx, ROOM.height / 2, ROOM.back, false);
  const side = add(new THREE.PlaneGeometry(8, ROOM.height), std('#ffffff', 0.92, 0, { map: blockWall() }), ROOM.left, ROOM.height / 2, 1.3, false);
  side.rotation.y = Math.PI / 2;
  const doorZ = 0.6, half = ROOM.doorWidth / 2, plain = std('#d6cfbf', 0.92);
  for (const [z0, z1] of [[ROOM.back, doorZ - half], [doorZ + half, 5.3]]) {
    const w = add(new THREE.PlaneGeometry(z1 - z0, ROOM.height), plain, ROOM.right, ROOM.height / 2, (z0 + z1) / 2, false); w.rotation.y = -Math.PI / 2;
  }
  const lintel = add(new THREE.PlaneGeometry(ROOM.doorWidth, 0.7), plain, ROOM.right, ROOM.height - 0.35, doorZ, false); lintel.rotation.y = -Math.PI / 2;
  const ceiling = add(new THREE.PlaneGeometry(W, 8), std('#f1ece2', 1), cx, ROOM.height, 1.3, false); ceiling.rotation.x = Math.PI / 2;

  // the roller door, rolled up under the lintel, and the bright day beyond it
  const roll = add(new THREE.CylinderGeometry(0.2, 0.2, ROOM.doorWidth + 0.2, 24), std('#ffffff', 0.4, 0.6, { map: shutter() }), ROOM.right - 0.25, ROOM.height - 0.28, doorZ);
  roll.rotation.x = Math.PI / 2;
  const door = add(new THREE.PlaneGeometry(ROOM.doorWidth, ROOM.height - 0.7), std('#ffffff', 0.45, 0.5, { map: shutter(), side: THREE.DoubleSide }),
    ROOM.right - 0.05, (ROOM.height - 0.7) / 2, doorZ);
  door.rotation.y = -Math.PI / 2; door.visible = false;
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), new THREE.MeshBasicMaterial({ color: '#cfeaff', toneMapped: false }));
  outside.position.set(ROOM.right + 3, 3, doorZ); outside.rotation.y = -Math.PI / 2; group.add(outside);
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(10, 14), new THREE.MeshBasicMaterial({ color: '#8fca6a', toneMapped: false }));
  lawn.rotation.x = -Math.PI / 2; lawn.position.set(ROOM.right + 5, 0.001, doorZ); group.add(lawn);
  const drive = new THREE.Mesh(new THREE.PlaneGeometry(10, ROOM.doorWidth - 0.4), new THREE.MeshBasicMaterial({ color: '#c9c3b6', toneMapped: false }));
  drive.rotation.x = -Math.PI / 2; drive.position.set(ROOM.right + 5, 0.003, doorZ); group.add(drive);
  // the garden: a hedge along the back and a tree, then a haze of daylight in the doorway so outside reads as bright and soft
  const leaf = std('#5d9a45', 0.95, 0, { flatShading: true });
  add(new THREE.BoxGeometry(0.7, 1.0, 9), leaf, ROOM.right + 2.95, 0.5, doorZ, false);
  add(new THREE.CylinderGeometry(0.09, 0.13, 1.6, 8), std('#7a5232', 0.9), ROOM.right + 2.4, 0.8, doorZ - 2.1, false);
  add(new THREE.IcosahedronGeometry(0.85, 1), leaf, ROOM.right + 2.4, 2.1, doorZ - 2.1, false);
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.doorWidth, ROOM.height - 0.7),
    new THREE.MeshBasicMaterial({ color: '#fffaf0', transparent: true, opacity: 0.32, depthWrite: false, toneMapped: false }));
  haze.position.set(ROOM.right + 0.02, (ROOM.height - 0.7) / 2, doorZ); haze.rotation.y = -Math.PI / 2; haze.renderOrder = 3; group.add(haze);

  // pegboard with its tools, over the workbench behind the bike's tail
  const board = add(new THREE.PlaneGeometry(2.6, 1.2), std('#ffffff', 0.9, 0, { map: pegboard() }), -2.2, 1.75, ROOM.back + 0.02, false);
  board.receiveShadow = true;
  const steel = std('#c7ccd2', 0.32, 0.9), red = std('#d63a2f', 0.45), yellow = std('#f0b20a', 0.5), blue = std('#2f6fd6', 0.5), dark = std('#2b2e33', 0.6);
  const toolZ = ROOM.back + 0.05;
  for (let i = 0; i < 5; i++) { // spanners, smallest to largest
    const len = 0.22 + i * 0.04, x = -3.25 + i * 0.12;
    add(new THREE.BoxGeometry(0.022 + i * 0.003, len, 0.008), steel, x, 1.85, toolZ);
    add(new THREE.TorusGeometry(0.022 + i * 0.003, 0.009, 8, 16), steel, x, 1.85 + len / 2, toolZ);
  }
  add(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 10), std('#8a5a2b', 0.7), -2.45, 1.8, toolZ);   // hammer handle
  add(new THREE.BoxGeometry(0.15, 0.05, 0.05), dark, -2.45, 1.97, toolZ);
  for (const [x, m] of [[-2.15, red], [-2.03, yellow], [-1.91, blue]] as const) {                   // screwdrivers
    add(new THREE.CylinderGeometry(0.02, 0.022, 0.11, 12), m, x, 2.0, toolZ);
    add(new THREE.CylinderGeometry(0.005, 0.005, 0.16, 8), steel, x, 1.87, toolZ);
  }
  add(new THREE.BoxGeometry(0.06, 0.24, 0.02), red, -1.62, 1.86, toolZ);                            // pliers' grips
  add(new THREE.TorusGeometry(0.11, 0.012, 8, 28, Math.PI * 1.3), std('#2a2c30', 0.6), -1.3, 1.82, toolZ); // a coiled air line

  // workbench with a vice and a red roll cab
  const wood = std('#b9864f', 0.7), benchX = -2.25, benchZ = ROOM.back + 0.42;
  add(new THREE.BoxGeometry(2.4, 0.06, 0.75), wood, benchX, 0.92, benchZ);
  for (const dx of [-1.1, 1.1]) for (const dz of [-0.3, 0.3]) add(new THREE.BoxGeometry(0.06, 0.9, 0.06), dark, benchX + dx, 0.45, benchZ + dz);
  add(new THREE.BoxGeometry(2.3, 0.04, 0.68), wood, benchX, 0.22, benchZ);
  add(new THREE.BoxGeometry(0.2, 0.13, 0.14), std('#3c5f8a', 0.5, 0.3), benchX + 0.85, 1.02, benchZ + 0.22);
  const cab = std('#c8281f', 0.38, 0.2), chromeHandle = std('#dfe3e6', 0.2, 1);
  add(new THREE.BoxGeometry(0.72, 0.92, 0.5), cab, -3.85, 0.5, ROOM.back + 0.5);
  for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.5, 0.025, 0.02), chromeHandle, -3.85, 0.22 + i * 0.16, ROOM.back + 0.76);
  for (const dx of [-0.3, 0.3]) for (const dz of [-0.18, 0.18]) add(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 12), dark, -3.85 + dx, 0.025, ROOM.back + 0.5 + dz);

  // shelf of paint tins (the colours the child can choose), oil and a helmet, to the right of the pegboard
  const shelfX = 1.9, shelfZ = ROOM.back + 0.22;
  for (const y of [1.25, 1.85]) add(new THREE.BoxGeometry(1.8, 0.04, 0.36), wood, shelfX, y, shelfZ);
  for (const dx of [-0.85, 0.85]) add(new THREE.BoxGeometry(0.04, 0.4, 0.04), dark, shelfX + dx, 1.05, shelfZ - 0.15);
  PAINTS.forEach((p, i) => {
    add(new THREE.CylinderGeometry(0.075, 0.075, 0.16, 20), std(p.color, 0.35, 0.2), shelfX - 0.72 + i * 0.24, 1.35, shelfZ);
    add(new THREE.CylinderGeometry(0.076, 0.076, 0.02, 20), steel, shelfX - 0.72 + i * 0.24, 1.44, shelfZ);
  });
  for (let i = 0; i < 4; i++) add(new THREE.CylinderGeometry(0.05, 0.06, 0.24, 14), std(['#1f6b48', '#e2b23c', '#1f6b48', '#a3121e'][i], 0.4), shelfX - 0.6 + i * 0.16, 1.99, shelfZ);
  const helmet = add(new THREE.SphereGeometry(0.15, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.62), std('#fdfdfd', 0.25, 0.1), shelfX + 0.55, 1.9, shelfZ);
  helmet.rotation.z = 0.3;

  // a tyre stack and an oil drum by the end wall
  const rubber = std('#1d1e20', 0.85);
  const tyres = merged([0, 1, 2].map(i => new THREE.TorusGeometry(0.28, 0.1, 14, 36).rotateX(Math.PI / 2).translate(0, 0.1 + i * 0.2, 0)));
  add(tyres, rubber, -3.9, 0, 1.0);
  add(new THREE.CylinderGeometry(0.3, 0.3, 0.88, 28), std('#2d63b3', 0.45, 0.3), -3.95, 0.44, 2.1);
  add(new THREE.CylinderGeometry(0.305, 0.305, 0.03, 28), std('#24508f', 0.45, 0.3), -3.95, 0.6, 2.1);

  // strip lights: their glow, and the light they actually give
  const glow = new THREE.MeshBasicMaterial({ color: '#fffaf0', toneMapped: false });
  for (const x of [-1.6, 1.6]) {
    add(new THREE.BoxGeometry(1.4, 0.06, 0.16), std('#e8e8e4', 0.6), x, ROOM.height - 0.05, 0.2, false);
    const tube = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.02, 0.1), glow); tube.position.set(x, ROOM.height - 0.09, 0.2); group.add(tube);
  }

  // photos of the bikes the child has built, on the wall above the shelf
  const photos = new THREE.Group(); group.add(photos);
  const frameMat = std('#2b2e33', 0.5);
  function setPhotos(bikes: { paint: string; stars: number }[]) {
    for (const child of [...photos.children]) { photos.remove(child); child.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); const m = o.material as THREE.MeshStandardMaterial; if (m !== frameMat) { m.map?.dispose(); m.dispose(); } } }); }
    bikes.slice(-8).forEach((b, i) => {
      const frame = new THREE.Group(), x = 0.95 + (i % 4) * 0.52, y = 2.55 - Math.floor(i / 4) * 0.42;
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.35, 0.02), frameMat);
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.31), new THREE.MeshStandardMaterial({ map: bikePicture(PAINTS.find(p => p.id === b.paint)?.color ?? '#a3121e', b.stars), roughness: 0.6 }));
      pic.position.z = 0.012; frame.add(back, pic); frame.position.set(x, y, ROOM.back + 0.02); frame.rotation.z = (i % 3 - 1) * 0.03;
      photos.add(frame);
    });
  }

  return {
    group, door, setPhotos,
    dispose() {
      group.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of [o.material].flat()) { (m as THREE.MeshStandardMaterial).map?.dispose(); m.dispose(); } } });
      scene.remove(group);
    }
  };
}

/** The red build stand: a base on the floor and four rubber-topped posts under the frame's cradle rails. */
export function buildStand() {
  const group = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: '#cf2c22', roughness: 0.4, metalness: 0.2 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#1b1c1e', roughness: 0.8 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.44), red); base.position.set(0.1, 0.02, 0);
  const posts = new THREE.Group();
  // thin enough to stand clear of the exhaust collector between the rails
  for (const x of [0.27, 0.0]) for (const z of [-0.12, 0.12]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.12, 12), red); post.position.set(x, 0.09, z);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.018, 0.028), rubber); pad.position.set(x, 0.142, z);
    posts.add(post, pad);
  }
  for (const m of [base]) { m.castShadow = true; m.receiveShadow = true; }
  posts.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.add(base, posts);
  return { group, posts };
}

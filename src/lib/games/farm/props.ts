import * as THREE from 'three';
import type { Crop } from './model';

export function createFarmProps() {
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  function material(color: string) {
    let m = materials.get(color);
    if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.88 }); materials.set(color, m); }
    return m;
  }
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const sphereGeometry = new THREE.SphereGeometry(1, 8, 6);
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 10);
  function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
    const m = new THREE.Mesh(geometry, material(color)); m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    m.castShadow = sy > 0.12; m.receiveShadow = true; parent.add(m); return m;
  }
  const box = (parent: THREE.Object3D, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) => mesh(parent, boxGeometry, color, x, y, z, sx, sy, sz);
  const ball = (parent: THREE.Object3D, color: string, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) => mesh(parent, sphereGeometry, color, x, y, z, sx, sy, sz);
  const cylinder = (parent: THREE.Object3D, color: string, x: number, y: number, z: number, r: number, height: number) => mesh(parent, cylinderGeometry, color, x, y, z, r, height, r);
  function label(text: string, color = '#294d35', bg = '#fff6df', width = 1.65) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 144;
    const c = canvas.getContext('2d')!;
    c.fillStyle = bg; c.beginPath(); c.roundRect(2, 2, 508, 140, 32); c.fill();
    c.font = 'bold 56px "Lilita One", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(text, 256, 76);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false })); sprite.scale.set(width, width * 144 / 512, 1); return sprite;
  }
  function crate(parent: THREE.Object3D, x: number, y: number, z: number, size = 0.55) {
    const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
    box(g, '#bc8343', 0, 0.16, 0, size, 0.32, size * 0.7);
    box(g, '#e0ae65', 0, 0.31, -size * 0.36, size + 0.04, 0.09, 0.07);
    box(g, '#e0ae65', 0, 0.31, size * 0.36, size + 0.04, 0.09, 0.07);
    for (const a of [-1, 1]) box(g, '#d59d58', a * size * 0.42, 0.18, 0, 0.05, 0.32, size * 0.75);
    return g;
  }
  function crop(kind: Crop) {
    const group = new THREE.Group();
    cylinder(group, '#467741', 0, 0.25, 0, 0.035, 0.5);
    for (let i = 0; i < 3; i++) {
      const a = i * 2.09;
      const leaf = ball(group, i % 2 ? '#4e983e' : '#68ae43', Math.sin(a) * 0.17, 0.22 + i * 0.1, Math.cos(a) * 0.17, 0.19, 0.075, 0.12);
      leaf.rotation.z = Math.sin(a) * 0.4;
    }
    const fruit = new THREE.Group(); group.add(fruit);
    for (let i = 0; i < 3; i++) {
      const a = i * 2.09;
      ball(fruit, kind === 'tomato' ? '#ed5840' : '#387f39', Math.cos(a) * 0.18, 0.32 + i * 0.04, Math.sin(a) * 0.18,
        kind === 'tomato' ? 0.13 : 0.075, kind === 'tomato' ? 0.12 : 0.21, 0.12);
    }
    return { group, fruit };
  }
  function seedStand(kind: Crop) {
    const group = new THREE.Group();
    box(group, '#a76c3b', 0, 0.4, 0, 0.95, 0.15, 0.65);
    for (const x of [-0.37, 0.37]) box(group, '#805337', x, 0.2, 0, 0.09, 0.4, 0.52);
    for (let i = 0; i < 3; i++) {
      const bag = ball(group, '#e8cc91', (i - 1) * 0.25, 0.66, 0, 0.15, 0.25, 0.17);
      bag.rotation.z = (i - 1) * 0.12;
      ball(group, kind === 'tomato' ? '#ed5840' : '#397d39', (i - 1) * 0.25, 0.67, 0.155, 0.07);
    }
    const sign = label('Free seeds', '#42603c', '#fff6df', 1.35); sign.position.set(0, 1.28, 0); group.add(sign);
    return group;
  }
  function market() {
    const g = new THREE.Group();
    box(g, '#ba7b42', 0, 0.45, 0, 1.65, 0.9, 0.82);
    box(g, '#f0c97d', 0, 0.95, 0, 1.8, 0.15, 0.95);
    for (const x of [-0.78, 0.78]) box(g, '#795339', x, 1.25, 0.28, 0.08, 2.5, 0.08);
    for (let i = 0; i < 7; i++) {
      const roof = box(g, i % 2 ? '#fff3cd' : '#ed7150', (i - 3) * 0.28, 2.35, -0.04, 0.28, 0.13, 1.28); roof.rotation.x = 0.1;
      box(g, i % 2 ? '#fff3cd' : '#ed7150', (i - 3) * 0.28, 2.21, 0.58, 0.28, 0.23, 0.06);
    }
    crate(g, -0.46, 1.04, 0, 0.55); crate(g, 0.3, 1.04, 0, 0.55);
    for (let i = 0; i < 5; i++) ball(g, '#ed5840', -0.6 + (i % 3) * 0.14, 1.43, (i % 2) * 0.16, 0.095);
    const sign = label('Market', '#fff6df', '#37523b', 1.42); sign.position.set(0, 1.84, 0.48); g.add(sign);
    return g;
  }
  function tree(height = 2) {
    const g = new THREE.Group(); cylinder(g, '#96613c', 0, height * 0.34, 0, 0.12, height * 0.7);
    ball(g, '#487b39', 0, height * 0.84, 0, height * 0.35, height * 0.43, height * 0.35);
    ball(g, '#6b9d41', -0.2, height * 0.98, 0.15, height * 0.24, height * 0.3, height * 0.25); return g;
  }
  function marker(color: string, radius = 0.65) {
    const m = new THREE.Mesh(new THREE.RingGeometry(radius - 0.045, radius, 48), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.035; return m;
  }
  return { box, ball, cylinder, label, crate, crop, seedStand, market, tree, marker,
    dispose() { boxGeometry.dispose(); sphereGeometry.dispose(); cylinderGeometry.dispose(); materials.forEach(m => m.dispose()); }
  };
}

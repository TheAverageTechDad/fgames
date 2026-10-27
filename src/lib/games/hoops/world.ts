import * as THREE from 'three';
import { mergeByMaterial, seeded, type FarmProps } from '../farm/props';
import { COURT, FENCE } from './court';

/** The street lamps behind the back fence; they come on at dusk. */
export const LAMPS = [-7.5, -2.6, 2.6, 7.5].map(x => ({ x, z: FENCE.back - 0.75 }));

/**
 * The neighbourhood around the court, built from Pocket Farm's props so the arcade's worlds match: a textured lawn,
 * a hedge and sidewalk with street lamps behind the back fence, a row of trees and a quiet street of houses beyond,
 * trees, flowering bushes and a bench past the side fences, and a few bushes on the near grass (its middle left clear
 * for the thumb). Seeded, so it dresses itself the same way every visit, and merged into a few draw calls.
 */
export function buildHoopsWorld(props: FarmProps, root: THREE.Object3D) {
  const r = seeded(12);
  const put = (o: THREE.Object3D, x: number, z: number, ry = 0, s = 1) => { o.position.set(x, 0, z); o.rotation.y = ry; o.scale.setScalar(s); root.add(o); return o; };
  const jitter = (n: number) => (r() - 0.5) * n;

  props.surface(root, 'grass', 0, -0.012, 4, 70, 70, 2);
  // Behind the back fence: hedge, sidewalk, lamps, trees, then the houses across the street.
  const back = FENCE.back;
  props.hedge(root, 0, back - 0.35, FENCE.side * 2 + 6, 0.45, 0.5);
  props.surface(root, 'paver', 0, 0.004, back - 1.3, 34, 1.3, 1.2);
  for (const at of LAMPS) put(props.lamp(), at.x, at.z);
  for (let x = -14; x <= 14; x += 2.3) {
    if (Math.abs(x) < 1.2) continue; // keep the space right behind the backboard open
    put(r() < 0.3 ? props.cypress(2.6 + r() * 0.8) : props.roundTree(2.6 + r() * 1.1, Math.round(r() * 50)), x + jitter(0.8), back - 2.4 + jitter(0.6), r() * 6.3);
  }
  // No house straight behind the backboard: green trees there keep the rim easy to read.
  for (const [x, s] of [[-10.5, 1.5], [-5.4, 1.4], [5.4, 1.45], [10.5, 1.5]]) put(props.house(), x, back - 6 + jitter(0.6), 0, s);
  put(props.roundTree(4.2, 21), 0.4, back - 6.5, 0, 1.2);
  for (let x = -13; x <= 13; x += 3.4) put(props.roundTree(3.2 + r() * 1.2, Math.round(r() * 50)), x + jitter(1), back - 9.5 + jitter(0.8), r() * 6.3);

  // Past the side fences: a line of trees with flowering bushes in front, and a bench facing the court.
  const flowers = ['#fff2c2', '#f6a5b5', '#ffd27a', '#e8344f'];
  for (const side of [-1, 1]) {
    for (let z = back; z <= COURT.depth + 5; z += 2.2) {
      put(r() < 0.25 ? props.cypress(2.4 + r() * 0.8) : props.roundTree(2.5 + r() * 1.2, Math.round(r() * 50)), side * (FENCE.side + 2.4 + jitter(1)), z + jitter(0.8), r() * 6.3);
      if (r() < 0.6) put(props.bush(0.35 + r() * 0.2, Math.round(r() * 50), flowers[Math.floor(r() * flowers.length)]), side * (FENCE.side + 0.8 + r() * 0.5), z + jitter(1));
    }
    put(props.roundTree(3.6, 7 + side), side * (FENCE.side + 5.5), 3 + side, 0, 1.1);
  }
  put(props.decoration('benches'), FENCE.side + 1.2, 3.2, -Math.PI / 2, 0.9);

  // The near grass: bushes off to the sides only.
  for (const [x, z] of [[-4.6, 10.2], [5.1, 10.6], [-6.4, 12.6], [6.8, 12.8], [-3.2, 13.6], [3.9, 13.9]]) put(props.bush(0.4 + r() * 0.15, Math.round(r() * 50), flowers[Math.floor(r() * flowers.length)]), x, z);
  return mergeByMaterial(root);
}

/** Pocket Farm's birds: soft, blurred flocks crossing the top of the screen now and then, trailing faint shadows.
 * `sun` is the live sun offset, so the shadows swing round with the time of day. */
export function createBirds(scene: THREE.Scene, props: FarmProps, sun: THREE.Vector3) {
  const frames = [0, 1].map(frame => props.canvasTexture(128, 64, c => {
    c.filter = 'blur(3px)'; c.fillStyle = '#2b3a33';
    const up = frame ? -14 : 12;
    c.beginPath(); c.moveTo(14, 32 + up); c.quadraticCurveTo(40, 28, 64, 36); c.quadraticCurveTo(88, 28, 114, 32 + up); c.quadraticCurveTo(88, 40, 64, 44); c.quadraticCurveTo(40, 40, 14, 32 + up); c.fill();
  }));
  // The shadow is the bird laid flat, wings across its line of flight (along x).
  const shadow = new THREE.PlaneGeometry(0.7, 0.35).rotateX(-Math.PI / 2).rotateY(Math.PI / 2);
  const birds: { sprite: THREE.Sprite; shade: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; vx: number; flap: number }[] = [];
  const toSun = new THREE.Vector3();
  let next = 5;
  return {
    update(dt: number, focus: THREE.Vector3) {
      toSun.copy(sun).normalize();
      if ((next -= dt) <= 0) {
        next = 15 + Math.random() * 10;
        const dir = Math.random() < 0.5 ? 1 : -1, z = FENCE.back - 1 + Math.random() * 3, y = 4.3 + Math.random() * 0.6;
        for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
          const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: frames[0], transparent: true, opacity: 0.8, depthWrite: false, depthTest: false }));
          sprite.scale.set(0.8, 0.4, 1); sprite.renderOrder = 6;
          sprite.position.set(focus.x - dir * (16 + i * 0.8), y + Math.random() * 0.4, z + (i % 2 ? 1 : -1) * i * 0.4);
          const shade = new THREE.Mesh(shadow, new THREE.MeshBasicMaterial({ map: frames[0], transparent: true, opacity: 0.2, depthWrite: false }));
          scene.add(sprite, shade);
          birds.push({ sprite, shade, vx: dir * (2.1 + Math.random() * 0.3), flap: Math.random() * 6 });
        }
      }
      for (let i = birds.length - 1; i >= 0; i--) {
        const b = birds[i], p = b.sprite.position; p.x += b.vx * dt; b.flap += dt * 7;
        b.sprite.material.map = b.shade.material.map = frames[Math.sin(b.flap) > 0 ? 0 : 1];
        // The shadow falls straight away from the sun.
        b.shade.position.set(p.x - (toSun.x / toSun.y) * p.y, 0.03, p.z - (toSun.z / toSun.y) * p.y);
        if (Math.abs(p.x - focus.x) > 20) { b.sprite.removeFromParent(); b.shade.removeFromParent(); b.sprite.material.dispose(); b.shade.material.dispose(); birds.splice(i, 1); }
      }
    },
    dispose() {
      for (const b of birds) { b.sprite.removeFromParent(); b.shade.removeFromParent(); b.sprite.material.dispose(); b.shade.material.dispose(); }
      frames.forEach(t => t.dispose()); shadow.dispose();
    }
  };
}

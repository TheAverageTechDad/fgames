import * as THREE from 'three';

// Little bits of life: dust when a part lands, sparkles when it's done, exhaust smoke, a backfire flash, paint mist.
// Sprites from one pool of textures; each particle has its own material so it can fade on its own.
type Particle = { sprite: THREE.Sprite; v: THREE.Vector3; age: number; life: number; grow: number; drag: number; rise: number; fade: number; spin: number };

function texture(paint: (c: CanvasRenderingContext2D, s: number) => void, size = 64) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  paint(canvas.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createEffects(scene: THREE.Scene) {
  const soft = texture((c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
  });
  const star = texture((c, s) => {
    c.translate(s / 2, s / 2); c.fillStyle = '#fff';
    c.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? s * 0.09 : s * 0.46, a = i * Math.PI / 4; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.fill();
    const g = c.createRadialGradient(0, 0, 0, 0, 0, s * 0.3); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(-s / 2, -s / 2, s, s);
  });
  const live: Particle[] = [];
  function emit(map: THREE.Texture, color: THREE.ColorRepresentation, at: THREE.Vector3, v: THREE.Vector3, size: number,
    o: { life: number; grow?: number; drag?: number; rise?: number; opacity?: number; additive?: boolean; spin?: number }) {
    const material = new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, opacity: o.opacity ?? 1,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const sprite = new THREE.Sprite(material); sprite.position.copy(at); sprite.scale.setScalar(size); sprite.renderOrder = 5;
    scene.add(sprite);
    live.push({ sprite, v, age: 0, life: o.life, grow: o.grow ?? 1, drag: o.drag ?? 2, rise: o.rise ?? 0, fade: o.opacity ?? 1, spin: o.spin ?? 0 });
  }
  const jitter = (s: number) => new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  return {
    /** Dust kicked up where a part lands. */
    puff(at: THREE.Vector3, n: number, spread: number) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = new THREE.Vector3(Math.cos(a), 0.4 + Math.random() * 0.5, Math.sin(a)).multiplyScalar(0.35 + Math.random() * 0.3);
        emit(soft, '#d8d0c2', at.clone().add(jitter(spread)), v, 0.1 + Math.random() * 0.06, { life: 0.8, grow: 2.2, drag: 3, opacity: 0.55 });
      }
    },
    /** Gold sparkles when a part is finished. */
    sparkle(at: THREE.Vector3, n: number, spread: number) {
      for (let i = 0; i < n; i++) {
        const v = jitter(1).normalize().multiplyScalar(0.6 + Math.random() * 0.6); v.y = Math.abs(v.y) + 0.3;
        emit(star, i % 3 ? '#ffd451' : '#fff4c2', at.clone().add(jitter(spread)), v, 0.05 + Math.random() * 0.04, { life: 0.9, grow: 0.4, drag: 2.5, additive: true, spin: (Math.random() - 0.5) * 8 });
      }
    },
    /** Exhaust: soft grey puffs leaving along dir and drifting up. */
    smoke(at: THREE.Vector3, dir: THREE.Vector3, n: number) {
      for (let i = 0; i < n; i++) {
        const v = dir.clone().multiplyScalar(0.5 + Math.random() * 0.6).add(jitter(0.15));
        emit(soft, '#cfd2d6', at.clone().addScaledVector(dir, 0.02), v, 0.05 + Math.random() * 0.03, { life: 1.4, grow: 4, drag: 1.6, rise: 0.25, opacity: 0.4 });
      }
    },
    /** A backfire: a quick orange-blue flash at the pipe. */
    flame(at: THREE.Vector3, dir: THREE.Vector3) {
      emit(soft, '#ff9a2e', at.clone().addScaledVector(dir, 0.04), dir.clone().multiplyScalar(0.8), 0.09, { life: 0.12, grow: 1.6, drag: 0, additive: true });
      emit(soft, '#7fb4ff', at.clone().addScaledVector(dir, 0.02), dir.clone().multiplyScalar(0.4), 0.05, { life: 0.09, grow: 1.2, drag: 0, additive: true });
    },
    /** Paint mist drifting from the camera's side onto the tank. */
    mist(at: THREE.Vector3, color: string, from: THREE.Vector3) {
      const dir = at.clone().sub(from).normalize();
      for (let i = 0; i < 26; i++) {
        const start = at.clone().addScaledVector(dir, -0.35 - Math.random() * 0.15).add(jitter(0.12));
        emit(soft, color, start, dir.clone().multiplyScalar(0.5 + Math.random() * 0.4).add(jitter(0.12)), 0.05 + Math.random() * 0.04,
          { life: 0.7 + Math.random() * 0.3, grow: 2.5, drag: 1.5, opacity: 0.6 });
      }
    },
    update(dt: number, _camera: THREE.Camera) {
      for (let i = live.length - 1; i >= 0; i--) {
        const p = live[i]; p.age += dt;
        const k = p.age / p.life;
        if (k >= 1) { scene.remove(p.sprite); p.sprite.material.dispose(); live.splice(i, 1); continue; }
        p.v.multiplyScalar(Math.max(0, 1 - p.drag * dt)); p.v.y += p.rise * dt;
        p.sprite.position.addScaledVector(p.v, dt);
        p.sprite.scale.multiplyScalar(1 + (p.grow - 1) * dt / p.life);
        p.sprite.material.opacity = p.fade * (1 - k) * Math.min(1, k * 8);
        p.sprite.material.rotation += p.spin * dt;
      }
    },
    dispose() {
      for (const p of live) { scene.remove(p.sprite); p.sprite.material.dispose(); }
      live.length = 0; soft.dispose(); star.dispose();
    }
  };
}

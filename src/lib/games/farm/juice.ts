import * as THREE from 'three';

// Catcha's soft dust (juice.js): camera-facing puffs that swell while they fade, in one pooled draw.
const SIZE = 160;
export function createPuffs(scene: THREE.Scene) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!, glow = g.createRadialGradient(32, 32, 0, 32, 32, 31);
  glow.addColorStop(0, 'rgba(255,255,255,0.8)'); glow.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  glow.addColorStop(0.7, 'rgba(255,255,255,0.2)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow; g.fillRect(0, 0, 64, 64);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, alphaTest: 0.005, opacity: 0.8 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float puffAlpha;\nvarying float vPuffAlpha;\n' + shader.vertexShader.replace('#include <project_vertex>', `
      vPuffAlpha = puffAlpha;
      vec4 mvPosition = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);
      mvPosition.xy += position.xy * vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
      gl_Position = projectionMatrix * mvPosition;`);
    shader.fragmentShader = 'varying float vPuffAlpha;\n' + shader.fragmentShader.replace('#include <alphatest_fragment>', 'diffuseColor.a *= vPuffAlpha;\n#include <alphatest_fragment>');
  };
  material.customProgramCacheKey = () => 'farm-soft-puffs-v1';
  const geometry = new THREE.PlaneGeometry(0.92, 0.92), alpha = new Float32Array(SIZE);
  geometry.setAttribute('puffAlpha', new THREE.InstancedBufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const mesh = new THREE.InstancedMesh(geometry, material, SIZE);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = 3;
  mesh.setColorAt(0, new THREE.Color()); scene.add(mesh);
  const pos = new Float32Array(SIZE * 3), vel = new Float32Array(SIZE * 3), age = new Float32Array(SIZE), life = new Float32Array(SIZE), size = new Float32Array(SIZE), color = new Float32Array(SIZE * 3);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), tint = new THREE.Color();
  let cursor = 0;
  return {
    spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, seconds: number, scale: number, hex = '#fff6e0') {
      const i = cursor, k = i * 3; cursor = (cursor + 1) % SIZE;
      pos.set([x, y, z], k); vel.set([vx, vy, vz], k); age[i] = 0; life[i] = seconds; size[i] = scale;
      tint.set(hex); color.set([tint.r, tint.g, tint.b], k);
    },
    step(dt: number) {
      let alive = 0;
      const damp = Math.max(0, 1 - 3.5 * dt);
      for (let i = 0; i < SIZE; i++) {
        if (life[i] <= 0) continue;
        const k = i * 3, t = (age[i] += dt) / life[i];
        if (t >= 1) { life[i] = 0; continue; }
        vel[k + 1] += 1.2 * dt;
        for (let a = 0; a < 3; a++) { vel[k + a] *= damp; pos[k + a] += vel[k + a] * dt; }
        const sc = (0.55 + 0.9 * t) * (1 - t * t) * size[i];
        mesh.setMatrixAt(alive, m.compose(p.fromArray(pos, k), q, s.set(sc, sc, sc)));
        mesh.setColorAt(alive, tint.fromArray(color, k));
        alpha[alive++] = Math.min(1, t * 10) * (1 - t) * (1 - t);
      }
      mesh.count = alive;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      geometry.attributes.puffAlpha.needsUpdate = true;
    },
    dispose() { mesh.removeFromParent(); geometry.dispose(); material.dispose(); map.dispose(); mesh.dispose(); }
  };
}
export type Puffs = ReturnType<typeof createPuffs>;

// Outdoor time of day in Catcha's keyframe style: morning, midday, golden hour, dusk, a moonlit night and dawn.
// Night stays bright enough to play; lamps, windows and fireflies carry it.
const KEYS = [
  { t: 0, sun: ['#ffd9b0', 2.1], hemi: ['#fff1e2', '#7f9a62', 1.35], bg: '#86b45a', glow: 0, x: -9 },
  { t: 0.2, sun: ['#fff1d6', 2.55], hemi: ['#fffaf0', '#6f9450', 1.45], bg: '#79b545', glow: 0, x: -4 },
  { t: 0.5, sun: ['#ffb46e', 2.2], hemi: ['#ffe2c4', '#8a8a5c', 1.25], bg: '#8aa94a', glow: 0, x: 4 },
  { t: 0.62, sun: ['#ff8f6a', 1.3], hemi: ['#e7b9c9', '#6a6a6a', 1.0], bg: '#6e8a52', glow: 0.6, x: 8 },
  { t: 0.72, sun: ['#9fb4ff', 0.75], hemi: ['#b7c4f2', '#3e4f5c', 0.85], bg: '#4a6650', glow: 1, x: -2 },
  { t: 0.9, sun: ['#9fb4ff', 0.75], hemi: ['#b7c4f2', '#3e4f5c', 0.85], bg: '#4a6650', glow: 1, x: -2 },
  { t: 1, sun: ['#ffd9b0', 2.1], hemi: ['#fff1e2', '#7f9a62', 1.35], bg: '#86b45a', glow: 0, x: -9 }
] as const;
const ca = new THREE.Color(), cb = new THREE.Color();
const mixColor = (out: THREE.Color, a: string, b: string, k: number) => out.copy(ca.set(a)).lerp(cb.set(b), k);
export function createSky({ scene, hemi, sun }: { scene: THREE.Scene; hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight }) {
  const offset = new THREE.Vector3();
  return {
    /** `t` loops 0…1 over a day; returns how much the lamps glow and where the sun sits relative to the focus. */
    set(t: number) {
      t = ((t % 1) + 1) % 1;
      let i = 0; while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
      const a = KEYS[i], b = KEYS[i + 1], raw = (t - a.t) / (b.t - a.t), k = raw * raw * (3 - 2 * raw);
      mixColor(sun.color, a.sun[0], b.sun[0], k); sun.intensity = a.sun[1] + (b.sun[1] - a.sun[1]) * k;
      mixColor(hemi.color, a.hemi[0], b.hemi[0], k); mixColor(hemi.groundColor, a.hemi[1], b.hemi[1], k);
      hemi.intensity = a.hemi[2] + (b.hemi[2] - a.hemi[2]) * k;
      if (scene.background instanceof THREE.Color) mixColor(scene.background, a.bg, b.bg, k);
      offset.set(a.x + (b.x - a.x) * k, 12, 7);
      return { glow: a.glow + (b.glow - a.glow) * k, sun: offset };
    }
  };
}

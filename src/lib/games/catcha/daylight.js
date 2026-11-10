/**
 * Time of day: a run starts on a soft morning, passes a bright midday and a golden late afternoon,
 * and settles into a cosy lamp-lit evening (never dark: the toys must stay easy to see). The lights,
 * the background, the sky in every window and a sun shaft through each window follow it; the shaft's
 * patch on the floor slides across the room as the sun moves and stretches long in the golden hour.
 *
 *   const day = createDaylight({ scene, hemi, sun, fill, renderer });
 *   day.set(t)        // 0 = 8:00 morning … 1 = 19:30 evening; cheap, call every step
 *   day.clock(t)      // "13:45"
 *
 * The sun rays are fake on purpose: additive glowing shapes (no volumetric pass), so they cost a few
 * draw calls. The key light stays on the camera's side so faces stay lit; it just swings and warms.
 */
import * as THREE from "three";

/** Keyframes: t, key light colour/intensity/position, sky/ground fill, camera fill (evening: lamps), background, window sky, ray colour/strength, stars. */
const KEYS = [
  { t: 0, sun: [0xffe2bd, 1.8, [16, 15, 12]], hemi: [0xfff1e2, 0xa6b0a0, 1.05], fill: [0xeaf3ff, 0.4], bg: 0xeef0e6, sky: 0xffe6c8, rays: [0xfff0d0, 0.55], stars: 0 },
  { t: 0.35, sun: [0xffefd9, 2.0, [14, 22, 12]], hemi: [0xfff5e6, 0xa0b1a0, 1.1], fill: [0xeaf3ff, 0.4], bg: 0xe8efe9, sky: 0xcdeeff, rays: [0xfff6e2, 0.32], stars: 0 },
  { t: 0.72, sun: [0xffb877, 1.85, [-9, 13, 14]], hemi: [0xffe2c4, 0x9c8a7c, 0.95], fill: [0xffdcb8, 0.38], bg: 0xf2dcc6, sky: 0xffb46e, rays: [0xffad5c, 1.0], stars: 0 },
  { t: 1, sun: [0xc4c4ff, 0.6, [-13, 19, 11]], hemi: [0xe2c8e6, 0x7c6470, 0.72], fill: [0xffb877, 1.15], bg: 0xa898b8, sky: 0x2f3a72, rays: [0xffad5c, 0], stars: 1 },
];
const START_MIN = 8 * 60, END_MIN = 19.5 * 60;
const FLOOR = 0.1; // the rug's top is 0.09

function segment(t) {
  for (let i = 0; i < KEYS.length - 1; i++) if (t <= KEYS[i + 1].t) return [KEYS[i], KEYS[i + 1], (t - KEYS[i].t) / (KEYS[i + 1].t - KEYS[i].t)];
  return [KEYS[KEYS.length - 2], KEYS[KEYS.length - 1], 1];
}
const ca = new THREE.Color(), cb = new THREE.Color();
const mixHex = (out, a, b, k) => out.copy(ca.setHex(a)).lerp(cb.setHex(b), k);
const mix = (a, b, k) => a + (b - a) * k;
const smooth = (k) => k * k * (3 - 2 * k);

function canvasTexture(size, draw) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Night sky for the window panes: stars and a crescent moon on black (drawn additively). */
const starsTexture = () => canvasTexture(256, (g, s) => {
  g.fillStyle = "#000"; g.fillRect(0, 0, s, s);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 46; i++) {
    const x = rnd() * s, y = rnd() * s * 0.85, r = 0.8 + rnd() * 1.8;
    g.fillStyle = `rgba(255,248,225,${0.5 + rnd() * 0.5})`;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  g.fillStyle = "#fff4cf"; g.beginPath(); g.arc(s * 0.74, s * 0.28, s * 0.1, 0, 7); g.fill();
  g.fillStyle = "#000"; g.beginPath(); g.arc(s * 0.79, s * 0.24, s * 0.09, 0, 7); g.fill();
});
/** Soft top-to-bottom shading so a window's sky isn't one flat colour. */
const skyTexture = () => canvasTexture(64, (g, s) => {
  const grad = g.createLinearGradient(0, 0, 0, s);
  grad.addColorStop(0, "#ffffff"); grad.addColorStop(1, "#c9c9c9");
  g.fillStyle = grad; g.fillRect(0, 0, s, s);
});
/** The window's light on the floor: four soft panes split by the cross of the frame. */
const patchTexture = () => canvasTexture(128, (g, s) => {
  g.fillStyle = "#000"; g.fillRect(0, 0, s, s);
  // soft edges from a glow (shadowBlur works on every browser's canvas; filter doesn't on older Safari)
  g.fillStyle = "#fff"; g.shadowColor = "#fff"; g.shadowBlur = 12;
  const m = s * 0.16, gap = s * 0.07, half = (s - 2 * m - gap) / 2;
  for (const x of [m, m + half + gap]) for (const y of [m, m + half + gap]) g.fillRect(x, y, half, half);
});

/**
 * One window's sun shaft: an open box from the window opening down to its patch on the floor,
 * bright at the glass and fading out (vertex colours, additive), plus the patch itself.
 */
function createShaft(win, textures) {
  const group = new THREE.Group();
  group.userData.tag = "sun-rays";
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
  const fade = new Float32Array(8 * 3);
  for (let i = 0; i < 4; i++) { fade.set([0.6, 0.6, 0.6], i * 3); fade.set([0.06, 0.06, 0.06], (i + 4) * 3); }
  geo.setAttribute("color", new THREE.BufferAttribute(fade, 3));
  // corners 0-3 at the window (bl, br, tr, tl), 4-7 their spots on the floor; the four sides of the beam
  geo.setIndex([0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
  const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const beam = new THREE.Mesh(geo, beamMat);
  beam.frustumCulled = false;
  beam.renderOrder = 2;
  const patchGeo = new THREE.BufferGeometry();
  patchGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
  patchGeo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  patchGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const patchMat = new THREE.MeshBasicMaterial({ map: textures.patch, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const patch = new THREE.Mesh(patchGeo, patchMat);
  patch.frustumCulled = false;
  patch.renderOrder = 1;
  group.add(beam, patch);
  win.parent.add(group);
  const corners = [[win.x0, win.y0], [win.x1, win.y0], [win.x1, win.y1], [win.x0, win.y1]];
  let lastKey = "";
  return {
    /** `dir`: the way the light travels (unit, y < 0); `color` already scaled by strength. */
    update(dir, color) {
      group.visible = color.r + color.g + color.b > 0.01;
      if (!group.visible) return;
      beamMat.color.copy(color);
      patchMat.color.copy(color).multiplyScalar(0.95);
      const key = `${dir.x.toFixed(3)},${dir.y.toFixed(3)},${dir.z.toFixed(3)}`;
      if (key === lastKey) return;
      lastKey = key;
      const pos = geo.attributes.position, pp = patchGeo.attributes.position;
      corners.forEach(([x, y], i) => {
        const k = (y - FLOOR) / -dir.y; // along the light until it meets the floor (just above the rug)
        pos.setXYZ(i, x, y, win.z);
        pos.setXYZ(i + 4, x + dir.x * k, FLOOR, win.z + dir.z * k);
        pp.setXYZ(i, x + dir.x * k, FLOOR, win.z + dir.z * k);
      });
      pos.needsUpdate = pp.needsUpdate = true;
    },
  };
}

export function createDaylight({ scene, hemi, sun, fill, onSunMoved = () => {} }) {
  const textures = { patch: patchTexture(), stars: starsTexture(), sky: skyTexture() };
  // every window in the scene: its sky tint, a night layer of stars, and a sun shaft through it
  const windows = [];
  scene.traverse((o) => {
    if (o.name !== "window-pane" || !o.geometry?.parameters) return;
    const { width, height, depth } = o.geometry.parameters;
    o.material.map = textures.sky;
    o.material.needsUpdate = true;
    const stars = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({
      map: textures.stars, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 }));
    stars.position.z = depth / 2 + 0.006;
    stars.userData.tag = "window-stars";
    stars.visible = false;
    o.add(stars);
    const p = o.position, front = p.z + depth / 2 + 0.02;
    // the shaft starts a little inside the frame so its edges sit behind the trim
    const shaft = createShaft({ parent: o.parent, x0: p.x - width * 0.45, x1: p.x + width * 0.45, y0: p.y - height * 0.42, y1: p.y + height * 0.42, z: front }, textures);
    windows.push({ pane: o, stars, shaft });
  });
  const dir = new THREE.Vector3(), rays = new THREE.Color(), tmp = new THREE.Color();
  const sunAt = new THREE.Vector3();
  let current = -1, lastShadowFit = -1;
  return {
    windows: windows.length,
    set(t) {
      t = THREE.MathUtils.clamp(t, 0, 1);
      if (Math.abs(t - current) < 1e-4) return;
      current = t;
      const [a, b, raw] = segment(t), k = smooth(raw);
      mixHex(sun.color, a.sun[0], b.sun[0], k);
      sun.intensity = mix(a.sun[1], b.sun[1], k);
      sunAt.set(mix(a.sun[2][0], b.sun[2][0], k), mix(a.sun[2][1], b.sun[2][1], k), mix(a.sun[2][2], b.sun[2][2], k));
      sun.position.copy(sunAt);
      mixHex(hemi.color, a.hemi[0], b.hemi[0], k);
      mixHex(hemi.groundColor, a.hemi[1], b.hemi[1], k);
      hemi.intensity = mix(a.hemi[2], b.hemi[2], k);
      mixHex(fill.color, a.fill[0], b.fill[0], k);
      fill.intensity = mix(a.fill[1], b.fill[1], k);
      if (scene.background?.isColor) mixHex(scene.background, a.bg, b.bg, k);
      const night = mix(a.stars, b.stars, k);
      for (const w of windows) {
        mixHex(w.pane.material.color, a.sky, b.sky, k);
        w.stars.material.opacity = night;
        w.stars.visible = night > 0.02;
      }
      // the sun crosses behind the back wall: from the left in the morning to the right at dusk,
      // high at midday (a short patch near the wall), low in the golden hour (a long one)
      const az = mix(0.55, -0.6, t), el = THREE.MathUtils.degToRad(t < 0.35 ? mix(28, 52, t / 0.35) : t < 0.72 ? mix(52, 21, (t - 0.35) / 0.37) : mix(21, 12, (t - 0.72) / 0.28));
      dir.set(Math.cos(el) * Math.sin(az), -Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
      mixHex(rays, a.rays[0], b.rays[0], k).multiplyScalar(mix(a.rays[1], b.rays[1], k));
      for (const w of windows) w.shaft.update(dir, tmp.copy(rays));
      // the shadow camera is fitted to the light's direction: refit as the sun swings (now and then)
      if (Math.abs(t - lastShadowFit) > 0.01) { lastShadowFit = t; onSunMoved(sun); }
    },
    /** The wall-clock time for t, "8:00" … "19:30". */
    clock(t) {
      const m = Math.round(mix(START_MIN, END_MIN, THREE.MathUtils.clamp(t, 0, 1)));
      return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
    },
    minutes: (t) => mix(START_MIN, END_MIN, THREE.MathUtils.clamp(t, 0, 1)),
  };
}

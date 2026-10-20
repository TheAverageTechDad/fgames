/**
 * Seasonal decorations, built once and shown while their season is on (seasons.js decides when).
 * Cosy, never scary. One pack per season: Halloween, Christmas, New Year, Valentine's, Easter. Every
 * pack decorates the back walls (the side walls are nearly edge-on to the camera), the windows, the
 * coffee table / bookshelf in the playroom and the counters / table in the kitchen.
 *
 *   const decor = createSeasonDecor({ room, kitchen, shelf, table, kitchenTable, panes });
 *   decor.set(["christmas", "newyear"]);   // show these packs, hide the rest
 *   decor.placeTree(stations)              // Christmas: the tree stands in the playroom's empty corner → its obstacle
 *   decor.step(dt, dayT);                  // lights twinkle and glow as evening falls, snow, fireworks
 *   decor.treats.spawn(...)                // the season's bonus pickup the little one drops
 */
import * as THREE from "three";
import { flat } from "./materials.js";

const ORANGE = 0xff8a2a, PURPLE = 0x7b4fc9, INK = 0x2a2140, GREEN = 0x5c8a2e, RED = 0xe23b3b, GOLD = 0xffc531;
const DISPLAY = "'Luckiest Guy', 'Lilita One', system-ui, sans-serif";
const CANDLE = new THREE.Color(0xffc24a), DARK_FACE = new THREE.Color(0x3a1d0a);

const mats = new Map();
const fm = (color) => { if (!mats.has(color)) mats.set(color, flat(color)); return mats.get(color); };
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, typeof mat === "number" ? fm(mat) : mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glowTexture = () => canvasTexture(64, 64, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 1, s / 2, s / 2, s / 2);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, s, s);
});
const heartShape = (s = 1) => {
  const h = new THREE.Shape();
  h.moveTo(0, -0.18 * s);
  h.bezierCurveTo(-0.3 * s, 0.02 * s, -0.16 * s, 0.24 * s, 0, 0.1 * s);
  h.bezierCurveTo(0.16 * s, 0.24 * s, 0.3 * s, 0.02 * s, 0, -0.18 * s);
  return h;
};

/* ───────────── shared pieces ───────────── */

/** Little bulbs that glow brighter at night and twinkle (fairy lights on the tree and garlands). */
function createLights() {
  const list = [];
  return {
    add(parent, x, y, z, color, r = 0.06) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
      m.position.set(x, y, z);
      m.userData.base = new THREE.Color(color);
      m.userData.phase = list.length * 1.7;
      parent.add(m);
      list.push(m);
      return m;
    },
    step(t, night) {
      for (const m of list) {
        const tw = 0.75 + 0.25 * Math.sin(t * 3 + m.userData.phase);
        m.material.color.copy(m.userData.base).multiplyScalar(0.45 + (0.35 + night * 0.9) * tw);
      }
    },
  };
}

/** Things hung along a sagging string between two points on a wall (`make(i, point)` → a piece or null). */
function garland(from, to, { sag = 0.3, spacing = 0.6, string = INK, thick = 0.015, make }) {
  const g = new THREE.Group();
  g.userData.tag = "season-garland";
  const curve = new THREE.QuadraticBezierCurve3(from, from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, -sag, 0)), to);
  g.add(mesh(new THREE.TubeGeometry(curve, 24, thick, 5), string));
  const n = Math.max(2, Math.round(from.distanceTo(to) / spacing));
  for (let i = 1; i < n; i++) {
    const piece = make(i, curve.getPoint(i / n));
    if (piece) g.add(piece);
  }
  return g;
}
/** A triangle pennant hanging below `p`, in the wall's plane. */
function pennant(p, color, w = 0.36, h = 0.42) {
  const m = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, -h)])), fm(color));
  m.material.side = THREE.DoubleSide;
  m.position.copy(p);
  return m;
}
function flatShape(shape, color, p) {
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), fm(color));
  m.material.side = THREE.DoubleSide;
  m.position.copy(p);
  return m;
}

/** A crayon sign like the family's drawings: two lines of shouty letters and a doodle in each corner. */
function sign(lines, colors, doodle) {
  const tex = canvasTexture(512, 300, (g, w, h) => {
    g.fillStyle = "#fff6e6"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#2a2140"; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14); g.fillRect(0, 0, 14, h); g.fillRect(w - 14, 0, 14, h);
    g.textAlign = "center"; g.lineJoin = "round";
    lines.forEach((text, i) => {
      g.font = `${text.length > 9 ? 64 : 76}px ${DISPLAY}`;
      g.lineWidth = 12; g.strokeStyle = "#2a2140"; g.strokeText(text, w / 2, 112 + i * 88);
      g.fillStyle = colors[i]; g.fillText(text, w / 2, 112 + i * 88);
    });
    for (const x of [62, w - 62]) doodle(g, x, 252);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.1), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  m.userData.tag = "season-sign";
  return m;
}

/* ───────────── bonus pickups: one per season ───────────── */

const TREATS = {
  halloween: { say: "Yum, a sweet! +50", colors: [0xff5fa2, 0x9b6bff, 0xffb627, 0x3dd6a8], make(color) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.SphereGeometry(0.16, 12, 8), color));
    for (const s of [-1, 1]) { const end = mesh(new THREE.ConeGeometry(0.12, 0.2, 8), color, s * 0.22, 0, 0); end.rotation.z = s * Math.PI / 2; g.add(end); }
    g.add(mesh(new THREE.TorusGeometry(0.16, 0.03, 6, 16), 0xffffff)).rotation.y = Math.PI / 2;
    return g;
  } },
  christmas: { say: "A present! +50", colors: [RED, 0x2e9e5b, 0x3a7bd5, GOLD], make(color) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.34, 0.28, 0.34), color));
    const ribbon = color === GOLD ? RED : GOLD;
    g.add(mesh(new THREE.BoxGeometry(0.36, 0.29, 0.07), ribbon), mesh(new THREE.BoxGeometry(0.07, 0.29, 0.36), ribbon));
    for (const s of [-1, 1]) { const bow = mesh(new THREE.TorusGeometry(0.06, 0.025, 6, 12), ribbon, s * 0.06, 0.17, 0); bow.rotation.y = Math.PI / 2; bow.rotation.z = s * 0.6; g.add(bow); }
    return g;
  } },
  valentines: { say: "A chocolate heart! +50", colors: [0xff5f93, RED, 0xff9fc2], make(color) {
    const g = new THREE.Group();
    const geo = new THREE.ExtrudeGeometry(heartShape(1.2), { depth: 0.1, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
    geo.center();
    g.add(mesh(geo, color));
    return g;
  } },
  easter: { say: "An Easter egg! +50", colors: [0xff9fc2, 0x9fd0ff, 0xffe066, 0x8fe0c0, 0xc3a6f0], make(color) {
    const g = new THREE.Group();
    const egg = mesh(new THREE.SphereGeometry(0.17, 14, 10), color);
    egg.scale.set(1, 1.3, 1);
    const band = mesh(new THREE.TorusGeometry(0.168, 0.025, 6, 20), 0xffffff, 0, 0.02, 0);
    band.rotation.x = Math.PI / 2;
    g.add(egg, band);
    return g;
  } },
};

/* ───────────── props ───────────── */

/** A smiling jack-o'-lantern; its face (and a soft halo) light up as night falls. */
function jackOLantern(glowing, glow) {
  const g = new THREE.Group();
  g.userData.tag = "season-pumpkin";
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const lobe = mesh(new THREE.SphereGeometry(0.26, 14, 10), ORANGE, Math.cos(a) * 0.17, 0.3, Math.sin(a) * 0.17);
    lobe.scale.set(1, 1.15, 1);
    g.add(lobe);
  }
  g.add(mesh(new THREE.SphereGeometry(0.3, 14, 10), ORANGE, 0, 0.31, 0));
  const stem = mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.16, 8), GREEN, 0.02, 0.66, 0);
  stem.rotation.z = 0.25;
  g.add(stem);
  const face = new THREE.MeshBasicMaterial({ color: DARK_FACE, toneMapped: false });
  glowing.faces.push(face);
  const tri = new THREE.Shape([new THREE.Vector2(-0.06, -0.04), new THREE.Vector2(0.06, -0.04), new THREE.Vector2(0, 0.06)]);
  for (const x of [-0.1, 0.1]) { const eye = new THREE.Mesh(new THREE.ShapeGeometry(tri), face); eye.position.set(x, 0.38, 0.425); g.add(eye); }
  const grin = new THREE.Shape();
  grin.moveTo(-0.16, 0.26); grin.quadraticCurveTo(0, 0.12, 0.16, 0.26); grin.quadraticCurveTo(0, 0.2, -0.16, 0.26);
  const mouth = new THREE.Mesh(new THREE.ShapeGeometry(grin), face);
  mouth.position.z = 0.43;
  g.add(mouth);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffb040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  halo.position.set(0, 0.32, 0.5);
  halo.scale.setScalar(1.3);
  glowing.halos.push(halo);
  g.add(halo);
  return g;
}

/** A soft cobweb across a top corner, with a tiny friendly spider. */
function cobweb() {
  const tex = canvasTexture(256, 256, (g, s) => {
    g.strokeStyle = "rgba(120,110,140,0.75)"; g.lineWidth = 3;
    const spokes = 7;
    for (let i = 0; i <= spokes; i++) { const a = (i / spokes) * Math.PI / 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * s, Math.sin(a) * s); g.stroke(); }
    for (let r = 30; r < s; r += 34) {
      g.beginPath();
      for (let i = 0; i <= spokes; i++) {
        const a = (i / spokes) * Math.PI / 2, rr = r - (i % 2 ? 6 : 0);
        if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.quadraticCurveTo(Math.cos(a - 0.1) * (rr - 8), Math.sin(a - 0.1) * (rr - 8), Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.stroke();
    }
    g.fillStyle = "#2a2140"; g.beginPath(); g.arc(s * 0.55, s * 0.5, 9, 0, 7); g.fill();
    g.fillStyle = "#fff"; for (const dx of [-3, 3]) { g.beginPath(); g.arc(s * 0.55 + dx, s * 0.5 - 2, 2.2, 0, 7); g.fill(); }
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  m.userData.tag = "season-cobweb";
  return m;
}

/** A Christmas tree: three tiers, baubles, twinkling lights, a glowing star and presents underneath. */
function christmasTree(lights, glowing, glow, presents = true) {
  const g = new THREE.Group();
  g.userData.tag = "season-tree";
  const pine = fm(0x2f7d4f);
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 10), 0x7a4a2a, 0, 0.25, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.3, 16), RED, 0, 0.15, 0)); // the pot
  const tiers = [[1.15, 1.3, 0.85], [0.9, 1.1, 1.65], [0.6, 0.95, 2.35]];
  tiers.forEach(([r, h, y], i) => {
    g.add(mesh(new THREE.ConeGeometry(r, h, 18), pine, 0, y, 0));
    const count = 9 - i * 2;
    for (let k = 0; k < count; k++) {
      const a = k / count * Math.PI * 2 + i, rr = r * 0.82, by = y - h * 0.32;
      g.add(mesh(new THREE.SphereGeometry(0.08, 10, 8), [RED, GOLD, 0x3a7bd5, 0xffffff][(k + i) % 4], Math.cos(a) * rr, by, Math.sin(a) * rr));
      const la = a + Math.PI / count;
      lights.add(g, Math.cos(la) * rr * 0.9, by + h * 0.18, Math.sin(la) * rr * 0.9, [0xffd25a, 0xff6a6a, 0x7ad7ff, 0x9cff8a][(k + i) % 4], 0.05);
    }
  });
  const star = new THREE.Mesh(new THREE.ExtrudeGeometry((() => {
    const s = new THREE.Shape();
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 + Math.PI / 2, r = k % 2 ? 0.1 : 0.24; s[k ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r); }
    return s;
  })(), { depth: 0.05, bevelEnabled: false }), new THREE.MeshBasicMaterial({ color: GOLD, toneMapped: false }));
  star.position.set(0, 2.98, -0.025);
  g.add(star);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffe08a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  halo.position.set(0, 2.98, 0.05);
  halo.scale.setScalar(1.2);
  glowing.halos.push(halo);
  g.add(halo);
  if (presents) {
    [[0.75, 0.55, RED], [-0.7, 0.6, 0x3a7bd5], [0.15, 0.85, 0x2e9e5b]].forEach(([x, z, c], i) => {
      const p = TREATS.christmas.make(c);
      p.scale.setScalar(1.6 + (i % 2) * 0.3);
      p.position.set(x, 0.24, z);
      p.rotation.y = i * 0.7;
      g.add(p);
    });
  }
  return g;
}

/** Four Christmas stockings hanging from a little rail. */
function stockings() {
  const g = new THREE.Group();
  g.userData.tag = "season-stockings";
  const rail = mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.1, 8), 0x7a4a2a, 0, 0, 0.05);
  rail.rotation.z = Math.PI / 2;
  g.add(rail);
  [RED, 0x2e9e5b, RED, 0x2e9e5b].forEach((c, i) => {
    const s = new THREE.Group();
    const foot = mesh(new THREE.CapsuleGeometry(0.1, 0.18, 4, 8), c, 0.1, -0.58, 0);
    foot.rotation.z = Math.PI / 2;
    s.add(mesh(new THREE.CapsuleGeometry(0.11, 0.42, 4, 8), c, 0, -0.32, 0), foot, mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 12), 0xffffff, 0, -0.08, 0));
    s.position.x = -0.75 + i * 0.5;
    s.scale.z = 0.5;
    g.add(s);
  });
  return g;
}

/** A vase of flowers (roses for Valentine's, tulips for Easter). */
function vase(colors) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.42, 14), 0x9fd0ff, 0, 0.21, 0));
  colors.forEach((c, i) => {
    const a = i / colors.length * Math.PI * 2, x = Math.cos(a) * 0.09, z = Math.sin(a) * 0.09;
    const stem = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.45, 5), 0x4f9a2a, x, 0.6, z);
    stem.rotation.set(z * 1.5, 0, -x * 1.5);
    g.add(stem, mesh(new THREE.SphereGeometry(0.075, 10, 8), c, x * 2.2, 0.84, z * 2.2));
  });
  return g;
}

/** A basket of painted eggs. */
function eggBasket() {
  const g = new THREE.Group();
  const side = mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.26, 18, 1, true), 0xc8925e, 0, 0.13, 0);
  side.material = side.material.clone(); side.material.side = THREE.DoubleSide;
  g.add(side, mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.02, 18), 0xc8925e, 0, 0.01, 0));
  g.add(mesh(new THREE.TorusGeometry(0.4, 0.025, 6, 20, Math.PI), 0xc8925e, 0, 0.26, 0));
  TREATS.easter.colors.forEach((c, i) => {
    const e = TREATS.easter.make(c);
    e.scale.setScalar(0.9);
    e.position.set(Math.cos(i * 1.3) * 0.18, 0.28, Math.sin(i * 1.3) * 0.18);
    e.rotation.z = (i - 2) * 0.3;
    g.add(e);
  });
  return g;
}

/** A soft bunny (Easter) and a snowman (Christmas) to sit on top of the bookshelf. */
function bunny() {
  const g = new THREE.Group(), fur = 0xfff6ee;
  g.add(mesh(new THREE.SphereGeometry(0.3, 14, 10), fur, 0, 0.3, 0), mesh(new THREE.SphereGeometry(0.22, 14, 10), fur, 0, 0.72, 0.05));
  for (const s of [-1, 1]) {
    const ear = mesh(new THREE.CapsuleGeometry(0.06, 0.32, 4, 8), fur, s * 0.1, 1.06, 0);
    const inner = mesh(new THREE.CapsuleGeometry(0.03, 0.26, 4, 6), 0xffb6c8, s * 0.1, 1.06, 0.04);
    ear.rotation.z = inner.rotation.z = -s * 0.2;
    g.add(ear, inner, mesh(new THREE.SphereGeometry(0.03, 8, 6), INK, s * 0.08, 0.76, 0.25));
  }
  g.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), 0xff8fb1, 0, 0.7, 0.27));
  return g;
}
function snowman() {
  const g = new THREE.Group(), snow = 0xfdfdff;
  g.add(mesh(new THREE.SphereGeometry(0.32, 14, 10), snow, 0, 0.3, 0), mesh(new THREE.SphereGeometry(0.22, 14, 10), snow, 0, 0.75, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.22, 14), INK, 0, 1.04, 0), mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 14), INK, 0, 0.94, 0));
  const nose = mesh(new THREE.ConeGeometry(0.04, 0.16, 8), ORANGE, 0, 0.76, 0.26);
  nose.rotation.x = Math.PI / 2;
  const scarf = mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 16), RED, 0, 0.58, 0);
  scarf.rotation.x = Math.PI / 2;
  g.add(nose, scarf);
  for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), INK, s * 0.08, 0.82, 0.2));
  return g;
}

/* ───────────── window effects: snow and fireworks ───────────── */

/** Snow drifting down behind each window's glass, with a little drift along the bottom. */
function createSnow(panes) {
  const flakes = [], objects = [];
  panes.forEach((p, pi) => {
    const { width, height, depth } = p.geometry.parameters, n = Math.round(width * height * 6);
    const pos = new Float32Array(n * 3);
    let seed = 97 + pi * 31;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) pos.set([(rnd() - 0.5) * width, (rnd() - 0.5) * height, 0], i * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
    pts.position.copy(p.position);
    pts.position.z += depth / 2 + 0.012;
    pts.userData.tag = "season-snow";
    p.parent.add(pts);
    objects.push(pts);
    flakes.push({ pts, width, height, speed: Array.from({ length: n }, (_, i) => 0.25 + ((i * 37) % 10) / 20) });
    const drift = mesh(new THREE.BoxGeometry(width, 0.1, 0.05), 0xffffff, p.position.x, p.position.y - height / 2 + 0.05, p.position.z + depth / 2 + 0.03);
    drift.castShadow = false;
    p.parent.add(drift);
    objects.push(drift);
  });
  return {
    objects,
    step(dt, t) {
      for (const f of flakes) {
        const a = f.pts.geometry.attributes.position;
        for (let i = 0; i < a.count; i++) {
          let y = a.getY(i) - f.speed[i] * dt;
          if (y < -f.height / 2) y += f.height;
          a.setXY(i, THREE.MathUtils.clamp(a.getX(i) + Math.sin(t * 1.3 + i) * 0.08 * dt, -f.width / 2, f.width / 2), y);
        }
        a.needsUpdate = true;
      }
    },
  };
}

/** Fireworks bursting in the window sky (New Year's Eve), only once it's getting dark. */
function createFireworks(panes, glow) {
  const bursts = [], objects = [];
  const colors = [0xffd25a, 0xff5f93, 0x7ad7ff, 0x9cff8a, 0xffffff];
  panes.forEach((p, pi) => {
    const { width, height, depth } = p.geometry.parameters;
    for (let b = 0; b < 2; b++) {
      const n = 28, geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: glow, size: 0.26, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      pts.position.copy(p.position);
      pts.position.z += depth / 2 + 0.014;
      pts.userData.tag = "season-fireworks";
      p.parent.add(pts);
      objects.push(pts);
      bursts.push({ pts, width, height, n, t: b * 0.9 + pi * 0.4, cx: 0, cy: 0, seed: pi * 7 + b * 3 + 1 });
    }
  });
  return {
    objects,
    step(dt, dayT) {
      const dusk = THREE.MathUtils.smoothstep(dayT, 0.5, 0.75);
      for (const s of bursts) {
        s.t += dt;
        const life = 1.8;
        if (s.t > life) {
          s.t -= life;
          s.seed = (s.seed * 16807) % 2147483647;
          s.cx = ((s.seed % 1000) / 1000 - 0.5) * s.width * 0.7;
          s.cy = ((s.seed % 777) / 777) * s.height * 0.35;
          s.pts.material.color.setHex(colors[s.seed % colors.length]);
        }
        const k = s.t / life, r = Math.min(s.width, s.height) * 0.32 * Math.sqrt(k);
        const a = s.pts.geometry.attributes.position;
        for (let i = 0; i < s.n; i++) {
          const ang = (i / s.n) * Math.PI * 2;
          a.setXYZ(i, s.cx + Math.cos(ang) * r, s.cy + Math.sin(ang) * r - k * k * 0.25, 0);
        }
        a.needsUpdate = true;
        s.pts.material.opacity = dusk * Math.max(0, 1 - k) * (k < 0.08 ? k / 0.08 : 1);
        s.pts.visible = dusk > 0.02;
      }
    },
  };
}

/* ───────────── the decor manager ───────────── */

export function createSeasonDecor({ room, kitchen, shelf = null, table = null, kitchenTable = null, panes = [] }) {
  const glow = glowTexture();
  const glowing = { faces: [], halos: [] }, lights = createLights(), packs = {};
  const place = (id, parent, obj, x = 0, y = 0, z = 0) => { obj.visible = false; obj.position.set(x, y, z); parent.add(obj); (packs[id] ??= []).push(obj); return obj; };
  const shelfTop = shelf ? new THREE.Box3().setFromObject(shelf.model).max.y - shelf.group.position.y : 0;
  // where things hang in each world: a garland over the window, a sign on the back wall, the table spot
  const ROOM_SIGN = [11.3, 2.75, -9.9], KITCHEN_SIGN = [-6.3, 3.4, -9.86];
  const overRoomWindow = [new THREE.Vector3(0.3, 4.1, -9.55), new THREE.Vector3(6.7, 4.1, -9.55)];
  const overKitchenWindow = [new THREE.Vector3(-2.6, 4.13, -9.8), new THREE.Vector3(2.6, 4.13, -9.8)];
  const TABLE_SPOT = [-1.0, 1.33, 0.25], KTABLE_SPOT = [-0.35, 1.25, -0.3];
  const both = (id, make, opts = {}) => {
    place(id, room, garland(...overRoomWindow, { sag: 0.3, ...opts, make }));
    place(id, kitchen, garland(...overKitchenWindow, { sag: 0.25, ...opts, make }));
  };
  const signs = (id, lines, colors, doodle) => {
    place(id, room, sign(lines, colors, doodle), ...ROOM_SIGN);
    place(id, kitchen, sign(lines, colors, doodle), ...KITCHEN_SIGN).scale.setScalar(0.85);
  };

  /* Halloween: jack-o'-lanterns, bat bunting, cobwebs, signs, a bowl of sweets */
  {
    const H = "halloween";
    const jack = () => { const j = jackOLantern(glowing, glow); j.scale.setScalar(1.5); return j; };
    if (shelf) place(H, shelf.group, jack(), 0.3, shelfTop, 0.1);
    if (table) place(H, table, jack(), ...TABLE_SPOT);
    place(H, kitchen, jack(), -10.5, 1.35, -9.25);
    place(H, kitchen, jack(), 12.1, 1.35, 1.3);
    const bat = new THREE.Shape();
    bat.moveTo(0, 0); bat.lineTo(0.08, 0.06); bat.lineTo(0.13, 0.02); bat.lineTo(0.3, 0.1); bat.lineTo(0.24, -0.06); bat.lineTo(0.14, -0.04);
    bat.lineTo(0, -0.12); bat.lineTo(-0.14, -0.04); bat.lineTo(-0.24, -0.06); bat.lineTo(-0.3, 0.1); bat.lineTo(-0.13, 0.02); bat.lineTo(-0.08, 0.06); bat.lineTo(0, 0);
    both(H, (i, p) => i % 4 === 2 ? flatShape(bat, INK, p.clone().add(new THREE.Vector3(0, -0.18, 0))) : pennant(p, [ORANGE, PURPLE, INK][i % 3]));
    place(H, room, cobweb(), -12.2, 3.5, -9.2).rotation.y = Math.PI / 4; // anchored at its top-left, on the left wall
    const kWeb = place(H, kitchen, cobweb(), 12.2, 3.5, -9.2);
    kWeb.rotation.y = -Math.PI / 4; kWeb.scale.x = -1; // mirrored: on the right wall
    signs(H, ["HAPPY", "HALLOWEEN"], ["#ff8a2a", "#7b4fc9"], (g, x, y) => { g.fillStyle = "#ff8a2a"; g.beginPath(); g.ellipse(x, y, 30, 24, 0, 0, 7); g.fill(); g.fillStyle = "#5c8a2e"; g.fillRect(x - 3, y - 30, 6, 10); });
    if (kitchenTable) {
      const bowl = new THREE.Group();
      const side = mesh(new THREE.CylinderGeometry(0.42, 0.28, 0.24, 20, 1, true), PURPLE, 0, 0.12, 0);
      side.material = side.material.clone(); side.material.side = THREE.DoubleSide;
      bowl.add(side, mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 20), PURPLE, 0, 0.01, 0));
      for (let i = 0; i < 7; i++) {
        const s = TREATS.halloween.make(TREATS.halloween.colors[i % 4]);
        s.scale.setScalar(0.55);
        s.position.set(Math.cos(i * 0.9) * 0.2 * (i % 2 ? 1 : 0.5), 0.22 + (i > 4 ? 0.08 : 0), Math.sin(i * 0.9) * 0.2 * (i % 2 ? 1 : 0.5));
        s.rotation.y = i;
        bowl.add(s);
      }
      place(H, kitchenTable, bowl, ...KTABLE_SPOT);
    }
  }

  /* Christmas: a tree in the playroom's empty corner, a little one on a kitchen counter, a garland of
     lights and baubles over the windows, stockings, signs, a snowman, cookies and milk for Santa, snow outside */
  const tree = christmasTree(lights, glowing, glow);
  {
    const C = "christmas";
    place(C, room, tree);
    const little = christmasTree(lights, glowing, glow, false);
    place(C, kitchen, little, -10.5, 1.35, -9.3).scale.setScalar(0.42);
    both(C, (i, p) => {
      const g = new THREE.Group();
      g.position.copy(p);
      if (i % 2) g.add(mesh(new THREE.SphereGeometry(0.09, 10, 8), [RED, GOLD, 0x3a7bd5][i % 3], 0, -0.12, 0));
      else lights.add(g, 0, -0.06, 0.04, [0xffd25a, 0xff6a6a, 0x7ad7ff, 0x9cff8a][(i / 2) % 4]);
      return g;
    }, { string: 0x2f7d4f, thick: 0.07, spacing: 0.35 });
    place(C, room, stockings(), 11.3, 1.85, -9.85);
    signs(C, ["MERRY", "CHRISTMAS"], ["#e23b3b", "#2e9e5b"], (g, x, y) => {
      g.fillStyle = "#2e9e5b"; for (const dx of [-12, 12]) { g.beginPath(); g.ellipse(x + dx, y, 16, 9, dx > 0 ? 0.5 : -0.5, 0, 7); g.fill(); }
      g.fillStyle = "#e23b3b"; for (const dx of [-6, 6]) { g.beginPath(); g.arc(x + dx, y - 6, 7, 0, 7); g.fill(); }
    });
    if (shelf) place(C, shelf.group, snowman(), 0.3, shelfTop, 0.1);
    if (kitchenTable) {
      const treat = new THREE.Group();
      treat.add(mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.04, 20), 0xffffff, 0, 0.02, 0));
      for (let i = 0; i < 4; i++) treat.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 12), 0xd99a4e, Math.cos(i * 1.6) * 0.14, 0.06 + (i === 3 ? 0.03 : 0), Math.sin(i * 1.6) * 0.14));
      treat.add(mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.3, 12), 0xfafafa, 0.42, 0.15, 0.1)); // a glass of milk
      place(C, kitchenTable, treat, ...KTABLE_SPOT);
    }
  }
  const snow = createSnow(panes);
  for (const o of snow.objects) { o.visible = false; (packs.christmas ??= []).push(o); }

  /* New Year's Eve: fireworks in the window sky once it's dusk, and the signs say Happy New Year */
  const fireworks = createFireworks(panes, glow);
  {
    const N = "newyear";
    for (const o of fireworks.objects) { o.visible = false; (packs[N] ??= []).push(o); }
    signs(N, ["HAPPY", "NEW YEAR!"], ["#ffc531", "#7657ee"], (g, x, y) => {
      g.strokeStyle = "#ffc531"; g.lineWidth = 4;
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; g.beginPath(); g.moveTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8); g.lineTo(x + Math.cos(a) * 24, y + Math.sin(a) * 24); g.stroke(); }
    });
  }

  /* Valentine's: a garland of hearts, roses on the coffee table and the kitchen table, signs */
  {
    const V = "valentines";
    both(V, (i, p) => flatShape(heartShape(1.1), [0xff5f93, RED, 0xffb6c8][i % 3], p.clone().add(new THREE.Vector3(0, -0.12, 0))), { string: 0xff8fb1, spacing: 0.5 });
    signs(V, ["HAPPY", "VALENTINE'S"], ["#ff5f93", "#e23b3b"], (g, x, y) => {
      g.fillStyle = "#ff5f93"; g.beginPath(); g.moveTo(x, y + 18);
      g.bezierCurveTo(x - 30, y - 2, x - 16, y - 24, x, y - 10); g.bezierCurveTo(x + 16, y - 24, x + 30, y - 2, x, y + 18); g.fill();
    });
    if (table) place(V, table, vase([RED, 0xff5f93, RED, 0xffb6c8, RED]), ...TABLE_SPOT);
    if (kitchenTable) place(V, kitchenTable, vase([RED, 0xff5f93, RED]), ...KTABLE_SPOT);
  }

  /* Easter: pastel bunting, a basket of painted eggs, a bunny on the bookshelf, tulips, signs */
  {
    const E = "easter";
    const pastel = [0xff9fc2, 0x9fd0ff, 0xffe066, 0x8fe0c0, 0xc3a6f0];
    both(E, (i, p) => pennant(p, pastel[i % pastel.length]));
    signs(E, ["HAPPY", "EASTER"], ["#ff9fc2", "#3dd6a8"], (g, x, y) => { g.fillStyle = "#ffe066"; g.beginPath(); g.ellipse(x, y, 18, 24, 0, 0, 7); g.fill(); g.fillStyle = "#9fd0ff"; g.fillRect(x - 18, y - 4, 36, 7); });
    if (table) place(E, table, eggBasket(), ...TABLE_SPOT);
    if (shelf) place(E, shelf.group, bunny(), 0.3, shelfTop, 0.1);
    if (kitchenTable) place(E, kitchenTable, vase([0xffe066, 0xff9fc2, 0xc3a6f0, 0xffe066]), ...KTABLE_SPOT);
    place(E, kitchen, eggBasket(), 12.1, 1.35, 1.3);
  }

  /* bonus pickups the little one drops: bounce, bob, picked up on contact */
  const treatLayer = new THREE.Group();
  treatLayer.userData.tag = "season-treats";
  room.add(treatLayer);
  const treats = [];
  const mirrored = new Map();
  let nextTreatId = 0;
  let active = [];
  const treatSeason = () => active.find((id) => TREATS[id]) ?? null;
  const treatApi = {
    get count() { return treats.length + mirrored.size; },
    /** The season whose pickup drops now ("halloween" → sweets …), or null. */
    get kind() { return treatSeason(); },
    get message() { return TREATS[treatSeason()]?.say ?? "+50"; },
    spawn(x, z, vx, vz, rng) {
      const kind = TREATS[treatSeason()];
      if (!kind) return;
      const color = kind.colors[Math.floor(rng() * kind.colors.length)];
      const m = kind.make(color);
      m.scale.setScalar(1.6);
      m.userData.tag = "season-treat";
      treatLayer.add(m);
      treats.push({ m, id: ++nextTreatId, season: treatSeason(), color, x, y: 1.1, z, vx: vx * 0.8, vy: 4, vz: vz * 0.8, rest: false, t: 0, life: 18 });
    },
    /** Returns how many the player picked up this step (main scores them). */
    step(dt, player, keepIn) {
      let picked = 0;
      for (const s of [...treats]) {
        s.t += dt; s.life -= dt;
        if (!s.rest) {
          s.vy -= 25 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
          if (s.y <= 0.25 && s.vy < 0) { s.y = 0.25; s.vy *= -0.4; s.vx *= 0.6; s.vz *= 0.6; if (Math.abs(s.vy) < 1) s.rest = true; }
          keepIn?.(s);
        }
        s.m.position.set(s.x, s.y + (s.rest ? 0.08 * Math.sin(s.t * 4) + 0.08 : 0), s.z);
        s.m.rotation.y += dt * 2;
        s.m.visible = s.life > 3 || Math.sin(s.life * 18) > -0.3;
        const gone = s.life <= 0, got = s.rest && Math.hypot(s.x - player.x, s.z - player.z) < 1.4;
        if (gone || got) { treatLayer.remove(s.m); treats.splice(treats.indexOf(s), 1); if (got) picked += 1; }
      }
      return picked;
    },
    snapshot() {
      return treats.map((s) => ({ id: s.id, season: s.season, color: s.color,
        p: s.m.position.toArray(), yaw: s.m.rotation.y, visible: s.m.visible }));
    },
    /** Draw only: the host owns physics, expiry and pickups. Reuse each mesh until it disappears. */
    mirror(a, b, blend) {
      const before = new Map(a.map((s) => [s.id, s]));
      const present = new Set(b.map((s) => s.id));
      for (const [id, m] of mirrored) if (!present.has(id)) {
        treatLayer.remove(m); m.traverse((o) => o.geometry?.dispose()); mirrored.delete(id);
      }
      for (const s of b) {
        if (!TREATS[s.season]) continue;
        let m = mirrored.get(s.id);
        if (!m) {
          m = TREATS[s.season].make(s.color); m.scale.setScalar(1.6); m.userData.tag = "season-treat";
          mirrored.set(s.id, m); treatLayer.add(m);
        }
        const from = before.get(s.id) ?? s;
        m.position.set(...s.p.map((v, i) => from.p[i] + (v - from.p[i]) * blend));
        m.rotation.y = from.yaw + (s.yaw - from.yaw) * blend; m.visible = s.visible;
      }
    },
    clear() {
      for (const m of [...treats.map((s) => s.m), ...mirrored.values()]) {
        treatLayer.remove(m); m.traverse((o) => o.geometry?.dispose());
      }
      treats.length = 0; mirrored.clear();
    },
  };

  const CORNERS = [[-10.8, -7.2], [10.8, -7.2], [-10.8, 7.2], [10.8, 7.2]];
  let t = 0;
  return {
    treats: treatApi,
    get active() { return active; },
    set(ids) {
      active = ids.filter((id) => packs[id]);
      for (const [id, list] of Object.entries(packs)) for (const o of list) o.visible = active.includes(id);
      // on New Year's Eve the signs say Happy New Year instead of Merry Christmas
      if (active.includes("newyear")) for (const o of packs.christmas) if (o.userData.tag === "season-sign") o.visible = false;
    },
    /** Christmas: stand the tree in the corner no station took this layout; returns its obstacle (or null). */
    placeTree(stations) {
      if (!active.includes("christmas")) return null;
      const free = CORNERS.find(([x, z]) => !stations.some((s) => Math.hypot(s.x - x, s.z - z) < 1)) ?? CORNERS[0];
      // tucked a little further into the corner than a station would stand
      const x = free[0] + Math.sign(free[0]) * 0.6, z = free[1] + Math.sign(free[1]) * 0.6;
      tree.position.set(x, 0, z);
      return { id: "xmas-tree", x, z, hx: 1.05, hz: 1.05 };
    },
    step(dt, dayT) {
      if (!active.length) return;
      t += dt;
      const night = THREE.MathUtils.smoothstep(dayT, 0.55, 0.9);
      for (const m of glowing.faces) m.color.copy(DARK_FACE).lerp(CANDLE, 0.25 + night * 0.75);
      for (const h of glowing.halos) h.material.opacity = 0.15 + night * 0.85;
      lights.step(t, night);
      if (active.includes("christmas")) snow.step(dt, t);
      if (active.includes("newyear")) fireworks.step(dt, dayT);
    },
  };
}

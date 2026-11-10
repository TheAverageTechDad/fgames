/**
 * The playroom's walls, so they read as a family's room rather than blank plaster: a kid's crayon
 * drawing of the family, a rainbow print, a night-sky print, a bunting garland, a wall clock that
 * ticks with play time, a growth chart and two little prints on the side walls.
 *
 *   const decor = createWallDecor(room);   // once, after the game fonts have loaded
 *   decor.step(dt);                        // every update: the clock's second hand ticks
 *
 * All artwork is drawn into canvases here (deterministic: jitter comes from makeRng), framed in
 * baked wood. Nothing casts shadows or blocks movement; ~20 meshes in total.
 */
import * as THREE from "three";
import { makeRng, standardMaterial } from "./materials.js";
import { ROOM } from "./room.js";

const INK = "#241b3a";
const DISPLAY = "'Luckiest Guy', 'Lilita One', system-ui, sans-serif";
const BACK_Z = -ROOM.hz; // inner face of the back wall; side walls at ±ROOM.hx

function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A waxy crayon line: the path drawn twice with a little jitter, like a child pressing hard. */
function crayon(g, rng, points, color, width = 7, close = false) {
  g.strokeStyle = color; g.lineCap = g.lineJoin = "round";
  for (let pass = 0; pass < 2; pass++) {
    g.lineWidth = width * (pass ? 0.6 : 1);
    g.globalAlpha = pass ? 0.55 : 0.9;
    g.beginPath();
    points.forEach(([x, y], i) => {
      const jx = (rng() - 0.5) * 3, jy = (rng() - 0.5) * 3;
      i ? g.lineTo(x + jx, y + jy) : g.moveTo(x + jx, y + jy);
    });
    if (close) g.closePath();
    g.stroke();
  }
  g.globalAlpha = 1;
}
const circlePts = (cx, cy, r, n = 18) => Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos(i / n * 6.283) * r, cy + Math.sin(i / n * 6.283) * r]);
/** A stick person: head, body, arms out to hold hands, legs. `h` is head-to-toe height. */
function stickPerson(g, rng, x, foot, h, color, { puff = false, bunches = false, glasses = false } = {}) {
  const head = h * 0.17, neck = foot - h + head * 2;
  crayon(g, rng, circlePts(x, foot - h + head, head), color, 6);
  if (puff) crayon(g, rng, circlePts(x, foot - h - head * 0.3, head * 0.75), color, 6);
  if (bunches) for (const s of [-1, 1]) crayon(g, rng, circlePts(x + s * head * 1.2, foot - h + head * 0.4, head * 0.45), color, 5);
  if (glasses) for (const s of [-1, 1]) crayon(g, rng, circlePts(x + s * head * 0.4, foot - h + head, head * 0.28, 10), INK, 3);
  crayon(g, rng, [[x, neck], [x, foot - h * 0.42]], color);
  crayon(g, rng, [[x - h * 0.24, neck + h * 0.12], [x, neck + h * 0.06], [x + h * 0.24, neck + h * 0.12]], color);
  crayon(g, rng, [[x - h * 0.13, foot], [x, foot - h * 0.42], [x + h * 0.13, foot]], color);
}

/** The family, as the big sister drew it: sun, house, the four of them holding hands, a heart. */
function familyDrawing(g, w, h) {
  const rng = makeRng(31);
  g.fillStyle = "#fffdf6"; g.fillRect(0, 0, w, h);
  crayon(g, rng, circlePts(52, 52, 26), "#ffb627", 9);
  for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; crayon(g, rng, [[52 + Math.cos(a) * 36, 52 + Math.sin(a) * 36], [52 + Math.cos(a) * 52, 52 + Math.sin(a) * 52]], "#ffb627", 6); }
  crayon(g, rng, [[300, 74], [330, 60], [360, 74], [390, 62]], "#7fb8f0", 6); // a bird-ish cloud scribble
  crayon(g, rng, [[0, 262], [w, 258]], "#5fb52e", 12);
  for (let x = 10; x < w; x += 22) crayon(g, rng, [[x, 262], [x + 5, 248]], "#5fb52e", 4);
  crayon(g, rng, [[300, 250], [300, 170], [400, 170], [400, 250]], "#e2452b", 7); // house
  crayon(g, rng, [[290, 172], [350, 120], [410, 172]], "#e2452b", 7, true);
  crayon(g, rng, [[338, 250], [338, 214], [362, 214], [362, 250]], "#7657ee", 6);
  stickPerson(g, rng, 70, 252, 150, "#3a5fd0", { glasses: true }); // dad
  stickPerson(g, rng, 140, 252, 138, "#e0559a", { puff: true }); // mom
  stickPerson(g, rng, 202, 252, 96, "#22b385", { bunches: true }); // big sister
  stickPerson(g, rng, 252, 252, 66, "#ff7a4d", { bunches: true }); // the little one
  const heart = [[150, 74], [136, 58], [122, 66], [124, 82], [150, 104], [176, 82], [178, 66], [164, 58], [150, 74]];
  crayon(g, rng, heart, "#ff5f93", 7);
}

function rainbowPrint(g, w, h) {
  g.fillStyle = "#fff4e2"; g.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h * 0.68;
  ["#f26b5b", "#ffa94d", "#ffd56b", "#7fcf8f", "#6fb7f0", "#a98be8"].forEach((c, i) => {
    g.strokeStyle = c; g.lineWidth = 15; g.beginPath(); g.arc(cx, cy, 92 - i * 15, Math.PI, 0); g.stroke();
  });
  g.fillStyle = "#ffffff";
  for (const [x, y, s] of [[cx - 92, cy + 6, 1], [cx + 92, cy + 6, 1]]) {
    for (const [dx, dy, r] of [[-18, 0, 16], [0, -10, 20], [18, 0, 16], [0, 6, 16]]) { g.beginPath(); g.arc(x + dx * s, y + dy, r, 0, 7); g.fill(); }
  }
  g.fillStyle = INK; g.font = `30px ${DISPLAY}`; g.textAlign = "center"; g.fillText("be kind", cx, h - 34);
}

function nightPrint(g, w, h) {
  g.fillStyle = "#2b2f6b"; g.fillRect(0, 0, w, h);
  const rng = makeRng(7);
  g.fillStyle = "#fff1b8";
  g.beginPath(); g.arc(w * 0.58, h * 0.44, 46, 0, 7); g.fill();
  g.fillStyle = "#2b2f6b"; g.beginPath(); g.arc(w * 0.58 + 22, h * 0.44 - 14, 42, 0, 7); g.fill(); // crescent
  g.fillStyle = "#fff6d6";
  for (let i = 0; i < 16; i++) {
    const x = rng() * w, y = rng() * h * 0.9, r = 1.5 + rng() * 3.5;
    g.beginPath();
    for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283 - Math.PI / 2, rr = k % 2 ? r * 0.45 : r * 1.6; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.fill();
  }
}

function heartPrint(g, w, h) {
  g.fillStyle = "#ffe6ea"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#ff5f93"; g.strokeStyle = INK; g.lineWidth = 6;
  g.beginPath(); g.moveTo(w / 2, h * 0.78);
  g.bezierCurveTo(w * 0.05, h * 0.5, w * 0.2, h * 0.12, w / 2, h * 0.34);
  g.bezierCurveTo(w * 0.8, h * 0.12, w * 0.95, h * 0.5, w / 2, h * 0.78);
  g.fill(); g.stroke();
}

function abcPrint(g, w, h) {
  g.fillStyle = "#e9f6f1"; g.fillRect(0, 0, w, h);
  g.font = `72px ${DISPLAY}`; g.textAlign = "center"; g.textBaseline = "middle";
  [["A", "#f25f3a"], ["B", "#3a96ee"], ["C", "#22b385"]].forEach(([ch, c], i) => {
    const x = w / 2 + (i - 1) * 62, y = h / 2 + (i % 2 ? 12 : -10);
    g.lineWidth = 10; g.strokeStyle = INK; g.strokeText(ch, x, y + 3);
    g.fillStyle = c; g.fillText(ch, x, y);
  });
}

/** Growth chart: a painted ruler strip with ticks and star marks where heights were measured. */
function growthChart(g, w, h) {
  g.fillStyle = "#fff8ec"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#ffd56b"; g.fillRect(0, 0, 18, h);
  g.strokeStyle = INK; g.fillStyle = INK; g.font = `20px ${DISPLAY}`; g.textAlign = "left";
  for (let i = 0; i <= 20; i++) {
    const y = h - 12 - i * ((h - 24) / 20), major = i % 5 === 0;
    g.lineWidth = major ? 4 : 2;
    g.beginPath(); g.moveTo(18, y); g.lineTo(major ? 58 : 38, y); g.stroke();
    if (major && i) g.fillText(String(i * 5), 64, y + 7);
  }
  for (const [y, c] of [[0.46, "#ff7a4d"], [0.3, "#22b385"]]) { // the two girls' marks
    const yy = h * y;
    g.fillStyle = c; g.beginPath();
    for (let k = 0; k < 10; k++) { const a = k / 10 * 6.283 - Math.PI / 2, r = k % 2 ? 7 : 16; g.lineTo(w - 40 + Math.cos(a) * r, yy + Math.sin(a) * r); }
    g.fill();
    g.strokeStyle = c; g.lineWidth = 4; g.beginPath(); g.moveTo(18, yy); g.lineTo(w - 58, yy); g.stroke();
  }
}

function clockFace(g, w) {
  const c = w / 2;
  g.fillStyle = "#fff8ec"; g.beginPath(); g.arc(c, c, c, 0, 7); g.fill();
  g.fillStyle = INK; g.font = `44px ${DISPLAY}`; g.textAlign = "center"; g.textBaseline = "middle";
  for (let i = 1; i <= 12; i++) {
    const a = i / 12 * 6.283 - Math.PI / 2;
    if (i % 3 === 0) g.fillText(String(i), c + Math.cos(a) * c * 0.72, c + Math.sin(a) * c * 0.72 + 3);
    else { g.beginPath(); g.arc(c + Math.cos(a) * c * 0.76, c + Math.sin(a) * c * 0.76, 6, 0, 7); g.fill(); }
  }
}

export function createWallDecor(room) {
  const group = new THREE.Group();
  group.userData.tag = "wall-decor";
  room.add(group);
  const wood = standardMaterial({ kind: "wood", seed: 12, repeat: 1, bumpScale: 0.01, roughness: 0.8, palette: [0xc98d55, 0xd39a62, 0xbf8148] });
  const white = standardMaterial({ kind: "plaster", seed: 13, repeat: 1, bumpScale: 0.005, palette: [0xfffaf2, 0xffffff, 0xf7f1e6] });

  /** A framed picture on a wall: `facing` is the direction the picture looks (into the room). */
  function frame(drawFn, px, w, h, pos, facing, frameMat = wood) {
    const holder = new THREE.Group();
    const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.18, h + 0.18, 0.08), frameMat);
    back.receiveShadow = true;
    const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: canvasTexture(px, Math.round(px * h / w), drawFn), roughness: 0.85 }));
    art.position.z = 0.045;
    art.receiveShadow = true;
    holder.add(back, art);
    holder.position.copy(pos);
    holder.lookAt(pos.clone().add(facing));
    group.add(holder);
    return holder;
  }
  const intoRoomFromBack = new THREE.Vector3(0, 0, 1);
  const z = BACK_Z + 0.06;

  // Placement follows what the play camera sees: the back wall shows as a strip whose ends sit under
  // the HUD chips, so it holds the family drawing (left of the window) and the clock (right of it);
  // the side walls, seen at an angle further down the screen, take the other prints.
  // Back wall, left of the window: the family drawing, big enough to read from the play camera.
  frame(familyDrawing, 512, 3.4, 2.1, new THREE.Vector3(-2.4, 2.75, z), intoRoomFromBack);

  // Bunting garland across the top of the left back wall: flags hanging off a sagging string.
  {
    const x0 = -12.4, x1 = -0.6, top = 3.98, sag = 0.32, n = 13;
    const yAt = (t) => top - sag * 4 * t * (1 - t);
    const curve = new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, i) => {
      const t = i / 8; return new THREE.Vector3(x0 + (x1 - x0) * t, yAt(t), z + 0.03);
    }));
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.014, 5), wood));
    const colors = [0xf25f3a, 0xffb627, 0x22b385, 0x3a96ee, 0x9b7bf0, 0xff5f93];
    const pos = [], col = [], uv = [], c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const ta = (i + 0.15) / n, tb = (i + 0.85) / n, tm = (i + 0.5) / n;
      const xa = x0 + (x1 - x0) * ta, xb = x0 + (x1 - x0) * tb, xm = x0 + (x1 - x0) * tm;
      pos.push(xa, yAt(ta), z + 0.035, xm, yAt(tm) - 0.42, z + 0.035, xb, yAt(tb), z + 0.035);
      c.setHex(colors[i % colors.length]);
      for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
      uv.push(0, 1, 0.5, 0, 1, 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const cloth = standardMaterial({ kind: "cloth", seed: 14, repeat: 1, bumpScale: 0.01, roughness: 0.95, palette: [0xffffff, 0xf6f6f6, 0xeeeeee] });
    cloth.vertexColors = true;
    cloth.side = THREE.DoubleSide;
    group.add(new THREE.Mesh(geo, cloth));
  }

  // Open curtains on the window (frame spans x 0.5–6.5, y 0.7–4.3): a wooden rod, and a soft coral
  // panel each side, straight along its outer edge, swept in to a teal tie-back and flaring below it,
  // with folds that deepen where the fabric gathers.
  {
    const rodY = 4.52, rodZ = z + 0.24;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 7.4, 10), wood);
    rod.rotation.z = Math.PI / 2;
    rod.position.set(3.5, rodY, rodZ);
    group.add(rod);
    for (const x of [-0.2, 7.2]) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), wood);
      knob.position.set(x, rodY, rodZ);
      group.add(knob);
    }
    const fabric = standardMaterial({ kind: "cloth", seed: 21, repeat: 2, bumpScale: 0.02, roughness: 0.95,
      palette: [0xf6b7a6, 0xf2a894, 0xf8c3b4], side: THREE.DoubleSide });
    const ribbon = standardMaterial({ kind: "cloth", seed: 22, repeat: 1, bumpScale: 0.01, palette: [0x2fa58f, 0x37b39c, 0x2a9a85] });
    const W = 1.1, top = 4.46, bottom = 0.95, H = top - bottom, TIE = 0.34;
    const widthAt = (v) => { // fraction of W at height v (0 bottom → 1 top): pinched at the tie-back
      const pinch = v > TIE ? (v - TIE) / (1 - TIE) : (TIE - v) / TIE;
      return (0.34 + 0.66 * Math.pow(pinch, 0.75)) * (v > TIE ? 1 : 0.82);
    };
    for (const [outer, dir] of [[-0.12, 1], [7.12, -1]]) {
      const geo = new THREE.PlaneGeometry(1, 1, 20, 30);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i) + 0.5, v = p.getY(i) + 0.5, wf = widthAt(v);
        const folds = Math.sin(u * Math.PI * 7) * (0.04 + 0.09 * (1 - wf));
        p.setXYZ(i, outer + dir * u * W * wf, bottom + v * H, rodZ - 0.06 + folds + 0.05 * u * (1 - wf));
      }
      geo.computeVertexNormals();
      const curtain = new THREE.Mesh(geo, fabric);
      curtain.receiveShadow = true;
      group.add(curtain);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.045, 6, 20), ribbon);
      band.rotation.x = Math.PI / 2;
      band.scale.set(W * widthAt(TIE) * 0.62, 0.32, 1);
      band.position.set(outer + dir * W * widthAt(TIE) * 0.5, bottom + TIE * H, rodZ - 0.04);
      group.add(band);
    }
  }

  // Back wall, right of the window: the round wall clock (the kitchen has one too).
  const clock = createWallClock(group, new THREE.Vector3(8.6, 2.9, z));

  // Side walls (seen at an angle): the growth chart on the left, two small prints on the right.
  const intoRoomFromLeft = new THREE.Vector3(1, 0, 0), intoRoomFromRight = new THREE.Vector3(-1, 0, 0);
  frame(rainbowPrint, 256, 1.6, 2.0, new THREE.Vector3(-ROOM.hx + 0.06, 2.75, -3.2), intoRoomFromLeft, white);
  frame(growthChart, 160, 0.75, 2.7, new THREE.Vector3(-ROOM.hx + 0.06, 2.65, 1.2), intoRoomFromLeft, white);
  frame(heartPrint, 192, 1.3, 1.3, new THREE.Vector3(ROOM.hx - 0.06, 3.0, -4.6), intoRoomFromRight);
  frame(abcPrint, 256, 1.9, 1.3, new THREE.Vector3(ROOM.hx - 0.06, 2.85, -1.4), intoRoomFromRight, white);
  frame(nightPrint, 256, 1.4, 1.4, new THREE.Vector3(ROOM.hx - 0.06, 2.95, 1.9), intoRoomFromRight);

  return {
    group,
    step: (dt) => clock.step(dt),
    setTime: (minutes) => clock.setTime(minutes),
    reset: () => clock.reset(),
  };
}

/**
 * A round wall clock (playroom and kitchen), facing +z from `position` in `parent`. Its second hand
 * ticks once per second of play; the hour and minute hands show the time of day (daylight.js) via
 * `setTime(minutes)`, starting at ten past ten, the friendly clock face.
 */
export function createWallClock(parent, position, scale = 1) {
  const clock = new THREE.Group();
  clock.position.copy(position);
  clock.scale.setScalar(scale);
  clock.userData.tag = "wall-clock";
  parent.add(clock);
  const R = 0.85;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.14, 40),
    standardMaterial({ kind: "plaster", seed: 15, repeat: 1, bumpScale: 0.005, roughness: 0.6, palette: [0xf26b5b, 0xf47a6a, 0xee5f50] }));
  rim.rotation.x = Math.PI / 2;
  const face = new THREE.Mesh(new THREE.CircleGeometry(R * 0.86, 40),
    new THREE.MeshStandardMaterial({ map: canvasTexture(256, 256, clockFace), roughness: 0.7 }));
  face.position.z = 0.072;
  clock.add(rim, face);
  const handMat = new THREE.MeshStandardMaterial({ color: 0x241b3a, roughness: 0.5 });
  const hand = (len, width, mat = handMat, zOff = 0.09) => {
    const pivot = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(width, len, 0.02), mat);
    bar.position.y = len / 2 - 0.06;
    pivot.add(bar);
    pivot.position.z = zOff;
    clock.add(pivot);
    return pivot;
  };
  const hourHand = hand(R * 0.48, 0.07), minuteHand = hand(R * 0.7, 0.05, handMat, 0.1);
  const secondHand = hand(R * 0.76, 0.02, new THREE.MeshStandardMaterial({ color: 0xf25f3a, roughness: 0.5 }), 0.11);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16), handMat);
  cap.rotation.x = Math.PI / 2;
  cap.position.z = 0.12;
  clock.add(cap);
  let seconds = 10 * 3600 + 8 * 60; // 10:08:00
  let acc = 0, tick = 0; // the second hand ticks real seconds; hours and minutes can follow the game's day
  function setHands() {
    const s = tick % 60, m = (seconds / 60) % 60, h = (seconds / 3600) % 12;
    // clockwise as seen from the front = negative rotation about the clock's +z (which faces the room)
    secondHand.rotation.z = -s / 60 * Math.PI * 2;
    minuteHand.rotation.z = -m / 60 * Math.PI * 2;
    hourHand.rotation.z = -h / 12 * Math.PI * 2;
  }
  setHands();
  return {
    group: clock,
    step(dt) {
      acc += dt;
      if (acc >= 1) { const whole = Math.floor(acc); acc -= whole; tick += whole; setHands(); }
    },
    /** Show the time of day (minutes after midnight): daylight.js's clock. */
    setTime(minutes) {
      const next = Math.floor(minutes) * 60;
      if (next !== seconds) { seconds = next; setHands(); }
    },
    reset() { seconds = 10 * 3600 + 8 * 60; acc = 0; tick = 0; setHands(); },
  };
}

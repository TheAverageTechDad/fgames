import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ARC_R, BALL_R, BOARD, COURT, DAD_HEIGHT, POLE, RIM } from './court';
import { createShootaround, jump, startShot, stepShootaround, type GameEvent } from './game';
import { createHoopsInput, type Target } from './input';

const DAD = '/catcha/assets/chibi-dad.glb';
// The court texture covers a little grass around the lines.
const PAD = { minX: -4.6, maxX: 4.6, minZ: -1.2, maxZ: 7.9 }, PX = 100;
const turn = (from: number, to: number, k: number) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * Math.min(1, k);

function canvasTexture(width: number, height: number, paint: (c: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  paint(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

function courtTexture() {
  return canvasTexture((PAD.maxX - PAD.minX) * PX, (PAD.maxZ - PAD.minZ) * PX, c => {
    const X = (x: number) => (x - PAD.minX) * PX, Z = (z: number) => (z - PAD.minZ) * PX;
    c.fillStyle = '#7fa65a'; c.fillRect(0, 0, c.canvas.width, c.canvas.height);
    c.fillStyle = '#62666d'; c.fillRect(X(-COURT.halfWidth - 0.4), Z(-0.6), (COURT.halfWidth * 2 + 0.8) * PX, (COURT.depth + 0.9) * PX);
    // Asphalt grit: a fine speckle of light and dark stones.
    for (let i = 0; i < 26000; i++) {
      c.fillStyle = Math.random() < 0.5 ? '#ffffff14' : '#00000018';
      c.fillRect(X(-COURT.halfWidth - 0.4) + Math.random() * (COURT.halfWidth * 2 + 0.8) * PX, Z(-0.6) + Math.random() * (COURT.depth + 0.9) * PX, 2, 2);
    }
    c.strokeStyle = '#f4f1e8'; c.lineWidth = 6;
    c.strokeRect(X(-COURT.halfWidth), Z(0), COURT.halfWidth * 2 * PX, COURT.depth * PX);
    c.fillStyle = '#c9603c55'; c.fillRect(X(-1.2), Z(0), 2.4 * PX, 3.4 * PX); c.strokeRect(X(-1.2), Z(0), 2.4 * PX, 3.4 * PX); // the key
    c.beginPath(); c.arc(X(0), Z(3.4), 1 * PX, 0, Math.PI); c.stroke();
    c.beginPath(); c.arc(X(RIM.x), Z(RIM.z), ARC_R * PX, 0, Math.PI); c.stroke(); // the arc
  });
}

function ballTexture() {
  return canvasTexture(512, 256, c => {
    c.fillStyle = '#e0702a'; c.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 3000; i++) { c.fillStyle = Math.random() < 0.5 ? '#ffffff12' : '#00000014'; c.fillRect(Math.random() * 512, Math.random() * 256, 2, 2); }
    c.strokeStyle = '#2b1a12'; c.lineWidth = 6;
    for (const x of [0, 128, 256, 384]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 256); c.stroke(); }
    c.beginPath(); c.moveTo(0, 128); c.lineTo(512, 128); c.stroke();
  });
}

export function createHoopsScene(host: HTMLElement, callbacks: { update(): void; event(e: GameEvent): void }) {
  const state = createShootaround();
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.04;
  const canvas = renderer.domElement; canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Basketball court. Drag to move, push far to sprint, tap to jump. Swipe up from Dad to shoot.');
  canvas.dataset.hoopsCanvas = ''; host.append(canvas);

  const scene = new THREE.Scene(); scene.background = new THREE.Color('#f6d7a4'); scene.fog = new THREE.Fog('#f6d7a4', 30, 60);
  const hemi = new THREE.HemisphereLight('#fff4e0', '#6f8a55', 1.4); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe2b0', 2.6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
  sun.position.set(-6, 12, 9); sun.target.position.set(0, 0, 4); scene.add(sun, sun.target);

  // An elevated view looking at the hoop squarely (shot.ts relies on no yaw), pulled back until the whole court width fits.
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  const target = new THREE.Vector3(0, 1.1, 3.2), VIEW = new THREE.Vector3(0, Math.sin(0.6), Math.cos(0.6));
  const corners = [new THREE.Vector3(-COURT.halfWidth, 0, COURT.depth), new THREE.Vector3(COURT.halfWidth, 0, COURT.depth), new THREE.Vector3(-COURT.halfWidth, 0, 0), new THREE.Vector3(COURT.halfWidth, 0, 0)];
  const probe = new THREE.Vector3();
  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height); camera.aspect = width / height;
    // ponytail: a linear search for the framing distance, run only on resize.
    for (let distance = 8; distance < 60; distance += 0.25) {
      camera.position.copy(target).addScaledVector(VIEW, distance); camera.lookAt(target); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      if (corners.every(c => Math.abs(probe.copy(c).project(camera).x) <= 0.96 && probe.y > -0.9)) break;
    }
  };
  const observer = new ResizeObserver(resize); observer.observe(host); resize();

  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(thing: T) => { disposables.push(thing); return thing; };
  const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => keep(new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra }));

  // Court
  const ground = new THREE.Mesh(keep(new THREE.PlaneGeometry(PAD.maxX - PAD.minX, PAD.maxZ - PAD.minZ)), keep(new THREE.MeshStandardMaterial({ map: keep(courtTexture()), roughness: 0.95 })));
  ground.rotation.x = -Math.PI / 2; ground.position.set((PAD.minX + PAD.maxX) / 2, 0, (PAD.minZ + PAD.maxZ) / 2); ground.receiveShadow = true; scene.add(ground);
  // Grass runs out past the edges of the view, under the thumb.
  const lawn = new THREE.Mesh(keep(new THREE.PlaneGeometry(80, 80)), mat('#7fa65a', { roughness: 1 }));
  lawn.rotation.x = -Math.PI / 2; lawn.position.y = -0.01; lawn.receiveShadow = true; scene.add(lawn);

  // Hoop: pole, arm, board, rim and a net that stretches on a basket.
  const steel = mat('#3c4651', { metalness: 0.4, roughness: 0.5 });
  const pole = new THREE.Mesh(keep(new THREE.CylinderGeometry(POLE.radius, POLE.radius, POLE.top, 16)), steel); pole.position.set(POLE.x, POLE.top / 2, POLE.z);
  const arm = new THREE.Mesh(keep(new THREE.BoxGeometry(0.1, 0.1, BOARD.z - POLE.z)), steel); arm.position.set(0, 3.3, (BOARD.z + POLE.z) / 2);
  const boardFace = keep(canvasTexture(360, 210, c => {
    c.fillStyle = '#f7f7f2'; c.fillRect(0, 0, 360, 210); c.strokeStyle = '#d4553a'; c.lineWidth = 10; c.strokeRect(5, 5, 350, 200); c.strokeRect(120, 90, 120, 90);
  }));
  const board = new THREE.Mesh(keep(new THREE.BoxGeometry(BOARD.halfWidth * 2, BOARD.top - BOARD.bottom, BOARD.halfDepth * 2)), mat('#ffffff', { map: boardFace, roughness: 0.4 }));
  board.position.set(0, (BOARD.top + BOARD.bottom) / 2, BOARD.z);
  const rim = new THREE.Mesh(keep(new THREE.TorusGeometry(RIM.radius, RIM.tube, 10, 40)), mat('#e8541f', { roughness: 0.4, metalness: 0.3 }));
  rim.rotation.x = Math.PI / 2; rim.position.set(RIM.x, RIM.y, RIM.z);
  const bracket = new THREE.Mesh(keep(new THREE.BoxGeometry(0.12, 0.04, RIM.z - RIM.radius - BOARD.z)), rim.material);
  bracket.position.set(0, RIM.y, (BOARD.z + RIM.z - RIM.radius) / 2);
  for (const m of [pole, arm, board, rim, bracket]) { m.castShadow = true; scene.add(m); }
  const net = new THREE.Group(); net.position.set(RIM.x, RIM.y, RIM.z); scene.add(net);
  {
    const points: number[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, b = ((i + 1.5) / 12) * Math.PI * 2;
      points.push(Math.cos(a) * RIM.radius, 0, Math.sin(a) * RIM.radius, Math.cos(b) * 0.18, -0.42, Math.sin(b) * 0.18);
    }
    net.add(new THREE.LineSegments(keep(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3))), keep(new THREE.LineBasicMaterial({ color: '#ffffff' }))));
  }
  let swish = 0;

  // Ball, with a soft shadow that shrinks as it rises.
  const shadowMat = keep(new THREE.MeshBasicMaterial({ color: '#1e2a1a', transparent: true, opacity: 0.25, depthWrite: false }));
  const shadowDisc = (radius: number) => { const m = new THREE.Mesh(keep(new THREE.CircleGeometry(radius, 24)), shadowMat); m.rotation.x = -Math.PI / 2; m.position.y = 0.02; scene.add(m); return m; };
  const ball = new THREE.Mesh(keep(new THREE.SphereGeometry(BALL_R, 32, 16)), mat('#ffffff', { map: keep(ballTexture()), roughness: 0.7 }));
  ball.castShadow = true; scene.add(ball);
  const ballShadow = shadowDisc(BALL_R);
  let ballSquash = 0, ballPulse = 0;

  // Dad, with a ground ring that marks the controlled player.
  const dad = new THREE.Group(), body = new THREE.Group(); dad.add(body); scene.add(dad);
  const dadShadow = shadowDisc(0.36);
  const ring = new THREE.Mesh(keep(new THREE.RingGeometry(0.44, 0.52, 40)), keep(new THREE.MeshBasicMaterial({ color: '#ffcf3d', transparent: true, opacity: 0.9, depthWrite: false })));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.025; scene.add(ring);
  const joints: THREE.Object3D[] = [];
  let model: THREE.Object3D | null = null, disposed = false, paused = false, loaded = false, frame = 0, previous = performance.now(), hudClock = 0;
  let stepPhase = 0, squash = 1, followT = 0, lastPos = { x: state.player.x, z: state.player.z };

  const disposeObject = (root: THREE.Object3D) => root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.dispose();
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) { for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose(); m.dispose(); }
  });
  const ready = new GLTFLoader().loadAsync(DAD).then(gltf => {
    if (disposed) { disposeObject(gltf.scene); return; }
    model = gltf.scene;
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    model.scale.multiplyScalar(DAD_HEIGHT / size.y);
    model.position.y -= new THREE.Box3().setFromObject(model).min.y;
    model.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } else if (/^(arm-|leg-)/.test(o.name)) joints.push(o); });
    body.add(model);
    return renderer.compileAsync(scene, camera);
  }).then(() => { if (!disposed) { loaded = true; previous = performance.now(); callbacks.update(); } });

  /** Dad on screen in client px: his middle, and a radius from his projected height. */
  const dadScreen = (): Target => {
    const rect = canvas.getBoundingClientRect(), p = state.player;
    const feet = probe.set(p.x, p.y, p.z).project(camera), fy = feet.y, fx = feet.x;
    const head = probe.set(p.x, p.y + DAD_HEIGHT, p.z).project(camera);
    const toY = (y: number) => rect.top + (1 - y) * rect.height / 2;
    return { x: rect.left + (fx + 1) * rect.width / 2, y: (toY(fy) + toY(head.y)) / 2, radius: Math.max(28, 0.45 * (toY(fy) - toY(head.y))) };
  };
  const input = createHoopsInput(canvas, host, () => state.mode === 'held' ? dadScreen() : null);

  function feedback(e: GameEvent) {
    if (e.type === 'floor' || e.type === 'dribble') ballSquash = 1;
    if (e.type === 'rim' || e.type === 'board' || e.type === 'pole') ballPulse = 1;
    if (e.type === 'score') swish = 1;
    if (e.type === 'shot') followT = 0.25;
    callbacks.event(e);
  }

  const visibility = () => { previous = performance.now(); };
  document.addEventListener('visibilitychange', visibility);
  function animate(now: number) {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    const dt = Math.min(0.1, Math.max(0, (now - previous) / 1000)); previous = now;
    if (paused || document.hidden || !loaded) return;
    const swipe = input.takeShot();
    if (swipe) startShot(state, swipe);
    if (input.jump()) jump(state);
    const events = stepShootaround(state, dt, input.read()); events.forEach(feedback);

    // Dad: face where he runs (the hoop while shooting), walk, crouch and stretch in jumps, arms for the dribble and the shot.
    const p = state.player, moved = Math.hypot(p.x - lastPos.x, p.z - lastPos.z) / Math.max(dt, 1e-6), moving = moved > 0.3;
    lastPos = { x: p.x, z: p.z };
    const shooting = state.mode === 'windup' || followT > 0;
    dad.position.set(p.x, p.y, p.z);
    dad.rotation.y = turn(dad.rotation.y, shooting ? Math.atan2(RIM.x - p.x, RIM.z - p.z) : p.yaw, dt * 14);
    stepPhase += dt * (moving ? 9 + 4 * Math.min(1, moved / 5) : 0);
    const air = p.y > 0, crouching = p.jumpT >= 0;
    squash += ((crouching ? 0.75 : air ? 1.1 : 1) - squash) * Math.min(1, dt * 14);
    body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    body.rotation.x += ((moving && !air ? 0.12 : 0) - body.rotation.x) * Math.min(1, dt * 10);
    followT = Math.max(0, followT - dt);
    const dribbleReach = Math.abs(Math.cos(Math.PI * state.dribble));
    for (const joint of joints) {
      const isArm = joint.name.startsWith('arm'), right = joint.name.includes('right');
      const swing = moving && !air ? Math.sin(stepPhase) * 0.6 * (right ? 1 : -1) : 0;
      let to = isArm ? -swing * 0.7 : swing;
      if (isArm && shooting) to = state.mode === 'windup' ? -2.7 : -2.3;
      else if (isArm && right && state.mode === 'held') to = -0.45 - 0.55 * dribbleReach;
      else if (isArm && air) to = -2.0;
      joint.rotation.x += (to - joint.rotation.x) * Math.min(1, dt * 18);
    }
    dadShadow.position.set(p.x, 0.02, p.z); dadShadow.scale.setScalar(1 - Math.min(0.4, p.y * 0.4));
    ring.position.set(p.x, 0.025, p.z);

    // Ball: spin with its travel, squash on the floor, a small pulse off the rim and board.
    const b = state.ball.p;
    ball.position.set(b.x, b.y, b.z);
    const v = state.ball.v, spin = Math.hypot(v.x, v.z) * dt / BALL_R;
    if (spin > 0) ball.rotateOnWorldAxis(probe.set(v.z, 0, -v.x).normalize(), spin);
    ballSquash = Math.max(0, ballSquash - dt / 0.12); ballPulse = Math.max(0, ballPulse - dt / 0.15);
    const flat = 0.2 * ballSquash * (b.y < BALL_R * 1.4 ? 1 : 0), pulse = 1 - 0.1 * ballPulse;
    ball.scale.set((1 + flat * 0.6) * pulse, (1 - flat) * pulse, (1 + flat * 0.6) * pulse); ball.position.y -= BALL_R * flat;
    ballShadow.position.set(b.x, 0.021, b.z); ballShadow.scale.setScalar(Math.max(0.4, 1 - b.y * 0.15));

    swish = Math.max(0, swish - dt / 0.3); net.scale.y = 1 + Math.sin(swish * Math.PI) * 0.35;
    renderer.render(scene, camera);
    hudClock += dt;
    if (hudClock > 0.1 || events.length) { hudClock = 0; callbacks.update(); }
  }
  frame = requestAnimationFrame(animate);

  return {
    ready, state, dadScreen,
    setPaused(value: boolean) { paused = value; input.setEnabled(!value); previous = performance.now(); if (!value) canvas.focus({ preventScroll: true }); },
    destroy() {
      if (disposed) return;
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); input.destroy();
      document.removeEventListener('visibilitychange', visibility);
      if (model) disposeObject(model);
      disposables.forEach(d => d.dispose()); sun.shadow.map?.dispose(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    }
  };
}

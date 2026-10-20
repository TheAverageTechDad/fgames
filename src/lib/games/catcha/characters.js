/**
 * The two kids: imported African chibi siblings, the big sibling's WASD movement, and the toddler's
 * seeded wander-and-litter AI. Split out of main.js so the characters/visuals worker can rework
 * the model (faces, hair, clothing silhouettes — the known gap in NOTES.md) and the toddler's
 * pathing without touching the room, items or the sim/HUD glue in main.js.
 *
 *   import { makeKid, createCharacters, stepPlayer, stepToddler, pickToddlerTarget } from "./characters.js";
 *   const { bigSib, toddler, playerBlob, toddlerBlob } = await createCharacters(scene);
 *   // every frame: stepPlayer(dt, keys, {...}); stepToddler(dt, {...});
 */
import * as THREE from "three";
import { loadAsset } from "./assets.js";
import { insideObstacle, resolveObstacles, ROOM } from "./room.js";

/** Blender pivots preserve the existing dt-based walking and toddler arm animation. */
function articulated(group, asset) {
  // Blender appends a numeric suffix to the second sibling's otherwise identical pivot names.
  const pivot = (name) => {
    let found = null;
    group.traverse((o) => { if (!found && !o.isMesh && o.name.startsWith(name)) found = o; });
    return found;
  };
  const limbs = {
    arms: [pivot("arm-right"), pivot("arm-left")],
    legs: [pivot("leg-right"), pivot("leg-left")],
    head: pivot("head"),
  };
  if ([...limbs.arms, ...limbs.legs, limbs.head].some((limb) => !limb)) {
    throw new Error(`Missing articulated pivots in ${asset}`);
  }
  return limbs;
}

export async function makeKid({ asset, scale, tag, boyAsset = null }) {
  if (!boyAsset) {
    const group = await loadAsset(asset, { tag, scale });
    return { group, limbs: articulated(group, asset) };
  }
  // Keep the logical player/toddler root stable: movement, alerts, studio and cooking retain it.
  // Both visual builds load before play, making menu swaps synchronous and available offline.
  const models = await Promise.all([asset, boyAsset].map((name) => loadAsset(name, { tag: `${tag}-model` })));
  const variants = Object.fromEntries(["girl", "boy"].map((variant, i) => [variant,
    { model: models[i], limbs: articulated(models[i], i ? boyAsset : asset) }]));
  const group = new THREE.Group(); group.userData = { tag, asset }; group.scale.setScalar(scale);
  group.add(...models);
  const person = { group, limbs: {}, variant: "girl", setVariant(variant) {
    if (!variants[variant]) return false;
    const next = variants[variant].limbs;
    if (person.limbs.head) {
      next.head.rotation.copy(person.limbs.head.rotation);
      ["arms", "legs"].forEach(key => next[key].forEach((limb, i) => limb.rotation.copy(person.limbs[key][i].rotation)));
    }
    Object.entries(variants).forEach(([id, v]) => { v.model.visible = id === variant; });
    Object.assign(person.limbs, next);
    person.variant = variant; group.userData.asset = variant === "boy" ? boyAsset : asset;
    group.userData.variant = variant;
    return true;
  } };
  person.setVariant("girl");
  return person;
}

/**
 * A warm fresnel rim so the chibis pop off the floor from the high camera. One extra line in the
 * existing standard shader: no extra pass, light or render target (cheap on iPhone 13).
 */
function addRim(material) {
  if (material.userData.rim || /hair/.test(material.name)) return;
  material.userData.rim = true;
  material.customProgramCacheKey = () => "kid-rim";
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
      totalEmissiveRadiance += vec3(1.0, 0.86, 0.7) * pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 3.0) * 0.3;`);
  };
}

/** Soft contact blobs: the kids stay planted even where the shadow map is thin. */
function makeBlob(radius, tag) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 18),
    new THREE.MeshBasicMaterial({ color: 0x3b2a1c, transparent: true, opacity: 0.22 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.14;
  m.userData.tag = tag;
  return m;
}

/** Preloads the whole family and both ground blobs before the first playable frame. */
export async function createCharacters(scene) {
  const [bigSib, toddler, mom, dad] = await Promise.all([
    makeKid({ asset: "chibi-sibling-sample", boyAsset: "chibi-older-boy", scale: 1, tag: "player" }),
    makeKid({ asset: "chibi-toddler", boyAsset: "chibi-younger-boy", scale: 0.65, tag: "toddler" }),
    makeKid({ asset: "chibi-mom", scale: 0.85, tag: "mom" }),
    makeKid({ asset: "chibi-dad", scale: 0.85, tag: "dad" }),
  ]);
  mom.group.visible = dad.group.visible = false;
  // A little "!" that pops over the toddler when the big sibling sprints at her.
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.font = "bold 54px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.lineWidth = 10; g.lineJoin = "round"; g.strokeStyle = "#241b3a"; g.strokeText("!", 32, 34);
  g.fillStyle = "#ff7a4d"; g.fillText("!", 32, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  toddler.alert = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  toddler.alert.position.y = 4.6;
  toddler.alert.visible = false;
  toddler.group.add(toddler.alert);
  // lean (x) in the player's own facing, after yaw; Mum and Dad are players in a duo
  for (const p of [bigSib, mom, dad]) p.group.rotation.order = "YXZ";
  mom.scale0 = dad.scale0 = 0.85; // stepPlayer's squash multiplies this
  bigSib.alert = toddler.alert.clone(); // the big kid makes mess in a duo, so she gets the "!" too
  bigSib.alert.position.y = 4;
  bigSib.group.add(bigSib.alert);
  bigSib.group.position.set(0, 0, 4);
  toddler.group.position.set(2, 0, -2);
  for (const kid of [bigSib, toddler, mom, dad]) kid.group.traverse((o) => {
    if (!o.isMesh) return;
    addRim(o.material);
    // Face details and trinkets are too small to cast a visible shadow: skip their shadow draws.
    if (/eye|iris|pupil|shine|cheek|mouth|tongue|lip|tie|gold|accent/.test(o.material.name)) o.castShadow = false;
  });
  scene.add(bigSib.group, toddler.group, mom.group, dad.group);

  const playerBlob = makeBlob(0.6, "player");
  const toddlerBlob = makeBlob(0.4, "toddler");
  // a duo's second parent and the big kid (who becomes a troublemaker)
  const dadBlob = makeBlob(0.6, "dad"), sibBlob = makeBlob(0.5, "player");
  dadBlob.visible = sibBlob.visible = false;
  scene.add(playerBlob, toddlerBlob, dadBlob, sibBlob);

  return { bigSib, toddler, mom, dad, playerBlob, toddlerBlob, dadBlob, sibBlob };
}

const moveVec = new THREE.Vector3();
const WINDUP = 0.1;
// Jump: a crouch, then real vertical motion (peak 1.5 at 0.25s). Low pieces with a `top` (table,
// ottoman, bed — see room.js) are solid: land on them, walk on them, step off the edge and drop.
// The bed is springy and bounces you onward.
const CROUCH = 0.09, GRAVITY = 48, JUMP_V = 12, BOUNCE_V = 10.5;

/** The surface under (x, z): the highest low piece the feet are over, else the floor (top 0). */
function surfaceAt(obstacles, x, z) {
  let top = 0, hit = null;
  for (const o of obstacles) {
    if (o.top && o.top > top && Math.abs(x - o.x) < o.hx + 0.2 && Math.abs(z - o.z) < o.hz + 0.2) { top = o.top; hit = o; }
  }
  return { top, hit };
}

/**
 * WASD/arrow movement + leg/arm swing for the player-controlled big sibling.
 * `state` is the shared game-state object; this reads/writes `playerYaw` and `walkPhase` on it.
 */
export function stepPlayer(dt, keys, { bigSib, state, speed, obstacles, move = null, jump = false, canSprint = true }) {
  let mx = 0;
  let mz = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) mz -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) mz += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) mx -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) mx += 1;
  const analog = move && move.amount > 0;
  if (analog) { mx = move.x; mz = move.z; }
  moveVec.set(mx, 0, mz);
  const moving = moveVec.lengthSq() > 0;
  const wantSprint = moving && canSprint && (analog ? move.sprint : keys.has("ShiftLeft") || keys.has("ShiftRight"));
  // Sprint is a little move, not a switch: a 0.1s crouch-and-lean-back wind-up, a burst to ~1.55x
  // that settles at 1.35x, and a skid when it ends. `dashT` is seconds since the sprint began.
  let dashBurst = false, skid = false;
  if (wantSprint && state.dashT < 0) state.dashT = 0;
  else if (!wantSprint && state.dashT >= 0) { skid = state.dashT > 0.3; state.dashT = -1; }
  if (state.dashT >= 0) {
    const before = state.dashT;
    state.dashT += dt;
    dashBurst = before < WINDUP && state.dashT >= WINDUP;
  }
  const t = state.dashT;
  const sprint = t < 0 ? 1 : t < WINDUP ? 0.8 : 1.35 + 0.2 * Math.max(0, 1 - (t - WINDUP) / 0.3);
  if (skid) state.skidT = 0.28;
  state.skidT = Math.max(0, (state.skidT ?? 0) - dt);
  // Jump: leaps the way you face, carrying the run's momentum (sprinting goes furthest).
  let jumped = false, landed = false, bounced = false, landedOn = null;
  const pos = bigSib.group.position;
  if (jump && state.jumpT < 0 && !state.airborne) {
    state.jumpT = 0;
    state.jumpSpeed = speed * (moving ? (t >= WINDUP ? 1.35 : 1.1) : 0.35);
  }
  const crouched = state.jumpT >= 0;
  if (crouched) {
    state.jumpT += dt;
    if (state.jumpT >= CROUCH) { state.jumpT = -1; state.airborne = true; state.vy = JUMP_V; state.carry = true; jumped = true; }
  }
  state.landT = Math.max(0, (state.landT ?? 0) - dt);
  if (crouched && !jumped) {
    if (moving) state.playerYaw = Math.atan2(moveVec.x, moveVec.z); // aim while crouched
    state.walkPhase += dt * 2;
  } else if (state.airborne && state.carry) {
    pos.x += Math.sin(state.playerYaw) * state.jumpSpeed * dt;
    pos.z += Math.cos(state.playerYaw) * state.jumpSpeed * dt;
  } else if (moving) {
    moveVec.normalize().multiplyScalar(speed * sprint * dt * (analog ? move.amount : 1));
    pos.add(moveVec);
    state.playerYaw = Math.atan2(moveVec.x, moveVec.z);
    state.walkPhase += dt * 13 * sprint;
  } else {
    state.walkPhase += dt * 2;
  }
  const bx = pos.x, bz = pos.z, feet = state.feetY ?? 0;
  // a piece whose top is under your feet doesn't block you (you're above it)
  resolveObstacles(feet > 0.05 || state.airborne ? obstacles.filter((o) => !(o.top && o.top <= feet + 0.12)) : obstacles, pos, 0.55);
  const bumped = moving && Math.hypot(pos.x - bx, pos.z - bz) > 0.02;
  const under = surfaceAt(obstacles, pos.x, pos.z);
  if (state.airborne) {
    state.vy -= GRAVITY * dt;
    state.feetY = feet + state.vy * dt;
    if (state.feetY <= under.top && state.vy <= 0) {
      state.feetY = under.top;
      if (under.hit?.bouncy) {
        // boing: the mattress throws you up and onward (at least a little, so you never get stuck bouncing)
        state.vy = BOUNCE_V;
        state.carry = true;
        state.jumpSpeed = Math.max(state.jumpSpeed ?? 0, 3.2);
        bounced = true;
        state.landT = 0.12;
      } else {
        state.vy = 0;
        state.airborne = false;
        state.carry = false;
        landed = true;
        landedOn = under.hit?.id ?? null;
        state.landT = 0.16;
      }
    }
  } else if (under.top < feet - 0.05) {
    state.airborne = true; // walked off an edge: drop
    state.vy = 0;
    state.carry = false;
  } else state.feetY = under.top;

  const yawNow = bigSib.group.rotation.y;
  const delta = ((state.playerYaw - yawNow + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  bigSib.group.rotation.y = yawNow + THREE.MathUtils.clamp(delta, -10 * dt, 10 * dt);

  // Body language: lean back in the wind-up and skid, forward while sprinting; squash then stretch.
  const sprinting = t >= WINDUP;
  const winding = t >= 0 && t < WINDUP;
  // jump: crouch forward, stretch on take-off, lean back to land, squash on touch-down
  const crouching = state.jumpT >= 0;
  const air = state.airborne ? THREE.MathUtils.clamp(0.5 - state.vy / (2 * JUMP_V), 0, 1) : -1;
  const leanTo = crouching ? 0.3 : air >= 0 ? (air < 0.6 ? 0.2 : -0.1) : winding ? -0.2 : state.skidT > 0 ? -0.22 : sprinting ? 0.24 : moving ? 0.06 : 0;
  const squashTo = crouching ? 0.72 : air >= 0 ? (air < 0.35 ? 1.18 : 1.04) : state.landT > 0 ? 0.78
    : winding ? 0.86 : sprinting && t < WINDUP + 0.14 ? 1.1 : 1;
  const k = Math.min(1, dt * 16);
  state.lean = (state.lean ?? 0) + (leanTo - (state.lean ?? 0)) * k;
  state.squash = (state.squash ?? 1) + (squashTo - (state.squash ?? 1)) * k;
  bigSib.group.rotation.x = state.lean;
  const s0 = bigSib.scale0 ?? 1;
  bigSib.group.scale.set(s0 / Math.sqrt(state.squash), s0 * state.squash, s0 / Math.sqrt(state.squash));

  const pump = sprinting ? 0.8 : 0.5;
  const swing = Math.sin(state.walkPhase) * (moving ? pump : 0.06);
  bigSib.limbs.legs[0].rotation.x = swing;
  bigSib.limbs.legs[1].rotation.x = -swing;
  // sprinting arms pump harder and sit a little back, like a real run
  const armBase = sprinting ? 0.25 : winding ? 0.6 : 0;
  bigSib.limbs.arms[0].rotation.x = -swing * (sprinting ? 1.1 : 0.7) + armBase;
  bigSib.limbs.arms[1].rotation.x = swing * (sprinting ? 1.1 : 0.7) + armBase;
  pos.y = state.feetY + (moving && !winding ? Math.abs(Math.sin(state.walkPhase)) * (sprinting ? 0.14 : 0.09) : 0);
  if (crouching) {
    // arms swing back, ready to throw forward
    for (const arm of bigSib.limbs.arms) arm.rotation.x = 0.9;
    for (const leg of bigSib.limbs.legs) leg.rotation.x = 0;
    pos.y = state.feetY;
  } else if (air >= 0) {
    // arms thrown up and forward, legs split like a leap, both feet reach for the floor at the end
    const arms = -2.2 + air * 1.5;
    bigSib.limbs.arms[0].rotation.x = arms;
    bigSib.limbs.arms[1].rotation.x = arms + 0.25;
    bigSib.limbs.legs[0].rotation.x = air < 0.7 ? -0.75 : -0.3;
    bigSib.limbs.legs[1].rotation.x = air < 0.7 ? 0.55 : -0.3;
    pos.y = state.feetY;
  }
  return { moving, sprinting, bumped, dashBurst, skid, jumped, landed, landedOn, bounced, ground: under.top };
}

/**
 * Mom's power-up visit: she marches to the nearest floor item and tidies it on touch.
 * `target` is `{x, z}` or null; returns true when she reached it this step.
 */
export function stepMom(dt, mom, target, phase, obstacles) {
  const p = mom.group.position;
  let reached = false, moving = false;
  if (target) {
    const dx = target.x - p.x, dz = target.z - p.z, dist = Math.hypot(dx, dz);
    if (dist < 1.8) reached = true; // she is tall: reaches items that landed by furniture
    else {
      const step = Math.min(dist, 8.5 * dt);
      p.x += (dx / dist) * step;
      p.z += (dz / dist) * step;
      mom.group.rotation.y = Math.atan2(dx, dz);
      moving = true;
    }
  }
  resolveObstacles(obstacles, p, 0.5);
  const swing = Math.sin(phase * 14) * (moving ? 0.45 : 0.05);
  mom.limbs.legs[0].rotation.x = swing;
  mom.limbs.legs[1].rotation.x = -swing;
  mom.limbs.arms[0].rotation.x = -swing;
  mom.limbs.arms[1].rotation.x = swing;
  p.y = moving ? Math.abs(Math.sin(phase * 14)) * 0.08 : 0;
  return reached;
}

/** Picks a new seeded wander target for the toddler, inside the room and clear of furniture. */
/** True when a straight walk from `from` to (x, z) misses every piece of furniture. */
function clearPath(obstacles, from, x, z) {
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    if (insideObstacle(obstacles, from.x + (x - from.x) * t, from.z + (z - from.z) * t, 0.3)) return false;
  }
  return true;
}

/**
 * A new wander spot off the furniture; from `from`, one she can walk straight to. With `away` (the
 * big sister) she picks the reachable spot furthest from her: off to make chaos somewhere else.
 */
export function pickToddlerTarget(state, difficulty, obstacles, rng, from = null, away = null) {
  const d = difficulty();
  let fallback = null, best = null, bestScore = -Infinity;
  for (let tries = 0; tries < 16; tries++) {
    const x = (rng() * 2 - 1) * (ROOM.hx - 2) * d.range;
    const z = (rng() * 2 - 1) * (ROOM.hz - 2) * d.range;
    if (insideObstacle(obstacles, x, z, 0.9)) continue;
    if (!from || clearPath(obstacles, from, x, z)) {
      if (!away) { state.toddlerTarget.set(x, z); return; }
      const score = Math.hypot(x - away.x, z - away.z);
      if (score > bestScore) { bestScore = score; best = { x, z }; }
    } else fallback ??= { x, z };
  }
  const pick = best ?? fallback ?? { x: 0, z: 0 };
  state.toddlerTarget.set(pick.x, pick.z);
}

/**
 * The toddler's seeded wander-and-litter AI: walks to `state.toddlerTarget`, picks a new one on
 * arrival, and — on its own seeded timer — calls `onDrop(kind, x, z, vx, vz)` once per litter
 * item so main.js (which owns the item pool) can spawn it. `difficulty` and `rng` are read fresh
 * each call so a round change or a reset takes effect immediately.
 */
export function stepToddler(dt, { toddler, state, difficulty, obstacles, rng, KINDS, onDrop, player = null }) {
  const d = difficulty();
  const p = toddler.group.position;
  // Chased: she glances back over her shoulder; the first moment of a chase gets a hop and a "!".
  const chased = !!player && state.sprinting && Math.hypot(player.x - p.x, player.z - p.z) < 7;
  if (chased && !state.toddlerChased) state.toddlerAlertT = 0.7;
  state.toddlerChased = chased;
  state.toddlerAlertT = Math.max(0, (state.toddlerAlertT ?? 0) - dt);
  // Wary: the big sister is close (sprinting or not). She keeps an eye on her, scoots away from her,
  // and heads for the far side of the room instead of walking into her arms.
  const gap = player ? Math.hypot(player.x - p.x, player.z - p.z) : Infinity;
  const aware = 3 + d.speed * 0.35;
  const wary = gap < aware && state.toddlerStun <= 0;
  const look = chased || wary ? THREE.MathUtils.clamp(((Math.atan2(player.x - p.x, player.z - p.z) - toddler.group.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -1.3, 1.3) : 0;
  toddler.limbs.head.rotation.y += (look - toddler.limbs.head.rotation.y) * Math.min(1, dt * 10);
  const alert = state.toddlerAlertT;
  toddler.alert.visible = alert > 0;
  toddler.alert.scale.setScalar(alert > 0.55 ? 1.6 * (1 - (alert - 0.55) / 0.15) + 0.2 : 1.4);
  const hop = alert > 0.35 ? Math.sin(((0.7 - alert) / 0.35) * Math.PI) * 0.45 : 0;
  // Bumped by the big sibling: sit, wobble and giggle; no wandering or littering meanwhile.
  if (state.toddlerStun > 0) {
    state.toddlerStun -= dt;
    toddler.group.rotation.z = Math.sin(state.toddlerStun * 18) * 0.18 * Math.min(1, state.toddlerStun);
    p.y = Math.max(0, Math.sin(state.toddlerStun * 9)) * 0.25 * Math.min(1, state.toddlerStun);
    toddler.limbs.arms[0].rotation.x = toddler.limbs.arms[1].rotation.x = 0;
    toddler.limbs.arms[0].rotation.z = 1.4;
    toddler.limbs.arms[1].rotation.z = -1.4;
    return;
  }
  toddler.group.rotation.z = 0;
  state.toddlerAvoidCd = Math.max(0, (state.toddlerAvoidCd ?? 0) - dt);
  if (wary && state.toddlerAvoidCd <= 0) {
    const t = state.toddlerTarget;
    // her current spot is toward the big sister: pick one on the far side
    if (Math.hypot(t.x - player.x, t.y - player.z) < gap + 1) {
      pickToddlerTarget(state, difficulty, obstacles, rng, p, player);
      state.toddlerAvoidCd = 0.9;
      state.toddlerDodges = (state.toddlerDodges ?? 0) + 1;
    }
  }
  const dx = state.toddlerTarget.x - p.x;
  const dz = state.toddlerTarget.y - p.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.6) {
    pickToddlerTarget(state, difficulty, obstacles, rng, p);
  } else {
    let ux = dx / dist, uz = dz / dist;
    if (wary && gap > 0.01) {
      // shy away from her on the way, harder the closer she is
      const w = (1 - gap / aware) * 1.4;
      ux += ((p.x - player.x) / gap) * w;
      uz += ((p.z - player.z) / gap) * w;
      const n = Math.hypot(ux, uz) || 1;
      ux /= n; uz /= n;
    }
    const step = Math.min(dist, d.speed * (wary ? 1.2 : 1) * dt); // a little scurry when wary
    const bx = p.x, bz = p.z;
    p.x += ux * step;
    p.z += uz * step;
    toddler.group.rotation.y = Math.atan2(ux, uz);
    resolveObstacles(obstacles, p, 0.4);
    // Pinned against furniture (she barely moves): give up on that spot and wander somewhere else,
    // so she never stands in one place piling up drops.
    const moved = Math.hypot(p.x - bx, p.z - bz);
    state.toddlerStuck = moved < step * 0.35 ? (state.toddlerStuck ?? 0) + dt : 0;
    if (state.toddlerStuck > 0.35) {
      state.toddlerStuck = 0;
      state.toddlerReroutes = (state.toddlerReroutes ?? 0) + 1;
      pickToddlerTarget(state, difficulty, obstacles, rng, p);
    }
  }
  resolveObstacles(obstacles, p, 0.4);

  state.toddlerPhase += dt * 17;
  const swing = Math.sin(state.toddlerPhase) * 0.6;
  toddler.limbs.legs[0].rotation.x = swing;
  toddler.limbs.legs[1].rotation.x = -swing;
  toddler.limbs.arms[0].rotation.z = 0.55;
  toddler.limbs.arms[1].rotation.z = -0.55;
  // Throw: arms swing up overhead in the last 0.4s before a drop, then snap forward.
  const windup = Math.max(0, 1 - state.dropTimer / 0.4);
  state.throwT = Math.max(0, (state.throwT ?? 0) - dt);
  const arms = state.throwT > 0 ? 0.9 * (state.throwT / 0.2) : -2.5 * windup * windup;
  toddler.limbs.arms[0].rotation.x = arms;
  toddler.limbs.arms[1].rotation.x = arms;
  p.y = Math.abs(Math.sin(state.toddlerPhase)) * 0.12 * (1 - windup) + hop;

  state.dropTimer -= dt;
  if (state.dropTimer <= 0) {
    state.dropTimer = d.dropEvery;
    state.throwT = 0.2;
    state.toddlerThrew = true;
    const kinds = Object.keys(KINDS);
    for (let i = 0; i < d.batch; i++) {
      const kind = kinds[Math.floor(rng() * kinds.length)];
      const power = 5 * (d.throw ?? 1); // later rounds fling things farther
      onDrop(kind, p.x, p.z, (rng() - 0.5) * power, (rng() - 0.5) * power);
    }
  }
}

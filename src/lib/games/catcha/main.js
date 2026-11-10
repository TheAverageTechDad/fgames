/**
 * Clean-Up Chase — chase your little sibling around the playroom, pick up what they drop and
 * put it back where it belongs. Faster returns score more; every round the toddler gets quicker,
 * drops more at once and ranges further across the room.
 *
 * This file is the orchestrator: game state, the difficulty ramp, the studio install, the sim
 * loop and the HUD. The room, the two kids and the litter are built in `room.js`, `characters.js`
 * and `items.js` so those areas can be worked on independently; `audio.js` and `juice.js` are
 * hooked in at every event (pickup, drop-off, round, game-over) and are no-ops until filled in.
 */
import * as THREE from "three";
import { installStudio } from "./studio.js";
import { makeRng } from "./materials.js";
import { MODES, getMode, roundSettings } from "./game-modes.js";
import { ROOM, buildRoom, growRoomForRound, insideObstacle, createRadio, resolveObstacles } from "./room.js";
import { COUNTER_H } from "./kitchen.js";
import { createCharacters, stepPlayer, stepToddler, pickToddlerTarget, stepMom } from "./characters.js";
import {
  KINDS,
  createItemLayer,
  spawnItem,
  resetItems,
  messCount,
  stepItems,
  stepPickup,
  stepCarry,
  stepDropoff,
  createPowerupToken,
  nearestFloorItem,
  tidyItem,
  setLitterSurfaces,
  itemsSnapshot,
  mirrorItems,
  floorSpots,
} from "./items.js";
import { POWERUPS, FLOOR_LIFE, createPowerups, stepPowerups, chargeMom, pickWeighted, toddlerSlow, carryBonus, reachScale } from "./powerups.js";
import { initAudio, audioState, playFootstep, playPickup, playDropoff, playRoundStart, playGameOver, stepMusic, musicState, playCelebration, setMusicMuted, isMusicMuted, setSfxMuted, isSfxMuted, playBump, playPowerup, playDash, playSkid, playJump, playSlowVoices, playLand, playBoing, playBabyLaugh, playGaga, playMomLine, playCheer, playCookingCheer, resetCookingVoices, playHuff, playPurchase, playGiggle, playUi } from "./audio.js";
import { initJuice, resetJuice, stepJuice, burstPickup, burstDropoff, burstBump, burstDash, burstSkid, burstCelebration, drawCelebration, juiceStats, shakeOffset } from "./juice.js";
import { drawGameUi, uiLayout, preloadGameUi, endCardPortrait, menuStickers } from "./game-ui.js";
import { createWallDecor, createWallClock } from "./wall-decor.js";
import { track } from "./analytics.js";
import { loadWallet, saveWallet, earnFromScore, buy, equip, owns } from "./wallet.js";
import { itemById } from "./shop-catalog.js";
import { loadFamily, saveFamily, validChildVariant } from "./family.js";
import { dressKid } from "./outfits.js";
import { haptic, isHapticsOff, setHapticsOff } from "./haptics.js";
import { BUILD } from "./build-info.js";
import { createCookGame } from "./cook-game.js";
import { createGraphics } from "./graphics.js";
import { createJoystickView } from "./joystick-view.js";
import { createDaylight } from "./daylight.js";
import { activeSeasons } from "./seasons.js";
import { createSeasonDecor } from "./season-decor.js";
import { cookRound, RECIPES, SUPPLIES } from "./cooking.js";
import { overlay, parentState, kidState, splitKeys, duoSettings, scoreGame } from "./duo.js";
import { newCode, validCode, openRoom, createBuffer, createSequenceGate, packPose, applyPose } from "./net.js";
import { familyDaySettings, createFamilyDay, finishActivity, kitchenSeed, beginKitchen, stepDay, skipDay, failDay, claimDayResult } from "./family-day.js";

// ── FACET WIRING ──
// (facet imports and initialization go here)
// ── END FACET WIRING ──

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
// The scene target handles MSAA; the native-resolution HUD needs no extra multisampled buffer.
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.info.autoReset = false;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // three r185 maps PCFSoft to this anyway
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
const graphics = createGraphics(renderer);
const joystickView = createJoystickView(graphics.overlay);
// Screen-space options (Settings): hide the joystick (it still works) and the bottom tips bar.
const UI_KEY = "cuc-ui-v1";
const uiPrefs = (() => { try { return { stick: true, tips: true, season: true, ...JSON.parse(localStorage.getItem(UI_KEY)) }; } catch { return { stick: true, tips: true, season: true }; } })();
const saveUiPrefs = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(uiPrefs)); } catch { /* private mode */ } };
let graphicsTick = 0;
const renderStats = { calls: 0, triangles: 0 };
let api = null;

// score history on this device (declared up here: the first resetGame reads it during boot)
const HISTORY_KEY = "cuc-score-history-v1";
const coarsePointer = matchMedia("(pointer: coarse)");
// Home-screen app on iPhone: innerHeight can come up a safe-area short of the screen, leaving a
// teal strip, so the stage takes the whole screen there.
const iosApp = navigator.standalone === true || (/iPhone|iPad|iPod/.test(navigator.userAgent)
  && matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches);
/**
 * Always landscape: on an upright phone the whole stage is drawn turned 90° (CSS transform) so
 * the game already looks sideways and the player simply turns the phone — and it stays playable
 * even with rotation lock on. Touch input is mapped back in mobile-controls.js (`.rotated`).
 */
function resize() {
  let vw = innerWidth, vh = innerHeight;
  if (iosApp) {
    const long = Math.max(screen.width, screen.height), short = Math.min(screen.width, screen.height);
    [vw, vh] = vw > vh ? [long, short] : [short, long];
  }
  const rotate = coarsePointer.matches && vh > vw;
  document.documentElement.classList.toggle("rotated", rotate);
  const width = Math.max(1, rotate ? vh : vw);
  const height = Math.max(1, rotate ? vw : vh);
  const style = renderer.domElement.style;
  style.width = rotate || iosApp ? `${width}px` : "";
  style.height = rotate || iosApp ? `${height}px` : "";
  style.transform = rotate ? `translateX(${vw}px) rotate(90deg)` : "";
  graphics.resize(width, height, devicePixelRatio);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (api) {
    if (state.followCam) cameras.default();
    drawHud(messCount());
    api.refresh();
  }
}
addEventListener("resize", resize);
resize();
// iOS can launch a home-screen app with a short viewport and settle later without a resize event
// (seen with portrait lock on): measure again as it settles and whenever the app comes back.
for (const ms of [150, 600, 1500]) setTimeout(resize, ms);
addEventListener("orientationchange", () => setTimeout(resize, 120));
addEventListener("pageshow", resize);
visualViewport?.addEventListener("resize", resize);

// ───────────────────────────── tuning ─────────────────────────────

const DROPOFF_RADIUS = 2.4;
const CARRY_LIMIT = 3;
const HOP_TIME = 0.32;

// ───────────────────────────── lighting ─────────────────────────────

scene.background = new THREE.Color(0xe8efe9);

const hemi = new THREE.HemisphereLight(0xfff5e6, 0xa0b1a0, 1.1);
hemi.userData.tag = "light";
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffefd9, 2.0);
sun.position.set(14, 22, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -22;
sun.shadow.camera.right = 22;
sun.shadow.camera.top = 22;
sun.shadow.camera.bottom = -22;
sun.shadow.camera.far = 70;
sun.shadow.bias = -0.0015;
sun.shadow.normalBias = 0.025;
sun.userData.tag = "light";
scene.add(sun);
graphics.setLight(sun);

// from the camera's side, so the inward faces of the walls are not slabs of grey
const fill = new THREE.DirectionalLight(0xeaf3ff, 0.4);
fill.position.set(-10, 13, 20);
fill.userData.tag = "light";
scene.add(fill);

// ───────────────────────────── room, characters, items ─────────────────────────────

const { room, obstacles, stations, applyLayout, radio } = await buildRoom({ scene, DROPOFF_RADIUS, KINDS });
const { bigSib, toddler, mom, dad, playerBlob, toddlerBlob, dadBlob, sibBlob } = await createCharacters(scene);
// Two players (NOTES "Two-player mode"): Mum and Dad tidy, both kids make the mess. Local keyboard for now (`?duo`).
let duoWanted = new URLSearchParams(location.search).has("duo");
const duo = { on: false, dad: null, sib: null, toddler: null, tally: null, quiet: false };
let hero = bigSib; // whoever this device steers: the big kid solo, Mum in a duo
/**
 * Online duo (step 2): `room` is the open link; the host runs the game and this device is Mum, a
 * guest steers Dad and mirrors the host. `?join=ABCD` opens straight into a room; `?net=tab` uses a
 * BroadcastChannel instead of the relay (two tabs, no server).
 */
const urlParams = new URLSearchParams(location.search);
const net = { room: null, code: null, host: false, guest: false, peer: false, status: "", clock: 0, heard: 0, sendT: 0,
  seq: 0, resets: 0, ev: [], snaps: createBuffer(), dadPoses: createBuffer(), seenRs: -1, round: 1, replayed: 0, last: null, tab: urlParams.get("net") === "tab" };
/** A duo's cooks for the kitchen, this device's parent first (the host is Mum, a guest is Dad). */
function duoCooks() {
  const mum = { char: mom, s: net.guest ? duo.dad : state, who: "mum" }, dadCook = { char: dad, s: net.guest ? state : duo.dad, who: "dad" };
  return net.guest ? [dadCook, mum] : [mum, dadCook];
}
/** A race's result ("mum" | "dad" | "tie"), or null when this isn't a race. */
function raceWinner() {
  if (!state.race || !duo.on || !duo.tally) return null;
  const { mum, dad: d } = duo.tally;
  return mum.points === d.points ? "tie" : mum.points > d.points ? "mum" : "dad";
}
/** Who the confetti lands on: in a duo, whichever parent made the last return. */
const celebrant = () => (duo.on && duo.last) || hero;
/** A host's sounds and bursts the guest replays (its HUD text and banners arrive with the snapshot). */
const netEvent = (...e) => { if (net.host && net.peer) net.ev.push(e); };
const r2 = (v) => Math.round(v * 100) / 100;
function celebrate(at, big = false) {
  burstCelebration(at, big);
  netEvent("party", r2(at.x), r2(at.z), big);
}
const litterLayer = createItemLayer(scene);
const powerupToken = createPowerupToken(scene);
initJuice(scene);
initAudio();
await preloadGameUi();
// after the fonts: the prints use the game's lettering
const wallDecor = createWallDecor(room);
// The second game: the kitchen and its rules (cook-game.js). Same kids, controls, rounds and HUD.
const cook = createCookGame({ scene, renderer, bigSib, toddler, mom, dad, toddlerBlob, hooks: {
  say: (text, time) => say(text, time),
  flash: (color, s) => api.hud.flash(color, s),
  streak: (combo) => {
    const cheer = COOK_CHEER_AT[combo] ?? (combo > 7 && combo % 3 === 1 ? COOK_CHEER_WORDS[Math.floor(combo / 3) % COOK_CHEER_WORDS.length] : null);
    if (cheer) { shout(`${cheer.toUpperCase()}!`, `${combo} in a row`, "#ffb627", true); cheerNow(cheer); }
    else if (combo >= 2) shout(`${combo} IN A ROW!`, null, "#ffb627", false);
  },
  // a duo: who served (the tally, the confetti), and each cooking event's sound for an online guest
  served: (who, points) => { if (duo.on) { duo.tally[who].returned += 1; duo.tally[who].points += points; duo.last = who === "dad" ? dad : mom; } },
  net: (e, who, station) => netEvent("cook", e, who, station),
} });

// The kitchen has the playroom's radio (on the one back-counter stretch no station ever takes) and
// its wall clock (on the wall above, between the cupboards): same home, same music, same time.
const kitchenRadio = await createRadio(cook.kitchen.group, { position: [6.3, COUNTER_H, -9.35], turn: -0.25 });
const kitchenClock = createWallClock(cook.kitchen.group, new THREE.Vector3(6.3, 3.3, -ROOM.hz + 0.14), 0.85);

// Seasonal decorations (seasons.js picks by date, ?season=… / ?date=… for testing, Settings switch).
const seasonDecor = createSeasonDecor({ room, kitchen: cook.kitchen.group, shelf: stations.find((s) => s.id === "shelf"),
  table: radio.group.parent, kitchenTable: cook.kitchen.group.children.find((c) => c.userData.tag === "kitchen-table"),
  panes: (() => { const list = []; scene.traverse((o) => { if (o.name === "window-pane") list.push(o); }); return list; })() });
function applySeasons() {
  if (net.guest) return;
  state.seasons = activeSeasons({ search: location.search, enabled: uiPrefs.season });
  seasonDecor.set(state.seasons);
  placeSeasonProps();
}
/** Christmas: the tree stands in the playroom's open corner (it changes with the layout) and is solid. */
function placeSeasonProps() {
  const i = obstacles.findIndex((o) => o.id === "xmas-tree");
  if (i >= 0) obstacles.splice(i, 1);
  const tree = seasonDecor.placeTree(stations);
  if (tree) obstacles.push(tree);
}
const inSeason = (id) => state.seasons?.includes(id);

// Time of day (daylight.js): every run starts at 8:00 and reaches a cosy 19:30 evening after
// DAY_LENGTH seconds of actual play (menus, pause and round cards don't count).
const DAY_LENGTH = 300; // ~5 minutes of play for a whole day: fast enough to watch the clock move
const daylight = createDaylight({ scene, hemi, sun, fill, onSunMoved: (light) => graphics.setLight(light) });
const dayT = () => Math.min(1, (state.dayClock ?? 0) / DAY_LENGTH);
function advanceDaylight(dt, towardEvening = false) {
  // Family Day's dinner eases into the evening glow on its own
  state.dayClock = towardEvening ? state.dayClock + (DAY_LENGTH - state.dayClock) * Math.min(1, dt * 0.5) : state.dayClock + dt;
  syncDay();
}
function syncDay() {
  daylight.set(dayT());
  wallDecor.setTime(daylight.minutes(dayT()));
  kitchenClock.setTime(daylight.minutes(dayT()));
}

// ───────────────────────────── game state ─────────────────────────────

const state = {
  game: "clean", // "clean" (tidy up) or "cook"
  experience: null, // "family" coordinates the two existing worlds; null keeps standalone play.
  familyDay: null,
  launcher: true, // the start screen opens on the game picker
  mode: "easy",
  startOpen: true,
  won: false,
  score: 0,
  round: 1,
  returned: 0,
  quota: 6,
  timeLeft: 0,
  roundLength: 0,
  carried: [],
  message: "Chase the little one!",
  messageTime: 2.5,
  over: false,
  helpOpen: false,
  sprinting: false,
  followCam: true,
  playerYaw: 0,
  walkPhase: 0,
  toddlerPhase: 0,
  dropTimer: 1.5,
  toddlerTarget: new THREE.Vector2(0, 0),
  combo: 0,
  comboTimer: 0,
  bestCombo: 0,
  // a call-count per audio hook, not audio.js's own: lets a mechanical check confirm every
  // event actually reaches audio.js, since "does it sound good" is a human judgement (play check).
  audioEvents: { pickup: 0, dropoff: 0, roundStart: 0, gameOver: 0, bump: 0, powerup: 0, voice: 0, babyLaugh: 0, gaga: 0, mom: 0, cheer: 0, tired: 0 },
  powerups: createPowerups(),
  toddlerStun: 0,
  bumpCooldown: 0,
  wasBumping: false,
  muteHeld: false,
  banner: null,
  scorePulse: 0,
  momPhase: 0,
  momTidied: 0,
  recorded: false,
  best: null,
  dashT: -1,
  jumpT: -1,
  jumps: 0,
  feetY: 0,
  vy: 0,
  airborne: false,
  hopT: 0,
  toddlerChased: false,
  toddlerAlertT: 0,
  skidT: 0,
  lean: 0,
  squash: 1,
  bumps: 0,
};

// Coins and the wardrobe live on this device (wallet.js); the kids wear what's equipped from the start.
state.wallet = loadWallet();
// Race: the same game, but each parent also keeps their own score (their returns/serves and treats; team
// bonuses don't count) and the end card crowns a winner. `?race` for a local duo; a room toggles it.
state.race = new URLSearchParams(location.search).has("race");
applySeasons();
state.family = loadFamily();
bigSib.setVariant(state.family.sister);
toddler.setVariant(state.family.baby);
/** Paint both kids' outfits; `preview` (an item) swaps one slot in for a try-on. */
function dressAll(preview = null) {
  for (const [kid, group] of [["sister", bigSib.group], ["baby", toddler.group]]) {
    const outfit = { ...state.wallet.equipped[kid] };
    if (preview?.kid === kid) outfit[preview.slot] = preview.id;
    dressKid(group, kid, outfit);
  }
}
dressAll();
state.cookThumbs = cook.kitchen.thumbs;
state.cookDim = cook.kitchen.dim;
state.gameArt = menuStickers;

let rng = makeRng(1337);
let shareFile = null; // the finished run's score card, pre-rendered so Share can open instantly
/**
 * Which build is running vs. the newest deploy: build.json is never in the offline cache, so this
 * asks the network. "latest", "update" (a newer build is downloading — reopen to use it), "offline".
 */
const version = { commit: BUILD.commit, date: BUILD.date, status: BUILD.commit === "dev" ? "dev" : "checking" };
if (version.status === "checking") fetch(`./build.json?t=${Date.now()}`, { cache: "no-store" })
  .then((r) => r.json()).then((latest) => { version.status = latest.commit === BUILD.commit ? "latest" : "update"; version.latest = latest.commit; })
  .catch(() => { version.status = "offline"; });
let lastFootSign = 1;
let roomSeed = 1337;

/** Easy stays gentle; the other modes ramp from their own shared settings. */
function difficulty() {
  const d = state.experience === "family" ? familyDaySettings(state.mode, state.game) : roundSettings(state.mode, state.round);
  const s = state.game === "cook" && state.experience !== "family" ? { ...d, ...cookRound(state.mode, state.round), messLimit: null, floorCap: null } : d;
  // seasonal recipes join the kitchen menu while their season is on
  const seasonal = state.game === "cook" && s.menu ? Object.keys(RECIPES).filter((id) => RECIPES[id].season && inSeason(RECIPES[id].season)) : [];
  const out = seasonal.length ? { ...s, menu: [...s.menu, ...seasonal] } : s;
  return duo.on ? duoSettings(out) : out;
}
/** Analytics/history key for a mode: the kitchen's are "c-easy" etc. so the stats keep the games apart. */
const isFamilyDay = () => state.experience === "family";
const runGame = () => scoreGame(state.game, duo.on, isFamilyDay());
const modeKey = () => `${duo.on ? "d-" : ""}${isFamilyDay() ? "f-" : state.game === "cook" ? "c-" : ""}${state.mode}`; // two-player: d-, d-c-, d-f-
/** Which world is on screen. */
function showGame() {
  room.visible = litterLayer.visible = state.game !== "cook";
  cook.setActive(state.game === "cook");
}
/** The toddler's view of difficulty: Snail time slows walking and littering alike. */
function toddlerDifficulty() {
  const d = difficulty(), k = toddlerSlow(state.powerups);
  return k === 1 ? d : { ...d, speed: d.speed * k, dropEvery: d.dropEvery / k };
}
const carryLimit = () => CARRY_LIMIT + carryBonus(state.powerups);
/** A big basket's extra load is heavy: each item past the usual three slows her 8%. */
const loadFactor = (s = state) => 1 - 0.08 * Math.max(0, s.carried.length - CARRY_LIMIT);
/** The big kid as a troublemaker: quicker and further-ranging than the toddler, throws a little less often. */
function bigKidDifficulty() {
  const d = toddlerDifficulty();
  return { ...d, speed: d.speed * 1.15, dropEvery: d.dropEvery * 1.3, range: Math.min(1, d.range + 0.15) };
}
/** The parent nearest a point: who a kid runs from, who a bubble belongs to. */
function nearestParent(x, z) {
  const m = mom.group.position, d = dad.group.position;
  return Math.hypot(m.x - x, m.z - z) <= Math.hypot(d.x - x, d.z - z) ? { char: mom, s: state } : { char: dad, s: duo.dad };
}

/**
 * Medium/Hard sprint stamina: `sprintTime` seconds of flat-out running, refilling in ~4s once she
 * eases off. Run it dry and she's out of puff (no sprint) until it's back to 35%. Shown as the neon
 * ring around the joystick (around her feet on a keyboard). Easy has no limit.
 */
function stepStamina(dt, sprinting, sprintTime, s = state) {
  if (!sprintTime) { s.stamina = 1; s.tired = false; return; }
  if (sprinting) {
    s.stamina = Math.max(0, s.stamina - dt / sprintTime);
    s.staminaRest = 0.5;
    if (s.stamina === 0 && !s.tired) {
      s.tired = true;
      s.audioEvents.tired += 1;
      playHuff();
      say("Out of puff! Catch your breath", 1.4);
    }
  } else if ((s.staminaRest -= dt) <= 0) s.stamina = Math.min(1, s.stamina + dt * 0.25);
  if (s.tired && s.stamina >= 0.35) s.tired = false;
}
/** A free floor spot for a power-up token, clear of furniture and the walls. */
function powerupSpot(r) {
  for (let i = 0; i < 12; i++) {
    const x = (r() * 2 - 1) * (ROOM.hx - 3), z = (r() * 2 - 1) * (ROOM.hz - 3);
    if (!insideObstacle(obstacles, x, z, 1.2)) return { x, z };
  }
  return { x: 0, z: 0 };
}
function onPowerupEvent({ type, kind }) {
  const info = POWERUPS[kind];
  state.audioEvents.powerup += 1;
  playPowerup(type);
  if (type === "spawn") say(`A ${info.label} bubble! Grab it quick`, 2.2);
  else if (type === "pickup") {
    state.messageTime = 0; // the callout carries the hint
    haptic(kind === "mom" ? "celebrate" : "power");
    track("powerup", { mode: state.mode, v: kind });
    if (kind === "slow") { state.audioEvents.voice += 1; playSlowVoices(); }
    shout(`${info.label.toUpperCase()}!`, info.hint, `#${info.color.toString(16).padStart(6, "0")}`);
    if (kind === "mom") {
      const p = hero.group.position;
      mom.group.position.set(THREE.MathUtils.clamp(p.x + 1.8, -ROOM.hx + 1, ROOM.hx - 1), 0, p.z);
      mom.group.visible = true;
      burstBump(mom.group.position, 0xff7aa8, true);
      state.audioEvents.mom += 1;
      playMomLine();
    }
    api.hud.flash(`#${info.color.toString(16).padStart(6, "0")}`, 0.25);
    burstPickup(hero.group.position, info.color, rng);
  } else if (type === "missed") say("The bubble floated away…", 1.6);
  else {
    say(`${info.label} is over`, 1.4);
    if (kind === "mom") { burstBump(mom.group.position, 0xff7aa8); mom.group.visible = false; }
  }
}
let studioReady = false;

/** The big screen callout: power-up names and combos. */
function shout(text, sub, color, big = true) {
  state.banner = { text, sub, color, big, t: 0, life: big ? 1.9 : 1.1 };
}

function say(text, time = 2.2) {
  state.message = text;
  state.messageTime = time;
}

/** A litter item hit the floor from the toddler's hands — spawn it via items.js's pool. */
const CHEER_WORDS = ["excellent", "wonderful", "brilliant"];
const CHEER_AT = { 3: "excellent", 5: "wonderful", 7: "brilliant" };
const COOK_CHEER_WORDS = ["yummy", "sumptuous", "spectacular", "juicy"];
const COOK_CHEER_AT = { 3: "yummy", 5: "sumptuous", 7: "spectacular" };
/** Dad's call, at most one per 1.5s of play (a combo that also clears the round cheers once). */
function cheerNow(word) {
  if ((state.uiTime ?? 0) - (state.cheerAt ?? -9) < 1.5) return;
  state.cheerAt = state.uiTime ?? 0;
  state.audioEvents.cheer += 1;
  netEvent("cheer", word);
  if (state.game === "cook") playCookingCheer(word);
  else playCheer(word);
}
/** Where the toddler is, as a stereo position for her voice. */
const toddlerPan = () => THREE.MathUtils.clamp(toddler.group.position.x / ROOM.hx, -1, 1) * 0.6;

function onToddlerDrop(kind, x, z, vx, vz) {
  const cap = difficulty().floorCap;
  if (cap !== null && messCount() >= cap) return;
  // in season, now and then she drops a treat instead (a sweet, a present, a chocolate heart, an Easter egg): a bonus, not mess
  if (seasonDecor.treats.kind && rng() < 0.15) { seasonDecor.treats.spawn(x, z, vx, vz, rng); return; }
  spawnItem(kind, x, z, vx, vz, rng);
}

/** Pickup/drop-off from items.js land here: message, HUD flash, audio and juice all react. */
function onItemEvent(type, data) {
  if (type === "pickup") {
    if (state.mode === "easy") say(`Grabbed a ${KINDS[data.kind].label} — to the ${KINDS[data.kind].where}!`, 1.6);
    state.audioEvents.pickup += 1;
    playPickup(data.kind);
    haptic("tick");
    burstPickup(data.position, KINDS[data.kind].color, rng);
    netEvent("pick", data.kind, r2(data.position.x), r2(data.position.z), data.who ?? "mum");
  } else if (type === "dropoff") {
    if (duo.on) { const t = duo.tally[data.who ?? "mum"]; t.returned += 1; t.points += data.points; duo.last = data.who === "dad" ? dad : mom; }
    say(`+${data.points}${data.combo > 1 ? `   x${data.combo} combo!` : ""}`, 1.4);
    state.scorePulse = 1;
    state.hopT = HOP_TIME;
    // Dad's announcer call on big streaks (x3, x5, x7, then every third), with the word as the banner
    const cheer = CHEER_AT[data.combo] ?? (data.combo > 7 && data.combo % 3 === 1 ? CHEER_WORDS[Math.floor(data.combo / 3) % 3] : null);
    if (cheer) {
      shout(`${cheer.toUpperCase()}!`, `Combo x${data.combo}`, "#ffb627", true);
      cheerNow(cheer);
    } else if (data.combo >= 2) shout(`COMBO x${data.combo}!`, null, "#ffb627", false);
    if (chargeMom(state.powerups, data.combo, difficulty().momRate)) {
      shout("MOM'S COMING!", "Watch for the heart bubble", "#ff7aa8", false);
      playPowerup("spawn");
    }
    state.audioEvents.dropoff += 1;
  }
}

/** Dad's pickups and returns: the same payoff, but the delivery hop is his. */
function dadItemEvent(type, data) {
  const hop = state.hopT;
  onItemEvent(type, { ...data, who: "dad" });
  if (type === "dropoff") { duo.dad.hopT = state.hopT; state.hopT = hop; }
}

/** Walking into a kid (`ks` is the kid's state) gives a giggle break: no mess from that kid for a moment. */
function boop(who, ws, kid, ks, reach = 1.1) {
  const tp = kid.group.position, pp = who.group.position;
  const gap = Math.hypot(tp.x - pp.x, tp.z - pp.z);
  if (gap >= reach || pp.y >= 0.7 || ks.toddlerStun > 0 || ws.bumpCooldown > 0) return false;
  ks.toddlerStun = 1.6;
  ws.bumpCooldown = 2.5;
  state.bumps += 1;
  state.audioEvents.bump += 1;
  playBump("toddler");
  if (kid !== toddler) playGiggle();
  else if (playGaga(toddlerPan())) state.audioEvents.gaga += 1;
  haptic("boop");
  burstBump(tp, 0xffd6e8, true);
  netEvent("boop", r2(tp.x), r2(tp.z));
  say("Boop! A giggle break — no mess for a moment", 1.8);
  tp.x += (tp.x - pp.x) / (gap || 1) * 0.6;
  tp.z += (tp.z - pp.z) / (gap || 1) * 0.6;
  return true;
}

/**
 * A duo's frame past Mum's own moves: Dad steps (local keyboard for now), each parent can boop
 * either kid, the big kid makes her own mess, and calming both kids at once is the team combo.
 */
function stepDuo(step, settings, split) {
  const d = duo.dad;
  let ground = 0;
  if (net.room) {
    // online: Dad is steered on the guest's device; here he follows its poses, a moment behind
    const p = net.dadPoses.sample(net.clock - 0.1);
    if (p) applyPose(dad, p.a.p, p.b.p, p.k);
    d.sprinting = !!p?.b.s;
  } else {
    const jump = split.dadJump && !d.spaceHeld;
    d.spaceHeld = split.dadJump;
    const r = stepPlayer(step, split.dad, { bigSib: dad, state: d, speed: settings.playerSpeed * loadFactor(d), obstacles: state.game === "cook" ? cook.obstacles : obstacles, jump, canSprint: !d.tired });
    stepStamina(step, r.sprinting, settings.sprintTime, d);
    d.sprinting = r.sprinting;
    if (r.jumped) { playJump(); burstSkid(dad.group.position, -Math.sin(d.playerYaw), -Math.cos(d.playerYaw)); }
    if (r.bounced) playBoing();
    if (r.dashBurst) { burstDash(dad.group.position, Math.sin(d.playerYaw), Math.cos(d.playerYaw)); playDash(); }
    ground = r.ground;
  }
  d.bumpCooldown -= step;
  dadBlob.position.set(dad.group.position.x, ground + 0.14, dad.group.position.z);
  dadBlob.scale.setScalar(1 - Math.min(0.45, (dad.group.position.y - ground) * 0.3));
  if (state.game === "cook") return; // in the kitchen the kids are at the table: cook.step does the rest

  for (const [who, ws, key] of [[mom, state, "mum"], [dad, d, "dad"]]) {
    for (const [kid, ks, reach] of [[toddler, state, 1.1], [bigSib, duo.sib, 1.3]]) if (boop(who, ws, kid, ks, reach)) duo.tally[key].boops += 1;
  }
  // Peace and quiet: both kids sat down at once (one parent each). Bonus, and they stay put a while longer.
  const quiet = state.toddlerStun > 0 && duo.sib.toddlerStun > 0;
  if (quiet && !duo.quiet) {
    duo.tally.quiet += 1;
    state.toddlerStun = duo.sib.toddlerStun = 3;
    state.score += 150;
    state.scorePulse = 1;
    shout("PEACE AND QUIET!", "Both kids calmed · +150", "#58c4ff", true);
    cheerNow("brilliant");
    haptic("celebrate");
  }
  duo.quiet = quiet;

  const sp = bigSib.group.position, chaser = nearestParent(sp.x, sp.z);
  duo.sib.sprinting = chaser.s.sprinting;
  stepToddler(step, { toddler: bigSib, state: duo.sib, difficulty: bigKidDifficulty, obstacles, rng, KINDS, onDrop: onToddlerDrop, player: chaser.char.group.position });
  if (duo.sib.toddlerThrew) { duo.sib.toddlerThrew = false; playGiggle(); netEvent("giggle"); }
  sibBlob.position.set(sp.x, 0.14, sp.z);
}

/** The storage pieces: rings brighten for what's being carried, and a piece gulps each return. */
function stepStations(step, settings) {
  for (const s of stations) {
    s.pulse = Math.max(0, s.pulse - step * 2.2);
    const carryingMatch = state.carried.some((item) => item.kind === s.kind) || !!duo.on && duo.dad.carried.some((item) => item.kind === s.kind);
    s.decor.step(step, carryingMatch);
    s.ring.material.opacity = Math.min(1, (carryingMatch ? 0.8 : 0.45) + s.pulse * 0.5);
    s.ring.scale.setScalar(settings.dropoffRadius / DROPOFF_RADIUS * (1 + s.pulse * 0.12));
    // the storage piece gulps the item: squash down, spring up, settle
    const y = 1 - 0.14 * s.pulse * Math.cos((1 - s.pulse) * Math.PI * 2.5);
    s.model.scale.set(1 / Math.sqrt(y), y, 1 / Math.sqrt(y));
  }
}
/** The play camera eases after the player (a duo: between Mum and Dad, pulling back as they split up). */
function followCamera(step, cooking) {
  if (state.followCam) {
    const shared = duo.on && !net.room; // one screen for both; online, each device follows its own parent
    const p = shared ? camFocus.addVectors(mom.group.position, dad.group.position).multiplyScalar(0.5) : hero.group.position;
    if (cooking) camFocus.set(0, 1.2, -2);
    else camFocus.set(p.x * 0.6, 1.2, p.z * 0.6);
    camTarget.lerp(camFocus, Math.min(1, step * 3));
    // a duo pulls back as Mum and Dad split up, so both stay in shot
    const spread = shared ? Math.hypot(mom.group.position.x - dad.group.position.x, mom.group.position.z - dad.group.position.z) : 0;
    camWanted.copy(CAM_OFFSET).multiplyScalar(1 + THREE.MathUtils.clamp((spread - 6) * 0.03, 0, 0.35)).add(camTarget);
    camera.position.lerp(camWanted, Math.min(1, step * 3));
    camera.lookAt(camTarget);
    const shake = shakeOffset();
    camera.position.x += shake.x;
    camera.position.y += shake.y;
    camera.position.z += shake.z;
  }
}

/** A returned item finished its arc into the station: the payoff lands with it. */
function onItemLanded(kind, station, combo) {
  api.hud.flash(`#${KINDS[kind].color.toString(16).padStart(6, "0")}`, 0.2);
  netEvent("land", kind, stations.indexOf(station), combo);
  playDropoff(kind, combo);
  haptic(combo >= 2 ? "combo" : "land");
  burstDropoff(station, KINDS[kind].color, rng);
}

// ───────────────────────────── cameras ─────────────────────────────

const camTarget = new THREE.Vector3(0, 1.2, 2.4);
const CAM_OFFSET = new THREE.Vector3(0, 12.5, 13.5);
const camWanted = new THREE.Vector3();
const camFocus = new THREE.Vector3();

const cameras = {
  default() {
    // A tablet's narrower landscape viewport must still show the storage stations at the sides.
    // Phones are wider still: a touch closer so the room fills the screen.
    const fit = Math.max(state.game === "cook" ? 0.97 : 0.9, 1.75 / camera.aspect);
    CAM_OFFSET.set(0, 12.5 * fit, 13.5 * fit);
    state.followCam = true;
    if (state.game === "cook") camTarget.set(0, 1.2, -2);
    else camTarget.set(hero.group.position.x * 0.6, 1.2, hero.group.position.z * 0.6);
    camera.position.copy(camTarget).add(CAM_OFFSET);
    camera.lookAt(camTarget);
  },
  room() {
    state.followCam = false;
    camera.position.set(0, 25, 27);
    camera.lookAt(0, 0.5, 0);
  },
  toddler() {
    state.followCam = false;
    const p = toddler.group.position;
    camera.position.set(p.x + 5, 5, p.z + 8);
    camera.lookAt(p.x, 1, p.z);
  },
  /** Close on the family: Mum and Dad (a duo) with the kids behind them. */
  family() {
    state.followCam = false;
    const m = hero.group.position;
    camera.position.set(m.x + 1.6, 5.5, m.z + 9);
    camera.lookAt(m.x + 1.6, 1.4, m.z - 2);
  },
  stations() {
    state.followCam = false;
    camera.position.set(0, 11, 14);
    camera.lookAt(-3, 1, -6);
  },
};

function resetGame(seed = 1337, { showStart = false, continueDay = false } = {}) {
  const carry = continueDay && isFamilyDay() ? { score: state.score, bestCombo: state.bestCombo } : null;
  if (isFamilyDay() && !continueDay) {
    state.familyDay = createFamilyDay(state.mode, seed);
    state.game = "clean";
  } else if (!isFamilyDay()) state.familyDay = null;
  duo.on = duoWanted; // Tidy Up, Cooking and Family Day
  hero = duo.on ? (net.guest ? dad : mom) : bigSib;
  net.resets += 1;
  net.ev.length = 0;
  state.netWaiting = false;
  roomSeed = seed >>> 0;
  applyLayout(roomSeed);
  placeSeasonProps(); // (applyLayout rebuilt the obstacle list)
  rng = makeRng(roomSeed || 1337);
  lastFootSign = 1;
  resetItems();
  state.carried.length = 0;
  state.score = carry?.score ?? 0;
  state.round = 1;
  state.returned = 0;
  const settings = difficulty();
  state.quota = settings.quota;
  state.roundLength = settings.roundTime;
  state.timeLeft = settings.roundTime;
  state.over = false;
  state.won = false;
  state.roundBreak = null;
  state.historyOpen = false;
  loadHistory();
  state.startOpen = showStart;
  state.helpOpen = false;
  state.graphicsOpen = false;
  graphics.invalidate();
  state.sprinting = false;
  state.combo = 0;
  state.bestCombo = carry?.bestCombo ?? 0;
  state.comboTimer = 0;
  state.dropTimer = settings.firstDrop;
  state.playerYaw = 0;
  state.walkPhase = 0;
  state.toddlerPhase = 0;
  state.audioEvents = { pickup: 0, dropoff: 0, roundStart: 0, gameOver: 0, bump: 0, powerup: 0, voice: 0, babyLaugh: 0, gaga: 0, mom: 0, cheer: 0, tired: 0 };
  state.powerups = createPowerups(settings.powerupEvery * 0.6);
  state.toddlerStun = 0;
  state.bumpCooldown = 0;
  state.wasBumping = false;
  state.bumps = 0;
  toddler.group.rotation.z = 0;
  powerupToken.sync(null, 0);
  state.banner = null;
  state.scorePulse = 0;
  state.momTidied = 0;
  state.recorded = false;
  state.coinsEarned = 0;
  state.shopOpen = false;
  state.best = null;
  shareFile = null;
  state.duoTally = duo.tally = duo.on ? { mum: { returned: 0, boops: 0, points: 0 }, dad: { returned: 0, boops: 0, points: 0 }, quiet: 0 } : null;
  duo.quiet = false;
  duo.last = null;
  state.dashT = -1;
  state.jumpT = -1;
  state.toddlerStuck = 0;
  state.toddlerReroutes = 0;
  state.toddlerDodges = 0;
  state.dodgesHeard = 0;
  wallDecor.reset(); // the clock starts at ten past ten every run, so a seed always looks the same
  kitchenClock.reset();
  state.dayClock = 0; // and every run starts in the morning
  seasonDecor.treats.clear();
  state.treats = 0;
  syncDay();
  state.toddlerAvoidCd = 0;
  state.cheerAt = -9;
  state.landT = 0;
  state.jumps = 0;
  state.feetY = 0;
  state.vy = 0;
  state.airborne = false;
  state.carry = false;
  state.stamina = 1;
  state.tired = false;
  setLitterSurfaces(state.mode === "easy" ? null : obstacles); // Easy pushes litter out of furniture instead
  state.staminaRest = 0;
  state.jumpQueued = false;
  state.spaceHeld = true; // the Space that started the game is not a jump
  state.hopT = 0;
  state.toddlerChased = false;
  state.toddlerAlertT = 0;
  toddler.alert.visible = false;
  toddler.limbs.head.rotation.y = 0;
  for (const s of stations) s.model.scale.setScalar(1);
  state.skidT = 0;
  state.lean = 0;
  state.squash = 1;
  // grown-ups in a duo stand clearly taller than the kids; the kitchen's dinner table seats them at 0.85
  mom.scale0 = dad.scale0 = duo.on ? 1.12 : 0.85;
  mom.carryY = dad.carryY = duo.on ? 4.2 : undefined;
  for (const p of [bigSib, mom, dad]) {
    p.group.rotation.set(0, 0, 0);
    p.group.scale.setScalar(p.scale0 ?? 1);
  }
  for (const arm of bigSib.limbs.arms) arm.rotation.z = 0; // leftovers of a duo's troublemaking
  bigSib.alert.visible = false;
  hero.group.position.set(0, 0, 4);
  toddler.group.position.set(2, 0, -2);
  resetJuice();
  pickToddlerTarget(state, difficulty, obstacles, rng);
  if (duo.on) {
    mom.group.position.set(-1.6, 0, 4);
    dad.group.position.set(1.6, 0, 4);
    bigSib.group.position.set(-3, 0, -2);
    duo.dad = overlay(state, parentState());
    duo.sib = overlay(state, kidState(new THREE.Vector2(), settings.firstDrop + 1));
    duo.toddler = overlay(state, { sprinting: false });
    pickToddlerTarget(duo.sib, bigKidDifficulty, obstacles, rng);
  }
  showGame();
  mom.group.visible = duo.on; // (after showGame: leaving the kitchen sends the dinner guests away)
  if (duo.on || state.game === "clean") dad.group.visible = duo.on;
  dadBlob.visible = sibBlob.visible = duo.on;
  if (state.game === "cook") cook.reset(roomSeed, state, difficulty(), duo.on ? duoCooks() : null);
  say(state.game === "cook" ? "Check the order, then fetch what it needs!"
    : state.mode === "easy" ? "Take your time. Pick up a toy and take it home!" : "Chase the little one!", 4);
  cameras.default();
  if (api) { syncMusic(); drawHud(messCount()); }
}

cameras.default();

const BREAK_TIME = 2.8, BREAK_SKIP = 0.7;
const MEAL_CAMERA_OFFSET = new THREE.Vector3(0, 8.5, 10);
const daySeed = () => isFamilyDay() && state.familyDay ? state.familyDay.seed : roomSeed;
function syncMusic() {
  const dinner = isFamilyDay() && ["meal", "complete"].includes(state.familyDay?.phase);
  stepMusic(state.startOpen || state.over ? 0 : Math.min(1, state.combo / 3), {
    ending: !state.startOpen && (dinner || state.won),
    paused: state.helpOpen || state.netWaiting || document.hidden || (state.over && !state.won) || uiLayout(renderer.domElement, state, api.controls()).portrait,
  });
}
function finishFamilyDay() {
  state.over = state.won = true;
  state.roundBreak = null;
  state.messageTime = 0;
  say("A lovely Family Day!", 99);
  recordRun();
}
function advanceFamilyDay(action) {
  if (action === "kitchen" && beginKitchen(state.familyDay)) {
    state.game = "cook";
    resetGame(kitchenSeed(state.familyDay), { continueDay: true });
  } else if (action === "complete") finishFamilyDay();
}
function familyMealCamera(dt) {
  const table = cook.kitchen.diningTable();
  state.followCam = false;
  camFocus.set(table.x, 1.15, table.z);
  camTarget.lerp(camFocus, Math.min(1, dt * 3));
  camWanted.copy(camTarget).add(MEAL_CAMERA_OFFSET);
  camera.position.lerp(camWanted, Math.min(1, dt * 3));
  camera.lookAt(camTarget);
  const p = bigSib.group.position;
  playerBlob.position.set(p.x, 0.14, p.z); playerBlob.scale.setScalar(1);
}

/** Round cleared: bank the bonuses and show the round card; nextRound() runs when it closes. */
function startRoundBreak(settings) {
  const clear = 200 + 50 * state.round;
  const timeBonus = settings.timed ? Math.ceil(Math.max(0, state.timeLeft)) * 10 : 0;
  state.score += clear + timeBonus;
  state.scorePulse = 1;
  state.messageTime = 0;
  const nextSettings = state.game === "cook" ? cookRound(state.mode, state.round + 1) : roundSettings(state.mode, state.round + 1);
  state.roundBreak = { t: 0, round: state.round + 1, clear, timeBonus, twist: nextSettings.twist };
  state.audioEvents.roundStart += 1;
  playRoundStart(state.round + 1);
  celebrate(celebrant().group.position); playCelebration();
  haptic("celebrate");
  track("round_clear", { mode: modeKey(), round: state.round });
  const cheers = state.game === "cook" ? COOK_CHEER_WORDS : CHEER_WORDS;
  cheerNow(cheers[(state.round + 1) % cheers.length]);
}

function nextRound() {
  if (state.game === "cook") cook.nextRound();
  state.round += 1;
  const settings = difficulty();
  state.quota = settings.quota;
  state.returned = 0;
  state.roundLength = settings.roundTime;
  state.timeLeft = state.roundLength;
  state.dropTimer = 1.2;
  say(`Round ${state.round}: ${settings.twist ?? "Go!"}`, 2.4);
  // the round's reward: a power-up bubble close by (leftover mess carries over, so it helps)
  if (!state.powerups.field && state.game !== "cook") {
    const kind = pickWeighted(rng()), p = hero.group.position;
    let spot = powerupSpot(rng);
    for (let i = 0; i < 8; i++) {
      const a = rng() * Math.PI * 2, x = p.x + Math.cos(a) * 3.5, z = p.z + Math.sin(a) * 3.5;
      if (Math.abs(x) < ROOM.hx - 1.5 && Math.abs(z) < ROOM.hz - 1.5 && !insideObstacle(obstacles, x, z, 1.2)) { spot = { x, z }; break; }
    }
    state.powerups.field = { kind, ...spot, life: FLOOR_LIFE };
    onPowerupEvent({ type: "spawn", kind });
  }
  growRoomForRound(state.round, { scene, obstacles, stations });
}

// ───────────────────────────── online duo ─────────────────────────────

/** The host's game state a guest's HUD and cards need, sent with every snapshot. */
const HUD_KEYS = ["score", "returned", "quota", "round", "timeLeft", "roundLength", "combo", "bestCombo", "over", "won", "roundBreak",
  "startOpen", "helpOpen", "netWaiting", "race", "mode", "message", "messageTime", "banner", "scorePulse", "duoTally", "dayClock"];
/** What a guest's buttons may ask of the host's game (the rest stay on the guest's own device). */
const GUEST_ACTIONS = new Set(["play", "restart", "resume", "help", "mode-easy", "mode-medium", "mode-hard", "family-continue", "race-on", "race-off"]);
const SEND_EVERY = 1 / 15, SHOW_BEHIND = 0.12, PEER_TIMEOUT = 6;

/** Host: the invite, as a link to tap (share sheet on a phone, else copied). */
function shareRoom() {
  if (!net.room) return;
  const url = `${location.origin}${location.pathname}?join=${net.code}${net.tab ? "&net=tab" : ""}`;
  const text = `Come and play Catcha with me! Room ${net.code}`;
  if (navigator.share) navigator.share({ title: "Catcha", text, url }).catch(() => {});
  else navigator.clipboard?.writeText(url).then(() => say("Invite link copied", 2.5), () => say(`Room code: ${net.code}`, 4));
}
function askForCode() {
  const code = validCode(prompt("Room code (4 letters):"));
  if (code) connectRoom(code, false);
}
function syncRoomHud() {
  state.room = net.room ? { code: net.code, host: net.host, peer: net.peer, tab: net.tab, link: net.link } : null;
}
function connectRoom(code, host, stay = false) {
  leaveRoom(false);
  state.roomError = null;
  Object.assign(net, { code, host, guest: !host, peer: false, link: "", heard: 0, seenRs: -1, round: 1, dadReturned: 0, snapGate: createSequenceGate(), dadGate: createSequenceGate(), dadSeq: 0, pendingEv: [], hold: null });
  state.netWaiting = false;
  net.room = openRoom(code, { host, tab: net.tab, onMessage: onNetMessage, onStatus: onNetStatus });
  duoWanted = true;
  // a join starts on Tidy Up until Mum's game arrives; Mum's PLAY TOGETHER keeps the game she's on
  if (!stay) { state.experience = null; state.game = "clean"; }
  state.familyDay = null;
  state.launcher = false;
  syncRoomHud();
  resetGame(daySeed(), { showStart: true });
  track("room", { v: host ? "host" : "join" });
}
function leaveRoom(reset = true) {
  if (!net.room) return;
  net.room.close();
  Object.assign(net, { room: null, code: null, host: false, guest: false, peer: false });
  net.snaps.clear(); net.dadPoses.clear(); net.ev.length = 0;
  state.netWaiting = false;
  applySeasons();
  mirrorItems([], [], 0);
  duoWanted = urlParams.has("duo");
  state.race = urlParams.has("race");
  syncRoomHud();
  if (reset) { state.launcher = true; resetGame(daySeed(), { showStart: true }); }
}
function onNetMessage(m) {
  net.heard = 0;
  if (!net.peer) onNetStatus("peer"); // back from a sleep (its socket never closed, so no fresh hello)
  if (net.guest && m.t === "snap") {
    const previous = net.snapGate.session;
    if (net.snapGate.accept(m.session, m.seq)) {
      if (previous !== m.session) { net.snaps.clear(); net.seenRs = -1; }
      net.snaps.push(net.clock, m);
    }
  } else if (net.guest && m.t === "ev") { net.pendingEv.push(m); if (net.pendingEv.length > 256) net.pendingEv.shift(); }
  else if (net.host && m.t === "dad") {
    const previous = net.dadGate.session;
    if (net.dadGate.accept(m.session, m.n)) {
      if (previous !== m.session) net.dadPoses.clear();
      net.dadPoses.push(net.clock, m);
      // Resume only after Dad is sending movement again, not merely a socket hello.
      state.netWaiting = false;
    }
  }
  else if (net.host && m.t === "act" && GUEST_ACTIONS.has(m.a)) onControlAction(m.a);
}
function onNetStatus(status) {
  if (status === "peer") {
    net.peer = true; net.heard = 0;
    say(net.host ? "Dad's here! Pick a mode and play" : "You're Dad! Either of you can pick", 3);
    haptic("celebrate"); playUi("on");
  } else if (status === "left" || status === "lost") {
    if (net.peer) say(status === "lost" ? "Connection dropped, reconnecting…" : net.host ? "Dad left the game" : "Mum left the game", 3);
    net.peer = false;
    if (net.host && !state.startOpen && !state.over) state.netWaiting = true;
  } else if (status === "direct" || status === "relay") {
    net.link = status;
  } else if (status === "full") {
    leaveRoom();
    state.roomError = "That room already has two players.";
  }
  syncRoomHud();
  if (api) { drawHud(messCount()); api.refresh(); }
}
/** Host: the game as the guest should draw it, 15 times a second. */
function hostSend(step) {
  if (!net.peer) { net.ev.length = 0; return; }
  if ((net.heard += step) > 1.5 && !state.startOpen && !state.over) state.netWaiting = true;
  if (net.heard > PEER_TIMEOUT) { onNetStatus("left"); return; } // a phone gone to sleep keeps its socket
  if ((net.sendT -= step) > 0) return;
  net.sendT = SEND_EVERY;
  const hud = { inGame: !state.launcher, game: state.game, experience: state.experience, familyDay: state.familyDay,
    powerups: { field: state.powerups.field, active: state.powerups.active } };
  for (const k of HUD_KEYS) hud[k] = state[k];
  net.room.send({ t: "snap", seq: ++net.seq, rs: net.resets, seed: roomSeed, hud, mum: packPose(mom), toddler: packPose(toddler), kid: packPose(bigSib),
    seasons: state.seasons, treats: seasonDecor.treats.snapshot(),
    items: itemsSnapshot(duo.on ? duo.dad.carried : []), dadCarry: duo.on ? duo.dad.carried.map((i) => i.kind) : [],
    cook: duo.on && state.game === "cook" ? cook.netState() : null, dad: packPose(dad) });
  // sounds and bursts go on the reliable channel, tagged with the snapshot they belong to
  if (net.ev.length) net.room.send({ t: "ev", seq: net.seq, rs: net.resets, ev: net.ev.splice(0) });
}
/** Guest: a host's sound or burst, replayed as its snapshot comes on screen. */
function replay([type, ...a]) {
  if (type === "land") { stations[a[1]].pulse = 1; onItemLanded(a[0], stations[a[1]], a[2]); }
  else if (type === "pick") { playPickup(a[0]); burstPickup(new THREE.Vector3(a[1], 0, a[2]), KINDS[a[0]].color, rng); if (a[3] === "dad") haptic("tick"); }
  else if (type === "boop") { playBump("toddler"); burstBump(new THREE.Vector3(a[0], 0, a[1]), 0xffd6e8, true); }
  else if (type === "cheer") cheerNow(a[0]);
  else if (type === "party") { burstCelebration(new THREE.Vector3(a[0], 0, a[1]), a[2]); playCelebration(); }
  else if (type === "giggle") playGiggle();
  else if (type === "treat") { playPickup("toy"); burstPickup({ x: a[0], z: a[1] }, 0xffc531); if (a[2] === "dad") haptic("tick"); }
  else if (type === "cook") cook.replay(a[0], a[1], a[2], state, difficulty());
}
/**
 * Guest frame: Dad moves here (instant), everything else is the host's game drawn SHOW_BEHIND
 * seconds in the past, smoothed between snapshots.
 */
function guestFrame(step, keys, ctx, spaceTap) {
  net.heard += step;
  if ((net.sendT -= step) <= 0) { net.sendT = SEND_EVERY; net.room.send({ t: "dad", n: ++net.dadSeq, p: packPose(dad), s: state.sprinting }); }
  const latest = net.snaps.list.at(-1)?.data;
  if (!latest) { state.startOpen = true; drawHud(0); return; } // still joining
  if (latest.hud.inGame && (latest.hud.game !== state.game || latest.hud.experience !== state.experience)) { // Mum switched games
    state.game = latest.hud.game; state.experience = latest.hud.experience; net.seenRs = -1;
  }
  state.familyDay = latest.hud.familyDay && { ...latest.hud.familyDay, completed: [...latest.hud.familyDay.completed] };
  if (latest.rs !== net.seenRs) { // the host started over (or Family Day moved on to the kitchen): so do we
    net.seenRs = latest.rs; net.round = 1; net.dadReturned = 0;
    net.snaps.clear(); net.snaps.push(net.clock, latest);
    resetGame(latest.seed, { showStart: true, continueDay: isFamilyDay() });
  }
  const hud = latest.hud;
  if (JSON.stringify(state.seasons) !== JSON.stringify(latest.seasons ?? [])) {
    state.seasons = latest.seasons ?? []; seasonDecor.set(state.seasons); placeSeasonProps();
  }
  for (; net.round < hud.round; net.round++) growRoomForRound(net.round + 1, { scene, obstacles, stations });
  for (const k of HUD_KEYS) state[k] = hud[k];
  // our own TEAM/RACE or mode tap shows at once; snapshots sent before Mum's game heard it mustn't flick it back
  if (net.hold) { if (hud[net.hold.key] === net.hold.value || (net.hold.t -= step) <= 0) net.hold = null; else state[net.hold.key] = net.hold.value; }
  // The tally is shared by game logic and the end card, but never mutate a buffered snapshot.
  if (hud.duoTally) duo.tally = state.duoTally = structuredClone(hud.duoTally);
  state.netWaiting = !!hud.netWaiting || ((!net.peer || net.heard > 1.5) && !state.startOpen && !state.over);
  Object.assign(state.powerups, hud.powerups);
  if (!hud.inGame) { state.startOpen = true; state.message = "Mum is picking a game…"; }
  // the host's copy of the message would hide ours: while Mum's game is out of reach, say so
  if (!net.peer || net.heard > 1.5) { state.message = "Reconnecting to Mum's game…"; state.messageTime = 1; state.banner = null; }
  if (state.game === "clean") state.carried = latest.dadCarry.map((kind) => ({ kind }));
  const dadReturned = hud.duoTally?.dad.returned ?? 0;
  if (dadReturned > net.dadReturned) state.hopT = HOP_TIME; // our own delivery hop
  net.dadReturned = dadReturned;
  syncDay();

  const t = net.clock - SHOW_BEHIND;
  let shown = 0;
  for (const { time, data } of net.snaps.list) if (time <= t) shown = Math.max(shown, data.seq);
  net.pendingEv = net.pendingEv.filter((e) => {
    if (e.session !== latest.session || e.rs < latest.rs) return false;
    if (e.rs > latest.rs || e.seq > shown) return true;
    e.ev.forEach(replay); return false;
  });
  const s = net.snaps.sample(t);
  applyPose(mom, s.a.mum, s.b.mum, s.k);
  applyPose(toddler, s.a.toddler, s.b.toddler, s.k);
  applyPose(bigSib, s.a.kid, s.b.kid, s.k);
  seasonDecor.treats.mirror(s.a.treats ?? [], s.b.treats ?? [], s.k);
  const mess = net.mess = mirrorItems(s.a.items, s.b.items, s.k, dad, step);
  powerupToken.sync(state.powerups.field, step);
  if (state.shopOpen) stepShowcase(step);

  const settings = difficulty();
  let ground = 0;
  // Family Day's dinner: the host walks Dad to the table too, so his pose comes from there
  const dinner = isFamilyDay() && ["meal", "complete"].includes(state.familyDay?.phase);
  if (dinner) applyPose(dad, s.a.dad ?? packPose(dad), s.b.dad ?? packPose(dad), s.k);
  const moved = !dinner && !state.startOpen && !state.over && !state.helpOpen && !state.netWaiting && !state.roundBreak && !uiLayout(renderer.domElement, state, ctx.move).portrait;
  if (moved) {
    const r = stepPlayer(step, keys, { bigSib: dad, state, speed: settings.playerSpeed * loadFactor(), obstacles: state.game === "cook" ? cook.obstacles : obstacles,
      move: ctx.move, jump: state.jumpQueued || spaceTap, canSprint: !state.tired });
    stepStamina(step, r.sprinting, settings.sprintTime);
    state.jumpQueued = false;
    state.sprinting = r.sprinting;
    if (r.jumped) playJump();
    if (r.landed && r.landedOn) playLand(r.landedOn); else if (r.landed) playBump("furniture");
    if (r.bounced) playBoing();
    if (r.dashBurst) { burstDash(dad.group.position, Math.sin(state.playerYaw), Math.cos(state.playerYaw)); playDash(); }
    const footSign = Math.sign(Math.sin(state.walkPhase)) || 1;
    if (r.moving && footSign !== lastFootSign) playFootstep(r.sprinting);
    lastFootSign = footSign;
    ground = r.ground;
  } else state.sprinting = false;
  if (state.hopT > 0 && !moved && !dinner) { state.hopT = 0; dad.group.position.y = state.feetY ?? 0; } // a hop on a paused Dad stacked up: he floated over the round card
  if (state.hopT > 0) {
    state.hopT = Math.max(0, state.hopT - step);
    dad.group.position.y += Math.sin((1 - state.hopT / HOP_TIME) * Math.PI) * 0.55;
  }
  playerBlob.position.set(dad.group.position.x, ground + 0.14, dad.group.position.z);
  for (const [blob, who] of [[dadBlob, mom], [sibBlob, bigSib], [toddlerBlob, toddler]]) blob.position.set(who.group.position.x, 0.14, who.group.position.z);
  if (state.game === "cook") cook.mirror(latest.cook, step, state, settings);
  else stepStations(step, settings);
  stepJuice(step, camera);
  state.uiTime = (state.uiTime ?? 0) + step;
  if (dinner) familyMealCamera(step); else followCamera(step, state.game === "cook");
  if (state.over && !state.recorded) recordRun();
  if (net.heard > PEER_TIMEOUT && net.peer) onNetStatus("left");
  drawHud(mess);
}

// ───────────────────────────── studio install ─────────────────────────────

api = installStudio({
  canvas: renderer.domElement,
  scene,
  renderer,
  camera,
  input: { pointerLock: false, touch: {
    buttons: (controls) => uiLayout(renderer.domElement, state, controls).buttons,
    blocked: () => state.startOpen || state.helpOpen || state.over || (isFamilyDay() && ["transition", "meal"].includes(state.familyDay?.phase)) || uiLayout(renderer.domElement, state, api.controls()).portrait,
    onAction: onControlAction,
  } },
  player: () => ({
    x: hero.group.position.x,
    y: hero.group.position.y,
    z: hero.group.position.z,
    yaw: hero.group.rotation.y,
  }),
  reset(seed) {
    resetGame(typeof seed === "number" ? seed : 1337, { showStart: !studioReady });
  },
  update(dt, ctx = {}) {
    const keys = ctx.keys ?? new Set();
    const step = Math.min(dt, 1 / 20);
    const animate = !state.helpOpen && (!state.startOpen || state.shopOpen);
    if (animate) graphicsTick += 1;
    graphics.step(step, animate);
    const space = keys.has("Space"), spaceTap = space && !state.spaceHeld;
    state.spaceHeld = space;
    syncMusic();
    radio.step(step, !isMusicMuted());
    kitchenRadio.step(step, !isMusicMuted());
    wallDecor.step(step);
    kitchenClock.step(step);
    seasonDecor.step(step, dayT());
    const muteKey = keys.has("KeyM");
    if (muteKey && !state.muteHeld) setMusicMuted(!isMusicMuted());
    state.muteHeld = muteKey;
    net.clock += step;
    if (net.guest) return guestFrame(step, keys, ctx, spaceTap);
    if (net.host) hostSend(step);
    if (state.startOpen || state.helpOpen || state.netWaiting || uiLayout(renderer.domElement, state, ctx.move).portrait) {
      state.sprinting = false;
      if (state.shopOpen) stepShowcase(step);
      drawHud(messCount());
      return;
    }

    if (state.over) {
      state.sprinting = false;
      if (!state.recorded) recordRun();
      if (state.game === "cook") cook.stepDining(step);
      if (isFamilyDay() && state.won) familyMealCamera(step);
      // cosmetic only: the final returns finish their arc and the confetti settles under the card
      stepItems(step, ROOM, null, onItemLanded);
      stepJuice(step, camera);
      if (keys.has("Space") || keys.has("KeyR")) onControlAction("restart");
      drawHud(messCount());
      return;
    }

    if (isFamilyDay() && ["transition", "meal"].includes(state.familyDay.phase)) {
      const meal = state.familyDay.phase === "meal";
      state.sprinting = false;
      if (meal) { cook.stepDining(step); familyMealCamera(step); advanceDaylight(step, true); }
      let action = stepDay(state.familyDay, step, { mealReady: meal && cook.familyMealReady() });
      if (spaceTap) action = skipDay(state.familyDay) ?? action;
      if (state.roundBreak) state.roundBreak.t = state.familyDay.phaseTime;
      stepItems(step, ROOM, null, onItemLanded); stepJuice(step, camera);
      advanceFamilyDay(action);
      drawHud(messCount());
      return;
    }

    if (state.roundBreak) {
      // Round card: the clock and the toddler wait; returns in flight still land. Tap/Space skips.
      const rb = state.roundBreak;
      rb.t += step;
      if (spaceTap && rb.t > BREAK_SKIP) rb.t = BREAK_TIME;
      stepItems(step, ROOM, null, onItemLanded);
      stepJuice(step, camera);
      if (rb.t >= BREAK_TIME) { state.roundBreak = null; nextRound(); }
      drawHud(messCount());
      return;
    }

    const settings = difficulty();
    advanceDaylight(step);
    const split = duo.on && !net.room ? splitKeys(keys) : null;
    const { moving, sprinting, bumped, dashBurst, skid, jumped, landed, landedOn, bounced, ground } = stepPlayer(step, split ? split.mum : keys, {
      bigSib: hero,
      state,
      speed: settings.playerSpeed * loadFactor(),
      obstacles: state.game === "cook" ? cook.obstacles : obstacles,
      move: ctx.move,
      jump: state.jumpQueued || spaceTap,
      canSprint: !state.tired,
    });
    stepStamina(step, sprinting, settings.sprintTime);
    state.jumpQueued = false;
    state.sprinting = sprinting;
    if (jumped) {
      state.jumps += 1;
      playJump();
      burstSkid(hero.group.position, -Math.sin(state.playerYaw), -Math.cos(state.playerYaw));
    }
    if (landed && landedOn) { playLand(landedOn); haptic("tick"); } // on furniture: a small, quiet knock
    else if (landed) { playBump("furniture"); haptic("bump"); burstBump(hero.group.position, 0xe9dcc4); }
    if (bounced) { playBoing(); haptic("bump"); }
    if (dashBurst || skid) {
      const dx = Math.sin(state.playerYaw), dz = Math.cos(state.playerYaw);
      if (dashBurst) { burstDash(hero.group.position, dx, dz); playDash(); haptic("bump"); }
      else { burstSkid(hero.group.position, dx, dz); playSkid(); }
    }
    state.bumpCooldown -= step;
    if (bumped && !state.wasBumping && state.bumpCooldown <= 0) {
      state.bumpCooldown = 0.5;
      state.audioEvents.bump += 1;
      playBump("furniture");
      haptic("bump");
      burstBump(hero.group.position, 0xe9dcc4);
    }
    state.wasBumping = bumped;
    const cooking = state.game === "cook";
    const tp = toddler.group.position, pp = hero.group.position;
    if (duo.on) stepDuo(step, settings, split);
    else if (!cooking) boop(bigSib, state, toddler, state);
    if (cooking) cook.step(step, { state, settings, rng });
    else {
    const chaser = duo.on ? nearestParent(tp.x, tp.z) : null;
    if (chaser) duo.toddler.sprinting = chaser.s.sprinting;
    stepToddler(step, { toddler, state: duo.on ? duo.toddler : state, difficulty: toddlerDifficulty, obstacles, rng, KINDS, onDrop: onToddlerDrop, player: chaser ? chaser.char.group.position : pp });
    // her real giggle now and then (a throw, or slipping away from her sister); the synth one otherwise
    if (state.toddlerThrew) {
      state.toddlerThrew = false;
      netEvent("giggle");
      if (playBabyLaugh(toddlerPan(), 0.3)) state.audioEvents.babyLaugh += 1;
      else playGiggle();
    }
    if ((state.toddlerDodges ?? 0) > (state.dodgesHeard ?? 0)) {
      state.dodgesHeard = state.toddlerDodges;
      if (playBabyLaugh(toddlerPan(), 0.45)) state.audioEvents.babyLaugh += 1;
    }
    stepItems(step, ROOM, state.mode === "easy" ? obstacles : null, onItemLanded);
    const bubble = state.powerups.field;
    for (const e of stepPowerups(state.powerups, step, { player: duo.on && bubble ? nearestParent(bubble.x, bubble.z).char.group.position : pp, rng, pickSpot: powerupSpot, every: settings.powerupEvery })) onPowerupEvent(e);
    powerupToken.sync(state.powerups.field, step);
    if (!duo.on && mom.group.visible) {
      // Mom tidies the nearest floor item each time she reaches one; the toddler behaves meanwhile.
      state.momPhase += step;
      state.toddlerStun = Math.max(state.toddlerStun, 0.12);
      const item = nearestFloorItem(mom.group.position.x, mom.group.position.z);
      if (stepMom(step, mom, item?.mesh.position ?? null, state.momPhase, obstacles) && item) {
        const at = item.mesh.position.clone(), kind = tidyItem(item);
        state.returned += 1;
        state.score += 60;
        state.momTidied += 1;
        state.scorePulse = 1;
        playPickup(kind);
        burstPickup(at, KINDS[kind].color, rng);
      }
    }
    }
    if (state.banner) state.banner.t += step;
    state.scorePulse = Math.max(0, state.scorePulse - step * 4);
    state.uiTime = (state.uiTime ?? 0) + step;
    if (!cooking) {
      stepPickup(state, hero, settings.pickupRadius * reachScale(state.powerups), carryLimit(), onItemEvent);
      const pickups = [[hero, "mum", seasonDecor.treats.step(step, hero.group.position, (s) => resolveObstacles(obstacles, s, 0.3))]];
      if (duo.on) pickups.push([dad, "dad", seasonDecor.treats.step(0, dad.group.position)]);
      for (const [who, role, sweets] of pickups) if (sweets) {
        state.score += 50 * sweets;
        if (duo.on) duo.tally[role].points += 50 * sweets;
        state.scorePulse = 1;
        state.treats = (state.treats ?? 0) + sweets;
        playPickup("toy");
        if (!net.host || role === "mum") haptic("tick");
        burstPickup(who.group.position, 0xffc531, rng);
        netEvent("treat", r2(who.group.position.x), r2(who.group.position.z), role);
        say(seasonDecor.treats.message, 1.4);
      }
      stepCarry(step, state, hero);
      stepDropoff(state, hero, stations, settings.dropoffRadius, onItemEvent);
      if (duo.on) {
        stepPickup(duo.dad, dad, settings.pickupRadius * reachScale(state.powerups), carryLimit(), dadItemEvent);
        stepCarry(step, duo.dad, dad);
        stepDropoff(duo.dad, dad, stations, settings.dropoffRadius, dadItemEvent);
      }
    }
    stepJuice(step, camera);
    if (state.hopT > 0) {
      // delivery hop: a happy little jump on every return
      state.hopT = Math.max(0, state.hopT - step);
      hero.group.position.y += Math.sin((1 - state.hopT / HOP_TIME) * Math.PI) * 0.55;
    }
    if (duo.on && duo.dad.hopT > 0) {
      duo.dad.hopT = Math.max(0, duo.dad.hopT - step);
      dad.group.position.y += Math.sin((1 - duo.dad.hopT / HOP_TIME) * Math.PI) * 0.55;
    }

    const footSign = Math.sign(Math.sin(state.walkPhase)) || 1;
    if (moving && footSign !== lastFootSign) playFootstep(sprinting);
    lastFootSign = footSign;

    // the shadow sits on whatever is under her (floor or tabletop) and shrinks as she rises
    playerBlob.position.set(hero.group.position.x, ground + 0.14, hero.group.position.z);
    playerBlob.scale.setScalar(1 - Math.min(0.45, (hero.group.position.y - ground) * 0.3));
    toddlerBlob.position.set(toddler.group.position.x, 0.14, toddler.group.position.z);

    if (!cooking) stepStations(step, settings);

    state.comboTimer -= step;
    if (state.comboTimer <= 0) state.combo = 0;
    state.messageTime -= step;
    if (settings.timed) state.timeLeft -= step;

    const mess = cooking ? 0 : messCount();
    if (state.returned >= state.quota) {
      if (isFamilyDay()) {
        const timeBonus = settings.timed ? Math.ceil(Math.max(0, state.timeLeft)) * 10 : 0;
        const bonus = finishActivity(state.familyDay, state.game, state.timeLeft);
        if (bonus !== null) {
          state.score += bonus; state.scorePulse = 1; state.messageTime = 0; state.banner = null;
          state.audioEvents.roundStart += 1; playCelebration(); celebrate(celebrant().group.position); haptic("celebrate");
          track("round_clear", { mode: modeKey(), round: state.game === "clean" ? 1 : 2 });
          if (state.familyDay.phase === "transition") state.roundBreak = { family: true, t: 0, round: 2, clear: 250, timeBonus, twist: "Let's cook!" };
          else { state.roundBreak = null; cook.beginFamilyMeal(); }
          api.clearInput(); drawHud(mess); return;
        }
      }
      if (settings.rounds && state.round >= settings.rounds) {
        state.over = true;
        state.won = true;
        say(cooking ? "Every order served!" : "Everything is back home!", 99);
        state.audioEvents.roundStart += 1;
        playRoundStart(state.round);
        if (cooking) cheerNow("sumptuous");
      } else startRoundBreak(settings);
    }
    if (settings.timed && state.timeLeft <= 0) {
      state.over = true;
      say(cooking ? "Kitchen's closed! Time's up!" : "Time's up!", 99);
      state.audioEvents.gameOver += 1;
      playGameOver();
    } else if (!cooking && settings.messLimit !== null && mess > settings.messLimit) {
      state.over = true;
      say("The room is buried in mess!", 99);
      state.audioEvents.gameOver += 1;
      playGameOver();
    }
    if (state.over && isFamilyDay() && failDay(state.familyDay)) recordRun();

    followCamera(step, cooking);

    drawHud(mess);
  },
  render(frame) {
    graphics.sample(!state.startOpen && !state.helpOpen && !state.over);
    renderer.info.reset();
    const p = camera.position, q = camera.quaternion;
    // frame.hudDirty is the studio loop's question "did the HUD change?"; captures pass nothing and always draw
    if (graphics.draw(scene, camera, `${graphicsTick}:${p.x},${p.y},${p.z}:${q.x},${q.y},${q.z},${q.w}`, frame ? frame.hudDirty : true) === false) return false;
    renderStats.calls = graphics.snapshot().worldCalls;
    renderStats.triangles = graphics.snapshot().worldTriangles;
  },
  probes() {
    const d = difficulty();
    return {
      phase: "playable",
      dayTime: daylight.clock(dayT()),
      seasons: state.seasons ?? [],
      treatsOnFloor: seasonDecor.treats.count,
      dayProgress: Number(dayT().toFixed(3)),
      sunWindows: daylight.windows,
      game: state.game,
      experience: runGame(),
      familyDay: state.familyDay && { ...state.familyDay, completed: [...state.familyDay.completed] },
      launcher: state.launcher,
      family: { ...state.family },
      characterAssets: { older: bigSib.group.userData.asset, younger: toddler.group.userData.asset },
      portraitAsset: isFamilyDay() ? "live-family-meal" : endCardPortrait(state.game, state.family).src.split("/").pop(),
      cook: state.game === "cook" ? cook.probes() : null,
      score: state.score,
      round: state.round,
      returned: state.returned,
      quota: state.quota,
      mode: state.mode,
      modeName: getMode(state.mode).name,
      startOpen: state.startOpen,
      won: state.won,
      timerEnabled: d.timed,
      messLimit: d.messLimit,
      floorCap: d.floorCap,
      pickupRadius: d.pickupRadius,
      dropoffRadius: d.dropoffRadius,
      timeLeft: d.timed ? Number(state.timeLeft.toFixed(2)) : null,
      litterOnFloor: net.guest ? net.mess ?? 0 : messCount(),
      litterSpots: floorSpots(),
      carrying: state.carried.length,
      deliveryTargets: deliveryTargets(),
      roomSeed,
      roomLayout: room.userData.layout,
      stationPositions: stations.map(({ id, kind, x, z }) => ({ id, kind, x, z })),
      furniturePositions: obstacles.filter((o) => ["sofa", "bed", "table", "ottoman"].includes(o.id)).map((o) => ({ ...o })),
      modelStyle: "African chibi siblings",
      bedCount: room.children.filter((o) => o.userData.tag === "bed").length,
      helpOpen: state.helpOpen,
      sprinting: state.sprinting,
      portraitPaused: uiLayout(renderer.domElement, state, api.controls()).portrait,
      combo: state.combo,
      bestCombo: state.bestCombo,
      dropEvery: Number(d.dropEvery.toFixed(2)),
      dropBatch: d.batch,
      toddlerSpeed: Number(d.speed.toFixed(2)),
      toddlerRange: Number(d.range.toFixed(2)),
      stations: stations.length,
      gameOver: state.over,
      audioEvents: { ...state.audioEvents },
      powerupOnFloor: state.powerups.field ? { ...state.powerups.field, life: Number(state.powerups.field.life.toFixed(2)) } : null,
      powerupsActive: Object.fromEntries(Object.entries(state.powerups.active).map(([k, v]) => [k, Number(v.toFixed(2))])),
      powerupsPicked: state.powerups.picked,
      powerupsMissed: state.powerups.missed,
      carryLimit: carryLimit(),
      toddlerStunned: state.toddlerStun > 0,
      bumps: state.bumps,
      audioState: audioState(),
      music: musicState(),
      effects: juiceStats(),
      musicMuted: isMusicMuted(),
      sfxMuted: isSfxMuted(),
      momVisible: !duo.on && mom.group.visible,
      race: duo.on && state.race ? { mum: duo.tally?.mum.points ?? 0, dad: duo.tally?.dad.points ?? 0, winner: raceWinner() } : null,
      net: net.room ? { code: net.code, role: net.host ? "host" : "guest", peer: net.peer, waiting: !!state.netWaiting, link: net.link || "relay", snapshots: net.snaps.list.length, dadPoses: net.dadPoses.list.length } : null,
      duo: duo.on ? {
        tally: JSON.parse(JSON.stringify(duo.tally)),
        mum: mom.group.position.toArray().map((v) => Number(v.toFixed(2))),
        dad: dad.group.position.toArray().map((v) => Number(v.toFixed(2))),
        bigKid: bigSib.group.position.toArray().map((v) => Number(v.toFixed(2))),
        carrying: { mum: state.carried.length, dad: duo.dad.carried.length },
        stunned: { toddler: state.toddlerStun > 0, bigKid: duo.sib.toddlerStun > 0 },
      } : null,
      bestScore: state.best?.score ?? null,
      newBest: state.best?.isNew ?? false,
      historyCount: scoreHistory().length,
      build: version.commit,
      buildStatus: version.status,
      momTidied: state.momTidied,
      momCharge: Number(state.powerups.momCharge.toFixed(2)),
      momReady: state.powerups.momReady,
      dashT: Number(state.dashT.toFixed(2)),
      jumpT: Number(state.jumpT.toFixed(2)),
      jumps: state.jumps,
      toddlerReroutes: state.toddlerReroutes ?? 0,
      toddlerDodges: state.toddlerDodges ?? 0,
      stamina: Number((state.stamina ?? 1).toFixed(2)),
      tired: !!state.tired,
      loadFactor: Number(loadFactor().toFixed(2)),
      roundBreak: state.roundBreak ? { round: state.roundBreak.round, twist: state.roundBreak.twist, clear: state.roundBreak.clear, timeBonus: state.roundBreak.timeBonus } : null,
      twist: difficulty().twist,
      bestRound: state.bests?.[state.mode]?.round ?? 0,
      historyOpen: !!state.historyOpen,
      coins: state.wallet.coins,
      owned: state.wallet.owned.length,
      shopOpen: !!state.shopOpen,
      shopPick: state.shopPick ?? null,
      fps: graphics.snapshot().fps,
      pixelRatio: renderer.getPixelRatio(),
      graphics: { ...graphics.snapshot(), open: !!state.graphicsOpen },
      playerHeight: Number(hero.group.position.y.toFixed(2)),
      lean: Number(state.lean.toFixed(3)),
      banner: state.banner && state.banner.t < state.banner.life ? state.banner.text : null,
      drawCalls: renderStats.calls,
      triangles: renderStats.triangles,
    };
  },
  cameras,
  demos: {
    "graphics-settings": () => {
      state.helpOpen = state.graphicsOpen = true;
      drawHud(messCount());
      return graphics.snapshot();
    },
    /** Preview independent family choices without modifying this device's saved preference. */
    "family-boys": () => {
      resetGame(roomSeed, { showStart: true });
      state.family = { sister: "boy", baby: "boy" };
      bigSib.setVariant("boy"); toddler.setVariant("boy"); dressAll();
      onControlAction("shop");
      runFor(0.5);
      return { family: { ...state.family }, assets: [bigSib.group.userData.asset, toddler.group.userData.asset] };
    },
    /**
     * Two players: both kids litter, Mum and Dad each fetch a floor item and take it home, then calm
     * one kid each for Peace and quiet.
     */
    duo: () => {
      const wanted = duoWanted;
      duoWanted = true;
      state.experience = state.familyDay = null; state.game = "clean"; state.mode = "medium";
      api.seed(7);
      runFor(8);
      const litter = messCount(), trips = [];
      for (const [who, carried] of [[mom, () => state.carried], [dad, () => duo.dad.carried]]) {
        const near = () => nearestFloorItem(who.group.position.x, who.group.position.z);
        if (!near()) runFor(4); // the other parent cleared it all: wait for fresh mess
        const item = near();
        if (!item) continue;
        who.group.position.set(item.mesh.position.x, 0, item.mesh.position.z);
        runFor(0.2);
        const home = carried()[0] && stations.find((st) => st.kind === carried()[0].kind);
        const k = home && 1.2 / Math.hypot(home.x, home.z); // just in front of the storage piece
        if (home) { who.group.position.set(home.x * (1 - k), 0, home.z * (1 - k)); runFor(0.3); }
        trips.push({ home: home?.id ?? null, gap: home ? Number(Math.hypot(home.x - who.group.position.x, home.z - who.group.position.z).toFixed(2)) : null, left: carried().map((i) => i.kind) });
      }
      state.toddlerStun = duo.sib.toddlerStun = 0;
      for (const p of [mom, dad]) p.group.position.set(-9, 0, 9);
      runFor(2.6); // boop cooldowns run out
      mom.group.position.copy(toddler.group.position).add(new THREE.Vector3(0.5, 0, 0));
      dad.group.position.copy(bigSib.group.position).add(new THREE.Vector3(0.5, 0, 0));
      runFor(0.1);
      const result = { litter, trips, tally: JSON.parse(JSON.stringify(duo.tally)), score: state.score, quota: state.quota, both: [mom.group.visible, dad.group.visible] };
      duoWanted = wanted;
      return result;
    },
    /**
     * Two cooks, one order (Easy): Mum and Dad fetch an ingredient each, Mum mixes or chops and
     * puts it on, Dad takes the dish off and serves it at the table where the kids sit. Proves separate hands and the shared kitchen.
     */
    "duo-cook": () => {
      const wanted = duoWanted;
      duoWanted = true;
      state.experience = state.familyDay = null; state.game = "cook"; state.mode = "easy";
      api.seed(7);
      runFor(1.2);
      const park = { mum: [-1.5, 5], dad: [1.5, 5] };
      const goto = (who, id, wait = 0.35) => {
        const st = cook.kitchen.byId[id], other = who === mom ? dad : mom;
        other.group.position.set(...(other === mom ? [park.mum[0], 0, park.mum[1]] : [park.dad[0], 0, park.dad[1]]));
        who.group.position.set(st.zx, 0, st.zz);
        runFor(wait);
      };
      const order = cook.probes().orders[0]?.recipe, r = RECIPES[order];
      const steps = [];
      r.needs.forEach((ing, i) => {
        const who = i % 2 ? dad : mom;
        goto(who, Object.keys(SUPPLIES).find((s) => SUPPLIES[s].includes(ing)));
        steps.push(cook.probes().hands.map((h) => h.carried?.id ?? h.carried?.recipe ?? null));
        goto(who, r.prep);
      });
      goto(mom, r.prep, 2.4); // mixes or chops, then lifts it out
      goto(mom, r.cook);
      for (const p of [mom, dad]) p.group.position.set(p === mom ? -1.5 : 1.5, 0, 5);
      runFor(r.cookTime + 0.6);
      goto(dad, r.cook);
      const carrying = cook.probes().hands[1].carried?.recipe ?? null;
      goto(dad, "hatch", 0.8);
      const result = { order, steps, carrying, served: cook.probes().served, tally: JSON.parse(JSON.stringify(duo.tally)), kids: [bigSib.group.position.toArray().map((v) => +v.toFixed(2)), toddler.group.position.toArray().map((v) => +v.toFixed(2))], score: state.score, visible: [mom.group.visible, dad.group.visible] };
      duoWanted = wanted;
      return result;
    },
    /** A duo kitchen clears round 1: Mum and Dad must still be there (and the kids at the table) in round 2. */
    "duo-cook-round2": () => {
      const wanted = duoWanted;
      duoWanted = true;
      state.experience = state.familyDay = null; state.game = "cook"; state.mode = "medium";
      api.seed(7);
      runFor(0.5);
      state.returned = state.quota;
      runFor(0.2);
      runFor(BREAK_TIME + 0.5);
      const t = cook.kitchen.diningTable();
      const result = { round: state.round, parentsVisible: [mom.group.visible, dad.group.visible], toddlerAtTable: Math.hypot(toddler.group.position.x - t.baby.x, toddler.group.position.z - t.baby.z) < 0.1 };
      duoWanted = wanted;
      return result;
    },
    /** Race: the duo round again, now each parent's own points are counted and a winner named. */
    "duo-race": () => {
      const was = state.race;
      state.race = true;
      api.demo("duo");
      const { mum, dad: d } = duo.tally;
      const result = { race: state.race, points: { mum: mum.points, dad: d.points }, winner: raceWinner(), teamScore: state.score };
      state.race = was;
      return result;
    },
    /** Harness shortcut: the current round's quota is met (the next frame clears it), without running time. */
    "meet-quota": () => { state.returned = state.quota; return { game: state.game, phase: state.familyDay?.phase ?? null }; },
    /** A two-player Family Day end to end: tidy (both kids messing), cook (kids at the table), then all four sit down to eat. */
    "duo-family": () => {
      const wanted = duoWanted;
      duoWanted = true;
      state.experience = "family"; state.familyDay = null; state.game = "clean"; state.mode = "easy";
      api.seed(7);
      runFor(0.5);
      const tidy = { duo: duo.on, quota: state.quota, kidsMessing: bigSib.alert !== undefined && sibBlob.visible };
      state.returned = state.quota;
      runFor(0.2);
      const transition = state.familyDay.phase;
      runFor(3.2);
      const kitchen = { phase: state.familyDay.phase, game: state.game, parents: [mom.group.visible, dad.group.visible] };
      runFor(0.5);
      state.returned = state.quota;
      runFor(0.2);
      let t = 0;
      while (!cook.familyMealReady() && t < 24) { runFor(0.1); t += 0.1; }
      const table = cook.kitchen.diningTable(), at = (who, seat) => +Math.hypot(who.group.position.x - seat.x, who.group.position.z - seat.z).toFixed(2);
      const result = { tidy, transition, kitchen, mealReady: cook.familyMealReady(), gatherSeconds: +t.toFixed(1), phase: state.familyDay.phase,
        seats: { mum: at(mom, table.mom), dad: at(dad, table.dad), bigKid: at(bigSib, table.chef), toddler: at(toddler, table.baby) }, parents: [mom.group.visible, dad.group.visible] };
      duoWanted = wanted;
      return result;
    },
    /** Nobody tidies: the mess piles up, so the littering AI is visible. */
    littering: () => { api.seed(7); runFor(10); return { litter: messCount() }; },
    /** Run the big sibling toward a corner, grabbing whatever is on the way. */
    fetch: () => {
      api.seed(7);
      api.injectInput({ move: { x: -0.7, z: -0.7 } });
      runFor(6);
      api.injectInput({ move: null });
      return { carrying: state.carried.length, score: state.score };
    },
    /** A token appears, the player grabs it, and its timed effect starts (ends paused mid-effect). */
    powerup: () => {
      state.experience = state.familyDay = null; state.game = "clean"; // bubbles are a tidy-up thing
      api.seed(7);
      state.powerups.timer = 0;
      runFor(0.2);
      const kind = state.powerups.field?.kind;
      bigSib.group.position.set(state.powerups.field.x, 0, state.powerups.field.z);
      runFor(1);
      return { kind, active: { ...state.powerups.active }, picked: state.powerups.picked, carryLimit: carryLimit() };
    },
    /** A token nobody touches blinks and disappears. */
    "powerup-missed": () => {
      state.experience = state.familyDay = null; state.game = "clean"; // bubbles are a tidy-up thing
      api.seed(7);
      state.powerups.timer = 0;
      bigSib.group.position.set(-11, 0, 8);
      runFor(10.5);
      return { missed: state.powerups.missed, onFloor: !!state.powerups.field };
    },
    /** Clear a Hard round: the round card banks bonuses and names the twist, then round 2 opens with a power-up. */
    "round-break": () => {
      const mode = state.mode;
      api.seed(7);
      state.mode = "hard";
      resetGame(roomSeed);
      runFor(0.3);
      state.returned = state.quota;
      const score = state.score;
      runFor(0.2);
      const card = state.roundBreak && { ...state.roundBreak, banked: state.score - score };
      runFor(3);
      const result = { card, round: state.round, twist: difficulty().twist, powerup: state.powerups.field?.kind ?? null, timeLeft: Math.round(state.timeLeft) };
      state.mode = mode;
      resetGame(roomSeed);
      return result;
    },
    /** Walk up to the toddler: she glances back, scoots off and picks a spot across the room. */
    "toddler-dodge": () => {
      api.seed(7);
      const tp = toddler.group.position, p = bigSib.group.position;
      tp.set(0, 0, 2);
      state.toddlerTarget.set(0, 6); // a spot past the big sister
      p.set(0, 0, 4.5);
      state.toddlerDodges = 0;
      runFor(1.2);
      return { dodges: state.toddlerDodges, gap: Number(Math.hypot(tp.x - p.x, tp.z - p.z).toFixed(2)), target: { x: Number(state.toddlerTarget.x.toFixed(1)), z: Number(state.toddlerTarget.y.toFixed(1)) } };
    },
    /** Toddler aimed through the bed: she re-routes instead of pressing into it and littering one spot. */
    "toddler-unstuck": () => {
      api.seed(7);
      const bed = obstacles.find((o) => o.id === "bed");
      const tp = toddler.group.position;
      tp.set(bed.x - bed.hx - 0.4, 0, bed.z);
      state.toddlerTarget.set(bed.x + bed.hx + 1, bed.z);
      state.toddlerReroutes = 0;
      const start = { x: tp.x, z: tp.z };
      runFor(2.5);
      return { reroutes: state.toddlerReroutes, movedAway: Number(Math.hypot(tp.x - start.x, tp.z - start.z).toFixed(2)) };
    },
    /** The shop: open it, try on a starry top, buy it with demo coins (the real wallet is restored after). */
    shop: () => {
      const saved = JSON.stringify(state.wallet);
      resetGame(roomSeed, { showStart: true });
      state.wallet.coins += 2000;
      onControlAction("shop");
      onControlAction("shop-kid-sister");
      onControlAction("shop-slot-top");
      onControlAction("shop-item-sister-top-stars");
      runFor(0.3);
      const tops = bigSib.group.userData.outfitMaterials?.["teal shirt"];
      const triedOn = !!tops && [...tops].every(top => top.map !== top.userData.shippedMap);
      const coinsBefore = state.wallet.coins;
      onControlAction("shop-buy");
      const result = { triedOn, spent: coinsBefore - state.wallet.coins, wearing: state.wallet.equipped.sister.top, shopOpen: state.shopOpen };
      state.wallet = JSON.parse(saved);
      saveWallet(state.wallet);
      onControlAction("shop-close");
      return result;
    },
    /** The family pack: a x3 combo calls Dad's "Excellent!" and Mom says a line walking in. */
    "family-voices": () => {
      api.seed(7);
      onItemEvent("dropoff", { kind: "toy", points: 100, combo: 3, position: bigSib.group.position });
      const banner = state.banner?.text ?? null;
      runFor(0.2);
      const p = bigSib.group.position;
      state.powerups.field = { kind: "mom", x: p.x, z: p.z, life: 9 };
      runFor(0.3);
      const e = state.audioEvents;
      return { banner, cheer: e.cheer, mom: e.mom, momVisible: mom.group.visible }; // "ga-ga" rides on the bump demo
    },
    /** Slow-down grabbed: big sister's line, then the toddler's giggle, music ducked under them. */
    "slow-voices": () => {
      api.seed(7);
      const p = bigSib.group.position;
      state.powerups.field = { kind: "slow", x: p.x, z: p.z, life: 9 };
      runFor(0.3);
      return { voice: state.audioEvents.voice, slowActive: !!state.powerups.active.slow };
    },
    /** Mom's power-up: she walks in and tidies the floor for a few seconds. */
    mom: () => {
      api.seed(7);
      for (const [i, kind] of ["toy", "book", "cloth"].entries()) spawnItem(kind, -4 + i * 3, 2 + i, 0, 0, rng);
      runFor(1);
      const p = bigSib.group.position;
      state.powerups.field = { kind: "mom", x: p.x, z: p.z, life: 9 };
      runFor(3);
      return { momVisible: mom.group.visible, tidied: state.momTidied, banner: state.banner?.text ?? null };
    },
    /** Sprint: wind-up crouch, burst cloud, forward lean; then release for a skid. */
    dash: () => {
      api.seed(7);
      api.injectInput({ move: { x: 0, z: -1, sprint: true } });
      runFor(0.5);
      const mid = { dashT: state.dashT, lean: state.lean, sprinting: state.sprinting };
      api.injectInput({ move: null });
      runFor(0.1);
      return { mid, skidT: state.skidT };
    },
    /** Jump onto the coffee table (solid: she lands and stands on it), run off the far side; then bounce off the bed. */
    jump: () => {
      api.seed(7);
      const table = obstacles.find((o) => o.id === "table"), bed = obstacles.find((o) => o.id === "bed");
      const p = bigSib.group.position;
      p.set(table.x, 0, table.z + table.hz + 0.7);
      api.injectInput({ move: { x: 0, z: -1 } });
      runFor(0.1);
      state.jumpQueued = true;
      let peak = 0, stoodOn = 0;
      for (let i = 0; i < 12; i++) { runFor(0.05); peak = Math.max(peak, p.y); if (!state.airborne && state.feetY > 0.5) stoodOn = state.feetY; }
      runFor(0.6);
      const offTable = { cleared: p.z < table.z - table.hz, feetY: Number(state.feetY.toFixed(2)) };
      p.set(bed.x + bed.hx + 0.8, 0, bed.z);
      state.feetY = 0; state.airborne = false;
      api.injectInput({ move: { x: -1, z: 0 } });
      runFor(0.1);
      state.jumpQueued = true;
      runFor(0.15);
      api.injectInput({ move: null });
      let bounced = false;
      for (let i = 0; i < 24; i++) { runFor(0.05); if (state.airborne && state.vy > 8 && state.feetY > 0.5) bounced = true; }
      return { jumps: state.jumps, peak: Number(peak.toFixed(2)), tableTop: Number(table.top.toFixed(2)), bedTop: Number(bed.top.toFixed(2)),
        stoodOn: Number(stoodOn.toFixed(2)), offTable, bedBounce: bounced, settled: !state.airborne && state.feetY === 0 };
    },
    /** Pick up a toy and return it: it arcs into the bin; the gulp and confetti land with it. */
    tidy: () => {
      api.seed(7);
      const p = bigSib.group.position;
      spawnItem("toy", p.x, p.z + 0.3, 0, 0, rng);
      runFor(1.2);
      const carrying = state.carried.length;
      const bin = stations.find((st) => st.kind === "toy");
      p.set(bin.x, 0, bin.z);
      runFor(0.15);
      const midAir = { returned: state.returned, landed: state.audioEvents.dropoff, pulse: bin.pulse };
      runFor(0.6);
      return { carrying, midAir, afterPulse: Number(bin.pulse.toFixed(2)), returned: state.returned };
    },
    ...cook.demos({
      run: runFor,
      state: () => state,
      start: (mode) => { state.experience = null; state.familyDay = null; state.game = "cook"; state.mode = mode; state.launcher = false; api.seed(7); },
    }),
    "family-day-start": () => {
      state.experience = "family"; state.mode = "easy"; state.launcher = false; api.seed(7);
      return { ...state.familyDay };
    },
    "family-day-transition": () => {
      tidyFamilyDemo();
      return { ...state.familyDay };
    },
    "family-day-meal": () => {
      tidyFamilyDemo(); runFor(3.1);
      const served = cook.serveCurrentOrder(runFor);
      runFor(7);
      return { served, day: { ...state.familyDay }, dining: cook.probes().dining };
    },
    "family-day-hard": () => {
      tidyFamilyDemo("hard"); runFor(3.1);
      const dishes = [];
      for (let i = 0; i < 3; i++) dishes.push(cook.serveCurrentOrder(runFor));
      runFor(16);
      return { dishes, day: { ...state.familyDay }, won: state.won, score: state.score, dining: cook.probes().dining };
    },
    /** Exercise session boundaries without changing saved preferences or keeping demo rewards. */
    "family-day-boundaries": () => {
      const history = localStorage.getItem(HISTORY_KEY), wallet = JSON.stringify(state.wallet);
      const results = {};
      try {
        tidyFamilyDemo();
        const score = state.score, t = state.familyDay.phaseTime;
        onControlAction("help"); runFor(4);
        results.pausedTransition = state.familyDay.phaseTime === t && state.game === "clean";
        onControlAction("resume"); runFor(0.8);
        onControlAction("family-continue"); onControlAction("family-continue");
        results.singleTransition = state.game === "cook" && state.score === score && state.familyDay.completed.length === 1;
        onControlAction("restart");
        results.restartUsesDaySeed = state.game === "clean" && state.familyDay.seed === 8 && state.score === 0;
        state.mode = "medium"; resetGame(7);
        state.returned = state.quota; state.timeLeft = 0.001; runFor(0.05);
        results.finalTickWins = !state.over && state.familyDay.phase === "transition";
        onControlAction("restart"); state.timeLeft = 0.001; runFor(0.05);
        const count = scoreHistory().length, coins = state.wallet.coins;
        results.failedDay = state.over && !state.won && state.familyDay.phase === "failed" && state.familyDay.claimed && scoreHistory()[0].game === "family";
        runFor(1); onControlAction("family-continue");
        results.singleFailureReward = scoreHistory().length === count && state.wallet.coins === coins;
        tidyFamilyDemo(); runFor(3.1); cook.serveCurrentOrder(runFor); runFor(16);
        const completedCount = scoreHistory().length, completedCoins = state.wallet.coins;
        results.successfulDay = state.won && state.familyDay.claimed && scoreHistory()[0].game === "family";
        runFor(1); onControlAction("family-continue");
        results.singleSuccessReward = scoreHistory().length === completedCount && state.wallet.coins === completedCoins;
        onControlAction("restart");
        results.restartFromDinner = state.game === "clean" && state.familyDay.seed === 8 && state.score === 0 && !cook.probes().dining.finalMeal && state.followCam;
        onControlAction("menu"); onControlAction("game-clean"); onControlAction("play");
        results.standaloneTidy = !isFamilyDay() && !state.familyDay && state.quota === roundSettings(state.mode, 1).quota && state.followCam;
        onControlAction("menu"); onControlAction("games"); onControlAction("game-cook"); onControlAction("play");
        results.standaloneCook = !isFamilyDay() && !state.familyDay && state.quota === cookRound(state.mode, 1).quota && !cook.probes().dining.finalMeal && state.followCam;
      } finally {
        state.wallet = JSON.parse(wallet); saveWallet(state.wallet);
        if (history === null) localStorage.removeItem(HISTORY_KEY); else localStorage.setItem(HISTORY_KEY, history);
        loadHistory();
      }
      return results;
    },
    /** A final dinner takes ownership even when Mom has already begun returning the baby. */
    "family-day-return": () => {
      state.experience = "family"; state.mode = "medium"; state.launcher = false; api.seed(7);
      state.returned = state.quota; runFor(3.1); cook.serveCurrentOrder(runFor);
      let wait = 0;
      while (cook.probes().dining.mom !== "returning-baby" && wait < 20) { runFor(0.05); wait += 0.05; }
      const requested = cook.probes().dining.mom;
      state.returned = state.quota; runFor(0.05);
      let gather = 0;
      while (!cook.familyMealReady() && gather < 24) { runFor(0.05); gather += 0.05; }
      return { requested, ready: cook.familyMealReady(), day: { ...state.familyDay }, dining: cook.probes().dining };
    },
    /** The start screen: the game picker, then the kitchen's own mode card. */
    "game-picker": () => {
      state.launcher = true;
      resetGame(roomSeed, { showStart: true });
      const picker = uiLayout(renderer.domElement, state, api.controls()).buttons.map((b) => b.action);
      onControlAction("game-cook");
      const modes = uiLayout(renderer.domElement, state, api.controls()).buttons.map((b) => b.action);
      return { picker, game: state.game, modes };
    },
    /** The time of day jumped to the golden hour (17:00-ish): warm low sun, long window patch. */
    "day-golden": () => { api.seed(7); state.dayClock = DAY_LENGTH * 0.72; runFor(0.2); return { time: daylight.clock(dayT()), sun: sun.color.getHexString(), sunIntensity: Number(sun.intensity.toFixed(2)) }; },
    /** …and to the evening: lamp-warm fill, a night sky with stars in the window, no sun shafts. */
    "day-evening": () => { api.seed(7); state.dayClock = DAY_LENGTH; runFor(0.2); return { time: daylight.clock(dayT()), hemi: Number(hemi.intensity.toFixed(2)), fill: fill.color.getHexString() }; },
    /** Halloween: decorations up, a sweet dropped beside her is collected for +50; pumpkins glow at dusk. */
    halloween: () => {
      state.experience = state.familyDay = null; state.game = "clean";
      api.seed(7);
      state.seasons = ["halloween"]; seasonDecor.set(state.seasons);
      const p = bigSib.group.position, score = state.score;
      seasonDecor.treats.spawn(p.x + 0.5, p.z, 0, 0, rng);
      runFor(1.2);
      const collected = { treats: state.treats, points: state.score - score };
      state.dayClock = DAY_LENGTH * 0.95;
      runFor(0.2);
      return { ...collected, decor: seasonDecor.active, menuHasPumpkinSoup: (() => { state.game = "cook"; const m = difficulty().menu; state.game = "clean"; return m.includes("pumpkinSoup"); })() };
    },
    /** Run into the toddler: giggle pause with stars. */
    bump: () => {
      api.seed(7);
      bigSib.group.position.set(toddler.group.position.x, 0, toddler.group.position.z + 0.8);
      runFor(0.5);
      return { bumps: state.bumps, stunned: state.toddlerStun > 0 };
    },
  },
});
studioReady = true;

function runFor(seconds) { for (let t = 0; t < seconds; t += 0.05) api.step(50); }

/** A deterministic pickup/delivery path for the connected routine's studio previews. */
function tidyFamilyDemo(mode = "easy") {
  state.experience = "family"; state.mode = mode; state.launcher = false; api.seed(7);
  state.dropTimer = 999;
  const quota = state.quota, p = bigSib.group.position;
  for (let i = 0; i < quota; i++) {
    const kind = ["toy", "book", "cloth"][i % 3];
    p.set(0, 0, 4); spawnItem(kind, 0, 4.3, 0, 0, rng); runFor(1.2);
    const station = stations.find(st => st.kind === kind);
    p.set(station.x, 0, station.z); runFor(0.65);
  }
}

// ───────────────────────────── HUD ─────────────────────────────

/** Derive guidance from the inventory without changing the simulation or consuming its RNG. */
function deliveryTargets() {
  return Object.entries(KINDS)
    .map(([kind, info]) => ({
      kind,
      where: info.where,
      count: state.carried.filter((item) => item.kind === kind).length,
    }))
    .filter((target) => target.count > 0);
}

const feetOnScreen = new THREE.Vector3();
function drawHud(mess = 0) {
  // where her feet are on screen (0..1): the keyboard stamina ring is drawn around them
  feetOnScreen.copy(bigSib.group.position).project(camera);
  state.feetScreen = { x: (feetOnScreen.x + 1) / 2, y: (1 - feetOnScreen.y) / 2 };
  if (state.game === "cook") state.cookScreenZones = Object.fromEntries(cook.kitchen.stations.filter((s) => s.kind).map((s) => {
    feetOnScreen.set(s.zx, 0, s.zz).project(camera);
    return [s.id, { x: Number(((feetOnScreen.x + 1) / 2).toFixed(3)), y: Number(((1 - feetOnScreen.y) / 2).toFixed(3)) }];
  }));
  state.graphics = graphics.snapshot();
  state.showStick = uiPrefs.stick;
  state.showTips = uiPrefs.tips;
  state.seasonPref = uiPrefs.season;
  const layout = drawGameUi(api.hud, renderer.domElement, state, api.controls(), deliveryTargets(), mess, carryLimit(), difficulty(), { music: !isMusicMuted(), sfx: !isSfxMuted(), haptics: !isHapticsOff() }, { ...version, fps: state.graphics.fps, res: state.graphics.sceneRatio });
  if (joystickView.sync(layout?.stick ?? null, layout?.w ?? 1, layout?.h ?? 1)) graphics.touch();
  drawCelebration(api.hud);
}

/* ───────────── score history (this device) and sharing ───────────── */

const SHARE_URL = /^https?:$/.test(location.protocol) && !/^(localhost|127\.|\[::1\])/.test(location.hostname)
  ? location.origin + "/catcha" : "https://clean-up-chase.pages.dev/";

/** Every run you finish, newest first (max 100), kept in localStorage — no account, no server. */
/** What the Scores card shows: best + furthest round per mode, run counts, and the latest runs. */
function loadHistory() {
  const every = scoreHistory();
  state.gameBests = {};
  for (const h of every) {
    const game = h.game ?? "clean";
    if (duo.on !== game.startsWith("duo-")) continue;
    const key = game.replace(/^duo-/, "");
    state.gameBests[key] = Math.max(state.gameBests[key] ?? 0, h.score ?? 0);
  }
  const all = every.filter((h) => (h.game ?? "clean") === runGame());
  state.bests = modeBests();
  state.history = all.slice(0, 8);
  state.historyCounts = {};
  for (const h of all) state.historyCounts[h.mode] = (state.historyCounts[h.mode] ?? 0) + 1;
}

/** Best score and furthest round per mode on this device. */
function modeBests() {
  const bests = {};
  for (const h of scoreHistory()) {
    if ((h.game ?? "clean") !== runGame()) continue;
    const b = bests[h.mode] ??= { score: 0, round: 0 };
    b.score = Math.max(b.score, h.score ?? 0);
    b.round = Math.max(b.round, h.round ?? 0);
  }
  return bests;
}

function scoreHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) ?? []; } catch { return []; }
}

/** Once per finished run: save it, work out the per-mode best, and pre-render the share image. */
function recordRun() {
  if (state.recorded) return;
  if (isFamilyDay() && !claimDayResult(state.familyDay)) return;
  state.recorded = true;
  if (state.won) {
    celebrate(isFamilyDay() ? cook.kitchen.diningTable() : celebrant().group.position, true);
    playCelebration(true);
  }
  haptic(state.won ? "celebrate" : "sad");
  const history = scoreHistory();
  state.coinsEarned = earnFromScore(state.wallet, raceWinner() && net.room ? duo.tally[net.guest ? "dad" : "mum"].points : state.score);
  saveWallet(state.wallet);
  const mine = history.filter((h) => h.mode === state.mode && (h.game ?? "clean") === runGame());
  const previous = Math.max(0, ...mine.map((h) => h.score));
  const previousRound = Math.max(0, ...mine.map((h) => h.round ?? 0));
  history.unshift({ ...(runGame() !== "clean" ? { game: runGame() } : {}), score: state.score, mode: state.mode, won: state.won, round: isFamilyDay() ? state.familyDay.completed.length : state.round,
    returned: state.returned, bestCombo: state.bestCombo, at: new Date().toISOString() });
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 100))); } catch { /* private mode */ }
  track("game_over", { mode: modeKey(), round: state.round, score: state.score, v: state.won ? "won" : state.message.endsWith("Time's up!") ? "time" : "mess" });
  state.best = { score: Math.max(previous, state.score), isNew: state.score > previous && state.score > 0,
    round: Math.max(previousRound, state.round), isNewRound: !state.won && mine.length > 0 && state.round > previousRound };
  loadHistory();
  const run = state.familyDay, score = state.score;
  renderShareCard().then((file) => { if (state.recorded && state.familyDay === run && state.score === score) shareFile = file; }).catch(() => {});
}

function shareText() {
  const mode = `${duo.on ? (state.race ? "Race · " : "Co-op · ") : ""}${isFamilyDay() ? "Family Day · " : state.game === "cook" ? "Cooking · " : ""}${getMode(state.mode).name}`;
  if (isFamilyDay()) return `I scored ${state.score} on Catcha (${mode})${state.won ? " — a lovely Family Day!" : "!"} Can you beat me?`;
  const reached = state.won ? "" : ` and reached Round ${state.round}`;
  return `I scored ${state.score}${reached} on Catcha (${mode})${state.best?.isNew ? " — a new best" : ""}! ${state.game === "cook" ? "🥞" : "🧸"} Can you beat me?`;
}

/** A 1200×630 score card (the size social previews use), drawn with the game's own fonts and art. */
async function renderShareCard() {
  const family = isFamilyDay(), game = state.game, mode = state.mode, won = state.won, round = state.round, score = state.score, isNew = state.best?.isNew;
  const c = document.createElement("canvas");
  c.width = 1200; c.height = 630;
  const g = c.getContext("2d");
  const sky = g.createLinearGradient(0, 0, 0, 630);
  sky.addColorStop(0, "#0b8f8b"); sky.addColorStop(1, "#066461");
  g.fillStyle = sky; g.fillRect(0, 0, 1200, 630);
  g.fillStyle = "#fff6e6"; g.strokeStyle = "#241b3a"; g.lineWidth = 8;
  g.beginPath(); g.roundRect(40, 40, 1120, 550, 40); g.fill(); g.stroke();
  g.save(); g.beginPath(); g.roundRect(44, 44, 1112, 542, 36); g.clip(); // art tucks inside the card
  if (family) {
    const frame = new Image(); frame.src = api.capture(); await frame.decode();
    g.drawImage(frame, 640, 140, 520, 360);
  } else {
    const portrait = endCardPortrait(game, state.family);
    g.drawImage(portrait, 0.16 * portrait.naturalWidth, 0, 0.66 * portrait.naturalWidth, portrait.naturalHeight, 640, 70, 520, 520);
  }
  g.restore();
  g.lineWidth = 8; g.beginPath(); g.roundRect(40, 40, 1120, 550, 40); g.stroke();
  const shout = (text, x, y, size, color) => {
    g.font = `${size}px 'Luckiest Guy', sans-serif`; g.lineJoin = "round"; g.lineWidth = size * 0.2;
    g.strokeStyle = "#241b3a"; g.fillStyle = "#241b3a"; g.strokeText(text, x, y + size * 0.09); g.fillText(text, x, y + size * 0.09);
    g.strokeText(text, x, y); g.fillStyle = color; g.fillText(text, x, y);
  };
  shout("CATCHA", 90, 150, 64, "#ff7a4d");
  g.font = "34px 'Lilita One', sans-serif"; g.fillStyle = "#6b5f86";
  g.fillText(family ? `Family Day · ${getMode(mode).name}` : `${game === "cook" ? "Cooking · " : ""}${getMode(mode).name} · ${won ? (game === "cook" ? "Master chef!" : "Super helper!") : `Round ${round}`}`, 92, 215);
  g.fillText("MY SCORE", 92, 300);
  shout(String(score), 90, 420, 120, "#7657ee");
  if (isNew) shout("NEW BEST!", 92, 490, 40, "#ff5f93");
  g.font = "28px 'Lilita One', sans-serif"; g.fillStyle = "#241b3a";
  g.fillText(SHARE_URL.replace(/^https?:\/\//, "").replace(/\/$/, ""), 92, 550);
  const blob = await new Promise((resolve) => c.toBlob(resolve, "image/png"));
  return new File([blob], family ? "catcha-family-day-score.png" : game === "cook" ? "catcha-cooking-score.png" : "catcha-tidy-up-score.png", { type: "image/png" });
}

/**
 * Share needs a real user activation; on touch screens pointerdown is not one, so the share sheet
 * opens on the matching pointerup. Native share (with the score card when files are supported),
 * else the text and link go to the clipboard.
 */
function shareScore() {
  track("share", { mode: modeKey(), score: state.score });
  const text = shareText();
  const withFile = shareFile && navigator.canShare?.({ files: [shareFile] });
  const data = withFile ? { title: "Catcha", text: `${text} ${SHARE_URL}`, files: [shareFile] }
    : { title: "Catcha", text, url: SHARE_URL };
  if (navigator.share) navigator.share(data).catch(() => {});
  else navigator.clipboard?.writeText(`${text} ${SHARE_URL}`).then(() => say("Copied! Paste it anywhere to share.", 2.5)).catch(() => {});
}

/* ───────────── shop ───────────── */

const pickEquipped = () => { state.shopPick = state.wallet.equipped[state.shopKid][state.shopSlot]; };

function onShopAction(action) {
  const w = state.wallet;
  if (action === "shop") {
    if (!state.startOpen) return;
    state.shopOpen = true;
    state.shopKid ??= "sister";
    state.shopSlot ??= "top";
    pickEquipped();
    track("shop_open");
  } else if (action === "shop-close") {
    dressAll();
    resetGame(daySeed(), { showStart: true }); // puts the kids back where the room wants them
  } else if (action.startsWith("shop-gender-") && state.shopOpen) {
    const variant = action.slice(12);
    if (!validChildVariant(variant)) return;
    const child = state.shopKid === "baby" ? toddler : bigSib;
    child.setVariant(variant);
    state.family[state.shopKid] = variant;
    saveFamily(state.family);
    dressAll(itemById(state.shopPick));
    state.shopTwirl = 0.6;
  } else if (action.startsWith("shop-kid-")) {
    state.shopKid = action.slice(9);
    pickEquipped();
    dressAll();
  } else if (action.startsWith("shop-slot-")) {
    state.shopSlot = action.slice(10);
    pickEquipped();
    dressAll();
  } else if (action.startsWith("shop-item-")) {
    state.shopPick = action.slice(10);
    dressAll(itemById(state.shopPick)); // try it on, bought or not
    state.shopTwirl = 0.6;
  } else if (action === "shop-buy") {
    const item = itemById(state.shopPick);
    if (!item) return;
    if (owns(w, item)) {
      if (!equip(w, item)) return;
      playUi("select");
      haptic("tick");
    } else if (buy(w, item)) {
      playPurchase();
      haptic("celebrate");
      shout("NEW LOOK!", item.name, "#ff7aa8", false);
      burstDropoff((item.kid === "sister" ? bigSib : toddler).group.position, 0xffc531, rng);
      track("purchase", { v: item.id, score: item.price });
    } else {
      playUi("off"); // not enough coins yet
      return;
    }
    state.shopTwirl = 0.6;
    saveWallet(w);
    dressAll();
  }
}

// Try-on stage: both kids side by side on the rug, facing the camera, swaying; the one being
// dressed twirls and hops on every pick. The camera frames them in the left half, beside the panel.
const SHOWCASE = { sister: new THREE.Vector3(-1.5, 0, 2.4), baby: new THREE.Vector3(0.4, 0, 2.6) };
const showcaseCam = new THREE.Vector3(3.9, 3.7, 11.6), showcaseLook = new THREE.Vector3(5.0, 1.2, 2.6);
function stepShowcase(dt) {
  state.showT = (state.showT ?? 0) + dt;
  state.shopTwirl = Math.max(0, (state.shopTwirl ?? 0) - dt);
  for (const [kid, k, blob] of [["sister", bigSib, playerBlob], ["baby", toddler, toddlerBlob]]) {
    const at = SHOWCASE[kid], focus = kid === state.shopKid, spin = focus && state.shopTwirl > 0 ? 1 - state.shopTwirl / 0.6 : 0;
    k.group.position.set(at.x, spin ? Math.sin(spin * Math.PI) * 0.45 : 0, at.z + (focus ? 0.6 : 0)); // the one being dressed steps forward
    k.group.rotation.set(0, (kid === "sister" ? 0.25 : -0.25) + Math.sin(state.showT * 0.9 + (focus ? 0 : 2)) * 0.22 + spin * Math.PI * 2, 0);
    if (kid === "sister") k.group.scale.setScalar(1); // undo any run squash; the baby keeps her smaller 0.65 build
    const sway = Math.sin(state.showT * 2.2 + (focus ? 0 : 1.3)) * 0.12;
    k.limbs.arms[0].rotation.set(sway, 0, 0.15);
    k.limbs.arms[1].rotation.set(-sway, 0, -0.15);
    for (const leg of k.limbs.legs) leg.rotation.set(0, 0, 0);
    blob.position.set(at.x, 0.14, k.group.position.z);
    blob.scale.setScalar(1);
  }
  toddler.alert.visible = false;
  mom.group.visible = false;
  camera.position.lerp(showcaseCam, Math.min(1, dt * 5));
  camera.lookAt(showcaseLook);
}

/** Which menu sound each control makes. */
function uiSound(action) {
  if (action === "family-continue") return "select";
  if (action === "graphics-close") return "back";
  if (action.startsWith("graphics-")) return "select";
  if (action === "graphics" || action === "settings") return "tap";
  if (action.startsWith("toggle-")) return "select";
  if (action.startsWith("mode-") || action.startsWith("game-")) return "select";
  if (action === "games" || action === "arcade") return "back";
  if (action === "music") return isMusicMuted() ? "on" : "off";
  if (action === "sfx") return isSfxMuted() ? "on" : "off";
  if (action === "haptics") return isHapticsOff() ? "on" : "off";
  if (action === "help") return state.helpOpen ? "back" : "tap";
  if (action === "history") return state.historyOpen ? "back" : "tap";
  if (action === "shop-close") return "back";
  if (action.startsWith("shop-kid-") || action.startsWith("shop-slot-") || action.startsWith("shop-gender-")) return "select";
  if (action === "shop" || action.startsWith("shop-item-")) return "tap";
  return { play: "start", resume: "start", restart: "start", menu: "back", share: "select", hand: "tap" }[action] ?? null;
}

function onControlAction(action) {
  if (typeof action !== "string") return;
  graphics.invalidate();
  if (action === "room-error-close") { state.roomError = null; return; }
  if (state.roomError) return;
  if (action === "start-solo" && net.host && state.netWaiting) {
    // A fresh solo round cannot strand ingredients in the disconnected partner's hands.
    leaveRoom(false); duoWanted = false; state.launcher = false; resetGame(daySeed()); return;
  }
  if (state.netWaiting && action !== "leave") return;
  if (action === "jump") {
    if (isFamilyDay() && ["transition", "meal"].includes(state.familyDay?.phase)) {
      if (!state.startOpen && !state.helpOpen && !state.over) advanceFamilyDay(skipDay(state.familyDay));
      return;
    }
    if (state.roundBreak) { if (state.roundBreak.t > BREAK_SKIP) state.roundBreak.t = BREAK_TIME; return; }
    // haptic now, while the tapping finger is still down (iOS plays it as that finger lifts)
    if (!state.startOpen && !state.helpOpen && !state.over && state.jumpT < 0 && !state.airborne) { state.jumpQueued = true; haptic("tick"); }
    return;
  }
  // online: a guest's game buttons go to the host's game; leaving the room comes back to the menus
  if (net.room && (action === "leave" || (net.guest && (action === "menu" || action === "games")))) { playUi("back"); leaveRoom(); return; }
  if (net.guest && GUEST_ACTIONS.has(action)) {
    if (action !== "play" || state.startOpen || state.over) { playUi("tap"); haptic("tick"); }
    net.room.send({ t: "act", a: action });
    const pick = action.startsWith("race-") ? ["race", action === "race-on"] : action.startsWith("mode-") ? ["mode", action.slice(5)] : null;
    if (pick && state.startOpen) { net.hold = { key: pick[0], value: pick[1], t: 1 }; state[pick[0]] = pick[1]; drawHud(messCount()); api.refresh(); }
    return;
  }
  if (action === "together") {
    playUi("tap");
    if (net.room) { state.launcher = false; resetGame(daySeed(), { showStart: true }); } // already in a room: back to its game
    else connectRoom(newCode(), true, true);
    api.refresh();
    return;
  }
  if (action === "invite" && net.host) { playUi("tap"); addEventListener("pointerup", shareRoom, { once: true }); return; }
  if (action.startsWith("race-") && state.startOpen) { playUi("select"); state.race = action === "race-on"; drawHud(messCount()); api.refresh(); return; }
  if (action === "join-code") { playUi("tap"); addEventListener("pointerup", askForCode, { once: true }); return; }
  // keys send menu actions during play too (Space = play, 1/2/3 = modes): only real presses click
  const live = !(action === "play" && !state.startOpen && !state.over) && !(action.startsWith("mode-") && (!state.startOpen || state.launcher));
  const sound = live ? uiSound(action) : null;
  // turning sounds off: click first; turning them on: click after (below), so the press is heard
  if (sound && !(action === "sfx" && isSfxMuted())) playUi(sound);
  if (sound && action !== "haptics") haptic("tick");
  if (action === "share") {
    if (state.over) addEventListener("pointerup", shareScore, { once: true });
    return;
  }
  if (action.startsWith("shop")) {
    onShopAction(action);
    drawHud(messCount());
    api.refresh();
    return;
  }
  if (action.startsWith("game-") && state.startOpen && state.launcher) {
    if (!["game-clean", "game-cook", "game-family"].includes(action)) return;
    state.experience = action === "game-family" ? "family" : null;
    state.familyDay = null;
    state.game = action === "game-cook" ? "cook" : "clean";
    state.launcher = false;
    resetGame(daySeed(), { showStart: true });
  } else if (action === "arcade") {
    location.href = "/";
  } else if (action === "games" && state.startOpen) {
    state.launcher = true;
    state.historyOpen = false;
  } else if (action === "play" && state.startOpen && state.launcher) {
    state.launcher = false; // Enter on the picker opens the game that's already chosen
  } else if (action.startsWith("mode-") && state.startOpen && state.launcher) {
    return;
  } else if (action.startsWith("mode-") && state.startOpen) {
    const id = action.slice(5);
    if (!MODES.some((mode) => mode.id === id)) return;
    state.mode = id;
    resetGame(daySeed(), { showStart: true });
  } else if (action === "play") {
    if (state.startOpen) resetGame(daySeed());
    else if (state.over) resetGame((daySeed() + 1) >>> 0);
    else return;
    track("game_start", { mode: modeKey() });
  } else if (action === "menu") {
    const seed = state.startOpen ? daySeed() : (daySeed() + 1) >>> 0;
    if (isFamilyDay()) state.launcher = true;
    resetGame(seed, { showStart: true });
  } else if (action === "family-continue" && isFamilyDay() && !state.helpOpen && !state.startOpen && !state.over) {
    advanceFamilyDay(skipDay(state.familyDay));
  } else if (action === "history") state.historyOpen = !state.historyOpen && state.startOpen;
  else if (action === "help" && state.historyOpen) state.historyOpen = false; // Esc backs out of Scores
  else if (action === "settings") {
    // from anywhere: the pause card, or straight from the menus (then Back returns to the menu)
    if (!state.helpOpen) { state.helpOpen = true; state.settingsFromMenu = true; }
    state.graphicsOpen = true;
  }
  else if (action === "graphics-close" || (action === "help" && state.graphicsOpen)) {
    state.graphicsOpen = false;
    if (state.settingsFromMenu) state.helpOpen = state.settingsFromMenu = false;
  }
  else if (action.startsWith("graphics-") && state.graphicsOpen) {
    graphics.setMode(action.slice(9));
  }
  else if ((action === "toggle-stick" || action === "toggle-tips" || action === "toggle-season") && state.graphicsOpen) {
    const key = action.slice(7);
    uiPrefs[key] = !uiPrefs[key];
    saveUiPrefs();
    if (key === "season") applySeasons();
  }
  else if (action === "help") {
    state.helpOpen = !state.helpOpen;
    if (state.helpOpen && state.game === "cook") resetCookingVoices();
  }
  else if (action === "resume") { state.helpOpen = state.graphicsOpen = state.settingsFromMenu = false; }
  else if (action === "restart") {
    resetGame((daySeed() + 1) >>> 0, { showStart: state.startOpen });
    if (!state.startOpen) track("game_start", { mode: modeKey() });
  }
  else if (action === "suspend") {
    if (!state.startOpen) state.helpOpen = true;
    if (state.game === "cook") resetCookingVoices();
  }
  else if (action === "music") setMusicMuted(!isMusicMuted());
  else if (action === "sfx") { setSfxMuted(!isSfxMuted()); if (!isSfxMuted()) playUi("on"); }
  else if (action === "haptics") setHapticsOff(!isHapticsOff());
  else if (action !== "hand") return;
  api.clearInput();
  syncMusic();
  drawHud(messCount());
  api.refresh();
}

drawHud(0);
// an invite link opens straight into its room as Dad
const joinCode = validCode(urlParams.get("join"));
if (joinCode) connectRoom(joinCode, false);

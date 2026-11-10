/**
 * The cooking game's per-frame glue: walking into a station's floor zone does the transfer
 * (cooking.js decides what moves), standing at a full bowl/board mixes or chops, food on the
 * stove cooks and burns, the little sister sits on a counter and causes trouble, and every event
 * gets its sound, sparkle, buzz and message. main.js runs the big sister, rounds, camera and HUD
 * exactly as in the tidy-up game and calls `step()` where the tidy-up game runs its toddler/litter.
 *
 *   const cook = createCookGame({ scene, renderer, bigSib, toddler, mom, dad, toddlerBlob, hooks });
 *   cook.setActive(true); cook.reset(seed, state, settings); cook.step(dt, { state, settings, rng });
 */
import * as THREE from "three";
import { createKitchen, ZONE_R } from "./kitchen.js";
import { createCook, interact, stepPrep, stepCook, orderView, destinations, pickups, cookerLevel, RECIPES, INGREDIENTS, SUPPLIES, STATION_NAMES, PREP, COOKERS } from "./cooking.js";
import { resolveObstacles } from "./room.js";
import { playPickup, playGiggle, playBabyLaugh, playGaga, playBump, playUi, playDropoff, playOrder, playPlop, playChop, playSizzle, playDing, playWarn, playBurnt, playCookingServe, playCookingYum, resetCookingVoices, cookingVoiceState } from "./audio.js";
import { burstPickup, burstBump } from "./juice.js";
import { haptic } from "./haptics.js";
import { createFamilyDining } from "./family-dining.js";
import { cookingGuide } from "./cooking-guide.js";

const SWIPE_R = 2.7, GAGA_R = 1.75;
const VERB = { bowl: "mix", board: "chop" };
const name = (r) => RECIPES[r].name.toLowerCase();
const ing = (i) => INGREDIENTS[i].name.toLowerCase();

export function createCookGame({ scene, renderer, bigSib, toddler, mom, dad, toddlerBlob, hooks }) {
  const kitchen = createKitchen(scene, renderer);
  const dining = createFamilyDining({ kitchen, mom, dad, toddler, chef: bigSib });
  let k = createCook();
  const floor = [];
  let warnT = 0, prepping = null;
  /**
   * The cooks: the big sister alone, or Mum and Dad in a duo (cooks[0] is always this device's
   * player). Each has their own hands, zones and timers; `k.carried` is swapped to the cook acting.
   */
  let cooks = [], duo = false, eatT = 0, duoMeal = false;
  const cookFor = ({ char, s, who }) => ({ char, s, who, carried: null, inside: {}, cd: 0, chopT: 0, prepping: null });
  /** Runs `fn` with cook `c`'s hands as k.carried (and the other cook's as k.others). */
  function act(c, fn) {
    k.carried = c.carried;
    k.others = cooks.filter((o) => o !== c).map((o) => o.carried);
    const out = fn();
    c.carried = k.carried;
    return out;
  }
  /** Back to this device's view: its own hands in k.carried, for the guide, the HUD and the zones. */
  function settleHands() { act(cooks[0], () => {}); }
  const buzz = (c, kind) => { if (c === cooks[0]) haptic(kind); };
  const lift = (c) => (c.char.carryY ? c.char.carryY - 0.1 : 3.1);
  let tod = null;
  let babyWasEating = false;
  let settingsNow = null;
  const babyPan = () => Math.max(-0.6, Math.min(0.6, toddler.group.position.x / 13 * 0.6));
  const calm = () => ({ swipeCd: 6, knockT: 12, reach: null, gagaCd: 2, phase: 0 });

  function setActive(on) {
    kitchen.group.visible = on;
    toddlerBlob.visible = !on;
    toddler.alert.visible = false;
    if (!on) {
      resetCookingVoices();
      dining.reset();
      // hand the toddler back to the tidy-up game standing up
      for (const limb of [...toddler.limbs.legs, ...toddler.limbs.arms]) limb.rotation.set(0, 0, 0);
      toddler.group.rotation.set(0, toddler.group.rotation.y, 0);
    }
  }

  function seatToddler() {
    const s = kitchen.seat();
    toddler.group.position.set(s.x, s.y, s.z);
    return s;
  }

  /** `duoCooks`: [{ char, s, who }] for Mum and Dad (this device's first); omit for the big sister alone. */
  function reset(seed, state, settings, duoCooks = null) {
    settingsNow = settings;
    resetCookingVoices();
    babyWasEating = false;
    duo = !!duoCooks;
    cooks = (duoCooks ?? [{ char: bigSib, s: state, who: "mum" }]).map(cookFor);
    eatT = 0;
    duoMeal = false;
    // a duo's parents are the players: the dinner theatre (reset here, after any earlier dinner) mustn't hide them
    dining.reset();
    if (duo) mom.group.visible = dad.group.visible = true;
    k = createCook();
    floor.length = 0;
    warnT = 0;
    prepping = null;
    tod = calm();
    kitchen.applyLayout(seed);
    const s = seatToddler();
    toddler.group.rotation.set(0, s.yaw, 0);
    if (duo) seatKids(0);
    kitchen.syncFloor(floor);
    kitchen.sync(0, k, settings, { player: cooks[0].char.group.position, calling: new Set(), prepping: null, lift: lift(cooks[0]) });
    state.cookView = orderView(k, settings);
    state.cookHeld = null;
    state.cookBinEffect = 0;
    state.cookGuide = cookingGuide(k, settings);
  }

  function spawnFloor(id, x, y, z, vx, vy, vz, rng) {
    floor.push({ id, x, y, z, vx, vy, vz, rx: 0, ry: rng() * 6, life: 14, rest: false });
  }

  /* ───────────── events → feedback ───────────── */

  function onEvent(e, state, settings, st = null, c = cooks[0], effectsOnly = false) {
    const p = c.char.group.position, easy = state.mode === "easy";
    if (!effectsOnly) hooks.net?.(e, c.who, st?.id ?? null);
    const say = (...args) => { if (!effectsOnly) hooks.say(...args); };
    if (e.type === "order") {
      playOrder();
      if (k.orders.length === 1 || easy) say(`New order: ${RECIPES[e.recipe].name}!`, 2);
    } else if (e.type === "take") {
      playPickup("toy");
      buzz(c, "tick");
      burstPickup(p, 0xffffff);
      const to = destinations(k)[0];
      if (easy && to) say(`Got the ${ing(e.ing)}! Into the ${STATION_NAMES[to]}`, 2);
    } else if (e.type === "add") {
      playPlop();
      buzz(c, "tick");
      if (e.full) say(`All in! Stand at the ${STATION_NAMES[e.station]} to ${VERB[e.station]}`, 2.2);
    } else if (e.type === "prepped") {
      playDing();
      buzz(c, "land");
      say(`Done! Take it to the ${STATION_NAMES[RECIPES[e.recipe].cook]}`, 2.2);
    } else if (e.type === "takePrep") {
      playPickup("book");
    } else if (e.type === "cookStart") {
      playSizzle();
      buzz(c, "tick");
      if (easy) say("Cooking… wait for the ding!", 2);
    } else if (e.type === "ready") {
      playDing();
      playCookingYum(babyPan());
      buzz(c, "tick");
      say(settings.burnAfter ? `${RECIPES[e.recipe].name} ready! Grab it before it burns` : `${RECIPES[e.recipe].name} ready! Grab it`, 2.2);
    } else if (e.type === "burnt") {
      playBurnt();
      buzz(c, "sad");
      if (!effectsOnly) state.combo = 0;
      say(`Oh no, the ${name(e.recipe)} burnt! Into the bin`, 2.4);
    } else if (e.type === "takeDish") {
      if (e.burnt) playBump("furniture"); else playPickup("cloth");
      if (!e.burnt && easy) say("To the dining table!", 1.8);
    } else if (e.type === "serve") {
      if (duo) { kitchen.setMeal(e.recipe); eatT = 3; playCookingYum(babyPan(), 0.7); } else dining.serve(e.recipe);
      if (!effectsOnly) {
        state.combo += 1;
        state.comboTimer = 45; // in the kitchen a streak is serves in a row with nothing missed or burnt
        state.bestCombo = Math.max(state.bestCombo, state.combo);
        const points = e.points + (state.combo - 1) * 20;
        hooks.served?.(c.who, points);
        state.score += points;
        state.returned += 1;
      }
      const points = e.points + Math.max(0, state.combo - 1) * 20;
      state.scorePulse = 1;
      c.s.hopT = 0.32;
      state.audioEvents.dropoff += 1;
      playDropoff("toy", state.combo);
      playCookingServe(Math.max(-0.6, Math.min(0.6, p.x / 13 * 0.6)));
      buzz(c, state.combo >= 2 ? "combo" : "land");
      if (st) { burstBump({ x: st.zx, z: st.zz }, 0xffc531, true); burstPickup({ x: st.zx, z: st.zz }, 0xffc531); }
      hooks.flash("#ffc531", 0.2);
      say(`+${points}  ${RECIPES[e.recipe].name} served!${e.quick > 0.6 ? "  Speedy!" : ""}`, 1.8);
      if (!effectsOnly) hooks.streak(state.combo);
    } else if (e.type === "missed") {
      if (!effectsOnly) state.combo = 0;
      playUi("off");
      say(`Too slow… the ${name(e.recipe)} order left`, 2.2);
    } else if (e.type === "tipped") {
      say(`The ${STATION_NAMES[e.station]} was emptied`, 1.8);
    } else if (e.type === "bin") {
      playBump("furniture");
      buzz(c, "boop");
      state.cookBinEffect = 1.2;
      if (!effectsOnly) state.messageTime = 0;
    }
  }

  /** Walking in with the wrong thing: say where it goes instead (once per visit). */
  function wrong(e, state) {
    const held = k.carried, to = held ? destinations(k)[0] : null;
    let msg = null;
    if (e.reason === "nothing") msg = k.orders.length ? `Nothing needed from the ${STATION_NAMES[e.station]} right now` : "Wait for an order!";
    else if (e.reason === "burnt") msg = "It's burnt! Into the bin with it";
    else if (e.reason === "unordered") msg = "Nobody ordered that. Bin it";
    else if (e.reason === "full") msg = `The ${STATION_NAMES[e.station]} is busy`;
    else if (to) msg = `That goes to the ${STATION_NAMES[to]}`;
    else if (held?.type === "ing") msg = `No ${ing(held.id)} needed. Bin it`;
    if (!msg) return;
    playUi("off");
    hooks.say(msg, 1.8);
  }

  /* ───────────── the little sister on the counter ───────────── */

  function stepSister(dt, state, settings, rng) {
    const s = seatToddler(), p = bigSib.group.position;
    const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz) || 1;
    const pan = THREE.MathUtils.clamp(s.x / 13, -1, 1) * 0.6;
    tod.phase += dt;
    // sitting: legs dangle over the edge and kick; head follows her big sister
    const kick = Math.sin(tod.phase * 5) * 0.28;
    toddler.limbs.legs[0].rotation.x = -1.35 + kick;
    toddler.limbs.legs[1].rotation.x = -1.35 - kick;
    const look = THREE.MathUtils.clamp(((Math.atan2(dx, dz) - s.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -1.2, 1.2);
    toddler.limbs.head.rotation.y += (look * 0.7 - toddler.limbs.head.rotation.y) * Math.min(1, dt * 8);
    toddler.group.rotation.set(0, s.yaw + look * 0.3, 0);
    const r = tod.reach;
    toddler.alert.visible = !!r;
    if (r) {
      r.t += dt;
      const grab = -1.6 - Math.sin(r.t * 18) * 0.25; // both arms out, grabby hands
      toddler.limbs.arms[0].rotation.set(grab, 0, 0.3);
      toddler.limbs.arms[1].rotation.set(grab, 0, -0.3);
      if (r.kind === "swipe") {
        if (k.carried?.type !== "ing" || d > SWIPE_R + 0.5) { tod.reach = null; tod.swipeCd = 3; }
        else if (r.t >= 0.45) {
          const id = k.carried.id;
          k.carried = null;
          k.swipes += 1;
          spawnFloor(id, p.x, 2.9, p.z, (dx / d) * 3.4 + (rng() - 0.5) * 2, 5.5, (dz / d) * 3.4 + (rng() - 0.5) * 2, rng);
          if (playBabyLaugh(pan, 0.85)) state.audioEvents.babyLaugh += 1; else playGiggle();
          playBump("toddler");
          haptic("boop");
          burstBump(p, 0xffd6e8, true);
          hooks.say(`Hey! The little one swiped the ${ing(id)}! Pick it up`, 2.2);
          tod.reach = null;
          tod.swipeCd = settings.swipeEvery;
        }
      } else if (d < GAGA_R + 0.3) {
        // got there in time: she forgets about it
        tod.reach = null;
        tod.knockT = (settings.knockEvery ?? 12) * 0.6;
        if (playGaga(pan)) state.audioEvents.gaga += 1;
        hooks.say("Boop! Just in time!", 1.8);
      } else if (r.t >= 0.9) {
        const pst = k.prep[r.target], st = kitchen.byId[r.target];
        if (pst.contents.length && !pst.result && pst.progress === 0) {
          const id = pst.contents.pop();
          if (!pst.contents.length) pst.order = null;
          k.knocks += 1;
          spawnFloor(id, st.x + st.face[0] * 0.3, 1.7, st.z + st.face[1] * 0.3, st.face[0] * 3.2 + (rng() - 0.5) * 2.5, 4.5, st.face[1] * 3.2 + (rng() - 0.5) * 2.5, rng);
          if (playBabyLaugh(pan, 0.85)) state.audioEvents.babyLaugh += 1; else playGiggle();
          hooks.say(`Uh oh! The little one knocked the ${ing(id)} out of the ${STATION_NAMES[r.target]}`, 2.4);
        }
        tod.reach = null;
        tod.knockT = settings.knockEvery ?? 12;
      }
    } else {
      const wave = Math.sin(tod.phase * 3) * 0.2;
      toddler.limbs.arms[0].rotation.set(-0.35 + wave, 0, 0.5);
      toddler.limbs.arms[1].rotation.set(-0.35 - wave, 0, -0.5);
      tod.swipeCd -= dt;
      if (tod.swipeCd <= 0 && k.carried?.type === "ing" && d < SWIPE_R) {
        if (rng() < settings.swipeChance) tod.reach = { kind: "swipe", t: 0 };
        else tod.swipeCd = 2.5;
      }
      if (!tod.reach && settings.knockEvery) {
        tod.knockT -= dt;
        if (tod.knockT <= 0) {
          const target = PREP.find((id) => {
            const st = kitchen.byId[id], pst = k.prep[id];
            return Math.hypot(st.x - s.x, st.z - s.z) < 5 && pst.contents.length && !pst.result && pst.progress === 0;
          });
          if (target) tod.reach = { kind: "knock", t: 0, target };
          else tod.knockT = 3;
        }
      }
    }
    // walk right up to her and she babbles at you (and calms down for a bit)
    tod.gagaCd -= dt;
    if (d < GAGA_R && tod.gagaCd <= 0 && !tod.reach) {
      tod.gagaCd = 7;
      tod.knockT = Math.max(tod.knockT, 4);
      if (playGaga(pan)) state.audioEvents.gaga += 1;
      burstBump(toddler.group.position, 0xffd6e8, true);
    }
  }

  /* ───────────── dropped ingredients ───────────── */

  function stepFloor(dt, state, grounded) {
    const p = cooks[0].char.group.position;
    for (const it of [...floor]) {
      it.life -= dt;
      if (!it.rest) {
        it.vy -= 30 * dt;
        it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt;
        it.rx += dt * 9;
        if (it.y <= 0 && it.vy < 0) {
          it.y = 0;
          it.vy = -it.vy * 0.35; it.vx *= 0.55; it.vz *= 0.55;
          if (Math.abs(it.vy) < 1.3) { it.rest = true; it.vy = 0; it.rx = 0; }
        }
        resolveObstacles(kitchen.obstacles, it, 0.35);
      }
      if (it.life <= 0) { floor.splice(floor.indexOf(it), 1); continue; }
      if (!k.carried && it.rest && grounded && Math.hypot(it.x - p.x, it.z - p.z) < 1.15) {
        k.carried = { type: "ing", id: it.id };
        floor.splice(floor.indexOf(it), 1);
        playPickup("toy");
        haptic("tick");
        burstPickup(p, 0xffffff);
      }
    }
  }

  /* ───────────── per frame ───────────── */

  /** A duo's kids wait at the dining table (the big kid at the side, the toddler in the high chair) and tuck in when served. */
  function seatKids(dt) {
    const t = kitchen.diningTable();
    eatT = Math.max(0, eatT - dt);
    tod.phase += dt;
    [[bigSib, { ...t.mom, y: 0.02 }, 0], [toddler, t.baby, 2.5]].forEach(([kid, seat, off]) => {
      kid.group.position.set(seat.x, seat.y ?? 0.02, seat.z);
      kid.group.rotation.set(0, seat.yaw, 0);
      const ph = tod.phase * 2.8 + off, eating = eatT > 0;
      for (const leg of kid.limbs.legs) leg.rotation.set(-1.4, 0, 0);
      kid.limbs.arms[0].rotation.set(eating ? -1.1 - Math.max(0, Math.sin(ph * 2)) * 0.9 : -0.4 + Math.sin(ph) * 0.15, 0, 0.2);
      kid.limbs.arms[1].rotation.set(eating ? -0.8 : -0.4 - Math.sin(ph) * 0.15, 0, -0.2);
      kid.limbs.head.rotation.set(Math.sin(ph) * 0.06, Math.sin(ph * 0.5) * 0.15, 0);
      if (kid.alert) kid.alert.visible = false;
    });
  }

  function step(dt, { state, settings, rng }) {
    settingsNow = settings;
    state.cookBinEffect = Math.max(0, (state.cookBinEffect ?? 0) - dt);
    cooks[0].carried = k.carried; // (anything that set k.carried between frames, e.g. a demo, is this cook's)
    settleHands();
    for (const e of stepCook(k, dt, settings, rng)) onEvent(e, state, settings, e.station ? kitchen.byId[e.station] : null);
    prepping = null;
    for (const c of cooks) {
      const p = c.char.group.position, grounded = (c.s.feetY ?? 0) < 0.4;
      c.cd -= dt;
      c.prepping = null;
      act(c, () => {
        for (const st of kitchen.stations) {
          if (!st.kind) continue;
          const now = grounded && Math.hypot(p.x - st.zx, p.z - st.zz) < ZONE_R;
          const entered = now && !c.inside[st.id];
          c.inside[st.id] = now;
          if (!now) continue;
          if (c.cd <= 0) {
            const e = interact(k, st.id, settings);
            if (e?.type === "wrong") { if (entered && c === cooks[0]) wrong(e, state); }
            else if (e) { onEvent(e, state, settings, st, c); c.cd = 0.25; }
          }
          if (PREP.includes(st.id)) {
            const before = k.prep[st.id].progress, e = stepPrep(k, st.id, dt, settings);
            if (e || k.prep[st.id].progress > before) {
              c.prepping = st.id;
              if ((c.chopT -= dt) <= 0) { c.chopT = 0.22; playChop(st.id); }
            }
            if (e) onEvent(e, state, settings, st, c);
          }
        }
      });
      if (c.prepping) {
        // stirring / chopping: one arm pumps, facing the counter
        const st = kitchen.byId[c.prepping];
        c.s.playerYaw = Math.atan2(-st.face[0], -st.face[1]);
        c.char.limbs.arms[0].rotation.x = -1.2 + Math.sin(state.uiTime * 22) * 0.45;
        c.char.limbs.arms[1].rotation.x = -0.9;
      }
    }
    prepping = cooks[0].prepping;
    act(cooks[0], () => stepFloor(dt, state, (state.feetY ?? 0) < 0.4));
    if (duo) seatKids(dt);
    else {
      act(cooks[0], () => { if (!dining.ownsBaby) stepSister(dt, state, settings, rng); else tod.reach = null; });
      dining.step(dt);
      if (dining.babyEating && !babyWasEating) playCookingYum(babyPan(), 0.7);
      babyWasEating = dining.babyEating;
    }
    // a burning pan beeps until someone rescues it
    warnT -= dt;
    if (warnT <= 0 && COOKERS.some((id) => k.cookers[id].state === "ready" && settings.burnAfter && cookerLevel(k.cookers[id], settings) > 0.45)) { warnT = 0.7; playWarn(); }
    settleHands();
    show(dt, state, settings);
  }

  /** Draws this device's view of the kitchen: its cook's guide, zones and hands, the other cook's dish. */
  function show(dt, state, settings) {
    const me = cooks[0], other = cooks[1];
    const calling = new Set(k.carried ? destinations(k) : pickups(k));
    state.cookGuide = cookingGuide(k, settings);
    kitchen.sync(dt, k, settings, { player: me.char.group.position, calling, prepping: me.prepping, primary: state.cookGuide.targets[0],
      discard: state.cookBinEffect, lift: lift(me), partner: other && { pos: other.char.group.position, carried: other.carried, lift: lift(other) } });
    kitchen.syncFloor(floor);
    state.cookView = orderView(k, settings);
    state.cookHeld = k.carried;
  }

  /* ───────────── online duo ───────────── */

  /** Host → guest: the kitchen as data (orders, bowls, cookers, both cooks' hands, the table). */
  function netState() {
    const { others, carried, ...rest } = k;
    return { k: rest, hands: cooks.map((c) => c.carried), prep: cooks.map((c) => c.prepping), meal: kitchen.diningTable().meal, eat: eatT, familyMeal: duoMeal };
  }
  /** Guest: shows the host's kitchen. Its own cook (cooks[0], Dad) is the host's second. */
  function mirror(data, dt, state, settings) {
    if (!data) return;
    k = { ...data.k };
    cooks[0].carried = data.hands[1] ?? null;
    if (cooks[1]) cooks[1].carried = data.hands[0] ?? null;
    cooks[0].prepping = data.prep[1] ?? null;
    if (cooks[0].prepping) {
      const st = kitchen.byId[cooks[0].prepping];
      state.playerYaw = Math.atan2(-st.face[0], -st.face[1]);
      cooks[0].char.limbs.arms[0].rotation.x = -1.2 + Math.sin((state.uiTime ?? 0) * 22) * 0.45;
      cooks[0].char.limbs.arms[1].rotation.x = -0.9;
    }
    if (data.familyMeal) {
      // Family Day's dinner: everyone's pose comes from the host; the table is laid for four
      if (!duoMeal) { duoMeal = true; kitchen.setFamilyPlace(true); }
      if (data.meal !== kitchen.diningTable().meal) kitchen.setMeal(data.meal);
      Object.assign(state, { cookView: [], cookHeld: null, cookGuide: null });
      return;
    }
    if (data.meal !== kitchen.diningTable().meal) kitchen.setMeal(data.meal);
    if (data.eat > eatT) eatT = data.eat;
    settleHands();
    seatKids(dt);
    show(dt, state, settings);
  }
  /** Guest: a host cooking event's sound and sparkle (the score and words arrive with the snapshot). */
  function replay(e, who, stationId, state, settings) {
    const c = cooks.find((x) => x.who === who) ?? cooks[0];
    onEvent(e, state, settings, stationId ? kitchen.byId[stationId] : null, c, true);
  }

  /* ───────────── studio ───────────── */

  function probes() {
    return {
      orders: k.orders.map((o) => ({ recipe: o.recipe, patience: o.patience === null ? null : Number(o.patience.toFixed(1)) })),
      carried: k.carried, hands: cooks.map((c) => ({ who: c.who, carried: c.carried })), served: k.served, burnt: k.burnt, missed: k.missed, binned: k.binned, swipes: k.swipes, knocks: k.knocks,
      prep: Object.fromEntries(PREP.map((id) => [id, { contents: [...k.prep[id].contents], progress: Number(k.prep[id].progress.toFixed(2)), result: k.prep[id].result?.recipe ?? null }])),
      cookers: Object.fromEntries(COOKERS.map((id) => [id, { state: k.cookers[id].state, dish: k.cookers[id].dish }])),
      appliances: Object.fromEntries(COOKERS.map(id => [id, {
        heaterOn: !!kitchen.byId[id].heat?.visible,
        ovenGlow: !!kitchen.byId[id].glow?.visible,
        foodHeight: kitchen.byId[id].anchor.position.y,
      }])),
      floorItems: floor.length,
      dining: dining.probes(),
      voices: cookingVoiceState(),
      layout: kitchen.group.userData.layout,
      zones: Object.fromEntries(kitchen.stations.filter((s) => s.kind).map((s) => [s.id, { x: Number(s.zx.toFixed(2)), z: Number(s.zz.toFixed(2)) }])),
      sisterReaching: tod?.reach?.kind ?? null,
      guide: state().cookGuide,
      screenZones: state().cookScreenZones,
      binEffect: { remaining: state().cookBinEffect ?? 0, lidAngle: kitchen.byId.bin.lid.rotation.x,
        puffs: kitchen.byId.bin.binPuffs.filter((p) => p.visible).length },
    };
  }

  /** Scripted runs for the studio: `run(seconds)` steps the sim, `start(mode)` opens a fresh kitchen. */
  function serveCurrentOrder(run) {
    const goto = (id, wait = 0.35) => { const st = kitchen.byId[id]; bigSib.group.position.set(st.zx, 0, st.zz); run(wait); };
    tod.swipeCd = tod.knockT = 999;
    run(1);
    const recipe = k.orders[0]?.recipe, r = RECIPES[recipe];
    if (!r) return { recipe: null, served: k.served };
    for (const i of r.needs) { goto(Object.keys(SUPPLIES).find((s) => SUPPLIES[s].includes(i))); goto(r.prep); }
    goto(r.prep, 2.2);
    goto(r.cook);
    bigSib.group.position.set(0, 0, 5); run(r.cookTime + 0.5);
    goto(r.cook);
    const carrying = k.carried?.recipe ?? null;
    goto("hatch", 0.6);
    return { recipe, carrying, served: k.served, score: state().score };
  }
  function demos({ run, start }) {
    const goto = (id, wait = 0.35) => { const st = kitchen.byId[id]; bigSib.group.position.set(st.zx, 0, st.zz); run(wait); };
    const away = (wait) => { bigSib.group.position.set(0, 0, 5); run(wait); };
    const serveOrder = () => {
      start("easy");
      return serveCurrentOrder(run);
    };
    return {
      "cook-dining": () => { serveOrder(); away(5); return probes(); },
      "cook-family-cycle": () => { serveOrder(); away(18); return probes(); },
      /** One whole order on Easy: fetch each ingredient, mix/chop, cook, serve. */
      "cook-serve": () => {
        return serveOrder();
      },
      "cook-voices": () => {
        serveOrder();
        hooks.streak(3); // preview a serving line followed by Dad's cooking celebration
        return probes();
      },
      /** Medium: pancakes left in the pan go ready, beep, then burn; only the bin takes them. */
      "cook-burn": () => {
        start("medium");
        tod.swipeCd = tod.knockT = 999;
        run(0.5);
        k.carried = { type: "prep", recipe: "pancakes", order: k.orders[0]?.id ?? null };
        goto("pan");
        away(15);
        const cooker = k.cookers.pan.state;
        goto("pan");
        const held = { ...k.carried };
        goto("bin");
        return { cooker, held, burnt: k.burnt, binned: k.binned };
      },
      /** Accidental ingredient disposal: leave paused with the bin's lid open and its ring pulsing. */
      "cook-bin": () => {
        start("easy");
        tod.swipeCd = tod.knockT = 999;
        run(0.5);
        k.carried = { type: "ing", id: "flour" };
        goto("bin", 0.15);
        return probes();
      },
      /** Shared between-round card must name the kitchen's next menu, not a tidy-up room. */
      "cook-round-break": () => {
        start("easy");
        run(0.5);
        state().returned = state().quota;
        run(0.2);
        return { round: state().roundBreak?.round, twist: state().roundBreak?.twist };
      },
      /** A busy Medium kitchen for a look: two orders, eggs and flour in the bowl, soup on, pancakes catching, milk in hand. */
      "cook-busy": () => {
        start("medium");
        tod.swipeCd = tod.knockT = 999;
        run(0.8);
        k.orders = [{ id: 101, recipe: "pancakes", patience: 50, total: 75 }, { id: 102, recipe: "soup", patience: 16, total: 75 }];
        k.nextOrder = 99;
        Object.assign(k.prep.bowl, { contents: ["egg", "flour"], order: 101 });
        Object.assign(k.cookers.pot, { dish: "soup", order: 102, t: 3, state: "cooking" });
        Object.assign(k.cookers.pan, { dish: "pancakes", order: null, t: 4.2, state: "ready" });
        k.carried = { type: "ing", id: "milk" };
        const bowl = kitchen.byId.bowl;
        bigSib.group.position.set(bowl.zx + bowl.face[0] * 2.2 + 1, 0, bowl.zz + bowl.face[1] * 2.2);
        run(0.3);
        return probes();
      },
      /** All three appliances working, for inspecting burner/cavity feedback and cookware. */
      "cook-appliances": () => {
        start("medium");
        tod.swipeCd = tod.knockT = 999;
        run(0.5);
        const dishes = [["pan", "pancakes"], ["pot", "soup"], ["oven", "cookies"]];
        k.orders = dishes.map(([, recipe], i) => ({ id: 301 + i, recipe, patience: 50, total: 75 }));
        k.nextOrder = 99;
        dishes.forEach(([id, dish], i) => Object.assign(k.cookers[id], { dish, order: 301 + i, t: 2, state: "cooking" }));
        bigSib.group.position.set(0, 0, 5);
        run(0.1);
        return probes();
      },
      /** Three simultaneous orders: phone/tablet legibility and the next ingredient route. */
      "cook-three-orders": () => {
        start("hard");
        tod.swipeCd = tod.knockT = 999;
        run(0.8);
        k.orders = ["pancakes", "soup", "pizza"].map((recipe, i) => ({ id: 201 + i, recipe, patience: 50, total: 60 }));
        k.nextOrder = 99;
        k.carried = { type: "ing", id: "egg" };
        bigSib.group.position.set(0, 0, 4);
        run(0.1);
        return probes();
      },
      /** Hard: carry an egg past the little sister; she grabs it and it bounces onto the floor. */
      "cook-swipe": () => {
        start("hard");
        run(0.3);
        const s = kitchen.seat();
        k.carried = { type: "ing", id: "egg" };
        bigSib.group.position.set(s.x + s.face[0] * 1.9, 0, s.z + s.face[1] * 1.9);
        tod.reach = { kind: "swipe", t: 0 };
        run(0.6);
        const swiped = { swipes: k.swipes, carried: k.carried, onFloor: floor.length };
        run(1.5);
        return { ...swiped, landed: floor.every((f) => f.rest) };
      },
    };
  }
  let state = () => ({});
  return { kitchen, obstacles: kitchen.obstacles, setActive, reset, step, probes, netState, mirror, replay,
    stepDining: (dt) => { if (duo && !duoMeal) seatKids(dt); else dining.step(dt); },
    beginFamilyMeal: () => {
      resetCookingVoices(); k.orders.length = 0; k.carried = null; floor.length = 0;
      for (const c of cooks) c.carried = null;
      for (const c of Object.values(k.cookers)) Object.assign(c, { state: "empty", dish: null, order: null, t: 0 });
      for (const p of Object.values(k.prep)) Object.assign(p, { contents: [], order: null, progress: 0, result: null });
      kitchen.syncFloor(floor);
      kitchen.sync(0, k, settingsNow, { player: bigSib.group.position, calling: new Set(), prepping: null });
      Object.assign(state(), { cookView: [], cookHeld: null, cookGuide: null });
      if (duo) { duoMeal = true; dining.beginDuoMeal(); } else dining.beginFamilyMeal();
    },
    familyMealReady: () => dining.familyMealReady,
    serveCurrentOrder,
    // a duo's parents are the players: the dinner theatre's reset would hide them (and move the toddler off the table)
    nextRound: () => { if (!duo) { dining.reset(); babyWasEating = false; seatToddler(); } tod.reach = null; },
    demos: (helpers) => { state = helpers.state; return demos(helpers); } };
}

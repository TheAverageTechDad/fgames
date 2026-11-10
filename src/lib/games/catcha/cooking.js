/**
 * Cooking game rules — pure data and state, no three.js (tests/cooking.test.mjs runs it in node).
 * The loop: an order comes in → fetch its ingredients one at a time from the fridge, pantry and veg
 * crate → drop them in its prep station (mixing bowl or chopping board) → stand there to mix/chop →
 * carry the prepped food to its cooker (pan, pot, oven) → it cooks by itself, turns ready, then burns
 * if left → carry the dish to the dining table. Burnt food and anything unwanted goes in the bin.
 *
 *   const k = createCook();
 *   interact(k, "fridge", settings)        // a transfer at a station (main glue calls it in the zone)
 *   stepPrep(k, "bowl", dt, settings)      // standing at a prep station with a full recipe
 *   stepCook(k, dt, settings, rng)         // orders, patience, cookers — returns events
 *
 * Positions live in kitchen.js; this file only knows station ids and the slot table.
 */

export const INGREDIENTS = {
  egg: { name: "Egg" },
  flour: { name: "Flour" },
  milk: { name: "Milk" },
  chocolate: { name: "Chocolate" },
  carrot: { name: "Carrot" },
  tomato: { name: "Tomato" },
  cheese: { name: "Cheese" },
  dough: { name: "Dough" },
  pumpkin: { name: "Pumpkin" }, // Halloween
};
/** Where each ingredient lives: walking into a supply with empty hands takes the one you need next. */
export const SUPPLIES = { fridge: ["egg", "milk", "cheese"], pantry: ["flour", "chocolate", "dough"], veg: ["carrot", "tomato", "pumpkin"] }; // (pumpkin only gets picked up when an order needs it)
export const RECIPES = {
  pancakes: { name: "Pancakes", needs: ["egg", "flour", "milk"], prep: "bowl", cook: "pan", cookTime: 5 },
  soup: { name: "Soup", needs: ["carrot", "tomato"], prep: "board", cook: "pot", cookTime: 7 },
  cookies: { name: "Cookies", needs: ["flour", "egg", "chocolate"], prep: "bowl", cook: "oven", cookTime: 7 },
  pizza: { name: "Pizza", needs: ["dough", "tomato", "cheese"], prep: "board", cook: "oven", cookTime: 8 },
  // seasonal: only on the menu while its season is on (main.js adds it)
  pumpkinSoup: { name: "Pumpkin soup", needs: ["pumpkin", "carrot"], prep: "board", cook: "pot", cookTime: 7, season: "halloween" },
  hotChocolate: { name: "Hot chocolate", needs: ["milk", "chocolate"], prep: "bowl", cook: "pot", cookTime: 5, season: "christmas" },
  carrotCake: { name: "Carrot cake", needs: ["carrot", "flour", "egg"], prep: "bowl", cook: "oven", cookTime: 8, season: "easter" },
};
export const PREP = ["bowl", "board"];
export const COOKERS = ["pan", "pot", "oven"];
// Keep the family meal above the phone controls and bottom cooking hint.
export const DINING_SPOTS = [[-6.6, 0.6], [6.6, 0.6], [-6.8, -2.6], [6.8, -2.6]];
export const STATIONS = ["fridge", "pantry", "veg", "bowl", "board", "pan", "pot", "oven", "hatch", "bin", "seat"];
export const STATION_NAMES = { fridge: "fridge", pantry: "pantry", veg: "veg crate", bowl: "mixing bowl", board: "chopping board",
  pan: "frying pan", pot: "soup pot", oven: "oven", hatch: "dining table", bin: "bin", seat: "little one" };

/**
 * Counter spots the stations are dealt into (13 for 11 stations). x/z is the cabinet centre; `face`
 * points into the room, where the floor zone sits. Runs: back wall, left and right walls, island.
 */
export const SLOTS = [
  ...[-8.4, -4.2, 0, 4.2, 8.4].map((x) => ({ run: "back", x, z: -9.2, face: [0, 1] })),
  ...[-5, -0.8, 3.4].map((z) => ({ run: "left", x: -12.2, z, face: [1, 0] })),
  ...[-5, -0.8, 3.4].map((z) => ({ run: "right", x: 12.2, z, face: [-1, 0] })),
  ...[-1.25, 1.25].map((x) => ({ run: "island", x, z: 0, face: [0, 1] })),
];
const adjacent = (a, b) => SLOTS[a].run === SLOTS[b].run && Math.abs(a - b) === 1;

/** Seeded mulberry32 (the game's rng lives in materials.js, which needs three; this file must not). */
export function seededRng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deal the stations into slots for a seed: tall pieces, the oven and the bin go against a wall (never
 * the island), and the little sister always sits next to the bowl or the board so her mischief reaches.
 * Returns { stationId: slotIndex }.
 */
export function kitchenLayout(seed) {
  const rng = seededRng(seed * 2654435761);
  const order = SLOTS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const free = new Set(order), out = {};
  const take = (id, ok = () => true) => {
    const slot = order.find((i) => free.has(i) && ok(i)) ?? order.find((i) => free.has(i));
    free.delete(slot);
    out[id] = slot;
  };
  const prep = rng() < 0.5 ? "bowl" : "board"; // she sits beside one of them: placed first so a spot is free
  take(prep);
  take("seat", (i) => adjacent(i, out[prep]));
  for (const id of ["fridge", "pantry", "oven", "bin"]) take(id, (i) => SLOTS[i].run !== "island");
  for (const id of ["veg", prep === "bowl" ? "board" : "bowl", "pan", "pot", "hatch"]) take(id);
  return out;
}

/** Pace per mode and round: like game-modes.js, one named twist per round, then a gentle creep. */
const ALL = ["pancakes", "soup", "cookies", "pizza"];
const RAMPS = {
  easy: {
    base: { quota: 2, roundTime: 0, maxOrders: 1, orderGap: 2, patience: null, burnAfter: null, prepTime: 1.2, cookScale: 0.8,
      swipeEvery: 16, swipeChance: 0.35, knockEvery: null, menu: ["pancakes", "soup"] },
    twists: [
      ["Cookies are on the menu!", { quota: 3, menu: ["pancakes", "soup", "cookies"] }],
      ["Pizza night!", { quota: 3, menu: ALL }],
    ],
    rounds: 3,
  },
  medium: {
    base: { roundTime: 110, maxOrders: 2, orderGap: 7, patience: 75, burnAfter: 8, prepTime: 1.6, cookScale: 1,
      swipeEvery: 11, swipeChance: 0.55, knockEvery: 18, menu: ["pancakes", "soup", "cookies"] },
    twists: [
      ["Pizza's on the menu!", { menu: ALL }],
      ["Hungrier customers!", { patience: 62 }],
      ["Hotter stove!", { burnAfter: 6 }],
      ["Three orders at once!", { maxOrders: 3, orderGap: 6 }],
      ["Cheekier little one!", { swipeEvery: 8, knockEvery: 13 }],
    ],
    creep: (s, k) => ({ patience: Math.max(48, s.patience - 2 * k), roundTime: Math.max(90, s.roundTime - 2 * k) }),
    maxQuota: 8,
  },
  hard: {
    base: { roundTime: 100, maxOrders: 2, orderGap: 5, patience: 60, burnAfter: 6, prepTime: 2, cookScale: 1,
      swipeEvery: 8, swipeChance: 0.75, knockEvery: 12, menu: ALL },
    twists: [
      ["Three orders at once!", { maxOrders: 3, orderGap: 4.5 }],
      ["Hungrier customers!", { patience: 50 }],
      ["Hot stove!", { burnAfter: 4.5 }],
      ["Cheekier little one!", { swipeEvery: 6, knockEvery: 9 }],
      ["Less time on the clock!", { roundTime: 90 }],
    ],
    creep: (s, k) => ({ patience: Math.max(38, s.patience - 2 * k), roundTime: Math.max(75, s.roundTime - 2 * k) }),
    maxQuota: 9,
  },
};
export const COOK_HINTS = { easy: "One order at a time. Nothing burns.", medium: "Timed rounds. Don't let it burn!", hard: "Three orders. Hot stove!" };

/** The cooking half of a round's settings (main.js lays these over the shared mode profile). */
export function cookRound(mode, round = 1) {
  const ramp = RAMPS[mode] ?? RAMPS.easy;
  const r = Math.min(ramp.rounds ?? Infinity, Math.max(1, Math.floor(round) || 1));
  let s = { ...ramp.base };
  for (const [, patch] of ramp.twists.slice(0, r - 1)) s = { ...s, ...patch };
  const extra = r - 1 - ramp.twists.length;
  if (extra > 0) s = { ...s, ...ramp.creep(s, extra) };
  return { ...s, quota: s.quota ?? Math.min(ramp.maxQuota, 2 + r), timed: s.roundTime > 0,
    twist: r > 1 ? ramp.twists[r - 2]?.[0] ?? "A little faster!" : null, rounds: ramp.rounds ?? null };
}

export function createCook() {
  const prep = () => ({ contents: [], order: null, progress: 0, result: null });
  const cooker = () => ({ dish: null, order: null, t: 0, state: "empty" });
  return {
    orders: [], seq: 0, nextOrder: 0.6, carried: null,
    prep: { bowl: prep(), board: prep() },
    cookers: { pan: cooker(), pot: cooker(), oven: cooker() },
    served: 0, burnt: 0, missed: 0, binned: 0, swipes: 0, knocks: 0,
  };
}

/** Is every item of `list` available in `needs` (as a multiset)? */
export function fits(list, needs) {
  const left = [...needs];
  for (const x of list) { const i = left.indexOf(x); if (i < 0) return false; left.splice(i, 1); }
  return true;
}
const complete = (list, needs) => list.length === needs.length && fits(list, needs);
const orderById = (k, id) => k.orders.find((o) => o.id === id) ?? null;

/** Everything in someone's hands: `carried` is the cook acting now; `others` the rest of a duo. */
const inHands = (k) => [k.carried, ...(k.others ?? [])].filter(Boolean);

/** An order already being worked on somewhere (prepped, carried, cooking) can't claim a bowl again. */
function busy(k, id) {
  if (Object.values(k.prep).some((p) => p.order === id || p.result?.order === id)) return true;
  if (Object.values(k.cookers).some((c) => c.order === id && c.state !== "empty")) return true;
  return inHands(k).some((c) => c.order === id);
}

/** The order that `ing` would go towards at prep station `prepId`, or null if it doesn't belong there. */
export function claimFor(k, prepId, ing) {
  const p = k.prep[prepId];
  if (!p || p.result) return null;
  const mine = p.order !== null ? orderById(k, p.order) : null;
  if (mine) return fits([...p.contents, ing], RECIPES[mine.recipe].needs) ? mine : null;
  return k.orders.find((o) => RECIPES[o.recipe].prep === prepId && !busy(k, o.id) && fits([...p.contents, ing], RECIPES[o.recipe].needs)) ?? null;
}

/** Ingredients that would be accepted somewhere right now, oldest order first. */
export function wanted(k) {
  const out = [];
  for (const o of k.orders) for (const ing of RECIPES[o.recipe].needs) {
    if (!out.includes(ing) && PREP.some((id) => claimFor(k, id, ing))) out.push(ing);
  }
  return out;
}

/** Where this carried thing goes (station ids) — the zones that light up while you hold it. */
export function destinations(k, carried = k.carried) {
  if (!carried) return [];
  if (carried.type === "ing") return PREP.filter((id) => claimFor(k, id, carried.id));
  if (carried.type === "prep") {
    const c = RECIPES[carried.recipe].cook;
    return k.cookers[c].state === "empty" ? [c] : [];
  }
  if (carried.burnt) return ["bin"];
  return k.orders.some((o) => o.recipe === carried.recipe) ? ["hatch"] : ["bin"];
}

/** Stations worth walking to with empty hands. */
export function pickups(k) {
  const out = [];
  const want = wanted(k);
  for (const [id, list] of Object.entries(SUPPLIES)) if (list.some((ing) => want.includes(ing))) out.push(id);
  for (const id of PREP) {
    const p = k.prep[id], o = p.order !== null ? orderById(k, p.order) : null;
    if (p.result || (o && complete(p.contents, RECIPES[o.recipe].needs))) out.push(id);
  }
  for (const id of COOKERS) if (["ready", "burnt"].includes(k.cookers[id].state)) out.push(id);
  return out;
}

/**
 * A transfer at station `id` (called every frame while the player stands in its zone). Returns an
 * event `{ type, ... }` when something moved, `{ type: "wrong", ... }` when the held thing doesn't
 * belong here (the glue only shows that on entering the zone), else null.
 */
export function interact(k, id, settings = {}) {
  const held = k.carried;
  if (SUPPLIES[id]) {
    if (held) return null;
    const want = wanted(k), ing = SUPPLIES[id].find((x) => want.includes(x));
    if (!ing) return { type: "wrong", station: id, reason: "nothing" };
    k.carried = { type: "ing", id: ing };
    return { type: "take", ing, station: id };
  }
  if (k.prep[id]) {
    const p = k.prep[id];
    if (held?.type === "ing") {
      const o = claimFor(k, id, held.id);
      if (!o) return { type: "wrong", station: id, reason: "ingredient", ing: held.id };
      p.contents.push(held.id);
      p.order = o.id;
      k.carried = null;
      return { type: "add", ing: held.id, station: id, full: complete(p.contents, RECIPES[o.recipe].needs) };
    }
    if (!held && p.result) {
      k.carried = { type: "prep", recipe: p.result.recipe, order: p.result.order };
      p.result = null;
      p.order = null;
      p.progress = 0;
      return { type: "takePrep", recipe: k.carried.recipe, station: id };
    }
    return held ? { type: "wrong", station: id, reason: held.type } : null;
  }
  if (k.cookers[id]) {
    const c = k.cookers[id];
    if (held?.type === "prep") {
      if (RECIPES[held.recipe].cook !== id || c.state !== "empty") return { type: "wrong", station: id, reason: c.state !== "empty" ? "full" : "cooker", recipe: held.recipe };
      Object.assign(c, { dish: held.recipe, order: held.order, t: 0, state: "cooking" });
      k.carried = null;
      return { type: "cookStart", recipe: c.dish, station: id };
    }
    if (!held && (c.state === "ready" || c.state === "burnt")) {
      k.carried = { type: "dish", recipe: c.dish, order: c.order, burnt: c.state === "burnt" };
      Object.assign(c, { dish: null, order: null, t: 0, state: "empty" });
      return { type: "takeDish", recipe: k.carried.recipe, burnt: k.carried.burnt, station: id };
    }
    return held ? { type: "wrong", station: id, reason: held.type } : null;
  }
  if (id === "hatch") {
    if (held?.type !== "dish") return held ? { type: "wrong", station: id, reason: held.type } : null;
    if (held.burnt) return { type: "wrong", station: id, reason: "burnt" };
    const o = (orderById(k, held.order)?.recipe === held.recipe ? orderById(k, held.order) : null)
      ?? k.orders.find((x) => x.recipe === held.recipe);
    if (!o) return { type: "wrong", station: id, reason: "unordered", recipe: held.recipe };
    k.orders.splice(k.orders.indexOf(o), 1);
    k.carried = null;
    k.served += 1;
    const quick = o.patience !== null && o.total ? o.patience / o.total : 0;
    const points = 100 + 30 * RECIPES[o.recipe].needs.length + Math.round(60 * quick);
    if (!k.orders.length) k.nextOrder = Math.min(k.nextOrder, settings.orderGap ?? 1.5);
    return { type: "serve", recipe: o.recipe, points, quick };
  }
  if (id === "bin") {
    if (!held) return null;
    k.carried = null;
    k.binned += 1;
    return { type: "bin", what: held };
  }
  return null;
}

/** Standing at a prep station whose recipe is complete: mix/chop. Returns "prepped" when done. */
export function stepPrep(k, id, dt, settings) {
  const p = k.prep[id], o = p && p.order !== null ? orderById(k, p.order) : null;
  if (!o || p.result || !complete(p.contents, RECIPES[o.recipe].needs)) return null;
  p.progress = Math.min(1, p.progress + dt / (settings.prepTime ?? 1.5));
  if (p.progress < 1) return null;
  p.result = { recipe: o.recipe, order: o.id };
  p.contents = [];
  p.progress = 0;
  return { type: "prepped", recipe: o.recipe, station: id };
}

/** Time passes: orders arrive and run out of patience, cookers cook and burn. Returns events. */
export function stepCook(k, dt, settings, rng) {
  const events = [];
  for (const o of [...k.orders]) {
    if (o.patience === null) continue;
    o.patience -= dt;
    if (o.patience > 0) continue;
    k.orders.splice(k.orders.indexOf(o), 1);
    k.missed += 1;
    events.push({ type: "missed", recipe: o.recipe });
  }
  // a bowl/board whose order went away is re-claimed by a matching order, else tipped out
  for (const [id, p] of Object.entries(k.prep)) {
    if (p.order === null || orderById(k, p.order)) continue;
    const next = k.orders.find((o) => RECIPES[o.recipe].prep === id && !busy(k, o.id) && fits(p.contents, RECIPES[o.recipe].needs));
    p.order = next?.id ?? null;
    if (!next && p.contents.length) { p.contents = []; p.progress = 0; events.push({ type: "tipped", station: id }); }
  }
  k.nextOrder -= dt;
  if (k.orders.length < (settings.maxOrders ?? 1) && k.nextOrder <= 0) {
    const menu = settings.menu ?? Object.keys(RECIPES);
    let recipe = menu[Math.floor(rng() * menu.length)];
    if (k.orders.length && k.orders.every((o) => o.recipe === recipe)) recipe = menu[(menu.indexOf(recipe) + 1) % menu.length];
    const patience = settings.patience ?? null;
    k.orders.push({ id: ++k.seq, recipe, patience, total: patience });
    k.nextOrder = settings.orderGap ?? 4;
    events.push({ type: "order", recipe });
  }
  for (const [id, c] of Object.entries(k.cookers)) {
    if (c.state === "cooking") {
      c.t += dt;
      if (c.t >= RECIPES[c.dish].cookTime * (settings.cookScale ?? 1)) { c.state = "ready"; c.t = 0; events.push({ type: "ready", recipe: c.dish, station: id }); }
    } else if (c.state === "ready" && settings.burnAfter) {
      c.t += dt;
      if (c.t >= settings.burnAfter) { c.state = "burnt"; c.t = 0; k.burnt += 1; events.push({ type: "burnt", recipe: c.dish, station: id }); }
    }
  }
  return events;
}

/** 0..1 how far a cooker is (cooking: done fraction; ready: how close to burning). */
export function cookerLevel(c, settings) {
  if (c.state === "cooking") return c.t / (RECIPES[c.dish].cookTime * (settings.cookScale ?? 1));
  if (c.state === "ready") return settings.burnAfter ? c.t / settings.burnAfter : 0;
  return c.state === "burnt" ? 1 : 0;
}

/** What each order ticket shows: which ingredients are in, and where the food is now. */
export function orderView(k, settings = {}) {
  return k.orders.map((o) => {
    const needs = RECIPES[o.recipe].needs;
    let have = needs.map(() => false), stage = "gather", level = 0;
    const p = Object.values(k.prep).find((x) => x.order === o.id);
    if (p) {
      const left = [...p.contents];
      have = needs.map((ing) => { const i = left.indexOf(ing); if (i < 0) return false; left.splice(i, 1); return true; });
      if (have.every(Boolean)) { stage = "prep"; level = p.progress; }
    }
    const all = () => { have = needs.map(() => true); };
    const hands = inHands(k);
    if (Object.values(k.prep).some((x) => x.result?.order === o.id) || hands.some((c) => c.type === "prep" && c.order === o.id)) { all(); stage = "cook"; }
    const c = Object.values(k.cookers).find((x) => x.order === o.id && x.state !== "empty");
    if (c) { all(); stage = c.state; level = cookerLevel(c, settings); }
    const dish = hands.find((c) => c.type === "dish" && c.order === o.id);
    if (dish) { all(); stage = dish.burnt ? "burnt" : "serve"; }
    return { id: o.id, recipe: o.recipe, needs, have, stage, level, patience: o.total ? Math.max(0, o.patience / o.total) : null };
  });
}

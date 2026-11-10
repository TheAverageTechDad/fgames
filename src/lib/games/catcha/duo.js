/**
 * Two players (NOTES "Two-player mode"): Mum and Dad tidy, both kids make the mess. Pure helpers:
 * no three.js, no DOM.
 */

/**
 * A view of the shared game `state` where the keys in `own` belong to one actor and every other key
 * (score, combo, mode, powerups…) reads and writes the team's state.
 * ponytail: lets stepPlayer/stepToddler/stepPickup run unchanged for a second actor; give them an
 * explicit actor argument if they ever need to tell actors apart.
 */
export function overlay(base, own) {
  return new Proxy(own, {
    get: (o, k) => (Object.hasOwn(o, k) ? o[k] : base[k]),
    set: (o, k, v) => { if (Object.hasOwn(o, k)) o[k] = v; else base[k] = v; return true; },
  });
}

/** A parent's own movement, stamina and carried stack. */
export const parentState = () => ({
  playerYaw: 0, walkPhase: 0, carried: [], dashT: -1, jumpT: -1, jumpSpeed: 0, skidT: 0, landT: 0,
  feetY: 0, vy: 0, airborne: false, carry: false, lean: 0, squash: 1, hopT: 0, stamina: 1, tired: false,
  staminaRest: 0, sprinting: false, bumpCooldown: 0, wasBumping: false, spaceHeld: true,
});

/** A troublemaker's own wander-and-litter state; `target` is a THREE.Vector2. */
export const kidState = (target, firstDrop = 2) => ({
  toddlerTarget: target, toddlerPhase: 0, dropTimer: firstDrop, toddlerStun: 0, toddlerChased: false,
  toddlerAlertT: 0, toddlerAvoidCd: 0, toddlerStuck: 0, toddlerReroutes: 0, toddlerDodges: 0, throwT: 0,
  toddlerThrew: false, sprinting: false,
});

/** Mum on WASD + left Shift + Space; Dad on the arrows + right Shift + "/" (or "."). */
const DAD_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftRight"]);
export function splitKeys(keys) {
  const mum = new Set(), dad = new Set();
  for (const k of keys) (DAD_KEYS.has(k) ? dad : mum).add(k);
  return { mum, dad, dadJump: keys.has("Slash") || keys.has("Period") };
}

/** Two players, two troublemakers: a longer list to tidy and more room before it's "buried"; no Mom bubble (she's playing). */
export const duoSettings = (d) => ({
  ...d,
  quota: Math.ceil(d.quota * 1.5),
  messLimit: d.messLimit == null ? d.messLimit : Math.round(d.messLimit * 1.3),
  floorCap: d.floorCap == null ? d.floorCap : Math.round(d.floorCap * 1.5),
  momRate: 0,
  // the kitchen: one more order on the go (up to the three cookers) and they come a little quicker
  ...(d.maxOrders ? { maxOrders: Math.min(3, d.maxOrders + 1), orderGap: d.orderGap * 0.75 } : {}),
});

/** Stable record bucket: multiplayer must never compete with a solo personal best. */
export const scoreGame = (game, duo = false, family = false) => family ? "family" : duo ? `duo-${game}` : game;

/** Read-only kitchen guidance: follows the same transfers as cooking.js, never consumes RNG. */
import { RECIPES, INGREDIENTS, SUPPLIES, PREP, COOKERS, STATION_NAMES, wanted, claimFor, destinations, cookerLevel } from "./cooking.js";

const hint = (kind, title, detail, targets = [], icon = null, order = null) => ({ kind, title, detail, targets, icon, order });
export function cookingGuide(k, settings = {}) {
  const held = k.carried;
  if (held) {
    const to = destinations(k);
    if (held.type === "ing") {
      if (!to.length) return hint("bin", "Take it to the bin", "This ingredient is no longer needed", ["bin"], held.id);
      const order = claimFor(k, to[0], held.id);
      return hint("prep", `${INGREDIENTS[held.id].name} → ${STATION_NAMES[to[0]]}`, "Walk into the glowing circle", to, held.id, order?.id);
    }
    if (held.type === "prep") {
      const cooker = RECIPES[held.recipe].cook;
      return to.length ? hint("cook", `Take it to the ${STATION_NAMES[cooker]}`, "Walk into the glowing circle", to, `prep-${held.recipe}`, held.order)
        : hint("cook", `${STATION_NAMES[cooker]} is busy`, "Wait for the cooker to clear", [], `prep-${held.recipe}`, held.order);
    }
    const bin = to[0] === "bin";
    return hint(bin ? "bin" : "hatch", bin ? "Take it to the bin" : "Serve your dish!",
      bin ? (held.burnt ? "Burnt food goes in the bin" : "This order has already left") : "Walk into the dining table circle", to, held.burnt ? `burnt-${held.recipe}` : held.recipe, held.order);
  }
  // Rescue ready food before fetching something else, especially while it is close to burning.
  const ready = COOKERS.filter((id) => k.cookers[id].state === "ready")
    .sort((a, b) => cookerLevel(k.cookers[b], settings) - cookerLevel(k.cookers[a], settings));
  if (ready.length) {
    const c = k.cookers[ready[0]], urgent = settings.burnAfter && cookerLevel(c, settings) > 0.45;
    return hint(urgent ? "urgent" : "hatch", `Grab the ${RECIPES[c.dish].name.toLowerCase()}!`,
      urgent ? "Ready — rescue it before it burns" : `Ready at the ${STATION_NAMES[ready[0]]}`, [ready[0]], c.dish, c.order);
  }
  const burnt = COOKERS.find((id) => k.cookers[id].state === "burnt");
  if (burnt) return hint("bin", "Clear the burnt food", `Pick it up from the ${STATION_NAMES[burnt]}`, [burnt], `burnt-${k.cookers[burnt].dish}`);
  for (const id of PREP) {
    const p = k.prep[id], o = k.orders.find((o) => o.id === p.order);
    if (p.result) return hint("cook", "Pick up your prepared food", `From the ${STATION_NAMES[id]}`, [id], `prep-${p.result.recipe}`, p.result.order);
    if (o && p.contents.length === RECIPES[o.recipe].needs.length) return hint("prep", `${id === "bowl" ? "Mix" : "Chop"} at the ${STATION_NAMES[id]}`,
      "Stand in the circle until it is ready", [id], RECIPES[o.recipe].needs[0], o.id);
  }
  const want = wanted(k);
  if (want.length) {
    const supply = Object.keys(SUPPLIES).find((id) => SUPPLIES[id].includes(want[0]));
    // A supply offers its own first wanted item, not necessarily the first item of an order.
    const ingredient = SUPPLIES[supply].find((ing) => want.includes(ing));
    const order = PREP.map((id) => claimFor(k, id, ingredient)).find(Boolean);
    return hint("supply", `Get ${INGREDIENTS[ingredient].name} from the ${STATION_NAMES[supply]}`,
      "Hands free · walk into the blue circle", [supply], ingredient, order?.id);
  }
  const cooking = COOKERS.find((id) => k.cookers[id].state === "cooking");
  if (cooking) return hint("cook", "Cooking… wait for the ding", `${RECIPES[k.cookers[cooking].dish].name} at the ${STATION_NAMES[cooking]}`, [], k.cookers[cooking].dish, k.cookers[cooking].order);
  return hint("supply", "A new order is on its way", "Get ready, little chef!");
}

/** A single order rail leaves the side counters clear, including three-order phone rounds. */
export function kitchenHudLayout(v, count) {
  const gap = 8, h = 54, score = { x: v.left, y: v.top, w: v.w < 700 ? 78 : 92, h };
  const pause = { x: v.w - v.right - 46, y: v.top, w: 46, h: 46 };
  const timer = { x: pause.x - gap - 76, y: v.top, w: 76, h };
  const start = score.x + score.w + gap, available = timer.x - gap - start;
  // Reserve all three slots so new orders never shift the existing tickets during play.
  const ticketW = Math.min(190, (available - gap * 2) / 3);
  const tickets = Array.from({ length: Math.min(3, count) }, (_, i) => ({ x: start + i * (ticketW + gap), y: v.top, w: ticketW, h }));
  const mobileRoom = Math.max(120, v.w - v.left - v.right - 180);
  const guideW = Math.min(360, mobileRoom);
  return { score, pause, timer, tickets, waiting: { x: start, y: v.top, w: Math.min(available, 190), h: 40 },
    guide: { x: (v.w - guideW) / 2, y: v.h - v.bottom - 49, w: guideW, h: 46 }, bottom: v.top + h + 5 };
}

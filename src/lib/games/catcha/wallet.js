/**
 * Coins, what's been bought and what each kid is wearing — kept on this device (localStorage) until
 * accounts arrive. Score becomes coins at the end of every run: 1 coin per 10 points.
 *
 *   const w = loadWallet();  earnFromScore(w, 4200) → 420;  buy(w, item);  equip(w, item);  saveWallet(w);
 *
 * The functions are pure over the wallet object (tests/wallet.test.mjs); only load/save touch storage.
 */
import { DEFAULT_OUTFIT, ITEMS, itemById } from "./shop-catalog.js";

const KEY = "cuc-wallet-v1";
export const COINS_PER_POINT = 0.1;

function fresh() {
  return { coins: 0, owned: ITEMS.filter((i) => i.price === 0).map((i) => i.id), equipped: structuredClone(DEFAULT_OUTFIT), earned: 0 };
}

export function loadWallet() {
  const w = fresh();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) {
      w.coins = Math.max(0, Math.floor(saved.coins) || 0);
      w.earned = Math.max(0, Math.floor(saved.earned) || 0);
      w.owned = [...new Set([...w.owned, ...(saved.owned ?? []).filter((id) => itemById(id))])];
      for (const kid of Object.keys(w.equipped)) {
        for (const [slot, id] of Object.entries(saved.equipped?.[kid] ?? {})) {
          if (w.owned.includes(id) && itemById(id)?.kid === kid && itemById(id)?.slot === slot) w.equipped[kid][slot] = id;
        }
      }
    }
  } catch { /* private mode or a broken save: start fresh */ }
  return w;
}

export function saveWallet(w) {
  try { localStorage.setItem(KEY, JSON.stringify(w)); } catch { /* private mode */ }
}

/** Bank a finished run's score as coins; returns how many were earned. */
export function earnFromScore(w, score) {
  const coins = Math.max(0, Math.floor((score || 0) * COINS_PER_POINT));
  w.coins += coins;
  w.earned += coins;
  return coins;
}

export const owns = (w, item) => w.owned.includes(item.id);
export const wearing = (w, item) => w.equipped[item.kid]?.[item.slot] === item.id;

/** Buy and put it on. Returns false (and changes nothing) when it's owned or unaffordable. */
export function buy(w, item) {
  if (!item || owns(w, item) || w.coins < item.price) return false;
  w.coins -= item.price;
  w.owned.push(item.id);
  w.equipped[item.kid][item.slot] = item.id;
  return true;
}

export function equip(w, item) {
  if (!item || !owns(w, item)) return false;
  w.equipped[item.kid][item.slot] = item.id;
  return true;
}

import test from "node:test";
import assert from "node:assert/strict";
import { ITEMS, DEFAULT_OUTFIT, itemById, itemsFor, KIDS, SLOTS } from "../shop-catalog.js";
import { loadWallet, earnFromScore, buy, equip, owns, wearing } from "../wallet.js";

test("the catalog gives every kid a free starting piece in every slot, and fits the shop grid", () => {
  for (const k of KIDS) for (const s of SLOTS) {
    const list = itemsFor(k.id, s.id);
    assert(list.length >= 2 && list.length <= 8, `${k.id}/${s.id} has ${list.length} items`);
    assert.equal(list.filter((i) => i.price === 0).length, 1);
    assert.equal(itemById(DEFAULT_OUTFIT[k.id][s.id]).price, 0);
  }
  assert.equal(new Set(ITEMS.map((i) => i.id)).size, ITEMS.length, "ids are unique");
  for (const i of ITEMS) assert(i.id.length <= 24, `${i.id} fits the analytics value column`);
});

test("score becomes coins; buying spends them once and puts the item on; equip needs ownership", () => {
  const w = loadWallet(); // no localStorage in node: a fresh wallet
  assert.equal(w.coins, 0);
  assert.equal(earnFromScore(w, 4239), 423);
  const stars = itemById("sister-top-stars"), rainbow = itemById("sister-top-rainbow");
  assert.equal(buy(w, rainbow), false, "can't afford");
  assert.equal(equip(w, rainbow), false, "can't wear what you don't own");
  earnFromScore(w, 10000);
  assert.equal(buy(w, stars), true);
  assert.equal(w.coins, 1423 - stars.price);
  assert(owns(w, stars) && wearing(w, stars));
  assert.equal(buy(w, stars), false, "no double charge");
  const teal = itemById("sister-top-teal");
  assert.equal(equip(w, teal), true);
  assert(wearing(w, teal) && !wearing(w, stars));
});

/**
 * The wardrobe: what each kid can wear and what it costs. Pure data, shared by the shop card, the
 * wallet and the outfit painter. Coins come from score (see wallet.js: 1 coin per 10 points).
 *
 * `look` describes the fabric: a base `color`, an optional `print` drawn over it in `accent`
 * ("stripes", "dots", "stars", "hearts", "check", "rainbow", "denim", "sparkle"). `look: null` is the
 * outfit the model ships with (free, owned from the start). `swatch` is that default's colour.
 */
export const KIDS = [
  { id: "sister", name: "Big kid" },
  { id: "baby", name: "Little kid" },
];
export const SLOTS = [
  { id: "top", name: "Tops" },
  { id: "bottom", name: "Bottoms" },
  { id: "shoes", name: "Shoes" },
];
/** Which material in each kid's model a slot repaints. */
export const SLOT_MATERIALS = {
  sister: { top: "teal shirt", bottom: "navy shorts", shoes: "coral shoes" },
  baby: { top: "amber tee", bottom: "coral overalls", shoes: "teal sneakers" },
};

const item = (kid, slot, id, name, price, look, swatch = null) => ({ id: `${kid}-${slot}-${id}`, kid, slot, name, price, look, swatch });
/** A limited-time piece: in the shop only while its season is on (kept forever once bought). */
const seasonal = (season, ...args) => ({ ...item(...args), season });

export const ITEMS = [
  // Big sister
  item("sister", "top", "teal", "Teal tee", 0, null, 0x50bcbc),
  item("sister", "top", "lemon", "Lemon tee", 300, { color: 0xffd95a }),
  item("sister", "top", "lilac", "Lilac tee", 300, { color: 0xb59cf2 }),
  item("sister", "top", "stripes", "Sailor stripes", 600, { color: 0xfff6e6, print: "stripes", accent: 0x3a6fd8 }),
  item("sister", "top", "hearts", "Heart tee", 800, { color: 0xff8fb1, print: "hearts", accent: 0xffffff }),
  item("sister", "top", "stars", "Starry night", 1000, { color: 0x2b2f6b, print: "stars", accent: 0xffd95a }),
  item("sister", "top", "rainbow", "Rainbow tee", 1600, { color: 0xffffff, print: "rainbow" }),
  seasonal("halloween", "sister", "top", "bats", "Little bats", 700, { color: 0x6a45b8, print: "bats", accent: 0x241b3a }),
  item("sister", "bottom", "navy", "Navy shorts", 0, null, 0x617ca2),
  item("sister", "bottom", "denim", "Denim shorts", 400, { color: 0x4f78b8, print: "denim", accent: 0xf2c46b }),
  item("sister", "bottom", "pink", "Bubblegum shorts", 400, { color: 0xff9fc2 }),
  item("sister", "bottom", "mint", "Mint shorts", 400, { color: 0x7fd8b6 }),
  item("sister", "bottom", "dots", "Polka shorts", 700, { color: 0xf25f3a, print: "dots", accent: 0xfff6e6 }),
  item("sister", "bottom", "check", "Picnic check", 900, { color: 0xfff6e6, print: "check", accent: 0x22b385 }),
  seasonal("christmas", "sister", "bottom", "candycane", "Candy cane", 700, { color: 0xfff6f0, print: "stripes", accent: 0xe23b3b }),
  seasonal("easter", "sister", "bottom", "eggs", "Egg hunt shorts", 700, { color: 0xfffaf0, print: "eggs", accent: 0xffffff }),
  item("sister", "shoes", "coral", "Coral shoes", 0, null, 0xf6957c),
  item("sister", "shoes", "sunny", "Sunny shoes", 350, { color: 0xffd23f }),
  item("sister", "shoes", "sky", "Sky shoes", 350, { color: 0x6fb7f0 }),
  item("sister", "shoes", "white", "Fresh whites", 500, { color: 0xfafafa }),
  item("sister", "shoes", "glitter", "Glitter shoes", 1200, { color: 0x9b7bf0, print: "sparkle", accent: 0xffffff }),
  seasonal("valentines", "sister", "shoes", "sweetheart", "Sweetheart shoes", 600, { color: 0xff9fc2, print: "hearts", accent: 0xe23b3b }),
  // Baby
  item("baby", "top", "amber", "Amber tee", 0, null, 0xfdcb61),
  item("baby", "top", "mint", "Mint tee", 300, { color: 0x8fe0c0 }),
  item("baby", "top", "sky", "Sky tee", 300, { color: 0x9fd0ff }),
  item("baby", "top", "strawberry", "Strawberry tee", 700, { color: 0xff7a8a, print: "dots", accent: 0xfff2b0 }),
  item("baby", "top", "stripes", "Sunny stripes", 600, { color: 0xffe066, print: "stripes", accent: 0xffffff }),
  item("baby", "top", "stars", "Little star", 900, { color: 0xb59cf2, print: "stars", accent: 0xffffff }),
  seasonal("christmas", "baby", "top", "snowflakes", "Snowflake jumper", 700, { color: 0xd63a3a, print: "snowflakes", accent: 0xffffff }),
  seasonal("easter", "baby", "top", "eggs", "Spring eggs tee", 700, { color: 0xb8e6cf, print: "eggs", accent: 0xffffff }),
  item("baby", "bottom", "coral", "Coral overalls", 0, null, 0xea7c81),
  item("baby", "bottom", "denim", "Denim overalls", 500, { color: 0x5a82c2, print: "denim", accent: 0xf2c46b }),
  item("baby", "bottom", "lavender", "Lavender overalls", 450, { color: 0xc3a6f0 }),
  item("baby", "bottom", "gingham", "Gingham overalls", 900, { color: 0xffffff, print: "check", accent: 0xff7aa8 }),
  item("baby", "bottom", "hearts", "Heart overalls", 1000, { color: 0x6fc7b5, print: "hearts", accent: 0xffffff }),
  item("baby", "bottom", "rainbow", "Rainbow overalls", 1800, { color: 0xffffff, print: "rainbow" }),
  seasonal("halloween", "baby", "bottom", "pumpkins", "Pumpkin patch", 700, { color: 0x3f7f4a, print: "pumpkins", accent: 0x2c5a1e }),
  item("baby", "shoes", "teal", "Teal sneakers", 0, null, 0x45aaa2),
  item("baby", "shoes", "pink", "Pink sneakers", 350, { color: 0xff9fc2 }),
  item("baby", "shoes", "lemon", "Lemon sneakers", 350, { color: 0xffe066 }),
  item("baby", "shoes", "dots", "Dotty sneakers", 600, { color: 0x3a6fd8, print: "dots", accent: 0xffffff }),
  item("baby", "shoes", "glitter", "Glitter sneakers", 1200, { color: 0xff7aa8, print: "sparkle", accent: 0xffffff }),
  seasonal("valentines", "baby", "shoes", "lovebug", "Love bug sneakers", 600, { color: 0xe23b3b, print: "hearts", accent: 0xffffff }),
];

export const itemById = (id) => ITEMS.find((i) => i.id === id) ?? null;
export const itemsFor = (kid, slot) => ITEMS.filter((i) => i.kid === kid && i.slot === slot);
/** What the shop shows: everyday pieces, plus seasonal ones in season or already owned. */
export const shopItemsFor = (kid, slot, seasons = [], owned = []) =>
  itemsFor(kid, slot).filter((i) => !i.season || seasons.includes(i.season) || owned.includes(i.id));
/** Each kid's starting outfit: the free item in every slot. */
export const DEFAULT_OUTFIT = Object.fromEntries(KIDS.map((k) => [k.id,
  Object.fromEntries(SLOTS.map((s) => [s.id, itemsFor(k.id, s.id).find((i) => i.price === 0).id]))]));

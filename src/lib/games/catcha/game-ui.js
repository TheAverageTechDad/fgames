import { MODES } from "./game-modes.js";
import { POWERUPS } from "./powerups.js";
import { KIDS, SLOTS, itemsFor, shopItemsFor, itemById } from "./shop-catalog.js";
import { swatchFor } from "./outfits.js";
import { SEASONS } from "./seasons.js";
import { COOK_HINTS, RECIPES, INGREDIENTS, STATION_NAMES } from "./cooking.js";
import { kitchenHudLayout } from "./cooking-guide.js";
import { CHILD_ROLES, CHILD_VARIANTS, portraitVariant } from "./family.js";
import { GRAPHICS_MODES } from "./graphics-settings.js";
import { familyDaySettings } from "./family-day.js";

/**
 * One responsive canvas HUD, including touch hit regions; every visible element stays in capture().
 * Look: cream toy-box cards with a chunky ink outline and a solid drop lip, candy-gradient buttons,
 * Luckiest Guy for shouty headings and Lilita One for everything else (both bundled in
 * assets/fonts so Genex runs offline). Icons are drawn procedurally into small canvases.
 */
const INK = "#241b3a", INK_SOFT = "#6b5f86", CREAM = "#fff6e6", CREAM_2 = "#ffe8c8";
const DISPLAY = "'Luckiest Guy', 'Lilita One', system-ui, sans-serif";
const BODY = "'Lilita One', system-ui, sans-serif";
/** Candy button skins: [top, bottom] gradient, lip colour. */
const SKIN = {
  coral: [["#ff9a6b", "#f25f3a"], "#a83a1d"],
  mint: [["#6ce6b8", "#22b385"], "#137a5a"],
  sky: [["#86ceff", "#3a96ee"], "#1d5fae"],
  grape: [["#a993ff", "#7657ee"], "#4a31a8"],
  cream: [[CREAM, CREAM_2], INK],
};
const MODE_SKIN = { easy: "mint", medium: "sky", hard: "coral" };
const hex = (n) => `#${n.toString(16).padStart(6, "0")}`;

export const familyPortrait = new Image();
familyPortrait.src = "/catcha/assets/family-end-card-glasses.webp";
const cookingPortrait = new Image();
cookingPortrait.src = "/catcha/assets/family-cooking-end-card.webp";
const boyFamilyPortrait = new Image();
boyFamilyPortrait.src = "/catcha/assets/family-end-card-boy.webp";
const boyCookingPortrait = new Image();
boyCookingPortrait.src = "/catcha/assets/family-cooking-end-card-boy.webp";
const menuImage = name => {
  const image = new Image(); image.src = `/catcha/assets/menu/${name}.webp`;
  return image;
};
export const menuStickers = { clean: ["teddy", "book", "sock"].map(menuImage),
  cook: ["pancakes", "pizza", "soup"].map(menuImage) };
menuStickers.family = [menuStickers.clean[0], menuStickers.cook[0], menuStickers.cook[2]];
/** The same portrait is used by the finished run's HUD and share image. */
export const endCardPortrait = (game, family) => portraitVariant(game, family) === "boy"
  ? game === "cook" ? boyCookingPortrait : boyFamilyPortrait
  : game === "cook" ? cookingPortrait : familyPortrait;
export async function preloadGameUi() {
  const fonts = [["Luckiest Guy", "LuckiestGuy-Regular.ttf"], ["Lilita One", "LilitaOne-Regular.ttf"]].map(async ([family, file]) => {
    try {
      const face = new FontFace(family, `url(/catcha/assets/fonts/${file})`);
      document.fonts.add(await face.load());
    } catch { /* system fallback keeps the UI readable */ }
  });
  await Promise.all([familyPortrait.decode(), cookingPortrait.decode(), boyFamilyPortrait.decode(), boyCookingPortrait.decode(),
    ...[...new Set(Object.values(menuStickers).flat())].map(image => image.decode()), ...fonts]);
}

/* ───────────── icons ───────────── */

// Phosphor Icons, fill weight (MIT, phosphoricons.com), 256×256 paths. Drawn as stickers: an ink
// outline and drop under the colour, rendered once per colour at 128px so they stay crisp at 3x.
const ICON_PATHS = {
  gear: "M237.94,107.21a8,8,0,0,0-3.89-5.4l-29.83-17-.12-33.62a8,8,0,0,0-2.83-6.08,111.91,111.91,0,0,0-36.72-20.67,8,8,0,0,0-6.46.59L128,41.85,97.88,25a8,8,0,0,0-6.47-.6A111.92,111.92,0,0,0,54.73,45.15a8,8,0,0,0-2.83,6.07l-.15,33.65-29.83,17a8,8,0,0,0-3.89,5.4,106.47,106.47,0,0,0,0,41.56,8,8,0,0,0,3.89,5.4l29.83,17,.12,33.63a8,8,0,0,0,2.83,6.08,111.91,111.91,0,0,0,36.72,20.67,8,8,0,0,0,6.46-.59L128,214.15,158.12,231a7.91,7.91,0,0,0,3.9,1,8.09,8.09,0,0,0,2.57-.42,112.1,112.1,0,0,0,36.68-20.73,8,8,0,0,0,2.83-6.07l.15-33.65,29.83-17a8,8,0,0,0,3.89-5.4A106.47,106.47,0,0,0,237.94,107.21ZM128,168a40,40,0,1,1,40-40A40,40,0,0,1,128,168Z",
  home: "M224,120v96a8,8,0,0,1-8,8H160a8,8,0,0,1-8-8V164a4,4,0,0,0-4-4H108a4,4,0,0,0-4,4v52a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V120a16,16,0,0,1,4.69-11.31l80-80a16,16,0,0,1,22.62,0l80,80A16,16,0,0,1,224,120Z",
  music: "M212.92,17.71a7.89,7.89,0,0,0-6.86-1.46l-128,32A8,8,0,0,0,72,56V166.1A36,36,0,1,0,88,196V102.25l112-28V134.1A36,36,0,1,0,216,164V24A8,8,0,0,0,212.92,17.71Z",
  sound: "M160,32.25V223.69a8.29,8.29,0,0,1-3.91,7.18,8,8,0,0,1-9-.56l-65.57-51A4,4,0,0,1,80,176.16V79.84a4,4,0,0,1,1.55-3.15l65.57-51a8,8,0,0,1,10,.16A8.27,8.27,0,0,1,160,32.25ZM60,80H32A16,16,0,0,0,16,96v64a16,16,0,0,0,16,16H60a4,4,0,0,0,4-4V84A4,4,0,0,0,60,80Zm126.77,20.84a8,8,0,0,0-.72,11.3,24,24,0,0,1,0,31.72,8,8,0,1,0,12,10.58,40,40,0,0,0,0-52.88A8,8,0,0,0,186.74,100.84Zm40.89-26.17a8,8,0,1,0-11.92,10.66,64,64,0,0,1,0,85.34,8,8,0,1,0,11.92,10.66,80,80,0,0,0,0-106.66Z",
  soundOff: "M213.92,210.62a8,8,0,1,1-11.84,10.76L160,175.09v48.6a8.29,8.29,0,0,1-3.91,7.18,8,8,0,0,1-9-.56l-65.55-51A4,4,0,0,1,80,176.18V87.09L42.08,45.38A8,8,0,1,1,53.92,34.62Zm-27.21-55.46a8,8,0,0,0,11.29-.7,40,40,0,0,0,0-52.88,8,8,0,1,0-12,10.57,24,24,0,0,1,0,31.72A8,8,0,0,0,186.71,155.16Zm40.92-80.49a8,8,0,1,0-11.92,10.66,64,64,0,0,1,0,85.34,8,8,0,1,0,11.92,10.66,80,80,0,0,0,0-106.66ZM153,119.87a4,4,0,0,0,7-2.7V32.25a8.27,8.27,0,0,0-2.88-6.4,8,8,0,0,0-10-.16L103.83,59.33a4,4,0,0,0-.5,5.85ZM60,80H32A16,16,0,0,0,16,96v64a16,16,0,0,0,16,16H60a4,4,0,0,0,4-4V84A4,4,0,0,0,60,80Z",
  haptics: "M184,56V200a24,24,0,0,1-24,24H96a24,24,0,0,1-24-24V56A24,24,0,0,1,96,32h64A24,24,0,0,1,184,56Zm24,24a8,8,0,0,0-8,8v80a8,8,0,0,0,16,0V88A8,8,0,0,0,208,80Zm32,16a8,8,0,0,0-8,8v48a8,8,0,0,0,16,0V104A8,8,0,0,0,240,96ZM48,80a8,8,0,0,0-8,8v80a8,8,0,0,0,16,0V88A8,8,0,0,0,48,80ZM16,96a8,8,0,0,0-8,8v48a8,8,0,0,0,16,0V104A8,8,0,0,0,16,96Z",
  hand: "M216,104v48a88,88,0,0,1-176,0V64a16,16,0,0,1,32,0v56a8,8,0,0,0,16,0V32a16,16,0,0,1,32,0v80a8,8,0,0,0,16,0V48a16,16,0,0,1,32,0v80.67A48.08,48.08,0,0,0,128,176a8,8,0,0,0,16,0,32,32,0,0,1,32-32,8,8,0,0,0,8-8V104a16,16,0,0,1,32,0Z",
  refresh: "M224,48V96a8,8,0,0,1-8,8H168a8,8,0,0,1-5.66-13.66L180.65,72a79.48,79.48,0,0,0-54.72-22.09h-.45A79.52,79.52,0,0,0,69.59,72.71,8,8,0,0,1,58.41,61.27,96,96,0,0,1,192,60.7l18.36-18.36A8,8,0,0,1,224,48ZM186.41,183.29A80,80,0,0,1,75.35,184l18.31-18.31A8,8,0,0,0,88,152H40a8,8,0,0,0-8,8v48a8,8,0,0,0,13.66,5.66L64,195.3a95.42,95.42,0,0,0,66,26.76h.53a95.36,95.36,0,0,0,67.07-27.33,8,8,0,0,0-11.18-11.44Z",
  pause: "M216,48V208a16,16,0,0,1-16,16H160a16,16,0,0,1-16-16V48a16,16,0,0,1,16-16h40A16,16,0,0,1,216,48ZM96,32H56A16,16,0,0,0,40,48V208a16,16,0,0,0,16,16H96a16,16,0,0,0,16-16V48A16,16,0,0,0,96,32Z",
  help: "M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,168a12,12,0,1,1,12-12A12,12,0,0,1,128,192Zm8-48.72V144a8,8,0,0,1-16,0v-8a8,8,0,0,1,8-8c13.23,0,24-9,24-20s-10.77-20-24-20-24,9-24,20v4a8,8,0,0,1-16,0v-4c0-19.85,17.94-36,40-36s40,16.15,40,36C168,125.38,154.24,139.93,136,143.28Z",
  trophy: "M232,64H208V48a8,8,0,0,0-8-8H56a8,8,0,0,0-8,8V64H24A16,16,0,0,0,8,80V96a40,40,0,0,0,40,40h3.65A80.13,80.13,0,0,0,120,191.61V216H96a8,8,0,0,0,0,16h64a8,8,0,0,0,0-16H136V191.58c31.94-3.23,58.44-25.64,68.08-55.58H208a40,40,0,0,0,40-40V80A16,16,0,0,0,232,64ZM48,120A24,24,0,0,1,24,96V80H48v32q0,4,.39,8ZM232,96a24,24,0,0,1-24,24h-.5a81.81,81.81,0,0,0,.5-8.9V80h24Z",
  coins: "M184,89.57V84c0-25.08-37.83-44-88-44S8,58.92,8,84v40c0,20.89,26.25,37.49,64,42.46V172c0,25.08,37.83,44,88,44s88-18.92,88-44V132C248,111.3,222.58,94.68,184,89.57ZM56,146.87C36.41,141.4,24,132.39,24,124V109.93c8.16,5.78,19.09,10.44,32,13.57Zm80-23.37c12.91-3.13,23.84-7.79,32-13.57V124c0,8.39-12.41,17.4-32,22.87Zm-16,71.37C100.41,189.4,88,180.39,88,172v-4.17c2.63.1,5.29.17,8,.17,3.88,0,7.67-.13,11.39-.35A121.92,121.92,0,0,0,120,171.41Zm0-44.62A163,163,0,0,1,96,152a163,163,0,0,1-24-1.75V126.46A183.74,183.74,0,0,0,96,128a183.74,183.74,0,0,0,24-1.54Zm64,48a165.45,165.45,0,0,1-48,0V174.4a179.48,179.48,0,0,0,24,1.6,183.74,183.74,0,0,0,24-1.54ZM232,172c0,8.39-12.41,17.4-32,22.87V171.5c12.91-3.13,23.84-7.79,32-13.57Z",
  shop: "M241.57,171.2,141.33,96l23.46-17.6A8,8,0,0,0,168,72a40,40,0,1,0-80,0,8,8,0,0,0,16,0,24,24,0,0,1,47.69-3.78L14.43,171.2A16,16,0,0,0,24,200H232a16,16,0,0,0,9.6-28.8ZM32.73,184C53.6,170.59,89.49,152,128,152s74.4,18.59,95.27,32Z",
  top: "M247.59,61.22,195.83,33A8,8,0,0,0,192,32H160a8,8,0,0,0-8,8,24,24,0,0,1-48,0,8,8,0,0,0-8-8H64a8,8,0,0,0-3.84,1L8.41,61.22A15.76,15.76,0,0,0,1.82,82.48l19.27,36.81A16.37,16.37,0,0,0,35.67,128H56v80a16,16,0,0,0,16,16H184a16,16,0,0,0,16-16V128h20.34a16.37,16.37,0,0,0,14.58-8.71l19.27-36.81A15.76,15.76,0,0,0,247.59,61.22ZM35.67,112a.62.62,0,0,1-.41-.13L16.09,75.26,56,53.48V112Zm185.07-.14a.55.55,0,0,1-.41.14H200V53.48l39.92,21.78Z",
  bottom: "M53.44,43.5,54.12,38A16,16,0,0,1,70,24H186a16,16,0,0,1,15.88,14l.68,5.49a4,4,0,0,1-4,4.5H57.41A4,4,0,0,1,53.44,43.5ZM169,64a32.06,32.06,0,0,0,31,24h3.59a4,4,0,0,0,4-4.5l-2-16a4,4,0,0,0-4-3.5ZM52.41,88H56A32.06,32.06,0,0,0,87,64H54.41a4,4,0,0,0-4,3.5l-2,16A4,4,0,0,0,52.41,88ZM223.88,214,210.56,107.5a4,4,0,0,0-4-3.5H200a48.07,48.07,0,0,1-47.32-40H136v39.73a8.18,8.18,0,0,1-7.47,8.25,8,8,0,0,1-8.53-8V64H103.32A48.07,48.07,0,0,1,56,104H49.41a4,4,0,0,0-4,3.5L32.12,214a16,16,0,0,0,6.71,15.09A16.56,16.56,0,0,0,48.39,232h40.3a16,16,0,0,0,15.51-12.06l23.8-92,23.79,91.94A16,16,0,0,0,167.31,232h40.3a16.54,16.54,0,0,0,9.56-2.89A16,16,0,0,0,223.88,214Z",
  shoes: "M228.65,129.11l-28.06-9.35a4,4,0,0,0-2.63,0l-43.23,15.72A8.14,8.14,0,0,1,152,136a8,8,0,0,1-7.71-5.88,8.17,8.17,0,0,1,5.22-9.73L168,113.67a2.54,2.54,0,0,0-.06-4.8,23.93,23.93,0,0,1-8.8-5.25,4,4,0,0,0-4.17-.91l-24.22,8.8a8,8,0,0,1-10.44-5.39,8.17,8.17,0,0,1,5.22-9.73L146,88.93a4,4,0,0,0,2.31-5.34l-3.06-7.16a4,4,0,0,0-5.05-2.19l-25.5,9.27a8,8,0,0,1-10.44-5.39,8.17,8.17,0,0,1,5.22-9.73l24-8.73a4,4,0,0,0,2.31-5.33L130.39,41.6s0-.07,0-.1A16,16,0,0,0,110.25,33L34.53,60.49A16.05,16.05,0,0,0,24,75.53V192a16,16,0,0,0,16,16H240a16,16,0,0,0,16-16V167.06A40,40,0,0,0,228.65,129.11ZM240,192H40V176H240Z",
  together: "M96,48a40,40,0,1,1,0,80a40,40,0,1,1,0,-80ZM20,216c0-46,32-76,76-76s76,30,76,76ZM180,60a34,34,0,1,1,0,68a34,34,0,1,1,0,-68ZM184,146c38,0,60,28,60,70H188c0-26-8-48-24-64C170,148,177,146,184,146Z",
  heart: "M240,102c0,70-103.79,126.66-108.21,129a8,8,0,0,1-7.58,0C119.79,228.66,16,172,16,102A62.07,62.07,0,0,1,78,40c20.65,0,38.73,8.88,50,23.89C139.27,48.88,157.35,40,178,40A62.07,62.07,0,0,1,240,102Z",
};
const iconCache = new Map();
function icon(name, color = INK, off = false, mirror = false) {
  const key = `${name}|${color}|${off}|${mirror}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const path = new Path2D(ICON_PATHS[name === "sound" && off ? "soundOff" : name]);
  g.lineJoin = g.lineCap = "round";
  const draw = (dy, fill, stroke, width) => {
    g.save();
    g.translate(mirror ? 118 : 10, 8 + dy);
    g.scale((mirror ? -108 : 108) / 256, 108 / 256);
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = width; g.stroke(path); }
    if (fill) { g.fillStyle = fill; g.fill(path); }
    g.restore();
  };
  draw(6, INK, INK, 34); // drop
  draw(0, color, INK, 34); // ink outline, then the colour face
  if (off && name !== "sound") {
    // a fat red slash with its own ink edge
    g.lineCap = "round";
    for (const [w, col] of [[22, INK], [12, "#f25f3a"]]) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(22, 108); g.lineTo(106, 22); g.stroke(); }
  }
  iconCache.set(key, c);
  return c;
}

/* ───────────── layout (also the touch hit regions) ───────────── */

let cachedViewport = null;
export function viewport(canvas) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (cachedViewport?.w === w && cachedViewport?.h === h) return cachedViewport;
  const css = getComputedStyle(document.documentElement);
  const safe = (edge) => Math.max(0, parseFloat(css.getPropertyValue(`--safe-${edge}`)) || 0);
  cachedViewport = { w, h, left: 14 + safe("left"), right: 14 + safe("right"),
    top: 12 + safe("top"), bottom: 12 + safe("bottom") };
  return cachedViewport;
}

export function uiLayout(canvas, state, controls) {
  const v = viewport(canvas);
  const portrait = controls?.mobile && v.h > v.w;
  const help = { action: "help", x: v.w - v.right - 50, y: v.top, w: 50, h: 50 };
  if (state.game === "cook" && !state.startOpen && !state.helpOpen && !state.over)
    Object.assign(help, kitchenHudLayout(v, state.cookView?.length ?? 0).pause);
  const shopCard = state.startOpen && state.shopOpen && !state.helpOpen && !portrait;
  const historyCard = state.startOpen && state.historyOpen && !state.shopOpen && !state.helpOpen && !portrait;
  const pickerCard = state.startOpen && state.launcher && !state.historyOpen && !state.shopOpen && !state.helpOpen && !portrait;
  const startCard = state.startOpen && !state.launcher && !state.helpOpen && !state.historyOpen && !state.shopOpen && !portrait;
  const endCard = state.over && !state.helpOpen && !portrait;
  const family = state.experience === "family";
  const familyMeal = family && state.familyDay?.phase === "meal" && !state.startOpen && !state.helpOpen && !portrait;
  const familyResult = family && endCard;
  const graphicsCard = state.helpOpen && state.graphicsOpen && !portrait;
  const big = startCard || historyCard || pickerCard;
  const dialogW = Math.min(big ? 760 : familyResult ? 680 : endCard ? 640 : 520, v.w - v.left - v.right);
  const dialogH = Math.min(familyResult ? 126 : big || graphicsCard ? 350 : endCard ? 330 : 328, v.h - v.top - v.bottom - 8);
  const dialog = { x: (v.w - dialogW) / 2, y: familyResult ? v.h - v.bottom - dialogH - 6 : (v.h - dialogH) / 2 - 3, w: dialogW, h: dialogH };
  const wide = { x: dialog.x + 22, y: dialog.y + dialog.h - 70, w: dialog.w - 44, h: 52 };
  const resume = { ...wide, action: "resume" };
  // Pause tiles: Home, Music, Sounds, (touch) Hand, New room.
  const tileActions = ["menu", "music", "sfx", "settings", "restart"];
  const tileW = (dialog.w - 44 - (tileActions.length - 1) * 10) / tileActions.length;
  const tiles = tileActions.map((action, i) => ({ action, x: dialog.x + 22 + i * (tileW + 10), y: dialog.y + 112, w: tileW, h: 78 }));
  const graphicsEntry = { action: "graphics", x: wide.x, y: dialog.y + 204, w: wide.w, h: 36 };
  const graphicsBack = { ...wide, action: "graphics-close" };
  const qualityW = (wide.w - 12) / 2;
  const graphicsChoices = GRAPHICS_MODES.map((mode, i) => ({ action: `graphics-${mode.id}`, mode,
    x: wide.x + (i % 2) * (qualityW + 12), y: dialog.y + 58 + Math.floor(i / 2) * 60, w: qualityW, h: 52 }));
  const toggleIds = controls?.mobile ? ["stick", "tips", "haptics", "hand", "season"] : ["tips", "season"];
  const toggleW = (wide.w - 10 * (toggleIds.length - 1)) / toggleIds.length;
  const settingToggles = toggleIds.map((id, i) => ({ action: ["haptics", "hand"].includes(id) ? id : `toggle-${id}`, id,
    x: wide.x + i * (toggleW + 10), y: dialog.y + 186, w: toggleW, h: 56 }));
  // End card: Play again · Share · Modes.
  const third = (wide.w - 20) / 3;
  const restart = endCard ? { action: "restart", x: wide.x, y: wide.y, w: third, h: 52 } : tiles.find((t) => t.action === "restart");
  const share = { action: "share", x: wide.x + third + 10, y: wide.y, w: third, h: 52 };
  const menu = endCard ? { action: "menu", x: wide.x + (third + 10) * 2, y: wide.y, w: third, h: 52 } : tiles[0];
  const modeW = Math.min(340, dialog.w * 0.5);
  const modeButtons = MODES.map((mode, i) => ({ action: `mode-${mode.id}`, x: dialog.x + 22,
    y: dialog.y + 82 + i * 60, w: modeW, h: 48 }));
  const play = { ...wide, action: "play" };
  const music = { action: "music", x: dialog.x + dialog.w - 66, y: dialog.y + 16, w: 46, h: 44 };
  // On the start card "?" sits inside the card beside the music toggle, clear of the art.
  if (startCard) Object.assign(help, { x: music.x - 56, y: music.y, w: 46, h: 44 });
  const history = { action: "history", x: music.x - 112, y: music.y, w: 46, h: 44 };
  const shopButton = { action: "shop", x: music.x - 168, y: music.y, w: 46, h: 44 };
  const back = { ...wide, action: "history" };
  // Game picker: one big card per game; the mode card gets a button back to it.
  const gw = (dialog.w - 44 - 24) / 3, gy = dialog.y + 76;
  const gameCards = ["clean", "cook", "family"].map((game, i) => ({ action: `game-${game}`, game, x: dialog.x + 22 + i * (gw + 12), y: gy, w: gw, h: dialog.y + dialog.h - 22 - gy }));
  const mealFooter = { x: (v.w - Math.min(560, v.w - v.left - v.right)) / 2, y: v.h - v.bottom - 68, w: Math.min(560, v.w - v.left - v.right), h: 58 };
  // A whole transition card is a tap target, matching the existing tap-to-go affordance.
  const familyContinue = familyMeal ? { action: "family-continue", x: mealFooter.x + mealFooter.w - 128, y: mealFooter.y + 7, w: 116, h: 44 }
    : { action: "family-continue", x: (v.w - Math.min(440, v.w - 40)) / 2, y: (v.h - (v.w < 700 ? 168 : 196)) / 2 - 10, w: Math.min(440, v.w - 40), h: v.w < 700 ? 168 : 196 };
  const continuing = family && ["transition", "meal"].includes(state.familyDay?.phase) && state.familyDay.phaseTime >= 0.7;
  const pickerShop = { action: "shop", x: music.x - 56, y: music.y, w: 46, h: 44 };
  const pickerSettings = { action: "settings", x: music.x - 112, y: music.y, w: 46, h: 44 };
  // Online two-player: the Tidy Up card's art makes way for the room panel (code, who's here, invite).
  const roomPanel = { x: dialog.x + 22 + modeW + 22, y: dialog.y + 74, w: dialog.w - (modeW + 88), h: Math.max(120, wide.y - 10 - (dialog.y + 74)) };
  const roomW = (roomPanel.w - 32) / 2;
  const roomInvite = { action: "invite", x: roomPanel.x + 12, y: roomPanel.y + roomPanel.h - 54, w: roomW, h: 42 };
  // the second button: a code to join while waiting; once Dad's here (and for a guest), the way out
  const roomCode = { action: state.room?.peer || !state.room?.host ? "leave" : "join-code", x: roomInvite.x + roomW + 8, y: roomInvite.y, w: roomW, h: 42 };
  // Team or Race: two choices, not a toggle, so both parents tapping the same one can't flip it back (a guest's tap goes to Mum's game)
  const pickW = (roomPanel.w - 32) / 2;
  const roomTeam = { action: "race-off", x: roomPanel.x + 12, y: roomInvite.y - 42, w: pickW, h: 34 };
  const roomRace = { action: "race-on", x: roomTeam.x + pickW + 8, y: roomTeam.y, w: pickW, h: 34 };
  const roomButtons = state.room?.host ? [roomInvite, roomCode, roomTeam, roomRace] : [roomCode, roomTeam, roomRace];
  // no room yet: one button on the game's own start screen opens it, where the room panel will appear
  const startTogether = { action: "together", x: roomPanel.x + 12, y: wide.y - 50, w: roomPanel.w - 24, h: 38 };
  const gamesBack = { action: "games", x: dialog.x + 18, y: dialog.y + 16, w: 46, h: 44 };
  const arcadeBack = { ...gamesBack, action: "arcade" }; // fgames: the picker's way back to the arcade
  // Shop: a panel on the right; the kids stand in the open left part of the screen as the try-on.
  const shopW = Math.min(480, (v.w - v.left - v.right) * 0.6), shopH = Math.min(352, v.h - v.top - v.bottom - 8);
  const shop = { x: v.w - v.right - shopW - 8, y: (v.h - shopH) / 2 - 3, w: shopW, h: shopH };
  const familyPicker = { x: v.left + 8, y: shop.y + 8, w: Math.min(296, shop.x - v.left - 24), h: 108 };
  const familyChoices = CHILD_VARIANTS.map((variant, i) => ({ action: `shop-gender-${variant}`, variant,
    x: familyPicker.x + 12 + i * (familyPicker.w - 24) / 2, y: familyPicker.y + 42,
    w: (familyPicker.w - 32) / 2, h: 44 }));
  const sp = 16, sTabY = shop.y + 56;
  const kidTabs = KIDS.map((k, i) => ({ action: `shop-kid-${k.id}`, kid: k.id, x: shop.x + sp + i * 104, y: sTabY, w: 98, h: 36 }));
  const slotTabs = SLOTS.map((sl, i) => ({ action: `shop-slot-${sl.id}`, slot: sl.id,
    x: shop.x + shop.w - sp - (SLOTS.length - i) * 52 + 6, y: sTabY, w: 46, h: 36 }));
  const sGridY = sTabY + 46, sCols = 4, sGap = 8;
  const shopDone = { action: "shop-close", x: shop.x + sp, y: shop.y + shop.h - 62, w: 104, h: 48 };
  const shopBuy = { action: "shop-buy", x: shopDone.x + 114, y: shopDone.y, w: shop.w - sp * 2 - 114, h: 48 };
  const sTileW = (shop.w - sp * 2 - sGap * (sCols - 1)) / sCols, sTileH = Math.min(88, (shopDone.y - 8 - sGridY - sGap) / 2);
  const shopTiles = shopItemsFor(state.shopKid ?? "sister", state.shopSlot ?? "top", state.seasons ?? [], state.wallet?.owned ?? []).slice(0, 8).map((item, i) => ({
    action: `shop-item-${item.id}`, item, x: shop.x + sp + (i % sCols) * (sTileW + sGap), y: sGridY + Math.floor(i / sCols) * (sTileH + sGap), w: sTileW, h: sTileH }));
  const roomContinue = { ...wide, action: state.roomError ? "room-error-close" : state.room?.host ? "start-solo" : "leave" };
  const roomLeave = { ...wide, y: wide.y - 64, action: "leave" };
  const buttons = portrait ? [] : state.roomError ? [roomContinue] : state.netWaiting ? (state.room?.host ? [roomContinue, roomLeave] : [roomContinue]) : graphicsCard ? [...graphicsChoices, ...settingToggles, graphicsBack] : state.helpOpen ? [resume, ...tiles] : historyCard ? [back]
    : shopCard ? [...kidTabs, ...slotTabs, ...shopTiles, shopDone, shopBuy, ...familyChoices]
    : pickerCard ? [...gameCards, pickerShop, pickerSettings, music, arcadeBack]
    : startCard ? [...modeButtons, play, help, music, history, shopButton, gamesBack, ...(state.room ? roomButtons : [startTogether])] : state.over ? [restart, share, menu] : [help, ...(continuing ? [familyContinue] : [])];
  return { ...v, roomContinue, roomLeave, startTogether, roomPanel, roomInvite, roomCode, roomTeam, roomRace, portrait, familyMeal, familyResult, mealFooter, familyContinue, startCard, historyCard, shopCard, endCard, pickerCard, pickerSettings, graphicsCard, graphicsEntry, graphicsBack, graphicsChoices, settingToggles, gameCards, pickerShop, gamesBack, arcadeBack, help, history, back, dialog, resume, restart, share, tiles, modeButtons, play, menu, music,
    shopButton, shop, familyPicker, familyChoices, kidTabs, slotTabs, shopTiles, shopDone, shopBuy, buttons };
}

/** "today", "yesterday", "3 days ago", then a short date. */
function ago(at) {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return "";
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 86400000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : days < 7 ? `${days} days ago`
    : new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "Holding Egg", "Holding Pancakes", "Hands free" for the kitchen's progress chip. */
function heldLabel(held) {
  if (!held) return "Hands free";
  if (held.type === "ing") return `Holding ${INGREDIENTS[held.id].name}`;
  if (held.type === "prep") return `Holding ${RECIPES[held.recipe].name} mix`;
  return held.burnt ? "Holding burnt food!" : `Holding ${RECIPES[held.recipe].name}`;
}

/* ───────────── drawing ───────────── */

const SETTERS = new Set(["text", "panel", "circle", "image", "bar"]);

/**
 * Lays the whole UI out every step but leaves unchanged items in place, so the HUD only repaints
 * (and re-uploads its full-screen texture) when something on it moved. Items that stopped being
 * drawn are removed; when a new one appears the UI is rebuilt in paint order so it layers right.
 * Only our own `ui-` items are touched: studio flash/crosshair survive.
 */
export function drawGameUi(hud, ...args) {
  const before = hud.items().filter((id) => id.startsWith("ui-"));
  const seen = new Set();
  const track = new Proxy(hud, { get: (t, k) => SETTERS.has(k) ? (id, ...rest) => { seen.add(id); return t[k](id, ...rest); } : t[k] });
  let layout = paintGameUi(track, ...args);
  const old = new Set(before);
  if ([...seen].some((id) => !old.has(id))) {
    for (const id of new Set([...before, ...seen])) hud.remove(id);
    layout = paintGameUi(hud, ...args);
  } else for (const id of before) if (!seen.has(id)) hud.remove(id);
  return layout;
}

function paintGameUi(hud, canvas, state, controls, targets, mess, carryLimit, settings, audio = {}, version = null) {
  const l = uiLayout(canvas, state, controls);
  if (!l.w || !l.h) return l; // a zero-size canvas (background tab before layout): nothing to place yet
  const messLimit = settings.messLimit ?? settings.floorCap;
  const point = (x, y) => ({ x: x / l.w, y: y / l.h });
  const text = (id, value, x, y, opts = {}) => hud.text(`ui-${id}`, value, {
    ...point(x, y), css: true, size: 16, color: INK, shadow: false, font: BODY, weight: 400, ...opts });
  const shout = (id, value, x, y, size, color, opts = {}) => {
    // display type: ink drop copy underneath, then the colour face with a fat ink outline
    text(`${id}-drop`, value, x, y + size * 0.09, { font: DISPLAY, size, color: INK, stroke: INK, strokeWidth: size * 0.2, ...opts });
    text(id, value, x, y, { font: DISPLAY, size, color, stroke: INK, strokeWidth: size * 0.2, ...opts });
  };
  const box = (id, b, fill, { lip = INK, radius = 16, line = 3, depth = 5 } = {}) => {
    hud.panel(`ui-${id}-lip`, { ...point(b.x, b.y + depth), w: b.w / l.w, h: b.h / l.h, radius, fill: lip });
    hud.panel(`ui-${id}-box`, { ...point(b.x, b.y), w: b.w / l.w, h: b.h / l.h, radius, fill, stroke: INK, lineWidth: line });
  };
  const button = (id, b, label, skin = "coral", size = 24) => {
    const [fill, lip] = SKIN[skin];
    box(id, b, fill, { lip });
    // glossy highlight strip
    hud.panel(`ui-${id}-gloss`, { ...point(b.x + 10, b.y + 6), w: (b.w - 20) / l.w, h: 6 / l.h, radius: 3, fill: "rgba(255,255,255,0.35)" });
    shout(`${id}-label`, label, b.x + b.w / 2, b.y + b.h / 2 - size * 0.42, size, CREAM, { align: "center", strokeWidth: size * 0.16 });
  };
  const iconButton = (id, b, name, skin = "grape", off = false) => {
    const [fill, lip] = SKIN[skin];
    box(id, b, fill, { lip, radius: 14 });
    hud.image(`ui-${id}-icon`, icon(name, CREAM, off), { ...point(b.x + b.w * 0.2, b.y + b.h * 0.18), w: b.w * 0.6 / l.w, h: b.h * 0.6 / l.h });
  };
  const portraitArt = (id, artW, top = 50, image = familyPortrait) => hud.image(`ui-${id}`, image, {
    ...point(l.dialog.x + l.dialog.w - artW - 22, l.dialog.y + top),
    w: artW / l.w, h: (l.dialog.h - top - 24) / l.h, alignY: "bottom",
    crop: { x: 0.16, y: 0, w: 0.66, h: 1 },
  });
  const card = (fill = CREAM) => {
    hud.panel("ui-veil", { fill: "rgba(36,27,58,0.55)", radius: 0 });
    box("card", l.dialog, fill, { radius: 24, line: 4, depth: 8 });
  };
  const small = l.dialog.w < 560;
  const family = state.experience === "family";
  const familyProgress = family ? (state.familyDay?.phase === "tidy" ? "TIDY → Cook → Eat" : "Tidy → COOK → Eat") : null;
  if ((state.roomError || state.netWaiting) && !l.portrait) {
    card();
    const x = l.dialog.x + 24, y = l.dialog.y + 24;
    shout("room-wait-title", state.roomError ? "ROOM FULL" : "TAKING A PAUSE", x, y, 28, "#7657ee");
    text("room-wait-detail", state.roomError || (state.room?.host ? "Waiting for Dad to reconnect…" : "Reconnecting to Mum's game…"), x, y + 54, { size: 16 });
    if (state.netWaiting) text("room-wait-hint", "We'll carry on when you're both back.", x, y + 82, { size: 14, color: INK_SOFT });
    if (state.netWaiting && state.room?.host) text("room-solo-hint", "Start solo begins a new round.", x, y + 110, { size: 13, color: INK_SOFT });
    if (state.netWaiting && state.room?.host) button("room-leave", l.roomLeave, "LEAVE ROOM", "sky", 20);
    button("room-continue", l.roomContinue, state.roomError ? "BACK" : state.room?.host ? "START SOLO" : "LEAVE ROOM", "mint", 22);
    return l;
  }


  /** A cream pill with a coin and the balance (the shop, the start card). */
  const coinChip = (id, x, y, coins, h = 38) => {
    const label = coins.toLocaleString("en-US"), w = 54 + label.length * 12;
    box(`${id}`, { x, y, w, h }, [CREAM, CREAM_2], { radius: h / 2, depth: 3, line: 3 });
    hud.image(`ui-${id}-coin`, icon("coins", "#ffc531"), { ...point(x + 6, y + 4), w: (h - 8) / l.w, h: (h - 8) / l.h });
    text(`${id}-n`, label, x + h + 2, y + h / 2 - 11, { size: 20, font: DISPLAY, color: INK });
    return w;
  };

  /* shop: wardrobe panel on the right, the kids trying things on in the open left side */
  if (l.shopCard) {
    const b = l.shop, w = state.wallet ?? { coins: 0, owned: [], equipped: {} };
    const kid = state.shopKid ?? "sister", slot = state.shopSlot ?? "top";
    box("shop-card", b, [CREAM, CREAM_2], { radius: 22, depth: 7, line: 4 });
    shout("shop-title", "FAMILY & OUTFITS", b.x + 18, b.y + 14, 24, "#7657ee");
    const chipW = 54 + w.coins.toLocaleString("en-US").length * 12;
    coinChip("shop-coins", b.x + b.w - 16 - chipW, b.y + 12, w.coins);
    const family = l.familyPicker, selectedVariant = state.family?.[kid] ?? "girl";
    box("family-picker", family, [CREAM, CREAM_2], { radius: 18, depth: 5, line: 3 });
    text("family-role", CHILD_ROLES[kid].toUpperCase(), family.x + family.w / 2, family.y + 12,
      { size: 19, align: "center", font: DISPLAY, color: INK });
    for (const choice of l.familyChoices) {
      const selected = choice.variant === selectedVariant;
      button(`family-${choice.variant}`, choice, `${choice.variant === "boy" ? "BOY" : "GIRL"}${selected ? " ✓" : ""}`,
        selected ? "grape" : "cream", 18);
    }
    text("family-tip", "Choose each child", family.x + family.w / 2, family.y + 90,
      { size: 12, align: "center", color: INK_SOFT });
    for (const t of l.kidTabs) {
      const on = t.kid === kid;
      box(`shop-kid-${t.kid}`, t, on ? ["#9b7bf0", "#7657ee"] : CREAM, { radius: 18, depth: on ? 4 : 2, line: 3 });
      text(`shop-kid-${t.kid}-label`, KIDS.find((k) => k.id === t.kid).name, t.x + t.w / 2, t.y + 8, { size: 15, align: "center", color: on ? CREAM : INK, font: DISPLAY });
    }
    for (const t of l.slotTabs) {
      const on = t.slot === slot;
      box(`shop-slot-${t.slot}`, t, on ? ["#4ad6a7", "#22b385"] : CREAM, { radius: 14, depth: on ? 4 : 2, line: 3 });
      hud.image(`ui-shop-slot-${t.slot}-icon`, icon(t.slot, on ? CREAM : "#7a6c95"), { ...point(t.x + t.w / 2 - 14, t.y + 4), w: 28 / l.w, h: 28 / l.h });
    }
    const pick = itemById(state.shopPick);
    for (const t of l.shopTiles) {
      const it = t.item, owned = w.owned.includes(it.id), worn = w.equipped[kid]?.[slot] === it.id, picked = pick?.id === it.id;
      box(`shop-tile-${it.id}`, t, picked ? "#fffaf1" : CREAM, { radius: 14, depth: picked ? 5 : 3, line: picked ? 4 : 2.5, lip: picked ? "#7657ee" : INK });
      const sw = Math.min(40, t.h - 44);
      hud.image(`ui-shop-tile-${it.id}-swatch`, swatchFor(it), { ...point(t.x + t.w / 2 - sw / 2, t.y + 6), w: sw / l.w, h: sw / l.h });
      text(`shop-tile-${it.id}-name`, it.name, t.x + t.w / 2, t.y + sw + 9, { size: 11, align: "center", color: INK });
      const status = worn ? "Wearing ✓" : owned ? "Owned" : `${it.price}`;
      if (!owned) hud.image(`ui-shop-tile-${it.id}-coin`, icon("coins", "#ffc531"), { ...point(t.x + t.w / 2 - 22, t.y + t.h - 21), w: 15 / l.w, h: 15 / l.h });
      text(`shop-tile-${it.id}-status`, status, t.x + t.w / 2 + (owned ? 0 : 8), t.y + t.h - 21,
        { size: 12, align: "center", font: DISPLAY, color: worn ? "#22b385" : owned ? INK_SOFT : w.coins >= it.price ? INK : "#e2452b" });
    }
    button("shop-done", l.shopDone, "DONE", "sky", 20);
    if (pick) {
      const owned = w.owned.includes(pick.id), worn = w.equipped[kid]?.[slot] === pick.id;
      const short = pick.price - w.coins;
      const [label, skin] = worn ? ["WEARING ✓", "cream"] : owned ? ["WEAR IT", "mint"]
        : short > 0 ? [`NEED ${short} MORE`, "cream"] : [`BUY · ${pick.price}`, "coral"];
      button("shop-buy", l.shopBuy, label, skin, 20);
    }
    return l;
  }

  /* scores: best per mode on the left, the latest runs on the right */
  if (l.historyCard) {
    card();
    const x = l.dialog.x + 24, y = l.dialog.y + 16, runs = state.history ?? [];
    shout("dialog-title", family ? "FAMILY DAY SCORES" : state.duoTally ? "CO-OP SCORES" : state.game === "cook" ? "KITCHEN SCORES" : "YOUR SCORES", x, y, small ? 28 : 34, "#7657ee");
    const leftW = l.dialog.w * 0.4;
    MODES.forEach((mode, i) => {
      const b = { x, y: y + 58 + i * 62, w: leftW, h: 52 }, best = state.bests?.[mode.id], color = SKIN[MODE_SKIN[mode.id]][0][1];
      box(`best-${mode.id}`, b, [CREAM, CREAM_2], { radius: 14, line: 3, depth: 4 });
      shout(`best-${mode.id}-name`, mode.name.toUpperCase(), b.x + 12, b.y + 6, 16, color, { strokeWidth: 3 });
      const plays = runs.length ? (state.historyCounts?.[mode.id] ?? 0) : 0;
      const sub = !best?.score ? "No runs yet" : family || mode.id === "easy" ? `${plays} ${plays === 1 ? "run" : "runs"}` : `Furthest round ${best.round} · ${plays} ${plays === 1 ? "run" : "runs"}`;
      text(`best-${mode.id}-sub`, sub, b.x + 12, b.y + 29, { size: 12, color: INK_SOFT });
      if (best?.score) text(`best-${mode.id}-score`, String(best.score), b.x + b.w - 12, b.y + 12, { size: 26, align: "right", color: INK, font: DISPLAY });
    });
    const rx = x + leftW + 24, rw = l.dialog.x + l.dialog.w - 24 - rx;
    text("runs-title", "RECENT RUNS", rx, y + 60, { size: 12, color: INK_SOFT, letterSpacing: 1 });
    const rows = Math.max(1, Math.min(8, Math.floor((l.back.y - (y + 84)) / 24)));
    if (!runs.length) text("runs-empty", "Play a round and it shows up here!", rx, y + 86, { size: 15, color: INK_SOFT });
    runs.slice(0, rows).forEach((run, i) => {
      const ry = y + 84 + i * 24, color = SKIN[MODE_SKIN[run.mode] ?? "mint"][0][1];
      hud.circle(`ui-run-${i}-dot`, { ...point(rx + 6, ry + 9), radius: 5, fill: color, stroke: INK, lineWidth: 2 });
      text(`run-${i}-mode`, MODES.find((m) => m.id === run.mode)?.name ?? run.mode, rx + 18, ry, { size: 14 });
      text(`run-${i}-score`, String(run.score), rx + rw * 0.58, ry - 1, { size: 17, align: "right", color: "#7657ee", font: DISPLAY });
      text(`run-${i}-round`, run.won ? "won ✓" : family ? "try again" : `round ${run.round ?? 1}`, rx + rw * 0.62, ry, { size: 13, color: run.won ? "#22b385" : INK_SOFT });
      text(`run-${i}-when`, ago(run.at), rx + rw, ry, { size: 12, align: "right", color: INK_SOFT });
    });
    button("history-back", l.back, "BACK", "sky", 26);
    return l;
  }

  /* game picker: the first screen */
  if (l.pickerCard) {
    card();
    const x = l.dialog.x + 24, y = l.dialog.y + 18;
    iconButton("arcade", l.arcadeBack, "home", "sky");
    shout("start-title", "CATCHA", x + 52, y, small ? 30 : 38, "#ff7a4d");
    text("picker-sub", "Pick a game!", x + 52 + (small ? 150 : 186), y + (small ? 8 : 12), { size: small ? 14 : 17, color: INK_SOFT });
    iconButton("music", l.music, "music", "grape", audio.music === false);
    iconButton("shop", l.pickerShop, "shop", "coral");
    iconButton("settings", l.pickerSettings, "gear", "sky");
    if (state.wallet) {
      const label = state.wallet.coins.toLocaleString("en-US");
      coinChip("start-coins", l.pickerSettings.x - 14 - (54 + label.length * 12), l.pickerSettings.y + 3, state.wallet.coins);
    }
    const info = { clean: ["TIDY UP", "Chase & tidy", "sky"], cook: ["COOKING", "Cook & serve", "coral"], family: ["FAMILY DAY", "Tidy · Cook · Eat", "mint"] };
    for (const c of l.gameCards) {
      const [title, hint, skin] = info[c.game], [fill, lip] = SKIN[skin];
      box(`game-${c.game}`, c, fill, { lip, radius: 20, depth: 6, line: 4 });
      hud.panel(`ui-game-${c.game}-gloss`, { ...point(c.x + 14, c.y + 7), w: (c.w - 28) / l.w, h: 6 / l.h, radius: 3, fill: "rgba(255,255,255,0.35)" });
      const art = { x: c.x + 12, y: c.y + 18, w: c.w - 24, h: Math.max(40, c.h - 100) };
      box(`game-${c.game}-art`, art, [CREAM, CREAM_2], { radius: 14, depth: 0, line: 3 });
      const size = Math.min(art.h - 6, art.w / 2.4);
      (state.gameArt?.[c.game] ?? []).forEach((pic, i) => hud.image(`ui-game-${c.game}-pic-${i}`, pic, {
        ...point(art.x + art.w / 2 + (i - 1) * size * 0.72 - size / 2, art.y + (art.h - size) / 2 + (i === 1 ? -3 : 5)), w: size / l.w, h: size / l.h }));
      shout(`game-${c.game}-name`, title, c.x + 16, c.y + c.h - 72, Math.min(25, (c.w - 32) / (title.length * 0.65)), CREAM, { strokeWidth: 4 });
      text(`game-${c.game}-hint`, hint, c.x + 16, c.y + c.h - 36, { size: small ? 11 : 14, color: CREAM, stroke: INK, strokeWidth: 3 });
      const best = state.gameBests?.[c.game];
      if (best) text(`game-${c.game}-best`, `Best ${best}`, c.x + c.w - 16, art.y + 8, { size: 12, align: "right", color: INK_SOFT });
    }
    return l;
  }

  /* start screen: the chosen game's modes */
  if (l.startCard) {
    card();
    const cooking = state.game === "cook";
    const x = l.dialog.x + 24, y = l.dialog.y + 18;
    iconButton("games", l.gamesBack, "home", "sky");
    shout("start-title", family ? "FAMILY DAY" : cooking ? "COOKING" : "TIDY UP", x + 52, y, family ? 30 : small ? 30 : 38, "#ff7a4d");
    if (state.room) {
      // online two-player: the room code to read out, who's here, the invite
      const r = l.roomPanel, room = state.room;
      box("room", r, [CREAM, CREAM_2], { radius: 16, depth: 3 });
      text("room-title", room.host ? "PLAY TOGETHER · YOU'RE MUM" : "PLAY TOGETHER · YOU'RE DAD", r.x + 14, r.y + 12, { size: 12, color: INK_SOFT, letterSpacing: 1 });
      const gap = l.roomTeam.y - r.y; // short panels (small phones) shrink the code so the status line clears TEAM/RACE
      shout("room-code", room.code, r.x + 14, r.y + 30, Math.min(42, gap - 56), "#7657ee", { letterSpacing: 6 });
      // once both are in, the line says what the chosen scoring means; either parent can change it, both screens show it
      const status = room.peer ? `${room.host ? "Dad" : "Mum"}'s here · ${state.race ? "you each score alone" : "one shared score"}`
        : room.host ? "Waiting for Dad: send the invite" : "Joining Mum's game…";
      text("room-status", status, r.x + 14, l.roomTeam.y - (gap < 96 ? 16 : 20), { size: gap < 96 ? 12 : 15, color: room.peer ? "#22b385" : INK });
      for (const [b, on, name, skin] of [[l.roomTeam, !state.race, "TEAM", "grape"], [l.roomRace, !!state.race, "RACE", "coral"]]) {
        box(`room-${b.action}`, b, on ? SKIN[skin][0] : CREAM, { lip: on ? SKIN[skin][1] : INK, radius: 12, depth: on ? 4 : 2 });
        text(`room-${b.action}-label`, on ? `✓ ${name}` : name, b.x + b.w / 2, b.y + 7, { size: 16, align: "center", font: DISPLAY,
          color: on ? CREAM : INK_SOFT, stroke: on ? INK : undefined, strokeWidth: on ? 3 : 0 });
      }
      if (room.host) button("room-invite", l.roomInvite, "INVITE", "mint", 18);
      button("room-code-entry", l.roomCode, l.roomCode.action === "leave" ? "LEAVE" : "HAVE A CODE?", l.roomCode.action === "leave" ? "coral" : "sky", 15);
    } else if (family) {
      const sx = l.modeButtons[0].x + l.modeButtons[0].w + 22, sw = l.dialog.x + l.dialog.w - 22 - sx;
      const size = Math.min(116, sw * 0.48);
      menuStickers.family.forEach((pic, i) => {
        const cx = sx + sw / 2 + (i - 1) * size * 0.72;
        hud.image(`ui-start-routine-${i}`, pic, { ...point(cx - size / 2, l.dialog.y + 112), w: size / l.w, h: size / l.h });
      });
      text("start-routine", "TIDY → COOK → EAT", sx + sw / 2, l.dialog.y + 86, { align: "center", size: small ? 14 : 17, color: INK_SOFT });
    } else portraitArt("start-family", l.dialog.w * (small ? 0.27 : 0.31), 78, endCardPortrait(state.game, state.family));
    if (!state.room) button("start-together", l.startTogether, "PLAY TOGETHER", "mint", 18);
    iconButton("music", l.music, "music", "grape", audio.music === false);
    MODES.forEach((mode, i) => {
      const b = l.modeButtons[i], selected = mode.id === state.mode;
      const [fill, lip] = SKIN[MODE_SKIN[mode.id]];
      box(`mode-${mode.id}`, b, selected ? fill : CREAM, { lip: selected ? lip : INK, radius: 14, depth: selected ? 5 : 3 });
      shout(`mode-${mode.id}-name`, mode.name.toUpperCase(), b.x + 14, b.y + 7, 19, selected ? CREAM : SKIN[MODE_SKIN[mode.id]][0][1],
        { strokeWidth: 3.5 });
      const hint = family ? `${familyDaySettings(mode.id, "clean").quota} items · ${familyDaySettings(mode.id, "cook").quota} ${mode.id === "easy" ? "dish · no rush" : "dishes · timed"}` : cooking ? COOK_HINTS[mode.id] : mode.hint;
      text(`mode-${mode.id}-hint`, hint, b.x + 14, b.y + 29, { size: small ? 11 : 13, color: selected ? CREAM : INK_SOFT });
      const best = state.bests?.[mode.id];
      if (best?.score) text(`mode-${mode.id}-best`, family || mode.id === "easy" ? `Best ${best.score}` : `Best ${best.score} · R${best.round}`,
        b.x + b.w - (selected ? 42 : 14), b.y + 9, { size: small ? 11 : 12, align: "right", color: selected ? CREAM : INK_SOFT });
      if (selected) hud.circle(`ui-mode-check`, { ...point(b.x + b.w - 22, b.y + b.h / 2), radius: 11, fill: CREAM, stroke: INK, lineWidth: 2.5 });
      if (selected) text("mode-check-mark", "✓", b.x + b.w - 22, b.y + b.h / 2 - 9, { align: "center", size: 15, color: lip });
    });
    button("play", l.play, "LET'S PLAY!", "coral", 26);
    iconButton("help", l.help, "help", "grape");
    iconButton("history", l.history, "trophy", "grape");
    iconButton("shop", l.shopButton, "shop", "coral");
    if (state.wallet) {
      const label = state.wallet.coins.toLocaleString("en-US");
      coinChip("start-coins", l.shopButton.x - 14 - (54 + label.length * 12), l.shopButton.y + 3, state.wallet.coins);
    }
    return l;
  }

  // Dinner and its result keep the actual family visible above a compact footer.
  if (l.familyMeal) {
    const b = l.mealFooter;
    box("meal-footer", b, [CREAM, CREAM_2], { radius: 18, depth: 4, line: 3 });
    text("meal-title", "DINNER TOGETHER!", b.x + 18, b.y + 9, { size: 20, font: DISPLAY, color: "#137a5a" });
    text("meal-score", `Score ${state.score}`, b.x + 18, b.y + 33, { size: 13, color: INK_SOFT });
    if (state.familyDay.phaseTime >= 0.7) button("meal-continue", l.familyContinue, "CONTINUE", "mint", 16);
    iconButton("help", l.help, "pause", "grape");
    return l;
  }
  if (l.familyResult) {
    const b = l.dialog, x = b.x + 22;
    box("family-result", b, [CREAM, CREAM_2], { radius: 20, depth: 5, line: 3 });
    text("family-result-title", state.won ? "A LOVELY FAMILY DAY!" : "ANOTHER DAY TO TRY!", x, b.y + 12, { size: 21, font: DISPLAY, color: state.won ? "#137a5a" : "#7657ee" });
    const fr = state.race && state.duoTally, raceLine = fr ? ` · Mum ${fr.mum.points} – Dad ${fr.dad.points}${fr.mum.points === fr.dad.points ? " · a tie!" : fr.mum.points > fr.dad.points ? " · Mum wins!" : " · Dad wins!"}` : "";
    text("family-result-score", `Score ${state.score}${raceLine}${state.coinsEarned ? ` · +${state.coinsEarned} coins` : ""}${state.best?.isNew ? " · New best!" : ""}`, x, b.y + 37, { size: 14, color: INK_SOFT });
    if (!state.won) text("family-result-reason", state.message, b.x + b.w - 22, b.y + 15, { size: 12, align: "right", color: INK_SOFT });
    button("family-again", l.restart, "PLAY AGAIN", "coral", 19);
    button("family-share", l.share, "SHARE", "mint", 19);
    button("family-home", l.menu, "HOME", "sky", 19);
    return l;
  }

  /* in-game HUD chips */
  const chip = (id, b) => box(id, b, [CREAM, CREAM_2], { radius: 14, line: 3, depth: 4 });
  const compact = l.w < 700;
  const cooking = state.game === "cook";
  const kitchenHud = cooking ? kitchenHudLayout(l, state.cookView?.length ?? 0) : null;
  const scoreW = cooking ? kitchenHud.score.w : compact ? 112 : 132;
  /** Compact horizontal order rail; side counters stay completely clear. */
  const orderTickets = () => {
    const thumbs = state.cookThumbs ?? {}, dim = state.cookDim ?? {}, view = state.cookView ?? [];
    if (!view.length) {
      const b = kitchenHud.waiting;
      box("order-wait", b, [CREAM, CREAM_2], { radius: 10, depth: 3, line: 2 });
      text("order-wait", "New order soon…", b.x + 12, b.y + 12, { size: 13, color: INK_SOFT });
    }
    view.slice(0, 3).forEach((o, i) => {
      const b = kitchenHud.tickets[i], id = `order-${o.id}`, small = b.w < 145;
      const urgent = o.patience !== null && o.patience < 0.3;
      const focus = state.cookGuide?.order === o.id;
      box(id, b, [CREAM, CREAM_2], { radius: 10, depth: 3, line: 2, lip: urgent ? "#e2452b" : focus ? "#22b385" : INK });
      if (focus) hud.panel(`ui-${id}-focus`, { ...point(b.x + 2, b.y + 10), w: 3 / l.w, h: 28 / l.h, radius: 2, fill: "#22b385" });
      if (thumbs[o.recipe]) hud.image(`ui-${id}-dish`, thumbs[o.recipe], { ...point(b.x + 4, b.y + 12), w: 34 / l.w, h: 34 / l.h });
      text(`${id}-name`, RECIPES[o.recipe].name, b.x + 41, b.y + 5, { size: small ? 12 : 14, color: INK });
      const r = RECIPES[o.recipe];
      const warn = settings.burnAfter && o.stage === "ready" && o.level > 0.45;
      const seconds = Math.max(1, Math.ceil((1 - o.level) * r.cookTime * (settings.cookScale ?? 1)));
      const stage = { prep: [r.prep === "bowl" ? "Mix it!" : "Chop it!", "#a96300"], cook: [`To the ${r.cook}!`, "#ab3970"],
        cooking: [`Cooking · ${seconds}s`, "#137a5a"], ready: warn ? ["Rescue it!", "#c13e22"] : ["Ready! Grab it", "#a96300"],
        burnt: ["Burnt! Bin it", INK_SOFT], serve: ["Serve it!", "#137a5a"] }[o.stage];
      if (!stage) o.needs.forEach((ing, j) => {
        const pic = (o.have[j] ? thumbs : dim)[ing];
        if (pic) hud.image(`ui-${id}-ing-${j}`, pic, { ...point(b.x + 40 + j * 23, b.y + 21), w: 22 / l.w, h: 22 / l.h });
        if (o.have[j]) text(`${id}-check-${j}`, "✓", b.x + 54 + j * 23, b.y + 32, { size: 10, color: "#137a5a", stroke: CREAM, strokeWidth: 2 });
      });
      else text(`${id}-stage`, stage[0], b.x + 41, b.y + 25, { size: small ? 10 : 12, color: stage[1] });
      if (urgent) text(`${id}-urgent`, "!", b.x + b.w - 8, b.y + 5, { size: 13, align: "right", color: "#c13e22" });
      if (o.patience !== null) {
        const bw = b.w - 48, p = Math.max(0.03, Math.round(o.patience * 50) / 50);
        hud.panel(`ui-${id}-wait-back`, { ...point(b.x + 41, b.y + b.h - 7), w: bw / l.w, h: 3 / l.h, radius: 2, fill: "rgba(36,27,58,0.15)" });
        hud.panel(`ui-${id}-wait`, { ...point(b.x + 41, b.y + b.h - 7), w: bw * p / l.w, h: 3 / l.h, radius: 2, fill: p > 0.5 ? "#22b385" : p > 0.25 ? "#ffb627" : "#e2452b" });
      }
    });
  };
  chip("score", cooking ? kitchenHud.score : { x: l.left, y: l.top, w: scoreW, h: 54 });
  const race = state.race && state.duoTally;
  text("score-label", race ? "MUM · DAD" : "SCORE", l.left + 12, l.top + 6, { size: cooking ? 9 : 11, color: INK_SOFT, letterSpacing: 1 });
  const pop = 1 + Math.max(0, state.scorePulse ?? 0) * 0.35;
  const scoreText = race ? `${race.mum.points} · ${race.dad.points}` : String(state.score);
  shout("score", scoreText, l.left + 12, l.top + (cooking ? 16 : 20) - (pop - 1) * 6,
    (race ? (scoreText.length > 11 ? 15 : 18) : state.score > 9999 ? 20 : 24) * pop, "#ff7a4d", { strokeWidth: 3.5 });
  const progX = l.left + scoreW + 10;
  if (cooking) {
    text("progress", `Served ${state.returned}/${state.quota}`, l.left + 12, l.top + 40, { size: 10, color: INK_SOFT });
    text("round", familyProgress ?? `${settings.name} · ${state.round}${settings.rounds ? "/" + settings.rounds : ""}`, l.left + 3, kitchenHud.bottom + 4,
      { size: 10, color: CREAM, stroke: INK, strokeWidth: 2 });
  } else {
    chip("progress", { x: progX, y: l.top, w: compact ? 128 : 160, h: 54 });
    text("progress", `Tidied ${state.returned}/${state.quota}`, progX + 12, l.top + 8, { size: 17 });
    text("carry", `Carry ${state.carried.length}/${carryLimit} · ${settings.timed ? "Mess" : "Floor"} ${mess}${settings.timed ? "/" + messLimit : ""}`,
      progX + 12, l.top + 31, { size: compact ? 11 : 13, color: settings.timed && mess > messLimit * 0.7 ? "#e2452b" : INK_SOFT });
    // two players: which scoring is on stays in sight all game
    text("round", (state.duoTally ? (state.race ? "Race · " : "Team · ") : "") + (familyProgress ?? `${settings.name} · Round ${state.round}${settings.rounds ? "/" + settings.rounds : ""}`), progX + 12, l.top + 62, { size: 12, color: CREAM, stroke: INK, strokeWidth: 3 });
  }
  // Mom's heart meter: returns fill it, combos fill it faster; full = the next bubble is Mom.
  const pu = state.powerups;
  if (pu && !cooking && !state.duoTally) { // (in a duo Mum is playing, so no Mom bubble)
    const mb = { x: l.left, y: l.top + 62, w: scoreW, h: 26 };
    const full = pu.momReady || pu.field?.kind === "mom" || pu.active.mom > 0;
    box("mom-meter", mb, [CREAM, CREAM_2], { radius: 13, depth: 3 });
    const tick = Math.floor((state.uiTime ?? 0) * 12) / 12; // HUD animation steps at 12 fps (each step repaints it all)
    const beat = full ? 1 + Math.abs(Math.sin(tick * 7)) * 0.15 : 1;
    hud.image("ui-mom-heart", icon("heart", "#ff5f93"), { ...point(mb.x + 7 - (beat - 1) * 9, mb.y + 4 - (beat - 1) * 9), w: 18 * beat / l.w, h: 18 * beat / l.h });
    hud.panel("ui-mom-back", { ...point(mb.x + 30, mb.y + 9), w: (mb.w - 40) / l.w, h: 8 / l.h, radius: 4, fill: "rgba(36,27,58,0.15)" });
    hud.panel("ui-mom-fill", { ...point(mb.x + 30, mb.y + 9), w: (mb.w - 40) * Math.max(0.05, full ? 1 : pu.momCharge) / l.w, h: 8 / l.h,
      radius: 4, fill: ["#ff9cc0", "#ff5f93"] });
    // nearly full: little sparkles twinkle along the bar's leading edge
    if (!full && pu.momCharge >= 0.6) {
      const edge = mb.x + 30 + (mb.w - 40) * pu.momCharge, ut = tick;
      for (let i = 0; i < 3; i++) {
        const tw = Math.sin(ut * 8 + i * 2.1);
        if (tw > 0) text(`mom-spark-${i}`, "✦", edge - 10 + i * 9, mb.y - 3 + (i % 2) * 14, { size: 8 + tw * 6, color: "#ffffff", stroke: "#ff5f93", strokeWidth: 2, alpha: tw, align: "center" });
      }
    }
  }
  const timerX = cooking ? kitchenHud.timer.x : l.help.x - 108;
  const timerW = cooking ? kitchenHud.timer.w : 98;
  chip("timer", { x: timerX, y: l.top, w: timerW, h: 54 });
  if (settings.timed) {
    const low = state.timeLeft < 12;
    shout("timer", `${Math.ceil(Math.max(0, state.timeLeft))}s`, timerX + timerW / 2, l.top + 6, 24, low ? "#ff6a4d" : "#7657ee", { align: "center", strokeWidth: 3.5 });
    hud.panel("ui-timebar-back", { ...point(timerX + 12, l.top + 40), w: (timerW - 24) / l.w, h: 7 / l.h, radius: 4, fill: "rgba(36,27,58,0.18)" });
    hud.panel("ui-timebar", { ...point(timerX + 12, l.top + 40), w: Math.round((timerW - 24) * Math.max(0.04, state.timeLeft / state.roundLength)) / l.w, h: 7 / l.h,
      radius: 4, fill: low ? "#ff6a4d" : "#22b385" });
  } else {
    text("timer", "No rush!", timerX + timerW / 2, l.top + 9, { align: "center", size: cooking ? 13 : 17 });
    text("timer-hint", "your pace", timerX + timerW / 2, l.top + 31, { align: "center", size: cooking ? 10 : 12, color: INK_SOFT });
  }
  iconButton("help", l.help, "pause", "grape");

  if (!state.helpOpen && !state.over && !l.portrait) {
    // Active power-ups: colour chip with a draining bar, stacked under the timer.
    Object.entries(state.powerups?.active ?? {}).forEach(([kind, left], i) => {
      const info = POWERUPS[kind], b = { x: timerX - 60, y: l.top + 66 + i * 50, w: 158, h: 42 };
      box(`pu-${kind}`, b, hex(info.color), { radius: 12, depth: 4 });
      text(`pu-${kind}-name`, info.label, b.x + 10, b.y + 5, { size: 14, color: CREAM, stroke: INK, strokeWidth: 3 });
      text(`pu-${kind}-left`, `${Math.ceil(left)}s`, b.x + b.w - 10, b.y + 5, { size: 14, align: "right", color: CREAM, stroke: INK, strokeWidth: 3 });
      hud.panel(`ui-pu-${kind}-back`, { ...point(b.x + 10, b.y + 27), w: (b.w - 20) / l.w, h: 7 / l.h, radius: 4, fill: "rgba(36,27,58,0.35)" });
      hud.panel(`ui-pu-${kind}-bar`, { ...point(b.x + 10, b.y + 27), w: Math.round((b.w - 20) * Math.max(0.03, left / info.duration)) / l.w, h: 7 / l.h, radius: 4, fill: CREAM });
    });
    if (cooking) {
      orderTickets();
      const g = state.showTips === false ? null : state.cookGuide;
      if (g) {
        const b = kitchenHud.guide, colors = { supply: "#86ceff", prep: "#ffd23f", cook: "#ff9a6b", hatch: "#6ce6b8", bin: "#c6b8e7", urgent: "#ff6a4d" };
        box("cook-guide", b, "rgba(36,27,58,0.94)", { radius: 14, depth: 0, line: 0 });
        const pic = state.cookThumbs?.[g.icon];
        if (pic) hud.image("ui-cook-guide-icon", pic, { ...point(b.x + 5, b.y + 6), w: 34 / l.w, h: 34 / l.h });
        text("cook-guide-title", g.title, b.x + 44, b.y + 7, { size: b.w < 320 ? 12 : 14, color: colors[g.kind] ?? CREAM });
        text("cook-guide-detail", g.detail, b.x + 44, b.y + 27, { size: 10, color: CREAM });
      }
    }
    // the floating stickers over each home spot say where things go; Easy keeps the list for little ones
    if (targets.length && state.mode === "easy") {
      const y = l.top + 98;
      chip("dest", { x: l.left, y, w: 200, h: 30 + targets.length * 22 });
      text("dest-title", "Take it home", l.left + 12, y + 6, { size: 12, color: INK_SOFT });
      targets.forEach((t, i) => {
        const color = t.kind === "toy" ? "#ff5d4a" : t.kind === "book" ? "#3a96ee" : "#5fb52e";
        hud.circle(`ui-delivery-dot-${t.kind}`, { ...point(l.left + 18, y + 35 + i * 22), radius: 6, fill: color, stroke: INK, lineWidth: 2 });
        text(`delivery-${t.kind}`, `${t.count} → ${t.where}`, l.left + 30, y + 26 + i * 22, { size: 15 });
      });
    }
    // Cooking's persistent hint replaces transfer instructions; brief toasts keep scoring/mishaps.
    const cookToast = /served|swiped|knocked|burnt|stopped|emptied|busy|Nobody|Too slow|Bye-bye/i.test(state.message ?? "");
    if (state.messageTime > 0 && state.showTips !== false && (!cooking || cookToast)) {
      const msgWidth = Math.min(480, l.w - l.left - l.right);
      const y = cooking ? kitchenHud.guide.y - 34 : l.h - l.bottom - 46;
      box("message", { x: (l.w - msgWidth) / 2, y, w: msgWidth, h: cooking ? 28 : 36 }, "rgba(36,27,58,0.88)", { radius: 18, depth: 0, line: 0 });
      text("message", state.message, l.w / 2, y + (cooking ? 6 : 9), { align: "center", size: cooking ? 12 : 15, color: CREAM });
    }
    // The big power-up / combo callout: pops in with overshoot, wobbles, then fades.
    const b = state.banner;
    if (b && b.t < b.life) {
      const t = b.t, settle = t < 0.14 ? 0.3 + (t / 0.14) * 1.05 : t < 0.3 ? 1.35 - ((t - 0.14) / 0.16) * 0.35 : 1;
      const alpha = Math.min(1, (b.life - t) / 0.35);
      const size = (b.big ? (compact ? 44 : 58) : (compact ? 30 : 38)) * settle;
      const cy = l.h * (b.big ? 0.3 : 0.36);
      shout("banner", b.text, l.w / 2, cy - size / 2, size, b.color, { align: "center", alpha, rotate: -0.05 + Math.sin(t * 9) * 0.015 * Math.max(0, 1 - t) });
      if (b.sub) text("banner-sub", b.sub, l.w / 2, cy + size * 0.62, { align: "center", size: compact ? 15 : 18, color: CREAM, stroke: INK, strokeWidth: 4, alpha });
    }
    const rb = state.roundBreak;
    if (rb) {
      // Round card: slides in with overshoot, banks the bonuses, names the next twist.
      const t = rb.t, ease = t < 0.25 ? 1 - Math.pow(1 - t / 0.25, 3) * 1.15 : 1, slide = (1 - Math.min(1, ease)) * 60;
      const w = Math.min(440, l.w - 40), h = compact ? 168 : 196, x = (l.w - w) / 2, y = (l.h - h) / 2 - 10 + slide;
      box("round-card", { x, y, w, h }, [CREAM, CREAM_2], { radius: 22, depth: 7, line: 4 });
      shout("round-card-title", rb.family ? "LET'S COOK!" : `ROUND ${rb.round}`, l.w / 2, y + 14, compact ? 40 : 50, "#7657ee", { align: "center", rotate: -0.03 });
      if (rb.family) {
        [menuStickers.clean[0], menuStickers.cook[0]].forEach((pic, i) => hud.image(`ui-round-routine-${i}`, pic, { ...point(l.w / 2 - 48 + i * 58, y + (compact ? 57 : 70)), w: 38 / l.w, h: 38 / l.h }));
        text("round-routine-check", "✓ →", l.w / 2 - 1, y + (compact ? 62 : 75), { size: 15, align: "center", color: "#137a5a" });
      } else text("round-card-twist", rb.twist ?? "Here we go!", l.w / 2, y + (compact ? 66 : 80), { align: "center", size: compact ? 18 : 22, color: "#f25f3a", font: DISPLAY });
      const lines = [[rb.family ? "Tidying done" : "Round clear", `+${rb.clear}`]];
      if (rb.timeBonus) lines.push([`Time bonus`, `+${rb.timeBonus}`]);
      lines.forEach(([label, value], i) => {
        const ly = y + (compact ? 98 : 116) + i * 22;
        text(`round-card-l${i}`, label, x + w * 0.24, ly, { size: 15, color: INK_SOFT });
        text(`round-card-v${i}`, value, x + w * 0.76, ly, { size: 16, align: "right", color: "#22b385", font: DISPLAY });
      });
      if (t > 0.7) text("round-card-skip", controls?.mobile ? "tap to go" : "Space to go", l.w / 2, y + h - 22, { align: "center", size: 11, color: INK_SOFT, letterSpacing: 1 });
    }
    // Sprint stamina (Medium/Hard): the joystick's own ring turns neon green while she sprints and
    // drains clockwise, refilling as she rests; red while she's out of puff. On a keyboard (no
    // joystick) the same ring sits around her feet.
    const staminaShown = settings.sprintTime && (state.sprinting || state.tired || (state.stamina ?? 1) < 1);
    const staminaRing = (id, cx, cy, radius, width) => {
      const s = Math.max(1, Math.round((state.stamina ?? 1) * 64)) / 64, tired = !!state.tired;
      const start = -Math.PI / 2, end = start + s * Math.PI * 2;
      hud.circle(`ui-${id}-glow`, { ...point(cx, cy), radius, arc: [start, end], stroke: tired ? "rgba(255,107,91,0.4)" : "rgba(61,255,138,0.4)", lineWidth: width + 6 });
      hud.circle(`ui-${id}`, { ...point(cx, cy), radius, arc: [start, end], stroke: tired ? "#ff6b5b" : "#3dff8a", lineWidth: width });
    };
    if (controls?.mobile) {
      // Drawn on the GPU (joystick-view.js), not here: its thumb moves every frame while she runs.
      // While stamina is in play the ring's plain stroke dims to a track and the gauge is drawn on it.
      const r = controls.radius;
      const a = controls.anchor ?? { x: controls.leftHand ? l.left + r + 10 : l.w - l.right - r - 10,
        y: l.h - l.bottom - r - 16 };
      const extent = controls.amount ? controls.extent ?? controls.amount : 0; // the thumb sits where the finger is
      if (state.showStick !== false) l.stick = { x: a.x, y: a.y, r, tx: a.x + controls.x * extent * r, ty: a.y + controls.z * extent * r,
        sprint: !!controls.sprint, staminaShown: !!staminaShown, stamina: state.stamina ?? 1, tired: !!state.tired };
    } else if (state.feetScreen && staminaShown) {
      staminaRing("stamina-feet", state.feetScreen.x * l.w, state.feetScreen.y * l.h, 30, 5);
    }
  }

  /* pause / help, end card, rotate prompt */
  if (state.helpOpen || state.over || l.portrait) {
    card();
    const x = l.dialog.x + 24, y = l.dialog.y + 16;
    if (l.portrait) {
      shout("dialog-title", "TURN YOUR SCREEN", x, y, 30, "#ff7a4d");
      text("dialog-line-0", cooking ? "Play sideways to see the whole kitchen." : "Play sideways to see the whole room.", x, y + 56, { size: 16 });
      text("dialog-line-1", "Your round waits while you rotate.", x, y + 80, { size: 16, color: INK_SOFT });
    } else if (l.graphicsCard) {
      shout("dialog-title", "SETTINGS", l.dialog.x + l.dialog.w / 2, y - 4, 30, "#7657ee", { align: "center" });
      l.graphicsChoices.forEach((t) => {
        const selected = t.mode.id === state.graphics?.mode;
        box(`quality-${t.mode.id}`, t, selected ? SKIN.sky[0] : [CREAM, CREAM_2], { radius: 14, depth: 5 });
        text(`quality-${t.mode.id}-name`, t.mode.name.toUpperCase(), t.x + 14, t.y + 8, { size: 17, font: DISPLAY });
        text(`quality-${t.mode.id}-0`, t.mode.lines.join(" · "), t.x + 14, t.y + 31, { size: small ? 10 : 12, color: selected ? INK : INK_SOFT });
        if (selected) text(`quality-${t.mode.id}-check`, "✓", t.x + t.w - 20, t.y + 8, { size: 20, align: "center" });
      });
      l.settingToggles.forEach((t) => {
        // [name, value, on?]: joystick and tips free up screen; buzz is vibration; hand moves the joystick side
        const [name, value, on] = {
          stick: ["JOYSTICK", state.showStick !== false ? "Shown" : "Hidden", state.showStick !== false],
          tips: ["TIPS", state.showTips !== false ? "Shown" : "Hidden", state.showTips !== false],
          haptics: ["BUZZ", audio.haptics === false ? "Off" : "On", audio.haptics !== false],
          hand: ["HAND", controls?.leftHand ? "Left" : "Right", true],
          season: ["SEASONAL", state.seasonPref === false ? "Off" : SEASONS.find((x) => x.id === state.seasons?.[0])?.name ?? "On", state.seasonPref !== false],
        }[t.id];
        box(`setting-${t.id}`, t, on ? SKIN.mint[0] : "#efe4d4", { radius: 14, depth: 5, lip: on ? SKIN.mint[1] : INK });
        text(`setting-${t.id}-name`, name, t.x + t.w / 2, t.y + 8, { size: t.w < 110 ? 14 : 16, align: "center", font: DISPLAY, color: on ? CREAM : INK_SOFT, stroke: on ? INK : undefined, strokeWidth: on ? 3 : 0 });
        text(`setting-${t.id}-state`, value, t.x + t.w / 2, t.y + 32, { size: 13, align: "center", color: on ? CREAM : INK_SOFT, stroke: on ? INK : undefined, strokeWidth: on ? 2.5 : 0 });
      });
      button("dialog-action", l.graphicsBack, "BACK", "mint", 26);
      // Build stamp, top-right corner of Settings: the commit running on this device and whether it is the newest deploy.
      if (version) {
        const status = { latest: "✓ latest", update: "update ready · reopen app", offline: "offline copy", checking: "checking…", dev: "local build" }[version.status] ?? "";
        const right = l.dialog.x + l.dialog.w - 18;
        text("build", `v ${version.commit}${version.date ? " · " + version.date : ""}`, right, l.dialog.y + 14, { size: 11, align: "right", color: INK_SOFT });
        const speed = version.fps ? ` · ${version.fps} fps @${Number(version.res.toFixed(2))}x` : "";
        text("build-status", status + speed, right, l.dialog.y + 29, { size: 10, align: "right", color: version.status === "update" ? "#e2452b" : version.status === "latest" ? "#22b385" : INK_SOFT });
      }
    } else if (state.helpOpen) {
      shout("dialog-title", state.startOpen ? "HOW TO PLAY" : "PAUSED", l.dialog.x + l.dialog.w / 2, y, small ? 34 : 40, "#ff7a4d", { align: "center" });
      const third = (l.dialog.w - 48) / 3;
      (cooking ? [["#3a96ee", "Fridge, pantry, veg"], ["#ffb627", "Bowl & board: stand still"], ["#ff7a4d", "Cook it, then serve it!"]]
        : [["#ff5d4a", "Toys → red bin"], ["#3a96ee", "Books → blue shelf"], ["#5fb52e", "Socks → hamper"]]).forEach(([fill, label], i) => {
        hud.circle(`ui-howto-dot-${i}`, { ...point(x + i * third + 7, y + 64), radius: 6, fill, stroke: INK, lineWidth: 2 });
        text(`howto-${i}`, label, x + i * third + 19, y + 55, { size: small ? 12 : 14 });
      });
      text("howto-keys", controls?.mobile ? `Drag to run · edge to sprint · tap to jump${cooking ? " · walk into the circles" : " · bubbles = power-ups!"}`
        : `WASD run · Shift sprint · Space jump · M music${cooking ? " · walk into the circles" : " · bubbles = power-ups!"}`, x, y + 77, { size: small ? 11 : 13, color: INK_SOFT });
      const tileInfo = {
        menu: ["home", "Home", false, "#f25f3a"],
        music: ["music", audio.music === false ? "Music off" : "Music", audio.music === false, "#7657ee"],
        sfx: ["sound", audio.sfx === false ? "Sounds off" : "Sounds", audio.sfx === false, "#3a96ee"],
        settings: ["gear", "Settings", false, "#7657ee"],
        restart: ["refresh", family ? "New day" : cooking ? "New kitchen" : "New room", false, "#22b385"],
      };
      l.tiles.forEach((t) => {
        const [name, label, off, tint, mirror] = tileInfo[t.action];
        box(`tile-${t.action}`, t, off ? "#efe4d4" : [CREAM, CREAM_2], { radius: 14, depth: 5 });
        hud.image(`ui-tile-${t.action}-icon`, icon(name, off ? "#b9ab98" : tint, off, mirror), { ...point(t.x + t.w / 2 - 19, t.y + 7), w: 38 / l.w, h: 38 / l.h });
        text(`tile-${t.action}-label`, label, t.x + t.w / 2, t.y + 50, { size: t.w < 84 ? 12 : 14, align: "center", color: off ? INK_SOFT : INK });
      });
      // two-player help in the gap under the tiles: how the team works, what Race adds; solo players learn the room exists
      const together = state.duoTally || state.room;
      const duoHelp = !together ? ["Two phones? Tap PLAY TOGETHER on the game's start screen,", "then send Dad the room code or the invite link."]
        : [state.race ? "RACE: same team game, but each parent also scores alone." : family ? "TOGETHER: tidy as a team, cook as a team, then all four eat!" : cooking ? "TOGETHER: Mum and Dad each carry a dish; the kids wait at the table."
          : "TOGETHER: one shared score and combo. Keep the kids calm for Peace & quiet!",
          state.race ? "Most points wins · the combo and bubbles are still shared." : "Either of you can pick TEAM or RACE · LEAVE ends the room."];
      const duoY = l.dialog.y + 204, duoRows = l.resume.y - duoY >= 40 ? 2 : 1; // short phones keep the headline only
      duoHelp.slice(0, duoRows).forEach((line, i) => text(`howto-duo-${i}`, line, l.dialog.x + l.dialog.w / 2, duoY + i * 18,
        { size: small ? 11 : 13, align: "center", color: i ? INK_SOFT : INK }));
      button("dialog-action", l.resume, state.startOpen ? "BACK" : "CONTINUE", "mint", 26);
    } else {
      const artW = l.dialog.w * (small ? 0.42 : 0.47);
      portraitArt("family-portrait", artW, 20, endCardPortrait(state.game, state.family));
      const duo = state.duoTally, race = state.race && duo;
      const winner = race && (duo.mum.points === duo.dad.points ? "IT'S A TIE!" : duo.mum.points > duo.dad.points ? "MUM WINS!" : "DAD WINS!");
      if (winner) shout("dialog-title", winner, x, y, small ? 28 : 36, "#ff5f93");
      else shout("dialog-title", cooking ? (state.won ? (duo ? "MASTER CHEFS!" : "MASTER CHEF!") : "KITCHEN CHAOS!") : duo ? (state.won ? "TEAM TIDY!" : "FAMILY CHAOS!") : state.won ? "SUPER HELPER!" : "SIBLING CHAOS!", x, y, small ? 28 : 36, state.won ? "#22b385" : "#ff7a4d");
      const reason = state.message === "The room is buried in mess!" && small ? ["The room is buried", "in mess!"] : [state.message];
      reason.forEach((line, i) => text(`end-reason-${i}`, line, x, y + 52 + i * 18, { size: small ? 13 : 16 }));
      const best = state.best ?? { score: 0, isNew: false };
      text("end-score-label", race ? "THE RACE · MUM – DAD" : best.isNew || !best.score ? "FINAL SCORE" : `FINAL SCORE · BEST ${best.score}`, x, y + 96,
        { size: 12, color: INK_SOFT, letterSpacing: 1 });
      // NEW BEST is a sticker stamped on the score: just past the last digit (Luckiest Guy digits are
      // ~0.66em wide), raised to the score's cap line and tilted.
      const scoreSize = small ? 34 : 44;
      if (!race && (best.isNew || best.isNewRound)) shout("end-new-best", best.isNew ? "NEW BEST!" : "BEST ROUND!", x + String(state.score).length * scoreSize * 0.66 + 12, y + 106,
        small ? 15 : 19, "#ff5f93", { rotate: -0.14, strokeWidth: 3.5 });
      shout("end-score", race ? `${duo.mum.points} – ${duo.dad.points}` : String(state.score), x, y + 114, small ? 34 : 44, "#7657ee");
      const reached = best.isNewRound ? `Reached round ${state.round}, your furthest yet!` : `Reached round ${state.round}${best.round > state.round ? ` · best round ${best.round}` : ""}`;
      if (state.coinsEarned) {
        const cy = y + (small ? 178 : 194);
        hud.image("ui-end-coin", icon("coins", "#ffc531"), { ...point(x, cy - 2), w: 22 / l.w, h: 22 / l.h });
        text("end-coins", `+${state.coinsEarned} coins for the shop`, x + 28, cy, { size: small ? 13 : 15, font: DISPLAY, color: "#c98a00" });
      }
      // a duo's caption is the friendly rivalry: who put the most away
      const caption = race ? `Team score ${state.score}${duo.quiet ? ` · Peace & quiet x${duo.quiet}` : ""}`
        : duo ? `Mum ${duo.mum.returned} · Dad ${duo.dad.returned}${duo.quiet ? ` · Peace & quiet x${duo.quiet}` : ""}`
        : state.won ? (cooking ? "Little chef. Big smiles!" : "Little helper. Big smiles!") : reached;
      text("end-caption", caption, x, y + (small ? 158 : 170),
        { size: small ? 12 : 15, color: best.isNewRound ? "#e0559a" : INK_SOFT });
      const label = small ? 16 : 20;
      button("dialog-action", l.restart, "AGAIN", "coral", label);
      button("share", l.share, "SHARE", "mint", label);
      button("modes", l.menu, "MODES", "sky", label);
    }
  }
  return l;
}

/** Cosmetic family choices, independent of the coin wallet and gameplay settings. */
const KEY = "cuc-family-v1";
export const CHILD_ROLES = { sister: "Big kid", baby: "Little kid" };
export const CHILD_VARIANTS = ["girl", "boy"];
export const validChildVariant = (value) => CHILD_VARIANTS.includes(value);
export const portraitVariant = (game, family) => family?.[game === "cook" ? "sister" : "baby"] === "boy" ? "boy" : "girl";
export function normalizeFamily(saved) {
  return Object.fromEntries(Object.keys(CHILD_ROLES).map((role) => [role,
    validChildVariant(saved?.[role]) ? saved[role] : "girl"]));
}
export function loadFamily() {
  try { return normalizeFamily(JSON.parse(localStorage.getItem(KEY))); }
  catch { return normalizeFamily(); }
}
export function saveFamily(family) {
  try { localStorage.setItem(KEY, JSON.stringify(normalizeFamily(family))); } catch { /* private mode */ }
}

/** A connected routine; standalone rules and gameplay RNG stay outside this controller. */
import { roundSettings } from "./game-modes.js";
import { cookRound } from "./cooking.js";

const TARGETS = { easy: [4, 1], medium: [6, 2], hard: [8, 3] };
const positiveTime = n => Number.isFinite(n) ? Math.max(0, n) : 0;
export function familyDaySettings(mode, activity) {
  const base = roundSettings(mode, 1), id = base.id;
  const settings = activity === "cook" ? { ...base, ...cookRound(id, 1), messLimit: null, floorCap: null } : base;
  return { ...settings, quota: TARGETS[id][activity === "cook" ? 1 : 0], rounds: 1, twist: null };
}
export function createFamilyDay(mode, seed) {
  return { mode: roundSettings(mode, 1).id, seed: seed >>> 0, phase: "tidy", phaseTime: 0, seatedTime: 0, completed: [], claimed: false };
}
export const kitchenSeed = day => (day.seed ^ 0x9e3779b9) >>> 0;
export function finishActivity(day, activity, timeLeft) {
  if (day.phase !== (activity === "clean" ? "tidy" : activity === "cook" ? "cook" : "invalid")) return null;
  day.completed.push(activity);
  day.phase = activity === "clean" ? "transition" : "meal";
  day.phaseTime = day.seatedTime = 0;
  return 250 + (familyDaySettings(day.mode, activity).timed ? Math.ceil(positiveTime(timeLeft)) * 10 : 0);
}
export function beginKitchen(day) {
  if (day.phase !== "transition") return false;
  day.phase = "cook"; day.phaseTime = 0;
  return true;
}
export function stepDay(day, dt, { paused = false, mealReady = false } = {}) {
  if (paused || !["transition", "meal"].includes(day.phase)) return null;
  const step = positiveTime(dt);
  day.phaseTime += step;
  if (day.phase === "transition") return day.phaseTime >= 2.8 ? "kitchen" : null;
  if (mealReady) day.seatedTime += step;
  if (day.seatedTime < 4 && day.phaseTime < 25) return null;
  day.phase = "complete";
  return "complete";
}
export function skipDay(day) {
  if (day.phaseTime < 0.7) return null;
  if (day.phase === "transition") return "kitchen";
  if (day.phase !== "meal") return null;
  day.phase = "complete";
  return "complete";
}
export function failDay(day) {
  if (!["tidy", "cook"].includes(day.phase)) return false;
  day.phase = "failed";
  return true;
}
export function claimDayResult(day) {
  if (day.claimed || !["complete", "failed"].includes(day.phase)) return false;
  day.claimed = true;
  return true;
}

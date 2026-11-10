/**
 * Subtle haptics, so taps and returns feel physical. One named pattern per moment; the light ones
 * are throttled so a burst of events never becomes a buzz. Off switch in the pause card (phones),
 * remembered on this device. Cosmetic only: never reads or writes game state.
 */
import { WebHaptics } from "./web-haptics.js";

const engine = new WebHaptics();
const KEY = "cuc-haptics-off";
let off = (() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } })();
let last = -1e9;

const P = {
  tick: [{ duration: 8, intensity: 0.3 }], // menu taps, picking up an item
  bump: [{ duration: 14, intensity: 0.45 }], // furniture, sprint burst
  land: [{ duration: 22, intensity: 0.7 }], // an item drops into its station
  combo: [{ duration: 18, intensity: 0.6 }, { delay: 50, duration: 26, intensity: 0.9 }],
  boop: [{ duration: 12, intensity: 0.5 }, { delay: 60, duration: 12, intensity: 0.35 }], // the toddler
  power: [{ duration: 20, intensity: 0.5 }, { delay: 50, duration: 20, intensity: 0.75 }, { delay: 50, duration: 30, intensity: 1 }],
  celebrate: [{ duration: 30, intensity: 0.6 }, { delay: 70, duration: 30, intensity: 0.8 }, { delay: 70, duration: 60, intensity: 1 }],
  sad: [{ duration: 40, intensity: 0.7 }, { delay: 120, duration: 60, intensity: 0.4 }],
};
const LIGHT = new Set(["tick", "bump"]);
const RANK = ["tick", "bump", "land", "boop", "combo", "sad", "power", "celebrate"];

/**
 * iPhone has no Vibration API: web-haptics plays the system tap by toggling a hidden switch, and
 * iOS only allows that inside a real user activation. Touch pointerdown and animation frames are
 * not one, so on iOS the strongest recent request waits for the finger to lift (pointerup is an
 * activation) and plays then. Menu taps therefore buzz; moments while the thumb stays down cannot.
 */
const IOS_WAIT = !WebHaptics.isSupported;
let pending = null, pendingAt = 0;
if (IOS_WAIT) addEventListener("pointerup", () => {
  if (pending && performance.now() - pendingAt < 350) engine.trigger(P[pending]).catch(() => {});
  pending = null;
}, { capture: true });

export function haptic(name) {
  if (off || !P[name]) return;
  const now = performance.now();
  if (IOS_WAIT) {
    if (!pending || now - pendingAt > 350 || RANK.indexOf(name) >= RANK.indexOf(pending)) pending = name;
    pendingAt = now;
    return;
  }
  if (LIGHT.has(name) && now - last < 70) return;
  last = now;
  engine.trigger(P[name]).catch(() => {});
}

export function isHapticsOff() { return off; }

export function setHapticsOff(value) {
  off = !!value;
  try { localStorage.setItem(KEY, off ? "1" : "0"); } catch { /* private mode */ }
  if (!off) haptic("tick"); // on iOS this plays as the finger lifts off the Buzz tile
  return off;
}

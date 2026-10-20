/**
 * Anonymous game events, batched and sent to our own endpoint (functions/api/events.js → D1).
 * No library, no cookies, nothing stored on the device: the session id is random per page load.
 *
 *   track("game_over", { mode: "hard", round: 5, score: 4200, v: "won" });
 *
 * Off in local/Genex builds (BUILD.commit "dev") and when the browser asks not to be tracked.
 * Cosmetic to the game: never reads or writes game state, never touches the sim's rng.
 */
import { BUILD } from "./build-info.js";

const enabled = BUILD.commit !== "dev" && navigator.doNotTrack !== "1" && !navigator.globalPrivacyControl
  && typeof navigator.sendBeacon === "function";
const session = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");
const queue = [];

// Google Analytics 4 Measurement ID ("G-XXXXXXXXXX") from analytics.google.com → Admin → Data streams.
// Empty = GA off; our own /api/events pings above keep working either way.
const GA_ID = "G-0MRX3ZTR44";
if (enabled && GA_ID) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  gtag("js", new Date());
  // Kids' game: no ad personalization or Google signals, no cookies on the device.
  gtag("config", GA_ID, { allow_google_signals: false, allow_ad_personalization_signals: false, client_storage: "none" });
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
}

function flush() {
  if (!enabled || !queue.length) return;
  const events = queue.splice(0, 50);
  navigator.sendBeacon("/api/events", JSON.stringify({ s: session, b: BUILD.commit, events }));
}

export function track(e, data = {}) {
  if (!enabled) return;
  queue.push({ e, ...data });
  if (GA_ID) gtag("event", e, data);
  if (e === "game_over" || e === "share" || queue.length >= 20) flush(); // the moments that matter go now
}

if (enabled) {
  addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
  const installed = matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches || navigator.standalone === true;
  track("session_start", { v: installed ? "app" : "web" });
}

/**
 * Online two-player plumbing (NOTES "Two-player mode", step 2). A room is a 4-letter code; the relay
 * (workers/rooms, reached at /api/room/CODE) passes messages between the two devices in it.
 * `?net=tab` swaps the relay for a BroadcastChannel, so two tabs of one browser can play with no
 * server (local tests).
 *
 * The host runs the game; the guest steers Dad locally and mirrors everything else from the host's
 * snapshots, drawn a little in the past so it can smooth between them.
 */

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O: easy to read out loud

export function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => LETTERS[b % LETTERS.length]).join("");
}
/** "abcd " → "ABCD"; anything else → null. */
export function validCode(text) {
  const code = String(text ?? "").trim().toUpperCase();
  return /^[A-Z]{4}$/.test(code) ? code : null;
}

/** Free public STUN servers: enough for most home Wi-Fi and many mobile networks (no TURN relay). */
const ICE_SERVERS = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];
/**
 * When two phones can't reach each other directly (some mobile networks), game traffic goes through
 * the relay instead. On Cloudflare's free plan that only uses the daily allowance (nothing is
 * billed); set false to keep the relay to handshakes only and let those games fail to connect.
 */
export const RELAY_FALLBACK = true;
const FAST = new Set(["snap", "dad"]); // fine to lose one now and then: the next is a moment behind

/**
 * Joins room `code`. The relay introduces the two devices; then they talk directly over WebRTC
 * (`fast`: unordered, no resends, for snapshots and poses; `sure`: reliable, for everything else).
 * `onMessage(msg)` gets the other device's messages; `onStatus(s)` gets "open" | "peer" (the other
 * device is here) | "direct" (talking phone to phone) | "relay" (direct failed) | "left" | "full" | "lost".
 */
export function openRoom(code, { host = false, tab = false, onMessage, onStatus }) {
  let closed = false, peer = false, relay, close, pc = null, fast = null, sure = null;
  const pending = [];
  const session = crypto.randomUUID();
  const send = (m) => {
    if (closed) return;
    m = { ...m, session };
    const channel = FAST.has(m.t) ? fast : sure;
    if (channel?.readyState === "open") channel.send(JSON.stringify(m));
    else if (RELAY_FALLBACK || m.t === "hi" || m.t === "rtc" || m.t === "bye") relay(m);
  };
  const dropDirect = () => { pc?.close(); pc = fast = sure = null; pending.length = 0; };
  const isDirect = () => sure?.readyState === "open";
  const wire = (channel) => {
    channel.onmessage = (e) => { try { receive(JSON.parse(e.data)); } catch { /* not ours */ } };
    channel.onopen = () => { if (isDirect()) onStatus("direct"); };
    // the direct link itself went: carry on through the relay (main notices if the other side is really gone)
    channel.onclose = () => { if (!closed && channel === sure) { dropDirect(); onStatus("relay"); } };
  };
  function startDirect() {
    dropDirect();
    if (typeof RTCPeerConnection === "undefined") return; // no WebRTC here: the relay carries the game
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const mine = pc;
    pc.onicecandidate = (e) => { if (e.candidate) relay({ t: "rtc", ice: e.candidate }); };
    pc.onconnectionstatechange = () => { if (mine === pc && mine.connectionState === "failed") { dropDirect(); onStatus("relay"); } };
    if (host) {
      fast = pc.createDataChannel("fast", { ordered: false, maxRetransmits: 0 });
      sure = pc.createDataChannel("sure");
      wire(fast); wire(sure);
      pc.createOffer().then((o) => mine.setLocalDescription(o)).then(() => relay({ t: "rtc", sdp: mine.localDescription })).catch(() => onStatus("relay"));
    } else pc.ondatachannel = (e) => { if (e.channel.label === "fast") fast = e.channel; else sure = e.channel; wire(e.channel); };
  }
  async function onRtc(m) {
    try {
      if (m.sdp?.type === "offer") {
        startDirect();
        if (!pc) return;
        await pc.setRemoteDescription(m.sdp);
        await pc.setLocalDescription(await pc.createAnswer());
        relay({ t: "rtc", sdp: pc.localDescription });
      } else if (m.sdp) await pc?.setRemoteDescription(m.sdp);
      else if (m.ice) {
        if (pc?.remoteDescription) await pc.addIceCandidate(m.ice);
        else pending.push(m.ice);
      }
      if (pc?.remoteDescription) while (pending.length) await pc.addIceCandidate(pending.shift());
    } catch { onStatus("relay"); }
  }
  const receive = (m) => {
    if (closed || !m || typeof m.t !== "string") return;
    if (m.t === "hi") {
      // a fresh hello (or the first one) means a new page on the other side: (re)build the direct link
      if (host && !tab && (!peer || !m.back)) startDirect();
      if (!m.back) relay({ t: "hi", back: true });
      if (!peer) { peer = true; onStatus("peer"); }
    } else if (m.t === "rtc") onRtc(m);
    else if (m.t === "bye" || (m.t === "leave" && !isDirect())) {
      // "leave" is the relay losing the other side's socket: it doesn't matter while we talk directly
      dropDirect();
      if (peer) { peer = false; onStatus("left"); }
    } else onMessage(m);
  };
  if (tab) {
    const bc = new BroadcastChannel(`catcha-room-${code}`);
    bc.onmessage = (e) => receive(e.data);
    relay = (m) => { if (!closed) bc.postMessage({ ...m, session }); };
    close = () => { send({ t: "bye" }); closed = true; bc.close(); };
    queueMicrotask(() => { onStatus("open"); relay({ t: "hi" }); });
  } else {
    // The relay socket: introductions, plus game traffic if the direct link fails. It reconnects by
    // itself (a phone switching networks, an idle socket dropped), and pings so it isn't idle.
    let ws = null, joined = false, retry = 1;
    const connect = () => {
      ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/room/${code}`);
      const mine = ws;
      ws.onopen = () => {
        retry = 1; onStatus("open");
        // back after a drop while still talking directly: say so quietly, without rebuilding the link
        relay(joined && isDirect() ? { t: "hi", back: true } : { t: "hi" });
        joined = true;
      };
      ws.onmessage = (e) => { if (e.data !== "pong") try { receive(JSON.parse(e.data)); } catch { /* not ours */ } };
      ws.onclose = (e) => {
        if (closed || mine !== ws) return;
        if (e.code === 4009) {
          closed = true; clearInterval(ping); dropDirect(); onStatus("full"); return;
        }
        if (!isDirect()) onStatus("lost");
        setTimeout(() => { if (!closed && mine === ws) connect(); }, retry * 1000);
        retry = Math.min(8, retry * 2);
      };
    };
    connect();
    const ping = setInterval(() => { if (ws.readyState === 1) ws.send("ping"); }, 25000);
    relay = (m) => { if (ws.readyState === 1) ws.send(JSON.stringify({ ...m, session })); };
    close = () => { send({ t: "bye" }); relay({ t: "bye" }); closed = true; clearInterval(ping); dropDirect(); ws.close(); };
  }
  return { send, close: () => close(), get peer() { return peer; }, get direct() { return sure?.readyState === "open"; } };
}

/** Accept ordered updates within a connection, including a new page starting at sequence one.
 * Retired sessions cannot take control again through a delayed packet from an old connection. */
export function createSequenceGate() {
  let session = null, sequence = 0;
  const retired = new Set();
  return {
    get session() { return session; },
    accept(id, n) {
      if (typeof id !== "string" || !id || !Number.isSafeInteger(n) || n < 1 || retired.has(id)) return false;
      if (id !== session) {
        if (session) retired.add(session);
        session = id; sequence = 0;
      }
      if (n <= sequence) return false;
      sequence = n;
      return true;
    },
  };
}

/** Timestamped snapshots, sampled between the two around a time (render a little in the past). */
export function createBuffer(keep = 40) {
  const list = [];
  return {
    list,
    push(time, data) { list.push({ time, data }); if (list.length > keep) list.shift(); },
    sample(time) {
      if (!list.length) return null;
      if (time <= list[0].time) return { a: list[0].data, b: list[0].data, k: 0 };
      for (let i = 1; i < list.length; i++) {
        if (list[i].time < time) continue;
        const a = list[i - 1], b = list[i];
        return { a: a.data, b: b.data, k: (time - a.time) / ((b.time - a.time) || 1) };
      }
      const last = list[list.length - 1].data;
      return { a: last, b: last, k: 0 };
    },
    clear() { list.length = 0; },
  };
}

const TAU = Math.PI * 2;
/** The short way round between two angles. */
export const lerpAngle = (a, b, k) => a + ((((b - a) % TAU) + TAU * 1.5) % TAU - Math.PI) * k;
const r3 = (v) => Math.round(v * 1000) / 1000;

/** A character's whole look in 16 numbers: position, yaw/lean/tilt, squash, limbs, the "!" bubble. */
export function packPose(c) {
  const g = c.group, L = c.limbs;
  return [g.position.x, g.position.y, g.position.z, g.rotation.y, g.rotation.x, g.rotation.z, g.scale.x, g.scale.y,
    L.legs[0].rotation.x, L.legs[1].rotation.x, L.arms[0].rotation.x, L.arms[1].rotation.x, L.arms[0].rotation.z, L.arms[1].rotation.z,
    L.head.rotation.y, c.alert?.visible ? c.alert.scale.x : 0].map(r3);
}
/** Poses `c` part way (`k`) from pose `a` to pose `b`. */
export function applyPose(c, a, b, k) {
  const v = (i) => a[i] + (b[i] - a[i]) * k;
  const g = c.group, L = c.limbs;
  g.position.set(v(0), v(1), v(2));
  g.rotation.set(v(4), lerpAngle(a[3], b[3], k), v(5));
  g.scale.set(v(6), v(7), v(6));
  L.legs[0].rotation.x = v(8); L.legs[1].rotation.x = v(9);
  L.arms[0].rotation.x = v(10); L.arms[1].rotation.x = v(11);
  L.arms[0].rotation.z = v(12); L.arms[1].rotation.z = v(13);
  L.head.rotation.y = v(14);
  if (c.alert) { c.alert.visible = b[15] > 0; if (b[15] > 0) c.alert.scale.setScalar(b[15]); }
}

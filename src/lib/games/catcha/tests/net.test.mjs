import test from "node:test";
import assert from "node:assert/strict";
import { validCode, newCode, openRoom, createSequenceGate, createBuffer, lerpAngle, packPose, applyPose } from "../net.js";

test("room codes: four readable letters", () => {
  assert.match(newCode(), /^[A-HJ-NP-Z]{4}$/);
  assert.equal(validCode(" abcd "), "ABCD");
  assert.equal(validCode("AB1D"), null);
});

test("the buffer samples between the snapshots around a time", () => {
  const b = createBuffer();
  assert.equal(b.sample(1), null);
  b.push(1, "a"); b.push(2, "b");
  assert.deepEqual(b.sample(0.5), { a: "a", b: "a", k: 0 });
  assert.deepEqual(b.sample(1.25), { a: "a", b: "b", k: 0.25 });
  assert.deepEqual(b.sample(9), { a: "b", b: "b", k: 0 });
});

test("angles blend the short way round", () => {
  assert.ok(Math.abs(lerpAngle(3.1, -3.1, 0.5) - Math.PI) < 0.01);
  assert.equal(lerpAngle(0, 1, 0.5), 0.5);
});

test("a pose survives the trip", () => {
  const v = (x = 0, y = 0, z = 0) => ({ x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; }, setScalar(s) { this.set(s, s, s); } });
  const kid = () => ({ group: { position: v(), rotation: v(), scale: v(1, 1, 1) },
    limbs: { legs: [{ rotation: v() }, { rotation: v() }], arms: [{ rotation: v() }, { rotation: v() }], head: { rotation: v() } } });
  const from = kid();
  from.group.position.set(1.23456, 0.5, -2);
  from.limbs.arms[1].rotation.z = -1.4;
  const to = kid(), pose = packPose(from);
  applyPose(to, pose, pose, 0);
  assert.equal(to.group.position.x, 1.235);
  assert.equal(to.limbs.arms[1].rotation.z, -1.4);
});


test("a refreshed peer starts at one; retired sessions and reordered packets stay rejected", () => {
  const gate = createSequenceGate();
  assert.equal(gate.accept("page-a", 230), true);
  assert.equal(gate.accept("page-a", 229), false);
  assert.equal(gate.accept("page-b", 1), true);
  assert.equal(gate.accept("page-a", 231), false);
  assert.equal(gate.accept("page-b", 1), false);
  assert.equal(gate.accept("page-b", 2), true);
  assert.equal(gate.accept("page-c", NaN), false);
  assert.equal(gate.session, "page-b");
});

test("an accepted websocket closed as room-full stops retrying and clears its heartbeat", () => {
  const saved = Object.fromEntries(["location", "WebSocket", "setInterval", "clearInterval", "setTimeout"].map((k) => [k, globalThis[k]]));
  const sockets = [], status = []; let retries = 0, cleared = false;
  try {
    globalThis.location = { protocol: "https:", host: "example.invalid" };
    globalThis.WebSocket = class {
      readyState = 1;
      constructor() { sockets.push(this); }
      send() {}
      close() {}
    };
    globalThis.setInterval = () => 123;
    globalThis.clearInterval = (id) => { if (id === 123) cleared = true; };
    globalThis.setTimeout = () => { retries++; };
    const room = openRoom("TEST", { onMessage() {}, onStatus: (s) => status.push(s) });
    sockets[0].onopen();
    sockets[0].onclose({ code: 4009 });
    assert.deepEqual(status, ["open", "full"]);
    assert.equal(retries, 0);
    assert.equal(cleared, true);
    room.close();
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete globalThis[k]; else globalThis[k] = v; }
  }
});

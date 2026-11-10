import test from "node:test";
import assert from "node:assert/strict";
import { overlay, parentState, splitKeys, duoSettings } from "../duo.js";

test("an overlay keeps its own keys and shares the rest", () => {
  const team = { score: 10, combo: 0, carried: ["mum's toy"] };
  const dad = overlay(team, parentState());
  dad.carried.push("dad's sock");
  dad.score += 5;
  dad.combo += 1;
  dad.dashT += 0.5;
  assert.deepEqual(team.carried, ["mum's toy"]);
  assert.deepEqual(dad.carried, ["dad's sock"]);
  assert.equal(team.score, 15);
  assert.equal(team.combo, 1);
  assert.equal(dad.dashT, -0.5);
  assert.equal("dashT" in team, false);
});

test("the keyboard splits between Mum and Dad", () => {
  const { mum, dad, dadJump } = splitKeys(new Set(["KeyW", "ShiftLeft", "ArrowLeft", "ShiftRight", "Slash"]));
  assert.deepEqual([...mum].sort(), ["KeyW", "ShiftLeft", "Slash"]);
  assert.deepEqual([...dad].sort(), ["ArrowLeft", "ShiftRight"]);
  assert.equal(dadJump, true);
});

test("duo settings scale the round and switch off the Mom bubble", () => {
  const d = duoSettings({ quota: 6, messLimit: 20, floorCap: null, momRate: 0.2 });
  assert.deepEqual([d.quota, d.messLimit, d.floorCap, d.momRate], [9, 26, null, 0]);
});


test("solo, co-op and Family Day results have separate record buckets", async () => {
  const { scoreGame } = await import("../duo.js");
  assert.equal(scoreGame("clean"), "clean");
  assert.equal(scoreGame("cook"), "cook");
  assert.equal(scoreGame("clean", true), "duo-clean");
  assert.equal(scoreGame("cook", true), "duo-cook");
  assert.equal(scoreGame("cook", false, true), "family");
});

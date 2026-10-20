import test from "node:test";
import assert from "node:assert/strict";
import { activeSeasons, easterSunday } from "../seasons.js";

const on = (y, m, d, extra = "") => activeSeasons({ now: new Date(y, m - 1, d), search: extra });

test("seasons come round every year on their dates", () => {
  assert.deepEqual(on(2026, 10, 14), []);
  assert.deepEqual(on(2026, 10, 15), ["halloween"]);
  assert.deepEqual(on(2027, 10, 31), ["halloween"]);
  assert.deepEqual(on(2026, 11, 2), []);
  assert.deepEqual(on(2026, 12, 24), ["christmas"]);
  assert.deepEqual(on(2026, 12, 31), ["christmas", "newyear"], "New Year rides on top of Christmas");
  assert.deepEqual(on(2027, 1, 6), ["christmas"], "windows wrap past New Year");
  assert.deepEqual(on(2027, 1, 7), []);
  assert.deepEqual(on(2027, 2, 14), ["valentines"]);
});

test("Easter moves: Palm Sunday to Easter Monday", () => {
  assert.deepEqual([easterSunday(2026), easterSunday(2027), easterSunday(2028)].map((d) => `${d.getMonth() + 1}-${d.getDate()}`), ["4-5", "3-28", "4-16"]);
  assert.deepEqual(on(2027, 3, 21), ["easter"]);
  assert.deepEqual(on(2027, 3, 29), ["easter"]);
  assert.deepEqual(on(2027, 3, 30), []);
});

test("URL overrides for testing, and the Settings switch", () => {
  assert.deepEqual(on(2026, 6, 1, "?season=christmas"), ["christmas"]);
  assert.deepEqual(on(2026, 10, 20, "?season=off"), []);
  assert.deepEqual(on(2026, 6, 1, "?date=2026-10-31"), ["halloween"]);
  assert.deepEqual(activeSeasons({ now: new Date(2026, 9, 20), enabled: false }), []);
  assert.deepEqual(activeSeasons({ now: new Date(2026, 9, 20), search: "?season=halloween", enabled: false }), ["halloween"]);
});

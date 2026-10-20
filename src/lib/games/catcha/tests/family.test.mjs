import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFamily, portraitVariant, loadFamily, saveFamily } from "../family.js";

test("family preferences support every combination and safely restore defaults", () => {
  assert.deepEqual(normalizeFamily(), { sister: "girl", baby: "girl" });
  assert.deepEqual(normalizeFamily({ sister: "invalid", baby: "boy", extra: "girl" }), { sister: "girl", baby: "boy" });
  for (const sister of ["girl", "boy"]) for (const baby of ["girl", "boy"]) {
    const family = { sister, baby };
    assert.deepEqual(normalizeFamily(family), family);
    assert.equal(portraitVariant("cook", family), sister);
    assert.equal(portraitVariant("clean", family), baby);
  }
});

test("family choices persist separately from the wallet and tolerate unavailable storage", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const saved = new Map([["cuc-wallet-v1", '{"coins":1234}']]);
  try {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
      getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value),
    } });
    saveFamily({ sister: "boy", baby: "girl" });
    assert.deepEqual(loadFamily(), { sister: "boy", baby: "girl" });
    assert.equal(saved.get("cuc-wallet-v1"), '{"coins":1234}');
    saved.set("cuc-family-v1", "broken json");
    assert.deepEqual(loadFamily(), { sister: "girl", baby: "girl" });
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw Error("private mode"); } });
    assert.doesNotThrow(() => saveFamily({ sister: "boy", baby: "boy" }));
    assert.deepEqual(loadFamily(), { sister: "girl", baby: "girl" });
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
});

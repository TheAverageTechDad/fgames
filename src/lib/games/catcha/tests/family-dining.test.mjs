import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Render-free articulated actors: the real coordinator and route planner advance their poses.
class Pose {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
  setScalar(n) { return this.set(n, n, n); }
  clone() { return new Pose(this.x, this.y, this.z); }
  toArray() { return [this.x, this.y, this.z]; }
}
class Part {
  constructor() { this.position = new Pose(); this.rotation = new Pose(); this.scale = new Pose(1, 1, 1); this.userData = {}; }
  add(child) { child.parent = this; }
}
const key = Symbol.for("catcha-test-dining-geometry");
globalThis[key] = { Group: Part, Mesh: Part, MeshStandardMaterial: class {}, CylinderGeometry: class {}, SphereGeometry: class {} };
const source = readFileSync(new URL("../family-dining.js", import.meta.url), "utf8")
  .replace('import * as THREE from "three";', 'const THREE = globalThis[Symbol.for("catcha-test-dining-geometry")];')
  .replace('"./dining-path.js"', JSON.stringify(new URL("../dining-path.js", import.meta.url).href));
const { createFamilyDining } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
delete globalThis[key];

function theatre() {
  const person = () => ({ group: new Part(), limbs: { arms: [new Part(), new Part()], legs: [new Part(), new Part()], head: new Part() }, alert: {} });
  const table = { x: 0, z: 0, meal: "soup", mom: { x: -1.65, z: 0 }, dad: { x: 1.65, z: 0 },
    baby: { x: 0, y: 1.2, z: -1.75 }, chef: { x: 0, z: 1.75 },
    momApproach: { x: -2.65, z: 0 }, dadApproach: { x: 2.65, z: 0 }, chefApproach: { x: 0, z: 2.65 } };
  const kitchen = { obstacles: [], byId: { seat: { zx: 0, zz: -5, face: [0, 1] } },
    seat: () => ({ x: 0, y: 1.25, z: -5, yaw: Math.PI }), diningTable: () => table,
    setMeal: recipe => { table.meal = recipe; }, setFamilyPlace() {} };
  return createFamilyDining({ kitchen, mom: person(), dad: person(), toddler: person(), chef: person() });
}

for (const stage of ["to-seat", "sitting"]) {
  test(`a final meal collects the baby when Mom is ${stage} after returning them`, () => {
    const dining = theatre(); dining.serve("soup");
    let reached = false;
    for (let i = 0; i < 1500; i++) {
      dining.step(0.02);
      const p = dining.probes();
      if (p.baby === "counter" && p.mom === stage) { reached = true; break; }
    }
    assert(reached, "the normal baby break must actually reach this timing window");
    dining.beginFamilyMeal();
    for (let i = 0; i < 1200 && !dining.familyMealReady; i++) dining.step(0.02);
    assert(dining.familyMealReady, "all four family members should gather before the 25-second ceiling");
    dining.step(6);
    assert.equal(dining.probes().baby, "eating", "the final meal holds the baby at the table");
    dining.reset(); assert.equal(dining.familyMealReady, false);
  });
}

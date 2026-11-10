/** Family meal theatre. No gameplay RNG, scoring, colliders or camera changes live here. */
import * as THREE from "three";
import { diningRoute } from "./dining-path.js";

const MEAL_BREAK = 4.5;
export function createFamilyDining({ kitchen, mom, dad, toddler, chef }) {
  let phase = 0, reaction = 0, baby = "counter", remaining = 0;
  let finalMeal = false;
  const actors = [mom, dad, ...(chef ? [chef] : [])].map((person) => ({ person, stage: "away", route: [], task: null }));
  const [mother, father, chefActor] = actors;
  const metal = new THREE.MeshStandardMaterial({ color: 0xcbd4da, metalness: 0.6, roughness: 0.4 });
  const spoons = [mom, dad, toddler, ...(chef ? [chef] : [])].map((person) => {
    const spoon = new THREE.Group(); spoon.userData.tag = "dining-utensil";
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 6), metal);
    handle.rotation.x = Math.PI / 2; handle.position.set(0.08, -0.45, 0.14);
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), metal);
    bowl.scale.set(0.65, 0.18, 1); bowl.position.set(0.08, -0.45, 0.27);
    spoon.add(handle, bowl); person.limbs.arms[0].add(spoon);
    return spoon;
  });
  const rest = (person) => {
    person.group.rotation.set(0, person.group.rotation.y, 0);
    for (const limb of [...person.limbs.arms, ...person.limbs.legs, person.limbs.head]) limb.rotation.set(0, 0, 0);
  };
  function reset() {
    const wasFinal = finalMeal; finalMeal = false;
    phase = reaction = remaining = 0; baby = "counter";
    for (const a of actors) {
      a.stage = "away"; a.route = []; a.task = null;
      if (a !== chefActor) a.person.group.visible = false;
      if (a !== chefActor || wasFinal) rest(a.person);
    }
    rest(toddler); toddler.alert.visible = false;
    spoons.forEach((s) => { s.visible = false; });
    kitchen.setFamilyPlace(false); kitchen.setMeal();
  }
  const table = () => kitchen.diningTable();
  const counter = () => {
    const s = kitchen.byId.seat;
    return { x: s.zx, z: s.zz, yaw: Math.atan2(-s.face[0], -s.face[1]) };
  };
  const babyApproach = () => ({ x: table().x - 1.15, z: table().z - 1.9, yaw: Math.PI / 2 });
  function walk(a, goal, stage, done) {
    a.stage = stage;
    a.route = diningRoute(a.person.group.position, goal, kitchen.obstacles);
    // A cosmetic visitor can wait safely if a future layout has no route; never teleport through furniture.
    a.task = { type: "walk", goal, done };
  }
  function slide(a, goal, stage, done, duration = 0.4) {
    a.stage = stage;
    a.task = { type: "slide", from: a.person.group.position.clone(), goal, t: 0, duration, done };
  }
  function lift(stage, goal, done) {
    baby = stage; mother.stage = stage;
    mother.task = { type: "lift", from: toddler.group.position.clone(), goal, t: 0, duration: 0.65, done };
  }
  function carriedPosition() {
    const p = mom.group.position, yaw = mom.group.rotation.y;
    return { x: p.x - Math.cos(yaw) * 0.3 + Math.sin(yaw) * 0.5,
      y: p.y + 1.25, z: p.z + Math.sin(yaw) * 0.3 + Math.cos(yaw) * 0.5, yaw };
  }
  function sit(a, role) {
    const s = table()[role];
    slide(a, { ...s, y: 0.02 }, "sitting", () => { a.stage = "eating"; a.task = null; });
  }
  function motherSeat() {
    walk(mother, table().momApproach, "to-seat", () => sit(mother, "mom"));
  }
  function fetchBaby() {
    baby = "waiting";
    walk(mother, counter(), "fetching-baby", () => {
      mom.group.rotation.y = counter().yaw;
      lift("pickup-counter", carriedPosition, () => {
        baby = "carried";
        walk(mother, babyApproach(), "bringing-baby", () => {
          mom.group.rotation.y = babyApproach().yaw;
          lift("settling-baby", () => table().baby, () => {
            baby = "eating"; remaining = MEAL_BREAK; motherSeat();
          });
        });
      });
    });
  }
  function returnBaby() {
    slide(mother, table().momApproach, "standing", () => {
      walk(mother, babyApproach(), "collecting-baby", () => {
        mom.group.rotation.y = babyApproach().yaw;
        lift("pickup-table", carriedPosition, () => {
          baby = "carried-back";
          walk(mother, counter(), "returning-baby", () => {
            mom.group.rotation.y = counter().yaw;
            lift("settling-counter", () => kitchen.seat(), () => {
              baby = "counter"; remaining = 0; rest(toddler);
              const s = kitchen.seat(); toddler.group.rotation.y = s.yaw;
              if (finalMeal) fetchBaby(); else motherSeat();
            });
          });
        });
      });
    });
  }
  function serve(recipe) {
    kitchen.setMeal(recipe); reaction = 1.4;
    if (father.stage === "away") {
      dad.group.visible = true; dad.group.position.set(2.1, 0, 9);
      walk(father, table().dadApproach, "to-table", () => sit(father, "dad"));
    }
    if (mother.stage === "away") {
      mom.group.visible = true; mom.group.position.set(-2.1, 0, 9); fetchBaby();
    } else if (baby === "eating") remaining = MEAL_BREAK;
    else if (mother.stage === "eating" && baby === "counter") {
      baby = "waiting";
      slide(mother, table().momApproach, "standing", fetchBaby);
    }
  }
  function beginFamilyMeal() {
    if (finalMeal || !chefActor) return;
    finalMeal = true;
    kitchen.setFamilyPlace(true);
    serve(table().meal ?? "soup");
    chef.group.visible = true; chef.group.scale.setScalar(1); rest(chef);
    walk(chefActor, table().chefApproach, "to-table", () => sit(chefActor, "chef"));
  }
  /**
   * A two-player Family Day's dinner: Mum and Dad (the players) walk over from wherever they cooked,
   * the big kid moves round from the side to the fourth place, the toddler is already in the high chair.
   */
  function beginDuoMeal() {
    if (finalMeal || !chefActor) return;
    finalMeal = true;
    kitchen.setFamilyPlace(true);
    kitchen.setMeal(table().meal ?? "soup"); reaction = 1.4;
    baby = "eating"; remaining = 0;
    walk(mother, table().momApproach, "to-seat", () => sit(mother, "mom"));
    walk(father, table().dadApproach, "to-table", () => sit(father, "dad"));
    // she starts on a chair inside the table's footprint, where no route begins: slide back off it first
    slide(chefActor, { ...table().momApproach, y: 0 }, "standing", () => walk(chefActor, table().chefApproach, "to-table", () => sit(chefActor, "chef")), 0.45);
  }
  function seated(person, offset = 0) {
    const t = phase * 2.8 + offset;
    for (const leg of person.limbs.legs) leg.rotation.set(-1.4, 0, 0);
    person.limbs.arms[0].rotation.set(-1.1 - Math.max(0, Math.sin(t)) * 0.9, 0, 0.2);
    person.limbs.arms[1].rotation.set(-0.8, 0, -0.2);
    person.limbs.head.rotation.set(Math.sin(t) * 0.06, Math.sin(t * 0.5) * 0.12, reaction > 0 ? Math.sin(t * 2) * 0.07 : 0);
  }
  function step(dt) {
    // Family choices swap the baby's articulated build beneath the stable root.
    if (spoons[2].parent !== toddler.limbs.arms[0]) toddler.limbs.arms[0].add(spoons[2]);
    if (finalMeal && spoons[3].parent !== chef.limbs.arms[0]) chef.limbs.arms[0].add(spoons[3]);
    phase += dt; reaction = Math.max(0, reaction - dt);
    if (baby === "eating") remaining = Math.max(0, remaining - dt);
    for (const a of actors) {
      if (a === chefActor && !finalMeal) continue;
      const task = a.task, person = a.person, p = person.group.position;
      if (task?.type === "walk") {
        let distance = dt * 5.5;
        while (a.route.length && distance > 0) {
          const goal = a.route[0], dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz);
          if (d > 0.001) person.group.rotation.y = Math.atan2(dx, dz);
          const moved = Math.min(d, distance); distance -= moved;
          if (d > 0.001) { p.x += dx / d * moved; p.z += dz / d * moved; }
          if (d <= moved + 0.001) a.route.shift();
        }
        const swing = Math.sin(phase * 12) * 0.48;
        person.limbs.legs[0].rotation.set(swing, 0, 0); person.limbs.legs[1].rotation.set(-swing, 0, 0);
        person.limbs.arms[0].rotation.set(-swing * 0.6, 0, 0); person.limbs.arms[1].rotation.set(swing * 0.6, 0, 0);
        p.y = Math.abs(Math.sin(phase * 12)) * 0.055;
        if (!a.route.length && Math.hypot(p.x - task.goal.x, p.z - task.goal.z) < 0.05) { p.y = 0; a.task = null; task.done(); }
      } else if (task) {
        task.t = Math.min(task.duration, task.t + dt);
        const t = task.t / task.duration, eased = t * t * (3 - 2 * t);
        const goal = typeof task.goal === "function" ? task.goal() : task.goal;
        const pos = task.type === "lift" ? toddler.group.position : p;
        pos.set(task.from.x + (goal.x - task.from.x) * eased,
          task.from.y + ((goal.y ?? 0) - task.from.y) * eased + (task.type === "lift" ? Math.sin(t * Math.PI) * 0.2 : 0),
          task.from.z + (goal.z - task.from.z) * eased);
        if (goal.yaw !== undefined) (task.type === "lift" ? toddler : person).group.rotation.y = goal.yaw;
        if (task.type === "lift") for (const arm of mom.limbs.arms) arm.rotation.x = -1.3;
        if (task.t >= task.duration) { a.task = null; task.done(); }
      } else if (a.stage === "eating") seated(person, a === father ? 1.6 : 0);
    }
    // A final serve may land while Mom is still reseating after a normal baby return.
    // Finish that pose first, then stand and collect the baby instead of leaving them behind.
    if (finalMeal && baby === "counter" && mother.stage === "eating") {
      baby = "waiting";
      slide(mother, table().momApproach, "standing", fetchBaby);
    }
    if (baby === "waiting") {
      const s = kitchen.seat(); toddler.group.position.set(s.x, s.y, s.z); toddler.group.rotation.set(0, s.yaw, 0);
      seated(toddler, 2.5);
    } else if (baby === "carried" || baby === "carried-back") {
      const p = carriedPosition(); toddler.group.position.set(p.x, p.y, p.z); toddler.group.rotation.set(0, p.yaw, 0);
      for (const arm of mom.limbs.arms) arm.rotation.set(-1.4, 0, 0);
      for (const leg of toddler.limbs.legs) leg.rotation.set(-1.25, 0, 0);
      for (const arm of toddler.limbs.arms) arm.rotation.set(-0.3, 0, 0);
    } else if (baby === "eating") seated(toddler, 2.5);
    if (!finalMeal && baby === "eating" && remaining <= 0 && mother.stage === "eating") returnBaby();
    if (baby !== "counter") toddler.alert.visible = false;
    spoons[0].visible = mother.stage === "eating";
    spoons[1].visible = father.stage === "eating";
    spoons[2].visible = baby === "eating";
    if (spoons[3]) spoons[3].visible = finalMeal && chefActor.stage === "eating";
  }
  reset();
  return { reset, serve, step, beginFamilyMeal, beginDuoMeal,
    get familyMealReady() { return finalMeal && baby === "eating" && actors.every(a => a.stage === "eating"); },
    get ownsBaby() { return baby !== "counter"; },
    get babyEating() { return baby === "eating"; },
    probes: () => ({ mom: mother.stage, dad: father.stage, baby, breakRemaining: Number(remaining.toFixed(2)),
      meal: table().meal, momPosition: mom.group.position.toArray(), dadPosition: dad.group.position.toArray(),
      ...(finalMeal ? { chef: chefActor.stage, chefPosition: chef.group.position.toArray(), finalMeal: true } : {}) }) };
}

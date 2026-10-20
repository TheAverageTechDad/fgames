/** Readable, compact household appliances. Detail is batched; heat uses no extra lights. */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { batchStatic } from "./static-batch.js";

const box = (w, h, d, r = 0.06) => new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2, h / 2, d / 2));
const cylinder = (r, h, segments = 24) => new THREE.CylinderGeometry(r, r, h, segments);
function part(group, geometry, material, x, y, z, rotation = null, casts = false) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = casts;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
function rim(group, radius, tube, material, x, y, z) {
  return part(group, new THREE.TorusGeometry(radius, tube, 6, 32), material, x, y, z, [Math.PI / 2, 0, 0]);
}
function shell(radius, height, flare = 1.06) {
  return new THREE.LatheGeometry([
    new THREE.Vector2(0, 0), new THREE.Vector2(radius * 0.85, 0),
    new THREE.Vector2(radius * flare, height), new THREE.Vector2(radius * flare - 0.045, height),
    new THREE.Vector2(radius * 0.85 - 0.045, 0.045), new THREE.Vector2(0, 0.045),
  ], 32);
}
function knob(group, K, x, y, z, radius = 0.12) {
  part(group, cylinder(radius, 0.09, 16), K.hob, x, y, z, [Math.PI / 2, 0, 0]);
  part(group, box(0.025, radius * 0.8, 0.016, 0.005), K.white, x, y + radius * 0.3, z + 0.055);
}
function warmMaterial(K, color) {
  const material = new THREE.MeshBasicMaterial({ map: K.white.map, color, transparent: true, opacity: 0, depthWrite: false });
  material.userData.baked = "appliance-heat";
  return material;
}

/** One inset burner with a contrasting enamel surround, silver collar and front controls. */
export function buildHotplate(group, K, top, kind) {
  const appliance = new THREE.Group();
  appliance.userData.tag = "kitchen-hotplate";
  group.add(appliance);
  part(appliance, box(2.16, 0.13, 1.46), K.metal, 0, top + 0.065, 0, null, true);
  part(appliance, box(2.08, 0.09, 1.38), K.white, 0, top + 0.11, 0);
  part(appliance, box(1.85, 0.035, 1.17, 0.08), K.hob, 0, top + 0.17, -0.03);
  part(appliance, cylinder(0.67, 0.035, 32), K.metal, 0, top + 0.192, -0.03);
  part(appliance, cylinder(0.61, 0.04, 32), K.hob, 0, top + 0.22, -0.03);
  rim(appliance, 0.59, 0.024, K.metal, 0, top + 0.242, -0.03);
  part(appliance, box(2.12, 0.32, 0.12), K.white, 0, top - 0.13, 0.82);
  knob(appliance, K, -0.65, top - 0.12, 0.91);
  knob(appliance, K, 0.65, top - 0.12, 0.91);
  batchStatic(appliance);

  const heat = part(group, new THREE.RingGeometry(0.54, 0.64, 32), warmMaterial(K, 0xff783f), 0, top + 0.247, -0.03, [-Math.PI / 2, 0, 0]);
  heat.userData.tag = "kitchen-burner-heat";
  heat.visible = false;
  const base = top + 0.25;
  const cookware = new THREE.Group();
  cookware.userData.tag = `kitchen-${kind}-vessel`;
  group.add(cookware);
  let soup = null;
  if (kind === "pan") {
    part(cookware, shell(0.5, 0.18, 1.12), K.hob, 0, base, -0.03, null, true);
    rim(cookware, 0.55, 0.025, K.metal, 0, base + 0.18, -0.03);
    part(cookware, box(0.28, 0.07, 0.13, 0.025), K.metal, 0.62, base + 0.13, -0.03);
    part(cookware, box(0.62, 0.13, 0.2, 0.06), K.hob, 0.99, base + 0.16, -0.03, [0, -0.16, 0], true);
  } else {
    part(cookware, shell(0.5, 0.64, 1.04), K.metal, 0, base, -0.03, null, true);
    rim(cookware, 0.515, 0.028, K.metal, 0, base + 0.64, -0.03);
    for (const x of [-0.65, 0.65]) {
      part(cookware, box(0.32, 0.09, 0.18, 0.035), K.metal, x, base + 0.46, -0.03);
      part(cookware, box(0.24, 0.14, 0.26, 0.055), K.hob, x * 1.15, base + 0.46, -0.03, null, true);
    }
    soup = part(cookware, cylinder(0.46, 0.025, 32), K.white, 0, base + 0.52, -0.03);
    soup.visible = false;
  }
  batchStatic(cookware, [soup]);
  return { heat, soup, foodY: kind === "pan" ? base + 0.09 : base + 0.52, foodZ: -0.03 };
}

/** A cream enamel range: visible hob, control fascia, recessed oven cavity and broad handle. */
export function buildOven(group, K, top, depth) {
  const body = new THREE.Group();
  body.userData.tag = "kitchen-oven-body";
  group.add(body);
  // An open carcass, rather than a solid box behind the glass, lets the food and rack show.
  part(body, box(2.28, 0.16, depth - 0.1), K.white, 0, 0.15, -0.03, null, true);
  for (const x of [-1.065, 1.065]) part(body, box(0.17, 1.24, depth - 0.1), K.white, x, 0.79, -0.03, null, true);
  part(body, box(2.14, 1.18, 0.12), K.hob, 0, 0.76, -depth / 2 + 0.09, null, true);
  part(body, box(2.3, 0.28, depth - 0.1), K.white, 0, top - 0.01, -0.03, null, true);
  // Dark top and four contrasting burner rings read as a cooker from the overview camera.
  part(body, box(2.2, 0.07, 1.38), K.metal, 0, top + 0.165, -0.03);
  part(body, box(2.08, 0.045, 1.27), K.hob, 0, top + 0.22, -0.03);
  for (const x of [-0.55, 0.55]) for (const z of [-0.34, 0.31]) {
    rim(body, 0.24, 0.024, K.metal, x, top + 0.247, z);
    rim(body, 0.16, 0.016, K.metal, x, top + 0.248, z);
  }
  // Proud door frame, dark inset window and a real handle with two mounting posts.
  // Four frame strips leave an actual opening behind the glass.
  for (const [w, h, x, y] of [[2.08, 0.15, 0, 0.22], [2.08, 0.15, 0, 1.05], [0.14, 0.76, -0.97, 0.64], [0.14, 0.76, 0.97, 0.64]])
    part(body, box(w, h, 0.13, 0.025), K.white, x, y, depth / 2 + 0.025);
  for (const x of [-0.8, 0.8]) part(body, box(0.1, 0.1, 0.17, 0.025), K.metal, x, 1.0, depth / 2 + 0.15);
  part(body, box(1.78, 0.105, 0.115, 0.045), K.metal, 0, 1.0, depth / 2 + 0.245);
  for (const x of [-0.75, 0.75]) knob(body, K, x, top - 0.035, depth / 2 + 0.08, 0.1);
  part(body, box(0.5, 0.14, 0.025, 0.02), K.hob, 0, top - 0.025, depth / 2 + 0.07);
  for (const x of [-0.13, 0, 0.13]) part(body, box(0.065, 0.05, 0.01, 0.006), K.enamel, x, top - 0.025, depth / 2 + 0.09);
  part(body, box(1.76, 0.055, 1.1, 0.015), K.hob, 0, 0.4, -0.08);
  for (const z of [-0.4, -0.15, 0.1, 0.35, 0.58]) part(body, box(1.75, 0.027, 0.035, 0.01), K.metal, 0, 0.435, z);
  batchStatic(body);
  const window = part(group, new THREE.PlaneGeometry(1.78, 0.66), K.glass, 0, 0.65, depth / 2 + 0.04);
  window.userData.tag = "kitchen-oven-window";
  // Keep the warm window cue near the door: a glow on the rear wall hides under the roof
  // from the overhead play camera. This costs one quad, with no point light or extra shadow.
  const glow = part(group, new THREE.PlaneGeometry(1.78, 0.66), warmMaterial(K, 0xffa453), 0, 0.65, depth / 2 - 0.025);
  glow.userData.tag = "kitchen-oven-glow";
  glow.visible = false;
  return { glow, foodY: 0.46, foodZ: 0.08 };
}

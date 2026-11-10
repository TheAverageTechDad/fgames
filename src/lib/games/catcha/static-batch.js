import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Merge only unreferenced, opaque, direct mesh children. Parent transforms/visibility remain. */
export function batchStatic(group, keep = []) {
  const excluded = new Set(keep), buckets = new Map();
  for (const child of group.children) {
    if (!child.isMesh || child.children.length || excluded.has(child) || !child.visible ||
        Array.isArray(child.material) || child.material.transparent || child.isSkinnedMesh) continue;
    const key = `${child.material.uuid}:${child.castShadow}:${child.receiveShadow}:${child.renderOrder}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(child);
  }
  let removed = 0;
  for (const objects of buckets.values()) {
    if (objects.length < 2) continue;
    const geometries = objects.map((object) => {
      object.updateMatrix();
      const geometry = object.geometry.clone().applyMatrix4(object.matrix);
      if (!geometry.index) return geometry;
      const expanded = geometry.toNonIndexed(); geometry.dispose();
      return expanded;
    });
    // Builders may have differing attribute sets: only merge compatible geometry.
    const schema = (g) => Object.keys(g.attributes).sort().map(k => `${k}:${g.attributes[k].itemSize}`).join(",");
    if (geometries.some(g => schema(g) !== schema(geometries[0]))) { geometries.forEach(g => g.dispose()); continue; }
    const merged = mergeGeometries(geometries, false); geometries.forEach(g => g.dispose());
    if (!merged) continue;
    merged.computeBoundingSphere();
    const first = objects[0], mesh = new THREE.Mesh(merged, first.material);
    mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow; mesh.renderOrder = first.renderOrder;
    mesh.userData = { tag: group.userData.tag ?? "kitchen-detail", staticBatch: objects.length };
    for (const object of objects) group.remove(object);
    group.add(mesh); removed += objects.length - 1;
  }
  group.userData.batchedDraws = (group.userData.batchedDraws ?? 0) + removed;
  return group;
}

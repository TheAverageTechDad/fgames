/** Deterministic floor routes for cosmetic dining visitors, independent of the gameplay RNG. */
const STEP = 0.5, X0 = -10.5, Z0 = -7.5, NX = 43, NZ = 34;
export const PARENT_RADIUS = 0.42;
export function clearDiningPoint(p, obstacles) {
  return obstacles.every((o) => Math.abs(p.x - o.x) >= o.hx + PARENT_RADIUS
    || Math.abs(p.z - o.z) >= o.hz + PARENT_RADIUS);
}
export function clearDiningSegment(a, b, obstacles) {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.15));
  for (let i = 0; i <= n; i++) if (!clearDiningPoint({ x: a.x + (b.x - a.x) * i / n,
    z: a.z + (b.z - a.z) * i / n }, obstacles)) return false;
  return true;
}
export function diningRoute(start, goal, obstacles) {
  if (clearDiningSegment(start, goal, obstacles)) return [{ ...goal }];
  const points = Array.from({ length: NX * NZ }, (_, i) => ({ x: X0 + i % NX * STEP, z: Z0 + Math.floor(i / NX) * STEP }));
  const free = points.map((p) => clearDiningPoint(p, obstacles));
  const nearest = (p) => {
    let best = -1, distance = Infinity;
    points.forEach((q, i) => {
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (free[i] && d < distance && clearDiningSegment(p, q, obstacles)) { best = i; distance = d; }
    });
    return best;
  };
  const from = nearest(start), to = nearest(goal);
  if (from < 0 || to < 0) return [];
  const previous = new Int16Array(points.length).fill(-1), queue = [from];
  previous[from] = from;
  for (let head = 0; head < queue.length && previous[to] < 0; head++) {
    const i = queue[head], x = i % NX, z = Math.floor(i / NX);
    const next = [x > 0 ? i - 1 : -1, x < NX - 1 ? i + 1 : -1, z > 0 ? i - NX : -1, z < NZ - 1 ? i + NX : -1];
    for (const j of next) if (j >= 0 && free[j] && previous[j] < 0) { previous[j] = i; queue.push(j); }
  }
  if (previous[to] < 0) return [];
  const route = [];
  for (let i = to; ; i = previous[i]) { route.unshift(points[i]); if (i === from) break; }
  route.push({ ...goal });
  // Remove harmless grid bends only when the whole shortcut still clears the furniture.
  const simple = [];
  let current = start, i = 0;
  while (i < route.length) {
    let far = i;
    for (let j = i + 1; j < route.length; j++) if (clearDiningSegment(current, route[j], obstacles)) far = j;
    simple.push(route[far]); current = route[far]; i = far + 1;
  }
  return simple;
}

import { BALL_R, GRAVITY, RIM, isTwoPointer, type Vec3 } from './court';

/** A shot swipe in screen px (dy positive downward), its duration, and the viewport's shorter side. */
export type Swipe = { dx: number; dy: number; seconds: number; minSide: number };

export const S_IDEAL = 0.6, AIM_CONE = (25 * Math.PI) / 180, AIM_KEEP = 0.15, BAND_NEAR = 0.08, BAND_FAR = 0.05,
  POWER_SLOPE = 0.35, MIN_SHOT_PX = 24, LAUNCH_ANGLE = (52 * Math.PI) / 180, ENTRY_ANGLE = (45 * Math.PI) / 180, AIM_LONG = 0.06;

/** Travel as a fraction of the screen, times its speed: the same gesture means the same on every phone and frame rate. */
export function strength({ dx, dy, seconds, minSide }: Swipe) {
  const travel = Math.hypot(dx, dy) / minSide;
  return travel * (travel / Math.max(seconds, 0.05));
}

/** How hard the ball goes compared with a clean make from here: 1 inside the sweet band, never softer for a stronger swipe. */
export function power(s: number, twoPointer: boolean) {
  const r = s / S_IDEAL, band = twoPointer ? BAND_FAR : BAND_NEAR;
  if (Math.abs(r - 1) <= band) return 1;
  return Math.min(1.45, Math.max(0.55, 1 + (r - 1 - Math.sign(r - 1) * band) * POWER_SLOPE));
}

/** The velocity that drops the ball's centre onto `to`, coming down at least ENTRY_ANGLE and steep enough to pass over the near edge of the rim. */
export function launchVelocity(from: Vec3, to: Vec3): Vec3 {
  const dx = to.x - from.x, dz = to.z - from.z, flat = Math.hypot(dx, dz), d = Math.max(0.01, flat), h = to.y - from.y;
  let tan = Math.max(Math.tan(LAUNCH_ANGLE), Math.tan(ENTRY_ANGLE) + (2 * h) / d), across = 0;
  // Close in, the ball would meet the front of the ring on its way up; steepen until it clears it.
  // In the vertical plane of the shot the near ring is a point at (edge, h); the climb must stay a ball's width from it.
  const edge = Math.hypot(RIM.x - from.x, RIM.z - from.z) - RIM.radius, gap = BALL_R + RIM.tube + 0.03;
  const clears = () => {
    for (let i = 0; i <= 12; i++) {
      const x = (edge * i) / 12, y = x * tan - (GRAVITY * x * x) / (2 * across * across);
      if (Math.hypot(edge - x, h - y) < gap) return false;
    }
    return true;
  };
  for (let i = 0; i < 60; i++, tan *= 1.08) {
    across = Math.sqrt((GRAVITY * d * d) / (2 * Math.max(0.05, d * tan - h)));
    if (edge <= 0 || clears()) break;
  }
  // Straight under the rim there is no direction to go; nudge toward the hoop (-z).
  const [ux, uz] = flat > 1e-9 ? [dx / flat, dz / flat] : [0, -1];
  return { x: ux * across, y: across * tan, z: uz * across };
}

export function shotVelocity(release: Vec3, swipe: Swipe): Vec3 {
  // ponytail: assumes the camera faces the hoop squarely (screen right = +x, up = -z); project through the camera if it ever yaws.
  const toRim = Math.atan2(RIM.z - release.z, RIM.x - release.x), swiped = Math.atan2(swipe.dy, swipe.dx);
  const err = Math.atan2(Math.sin(swiped - toRim), Math.cos(swiped - toRim));
  const angle = Math.abs(err) <= AIM_CONE ? toRim + err * AIM_KEEP : swiped;
  // Aim a touch past the centre: the centre is the short end of the window that drops through.
  const reach = Math.hypot(RIM.x - release.x, RIM.z - release.z) + AIM_LONG;
  const v = launchVelocity(release, { x: release.x + Math.cos(angle) * reach, y: RIM.y, z: release.z + Math.sin(angle) * reach });
  const k = power(strength(swipe), isTwoPointer(release));
  return { x: v.x * k, y: v.y * k, z: v.z * k };
}

import { BALL_R, GRAVITY, RIM, isTwoPointer, type Vec3 } from './court';

/**
 * The aim: a drag in screen px from where the thumb held Dad (dy positive downward), toward where the ball should go;
 * its length sets the power. (It was a slingshot pull the other way until the third playtest.)
 * minSide is the viewport's shorter side; rimAngle the screen angle from Dad to the rim (atan2(dy, dx)).
 */
export type Pull = { dx: number; dy: number; minSide: number; rimAngle?: number };

// The ideal drag is a fifth of the screen from anywhere; MIN_PULL_PX or less (sliding back onto Dad) cancels the shot.
export const P_IDEAL = 0.2, MAX_PULL = 0.45, MIN_PULL_PX = 20, AIM_FULL = (20 * Math.PI) / 180, AIM_NONE = (80 * Math.PI) / 180, AIM_KEEP = 0.1, BAND_NEAR = 0.08, BAND_FAR = 0.05,
  POWER_SLOPE = 0.35, MIN_SHOT_PX = 24, LAUNCH_ANGLE = (52 * Math.PI) / 180, ENTRY_ANGLE = (45 * Math.PI) / 180, AIM_LONG = 0.06;

/** The drag as a fraction of the screen, so the same drag means the same on every phone. */
export const strength = ({ dx, dy, minSide }: Pull) => Math.min(MAX_PULL, Math.hypot(dx, dy) / minSide);

/**
 * How hard the ball goes compared with a clean make from here: 1 inside the sweet band, never softer for a longer pull.
 * `bonus` (0–1) is how clean a jump-shot release was: at the top of the jump the band is twice as wide.
 */
export function power(s: number, twoPointer: boolean, bonus = 0) {
  const r = s / P_IDEAL, band = (twoPointer ? BAND_FAR : BAND_NEAR) * (1 + bonus);
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

export function shotVelocity(release: Vec3, pull: Pull, bonus = 0): Vec3 {
  // The player aims at the rim they see. The error is measured on screen against the rim's on-screen direction,
  // then applied to the court direction. Without rimAngle, screen directions are court directions (right = +x, up = -z).
  const toRim = Math.atan2(RIM.z - release.z, RIM.x - release.x), swiped = Math.atan2(pull.dy, pull.dx);
  const seen = pull.rimAngle ?? toRim, err = Math.atan2(Math.sin(swiped - seen), Math.cos(swiped - seen));
  // Aim help: within AIM_FULL only a tenth of the error is kept; it eases out to none at AIM_NONE, so the arc never snaps.
  const t = Math.max(0, Math.min(1, (AIM_NONE - Math.abs(err)) / (AIM_NONE - AIM_FULL))), help = t * t * (3 - 2 * t);
  // A clean jump-shot release keeps even less of the error.
  const keep = AIM_KEEP * (1 - 0.7 * bonus), angle = toRim + err * (1 - (1 - keep) * help);
  // Aim a touch past the centre: the centre is the short end of the window that drops through.
  const reach = Math.hypot(RIM.x - release.x, RIM.z - release.z) + AIM_LONG;
  const v = launchVelocity(release, { x: release.x + Math.cos(angle) * reach, y: RIM.y, z: release.z + Math.sin(angle) * reach });
  const k = power(strength(pull), isTwoPointer(release), bonus);
  return { x: v.x * k, y: v.y * k, z: v.z * k };
}

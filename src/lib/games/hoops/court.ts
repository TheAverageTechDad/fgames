// Court axes: the baseline is z = 0 and the court runs toward +z, where the camera sits facing the hoop; x is across.
// Sizes are in units where Dad is 1.7 tall, scaled to the chibi characters rather than to regulation.
export type Vec3 = { x: number; y: number; z: number };

// Close to the spec's first guess (9 × 8, arc 4.5); the camera follows Dad so he stays readable on a phone.
export const DAD_HEIGHT = 1.7, GRAVITY = 9.8, BALL_R = 0.16, ARC_R = 4.2;
export const COURT = { halfWidth: 4.5, depth: 8.5 };
// A fence on the back and sides keeps loose balls within walking distance; the near side is open grass (a fence there would block the view).
export const FENCE = { side: COURT.halfWidth + 1.3, back: -1.6, front: COURT.depth + 3 };
export const RIM = { x: 0, y: 3.06, z: 1.2, radius: 0.3, tube: 0.02 };
export const BOARD = { halfWidth: 0.9, bottom: 2.9, top: 3.95, z: 0.8, halfDepth: 0.03 };
export const POLE = { x: 0, z: -0.4, radius: 0.08, top: 3.5 };
// The family watching from behind the baseline, left of the hoop (inside the fence, in view, clear of the thumb).
export const FAMILY = [
  { who: 'mom', x: -3.1, z: -1.0, radius: 0.3, height: 1.6 },
  { who: 'girl', x: -3.85, z: -0.95, radius: 0.25, height: 1.1 },
  { who: 'toddler', x: -2.45, z: -0.8, radius: 0.2, height: 0.75 }
] as const;
/** Upright things the ball bounces off and Dad walks around. */
export const POSTS = [{ kind: 'pole' as const, x: POLE.x, z: POLE.z, radius: POLE.radius, top: POLE.top }, ...FAMILY.map(f => ({ kind: 'fan' as const, x: f.x, z: f.z, radius: f.radius, top: f.height }))];

// ponytail: a plain circle for the arc, no straight corner lines; add them if corner threes matter.
export const isTwoPointer = (p: { x: number; z: number }) => Math.hypot(p.x - RIM.x, p.z - RIM.z) > ARC_R;
export const inBounds = (p: { x: number; z: number }) => Math.abs(p.x) <= COURT.halfWidth && p.z >= 0 && p.z <= COURT.depth;
/** On the asphalt (the court plus its dark border) rather than the grass around it. */
export const onAsphalt = (p: { x: number; z: number }) => Math.abs(p.x) <= COURT.halfWidth + 0.4 && p.z >= -0.6 && p.z <= COURT.depth + 0.3;

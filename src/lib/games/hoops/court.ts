// Court axes: the baseline is z = 0 and the court runs toward +z, where the camera sits facing the hoop; x is across.
// Sizes are in units where Dad is 1.7 tall, scaled to the chibi characters rather than to regulation.
export type Vec3 = { x: number; y: number; z: number };

export const DAD_HEIGHT = 1.7, GRAVITY = 9.8, BALL_R = 0.16, ARC_R = 4.5;
export const COURT = { halfWidth: 4.5, depth: 8 };
export const RIM = { x: 0, y: 3.06, z: 1.2, radius: 0.3, tube: 0.02 };
export const BOARD = { halfWidth: 0.9, bottom: 2.9, top: 3.95, z: 0.8, halfDepth: 0.03 };
export const POLE = { x: 0, z: -0.4, radius: 0.08, top: 3.5 };

// ponytail: a plain circle for the arc, no straight corner lines; add them if corner threes matter.
export const isTwoPointer = (p: { x: number; z: number }) => Math.hypot(p.x - RIM.x, p.z - RIM.z) > ARC_R;
export const inBounds = (p: { x: number; z: number }) => Math.abs(p.x) <= COURT.halfWidth && p.z >= 0 && p.z <= COURT.depth;

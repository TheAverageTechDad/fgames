// The roadster's build, in the order a mechanic would do it. Each id matches a "step:<id>" node in roadster.glb
// (scripts/roadster/export.py). Game axes, metres: x forward, y up, z out of the bike's right side (towards the camera).
export type Vec = readonly [number, number, number];
export type Step = {
  id: string;
  name: string;
  /** Where the part waits for the child before it goes on, offset from where it belongs. */
  wait: Vec;
  /** The last bit of its journey, a straight push into place from this offset. */
  entry: Vec;
  /** Camera direction for this step, degrees: azimuth from the right side towards the front, and elevation. */
  az: number;
  el: number;
};

export const STEPS: Step[] = [
  { id: 'engine', name: 'Engine', wait: [0.1, 0.62, 0.25], entry: [0, 0, 0.38], az: 20, el: 14 },
  { id: 'swingarm', name: 'Swingarm', wait: [-0.5, 0.42, 0.25], entry: [-0.28, 0, 0], az: 10, el: 12 },
  { id: 'rear-wheel', name: 'Back wheel', wait: [-0.55, 0.38, 0.3], entry: [-0.32, 0, 0], az: 0, el: 10 },
  { id: 'chain', name: 'Chain', wait: [0.05, 0.42, -0.3], entry: [0, 0, -0.16], az: 200, el: 16 },
  { id: 'forks', name: 'Front forks', wait: [0.42, 0.1, 0.3], entry: [0.13, -0.28, 0], az: 30, el: 10 },
  { id: 'front-wheel', name: 'Front wheel', wait: [0.55, 0.32, 0.3], entry: [0.3, 0, 0], az: 25, el: 10 },
  { id: 'exhaust', name: 'Exhaust', wait: [0.1, 0.48, 0.4], entry: [0, 0, 0.32], az: 18, el: 12 },
  { id: 'tank', name: 'Fuel tank', wait: [0.05, 0.42, 0.2], entry: [0, 0.26, 0], az: 22, el: 20 },
  { id: 'seat', name: 'Seat', wait: [-0.12, 0.38, 0.2], entry: [0, 0.22, 0], az: 12, el: 20 },
  { id: 'handlebars', name: 'Handlebars', wait: [-0.08, 0.3, 0.2], entry: [0, 0.22, 0], az: 28, el: 18 },
  { id: 'headlight', name: 'Headlight', wait: [0.38, 0.16, 0.3], entry: [0.22, 0, 0], az: 40, el: 12 },
  { id: 'tail-light', name: 'Tail light', wait: [-0.4, 0.14, 0.3], entry: [-0.22, 0, 0], az: -20, el: 12 },
  { id: 'footpegs', name: 'Footpegs', wait: [0.02, 0.3, 0.42], entry: [0, 0, 0.26], az: 15, el: 10 }
];

export const PAINTS = [
  { id: 'red', name: 'Cherry red', color: '#a3121e' },
  { id: 'orange', name: 'Tangerine', color: '#e0580d' },
  { id: 'yellow', name: 'Sunshine', color: '#f0b20a' },
  { id: 'green', name: 'Racing green', color: '#1f7a43' },
  { id: 'blue', name: 'Ocean blue', color: '#1b55c2' },
  { id: 'purple', name: 'Grape', color: '#6b2fae' },
  { id: 'pink', name: 'Bubblegum', color: '#e2479b' }
] as const;
export type PaintId = typeof PAINTS[number]['id'];
export const paintColor = (id: string) => (PAINTS.find(p => p.id === id) ?? PAINTS[0]).color;

/** Tachometer: 0–10,000 rpm over the dial's 270°. Speedometer: 0–200 km/h over the same sweep. */
export const IDLE_RPM = 1100, REDLINE = 9500;
export const TACH_SWEEP = (rpm: number) => Math.min(1, Math.max(0, rpm / 10000)) * (3 * Math.PI / 2);
export const SPEEDO_SWEEP = (kmh: number) => Math.min(1, Math.max(0, kmh / 200)) * (3 * Math.PI / 2);

// The roadster's build. PARTS are the 28 pieces in roadster.glb ("part_<id>" nodes, scripts/roadster/export.py), with
// what each bolts onto: a part whose mounts aren't on yet won't go on. STEPS are the 13 big steps a mechanic would
// do them in; Apprentice and Mechanic build in steps, Master part by part.
// Game axes, metres: x forward, y up, z out of the bike's right side (towards the camera).
export type Vec = readonly [number, number, number];
export type Step = {
  id: string;
  name: string;
  fact: string;
  /** Where the part waits for the child before it goes on (Apprentice), offset from where it belongs. */
  wait: Vec;
  /** The last bit of its journey, a straight push into place from this offset. */
  entry: Vec;
  /** Camera direction for this step, degrees: azimuth from the right side towards the front, and elevation. */
  az: number;
  el: number;
};

export const STEPS: Step[] = [
  { id: 'engine', name: 'Engine', fact: 'Four cylinders burn petrol to make it go.', wait: [0.1, 0.62, 0.25], entry: [0, 0, 0.38], az: 20, el: 14 },
  { id: 'swingarm', name: 'Swingarm', fact: 'It swings up and down so the back wheel rides the bumps.', wait: [-0.5, 0.42, 0.25], entry: [-0.28, 0, 0], az: 10, el: 12 },
  { id: 'rear-wheel', name: 'Back wheel', fact: 'The chain turns this wheel to push you along.', wait: [-0.55, 0.38, 0.3], entry: [-0.32, 0, 0], az: 0, el: 10 },
  { id: 'chain', name: 'Chain', fact: 'It carries the engine’s power to the back wheel.', wait: [0.05, 0.42, -0.3], entry: [0, 0, -0.16], az: 200, el: 16 },
  { id: 'forks', name: 'Front forks', fact: 'Springy legs that steer and soak up bumps.', wait: [0.42, 0.1, 0.3], entry: [0.13, -0.28, 0], az: 30, el: 10 },
  { id: 'front-wheel', name: 'Front wheel', fact: 'It steers, and does most of the stopping.', wait: [0.55, 0.32, 0.3], entry: [0.3, 0, 0], az: 25, el: 10 },
  { id: 'exhaust', name: 'Exhaust', fact: 'Takes the hot gas away from the engine. And makes the noise!', wait: [0.1, 0.48, 0.4], entry: [0, 0, 0.32], az: 18, el: 12 },
  { id: 'tank', name: 'Fuel tank', fact: 'Holds the petrol for the engine.', wait: [0.05, 0.42, 0.2], entry: [0, 0.26, 0], az: 22, el: 20 },
  { id: 'seat', name: 'Seat', fact: 'Room for a rider and a passenger.', wait: [-0.12, 0.38, 0.2], entry: [0, 0.22, 0], az: 12, el: 20 },
  { id: 'handlebars', name: 'Handlebars', fact: 'Turn them to steer. The levers are the brake and clutch.', wait: [-0.08, 0.3, 0.2], entry: [0, 0.22, 0], az: 28, el: 18 },
  { id: 'headlight', name: 'Headlight', fact: 'Lights the road at night.', wait: [0.38, 0.16, 0.3], entry: [0.22, 0, 0], az: 40, el: 12 },
  { id: 'tail-light', name: 'Tail light', fact: 'Glows red so cars can see you.', wait: [-0.4, 0.14, 0.3], entry: [-0.22, 0, 0], az: -20, el: 12 },
  { id: 'footpegs', name: 'Footpegs', fact: 'Rest your feet here. One pedal changes gear, the other brakes.', wait: [0.02, 0.3, 0.42], entry: [0, 0, 0.26], az: 15, el: 10 }
];

export type Part = { id: string; name: string; step: string; needs: string[]; fact: string };
/** In build order. `needs`: the parts it bolts onto (the frame is always there). */
export const PARTS: Part[] = [
  { id: 'crankcase', name: 'Crankcase', step: 'engine', needs: [], fact: 'Inside, the crankshaft spins round and round.' },
  { id: 'cylinders', name: 'Cylinders', step: 'engine', needs: ['crankcase'], fact: 'Four pistons pump up and down in here.' },
  { id: 'carburettors', name: 'Carburettors', step: 'engine', needs: ['cylinders'], fact: 'They mix air with petrol for the engine.' },
  { id: 'oil-cooler', name: 'Oil cooler', step: 'engine', needs: ['crankcase'], fact: 'Keeps the engine oil cool on hot days.' },
  { id: 'swingarm', name: 'Swingarm', step: 'swingarm', needs: [], fact: 'It swings up and down so the back wheel rides the bumps.' },
  { id: 'shocks', name: 'Shock absorbers', step: 'swingarm', needs: ['swingarm'], fact: 'Big springs that soak up the bumps.' },
  { id: 'rear-wheel', name: 'Back wheel', step: 'rear-wheel', needs: ['swingarm'], fact: 'The chain turns this wheel to push you along.' },
  { id: 'rear-brake', name: 'Back brake', step: 'rear-wheel', needs: ['rear-wheel'], fact: 'It squeezes the disc to slow the back wheel.' },
  { id: 'chain', name: 'Chain', step: 'chain', needs: ['rear-wheel', 'crankcase'], fact: 'It carries the engine’s power to the back wheel.' },
  { id: 'steering', name: 'Fork clamps', step: 'forks', needs: [], fact: 'They hold the forks and turn when you steer.' },
  { id: 'fork-legs', name: 'Fork legs', step: 'forks', needs: ['steering'], fact: 'Springy legs that soak up bumps.' },
  { id: 'front-wheel', name: 'Front wheel', step: 'front-wheel', needs: ['fork-legs'], fact: 'It steers, and does most of the stopping.' },
  { id: 'front-brakes', name: 'Front brakes', step: 'front-wheel', needs: ['front-wheel'], fact: 'Two brakes grip the discs to stop you quickly.' },
  { id: 'front-mudguard', name: 'Front mudguard', step: 'front-wheel', needs: ['fork-legs'], fact: 'Stops the wheel flicking mud at you.' },
  { id: 'headers', name: 'Exhaust pipes', step: 'exhaust', needs: ['cylinders'], fact: 'Four pipes, one from each cylinder.' },
  { id: 'silencers', name: 'Silencers', step: 'exhaust', needs: ['headers'], fact: 'They make the engine quieter. A little!' },
  { id: 'tank', name: 'Fuel tank', step: 'tank', needs: ['carburettors'], fact: 'Holds the petrol. It sits right over the engine.' },
  { id: 'seat', name: 'Seat', step: 'seat', needs: ['tank'], fact: 'Its front tucks under the back of the tank.' },
  { id: 'side-covers', name: 'Side covers', step: 'seat', needs: ['carburettors'], fact: 'They hide the air filter and the battery.' },
  { id: 'handlebars', name: 'Handlebars', step: 'handlebars', needs: ['steering'], fact: 'Turn them to steer.' },
  { id: 'controls', name: 'Levers and switches', step: 'handlebars', needs: ['handlebars', 'front-brakes'], fact: 'Right lever: front brake. Left lever: clutch.' },
  { id: 'mirrors', name: 'Mirrors', step: 'handlebars', needs: ['controls'], fact: 'To see what’s behind you.' },
  { id: 'headlight', name: 'Headlight', step: 'headlight', needs: ['fork-legs'], fact: 'Lights the road at night.' },
  { id: 'clocks', name: 'Dials', step: 'headlight', needs: ['steering'], fact: 'How fast you’re going, and how fast the engine spins.' },
  { id: 'rear-mudguard', name: 'Back mudguard', step: 'tail-light', needs: ['rear-wheel'], fact: 'Keeps the spray off whoever’s behind.' },
  { id: 'tail-light', name: 'Tail light', step: 'tail-light', needs: ['rear-mudguard'], fact: 'Glows red so cars can see you.' },
  { id: 'footpegs', name: 'Footpegs', step: 'footpegs', needs: [], fact: 'One pedal changes gear, the other is the back brake.' },
  { id: 'side-stand', name: 'Side stand', step: 'footpegs', needs: [], fact: 'Holds the bike up when you park it.' }
];

export const MODES = [
  { id: 'apprentice', name: 'Apprentice', blurb: 'One part at a time, with help.' },
  { id: 'mechanic', name: 'Mechanic', blurb: '13 parts. Work out where they go.' },
  { id: 'master', name: 'Master', blurb: '28 parts, no help. Zoom in close.' }
] as const;
export type ModeId = typeof MODES[number]['id'];
export const isMode = (v: unknown): v is ModeId => MODES.some(m => m.id === v);

/** One thing the child fits: a whole step (Apprentice, Mechanic) or a single part (Master). */
export type Piece = { id: string; name: string; fact: string; members: string[]; needs: string[]; step: Step };
const stepOf = (part: string) => PARTS.find(p => p.id === part)!.step;
export function piecesFor(mode: ModeId): Piece[] {
  if (mode === 'master') return PARTS.map(p => ({ id: p.id, name: p.name, fact: p.fact, members: [p.id], needs: p.needs, step: STEPS.find(s => s.id === p.step)! }));
  return STEPS.map(s => {
    const members = PARTS.filter(p => p.step === s.id);
    const needs = [...new Set(members.flatMap(m => m.needs.map(stepOf)))].filter(n => n !== s.id);
    return { id: s.id, name: s.name, fact: s.fact, members: members.map(m => m.id), needs, step: s };
  });
}

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

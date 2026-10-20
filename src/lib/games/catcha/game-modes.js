/** Pace choices are pure data; all round tuning uses the same profile in the sim and HUD. */
export const MODES = [
  { id: "easy", name: "Easy", hint: "No timer. Three little rooms.", note: "For little helpers", timed: false,
    playerSpeed: 7.5, pickupRadius: 2, dropoffRadius: 3, floorCap: 5, messLimit: null, firstDrop: 3.5, powerupEvery: 16, momRate: 0.15, sprintTime: null },
  { id: "medium", name: "Medium", hint: "Timed rounds that build up.", note: "Find your rhythm", timed: true,
    playerSpeed: 9, pickupRadius: 1.8, dropoffRadius: 2.7, floorCap: null, messLimit: 21, firstDrop: 1.8, powerupEvery: 14, momRate: 0.1, sprintTime: 9 },
  { id: "hard", name: "Hard", hint: "Fast drops. How far can you go?", note: "Sibling chaos", timed: true,
    playerSpeed: 9.5, pickupRadius: 1.6, dropoffRadius: 2.4, floorCap: null, messLimit: 16, firstDrop: 1.5, powerupEvery: 12, momRate: 0.08, sprintTime: 7 },
];

export function getMode(id) { return MODES.find((mode) => mode.id === id) ?? MODES[0]; }

/**
 * Rounds. Each Medium/Hard round adds ONE named twist (shown on the round card), then the game keeps
 * creeping gently under caps, so a good Hard run reaches round 6–8 instead of hitting a wall at 5.
 * Easy is three short untimed rounds, then a win. Twist values are absolute from that round on.
 */
const RAMPS = {
  easy: {
    base: { quota: 4, roundTime: 0, dropEvery: 9, batch: 1, speed: 2, range: 0.35, throw: 1 },
    twists: [
      ["More toys to tidy!", { quota: 6, dropEvery: 8, speed: 2.2 }],
      ["Last room. You've got this!", { quota: 8, dropEvery: 7, speed: 2.4, range: 0.45 }],
    ],
    rounds: 3,
  },
  medium: {
    base: { roundTime: 88, dropEvery: 4.1, batch: 1, speed: 3.4, range: 0.45, throw: 1 },
    twists: [
      ["She's faster!", { speed: 3.9, range: 0.55 }],
      ["Bigger toy throws!", { throw: 1.3, range: 0.62 }],
      ["Quicker throws!", { dropEvery: 3.5 }],
      ["Less time on the clock!", { roundTime: 80 }],
      ["Double throws!", { batch: 2, dropEvery: 4.6 }],
      ["Even faster!", { speed: 4.4, range: 0.7 }],
    ],
    // past the twists: a little quicker each round, never past these floors/caps
    creep: (s, k) => ({ dropEvery: Math.max(2.6, s.dropEvery - 0.08 * k), speed: Math.min(5.2, s.speed + 0.1 * k),
      roundTime: Math.max(70, s.roundTime - k) }),
    maxQuota: 18,
  },
  hard: {
    base: { roundTime: 70, dropEvery: 3.1, batch: 1, speed: 4.2, range: 0.45, throw: 1 },
    twists: [
      ["She's faster!", { speed: 4.9, range: 0.55 }],
      ["Bigger toy throws!", { throw: 1.4, range: 0.7 }],
      ["Quicker throws!", { dropEvery: 2.5 }],
      ["Double throws!", { batch: 2, dropEvery: 3.4 }],
      ["Less time on the clock!", { roundTime: 60 }],
      ["Even faster!", { speed: 5.6, range: 0.85 }],
    ],
    creep: (s, k) => ({ dropEvery: Math.max(2, s.dropEvery - 0.1 * k), speed: Math.min(6.5, s.speed + 0.15 * k),
      roundTime: Math.max(50, s.roundTime - 1.5 * k) }),
    maxQuota: 16,
  },
};

export function roundSettings(id, round = 1) {
  const mode = getMode(id), ramp = RAMPS[mode.id];
  const r = Math.min(ramp.rounds ?? Infinity, Math.max(1, Math.floor(round) || 1));
  let s = { ...ramp.base };
  for (const [, patch] of ramp.twists.slice(0, r - 1)) s = { ...s, ...patch };
  const extra = r - 1 - ramp.twists.length;
  if (extra > 0) s = { ...s, ...ramp.creep(s, extra) };
  const quota = s.quota ?? Math.min(ramp.maxQuota, 4 + r * 2);
  const twist = r > 1 ? ramp.twists[r - 2]?.[0] ?? "A little faster!" : null;
  return { ...mode, ...s, quota, twist, rounds: ramp.rounds ?? null };
}

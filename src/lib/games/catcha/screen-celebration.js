/** A short, screen-wide paper burst. One reusable pool, simulation time, independent local RNG. */
const COLORS = ["#ff7a4d", "#86ceff", "#6ce6b8", "#ffd23f", "#ff7aa8", "#a993ff"];
const COUNT = 216;

export function createScreenCelebration() {
  const pieces = Array.from({ length: COUNT }, () => ({}));
  let age = 0, duration = 0, revision = 0;
  function burst(seed = 1) {
    let bits = seed >>> 0 || 1;
    const random = () => {
      bits = (bits + 0x6d2b79f5) >>> 0;
      let n = Math.imul(bits ^ bits >>> 15, bits | 1);
      n ^= n + Math.imul(n ^ n >>> 7, n | 61);
      return ((n ^ n >>> 14) >>> 0) / 4294967296;
    };
    const range = (a, b) => a + (b - a) * random();
    age = 0; duration = 4.2; revision++;
    for (let i = 0; i < COUNT; i++) {
      const p = pieces[i], rain = i >= 144, angle = range(0, Math.PI * 2), speed = range(.35, .9);
      // The centre explodes in every direction; a spread of upper pieces fills the corners.
      p.x = rain ? range(.02, .98) : range(.46, .54);
      p.y = rain ? range(-.24, .2) : range(.43, .55);
      p.vx = rain ? range(-.09, .09) : Math.cos(angle) * speed;
      p.vy = rain ? range(.02, .12) : Math.sin(angle) * speed * 1.45 - .28;
      p.drag = rain ? .4 : 2.1;
      p.gravity = rain ? .15 : .24;
      p.size = range(.012, .023); p.angle = angle; p.spin = range(-8, 8);
      p.life = range(3.3, duration); p.phase = range(0, Math.PI * 2);
      p.color = COLORS[i % COLORS.length];
    }
  }
  const active = () => age < duration;
  function paint(g, width, height) {
    if (!active()) return;
    const unit = Math.min(width, height);
    for (const p of pieces) {
      if (age >= p.life) continue;
      const travel = (1 - Math.exp(-p.drag * age)) / p.drag;
      const x = (p.x + p.vx * travel + Math.sin(age * 3 + p.phase) * .009 * age) * width;
      const y = (p.y + p.vy * travel + .5 * p.gravity * age * age) * height;
      const size = p.size * unit;
      if (x < -size || x > width + size || y < -size || y > height + size) continue;
      g.save();
      g.globalAlpha = Math.min(1, (p.life - age) / .8);
      g.translate(x, y); g.rotate(p.angle + p.spin * age);
      // Tumbling shapes retain some width so papers never flicker out edge-on.
      g.scale(.3 + .7 * Math.abs(Math.cos(age * 5 + p.phase)), 1);
      g.fillStyle = p.color; g.fillRect(-size * .32, -size * .5, size * .64, size);
      g.restore();
    }
  }
  return {
    burst, paint, active,
    step(dt) { if (active()) { age = Math.min(duration, age + Math.max(0, dt)); revision++; } },
    reset() { age = duration = 0; revision++; },
    snapshot: () => ({ active: active(), revision, remaining: Number(Math.max(0, duration - age).toFixed(2)), capacity: COUNT }),
  };
}

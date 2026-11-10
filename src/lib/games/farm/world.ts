import * as THREE from 'three';
import { BOUNDS, SPOTS } from './model';
import { seeded, tile, tileText, type FarmProps } from './props';

const EDGE = BOUNDS + 0.25;
// Lamp posts along the outer paths, at the market and the farmhouse door; they glow from dusk.
export const LAMPS = [{ x: -1.05, z: -4.8 }, { x: 1.05, z: -4.8 }, { x: -5.2, z: -1.05 }, { x: 5.2, z: -1.05 }, { x: 4.6, z: 1.75 }, { x: -3.75, z: 4.55 }];
// Ground tiles read along world -z, which runs up and to the right on screen.
export function groundTile(props: FarmProps, root: THREE.Object3D, x: number, z: number, w: number, d: number, draw: Parameters<FarmProps['decal']>[5]) {
  const tile = props.decal(root, x, z, w, d, draw); tile.rotation.y = Math.PI / 2; return tile;
}
// Hedge runs along one edge with gaps where lanes pass, given as [from, to] pairs.
function hedgeRun(props: FarmProps, root: THREE.Object3D, along: 'x' | 'z', at: number, gaps: [number, number][]) {
  let from = -EDGE;
  for (const [a, b] of [...gaps, [EDGE, EDGE] as [number, number]]) {
    if (a - from > 0.3) {
      if (along === 'x') props.hedge(root, (from + a) / 2, at, a - from, 0.34);
      else props.hedge(root, at, (from + a) / 2, 0.34, a - from);
    }
    from = b;
  }
}
// Everything that never changes: ground, paths, borders, the house and greenery. Merged by the scene.
export function buildFarmWorld(props: FarmProps, root: THREE.Object3D) {
  const { surface, balustrade, bush, cypress, roundTree } = props;
  surface(root, 'grass', 0, 0, 0, 90, 90, 3.5);
  surface(root, 'paver', 0, 0.02, 0, EDGE * 2 + 1.5, 1.5, 2);
  surface(root, 'paver', 0, 0.021, 1.6, 1.5, EDGE * 2 + 6.4, 2);
  surface(root, 'paver', 2.6, 0.022, 2.95, 3.7, 2.7, 2);
  surface(root, 'paver', SPOTS.counter.x + 0.25, 0.019, 8.3, 1.2, 8, 2);
  surface(root, 'paver', 8.3, 0.018, 3.5, 7.8, 1.2, 2);
  // The stone path runs on south past the orchard as the road its shoppers walk in on.
  surface(root, 'paver', 0, 0.021, 16, 1.5, 9, 2);
  // The path carries on through the hedge towards where the coop yard opens.
  surface(root, 'paver', EDGE + 1.1, 0.02, 0, 2.2, 1.5, 2);
  // Stone balustrade along the far edges, low hedges along the near ones so nothing hides the farm.
  for (const [a, b] of [[-EDGE, -0.9], [0.9, EDGE]]) { balustrade(root, a, -EDGE, b, -EDGE); balustrade(root, -EDGE, a, -EDGE, b); }
  hedgeRun(props, root, 'x', EDGE, [[-0.9, 0.9], [2.6, 3.9]]);
  hedgeRun(props, root, 'z', EDGE, [[-0.9, 0.9], [2.85, 4.15]]);
  const house = props.house(); house.position.set(SPOTS.house.x, 0, SPOTS.house.z); root.add(house);
  for (const at of LAMPS) { const lamp = props.lamp(); lamp.position.set(at.x, 0, at.z); root.add(lamp); }
  const rand = seeded(42);
  const place = (o: THREE.Object3D, x: number, z: number) => { o.position.set(x, 0, z); o.rotation.y = rand() * Math.PI * 2; root.add(o); };
  for (const [x, z, r] of [[-1.3, 5.6, 0.4], [-5.9, 2.0, 0.42], [-1.3, 4.2, 0.36], [5.6, 1.2, 0.36], [-6.0, 6.0, 0.3], [5.9, -0.2, 0.32], [-0.6, -5.9, 0.34], [0.6, -5.9, 0.34]])
    place(bush(r, x * 7 + z), x, z);
  // A tree line behind the balustrade gives the farm a horizon at the top of the screen.
  for (let i = 0; i < 16; i++) {
    const t = -8 + i * 1.15;
    place(i % 3 === 1 ? roundTree(2.3 + rand() * 0.5, i) : cypress(2.4 + rand() * 0.8), t, -7.5 - rand() * 0.4);
    place(i % 3 === 2 ? roundTree(2.2 + rand() * 0.5, i + 20) : cypress(2.3 + rand() * 0.8), -7.5 - rand() * 0.4, t + 0.5);
  }
  for (let i = 0; i < 34; i++) {
    const a = rand() * Math.PI * 2, d = 9.5 + rand() * 4, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (x + z > 5) place(bush(0.35 + rand() * 0.3, i), x, z); else place(roundTree(2.2 + rand(), i + 40), x - 1, z - 1);
  }
  for (let i = 0; i < 26; i++) {
    const near = EDGE + 0.5 + rand() * 1.6, along = -5.5 + i * 0.45, colors = ['#f6a5b5', '#fff2c2', '#f3c444'];
    props.ball(root, colors[i % 3], near, 0.09, along + rand() * 0.3, 0.07);
    props.ball(root, colors[(i + 1) % 3], along + rand() * 0.3, 0.09, near, 0.07);
  }
  groundTile(props, root, SPOTS.market.x, SPOTS.market.z, 1.2, 0.8, (c, w, h) => {
    tile(c, w, h, { dash: [2.2, 1.4] }); tileText(c, 'SELL', w / 2, h * 0.53, h * 0.44);
  });
}

import * as THREE from 'three';
import { BOUNDS, SPOTS, STANDS } from './model';
import { cropIcon, seeded, tile, tileText, type FarmProps } from './props';

const EDGE = BOUNDS + 0.25;
// Ground tiles read along world -z, which runs up and to the right on screen.
export function groundTile(props: FarmProps, root: THREE.Object3D, x: number, z: number, w: number, d: number, draw: Parameters<FarmProps['decal']>[5]) {
  const tile = props.decal(root, x, z, w, d, draw); tile.rotation.y = Math.PI / 2; return tile;
}
// Everything that never changes: ground, paths, borders, the house and greenery. Merged by the scene.
export function buildFarmWorld(props: FarmProps, root: THREE.Object3D) {
  const { surface, hedge, balustrade, bush, cypress, roundTree } = props;
  surface(root, 'grass', 0, 0, 0, 80, 80, 3.5);
  surface(root, 'paver', 0, 0.02, 0, EDGE * 2 + 1.5, 1.5, 2);
  surface(root, 'paver', 0, 0.021, 1.6, 1.5, EDGE * 2 + 6.4, 2);
  surface(root, 'paver', 2.25, 0.022, 2.55, 3.0, 2.3, 2);
  surface(root, 'paver', 2.6, 0.019, 6.5, 1.2, 5.6, 2);
  surface(root, 'paver', 6.4, 0.018, 2.9, 5.3, 1.2, 2);
  // Stone balustrade along the far edges, low hedges along the near ones so nothing hides the farm.
  for (const [a, b] of [[-EDGE, -0.9], [0.9, EDGE]]) { balustrade(root, a, -EDGE, b, -EDGE); balustrade(root, -EDGE, a, -EDGE, b); }
  for (const [a, b] of [[-EDGE, -0.9], [0.9, 1.65], [3.15, EDGE]]) hedge(root, (a + b) / 2, EDGE, b - a, 0.34);
  hedge(root, EDGE, (-EDGE - 0.9) / 2, 0.34, EDGE - 0.9);
  hedge(root, EDGE, 1.25, 0.34, 0.7);
  const house = props.house(); house.position.set(-2.8, 0, 2.8); root.add(house);
  const rand = seeded(42);
  const place = (o: THREE.Object3D, x: number, z: number) => { o.position.set(x, 0, z); o.rotation.y = rand() * Math.PI * 2; root.add(o); };
  for (const [x, z, r] of [[-1.25, 1.3, 0.38], [-4.2, 1.35, 0.42], [-1.25, 4.25, 0.4], [4.2, 0.95, 0.36], [3.9, 4.2, 0.42], [-4.25, 4.2, 0.3]])
    place(bush(r, x * 7 + z), x, z);
  // A tree line behind the balustrade gives the farm a horizon at the top of the screen.
  for (let i = 0; i < 12; i++) {
    const t = -6.2 + i * 1.15;
    place(i % 3 === 1 ? roundTree(2.3 + rand() * 0.5, i) : cypress(2.4 + rand() * 0.8), t, -5.7 - rand() * 0.4);
    place(i % 3 === 2 ? roundTree(2.2 + rand() * 0.5, i + 20) : cypress(2.3 + rand() * 0.8), -5.7 - rand() * 0.4, t + 0.5);
  }
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2, d = 7.2 + rand() * 4, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (x + z > 4) place(bush(0.35 + rand() * 0.3, i), x, z); else place(roundTree(2.2 + rand(), i + 40), x - 1, z - 1);
  }
  for (let i = 0; i < 18; i++) {
    const x = 5.6 + rand() * 1.4, z = -4 + i * 0.6;
    props.ball(root, ['#f6a5b5', '#fff2c2', '#f3c444'][i % 3], x, 0.09, z + rand() * 0.3, 0.07);
    props.ball(root, ['#f6a5b5', '#fff2c2', '#f3c444'][(i + 1) % 3], z + rand() * 0.3, 0.09, 5.6 + rand() * 1.4, 0.07);
  }
  groundTile(props, root, SPOTS.seeds.x, SPOTS.seeds.z, 1.3, 0.8, (c, w, h) => {
    tile(c, w, h, { dash: [2.2, 1.4] }); cropIcon(c, 'tomato', w * 0.24, h * 0.52, h * 0.2); tileText(c, 'SEEDS', w * 0.6, h * 0.53, h * 0.38);
  });
  groundTile(props, root, SPOTS.market.x, SPOTS.market.z, 1.2, 0.8, (c, w, h) => {
    tile(c, w, h, { dash: [2.2, 1.4] }); tileText(c, 'SELL', w / 2, h * 0.53, h * 0.44);
  });
  const seeds = props.seedStand('tomato'); seeds.position.set(STANDS[0].x, 0, STANDS[0].z); root.add(seeds);
  const market = props.market(); market.position.set(2.4, 0, 2.0); root.add(market);
}

// Azure Cove itself: a deterministic coastal city built from one seeded stream.
// Roads form a grid; each block between four roads holds 1-4 buildings; the east edge
// is sand and sea; palms line the beach road and the marina; parked cars wait on kerbs.

import { CITY, CAR_MODELS, DISTRICTS } from './config.js';
import { intRange, pick, range } from './random.js';

const BUILDING_COLORS = ['#c98a5a', '#7d9bb5', '#b5a27d', '#8fa98f', '#c9b8a3', '#a87d8f', '#6f8fa8', '#d8c9a3'];
const GLASS_COLORS = ['#7fc4e8', '#9ad8f0', '#6fb0d8', '#a8d8e8'];

function roadLines() {
  const lines = [];
  for (let v = -CITY.half; v <= CITY.half; v += CITY.roadGap) {
    lines.push({ horizontal: true, at: v });
    lines.push({ horizontal: false, at: v });
  }
  return lines;
}

/** Is the point on a road (or on the beach / in the sea)? */
export function onRoad(x, z) {
  const gap = CITY.roadGap;
  const half = CITY.roadWidth / 2;
  const rx = ((x + CITY.half) % gap + gap) % gap;
  const rz = ((z + CITY.half) % gap + gap) % gap;
  const nearX = rx < half || rx > gap - half;
  const nearZ = rz < half || rz > gap - half;
  return nearX || nearZ;
}

/** Snap a point to the centre of the nearest road lane. */
export function nearestRoadPoint(x, z) {
  const gap = CITY.roadGap;
  const snap = (v) => Math.round((v + CITY.half) / gap) * gap - CITY.half;
  const sx = snap(x);
  const sz = snap(z);
  return Math.abs(x - sx) < Math.abs(z - sz) ? { x: sx, z } : { x, z: sz };
}

export function buildCity(random) {
  const buildings = [];
  const trees = [];
  const parked = [];
  const gap = CITY.roadGap;
  const halfRoad = CITY.roadWidth / 2 + 4;

  // One building block per grid cell, away from the beach.
  for (let bx = -CITY.half + gap / 2; bx < CITY.half - gap / 2; bx += gap) {
    for (let bz = -CITY.half + gap / 2; bz < CITY.half - gap / 2; bz += gap) {
      if (bx > CITY.beachX - 60) continue; // beach blocks stay open
      const count = intRange(random, 1, 3);
      for (let i = 0; i < count; i += 1) {
        // Kept well inside the block (road edge is 37 from the centre) so no
        // building ever blocks a road or traps a car against a wall: the nearest
        // a building face gets to a road centre line is 17 units.
        const w = range(random, 20, 28);
        const d = range(random, 20, 28);
        const x = bx + range(random, -10, 10) + (i % 2 === 0 ? -4 : 4);
        const z = bz + range(random, -10, 10) + (i === 2 ? 4 : -4);
        const tall = random() < 0.22;
        const h = tall ? range(random, 42, 78) : range(random, 12, 30);
        buildings.push({
          x, z, w, d, h,
          color: pick(random, BUILDING_COLORS),
          glass: pick(random, GLASS_COLORS),
          roof: random() < 0.3,
          tall,
        });
      }
    }
  }

  // Palm trees along the beach road and around the marina and plaza.
  for (let z = -CITY.half + 20; z <= CITY.half - 20; z += 30) {
    trees.push({ x: CITY.beachX - 14, z, palm: true, h: range(random, 9, 13) });
    if (random() < 0.5) trees.push({ x: CITY.beachX - 26, z: z + 12, palm: true, h: range(random, 8, 12) });
  }
  for (let i = 0; i < 26; i += 1) {
    const spot = pick(random, DISTRICTS);
    const tree = { x: spot.x + range(random, -50, 50), z: spot.z + range(random, -50, 50), palm: random() < 0.6, h: range(random, 7, 12) };
    if (onRoad(tree.x, tree.z)) continue; // never plant a tree in the middle of a road
    trees.push(tree);
  }

  // Parked cars on kerbs, on roads, spread across the city — never on top of
  // the mission-1 car at (10, 45), or the two would overlap and wedge together.
  for (let i = 0; i < 22; i += 1) {
    const along = range(random, -CITY.half + 40, CITY.beachX - 40);
    const cross = Math.round(range(random, -3, 3)) * gap;
    const horizontal = random() < 0.5;
    const model = pick(random, CAR_MODELS);
    const spot = {
      x: horizontal ? along : cross + (random() < 0.5 ? -10 : 10),
      z: horizontal ? cross + (random() < 0.5 ? -10 : 10) : along,
      heading: horizontal ? (random() < 0.5 ? 0 : Math.PI) : (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
      model, parked: true, traffic: false, police: false, speed: 0,
    };
    if (Math.hypot(spot.x - 10, spot.z - 45) < 15) continue;
    parked.push(spot);
  }
  // The mission-1 car is always at the same plaza kerb so the first mission reads clearly.
  parked.push({
    x: 10, z: 45, heading: Math.PI / 2, model: CAR_MODELS[2], parked: true, traffic: false, police: false, speed: 0,
  });

  return { buildings, trees, parked, roads: roadLines(), districts: DISTRICTS };
}

// The city around the office: the office's own lot in the middle, a street all round it, and blocks of buildings
// out to the edge. Laid out once, the same every time (a seeded random), in world units (metres). Boss mode walks
// the streets: cityWalkable() says where a person can stand outside the office building.

const rnd = (seed) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };

export const LOT = { x0: -54, x1: 36, z0: -25, z1: 25 };   // the office's lawn (Outside.jsx)
export const STREET = 12;
export const SIDEWALK = 3;
export const BLOCK = 42;
export const EXTENT = 230;   // how far the city reaches from the office, each way

// Building types: footprint and height are fixed per type so window textures keep their size.
export const TYPES = [
  { w: 14, d: 14, h: 8 },   // shops
  { w: 14, d: 14, h: 14 },
  { w: 15, d: 15, h: 22 },
  { w: 15, d: 15, h: 32 },
  { w: 16, d: 16, h: 46 },
  { w: 16, d: 16, h: 64 },  // towers
];

/** The spans of one axis: blocks out from the lot's two edges, with a street between each. */
function spans(lo, hi) {
  const out = [];
  for (let b = lo - STREET; b - BLOCK > -EXTENT; b -= BLOCK + STREET) out.unshift([b - BLOCK, b]);
  out.push([lo, hi, 'lot']);
  for (let a = hi + STREET; a + BLOCK < EXTENT; a += BLOCK + STREET) out.push([a, a + BLOCK]);
  return out;
}

// Across the street from the office's front door: a row of shops facing it, a supermarket with its car park, and
// green on either side. Their own made-up names and colours. Each faces -z (the office), its front at z0.
export const STORES = [
  { id: 'quickstop', name: 'QUICKSTOP 24/7', x0: -44, x1: -32, z0: 41.5, d: 11, h: 4.6, wall: '#f4efe6', band: '#0f766e', stripe: '#facc15', open: '24/7' },
  { id: 'freshco', name: 'FRESHCO SUPERMARKET', x0: -26, x1: 6, z0: 52, d: 20, h: 7.5, wall: '#e5e7eb', band: '#c2410c', stripe: '#1f2937', open: '7AM – 11PM', big: true },
  { id: 'pharmacy', name: 'PHARMACY +', x0: 10, x1: 20, z0: 41.5, d: 10, h: 4.4, wall: '#f8fafc', band: '#15803d', stripe: '#bbf7d0', open: '8AM – 10PM' },
  { id: 'bakery', name: 'BAKERY · CAFÉ', x0: 22, x1: 32, z0: 41.5, d: 10, h: 4.4, wall: '#f5e6d3', band: '#7c2d12', stripe: '#fcd34d', open: '6AM – 9PM' },
];
// the supermarket's car park, in front of it: [x0, x1, z0, z1], and the bays' parked cars
export const CARPARK = { x0: -26, x1: 6, z0: 41, z1: 50.5 };
export const CARPARK_CARS = [[-22.5, 44], [-17.5, 44], [-7.5, 44], [-2.5, 47.5], [2.5, 44], [-12.5, 47.5]];

function build() {
  const r = rnd(4242);
  const xs = spans(LOT.x0, LOT.x1);
  const zs = spans(LOT.z0, LOT.z1);
  const blocks = [];
  const buildings = [];
  const parks = [];
  for (const [x0, x1, xl] of xs) {
    for (const [z0, z1, zl] of zs) {
      if (xl && zl) continue;   // the office's own lot
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const dist = Math.hypot(cx, cz);
      blocks.push({ x0, x1, z0, z1 });
      // the block right in front of the office is an open plaza: the cameras stand there
      const front = z0 === LOT.z1 + STREET && x1 > LOT.x0 && x0 < LOT.x1;
      if (front) {
        // the shops stand along the street; green at the left end (where the street camera stands) and behind them
        parks.push({ x0: x0 + SIDEWALK, x1: -47, z0: z0 + SIDEWALK, z1: z1 - SIDEWALK, plaza: true });
        parks.push({ x0: 9, x1: x1 - SIDEWALK, z0: 56, z1: z1 - SIDEWALK, plaza: true });
        continue;
      }
      // in front of the office (the side the cameras look from) only low shops, so nothing hides it
      const lowOnly = cz > 0 && Math.abs(cx) < 110 && z0 < 110;
      // now and then a small park, mostly near the middle
      if (r() < (dist < 90 ? 0.18 : 0.08)) { parks.push({ x0: x0 + SIDEWALK, x1: x1 - SIDEWALK, z0: z0 + SIDEWALK, z1: z1 - SIDEWALK }); continue; }
      // the block's buildable area, cut into lots of about 18 m
      const ix0 = x0 + SIDEWALK, ix1 = x1 - SIDEWALK, iz0 = z0 + SIDEWALK, iz1 = z1 - SIDEWALK;
      const nx = Math.max(1, Math.round((ix1 - ix0) / 18)), nz = Math.max(1, Math.round((iz1 - iz0) / 18));
      const lw = (ix1 - ix0) / nx, ld = (iz1 - iz0) / nz;
      for (let i = 0; i < nx; i++) {
        for (let k = 0; k < nz; k++) {
          if (r() < 0.07) continue;   // an empty lot here and there
          // taller further from the office's low-rise street, towers mostly toward the edges
          const t = Math.min(1, dist / 180);
          const roll = r() * 0.75 + t * 0.45;
          let type = roll < 0.28 ? 0 : roll < 0.48 ? 1 : roll < 0.66 ? 2 : roll < 0.82 ? 3 : roll < 0.95 ? 4 : 5;
          if (lowOnly) type = Math.min(type, 1);
          while (type > 0 && (TYPES[type].w > lw - 1 || TYPES[type].d > ld - 1)) type--;
          const T = TYPES[type];
          if (T.w > lw || T.d > ld) continue;
          const x = ix0 + lw * (i + 0.5) + (r() - 0.5) * Math.max(0, lw - T.w - 1);
          const z = iz0 + ld * (k + 0.5) + (r() - 0.5) * Math.max(0, ld - T.d - 1);
          buildings.push({ x, z, type, variant: Math.floor(r() * 4), rot: Math.floor(r() * 4) * (Math.PI / 2) });
        }
      }
    }
  }
  // streets: the gaps between spans, as long strips (for lane lines)
  const vStreets = [], hStreets = [];
  for (let i = 0; i < xs.length - 1; i++) vStreets.push((xs[i][1] + xs[i + 1][0]) / 2);
  for (let i = 0; i < zs.length - 1; i++) hStreets.push((zs[i][1] + zs[i + 1][0]) / 2);
  return { blocks, buildings, parks, vStreets, hStreets, xs, zs };
}

export const CITY = build();

// A coarse grid of what is solid, for cityWalkable(): cells of 4 m.
const CELL = 4;
const solid = new Map();
const mark = (x0, x1, z0, z1, tag) => {
  for (let x = Math.floor(x0 / CELL); x <= Math.floor(x1 / CELL); x++) for (let z = Math.floor(z0 / CELL); z <= Math.floor(z1 / CELL); z++) {
    const k = `${x},${z}`;
    if (!solid.has(k)) solid.set(k, []);
    solid.get(k).push([x0, x1, z0, z1, tag]);
  }
};
for (const b of CITY.buildings) {
  const T = TYPES[b.type];
  mark(b.x - T.w / 2 - 0.3, b.x + T.w / 2 + 0.3, b.z - T.d / 2 - 0.3, b.z + T.d / 2 + 0.3, 'b');
}
for (const s of STORES) mark(s.x0 - 0.3, s.x1 + 0.3, s.z0 - 0.3, s.z0 + s.d + 0.3, 's');
for (const [x, z] of CARPARK_CARS) mark(x - 1.1, x + 1.1, z - 2.2, z + 2.2, 'c');

/**
 * Can a person stand here, outside the office building? Inside the city and not inside a building. `extra` lists
 * more boxes that are solid (the store), as [x0, x1, z0, z1] in world units.
 */
export function cityWalkable(wx, wz, extra = []) {
  if (Math.abs(wx) > EXTENT - 2 || Math.abs(wz) > EXTENT - 2) return false;
  const list = solid.get(`${Math.floor(wx / CELL)},${Math.floor(wz / CELL)}`);
  if (list) for (const [x0, x1, z0, z1] of list) if (wx > x0 && wx < x1 && wz > z0 && wz < z1) return false;
  for (const [x0, x1, z0, z1] of extra) if (wx > x0 && wx < x1 && wz > z0 && wz < z1) return false;
  return true;
}

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
      if (front) { parks.push({ x0: x0 + SIDEWALK, x1: x1 - SIDEWALK, z0: z0 + SIDEWALK, z1: z1 - SIDEWALK, plaza: true }); continue; }
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

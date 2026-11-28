// Atlas Mart, the 24/7 convenience store on the office's lot: its walls, door, fixtures and the places people stand,
// in world units around the store's centre. Its front (glass, with the door) faces +x, toward the office. Used to
// draw it (Mart.jsx), to keep boss mode out of its walls, and to send idle agents in for a snack.

export const MART = { depth: 10, width: 14, height: 4.2 };   // x by z, metres

/**
 * @param {number} cx world x of the centre
 * @param {number} cz world z of the centre
 */
export function martLayout(cx, cz) {
  const hx = MART.depth / 2, hz = MART.width / 2;
  const front = cx + hx, back = cx - hx;
  const T = 0.25;   // wall thickness
  const door = [cz - 1.2, cz + 1.2];
  const box = (x0, x1, z0, z1) => [Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1)];
  const walls = [
    box(back - T, back + T, cz - hz, cz + hz),           // back
    box(back, front, cz - hz - T, cz - hz + T),          // left side
    box(back, front, cz + hz - T, cz + hz + T),          // right side
    box(front - T, front + T, cz - hz, door[0]),         // front, left of the door
    box(front - T, front + T, door[1], cz + hz),         // front, right of the door
  ];
  const fixtures = {
    fridges: box(back + 0.2, back + 1.0, cz - hz + 0.6, cz + hz - 0.6),
    shelves: [box(cx - 3.0, cx + 1.8, cz - 5.0, cz - 4.4), box(cx - 3.0, cx + 1.8, cz - 3.0, cz - 2.4)],
    counter: box(cx + 2.2, cx + 2.9, cz + 2.0, cz + 6.2),
    coffee: box(cx + 1.0, cx + 1.6, cz + 6.2, cz + 6.8),
    arcade: box(cx - 0.6, cx + 0.4, cz + 5.9, cz + 6.8),
    tables: [[cx - 2.4, cz + 2.4], [cx - 2.4, cz + 4.8]],
  };
  const tableBoxes = fixtures.tables.map(([x, z]) => box(x - 0.55, x + 0.55, z - 0.55, z + 0.55));
  const solid = [...walls, fixtures.fridges, ...fixtures.shelves, fixtures.counter, fixtures.coffee, fixtures.arcade, ...tableBoxes];
  // where agents stand or sit, with which way they face (rot 0 = +z, π/2 = +x, -π/2 = -x)
  const spots = [
    { id: 'aisle', at: [cx - 0.6, cz - 3.7], rot: Math.PI / 2, line: '🍜 Instant noodles…', via: [[cx + 2.6, cz - 1.0], [cx + 2.6, cz - 3.7]] },
    { id: 'aisle2', at: [cx - 1.6, cz - 1.6], rot: -Math.PI / 2, line: '🍫 Just one snack' },
    { id: 'fridge', at: [back + 1.7, cz - 0.4], rot: -Math.PI / 2, line: '🥤 Something cold' },
    { id: 'fridge2', at: [back + 1.7, cz - 5.6], rot: -Math.PI / 2, line: '🧃 Juice break', via: [[cx - 3.4, cz - 1.6]] },
    { id: 'counter', at: [cx + 3.5, cz + 3.4], rot: -Math.PI / 2, line: '💳 Paying at the counter', via: [[cx + 3.6, cz + 0.4]] },
    { id: 'arcade', at: [cx - 0.1, cz + 5.0], rot: Math.PI, line: '🎮 Beat my score!' },
    { id: 'seat1', at: [cx - 1.45, cz + 2.4], rot: -Math.PI / 2, sit: true, table: 0 },
    { id: 'seat2', at: [cx - 3.35, cz + 2.4], rot: Math.PI / 2, sit: true, table: 0, via: [[cx - 3.4, cz + 0.6]] },
    { id: 'seat3', at: [cx - 1.45, cz + 4.8], rot: -Math.PI / 2, sit: true, table: 1 },
    { id: 'seat4', at: [cx - 3.35, cz + 4.8], rot: Math.PI / 2, sit: true, table: 1, via: [[cx - 3.4, cz + 0.6]] },
  ];
  return {
    cx, cz, front, back, hz, door, walls, fixtures, solid, spots,
    outside: [front + 1.4, cz],            // just outside the door
    inside: [front - 1.4, cz],             // just inside it
    middle: [cx + 0.4, cz + 0.2],          // the open floor in the middle, from where every spot is a straight walk
    cashier: [cx + 1.6, cz + 4.0],         // behind the counter, facing the door side
    contains: (wx, wz) => wx > back && wx < front && wz > cz - hz && wz < cz + hz,
  };
}

/** Can a person stand at (wx, wz) as far as the store goes: not in a wall or a fixture. */
export function martFree(m, wx, wz, pad = 0.15) {
  for (const [x0, x1, z0, z1] of m.solid) if (wx > x0 - pad && wx < x1 + pad && wz > z0 - pad && wz < z1 + pad) return false;
  return true;
}

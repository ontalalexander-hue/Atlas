// The view deck on the roof, in world units (metres): where it is, what stands on it and where people sit. Roof.jsx
// draws it; boss mode walks on it (canStandDeck) and idle agents come up to sit and look at the city. Its front rail
// faces +z, the street side. The lift comes up in the stair house just behind the deck's back edge.

export function deckLayout(W, H) {
  const x0 = -W / 2 + 1.2, x1 = Math.min(-W / 2 + 21, W / 2 - 14), z0 = 0.8, z1 = H / 2 - 0.9;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const tables = [
    { at: [x0 + 3.2, cz + 1.4], color: '#1f7ae0' },
    { at: [cx + 0.5, cz + 1.8], color: '#e8684a' },
    { at: [x1 - 3.2, cz + 1.2], color: '#f4efe6' },
  ];
  // benches along the front rail, facing the street, between the two viewers
  const benches = [[x0 + 2.8, z1 - 2.1], [cx, z1 - 2.1], [x1 - 2.8, z1 - 2.1]].map((at) => ({ at }));
  const loungers = [{ at: [x1 - 2.2, z0 + 2.0], rot: -0.35 }, { at: [x1 - 3.8, z0 + 2.0], rot: -0.25 }];
  const viewers = [[x0 + 6, z1 - 0.6], [x1 - 6, z1 - 0.6]];
  const planters = [{ at: [cx, z0 + 0.5], w: 5, d: 0.6 }, { at: [x1 - 0.5, cz - 0.6], w: 0.6, d: 3 }];
  const stair = { at: [x0 + 2, -1.2], door: [x0 + 2, 0.32] };

  const seats = [];
  benches.forEach((b, i) => { for (const dx of [-0.5, 0.5]) seats.push({ id: `bench${i}${dx < 0 ? 'a' : 'b'}`, at: [b.at[0] + dx, b.at[1] + 0.05], rot: 0, view: true }); });
  loungers.forEach((l, i) => seats.push({ id: `lounger${i}`, at: l.at, rot: l.rot, view: true, low: true }));
  tables.forEach((t, k) => {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.6;
      seats.push({ id: `table${k}${i}`, at: [t.at[0] + Math.sin(a) * 0.95, t.at[1] + Math.cos(a) * 0.95], rot: a + Math.PI, table: k });
    }
  });

  // what a person can't walk through: [x0, x1, z0, z1] boxes and [x, z, r] circles
  const boxes = [
    ...benches.map((b) => [b.at[0] - 1.0, b.at[0] + 1.0, b.at[1] - 0.25, b.at[1] + 0.35]),
    ...loungers.map((l) => [l.at[0] - 0.45, l.at[0] + 0.45, l.at[1] - 1.0, l.at[1] + 0.9]),
    ...planters.map((p) => [p.at[0] - p.w / 2, p.at[0] + p.w / 2, p.at[1] - p.d / 2, p.at[1] + p.d / 2]),
  ];
  const circles = [...tables.map((t) => [...t.at, 1.3]), ...viewers.map(([x, z]) => [x, z, 0.3])];

  return {
    x0, x1, z0, z1, cx, cz, tables, benches, loungers, viewers, planters, stair, seats, boxes, circles,
    // where you step out onto the deck: clear of the stair house, so the camera behind you sees the deck
    arrive: [x0 + 5.5, z0 + 2.5],
    // where you stand to call the lift back down: at the stair house's door
    door: [stair.door[0], stair.door[1] + 0.9],
  };
}

/** Can a person stand at (wx, wz) on the deck: inside its rails, clear of the furniture. */
export function canStandDeck(d, wx, wz, r = 0.28) {
  if (wx < d.x0 + r + 0.1 || wx > d.x1 - r - 0.1 || wz < d.z0 + r + 0.05 || wz > d.z1 - r - 0.1) return false;
  for (const [a, b, c, e] of d.boxes) if (wx > a - r && wx < b + r && wz > c - r && wz < e + r) return false;
  for (const [x, z, rad] of d.circles) if (Math.hypot(wx - x, wz - z) < rad + r * 0.5) return false;
  return true;
}

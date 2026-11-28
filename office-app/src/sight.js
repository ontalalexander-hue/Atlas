// What the boss can see from where they stand, for the name tags and bubbles: walking about inside (boss mode), a tag
// shows only when nothing solid stands between you and it. Glass walls and open doorways let the view through;
// solid and outer walls do not. Everything is in grid units.
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useOffice, positions } from './store.js';

const cache = new WeakMap();
/** The cells of solid and outer walls (z * W + x): what the eye can't pass. */
function opaque(L) {
  if (!cache.has(L)) {
    const set = new Set();
    for (const s of L.wallSegments) {
      if (s.type === 'glass') continue;
      for (let k = s.a; k <= s.b; k++) set.add(s.dir === 'h' ? s.at * L.W + k : k * L.W + s.at);
    }
    cache.set(L, set);
  }
  return cache.get(L);
}

/** Is there a clear line from one grid point to another (no solid wall cell in between)? */
export function clearLine(L, [x0, z0], [x1, z1]) {
  const walls = opaque(L);
  const d = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.ceil(d / 0.25);
  const a = `${Math.round(x0)},${Math.round(z0)}`, b = `${Math.round(x1)},${Math.round(z1)}`;
  for (let i = 1; i < n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n), z = Math.round(z0 + ((z1 - z0) * i) / n);
    const k = `${x},${z}`;
    if (k === a || k === b) continue;
    if (walls.has(z * L.W + x)) return false;
  }
  return true;
}

const inside = (L, x, z) => x > -0.5 && x < L.W - 0.5 && z > -0.5 && z < L.H - 0.5;

/**
 * Should a tag at grid (x, z) be hidden from the boss? Only ever while the boss is inside the building: then a tag
 * behind a solid wall, out in the street, up on the deck or far away is hidden. Outside boss mode nothing is.
 */
export function hiddenFromBoss(x, z, { deck = false } = {}) {
  const s = useOffice.getState();
  if (!s.boss || s.bossOutside) return false;
  const b = positions.boss;
  const L = s.layout;
  if (!b || !L) return false;
  if (deck || !inside(L, x, z)) return true;
  if (Math.hypot(b.x - x, b.z - z) > 26) return true;
  return !clearLine(L, [b.x, b.z], [x, z]);
}

/**
 * A ref for a tag's element: hidden (visibility) while hiddenFromBoss says so, checked a few times a second.
 * `where()` gives the tag's grid point and whether it is up on the deck, or null to leave it alone.
 */
export function useSightRef(where) {
  const ref = useRef(null);
  const tick = useRef(Math.floor(Math.random() * 6));
  useFrame(() => {
    if (!ref.current || (tick.current++ % 6)) return;
    const w = where();
    const hide = w ? hiddenFromBoss(w.x, w.z, { deck: !!w.deck }) : false;
    const v = hide ? 'hidden' : '';
    if (ref.current.style.visibility !== v) ref.current.style.visibility = v;
  });
  return ref;
}

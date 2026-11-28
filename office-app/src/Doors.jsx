// Automatic sliding doors in every doorway (layout.js `doors`): two panels that slide apart into the wall when
// someone (you, an agent, a visitor) comes near, and close behind them. Glass in glass walls and at the entrance,
// wood with a glass strip in solid walls. With the walls up to the ceiling (boss mode, inside) a panel of wall closes
// the space above the door.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useOffice, positions } from './store.js';
import { TOP as ROOF_TOP } from './Roof.jsx';

const NEAR = 1.9;      // grid units: how close someone comes before it opens
const DOOR_H = 2.3;

function Door({ L, d, full }) {
  const len = d.b - d.a + 1;
  const mid = (d.a + d.b) / 2;
  const gx = d.dir === 'h' ? mid : d.at, gz = d.dir === 'h' ? d.at : mid;
  const [wx, wz] = L.toWorld([gx, gz]);
  const solid = d.type === 'solid';
  const wallH = full ? ROOF_TOP - 0.34 : solid || d.type === 'outer' ? 1.3 : 1.5;
  const h = Math.min(DOOR_H, wallH);
  const t = d.type === 'outer' ? 0.1 : 0.06;
  const half = len / 2 - 0.02;
  const left = useRef(), right = useRef();
  const open = useRef(0);
  const tick = useRef(0);
  const wanted = useRef(false);
  useFrame((_, dt) => {
    // who is near: checked a few times a second, the sliding itself every frame
    if (!(tick.current++ % 5)) {
      wanted.current = false;
      for (const [id, p] of Object.entries(positions)) {
        if (!p || p.deck) continue;
        if (id === 'boss' && !useOffice.getState().boss) continue;
        if (Math.abs(p.x - gx) < NEAR + len / 2 - 0.5 && Math.abs(p.z - gz) < NEAR + len / 2 - 0.5 && Math.hypot(p.x - gx, p.z - gz) < NEAR + len / 2 - 0.4) { wanted.current = true; break; }
      }
    }
    const target = wanted.current ? 1 : 0;
    open.current += (target - open.current) * Math.min(1, dt * (target ? 7 : 3.5));
    const slide = len / 4 + open.current * (half - 0.05);
    if (left.current) left.current.position.x = -slide;
    if (right.current) right.current.position.x = slide;
  });
  const panel = useMemo(() => (solid
    ? <meshStandardMaterial color="#c9a27a" roughness={0.55} />
    : <meshStandardMaterial color="#d6ebf7" transparent opacity={0.3} roughness={0.05} metalness={0.25} depthWrite={false} />), [solid]);
  const Panel = ({ r }) => (
    <group ref={r}>
      <mesh position-y={h / 2} castShadow={solid}><boxGeometry args={[half, h - 0.02, t]} />{panel}</mesh>
      {/* a handle bar, and on a wooden door a glass strip to see through */}
      <mesh position={[0, 1.05, t / 2 + 0.02]}><boxGeometry args={[0.04, 0.5, 0.03]} /><meshStandardMaterial color="#9aa0a8" metalness={0.8} roughness={0.3} /></mesh>
      {solid && <mesh position={[0, h * 0.62, t / 2 + 0.002]}><planeGeometry args={[0.16, h * 0.5]} /><meshStandardMaterial color="#a9cfe6" roughness={0.1} metalness={0.3} /></mesh>}
      {!solid && <mesh position-y={h - 0.03}><boxGeometry args={[half, 0.05, t + 0.01]} /><meshStandardMaterial color="#5c6470" metalness={0.6} roughness={0.35} /></mesh>}
    </group>
  );
  return (
    <group position={[wx, 0, wz]} rotation-y={d.dir === 'h' ? 0 : Math.PI / 2}>
      <Panel r={left} />
      <Panel r={right} />
      {/* the track over the door */}
      <mesh position-y={h + 0.04}><boxGeometry args={[len + 0.1, 0.08, t + 0.06]} /><meshStandardMaterial color="#3a3f48" metalness={0.5} roughness={0.4} /></mesh>
      {/* the wall above the door, when the walls go up to the ceiling */}
      {wallH - h > 0.1 && (
        <mesh position-y={h + 0.08 + (wallH - h - 0.08) / 2}>
          <boxGeometry args={[len, wallH - h - 0.08, solid || d.type === 'outer' ? 0.14 : 0.08]} />
          {solid || d.type === 'outer'
            ? <meshStandardMaterial color="#f3efe8" roughness={0.92} />
            : <meshStandardMaterial color="#d6ebf7" transparent opacity={0.16} roughness={0.02} metalness={0.2} depthWrite={false} />}
        </mesh>
      )}
    </group>
  );
}

export default function Doors({ L }) {
  const full = useOffice((s) => s.boss && !s.bossOutside);
  return (L.doors ?? []).map((d, i) => <Door key={`${L.key}-d${i}`} L={L} d={d} full={full} />);
}

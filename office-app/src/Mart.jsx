// Atlas Mart: a walk-in 24/7 convenience store (layout in mart.js). Glass front with the door, a striped band and
// awning, the name in lights, drink fridges along the back, two aisles of shelves, a counter with an AI cashier and
// a coffee machine, two snack tables and an arcade machine. The roof has a wide skylight so the camera above sees
// who is in; while the boss walks around inside, the roof goes and the walls drop to waist height.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import { useOffice } from './store.js';
import Person, { lookFor } from './Person.jsx';
import { MART } from './mart.js';
import { tr } from './i18n.js';

function label(text, { w = 1024, h = 200, color = '#fff', bg = null, font = '800 120px Inter, system-ui, sans-serif' } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.fillStyle = color; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const STRIPES = ['#e8684a', '#ffffff', '#0f9d8a', '#ffffff'];   // the store's own colours: coral, white, teal
const box = (b, y0, y1) => ({ pos: [(b[0] + b[1]) / 2, (y0 + y1) / 2, (b[2] + b[3]) / 2], size: [b[1] - b[0], y1 - y0, b[3] - b[2]] });

function Products({ x0, x1, z, y, seed }) {
  const items = useMemo(() => {
    let s = seed;
    const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    const cols = ['#e8684a', '#ffd166', '#2f9e64', '#3b82c4', '#b05cc2', '#f4f1ec', '#d9534f'];
    const out = [];
    for (let x = x0 + 0.15; x < x1 - 0.1; x += 0.22 + r() * 0.12) out.push([x, cols[Math.floor(r() * cols.length)], 0.18 + r() * 0.16]);
    return out;
  }, [x0, x1, seed]);
  return items.map(([x, c, h], i) => (
    <mesh key={i} position={[x, y + h / 2, z]} castShadow><boxGeometry args={[0.16, h, 0.22]} /><meshStandardMaterial color={c} roughness={0.6} /></mesh>
  ));
}

function Shelf({ b }) {
  const { pos, size } = box(b, 0, 1.6);
  const levels = [0.35, 0.8, 1.25];
  return (
    <group>
      <mesh position={pos} castShadow receiveShadow><boxGeometry args={[size[0], 0.05, size[2]]} /><meshStandardMaterial color="#dfe3e8" /></mesh>
      <mesh position={[pos[0], 0.8, pos[2]]} castShadow><boxGeometry args={[size[0], 1.6, 0.06]} /><meshStandardMaterial color="#c8ced6" roughness={0.6} /></mesh>
      {levels.map((y) => (
        <group key={y}>
          <mesh position={[pos[0], y, pos[2]]}><boxGeometry args={[size[0], 0.04, size[2]]} /><meshStandardMaterial color="#eef1f4" /></mesh>
          <Products x0={b[0]} x1={b[1]} z={pos[2] - size[2] / 4} y={y + 0.02} seed={Math.round(y * 100 + b[2] * 7) + 11} />
          <Products x0={b[0]} x1={b[1]} z={pos[2] + size[2] / 4} y={y + 0.02} seed={Math.round(y * 100 + b[2] * 7) + 29} />
        </group>
      ))}
    </group>
  );
}

function Fridges({ b, lamps }) {
  const { pos, size } = box(b, 0, 2.2);
  const doors = Math.max(2, Math.round(size[2] / 1.1));
  const bottles = useMemo(() => {
    const out = [];
    const cols = ['#e8684a', '#2f9e64', '#3b82c4', '#ffd166', '#f4f1ec', '#b05cc2'];
    for (let d = 0; d < doors; d++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) out.push([d, row, k, cols[(d * 7 + row * 3 + k) % cols.length]]);
    return out;
  }, [doors]);
  const dz = size[2] / doors;
  return (
    <group>
      <mesh position={pos} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color="#e9edf1" roughness={0.4} metalness={0.2} /></mesh>
      {bottles.map(([d, row, k, c], i) => (
        <mesh key={i} position={[b[1] + 0.01, 0.35 + row * 0.45, b[2] + dz * d + 0.2 + k * (dz - 0.4) / 3]}>
          <cylinderGeometry args={[0.05, 0.05, 0.26, 8]} /><meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.15 + lamps * 0.2} />
        </mesh>
      ))}
      {Array.from({ length: doors }).map((_, d) => (
        <mesh key={d} position={[b[1] + 0.06, 1.15, b[2] + dz * (d + 0.5)]} rotation-y={Math.PI / 2}>
          <planeGeometry args={[dz - 0.08, 2.0]} /><meshStandardMaterial color="#cfe9ff" transparent opacity={0.22} emissive="#bfe0ff" emissiveIntensity={0.35} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function Cashier({ at }) {
  const pose = useRef({ mode: 'idle', moving: false });
  return (
    <group position={[at[0], 0, at[1]]} rotation-y={Math.PI / 2}>
      <Person color="#0f9d8a" look={lookFor('mart-cashier')} pose={pose} />
      <Html position={[0, 2.05, 0]} center distanceFactor={15} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div className="tag-wrap"><div className="tag"><span className="dot" style={{ background: '#0f9d8a' }} />Nico<span className="tag-role">{tr('Cashier · AI')}</span></div></div>
      </Html>
    </group>
  );
}

export default function Mart({ m, lamps }) {
  const inside = useOffice((s) => s.boss && s.bossInMart);
  const sign = useMemo(() => label('ATLAS MART', { color: '#ffffff', bg: '#0f9d8a' }), []);
  const open = useMemo(() => label('OPEN 24/7', { w: 512, h: 160, color: '#16321f', bg: '#ffd166', font: '800 84px Inter, system-ui, sans-serif' }), []);
  const glow = 0.4 + lamps * 1.4;
  const H = MART.height;
  const wallH = inside ? 1.2 : H;
  const light = useRef();
  useFrame(() => { if (light.current) light.current.intensity = 6 + lamps * 16; });
  const { walls, fixtures, front, back, hz, door, cz, cx } = m;
  return (
    <group>
      {/* floor */}
      <mesh rotation-x={-Math.PI / 2} position={[cx, 0.02, cz]} receiveShadow><planeGeometry args={[front - back, hz * 2]} /><meshStandardMaterial color="#e9ecef" roughness={0.5} /></mesh>
      {/* back and side walls */}
      {walls.slice(0, 3).map((b, i) => { const { pos, size } = box(b, 0, wallH); return <mesh key={i} position={pos} castShadow receiveShadow><boxGeometry args={size} /><meshStandardMaterial color="#f6f3ee" roughness={0.85} /></mesh>; })}
      {/* the glass front, either side of the door, and the door frame */}
      {walls.slice(3).map((b, i) => {
        const { pos, size } = box(b, 0.3, H - 0.6);
        return (
          <group key={i}>
            <mesh position={pos}><boxGeometry args={size} /><meshStandardMaterial color="#cfe7ff" transparent opacity={0.25} roughness={0.05} metalness={0.3} emissive="#ffe9b8" emissiveIntensity={glow * 0.25} depthWrite={false} /></mesh>
            <mesh position={[pos[0], 0.15, pos[2]]}><boxGeometry args={[size[0] + 0.05, 0.3, size[2]]} /><meshStandardMaterial color="#2b2f36" /></mesh>
          </group>
        );
      })}
      {[door[0], door[1]].map((z) => <mesh key={z} position={[front, (H - 0.6) / 2, z]}><boxGeometry args={[0.3, H - 0.6, 0.12]} /><meshStandardMaterial color="#2b2f36" /></mesh>)}
      {/* the band over the front: stripes, then the name */}
      {!inside && (
        <group>
          <mesh position={[front + 0.02, H - 0.3, cz]}><boxGeometry args={[0.2, 0.6, hz * 2 + 0.3]} /><meshStandardMaterial color="#0f9d8a" /></mesh>
          {STRIPES.map((c, i) => <mesh key={i} position={[front + 0.13, H - 0.5 + i * 0.12, cz]}><boxGeometry args={[0.02, 0.1, hz * 2 + 0.3]} /><meshBasicMaterial color={c} toneMapped={false} /></mesh>)}
          <group position={[front + 0.4, H + 0.55, cz]}>
            <mesh castShadow><boxGeometry args={[0.25, 1.0, 6.6]} /><meshStandardMaterial color="#0f9d8a" emissive="#0f9d8a" emissiveIntensity={0.2 + lamps * 0.6} /></mesh>
            <mesh position-x={0.13} rotation-y={Math.PI / 2}><planeGeometry args={[6.4, 0.92]} /><meshBasicMaterial map={sign} toneMapped={false} /></mesh>
          </group>
          <mesh position={[front + 0.16, 2.95, door[1] + 1.6]} rotation-y={Math.PI / 2}><planeGeometry args={[1.5, 0.45]} /><meshBasicMaterial map={open} toneMapped={false} /></mesh>
          {/* the roof: an edge all round and a wide skylight in the middle */}
          <mesh position={[cx, H + 0.05, cz - hz + 0.6]} castShadow><boxGeometry args={[front - back + 0.3, 0.12, 1.2]} /><meshStandardMaterial color="#3a3f48" /></mesh>
          <mesh position={[cx, H + 0.05, cz + hz - 0.6]} castShadow><boxGeometry args={[front - back + 0.3, 0.12, 1.2]} /><meshStandardMaterial color="#3a3f48" /></mesh>
          <mesh position={[back + 0.6, H + 0.05, cz]} castShadow><boxGeometry args={[1.2, 0.12, hz * 2]} /><meshStandardMaterial color="#3a3f48" /></mesh>
          <mesh position={[front - 0.6, H + 0.05, cz]} castShadow><boxGeometry args={[1.2, 0.12, hz * 2]} /><meshStandardMaterial color="#3a3f48" /></mesh>
          <mesh position={[cx, H + 0.06, cz]}><boxGeometry args={[front - back - 2.4, 0.04, hz * 2 - 2.4]} /><meshStandardMaterial color="#cfe7ff" transparent opacity={0.18} depthWrite={false} /></mesh>
        </group>
      )}
      {/* striped awning over the door and windows */}
      {!inside && Array.from({ length: 14 }).map((_, i) => (
        <mesh key={i} position={[front + 0.75, H - 1.15, cz - hz + 0.5 + i * ((hz * 2 - 1) / 13)]} rotation-z={-0.38} castShadow>
          <boxGeometry args={[1.6, 0.05, (hz * 2 - 1) / 13]} /><meshStandardMaterial color={STRIPES[i % 2 ? 1 : i % 4 === 0 ? 0 : 2]} roughness={0.8} />
        </mesh>
      ))}

      {/* inside */}
      <Fridges b={fixtures.fridges} lamps={lamps} />
      {fixtures.shelves.map((b, i) => <Shelf key={i} b={b} />)}
      {(() => {
        const { pos, size } = box(fixtures.counter, 0, 1.05);
        return (
          <group>
            <RoundedBox args={size} radius={0.04} position={pos} castShadow receiveShadow><meshStandardMaterial color="#0f9d8a" roughness={0.5} /></RoundedBox>
            <mesh position={[pos[0], 1.08, pos[2]]}><boxGeometry args={[size[0] + 0.1, 0.05, size[2] + 0.1]} /><meshStandardMaterial color="#f4f1ec" /></mesh>
            <mesh position={[pos[0] - 0.1, 1.28, pos[2] - 0.8]} rotation-y={Math.PI / 2}><boxGeometry args={[0.45, 0.32, 0.06]} /><meshStandardMaterial color="#12161d" emissive="#7fc4ff" emissiveIntensity={0.4 + lamps * 0.5} /></mesh>
            {/* a warmer of buns and a rack of snacks on the counter */}
            <mesh position={[pos[0], 1.3, pos[2] + 1.0]}><boxGeometry args={[0.5, 0.4, 0.7]} /><meshStandardMaterial color="#ffd9a0" emissive="#ffb469" emissiveIntensity={0.3 + lamps * 0.6} transparent opacity={0.85} /></mesh>
          </group>
        );
      })()}
      {(() => { const { pos, size } = box(fixtures.coffee, 0, 1.5); return <RoundedBox args={size} radius={0.04} position={pos} castShadow><meshStandardMaterial color="#2a2e36" metalness={0.3} roughness={0.4} /></RoundedBox>; })()}
      {(() => {
        const { pos, size } = box(fixtures.arcade, 0, 1.8);
        return (
          <group>
            <RoundedBox args={size} radius={0.04} position={pos} castShadow><meshStandardMaterial color="#3b2a6e" /></RoundedBox>
            <mesh position={[pos[0], 1.3, pos[2] - size[2] / 2 - 0.005]} rotation-y={Math.PI}><planeGeometry args={[0.7, 0.5]} /><meshStandardMaterial color="#111" emissive="#ff3fa4" emissiveIntensity={0.6 + lamps * 0.6} /></mesh>
          </group>
        );
      })()}
      {fixtures.tables.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position-y={0.74} castShadow receiveShadow><cylinderGeometry args={[0.55, 0.55, 0.05, 28]} /><meshStandardMaterial color="#f4f1ec" roughness={0.4} /></mesh>
          <mesh position-y={0.37}><cylinderGeometry args={[0.05, 0.05, 0.74, 10]} /><meshStandardMaterial color="#2a2e35" /></mesh>
          {[-0.95, 0.95].map((dx) => (
            <group key={dx} position-x={dx}>
              <mesh position-y={0.45} castShadow><cylinderGeometry args={[0.2, 0.2, 0.06, 16]} /><meshStandardMaterial color="#e8684a" roughness={0.8} /></mesh>
              <mesh position-y={0.22}><cylinderGeometry args={[0.03, 0.1, 0.44, 8]} /><meshStandardMaterial color="#2a2e35" /></mesh>
            </group>
          ))}
        </group>
      ))}
      <Cashier at={m.cashier} />
      <pointLight ref={light} position={[cx, H - 0.4, cz]} intensity={8} distance={16} decay={1.5} color="#fff4dc" />
    </group>
  );
}

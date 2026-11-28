// What is outside the building: the lawn, the walk from the front door, the convenience store, trees, street lamps,
// the road and a couple of parked cars. Scenery, except the spot in front of the store, where idle helpers go for a snack.
import { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import { useOffice } from './store.js';

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

function Tree({ s = 1, tone = 0 }) {
  const leaf = ['#4f9a5e', '#3f8350', '#6aae62'][tone % 3];
  return (
    <group scale={s}>
      <mesh position-y={0.6} castShadow><cylinderGeometry args={[0.12, 0.17, 1.2, 10]} /><meshStandardMaterial color="#6b4a32" roughness={1} /></mesh>
      <mesh position-y={1.75} castShadow><icosahedronGeometry args={[0.95, 2]} /><meshStandardMaterial color={leaf} roughness={0.9} flatShading /></mesh>
      <mesh position={[0.35, 2.45, 0.1]} castShadow><icosahedronGeometry args={[0.6, 2]} /><meshStandardMaterial color={leaf} roughness={0.9} flatShading /></mesh>
    </group>
  );
}

function StreetLamp({ lamps }) {
  return (
    <group>
      <mesh position-y={1.6} castShadow><cylinderGeometry args={[0.05, 0.07, 3.2, 10]} /><meshStandardMaterial color="#2b2f36" metalness={0.5} roughness={0.5} /></mesh>
      <mesh position={[0.3, 3.2, 0]}><boxGeometry args={[0.7, 0.06, 0.1]} /><meshStandardMaterial color="#2b2f36" /></mesh>
      <mesh position={[0.6, 3.12, 0]}>
        <sphereGeometry args={[0.14, 16, 12]} />
        <meshStandardMaterial color="#fff2cf" emissive="#ffd98a" emissiveIntensity={0.15 + lamps * 3} />
      </mesh>
      {lamps > 0.3 && <pointLight position={[0.6, 3, 0]} intensity={10 * lamps} distance={9} decay={1.6} color="#ffd9a0" />}
    </group>
  );
}

function Car({ color = '#d9534f' }) {
  return (
    <group>
      <RoundedBox args={[1.7, 0.5, 3.6]} radius={0.16} position-y={0.5} castShadow><meshStandardMaterial color={color} roughness={0.35} metalness={0.3} /></RoundedBox>
      <RoundedBox args={[1.5, 0.48, 1.9]} radius={0.18} position={[0, 0.95, -0.15]} castShadow><meshStandardMaterial color="#1e2a38" roughness={0.15} metalness={0.4} /></RoundedBox>
      {[[-0.82, 1.1], [0.82, 1.1], [-0.82, -1.15], [0.82, -1.15]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.3, z]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.3, 0.3, 0.2, 18]} /><meshStandardMaterial color="#15171b" roughness={0.9} /></mesh>
      ))}
      {[-0.55, 0.55].map((x) => <mesh key={x} position={[x, 0.55, 1.81]}><boxGeometry args={[0.3, 0.12, 0.02]} /><meshStandardMaterial color="#fff6d8" emissive="#fff6d8" emissiveIntensity={0.4} /></mesh>)}
    </group>
  );
}

// The store: front faces +x, toward the office's front door.
function Store({ lamps }) {
  const sign = useMemo(() => label('ATLAS MART', { color: '#ffffff', bg: '#1f7ae0' }), []);
  const open = useMemo(() => label('OPEN 24/7', { w: 512, h: 160, color: '#16321f', bg: '#8fe3a8', font: '800 84px Inter, system-ui, sans-serif' }), []);
  const glow = 0.35 + lamps * 1.3;
  return (
    <group>
      {/* walls and roof */}
      <RoundedBox args={[5, 2.7, 6.4]} radius={0.06} position-y={1.35} castShadow receiveShadow><meshStandardMaterial color="#f4efe6" roughness={0.9} /></RoundedBox>
      <mesh position-y={2.76} castShadow><boxGeometry args={[5.4, 0.14, 6.8]} /><meshStandardMaterial color="#3a3f48" roughness={0.7} /></mesh>
      <mesh position={[0, 0.2, 0]}><boxGeometry args={[5.06, 0.4, 6.46]} /><meshStandardMaterial color="#d8d0c2" roughness={0.9} /></mesh>
      {/* sign on the roof, readable from the front and from the camera's side */}
      <group position={[2.2, 3.3, 0]}>
        <mesh castShadow><boxGeometry args={[0.2, 0.9, 5.2]} /><meshStandardMaterial color="#1f7ae0" /></mesh>
        <mesh position-x={0.105} rotation-y={Math.PI / 2}><planeGeometry args={[5.1, 0.86]} /><meshBasicMaterial map={sign} toneMapped={false} /></mesh>
      </group>
      <group position={[0, 3.3, 3.1]}>
        <mesh castShadow><boxGeometry args={[4.4, 0.9, 0.2]} /><meshStandardMaterial color="#1f7ae0" /></mesh>
        <mesh position-z={0.105}><planeGeometry args={[4.3, 0.82]} /><meshBasicMaterial map={sign} toneMapped={false} /></mesh>
      </group>
      {/* shop window and door (front, +x) */}
      <mesh position={[2.51, 1.45, -1.1]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[3.4, 1.7]} />
        <meshStandardMaterial color="#cfe7ff" emissive="#ffe9b8" emissiveIntensity={glow} roughness={0.1} />
      </mesh>
      {/* shelves seen through the window */}
      {[0, 1, 2].map((r) => (
        <group key={r} position={[2.52, 0.85 + r * 0.5, -1.1]} rotation-y={Math.PI / 2}>
          <mesh><planeGeometry args={[3.2, 0.04]} /><meshBasicMaterial color="#6b7280" /></mesh>
          {Array.from({ length: 11 }).map((_, i) => (
            <mesh key={i} position={[-1.45 + i * 0.29, 0.17, 0.001]}><planeGeometry args={[0.2, 0.3]} /><meshBasicMaterial color={['#e8684a', '#ffd166', '#2f9e64', '#3b82c4', '#b05cc2'][(i + r * 2) % 5]} toneMapped={false} /></mesh>
          ))}
        </group>
      ))}
      <mesh position={[2.51, 1.1, 1.9]} rotation-y={Math.PI / 2}>
        <planeGeometry args={[1.2, 2.1]} />
        <meshStandardMaterial color="#9fd0ee" emissive="#ffe9b8" emissiveIntensity={glow * 0.8} roughness={0.1} />
      </mesh>
      <mesh position={[2.53, 1.1, 1.9]} rotation-y={Math.PI / 2}><planeGeometry args={[0.04, 2.1]} /><meshBasicMaterial color="#2b2f36" /></mesh>
      <mesh position={[2.52, 2.35, 1.9]} rotation-y={Math.PI / 2}><planeGeometry args={[1.1, 0.34]} /><meshBasicMaterial map={open} toneMapped={false} /></mesh>
      {/* striped awning */}
      {Array.from({ length: 10 }).map((_, i) => (
        <mesh key={i} position={[2.95, 2.42, -2.7 + i * 0.6]} rotation-z={-0.38} castShadow>
          <boxGeometry args={[1.1, 0.05, 0.6]} /><meshStandardMaterial color={i % 2 ? '#ffffff' : '#e8684a'} roughness={0.8} />
        </mesh>
      ))}
      {/* out front: ice box, crates of drinks, a bin and a bench */}
      <RoundedBox args={[0.8, 1.0, 1.3]} radius={0.04} position={[3.0, 0.5, -2.4]} castShadow><meshStandardMaterial color="#e9f2fb" roughness={0.4} /></RoundedBox>
      <mesh position={[3.41, 0.62, -2.4]} rotation-y={Math.PI / 2}><planeGeometry args={[1.1, 0.5]} /><meshStandardMaterial color="#7cc4f0" emissive="#7cc4f0" emissiveIntensity={0.3 + lamps} /></mesh>
      {[[3.0, -1.2, '#e8684a'], [3.0, -0.65, '#ffd166'], [3.05, -0.92, '#3b82c4']].map(([x, z, c], i) => (
        <mesh key={i} position={[x, i === 2 ? 0.6 : 0.2, z]} castShadow><boxGeometry args={[0.5, 0.38, 0.5]} /><meshStandardMaterial color={c} roughness={0.8} /></mesh>
      ))}
      <mesh position={[3.0, 0.4, 2.95]} castShadow><cylinderGeometry args={[0.24, 0.2, 0.8, 16]} /><meshStandardMaterial color="#3f8350" roughness={0.7} /></mesh>
      <group position={[3.3, 0, 0.4]} rotation-y={Math.PI / 2}>
        <RoundedBox args={[1.5, 0.08, 0.45]} radius={0.03} position-y={0.45} castShadow><meshStandardMaterial color="#c9a27a" /></RoundedBox>
        {[-0.6, 0.6].map((x) => <mesh key={x} position={[x, 0.22, 0]}><boxGeometry args={[0.06, 0.44, 0.4]} /><meshStandardMaterial color="#1f232a" /></mesh>)}
      </group>
      {lamps > 0.3 && <pointLight position={[4, 2.2, 0]} intensity={14 * lamps} distance={10} decay={1.6} color="#ffe2a8" />}
    </group>
  );
}

export default function Outside({ L }) {
  const lamps = useOffice((s) => Math.round(s.sky.lamps * 10) / 10);
  const ground = useOffice((s) => s.sky.ground);
  const o = L.outside;
  const grass = useMemo(() => new THREE.Color('#6f9a5c').lerp(new THREE.Color('#1c2a22'), lamps * 0.85), [lamps]);
  const paving = useMemo(() => new THREE.Color('#c9c4ba').lerp(new THREE.Color('#2c3038'), lamps * 0.8), [lamps]);
  const tarmac = useMemo(() => new THREE.Color('#5a5f68').lerp(new THREE.Color('#1a1c21'), lamps * 0.7), [lamps]);

  const left = L.toWorld([0, 0])[0] - 0.5; // the building's left face, in the world
  const lawnW = L.W + 30, lawnD = L.H + 16;
  const lawnX = -9; // the lawn reaches further left, where the store is
  const [sx, sz] = L.toWorld(o.store);
  const pts = [...o.walk, o.storeSpot].map((c) => L.toWorld(c));
  const [dx0, dz0] = L.toWorld([L.door.x, L.H]);
  const [spx, spz] = L.toWorld(o.storeSpot);
  const roadX = left - 15.5;

  const trees = [
    [left - 3, -10, 1.1, 0], [left - 7, -11.5, 0.9, 1], [left - 11.5, -9.5, 1.2, 2], [left - 2.6, 9, 1, 1],
    [left - 9.5, 10.5, 1.15, 0], [left - 11.5, 15, 0.95, 2], [left + 6, L.H / 2 + 4.8, 1, 2], [left + 15, L.H / 2 + 5, 1.15, 0],
    [left + 27, L.H / 2 + 4.8, 0.95, 1], [left + L.W - 5, L.H / 2 + 5, 1.1, 2], [left + 12, -L.H / 2 - 4.2, 1.1, 1], [left + 30, -L.H / 2 - 4.4, 1, 0],
    [left + L.W + 3.5, -6, 1.1, 0], [left + L.W + 3.8, 7, 0.95, 2],
  ];

  return (
    <group>
      {/* lawn, and the building's own slab on top of it */}
      <RoundedBox args={[lawnW, 0.6, lawnD]} radius={0.3} position={[lawnX, -0.33, 0]} receiveShadow>
        <meshStandardMaterial color={grass} roughness={1} />
      </RoundedBox>
      <RoundedBox args={[L.W + 3, 0.6, L.H + 3]} radius={0.25} position-y={-0.31} receiveShadow>
        <meshStandardMaterial color={ground} roughness={1} />
      </RoundedBox>

      {/* the walk: out of the front door, along the front of the building, then up to the store */}
      {pts.slice(1).map(([bx, bz], i) => {
        const [ax, az] = pts[i];
        return (
          <mesh key={i} rotation-x={-Math.PI / 2} position={[(ax + bx) / 2, -0.006, (az + bz) / 2]} receiveShadow>
            <planeGeometry args={[Math.abs(ax - bx) + 2.2, Math.abs(az - bz) + 2.2]} />
            <meshStandardMaterial color={paving} roughness={0.95} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
          </mesh>
        );
      })}
      <mesh rotation-x={-Math.PI / 2} position={[spx, -0.008, spz]} receiveShadow>
        <planeGeometry args={[2.6, 7]} /><meshStandardMaterial color={paving} roughness={0.95} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>

      <group position={[sx, 0, sz]}><Store lamps={lamps} /></group>

      {/* the road, with two cars at the kerb */}
      <mesh rotation-x={-Math.PI / 2} position={[roadX, -0.022, 0]} receiveShadow>
        <planeGeometry args={[4.4, lawnD - 1.2]} /><meshStandardMaterial color={tarmac} roughness={0.95} />
      </mesh>
      {Array.from({ length: 9 }).map((_, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[roadX, -0.02, -lawnD / 2 + 3 + i * 4.1]}><planeGeometry args={[0.14, 1.6]} /><meshBasicMaterial color="#e8e2c8" /></mesh>
      ))}
      <group position={[roadX + 1.2, -0.03, -7]}><Car color="#d9534f" /></group>
      <group position={[roadX + 1.2, -0.03, 12.5]} rotation-y={Math.PI}><Car color="#2f6fb5" /></group>

      {trees.map(([x, z, s, tone], i) => <group key={i} position={[x, -0.03, z]}><Tree s={s} tone={tone} /></group>)}
      <group position={[dx0 + 2.8, -0.03, dz0 + 0.6]} rotation-y={Math.PI}><StreetLamp lamps={lamps} /></group>
      <group position={[spx + 1.9, -0.03, spz + 3.2]} rotation-y={Math.PI}><StreetLamp lamps={lamps} /></group>
      <group position={[roadX + 2.6, -0.03, -1]}><StreetLamp lamps={lamps} /></group>
    </group>
  );
}

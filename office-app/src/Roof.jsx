// The roof, with a view deck on top. It lifts off whenever there is something to watch inside (someone working, a
// helper picked, an order on its way) and settles back when the floor is quiet. The panel can pin it on or off.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import { useOffice } from './store.js';
import { tr } from './i18n.js';

// The roof's walking surface: high enough that boss mode, walking about inside with the roof on, has room for its
// camera (BOSS_CEILING in Boss.jsx stays under it).
export const TOP = 10.0;
const WALL = 1.3; // where the outer walls stop: a band of windows fills the gap up to the slab
const LIFT = 15;

function deckTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  for (let i = 0; i < 16; i++) {
    g.fillStyle = `hsl(${24 + Math.random() * 6}, ${32 + Math.random() * 8}%, ${44 + Math.random() * 9}%)`;
    g.fillRect(0, i * 32, 512, 32);
    g.fillStyle = 'rgba(40,24,10,0.45)';
    g.fillRect(0, i * 32, 512, 2);
    g.globalAlpha = 0.08;
    for (let k = 0; k < 5; k++) { g.fillStyle = '#2a1708'; g.fillRect(0, i * 32 + Math.random() * 30, 512, 1); }
    g.globalAlpha = 1;
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function textTexture(text) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.font = '800 190px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 512, 136);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Table({ color }) {
  return (
    <group>
      <mesh position-y={0.72} castShadow><cylinderGeometry args={[0.6, 0.6, 0.05, 28]} /><meshStandardMaterial color="#f4f1ec" roughness={0.4} /></mesh>
      <mesh position-y={0.36}><cylinderGeometry args={[0.04, 0.04, 0.72, 10]} /><meshStandardMaterial color="#2a2e35" /></mesh>
      <mesh position-y={0.03}><cylinderGeometry args={[0.3, 0.32, 0.05, 20]} /><meshStandardMaterial color="#2a2e35" /></mesh>
      {/* umbrella */}
      <mesh position-y={1.5}><cylinderGeometry args={[0.025, 0.025, 1.6, 8]} /><meshStandardMaterial color="#c9ced6" metalness={0.6} roughness={0.3} /></mesh>
      <mesh position-y={2.25} castShadow><coneGeometry args={[1.25, 0.5, 8]} /><meshStandardMaterial color={color} roughness={0.85} flatShading /></mesh>
      {[0, 1, 2, 3].map((i) => (
        <group key={i} position={[Math.sin((i / 4) * Math.PI * 2 + 0.6) * 0.95, 0, Math.cos((i / 4) * Math.PI * 2 + 0.6) * 0.95]}>
          <mesh position-y={0.44} castShadow><cylinderGeometry args={[0.2, 0.2, 0.06, 16]} /><meshStandardMaterial color="#2f343d" roughness={0.8} /></mesh>
          <mesh position-y={0.22}><cylinderGeometry args={[0.025, 0.1, 0.44, 8]} /><meshStandardMaterial color="#2a2e35" /></mesh>
        </group>
      ))}
    </group>
  );
}

function Lounger() {
  return (
    <group>
      <RoundedBox args={[0.7, 0.1, 1.7]} radius={0.04} position-y={0.3} castShadow><meshStandardMaterial color="#f4efe6" roughness={0.9} /></RoundedBox>
      <RoundedBox args={[0.7, 0.1, 0.7]} radius={0.04} position={[0, 0.52, -0.95]} rotation-x={0.75} castShadow><meshStandardMaterial color="#f4efe6" roughness={0.9} /></RoundedBox>
      {[[-0.3, 0.6], [0.3, 0.6], [-0.3, -0.6], [0.3, -0.6]].map(([x, z], i) => <mesh key={i} position={[x, 0.13, z]}><boxGeometry args={[0.05, 0.26, 0.05]} /><meshStandardMaterial color="#8a6a48" /></mesh>)}
    </group>
  );
}

function Planter({ w = 2 }) {
  return (
    <group>
      <RoundedBox args={[w, 0.5, 0.6]} radius={0.04} position-y={0.25} castShadow><meshStandardMaterial color="#5c6470" roughness={0.8} /></RoundedBox>
      {Array.from({ length: Math.round(w / 0.55) }).map((_, i, a) => (
        <mesh key={i} position={[-w / 2 + 0.35 + i * ((w - 0.7) / Math.max(1, a.length - 1)), 0.72, 0]} castShadow>
          <icosahedronGeometry args={[0.32, 1]} /><meshStandardMaterial color={i % 2 ? '#4f9a5e' : '#3f8350'} roughness={0.9} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function AcUnit() {
  return (
    <group>
      <RoundedBox args={[1.5, 0.9, 1.1]} radius={0.04} position-y={0.55} castShadow><meshStandardMaterial color="#cfd4da" roughness={0.6} metalness={0.2} /></RoundedBox>
      <mesh position={[0, 1.005, 0]} rotation-x={-Math.PI / 2}><circleGeometry args={[0.4, 24]} /><meshStandardMaterial color="#2a2e35" roughness={0.8} /></mesh>
      {[-0.6, 0.6].map((x) => <mesh key={x} position={[x, 0.05, 0]}><boxGeometry args={[0.1, 0.1, 1.1]} /><meshStandardMaterial color="#5c6470" /></mesh>)}
    </group>
  );
}

function Deck({ x0, x1, z0, z1, lamps }) {
  const wood = useMemo(() => deckTexture(), []);
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  wood.repeat.set(w / 4, d / 4);
  const rail = (key, pos, size) => (
    <group key={key} position={pos}>
      <mesh position-y={0.5}><boxGeometry args={[size[0], 1, size[1]]} /><meshStandardMaterial color="#d6ebf7" transparent opacity={0.22} roughness={0.05} metalness={0.2} depthWrite={false} /></mesh>
      <mesh position-y={1.02}><boxGeometry args={[size[0] + 0.04, 0.05, size[1] + 0.04]} /><meshStandardMaterial color="#565e6a" metalness={0.6} roughness={0.35} /></mesh>
    </group>
  );
  const bulbs = Array.from({ length: 12 });
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[cx, TOP + 0.03, cz]} receiveShadow>
        <planeGeometry args={[w, d]} /><meshStandardMaterial map={wood} roughness={0.7} />
      </mesh>
      {rail('f', [cx, TOP, z1], [w, 0.05])}
      {rail('b', [cx, TOP, z0], [w, 0.05])}
      {rail('l', [x0, TOP, cz], [0.05, d])}
      {rail('r', [x1, TOP, cz], [0.05, d])}

      <group position={[x0 + 3.2, TOP, cz + 1.4]}><Table color="#1f7ae0" /></group>
      <group position={[cx + 0.5, TOP, cz + 1.8]}><Table color="#e8684a" /></group>
      <group position={[x1 - 3.2, TOP, cz + 1.2]}><Table color="#f4efe6" /></group>
      <group position={[x0 + 2.2, TOP, z0 + 1.6]} rotation-y={0.5}><Lounger /></group>
      <group position={[x0 + 3.7, TOP, z0 + 1.5]} rotation-y={0.4}><Lounger /></group>
      <group position={[cx, TOP, z0 + 0.5]}><Planter w={5} /></group>
      <group position={[x1 - 0.5, TOP, cz - 0.6]} rotation-y={Math.PI / 2}><Planter w={3} /></group>

      {/* coin-operated viewers at the front rail */}
      {[x0 + 6, x1 - 6].map((x) => (
        <group key={x} position={[x, TOP, z1 - 0.6]}>
          <mesh position-y={0.6}><cylinderGeometry args={[0.05, 0.08, 1.2, 10]} /><meshStandardMaterial color="#5c6470" metalness={0.6} roughness={0.4} /></mesh>
          <mesh position={[0, 1.28, 0.05]} rotation-x={Math.PI / 2 - 0.25}><cylinderGeometry args={[0.13, 0.16, 0.5, 14]} /><meshStandardMaterial color="#2f6fb5" metalness={0.4} roughness={0.4} /></mesh>
        </group>
      ))}

      {/* string lights across the deck */}
      {[x0 + 0.3, x1 - 0.3].map((x) => <mesh key={x} position={[x, TOP + 1.5, cz]}><cylinderGeometry args={[0.035, 0.035, 3, 8]} /><meshStandardMaterial color="#2a2e35" /></mesh>)}
      {bulbs.map((_, i) => {
        const k = i / (bulbs.length - 1);
        return (
          <mesh key={i} position={[x0 + 0.3 + k * (w - 0.6), TOP + 2.95 - Math.sin(k * Math.PI) * 0.55, cz]}>
            <sphereGeometry args={[0.07, 10, 8]} />
            <meshStandardMaterial color="#fff2cf" emissive="#ffd98a" emissiveIntensity={0.3 + lamps * 3.5} />
          </mesh>
        );
      })}
      {lamps > 0.3 && <pointLight position={[cx, TOP + 2.4, cz]} intensity={16 * lamps} distance={14} decay={1.6} color="#ffd9a0" />}
    </group>
  );
}

export default function Roof({ L }) {
  const mode = useOffice((s) => s.roofMode);
  const busy = useOffice((s) => Object.values(s.agents).some((a) => (a.state !== 'idle' && !(a.state === 'walking' && a.away))));
  const picked = useOffice((s) => !!s.selected || !!s.order?.busy || s.boss);
  const lamps = useOffice((s) => Math.round(s.sky.lamps * 10) / 10);
  const setRoofClosed = useOffice((s) => s.setRoofClosed);
  const roofClosed = useOffice((s) => s.roofClosed);
  const boss = useOffice((s) => s.boss);
  const wantOpen = mode === 'off' || (mode === 'auto' && (busy || picked));
  const ref = useRef();
  const st = useRef({ y: wantOpen ? LIFT : 0, open: wantOpen });
  const sign = useMemo(() => textTexture('ATLAS'), []);

  // closing waits a moment, so the roof does not bounce between two steps of the same job
  useEffect(() => {
    if (wantOpen) { st.current.open = true; setRoofClosed(false); return undefined; }
    const t = setTimeout(() => { st.current.open = false; }, mode === 'on' ? 0 : 3500);
    return () => clearTimeout(t);
  }, [wantOpen, mode, setRoofClosed]);

  useFrame((_, dt) => {
    const s = st.current;
    const target = s.open ? LIFT : 0;
    s.y += (target - s.y) * Math.min(1, dt * 4);
    if (!ref.current) return;
    ref.current.position.y = s.y;
    ref.current.visible = s.y < LIFT - 0.4;
    const closed = s.y < 0.6;
    if (closed !== useOffice.getState().roofClosed && !s.open) setRoofClosed(closed);
  });

  const W = L.W, H = L.H;
  const x0 = -W / 2 + 1.2, x1 = Math.min(-W / 2 + 21, W / 2 - 14), z0 = 0.8, z1 = H / 2 - 0.9;
  const par = [[0, -H / 2 - 0.15, W + 0.9, 0.3], [0, H / 2 + 0.15, W + 0.9, 0.3], [-W / 2 - 0.15, 0, 0.3, H + 0.3], [W / 2 + 0.15, 0, 0.3, H + 0.3]];
  const panels = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) panels.push([W / 2 - 13 + c * 2.3, -H / 2 + 2.6 + r * 2.2]);

  return (
    <group ref={ref}>
      {/* the slab and its parapet */}
      <mesh position-y={TOP - 0.15} castShadow receiveShadow><boxGeometry args={[W + 0.6, 0.3, H + 0.6]} /><meshStandardMaterial color="#d6d2c9" roughness={0.95} /></mesh>
      {par.map(([x, z, w, d], i) => (
        <group key={i} position={[x, TOP, z]}>
          <mesh position-y={0.22} castShadow><boxGeometry args={[w, 0.5, d]} /><meshStandardMaterial color="#f3eee6" roughness={0.9} /></mesh>
          <mesh position-y={0.49}><boxGeometry args={[w + 0.06, 0.05, d + 0.06]} /><meshStandardMaterial color="#3a3f48" roughness={0.7} /></mesh>
        </group>
      ))}
      {/* a band of dark glass between the walls and the slab, lit from inside at night; left out while the boss walks
          about inside, so the camera behind them always sees in */}
      {!boss && par.map(([x, z, w, d], i) => (
        <mesh key={`g${i}`} position={[x * (1 - 0.3 / (Math.abs(x) || 1)), (WALL + TOP - 0.3) / 2, z * (1 - 0.3 / (Math.abs(z) || 1))]}>
          <boxGeometry args={[Math.max(0.12, w - 0.9), TOP - 0.3 - WALL, Math.max(0.12, d - 0.3)]} />
          <meshStandardMaterial color="#24364d" roughness={0.08} metalness={0.5} emissive="#ffd9a0" emissiveIntensity={lamps * 0.55} />
        </mesh>
      ))}
      {/* helipad */}
      <group position={[6, TOP + 0.02, 3.5]} rotation-x={-Math.PI / 2}>
        <mesh><ringGeometry args={[2.6, 2.9, 48]} /><meshBasicMaterial color="#e8b93c" /></mesh>
        {[-0.7, 0.7].map((x) => <mesh key={x} position={[x, 0, 0.001]}><planeGeometry args={[0.36, 2.4]} /><meshBasicMaterial color="#f4f1ea" /></mesh>)}
        <mesh position-z={0.001}><planeGeometry args={[1.4, 0.36]} /><meshBasicMaterial color="#f4f1ea" /></mesh>
      </group>
      {/* name on the front */}
      <group position={[W / 2 - 9, TOP + 1.0, H / 2 + 0.2]}>
        <mesh castShadow><boxGeometry args={[7.4, 1.5, 0.2]} /><meshStandardMaterial color="#1f7ae0" emissive="#1f7ae0" emissiveIntensity={0.15 + lamps * 0.7} /></mesh>
        <mesh position-z={0.105}><planeGeometry args={[6.6, 1.6]} /><meshBasicMaterial map={sign} transparent toneMapped={false} /></mesh>
      </group>

      <Deck x0={x0} x1={x1} z0={z0} z1={z1} lamps={lamps} />
      {roofClosed && !boss && (
        <Html position={[(x0 + x1) / 2, TOP + 0.1, z1 - 0.2]} center distanceFactor={16} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`room-label ${lamps > 0.5 ? 'night' : 'day'}`}>{tr('View deck')}</div>
        </Html>
      )}

      {/* the way up: a stair house with a door onto the deck */}
      <group position={[x0 + 2, TOP, -1.2]}>
        <RoundedBox args={[3.4, 2.4, 3]} radius={0.05} position-y={1.2} castShadow receiveShadow><meshStandardMaterial color="#f3eee6" roughness={0.9} /></RoundedBox>
        <mesh position-y={2.45}><boxGeometry args={[3.7, 0.12, 3.3]} /><meshStandardMaterial color="#3a3f48" /></mesh>
        <mesh position={[0, 1.05, 1.51]}><planeGeometry args={[1.1, 2.0]} /><meshStandardMaterial color="#2f6fb5" roughness={0.5} /></mesh>
        <mesh position={[0.38, 1.05, 1.52]}><circleGeometry args={[0.05, 12]} /><meshStandardMaterial color="#c9ced6" metalness={0.8} roughness={0.3} /></mesh>
      </group>

      {/* the working part of the roof: solar panels, air conditioning, a water tank */}
      {panels.map(([x, z], i) => (
        <group key={i} position={[x, TOP, z]}>
          <mesh position-y={0.42} rotation-x={-0.45} castShadow><boxGeometry args={[2.0, 0.06, 1.3]} /><meshStandardMaterial color="#16305a" metalness={0.7} roughness={0.25} /></mesh>
          <mesh position={[0, 0.2, -0.3]}><boxGeometry args={[1.8, 0.4, 0.05]} /><meshStandardMaterial color="#5c6470" /></mesh>
        </group>
      ))}
      {[[4, -H / 2 + 3], [7, -H / 2 + 3], [10, -H / 2 + 3]].map(([x, z]) => <group key={x} position={[x, TOP, z]}><AcUnit /></group>)}
      <group position={[W / 2 - 4, TOP, H / 2 - 4.5]}>
        <mesh position-y={1.5} castShadow><cylinderGeometry args={[1.3, 1.3, 2.2, 24]} /><meshStandardMaterial color="#c9ced6" metalness={0.5} roughness={0.4} /></mesh>
        <mesh position-y={2.75}><coneGeometry args={[1.38, 0.5, 24]} /><meshStandardMaterial color="#8d939c" metalness={0.5} roughness={0.4} /></mesh>
        {[[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]].map(([x, z], i) => <mesh key={i} position={[x, 0.2, z]}><boxGeometry args={[0.1, 0.4, 0.1]} /><meshStandardMaterial color="#5c6470" /></mesh>)}
      </group>
    </group>
  );
}

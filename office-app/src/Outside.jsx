// What is outside the building: the lawn, the walk from the front door, the convenience store, trees, street lamps,
// the road and a couple of parked cars. Scenery, except the spot in front of the store, where idle helpers go for a snack.
import { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import { useOffice } from './store.js';
import Mart from './Mart.jsx';

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


export default function Outside({ L }) {
  const lamps = useOffice((s) => Math.round(s.sky.lamps * 10) / 10);
  const ground = useOffice((s) => s.sky.ground);
  const o = L.outside;
  const grass = useMemo(() => new THREE.Color('#6f9a5c').lerp(new THREE.Color('#1c2a22'), lamps * 0.85), [lamps]);
  const paving = useMemo(() => new THREE.Color('#c9c4ba').lerp(new THREE.Color('#2c3038'), lamps * 0.8), [lamps]);

  const left = L.toWorld([0, 0])[0] - 0.5; // the building's left face, in the world
  const lawnW = L.W + 30, lawnD = L.H + 16;
  const lawnX = -9; // the lawn reaches further left, where the store is
  const [sx, sz] = L.toWorld(o.store);
  const pts = [...o.walk, o.storeSpot].map((c) => L.toWorld(c));
  const [dx0, dz0] = L.toWorld([L.door.x, L.H]);
  const [spx, spz] = L.toWorld(o.storeSpot);

  const trees = [
    [left - 3, -10, 1.1, 0], [left - 7, -11.5, 0.9, 1], [left - 11.5, -12.5, 1.2, 2], [left - 13, 12, 1, 1],
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

      <Mart m={L.mart.world} lamps={lamps} />

      {/* the streets and the rest of the city: City.jsx */}

      {trees.map(([x, z, s, tone], i) => <group key={i} position={[x, -0.03, z]}><Tree s={s} tone={tone} /></group>)}
      <group position={[dx0 + 2.8, -0.03, dz0 + 0.6]} rotation-y={Math.PI}><StreetLamp lamps={lamps} /></group>
      <group position={[spx + 1.9, -0.03, spz + 3.2]} rotation-y={Math.PI}><StreetLamp lamps={lamps} /></group>
    </group>
  );
}

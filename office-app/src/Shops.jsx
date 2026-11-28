// The shops across the street from the office (city.js STORES): a 24-hour convenience store, a supermarket with its
// car park, a pharmacy and a bakery café. Made-up names and colours. Their signs and windows light up at night.
import { useMemo } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import { STORES, CARPARK, CARPARK_CARS } from './city.js';

function signTexture(text, color, ink = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 1024, 160);
  g.fillStyle = ink; g.font = '800 92px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 92;
  while (size > 40 && g.measureText(text).width > 960) { size -= 4; g.font = `800 ${size}px Inter, system-ui, sans-serif`; }
  g.fillText(text, 512, 84);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The shop window: shelves and goods seen through the glass, lit from inside at night. */
function windowTexture(seed) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#dfe7ee'; g.fillRect(0, 0, 512, 256);
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const goods = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#f97316', '#14b8a6', '#eab308'];
  for (let row = 0; row < 4; row++) {
    const y = 40 + row * 52;
    g.fillStyle = '#9aa3ad'; g.fillRect(0, y + 34, 512, 6);
    for (let x = 6; x < 506; x += 14 + r() * 10) { g.fillStyle = goods[Math.floor(r() * goods.length)]; g.fillRect(x, y + 34 - (14 + r() * 18), 10, 14 + r() * 18); }
  }
  g.fillStyle = 'rgba(30,60,90,0.25)'; g.fillRect(0, 0, 512, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Store({ s, lamps }) {
  const w = s.x1 - s.x0, cx = (s.x0 + s.x1) / 2, cz = s.z0 + s.d / 2;
  const sign = useMemo(() => signTexture(s.name, s.band), [s]);
  const hours = useMemo(() => signTexture(s.open, '#111827', s.stripe), [s]);
  const glass = useMemo(() => windowTexture(s.x0 * 13 + 7), [s]);
  const glow = 0.15 + lamps * 1.3;
  const signH = s.big ? 1.6 : 1.0;
  const doorW = s.big ? 4 : 1.8;
  return (
    <group>
      {/* the building */}
      <mesh position={[cx, s.h / 2, cz]} castShadow receiveShadow><boxGeometry args={[w, s.h, s.d]} /><meshStandardMaterial color={s.wall} roughness={0.85} /></mesh>
      <mesh position={[cx, s.h + 0.15, cz]}><boxGeometry args={[w + 0.3, 0.3, s.d + 0.3]} /><meshStandardMaterial color="#6b7178" roughness={0.9} /></mesh>
      {/* the coloured band and the sign on it */}
      <mesh position={[cx, s.h - signH / 2 - 0.2, s.z0 - 0.06]}><boxGeometry args={[w + 0.2, signH + 0.4, 0.12]} /><meshStandardMaterial color={s.band} emissive={s.band} emissiveIntensity={lamps * 0.35} roughness={0.6} /></mesh>
      <mesh position={[cx, s.h - signH / 2 - 0.2, s.z0 - 0.125]} rotation-y={Math.PI}>
        <planeGeometry args={[Math.min(w - 0.6, signH * 6.4), signH]} /><meshStandardMaterial map={sign} emissiveMap={sign} emissive="#ffffff" emissiveIntensity={glow} toneMapped={false} />
      </mesh>
      <mesh position={[cx, s.h - signH - 0.5, s.z0 - 0.07]}><boxGeometry args={[w + 0.2, 0.18, 0.1]} /><meshStandardMaterial color={s.stripe} roughness={0.6} /></mesh>
      {/* the shop windows either side of the door, and the door */}
      {[-1, 1].map((side) => {
        const ww = (w - doorW) / 2 - 0.5;
        if (ww < 0.8) return null;
        return (
          <mesh key={side} position={[cx + side * (doorW / 2 + 0.25 + ww / 2), 1.45, s.z0 - 0.05]} rotation-y={Math.PI}>
            <planeGeometry args={[ww, 2.3]} /><meshStandardMaterial map={glass} emissiveMap={glass} emissive="#fff4d6" emissiveIntensity={0.1 + lamps * 0.9} roughness={0.15} metalness={0.1} />
          </mesh>
        );
      })}
      <mesh position={[cx, 1.2, s.z0 - 0.05]} rotation-y={Math.PI}><planeGeometry args={[doorW, 2.4]} /><meshStandardMaterial color="#9ec5e0" emissive="#fff4d6" emissiveIntensity={0.08 + lamps * 0.7} transparent opacity={0.75} roughness={0.1} metalness={0.3} /></mesh>
      <mesh position={[cx, 2.5, s.z0 - 0.06]}><boxGeometry args={[doorW + 0.2, 0.1, 0.08]} /><meshStandardMaterial color="#3a3f48" /></mesh>
      {/* opening hours over the door */}
      <mesh position={[cx, 2.85, s.z0 - 0.07]} rotation-y={Math.PI}><planeGeometry args={[1.8, 0.28]} /><meshStandardMaterial map={hours} emissiveMap={hours} emissive="#ffffff" emissiveIntensity={glow} toneMapped={false} /></mesh>
      {/* a small shop's awning */}
      {!s.big && (
        <mesh position={[cx, 3.05, s.z0 - 0.7]} rotation-x={0.35}><boxGeometry args={[w - 0.4, 0.06, 1.4]} /><meshStandardMaterial color={s.band} roughness={0.8} /></mesh>
      )}
      {/* a light over the entrance at night */}
      {lamps > 0.3 && <pointLight position={[cx, 3.2, s.z0 - 2]} intensity={10 * lamps} distance={9} decay={1.6} color="#fff1cf" />}
    </group>
  );
}

const CAR_COLORS = ['#d9534f', '#2f6fb5', '#f2f2f2', '#1f232a', '#e0a03a', '#7a8494'];

function CarPark() {
  const { x0, x1, z0, z1 } = CARPARK;
  const lines = [];
  for (let x = x0 + 2.5; x <= x1 - 2.5; x += 5) for (const z of [44, 47.5]) lines.push([x, z]);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[(x0 + x1) / 2, 0.13, (z0 + z1) / 2]} receiveShadow><planeGeometry args={[x1 - x0, z1 - z0]} /><meshStandardMaterial color="#5a5f66" roughness={0.95} /></mesh>
      {lines.map(([x, z], i) => <mesh key={i} rotation-x={-Math.PI / 2} position={[x, 0.14, z]}><planeGeometry args={[0.12, 4.4]} /><meshBasicMaterial color="#e8e2c8" /></mesh>)}
      {CARPARK_CARS.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position-y={0.5} castShadow><boxGeometry args={[1.8, 0.6, 4.0]} /><meshStandardMaterial color={CAR_COLORS[i % CAR_COLORS.length]} roughness={0.35} metalness={0.3} /></mesh>
          <mesh position-y={0.97}><boxGeometry args={[1.55, 0.5, 2.0]} /><meshStandardMaterial color="#1e2a38" roughness={0.15} metalness={0.4} /></mesh>
        </group>
      ))}
      {/* trolleys by the door */}
      <group position={[x1 - 3, 0.14, z1 - 1.2]}>
        {[0, 0.5, 1.0].map((dx) => (
          <RoundedBox key={dx} args={[0.45, 0.5, 0.8]} radius={0.04} position={[dx, 0.55, 0]}><meshStandardMaterial color="#9aa0a8" metalness={0.7} roughness={0.3} wireframe /></RoundedBox>
        ))}
      </group>
    </group>
  );
}

export default function Shops({ lamps }) {
  return (
    <group>
      {STORES.map((s) => <Store key={s.id} s={s} lamps={lamps} />)}
      <CarPark />
    </group>
  );
}

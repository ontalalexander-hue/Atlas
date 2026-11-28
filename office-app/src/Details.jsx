// Ofis jihozlari. Har biri rejadagi kataklardan joyini oladi: <Decor L={L} item={{ type, cells, ... }} />
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useOffice } from './store.js';
import { rank } from './severity.js';
import { tr } from './i18n.js';

const METAL = '#1f232a';
const OAK = '#c9a27a';

function textTexture(text, { w = 1024, h = 160, color = '#fff', font = '700 92px Inter, system-ui, sans-serif' } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = color; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// sirena va server LED'lari: panika chegarasidan yuqori faol muammo bo'lsa yonadi
const useAlert = () => useOffice((s) => {
  const min = rank(s.settings.panicAt);
  return Object.values(s.agents).some((a) => a.state === 'panic' || a.down || rank(a.sev) >= min);
});

// --------------------------------------------------------------------------
function Bookshelf() {
  const books = useMemo(() => {
    const cols = ['#d9534f', '#3b82c4', '#e0a03a', '#2f9e64', '#6f42c1', '#f2f2f0', '#2b2f36'];
    const out = [];
    for (let shelf = 0; shelf < 3; shelf++) {
      let bx = -0.85;
      while (bx < 0.8) {
        const w = 0.06 + Math.random() * 0.06, h = 0.22 + Math.random() * 0.1;
        if (Math.random() > 0.12) out.push({ x: bx + w / 2, y: 0.25 + shelf * 0.42 + h / 2, w, h, c: cols[Math.floor(Math.random() * cols.length)] });
        bx += w + 0.01;
      }
    }
    return out;
  }, []);
  return (
    <group position-z={-0.25}>
      <mesh position-y={0.7} castShadow><boxGeometry args={[1.9, 1.4, 0.4]} /><meshStandardMaterial color={OAK} /></mesh>
      <mesh position={[0, 0.72, 0.03]}><boxGeometry args={[1.8, 1.3, 0.38]} /><meshStandardMaterial color="#efe8de" /></mesh>
      {[0, 1, 2].map((s) => <mesh key={s} position={[0, 0.24 + s * 0.42, 0.04]}><boxGeometry args={[1.8, 0.03, 0.38]} /><meshStandardMaterial color={OAK} /></mesh>)}
      {books.map((b, i) => <mesh key={i} position={[b.x, b.y, 0.06]}><boxGeometry args={[b.w, b.h, 0.26]} /><meshStandardMaterial color={b.c} /></mesh>)}
    </group>
  );
}

function ServerRack({ gpu }) {
  const leds = useRef([]);
  const siren = useRef();
  const alert = useAlert();
  const base = useMemo(() => new THREE.Color(gpu ? '#a78bfa' : '#4cc38a'), [gpu]);
  const red = useMemo(() => new THREE.Color('#ff2d3a'), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    leds.current.forEach((m, i) => {
      if (!m) return;
      const c = alert ? red : base;
      m.color.copy(c); m.emissive.copy(c);
      m.emissiveIntensity = Math.sin(t * (alert ? 14 : 3 + (i % 5)) + i) > 0.2 ? 2.2 : 0.2;
    });
    if (siren.current) {
      siren.current.rotation.y = t * 8;
      siren.current.children[0].material.emissiveIntensity = alert ? 2 + Math.sin(t * 16) * 1.5 : 0.05;
    }
  });
  return (
    <group>
      <group ref={siren} position={[0, 2.0, 0.1]}>
        <mesh><cylinderGeometry args={[0.1, 0.12, 0.16, 16]} /><meshStandardMaterial color="#ff3b3b" emissive="#ff1a1a" emissiveIntensity={0.05} transparent opacity={0.9} /></mesh>
        <mesh position-y={-0.1}><cylinderGeometry args={[0.13, 0.13, 0.04, 16]} /><meshStandardMaterial color="#2b2f36" /></mesh>
      </group>
      {[-0.45, 0.45].map((rx, r) => (
        <group key={rx} position-x={rx}>
          <RoundedBox args={[0.8, 1.9, 0.75]} radius={0.03} position-y={0.95} castShadow><meshStandardMaterial color={gpu ? '#1d1730' : '#16191f'} roughness={0.5} metalness={0.4} /></RoundedBox>
          {Array.from({ length: 8 }).map((_, i) => (
            <group key={i} position={[0, 0.3 + i * 0.2, 0.38]}>
              <mesh><boxGeometry args={[0.68, 0.14, 0.01]} /><meshStandardMaterial color="#262b33" /></mesh>
              <mesh position={[0.26, 0, 0.008]}>
                <boxGeometry args={[0.04, 0.03, 0.01]} />
                <meshStandardMaterial ref={(m) => (leds.current[r * 8 + i] = m)} color="#4cc38a" emissive="#4cc38a" emissiveIntensity={1} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

function MonitorWall() {
  const bars = useRef([]);
  const alert = useAlert();
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    bars.current.forEach((b, i) => {
      if (!b) return;
      const v = alert ? 0.2 + Math.abs(Math.sin(t * 9 + i)) * 0.8 : 0.35 + 0.3 * Math.sin(t * 1.3 + i * 0.7) + 0.15 * Math.sin(t * 3.1 + i);
      b.scale.y = Math.max(0.05, v);
      b.position.y = -0.28 + (0.56 * b.scale.y) / 2;
    });
  });
  const barColor = alert ? '#ff3b3b' : '#4cc38a';
  return (
    <group>
      <mesh position-y={0.5}><boxGeometry args={[0.1, 1, 0.1]} /><meshStandardMaterial color={METAL} /></mesh>
      <mesh position-y={0.03}><boxGeometry args={[1.2, 0.06, 0.5]} /><meshStandardMaterial color={METAL} /></mesh>
      {[-0.52, 0.52].map((sx, k) => (
        <group key={sx} position={[sx, 1.25, 0.06]} rotation-y={-sx * 0.25}>
          <RoundedBox args={[1.02, 0.66, 0.04]} radius={0.015} castShadow><meshStandardMaterial color={METAL} /></RoundedBox>
          <mesh position-z={0.022}><planeGeometry args={[0.96, 0.6]} /><meshStandardMaterial color="#0c1118" emissive={alert ? '#3a0a0e' : '#0a1a14'} emissiveIntensity={1} /></mesh>
          {Array.from({ length: 8 }).map((_, i) => (
            <mesh key={i} ref={(m) => (bars.current[k * 8 + i] = m)} position={[-0.4 + i * 0.115, 0, 0.025]}>
              <planeGeometry args={[0.07, 0.56]} /><meshBasicMaterial color={k === 1 && !alert ? '#5aa9ff' : barColor} toneMapped={false} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Ups() {
  return (
    <group>
      <RoundedBox args={[0.5, 0.7, 0.6]} radius={0.03} position-y={0.35} castShadow><meshStandardMaterial color="#20242b" /></RoundedBox>
      <mesh position={[0, 0.55, 0.305]}><planeGeometry args={[0.2, 0.08]} /><meshStandardMaterial color="#5aa9ff" emissive="#5aa9ff" emissiveIntensity={1} /></mesh>
    </group>
  );
}

function StickyBoard({ bugs }) {
  const notes = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
    x: -0.75 + (i % 6) * 0.3 + (Math.random() - 0.5) * 0.05,
    y: 1.07 + Math.floor(i / 6) * -0.28,
    c: bugs ? ['#ff6b6b', '#ff9f9f', '#ffe066', '#ff6b6b'][i % 4] : ['#ffe066', '#ff9f9f', '#9fe2bf', '#a0c4ff'][i % 4],
    r: (Math.random() - 0.5) * 0.15,
    show: i < 4 || Math.random() > 0.15,
  })), [bugs]);
  return (
    <group position-z={0.16}>
      <mesh position-y={0.85}><boxGeometry args={[2, 0.8, 0.03]} /><meshStandardMaterial color="#ffffff" roughness={0.3} /></mesh>
      {notes.filter((n) => n.show).map((n, i) => (
        <mesh key={i} position={[n.x, n.y, 0.02]} rotation-z={n.r}><planeGeometry args={[0.2, 0.2]} /><meshStandardMaterial color={n.c} /></mesh>
      ))}
    </group>
  );
}

function StandBoard({ bugs, chart }) {
  return (
    <group rotation-y={-Math.PI / 2}>
      {[-0.5, 0.5].map((lx) => <mesh key={lx} position={[lx, 0.75, 0]}><boxGeometry args={[0.04, 1.5, 0.04]} /><meshStandardMaterial color="#9aa0a8" metalness={0.6} /></mesh>)}
      <mesh position-y={1.1} castShadow><boxGeometry args={[1.1, 0.7, 0.03]} /><meshStandardMaterial color="#fbfbfb" roughness={0.2} /></mesh>
      {chart
        ? [0.2, 0.35, 0.28, 0.5, 0.42, 0.6].map((hgt, i) => (
          <mesh key={i} position={[-0.4 + i * 0.16, 0.8 + hgt / 2, 0.02]}><planeGeometry args={[0.1, hgt]} /><meshBasicMaterial color="#7c4dff" /></mesh>
        ))
        : [[-0.3, 1.25, bugs ? '#ff3b47' : '#3b82c4', 0.3], [0.05, 1.05, '#e8684a', 0.4], [0.3, 1.25, bugs ? '#ff3b47' : '#2f9e64', 0.2]].map(([px, py, c, w], i) => (
          <mesh key={i} position={[px, py, 0.02]}><planeGeometry args={[w, bugs ? 0.12 : 0.03]} /><meshBasicMaterial color={c} /></mesh>
        ))}
    </group>
  );
}

function Armchair() {
  return (
    <group rotation-y={Math.PI / 2}>
      <RoundedBox args={[0.85, 0.36, 0.8]} radius={0.1} position-y={0.3} castShadow><meshStandardMaterial color="#7b5a3d" roughness={0.6} /></RoundedBox>
      <RoundedBox args={[0.85, 0.5, 0.2]} radius={0.08} position={[0, 0.62, -0.32]} castShadow><meshStandardMaterial color="#7b5a3d" roughness={0.6} /></RoundedBox>
      {[-0.4, 0.4].map((ax) => <RoundedBox key={ax} args={[0.12, 0.42, 0.75]} radius={0.05} position={[ax, 0.45, 0]}><meshStandardMaterial color="#6a4c33" roughness={0.6} /></RoundedBox>)}
    </group>
  );
}

function Globe() {
  const g = useRef();
  useFrame((_, dt) => { if (g.current) g.current.rotation.y += dt * 0.4; });
  return (
    <group>
      <mesh position-y={0.3}><cylinderGeometry args={[0.04, 0.18, 0.6, 12]} /><meshStandardMaterial color={OAK} /></mesh>
      <mesh ref={g} position-y={0.85} rotation-z={0.4} castShadow><sphereGeometry args={[0.26, 24, 16]} /><meshStandardMaterial color="#3d7fc4" roughness={0.5} /></mesh>
      <mesh position-y={0.85} rotation-z={0.4}><torusGeometry args={[0.3, 0.012, 6, 32]} /><meshStandardMaterial color="#c9a227" metalness={0.8} roughness={0.3} /></mesh>
    </group>
  );
}

function FloorLamp() {
  const lamps = useOffice((s) => s.sky.lamps);
  return (
    <group>
      <mesh position-y={0.02}><cylinderGeometry args={[0.18, 0.18, 0.04, 20]} /><meshStandardMaterial color={METAL} /></mesh>
      <mesh position-y={0.8}><cylinderGeometry args={[0.018, 0.018, 1.6, 8]} /><meshStandardMaterial color={METAL} /></mesh>
      <mesh position-y={1.62} castShadow>
        <cylinderGeometry args={[0.16, 0.24, 0.3, 24, 1, true]} />
        <meshStandardMaterial color="#f3ead9" emissive="#ffd8a0" emissiveIntensity={lamps * 1.4} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Printer() {
  return (
    <group>
      <RoundedBox args={[0.7, 0.55, 0.55]} radius={0.03} position-y={0.28} castShadow><meshStandardMaterial color="#e9ebee" /></RoundedBox>
      <RoundedBox args={[0.62, 0.22, 0.5]} radius={0.03} position-y={0.66} castShadow><meshStandardMaterial color="#d4d7dc" /></RoundedBox>
      <mesh position={[0, 0.79, 0.05]}><boxGeometry args={[0.4, 0.01, 0.3]} /><meshStandardMaterial color="#ffffff" /></mesh>
      <mesh position={[0.22, 0.7, 0.26]}><planeGeometry args={[0.1, 0.05]} /><meshStandardMaterial color="#4cc38a" emissive="#4cc38a" emissiveIntensity={1} /></mesh>
    </group>
  );
}

function CoatRack() {
  return (
    <group>
      <mesh position-y={0.85}><cylinderGeometry args={[0.025, 0.03, 1.7, 8]} /><meshStandardMaterial color={OAK} /></mesh>
      <mesh position={[0.12, 1.35, 0]} castShadow><capsuleGeometry args={[0.1, 0.45, 4, 8]} /><meshStandardMaterial color="#3a4252" /></mesh>
      <mesh position={[-0.1, 1.45, 0.05]} castShadow><capsuleGeometry args={[0.08, 0.3, 4, 8]} /><meshStandardMaterial color="#c0574b" /></mesh>
      <mesh position-y={0.03}><cylinderGeometry args={[0.2, 0.2, 0.04, 16]} /><meshStandardMaterial color={OAK} /></mesh>
    </group>
  );
}

function LoungeChair() {
  return (
    <group rotation-y={Math.PI / 2}>
      <RoundedBox args={[0.8, 0.12, 0.85]} radius={0.05} position-y={0.36} castShadow><meshStandardMaterial color="#e8d9c4" /></RoundedBox>
      <RoundedBox args={[0.8, 0.6, 0.12]} radius={0.05} position={[0, 0.66, -0.38]} rotation-x={-0.25} castShadow><meshStandardMaterial color="#e8d9c4" /></RoundedBox>
      {[[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]].map(([lx, lz], i) => (
        <mesh key={i} position={[lx, 0.15, lz]}><cylinderGeometry args={[0.02, 0.02, 0.3, 6]} /><meshStandardMaterial color={OAK} /></mesh>
      ))}
    </group>
  );
}

function Easel() {
  const art = useMemo(() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 192;
    const g = c.getContext('2d');
    g.fillStyle = '#f7f3ec'; g.fillRect(0, 0, 256, 192);
    const cols = ['#e0a03a', '#3b82c4', '#b05cc2', '#2f9e64', '#e8684a'];
    for (let i = 0; i < 9; i++) { g.fillStyle = cols[i % cols.length]; g.globalAlpha = 0.85; g.fillRect(20 + (i % 3) * 76, 20 + Math.floor(i / 3) * 54, 60 + (i % 2) * 10, 40); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }, []);
  return (
    <group rotation-y={-0.4}>
      {[-0.25, 0.25].map((lx) => <mesh key={lx} position={[lx, 0.8, 0]} rotation-z={lx > 0 ? -0.08 : 0.08}><boxGeometry args={[0.04, 1.6, 0.04]} /><meshStandardMaterial color={OAK} /></mesh>)}
      <mesh position={[0, 0.7, -0.3]} rotation-x={0.35}><boxGeometry args={[0.04, 1.4, 0.04]} /><meshStandardMaterial color={OAK} /></mesh>
      <mesh position={[0, 1.15, 0.04]} castShadow><boxGeometry args={[0.8, 0.6, 0.03]} /><meshStandardMaterial map={art} /></mesh>
    </group>
  );
}

// Mobil dasturchilar uchun: telefon va planshetlar turgan sinov stoli
function DeviceLab() {
  const screens = useRef([]);
  useFrame(({ clock }) => {
    screens.current.forEach((m, i) => { if (m) m.color.setHSL((0.55 + 0.05 * Math.sin(clock.elapsedTime * 0.7 + i)) % 1, 0.75, 0.55); });
  });
  const devices = [[-0.7, 0.16, 0.3], [-0.35, 0.16, 0.3], [0, 0.22, 0.42], [0.42, 0.16, 0.3], [0.75, 0.3, 0.22]];
  return (
    <group>
      <RoundedBox args={[1.9, 0.06, 0.7]} radius={0.02} position-y={0.75} castShadow receiveShadow><meshStandardMaterial color="#f4f4f2" /></RoundedBox>
      {[-0.85, 0.85].map((lx) => <mesh key={lx} position={[lx, 0.37, 0]}><boxGeometry args={[0.05, 0.74, 0.6]} /><meshStandardMaterial color={METAL} /></mesh>)}
      {devices.map(([x, w, h], i) => (
        <group key={i} position={[x, 0.78 + h / 2 + 0.02, -0.05]} rotation-x={-0.25}>
          <RoundedBox args={[w, h, 0.02]} radius={0.015}><meshStandardMaterial color="#111" /></RoundedBox>
          <mesh position-z={0.011}><planeGeometry args={[w - 0.025, h - 0.04]} /><meshBasicMaterial ref={(m) => (screens.current[i] = m)} toneMapped={false} /></mesh>
        </group>
      ))}
      <mesh position={[0, 0.8, 0.22]}><boxGeometry args={[1.4, 0.02, 0.06]} /><meshStandardMaterial color="#9aa0a8" /></mesh>
    </group>
  );
}

// Katta telefon maketi (Flutter/mobil xonasi uchun)
function PhoneStand() {
  return (
    <group rotation-y={-Math.PI / 2 + 0.3}>
      <mesh position-y={0.04}><cylinderGeometry args={[0.3, 0.3, 0.06, 24]} /><meshStandardMaterial color={METAL} /></mesh>
      <RoundedBox args={[0.7, 1.4, 0.08]} radius={0.08} position-y={0.85} castShadow><meshStandardMaterial color="#14171c" /></RoundedBox>
      <mesh position={[0, 0.85, 0.042]}><planeGeometry args={[0.6, 1.25]} /><meshBasicMaterial color="#0ea5e9" toneMapped={false} /></mesh>
      {[0.35, 0.15, -0.05, -0.25].map((y, i) => (
        <mesh key={i} position={[0, 0.85 + y, 0.045]}><planeGeometry args={[0.48, i === 0 ? 0.14 : 0.12]} /><meshBasicMaterial color={i === 0 ? '#ffffff' : '#7dd3fc'} toneMapped={false} /></mesh>
      ))}
      <mesh position={[0.18, 0.32, 0.045]}><circleGeometry args={[0.07, 20]} /><meshBasicMaterial color="#ffffff" toneMapped={false} /></mesh>
    </group>
  );
}

function BeanBag() {
  return <mesh position-y={0.25} scale={[1, 0.62, 1]} castShadow><sphereGeometry args={[0.42, 24, 18]} /><meshStandardMaterial color="#0ea5e9" roughness={1} /></mesh>;
}

function Fridge() {
  return (
    <group>
      <RoundedBox args={[0.7, 1.75, 0.65]} radius={0.05} position-y={0.88} castShadow><meshStandardMaterial color="#e6e9ed" metalness={0.3} roughness={0.35} /></RoundedBox>
      <mesh position={[0, 1.2, 0.33]}><boxGeometry args={[0.66, 0.01, 0.01]} /><meshStandardMaterial color="#9aa0a8" /></mesh>
      <mesh position={[0.25, 0.95, 0.34]}><boxGeometry args={[0.03, 0.4, 0.03]} /><meshStandardMaterial color="#9aa0a8" metalness={0.8} /></mesh>
      <mesh position={[-0.1, 1.5, 0.33]}><planeGeometry args={[0.14, 0.14]} /><meshStandardMaterial color="#ffe066" /></mesh>
    </group>
  );
}

function Arcade() {
  const scr = useRef();
  useFrame(({ clock }) => { if (scr.current) scr.current.color.setHSL((clock.elapsedTime * 0.15) % 1, 0.8, 0.55); });
  return (
    <group>
      <RoundedBox args={[0.66, 1.7, 0.66]} radius={0.04} position-y={0.85} castShadow><meshStandardMaterial color="#3b2a6e" /></RoundedBox>
      <mesh position={[0, 1.3, 0.335]} rotation-x={-0.15}><planeGeometry args={[0.5, 0.4]} /><meshBasicMaterial ref={scr} toneMapped={false} /></mesh>
      <mesh position={[0, 0.98, 0.38]} rotation-x={-0.6}><boxGeometry args={[0.6, 0.04, 0.2]} /><meshStandardMaterial color="#1b1b1f" /></mesh>
      {['#ff3b3b', '#ffe066', '#5aa9ff'].map((c, i) => (
        <mesh key={i} position={[-0.12 + i * 0.13, 1.01, 0.4]}><cylinderGeometry args={[0.025, 0.025, 0.03, 10]} /><meshStandardMaterial color={c} emissive={c} emissiveIntensity={0.6} /></mesh>
      ))}
      <mesh position={[0, 1.62, 0.335]}><planeGeometry args={[0.55, 0.1]} /><meshBasicMaterial color="#ff5ec4" toneMapped={false} /></mesh>
    </group>
  );
}

function WaterCooler() {
  return (
    <group>
      <RoundedBox args={[0.4, 0.95, 0.4]} radius={0.03} position-y={0.48} castShadow><meshStandardMaterial color="#eef1f4" /></RoundedBox>
      <mesh position-y={1.18} castShadow><cylinderGeometry args={[0.16, 0.16, 0.42, 20]} /><meshPhysicalMaterial color="#9fd3ff" transparent opacity={0.6} roughness={0.1} /></mesh>
      <mesh position={[0, 0.7, 0.21]}><boxGeometry args={[0.06, 0.06, 0.04]} /><meshStandardMaterial color="#3b82c4" /></mesh>
    </group>
  );
}

function Vending() {
  const lamps = useOffice((s) => s.sky.lamps);
  return (
    <group rotation-y={-Math.PI / 2}>
      <RoundedBox args={[0.85, 1.8, 0.7]} radius={0.04} position-y={0.9} castShadow><meshStandardMaterial color="#d9534f" /></RoundedBox>
      <mesh position={[-0.1, 1.05, 0.355]}><planeGeometry args={[0.55, 1.1]} /><meshStandardMaterial color="#cfe7ff" emissive="#cfe7ff" emissiveIntensity={0.3 + lamps * 0.8} /></mesh>
      {Array.from({ length: 12 }).map((_, i) => (
        <mesh key={i} position={[-0.3 + (i % 4) * 0.13, 1.45 - Math.floor(i / 4) * 0.3, 0.36]}><boxGeometry args={[0.08, 0.14, 0.02]} /><meshStandardMaterial color={['#ffe066', '#2f9e64', '#3b82c4', '#e8684a'][i % 4]} /></mesh>
      ))}
    </group>
  );
}

function Bench() {
  return (
    <group>
      <RoundedBox args={[1.8, 0.08, 0.5]} radius={0.03} position-y={0.45} castShadow><meshStandardMaterial color={OAK} /></RoundedBox>
      {[-0.75, 0.75].map((lx) => <mesh key={lx} position={[lx, 0.22, 0]}><boxGeometry args={[0.06, 0.44, 0.44]} /><meshStandardMaterial color={METAL} /></mesh>)}
    </group>
  );
}

// Haqiqiy vaqtni ko'rsatuvchi soat
function Clock() {
  const hour = useRef(); const minute = useRef(); const second = useRef();
  useFrame(() => {
    const d = new Date();
    const s = d.getSeconds() + d.getMilliseconds() / 1000;
    const m = d.getMinutes() + s / 60;
    const h = (d.getHours() % 12) + m / 60;
    if (second.current) second.current.rotation.z = -(s / 60) * Math.PI * 2;
    if (minute.current) minute.current.rotation.z = -(m / 60) * Math.PI * 2;
    if (hour.current) hour.current.rotation.z = -(h / 12) * Math.PI * 2;
  });
  const hand = (ref, len, w, color, z) => (
    <group ref={ref} position-z={z}><mesh position-y={len / 2}><planeGeometry args={[w, len]} /><meshBasicMaterial color={color} /></mesh></group>
  );
  return (
    <group position={[0, 1.08, 0.07]}>
      <mesh rotation-x={Math.PI / 2}><cylinderGeometry args={[0.32, 0.32, 0.05, 40]} /><meshStandardMaterial color={METAL} /></mesh>
      <group position-z={0.03}>
        <mesh><circleGeometry args={[0.29, 40]} /><meshBasicMaterial color="#fbfbf8" /></mesh>
        {Array.from({ length: 12 }).map((_, i) => (
          <mesh key={i} position={[Math.sin((i / 12) * Math.PI * 2) * 0.24, Math.cos((i / 12) * Math.PI * 2) * 0.24, 0.002]}>
            <circleGeometry args={[i % 3 === 0 ? 0.018 : 0.009, 8]} /><meshBasicMaterial color="#1b1f27" />
          </mesh>
        ))}
        {hand(hour, 0.14, 0.022, '#1b1f27', 0.004)}
        {hand(minute, 0.21, 0.014, '#1b1f27', 0.006)}
        {hand(second, 0.23, 0.006, '#e8684a', 0.008)}
      </group>
    </group>
  );
}

function Sign() {
  const tex = useMemo(() => textTexture('ATLAS OFFICE', { color: '#1b1f27' }), []);
  return (
    <group position={[0, 1.12, 0.07]}>
      <RoundedBox args={[3.4, 0.42, 0.04]} radius={0.02}><meshStandardMaterial color="#f7f5f1" /></RoundedBox>
      <mesh position-z={0.022}><planeGeometry args={[3.3, 0.5]} /><meshBasicMaterial map={tex} transparent toneMapped={false} /></mesh>
      <mesh position={[-1.55, 0, 0.025]}><circleGeometry args={[0.1, 20]} /><meshBasicMaterial color="#1f7ae0" /></mesh>
    </group>
  );
}

// ---------- Equipment room ----------
function Shelf({ tools }) {
  const items = tools
    ? ['#3b82c4', '#2a2e35', '#e8684a', '#2a2e35', '#ffd166', '#2a2e35']
    : ['#c9a27a', '#b98f63', '#c9a27a', '#d8b78e', '#b98f63', '#c9a27a'];
  return (
    <group>
      {[-0.95, 0.95].map((x) => [-0.2, 0.2].map((z) => (
        <mesh key={`${x}${z}`} position={[x, 0.95, z]} castShadow><boxGeometry args={[0.05, 1.9, 0.05]} /><meshStandardMaterial color={METAL} metalness={0.5} roughness={0.5} /></mesh>
      )))}
      {[0.2, 0.75, 1.3, 1.85].map((y) => <mesh key={y} position-y={y} castShadow><boxGeometry args={[1.95, 0.04, 0.5]} /><meshStandardMaterial color="#8d939c" metalness={0.4} roughness={0.5} /></mesh>)}
      {[0.2, 0.75, 1.3].map((y, r) => items.slice(0, 4).map((c, i) => (
        <mesh key={`${r}${i}`} position={[-0.68 + i * 0.45, y + (tools ? 0.14 : 0.19), 0]} castShadow>
          <boxGeometry args={tools ? [0.3, 0.22, 0.3] : [0.38, 0.32, 0.4]} />
          <meshStandardMaterial color={items[(i + r) % items.length]} roughness={0.85} />
        </mesh>
      )))}
    </group>
  );
}

function Lockers() {
  return (
    <group>
      <RoundedBox args={[1.9, 1.9, 0.5]} radius={0.02} position-y={0.95} castShadow><meshStandardMaterial color="#5f7fa6" roughness={0.6} metalness={0.2} /></RoundedBox>
      {[0, 1, 2, 3].map((i) => (
        <group key={i} position={[-0.705 + i * 0.47, 0.95, 0.255]}>
          <mesh><planeGeometry args={[0.43, 1.8]} /><meshStandardMaterial color={i % 2 ? '#6c8db5' : '#7396bf'} roughness={0.6} /></mesh>
          <mesh position={[0.15, 0, 0.005]}><planeGeometry args={[0.03, 0.14]} /><meshBasicMaterial color="#1f232a" /></mesh>
          {[0.62, 0.7, 0.78].map((y) => <mesh key={y} position={[0, y, 0.005]}><planeGeometry args={[0.28, 0.02]} /><meshBasicMaterial color="#3f5a7c" /></mesh>)}
        </group>
      ))}
    </group>
  );
}

function Workbench() {
  return (
    <group>
      <RoundedBox args={[1.9, 0.07, 0.8]} radius={0.02} position-y={0.85} castShadow receiveShadow><meshStandardMaterial color={OAK} roughness={0.6} /></RoundedBox>
      {[-0.85, 0.85].map((x) => <mesh key={x} position={[x, 0.42, 0]} castShadow><boxGeometry args={[0.07, 0.84, 0.7]} /><meshStandardMaterial color={METAL} /></mesh>)}
      {/* a laptop being set up, a headset and a box of parts */}
      <mesh position={[-0.45, 0.9, 0.05]}><boxGeometry args={[0.42, 0.02, 0.3]} /><meshStandardMaterial color="#c9ced6" metalness={0.6} roughness={0.3} /></mesh>
      <mesh position={[-0.45, 1.04, -0.1]} rotation-x={-0.25}><boxGeometry args={[0.42, 0.28, 0.02]} /><meshStandardMaterial color="#1b1f27" emissive="#3a72d6" emissiveIntensity={0.5} /></mesh>
      <mesh position={[0.25, 0.93, 0.1]} rotation-x={Math.PI / 2}><torusGeometry args={[0.11, 0.025, 8, 20, Math.PI]} /><meshStandardMaterial color={METAL} /></mesh>
      <mesh position={[0.65, 0.98, -0.05]} castShadow><boxGeometry args={[0.34, 0.2, 0.3]} /><meshStandardMaterial color="#e8684a" roughness={0.8} /></mesh>
    </group>
  );
}

function Crates() {
  return (
    <group>
      <mesh position={[0, 0.25, 0]} castShadow><boxGeometry args={[0.8, 0.5, 0.7]} /><meshStandardMaterial color="#c9a27a" roughness={0.9} /></mesh>
      <mesh position={[0.05, 0.72, 0.02]} rotation-y={0.3} castShadow><boxGeometry args={[0.6, 0.42, 0.55]} /><meshStandardMaterial color="#b98f63" roughness={0.9} /></mesh>
    </group>
  );
}

// ---------- Training room ----------
function Whiteboard() {
  return (
    <group position-z={-0.3}>
      <RoundedBox args={[2.8, 1.3, 0.05]} radius={0.02} position-y={1.25} castShadow><meshStandardMaterial color="#8d939c" metalness={0.4} roughness={0.5} /></RoundedBox>
      <mesh position={[0, 1.25, 0.028]}><planeGeometry args={[2.68, 1.18]} /><meshStandardMaterial color="#fbfbf8" roughness={0.3} /></mesh>
      {[[-0.9, 1.55, 0.7, '#1f7ae0'], [-0.75, 1.35, 1.0, '#1b1f27'], [-0.85, 1.15, 0.8, '#1b1f27'], [0.7, 1.45, 0.6, '#e8684a'], [0.6, 1.0, 0.8, '#2f9e64']].map(([x, y, w, c], i) => (
        <mesh key={i} position={[x, y, 0.03]}><planeGeometry args={[w, 0.035]} /><meshBasicMaterial color={c} /></mesh>
      ))}
      {[-1.2, 1.2].map((x) => <mesh key={x} position={[x, 0.3, 0]}><boxGeometry args={[0.05, 0.6, 0.05]} /><meshStandardMaterial color={METAL} /></mesh>)}
    </group>
  );
}

function SchoolDesk() {
  return (
    <group>
      <RoundedBox args={[1.5, 0.05, 0.6]} radius={0.02} position-y={0.74} castShadow receiveShadow><meshStandardMaterial color="#f4f1ec" roughness={0.4} /></RoundedBox>
      {[-0.68, 0.68].map((x) => <mesh key={x} position={[x, 0.37, 0]}><boxGeometry args={[0.04, 0.74, 0.5]} /><meshStandardMaterial color={METAL} /></mesh>)}
      <mesh position={[0, 0.78, 0.02]}><boxGeometry args={[0.36, 0.02, 0.26]} /><meshStandardMaterial color="#c9ced6" metalness={0.5} roughness={0.3} /></mesh>
      {[-0.38, 0.38].map((x) => (
        <group key={x} position={[x, 0, 0.62]}>
          <RoundedBox args={[0.42, 0.06, 0.4]} radius={0.03} position-y={0.46} castShadow><meshStandardMaterial color="#3b82c4" roughness={0.8} /></RoundedBox>
          <RoundedBox args={[0.4, 0.36, 0.05]} radius={0.03} position={[0, 0.72, 0.19]} castShadow><meshStandardMaterial color="#3b82c4" roughness={0.8} /></RoundedBox>
          <mesh position-y={0.23}><cylinderGeometry args={[0.025, 0.1, 0.44, 8]} /><meshStandardMaterial color={METAL} /></mesh>
        </group>
      ))}
    </group>
  );
}

// ---------- Reception, by the front door ----------
function Reception() {
  const tex = useMemo(() => textTexture('ATLAS', { w: 512, h: 160, color: '#ffffff', font: '800 110px Inter, system-ui, sans-serif' }), []);
  const lamps = useOffice((s) => s.sky.lamps);
  return (
    <group position-z={0.1}>
      <RoundedBox args={[2.1, 1.05, 0.6]} radius={0.05} position-y={0.52} castShadow receiveShadow><meshStandardMaterial color="#f4f1ec" roughness={0.5} /></RoundedBox>
      <RoundedBox args={[2.2, 0.06, 0.7]} radius={0.02} position-y={1.08} castShadow><meshStandardMaterial color={OAK} roughness={0.45} /></RoundedBox>
      <mesh position={[0, 0.55, 0.305]}><planeGeometry args={[1.7, 0.5]} /><meshStandardMaterial color="#1f7ae0" emissive="#1f7ae0" emissiveIntensity={0.35 + lamps * 0.9} /></mesh>
      <mesh position={[0, 0.55, 0.31]}><planeGeometry args={[1.3, 0.4]} /><meshBasicMaterial map={tex} transparent toneMapped={false} /></mesh>
      <mesh position={[0.75, 1.2, 0]}><cylinderGeometry args={[0.07, 0.06, 0.18, 12]} /><meshStandardMaterial color="#ece7df" /></mesh>
      <mesh position={[0.75, 1.38, 0]}><icosahedronGeometry args={[0.13, 1]} /><meshStandardMaterial color="#5aa166" roughness={0.8} /></mesh>
      <mesh position={[-0.6, 1.15, -0.05]}><boxGeometry args={[0.3, 0.1, 0.2]} /><meshStandardMaterial color={METAL} /></mesh>
    </group>
  );
}

// ---------- The floor board: how much of the Claude plan is left, and what got done today ----------
const fmtTokens = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n || 0));
const fmtReset = (ms) => {
  if (!ms) return '';
  const d = new Date(ms);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { weekday: 'short', hour: 'numeric' });
};

function UsageBoard() {
  const usage = useOffice((s) => s.usage);
  const working = useOffice((s) => Object.values(s.agents).filter((a) => a.state === 'working' || a.state === 'thinking').length);
  const canvas = useMemo(() => { const c = document.createElement('canvas'); c.width = 1024; c.height = 512; return c; }, []);
  const tex = useMemo(() => { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }, [canvas]);
  useEffect(() => {
    const g = canvas.getContext('2d');
    g.fillStyle = '#0b1220'; g.fillRect(0, 0, 1024, 512);
    g.fillStyle = '#1f7ae0'; g.fillRect(0, 0, 1024, 84);
    g.fillStyle = '#fff'; g.font = '800 46px Inter, system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillText('CLAUDE USAGE', 32, 44);
    g.font = '600 30px Inter, system-ui, sans-serif'; g.textAlign = 'right';
    g.fillText(working ? `${working} working now` : 'floor is quiet', 992, 44);

    const row = (y, title, w, used) => {
      g.textAlign = 'left'; g.fillStyle = '#9fb3cc'; g.font = '700 30px Inter, system-ui, sans-serif';
      g.fillText(title, 32, y);
      const left = w?.leftPct;
      if (typeof left === 'number') {
        const color = left > 40 ? '#4cc38a' : left > 15 ? '#f0a548' : '#ff5a5f';
        g.fillStyle = '#1b2638'; g.fillRect(32, y + 28, 640, 44);
        g.fillStyle = color; g.fillRect(32, y + 28, Math.max(6, 640 * (left / 100)), 44);
        g.fillStyle = '#fff'; g.font = '800 54px Inter, system-ui, sans-serif'; g.textAlign = 'right';
        g.fillText(`${Math.round(left)}%`, 870, y + 50);
        g.fillStyle = '#9fb3cc'; g.font = '600 26px Inter, system-ui, sans-serif';
        g.fillText('left', 940, y + 54);
        g.textAlign = 'left'; g.fillStyle = '#7f92ab'; g.font = '500 24px Inter, system-ui, sans-serif';
        g.fillText(`${w.resetsAt ? `resets ${fmtReset(w.resetsAt)}` : ''}${used ? `   ·   ${fmtTokens(used.tokens)} tokens` : ''}`, 32, y + 98);
      } else {
        g.fillStyle = '#fff'; g.font = '800 50px Inter, system-ui, sans-serif';
        g.fillText(used ? `${fmtTokens(used.tokens)} tokens used` : '—', 32, y + 54);
        g.fillStyle = '#7f92ab'; g.font = '500 24px Inter, system-ui, sans-serif';
        g.fillText('share of the plan not reported yet', 32, y + 98);
      }
    };
    row(128, '5-HOUR WINDOW', usage?.limits?.fiveHour, usage?.used?.fiveHour);
    row(268, 'THIS WEEK', usage?.limits?.sevenDay, usage?.used?.sevenDay);

    const done = Object.values(usage?.done || {}).reduce((a, b) => a + b, 0);
    g.fillStyle = '#121c2e'; g.fillRect(0, 424, 1024, 88);
    g.textAlign = 'left'; g.fillStyle = '#dbe7f7'; g.font = '700 32px Inter, system-ui, sans-serif';
    g.fillText(`TODAY   ${done} task${done === 1 ? '' : 's'} done   ·   ${fmtTokens(usage?.used?.today?.tokens || 0)} tokens`, 32, 468);
    tex.needsUpdate = true;
  }, [usage, working, canvas, tex]);
  return (
    <group position={[0, 0, 0.16]}>
      {[-1.4, 1.4].map((x) => <mesh key={x} position={[x, 0.3, -0.04]} castShadow><boxGeometry args={[0.07, 0.6, 0.07]} /><meshStandardMaterial color={METAL} metalness={0.5} roughness={0.4} /></mesh>)}
      <RoundedBox args={[3.3, 1.66, 0.08]} radius={0.03} position-y={1.3} castShadow><meshStandardMaterial color={METAL} roughness={0.4} /></RoundedBox>
      <mesh position={[0, 1.3, 0.045]}><planeGeometry args={[3.18, 1.56]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
    </group>
  );
}

// The front door, in the front wall, with a mat inside and a step outside
function Entrance({ L }) {
  const [x, z] = L.toWorld([L.door.x, L.door.z]);
  const mat = useMemo(() => textTexture(tr('WELCOME'), { w: 512, h: 128, color: '#f4f1ea', font: '800 72px Inter, system-ui, sans-serif' }), []);
  return (
    <group position={[x, 0, z]}>
      {[-1.05, 1.05].map((dx) => (
        <mesh key={dx} position={[dx, 1.2, 0]} castShadow><boxGeometry args={[0.12, 2.4, 0.36]} /><meshStandardMaterial color="#2b2f36" /></mesh>
      ))}
      <mesh position={[0, 2.38, 0]}><boxGeometry args={[2.22, 0.12, 0.36]} /><meshStandardMaterial color="#2b2f36" /></mesh>
      {/* the glass doors, standing open */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.98, 1.15, -0.45]} rotation-y={-s * 0.45}>
          <boxGeometry args={[0.04, 2.2, 0.9]} />
          <meshStandardMaterial color="#cfe6f5" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      ))}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, -1.0]}><planeGeometry args={[1.8, 1.1]} /><meshStandardMaterial color="#3a4252" roughness={1} /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.014, -1.0]}><planeGeometry args={[1.6, 0.4]} /><meshBasicMaterial map={mat} transparent /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.004, 1.1]} receiveShadow><planeGeometry args={[2.4, 2]} /><meshStandardMaterial color="#9aa0a8" /></mesh>
    </group>
  );
}

// ---------- Restrooms ----------
const PORCELAIN = '#fafafa';
function Toilet() {
  return (
    <group>
      <RoundedBox args={[0.42, 0.38, 0.5]} radius={0.08} position={[0, 0.2, 0.08]} castShadow><meshStandardMaterial color={PORCELAIN} roughness={0.25} /></RoundedBox>
      <RoundedBox args={[0.46, 0.05, 0.52]} radius={0.02} position={[0, 0.42, 0.08]}><meshStandardMaterial color="#e6ebee" roughness={0.3} /></RoundedBox>
      <RoundedBox args={[0.5, 0.5, 0.18]} radius={0.04} position={[0, 0.62, -0.3]} castShadow><meshStandardMaterial color={PORCELAIN} roughness={0.25} /></RoundedBox>
    </group>
  );
}

function Sink() {
  return (
    <group position-z={-0.18}>
      <RoundedBox args={[0.9, 0.8, 0.5]} radius={0.03} position-y={0.4} castShadow><meshStandardMaterial color="#f2f2f0" roughness={0.5} /></RoundedBox>
      <RoundedBox args={[0.94, 0.05, 0.54]} radius={0.015} position-y={0.83}><meshStandardMaterial color="#cfd6db" roughness={0.3} /></RoundedBox>
      <mesh position={[0, 0.86, 0.04]} rotation-x={-Math.PI / 2}><circleGeometry args={[0.18, 24]} /><meshStandardMaterial color="#9fb0ba" roughness={0.2} metalness={0.3} /></mesh>
      <mesh position={[0, 0.95, -0.17]}><cylinderGeometry args={[0.02, 0.02, 0.18, 8]} /><meshStandardMaterial color="#c9ced6" metalness={0.8} roughness={0.25} /></mesh>
      <mesh position={[0, 1.02, -0.28]}><boxGeometry args={[0.7, 0.5, 0.03]} /><meshStandardMaterial color="#bfe0f2" roughness={0.05} metalness={0.6} /></mesh>
    </group>
  );
}

function Stall() {
  return <mesh position-y={0.62} castShadow><boxGeometry args={[1.5, 1.24, 0.06]} /><meshStandardMaterial color="#aab7c0" roughness={0.6} /></mesh>;
}

// ---------- Phone booth: a coloured nook with a shelf, a screen and a stool ----------
function PhoneBooth({ color = '#2f6fb5' }) {
  const lamps = useOffice((s) => s.sky.lamps);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.006, 0.5]} receiveShadow><planeGeometry args={[2, 2]} /><meshStandardMaterial color={color} roughness={1} /></mesh>
      <mesh position={[0, 0.66, -0.41]}><planeGeometry args={[1.95, 1.26]} /><meshStandardMaterial color={color} roughness={0.9} /></mesh>
      <RoundedBox args={[1.5, 0.05, 0.42]} radius={0.015} position={[0, 0.75, -0.18]} castShadow><meshStandardMaterial color={OAK} roughness={0.45} /></RoundedBox>
      <RoundedBox args={[0.56, 0.34, 0.03]} radius={0.01} position={[0, 1.04, -0.36]}><meshStandardMaterial color="#12161d" emissive="#7fc4ff" emissiveIntensity={0.35 + lamps * 0.5} /></RoundedBox>
      <mesh position={[0, 0.24, 0.55]}><cylinderGeometry args={[0.03, 0.14, 0.48, 10]} /><meshStandardMaterial color={METAL} /></mesh>
      <mesh position={[0, 0.5, 0.55]} castShadow><cylinderGeometry args={[0.2, 0.2, 0.07, 18]} /><meshStandardMaterial color="#f4f1ec" roughness={0.8} /></mesh>
    </group>
  );
}

// ---------- Kitchen ----------
function KitchenCounter({ cells }) {
  const w = cells.length;
  return (
    <group position-z={-0.12}>
      <RoundedBox args={[w, 0.86, 0.62]} radius={0.02} position-y={0.43} castShadow receiveShadow><meshStandardMaterial color="#f2f2f0" roughness={0.5} /></RoundedBox>
      <RoundedBox args={[w + 0.04, 0.05, 0.66]} radius={0.015} position-y={0.89}><meshStandardMaterial color={OAK} roughness={0.4} /></RoundedBox>
      {Array.from({ length: w }).map((_, i) => <mesh key={i} position={[-w / 2 + 0.5 + i, 0.45, 0.312]}><planeGeometry args={[0.9, 0.7]} /><meshStandardMaterial color="#e3e1dc" roughness={0.6} /></mesh>)}
      <mesh position={[-w / 2 + 0.9, 0.92, 0]} rotation-x={-Math.PI / 2}><planeGeometry args={[0.7, 0.42]} /><meshStandardMaterial color="#9fb0ba" roughness={0.2} metalness={0.4} /></mesh>
      <mesh position={[-w / 2 + 0.9, 1.02, -0.2]}><cylinderGeometry args={[0.02, 0.02, 0.2, 8]} /><meshStandardMaterial color="#c9ced6" metalness={0.8} roughness={0.25} /></mesh>
      <RoundedBox args={[0.62, 0.36, 0.42]} radius={0.03} position={[w / 2 - 0.7, 1.1, -0.02]} castShadow><meshStandardMaterial color="#2a2e36" metalness={0.3} roughness={0.4} /></RoundedBox>
      <mesh position={[w / 2 - 0.78, 1.1, 0.195]}><planeGeometry args={[0.36, 0.24]} /><meshStandardMaterial color="#0f1218" roughness={0.1} /></mesh>
      {[['#e8684a', 0.1], ['#ffd166', 0.32], ['#2f9e64', 0.54]].map(([c, x]) => <mesh key={c} position={[x, 0.99, -0.12]} castShadow><cylinderGeometry args={[0.07, 0.07, 0.16, 12]} /><meshStandardMaterial color={c} /></mesh>)}
    </group>
  );
}

function CafeTable() {
  return (
    <group>
      <mesh position-y={0.74} castShadow receiveShadow><cylinderGeometry args={[0.48, 0.48, 0.05, 28]} /><meshStandardMaterial color="#f4f1ec" roughness={0.4} /></mesh>
      <mesh position-y={0.37}><cylinderGeometry args={[0.04, 0.04, 0.74, 10]} /><meshStandardMaterial color={METAL} /></mesh>
      <mesh position-y={0.03}><cylinderGeometry args={[0.26, 0.28, 0.05, 20]} /><meshStandardMaterial color={METAL} /></mesh>
      {[-0.78, 0.78].map((x) => (
        <group key={x} position={[x, 0, -0.1]}>
          <mesh position-y={0.46} castShadow><cylinderGeometry args={[0.19, 0.19, 0.06, 16]} /><meshStandardMaterial color="#d97a4a" roughness={0.8} /></mesh>
          <mesh position-y={0.23}><cylinderGeometry args={[0.025, 0.1, 0.46, 8]} /><meshStandardMaterial color={METAL} /></mesh>
        </group>
      ))}
    </group>
  );
}

const COMPONENTS = {
  bookshelf: Bookshelf, serverRack: ServerRack, monitorWall: MonitorWall, ups: Ups, stickyBoard: StickyBoard,
  standBoard: StandBoard, armchairs: Armchair, globe: Globe, floorLamp: FloorLamp, printer: Printer, coatRack: CoatRack,
  loungeChair: LoungeChair, easel: Easel, deviceLab: DeviceLab, phoneStand: PhoneStand, beanBag: BeanBag, fridge: Fridge,
  arcade: Arcade, waterCooler: WaterCooler, vending: Vending, bench: Bench, clock: Clock, sign: Sign,
  shelf: Shelf, lockers: Lockers, workbench: Workbench, crates: Crates, whiteboard: Whiteboard, schoolDesk: SchoolDesk,
  reception: Reception, usageBoard: UsageBoard,
  toilet: Toilet, sink: Sink, stall: Stall, phoneBooth: PhoneBooth, kitchenCounter: KitchenCounter, cafeTable: CafeTable,
};

export default function Decor({ L, item }) {
  if (item.type === 'entrance') return <Entrance L={L} />;
  const Comp = COMPONENTS[item.type];
  if (!Comp) return null;
  // armchairs: har bir katakka bittadan
  if (item.type === 'armchairs') {
    return item.cells.map((c, i) => { const [x, z] = L.toWorld(c); return <group key={i} position={[x, 0, z]}><Armchair /></group>; });
  }
  let x, z;
  if (item.at) {
    [x, z] = L.toWorld(item.at); // devorga osilgan narsalar
  } else {
    const cx = item.cells.reduce((s, c) => s + c[0], 0) / item.cells.length;
    const cz = item.cells.reduce((s, c) => s + c[1], 0) / item.cells.length;
    [x, z] = L.toWorld([cx, cz]);
  }
  return <group position={[x, 0, z]} rotation-y={item.rot || 0}><Comp {...item} L={L} /></group>;
}

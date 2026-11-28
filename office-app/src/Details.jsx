// Ofis jihozlari. Har biri rejadagi kataklardan joyini oladi: <Decor L={L} item={{ type, cells, ... }} />
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { useOffice } from './store.js';
import { rank } from './severity.js';
import { tr } from './i18n.js';
import { todayTheme } from './layout.js';
import { RoomComputer } from './Computer.jsx';
import { ProjectorScreen } from './Projector.jsx';

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

// The plan's usage, laid out like claude.ai's Settings → Usage: the current session, this week and any per-model
// weekly window, each a bar with the share used and when it resets. Below, what the office did today.
const resetText = (ms) => {
  if (!ms) return '';
  const left = ms - Date.now();
  if (left > 0 && left < 3600_000) return `Resets in ${Math.max(1, Math.round(left / 60_000))} min`;
  // (to the nearest minute: a reset at 12:59:59 reads 1:00, as claude.ai shows it)
  const d = new Date(Math.round(ms / 60_000) * 60_000);
  const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString() ? `Resets ${t}` : `Resets ${d.toLocaleDateString([], { weekday: 'short' })} ${t}`;
};
function UsageBoard() {
  const usage = useOffice((s) => s.usage);
  const working = useOffice((s) => Object.values(s.agents).filter((a) => a.state === 'working' || a.state === 'thinking').length);
  const canvas = useMemo(() => { const c = document.createElement('canvas'); c.width = 1024; c.height = 512; return c; }, []);
  const tex = useMemo(() => { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }, [canvas]);
  useEffect(() => {
    const g = canvas.getContext('2d');
    const F = (w, px) => `${w} ${px}px Inter, system-ui, sans-serif`;
    g.fillStyle = '#0b1220'; g.fillRect(0, 0, 1024, 512);
    g.fillStyle = '#1f7ae0'; g.fillRect(0, 0, 1024, 84);
    g.fillStyle = '#fff'; g.font = F(800, 44); g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillText('YOUR USAGE', 32, 44);
    g.font = F(600, 28); g.textAlign = 'right';
    g.fillText(working ? `${working} working now` : 'floor is quiet', 992, 44);

    const plan = usage?.plan;
    const data = plan?.data;
    // one row: the name and when it resets on the left, a bar, and the share used on the right
    const row = (y, h, title, w) => {
      g.textAlign = 'left'; g.fillStyle = '#eef3fa'; g.font = F(700, 30); g.fillText(title, 32, y);
      g.fillStyle = '#8ea3bd'; g.font = F(500, 22); g.fillText(resetText(w.resetsAt), 32, y + 32);
      const pct = Math.max(0, Math.min(100, w.usedPct));
      const color = pct >= 90 ? '#ff5a5f' : pct >= 75 ? '#f0a548' : '#3b82f6';
      g.fillStyle = '#1b2638'; g.fillRect(360, y - 6, 470, 14);
      g.fillStyle = color; g.fillRect(360, y - 6, Math.max(4, 470 * (pct / 100)), 14);
      g.textAlign = 'right'; g.fillStyle = '#eef3fa'; g.font = F(700, 30);
      g.fillText(`${Math.round(pct)}% used`, 992, y);
      g.textAlign = 'left';
    };
    if (data) {
      const rows = [data.session && ['Current session', data.session], data.week && ['This week', data.week], ...(data.models || []).map((m) => [m.label, m]) ].filter(Boolean).slice(0, 4);
      const gap = rows.length > 3 ? 78 : 96;
      rows.forEach(([title, w], i) => row(124 + i * gap, gap, title, w));
      // this week, by app (Claude Code, Cowork, chats)
      if (data.byApp?.length && rows.length < 4) {
        g.fillStyle = '#8ea3bd'; g.font = F(500, 22); g.textAlign = 'left';
        g.fillText(`This week by app:  ${data.byApp.map((a) => `${a.label} ${Math.round(a.pct)}%`).join('  ·  ')}`, 32, 124 + rows.length * gap - 18);
      }
      if (plan.status === 'stale') { g.fillStyle = '#f0a548'; g.font = F(500, 20); g.textAlign = 'right'; g.fillText('last reading · could not refresh', 992, 404); g.textAlign = 'left'; }
    } else {
      // no reading from the plan: what Atlas itself used, and why the share is missing
      g.textAlign = 'left'; g.fillStyle = '#eef3fa'; g.font = F(800, 46);
      g.fillText(`${fmtTokens(usage?.used?.fiveHour?.tokens || 0)} tokens · last 5 hours`, 32, 150);
      g.fillText(`${fmtTokens(usage?.used?.sevenDay?.tokens || 0)} tokens · this week`, 32, 230);
      g.fillStyle = '#8ea3bd'; g.font = F(500, 24);
      const why = !plan ? 'Reading the plan usage…' : plan.status === 'not_signed_in' ? 'Plan usage shows when Atlas runs on a Claude plan sign-in.' : `Plan usage not available: ${plan.error || 'no answer'}`;
      g.fillText(why.length > 80 ? `${why.slice(0, 79)}…` : why, 32, 310);
    }

    const done = Object.values(usage?.done || {}).reduce((a, b) => a + b, 0);
    g.fillStyle = '#121c2e'; g.fillRect(0, 424, 1024, 88);
    g.textAlign = 'left'; g.fillStyle = '#dbe7f7'; g.font = F(700, 30);
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

// ---------- Front desk: a long counter with its ends swept back ----------
function FrontDesk() {
  const tex = useMemo(() => textTexture('ATLAS', { w: 512, h: 160, color: '#ffffff', font: '800 110px Inter, system-ui, sans-serif' }), []);
  const lamps = useOffice((s) => s.sky.lamps);
  const part = (key, pos, rot, w, logo) => (
    <group key={key} position={pos} rotation-y={rot}>
      <RoundedBox args={[w, 1.05, 0.6]} radius={0.05} position-y={0.52} castShadow receiveShadow><meshStandardMaterial color="#f4f1ec" roughness={0.5} /></RoundedBox>
      <RoundedBox args={[w + 0.1, 0.06, 0.72]} radius={0.02} position-y={1.08} castShadow><meshStandardMaterial color={OAK} roughness={0.45} /></RoundedBox>
      <mesh position={[0, 0.2, 0.305]}><planeGeometry args={[w - 0.1, 0.08]} /><meshStandardMaterial color="#ffd98a" emissive="#ffd98a" emissiveIntensity={0.5 + lamps * 1.4} /></mesh>
      {logo && <mesh position={[0, 0.6, 0.305]}><planeGeometry args={[2.2, 0.56]} /><meshStandardMaterial color="#1f7ae0" emissive="#1f7ae0" emissiveIntensity={0.35 + lamps * 0.9} /></mesh>}
      {logo && <mesh position={[0, 0.6, 0.31]}><planeGeometry args={[1.6, 0.5]} /><meshBasicMaterial map={tex} transparent toneMapped={false} /></mesh>}
    </group>
  );
  return (
    <group>
      {part('c', [0, 0, 0], 0, 3.3, true)}
      {part('l', [-2.5, 0, -0.45], -0.45, 2.1)}
      {part('r', [2.5, 0, -0.45], 0.45, 2.1)}
      {[-1.1, 1.1].map((x) => <mesh key={x} position={[x, 1.2, -0.05]} rotation-x={-0.2}><boxGeometry args={[0.5, 0.32, 0.03]} /><meshStandardMaterial color="#12161d" /></mesh>)}
      {[-1.1, 1.1].map((x) => <group key={x} position={[x, 0, -0.9]} scale={0.9}><mesh position-y={0.48} castShadow><boxGeometry args={[0.5, 0.09, 0.5]} /><meshStandardMaterial color="#2f343d" roughness={0.8} /></mesh><mesh position={[0, 0.82, -0.24]} castShadow><boxGeometry args={[0.48, 0.6, 0.07]} /><meshStandardMaterial color="#2f343d" roughness={0.8} /></mesh><mesh position-y={0.24}><cylinderGeometry args={[0.035, 0.12, 0.44, 10]} /><meshStandardMaterial color={METAL} /></mesh></group>)}
    </group>
  );
}

// the name, set into the lobby floor
function FloorLogo() {
  const tex = useMemo(() => textTexture('ATLAS', { w: 1024, h: 256, color: '#1b1f27', font: '800 210px Inter, system-ui, sans-serif' }), []);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={0.008}><planeGeometry args={[7.2, 1.8]} /><meshBasicMaterial map={tex} transparent /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[-4.1, 0.008, 0]}><ringGeometry args={[0.5, 0.74, 40, 1, 0.6, 5]} /><meshBasicMaterial color="#1f7ae0" /></mesh>
    </group>
  );
}

// ---------- Medical ----------
function Bed() {
  return (
    <group>
      <RoundedBox args={[0.92, 0.3, 1.9]} radius={0.04} position-y={0.3} castShadow receiveShadow><meshStandardMaterial color="#cfd6db" roughness={0.5} metalness={0.2} /></RoundedBox>
      <RoundedBox args={[0.86, 0.14, 1.82]} radius={0.05} position-y={0.52} castShadow><meshStandardMaterial color="#ffffff" roughness={0.9} /></RoundedBox>
      <RoundedBox args={[0.88, 0.06, 1.05]} radius={0.03} position={[0, 0.6, 0.36]}><meshStandardMaterial color="#6fb7c9" roughness={0.95} /></RoundedBox>
      <RoundedBox args={[0.56, 0.1, 0.34]} radius={0.05} position={[0, 0.63, -0.66]}><meshStandardMaterial color="#f4f7f9" roughness={0.9} /></RoundedBox>
      <mesh position={[0, 0.55, -0.96]} castShadow><boxGeometry args={[0.92, 0.7, 0.05]} /><meshStandardMaterial color="#aab7c0" roughness={0.5} /></mesh>
    </group>
  );
}

function MedCross() {
  return (
    <group position={[0, 0.95, 0.07]}>
      <RoundedBox args={[0.7, 0.7, 0.04]} radius={0.06}><meshStandardMaterial color="#ffffff" /></RoundedBox>
      <mesh position-z={0.022}><planeGeometry args={[0.46, 0.15]} /><meshBasicMaterial color="#e02b35" /></mesh>
      <mesh position-z={0.022}><planeGeometry args={[0.15, 0.46]} /><meshBasicMaterial color="#e02b35" /></mesh>
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

// ---------- Live boards: what the operations center, the customer service office, storage and triage show ----------
const ago = (ms) => {
  if (!ms) return '—';
  const t = typeof ms === 'string' ? Date.parse(ms) : ms;
  if (!t) return '—';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return tr('now');
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
};
const fmtBytes = (n) => (n == null ? '—' : n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`);
const CH = {
  web: ['Web', '#1f7ae0'], telegram: ['Telegram', '#2aabee'], whatsapp: ['WhatsApp', '#25d366'], discord: ['Discord', '#5865f2'],
  slack: ['Slack', '#e01e5a'], email: ['Email', '#ea4335'], api: ['API', '#7c4dff'], acp: ['Editor', '#14b8a6'],
};
const GOOD = '#4ade80', WARN = '#fbbf24', BAD = '#f87171', DIM = '#8b98b0', INK = '#eef3fa';
const F = (wgt, px) => `${wgt} ${px}px Inter, system-ui, sans-serif`;

function fit(g, text, max) {
  let s = String(text ?? '');
  if (g.measureText(s).width <= max) return s;
  while (s.length > 1 && g.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s}…`;
}

function useBoard(w, h, draw, deps) {
  const canvas = useMemo(() => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }, [w, h]);
  const tex = useMemo(() => { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }, [canvas]);
  const [tick, setTick] = useState(0);
  // the "5m"s move on even when nothing new arrives
  useEffect(() => { const i = setInterval(() => setTick((n) => n + 1), 30_000); return () => clearInterval(i); }, []);
  useEffect(() => {
    const g = canvas.getContext('2d');
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    draw(g);
    tex.needsUpdate = true;
  }, [...deps, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return tex;
}

function header(g, w, h, title, color, right = '') {
  g.fillStyle = '#0b1220'; g.fillRect(0, 0, w, h);
  g.fillStyle = color; g.fillRect(0, 0, w, 96);
  g.fillStyle = '#fff'; g.font = F(800, 56);
  g.fillText(title, 32, 50);
  if (right) { g.textAlign = 'right'; g.font = F(700, 44); g.fillText(right, w - 32, 50); g.textAlign = 'left'; }
}
const dot = (g, x, y, c, r = 13) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
function waiting(g, w, h) { g.fillStyle = DIM; g.font = F(600, 44); g.textAlign = 'center'; g.fillText(tr('Waiting for Atlas…'), w / 2, h / 2 + 40); g.textAlign = 'left'; }
const right = (g, text, x, y) => { g.textAlign = 'right'; g.fillText(text, x, y); g.textAlign = 'left'; };

// Leaned back a little, so the camera looking down from above reads it.
function BoardPanel({ tex, w, h, y = 1.35, legs = false, tilt = -0.32 }) {
  return (
    <group position={[0, 0, legs ? 0 : 0.42]}>
      {legs && [-(w / 2 - 0.15), w / 2 - 0.15].map((x) => <mesh key={x} position={[x, (y - h / 2) / 2, -0.04]} castShadow><boxGeometry args={[0.07, y - h / 2 + 0.1, 0.07]} /><meshStandardMaterial color={METAL} metalness={0.5} roughness={0.4} /></mesh>)}
      <group position-y={y} rotation-x={tilt}>
        <RoundedBox args={[w + 0.12, h + 0.1, 0.08]} radius={0.03} castShadow><meshStandardMaterial color={METAL} roughness={0.4} /></RoundedBox>
        <mesh position-z={0.045}><planeGeometry args={[w, h]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
      </group>
    </group>
  );
}

// The operations center's wall: channels, the heartbeat, and scheduled jobs.
function OpsWall() {
  const st = useOffice((s) => s.status);
  const W = 1600, H = 720;
  const tex = useBoard(W, H, (g) => {
    header(g, W, H, tr('OPERATIONS'), '#0f766e', st ? `${tr('working now')}: ${st.working ?? 0}` : '');
    if (!st) return waiting(g, W, H);
    const title = (x, t) => { g.fillStyle = DIM; g.font = F(800, 36); g.fillText(t, x, 148); };
    // channels
    title(32, tr('CHANNELS'));
    const chans = (st.channels || []).slice(0, 5);
    if (!chans.length) { g.fillStyle = INK; g.font = F(600, 42); g.fillText(tr('Web chat only'), 32, 220); }
    chans.forEach((c, i) => {
      const y = 220 + i * 96;
      const ok = c.status === 'running' && !c.warning;
      const col = ok ? GOOD : c.status === 'error' ? BAD : WARN;
      dot(g, 50, y, col);
      g.fillStyle = INK; g.font = F(700, 44);
      g.fillText(CH[c.id]?.[0] || c.id, 78, y - 4);
      g.fillStyle = col; g.font = F(600, 30);
      g.fillText(fit(g, c.error || c.warning || (ok ? tr('running') : c.status), 420), 78, y + 34);
    });
    // heartbeat
    title(560, tr('HEARTBEAT'));
    const hb = st.heartbeat;
    if (hb) {
      const [word, col] = !hb.running ? [tr('off'), DIM] : hb.ok === false ? [tr('failed'), BAD] : hb.waitingForOwner ? [tr('needs your OK'), WARN] : [tr('on'), GOOD];
      dot(g, 578, 222, col);
      g.fillStyle = INK; g.font = F(800, 52); g.fillText(word, 606, 222);
      g.fillStyle = DIM; g.font = F(600, 36);
      g.fillText(tr('last check'), 560, 310);
      g.fillStyle = INK; g.font = F(800, 48); g.fillText(hb.lastRun ? `${ago(hb.lastRun)} ${tr('ago')}` : tr('not yet'), 560, 362);
      g.fillStyle = DIM; g.font = F(600, 36); g.fillText(tr('checks so far'), 560, 450);
      g.fillStyle = INK; g.font = F(800, 48); g.fillText(String(hb.runCount ?? 0), 560, 502);
    }
    // scheduled jobs
    title(1010, tr('SCHEDULED JOBS'));
    const cr = st.cron;
    if (cr) {
      g.fillStyle = INK; g.font = F(800, 44);
      g.fillText(`${cr.on} ${tr('on')}${cr.running ? ` · ${cr.running} ${tr('running')}` : ''}`, 1010, 220);
      if (cr.failing) { g.fillStyle = BAD; g.font = F(700, 34); g.fillText(`${cr.failing} ${tr('failing')}`, 1010, 266); }
      if (!cr.jobs.length) { g.fillStyle = DIM; g.font = F(600, 38); g.fillText(tr('No jobs yet'), 1010, 320); }
      cr.jobs.slice(0, 4).forEach((j, i) => {
        const y = 330 + i * 92;
        dot(g, 1024, y, j.failing ? BAD : j.state === 'running' ? '#60a5fa' : j.state === 'on' ? GOOD : DIM, 11);
        g.fillStyle = INK; g.font = F(700, 38);
        g.fillText(fit(g, j.name, 400), 1048, y - 4);
        g.fillStyle = DIM; g.font = F(600, 28);
        g.fillText(j.lastRun ? `${tr('ran')} ${ago(j.lastRun)} ${tr('ago')}` : tr('not run yet'), 1048, y + 32);
      });
    }
    g.fillStyle = '#1c2840'; g.fillRect(528, 124, 4, H - 150); g.fillRect(978, 124, 4, H - 150);
  }, [st]);
  return <BoardPanel tex={tex} w={4.2} h={1.89} y={1.25} />;
}

// The customer service office: what came in from each channel, and whether Atlas has answered.
function InboxBoard() {
  const st = useOffice((s) => s.status);
  const W = 1200, H = 680;
  const tex = useBoard(W, H, (g) => {
    const today = st?.inboxToday || {};
    const total = Object.values(today).reduce((a, b) => a + b, 0);
    header(g, W, H, tr('INBOX'), '#b45309', st ? `${tr('today')}: ${total}` : '');
    if (!st) return waiting(g, W, H);
    let x = 32;
    g.font = F(800, 32);
    for (const [src, n] of Object.entries(today)) {
      const [name, color] = CH[src] || [src, DIM];
      const label = `${name} ${n}`;
      const wdt = g.measureText(label).width + 32;
      if (x + wdt > W - 20) break;
      g.fillStyle = color; g.fillRect(x, 118, wdt, 54);
      g.fillStyle = '#fff'; g.fillText(label, x + 16, 146);
      x += wdt + 14;
    }
    const list = (st.inbox || []).slice(0, 4);
    if (!list.length) { g.fillStyle = DIM; g.font = F(600, 42); g.fillText(tr('No messages since Atlas started'), 32, 300); return; }
    list.forEach((m, i) => {
      const y = 240 + i * 112;
      const [name, color] = CH[m.source] || [m.source, DIM];
      dot(g, 46, y - 16, color);
      g.fillStyle = INK; g.font = F(800, 38); g.fillText(name, 72, y - 16);
      const [word, c] = m.state === 'answered' ? [`✓ ${tr('answered')}`, GOOD] : m.state === 'failed' ? [`✗ ${tr('failed')}`, BAD] : [tr('answering…'), WARN];
      g.fillStyle = c; g.font = F(800, 34); right(g, word, W - 32, y - 16);
      g.fillStyle = '#c9d4e5'; g.font = F(500, 34);
      g.fillText(fit(g, m.text || '…', W - 104), 72, y + 28);
    });
  }, [st]);
  return <BoardPanel tex={tex} w={3.5} h={1.98} y={1.22} />;
}

// Storage: Atlas's memory on disk.
function MemoryBoard() {
  const m = useOffice((s) => s.status?.memory);
  const W = 1000, H = 680;
  const tex = useBoard(W, H, (g) => {
    header(g, W, H, tr('MEMORY'), '#6d28d9');
    if (!m) return waiting(g, W, H);
    const row = (i, k, v, c = INK) => {
      const y = 170 + i * 118;
      g.fillStyle = DIM; g.font = F(600, 40); g.fillText(k, 36, y);
      g.fillStyle = c; g.font = F(800, 52); right(g, v, W - 36, y);
    };
    row(0, tr('Files'), `${m.files}${m.capped ? '+' : ''} · ${fmtBytes(m.bytes)}`);
    row(1, tr('Last written'), m.lastWrite ? `${ago(m.lastWrite)} ${tr('ago')}` : '—');
    row(2, tr('Database'), fmtBytes(m.dbBytes));
    const o = m.offsite;
    const [word, c] = !o?.configured ? [tr('not set up'), WARN] : o.failed ? [tr('failed'), BAD] : o.lastOkAt ? [`${ago(o.lastOkAt)} ${tr('ago')} ✓`, GOOD] : [tr('not yet'), WARN];
    row(3, tr('Off-site backup'), word, c);
  }, [m]);
  return <BoardPanel tex={tex} w={2.9} h={1.97} y={1.25} legs />;
}

// Triage: the errors Atlas and the helpers ran into, and who is in the sick bay now.
function TriageBoard() {
  const errors = useOffice((s) => s.status?.errors);
  const resting = useOffice((s) => Object.values(s.agents).filter((a) => a.state === 'resting' || a.bed).map((a) => a.name).join(', '));
  const nameList = useOffice((s) => Object.values(s.agents).map((a) => `${a.id}=${a.name}`).join('|'));
  const names = useMemo(() => Object.fromEntries(nameList.split('|').map((p) => p.split('='))), [nameList]);
  const W = 1000, H = 680;
  const tex = useBoard(W, H, (g) => {
    header(g, W, H, tr('TRIAGE'), '#b91c1c', resting ? `${tr('in bed')}: ${resting}` : '');
    if (!errors) return waiting(g, W, H);
    if (!errors.length) { g.fillStyle = GOOD; g.font = F(800, 46); g.fillText(tr('No errors ✓'), 36, 200); g.fillStyle = DIM; g.font = F(600, 34); g.fillText(tr('since Atlas last started'), 36, 254); return; }
    errors.slice(0, 4).forEach((e, i) => {
      const y = 170 + i * 124;
      dot(g, 48, y - 18, BAD, 11);
      g.fillStyle = INK; g.font = F(800, 40);
      g.fillText(fit(g, names[e.who] || (e.who === 'manager' ? 'Atlas' : e.who), 560), 74, y - 18);
      g.fillStyle = DIM; g.font = F(700, 34); right(g, `${ago(e.at)} ${tr('ago')}`, W - 32, y - 18);
      g.fillStyle = '#f1c4c4'; g.font = F(500, 34);
      g.fillText(fit(g, e.text, W - 110), 74, y + 28);
    });
  }, [errors, resting, names]);
  return <BoardPanel tex={tex} w={2.9} h={1.97} y={1.22} />;
}

// ---------- Room boards: what each room of the owner's plan shows (GET /api/office/world) ----------
const GROUP = { growth: '#6d28d9', sales: '#7c3aed', separate: '#4338ca', market: '#7e22ce', server: '#334155' };
const peso = (n) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const a = Math.abs(n), sign = n < 0 ? '-' : '';
  return `${sign}₱${a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e4 ? `${Math.round(a / 1e3)}K` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}K` : Math.round(a)}`;
};
// names match loosely: case, spaces, dashes and apostrophes ignored ("Tito's Bakery" = "titos-bakery")
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
/** The businesses a room asks for: '*' is all of them; otherwise by name or slug. */
function businessesFor(room, padayon) {
  const all = padayon?.businesses ?? [];
  const want = room?.padayon ?? [];
  if (!want.length) return [];
  if (want.includes('*')) return all;
  return want.map((w) => all.find((b) => slug(b.name) === slug(w) || b.name.toLowerCase() === String(w).toLowerCase())).filter(Boolean);
}
const isPaused = (room, name) => (room?.pausedBusinesses ?? []).some((p) => slug(p) === slug(name));
/** An app by its Railway project name, or by one of its services' names (projects can have made-up names). */
const findApp = (name, railway) => {
  const all = railway?.projects ?? [];
  const s = slug(name);
  return all.find((p) => slug(p.name) === s) ?? all.find((p) => p.services?.some((x) => slug(x.name) === s)) ?? null;
};
const appsFor = (room, railway) => {
  const all = railway?.projects ?? [];
  const want = room?.railway ?? [];
  if (!want.length) return [];
  if (want.includes('*')) return all;
  return want.map((w) => findApp(w, railway)).filter(Boolean);
};
const APP_COLOR = { UP: GOOD, DOWN: BAD, DEPLOYING: '#60a5fa', SLEEPING: DIM, EMPTY: DIM, UNKNOWN: WARN };
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const SOURCE_NAME = { padayon: 'Padayon', lifeos: 'Life OS', railway: 'Railway' };
function sourceNote(src, name) {
  if (!src || src.status === 'not_set_up') return `${SOURCE_NAME[name]} ${tr('not connected yet')}`;
  if (src.status === 'error') return `${tr("Can't reach")} ${SOURCE_NAME[name]}`;
  return null;
}

function RoomBoard({ kind, w = 3.2 }) {
  const room = useOffice((s) => s.layout.plan?.[kind]);
  const world = useOffice((s) => s.world);
  const W = 1200, H = 720;
  const tex = useBoard(W, H, (g) => {
    const color = GROUP[kind] ?? '#0f766e';
    header(g, W, H, '', color);
    g.font = F(800, 56); g.fillStyle = color; g.fillRect(0, 0, W, 96); g.fillStyle = '#fff'; g.fillText(fit(g, (room?.name || '').toUpperCase(), room?.paused ? W - 300 : W - 64), 32, 50);
    if (room?.paused) { g.font = F(800, 40); right(g, tr('PAUSED'), W - 32, 50); }
    let y = 150;
    const line = (text, { c = INK, size = 40, wgt = 700 } = {}) => { if (y > H - 30) return; g.fillStyle = c; g.font = F(wgt, size); g.fillText(fit(g, text, W - 64), 32, y); y += size + 26; };
    const sub = (text) => line(text, { c: DIM, size: 34, wgt: 600 });
    if (room?.subtitle) sub(room.subtitle);
    if (!world) { line(tr('Waiting for Atlas…'), { c: DIM }); return; }
    const P = world.padayon?.data, L = world.lifeos?.data, R = world.railway?.data;

    if (kind === 'ceo') {
      const t = todayTheme(world.plan);
      const where = t?.room ? world.plan?.rooms?.find((r) => r.kind === t.room)?.name : null;
      line(`${tr('Today')}: ${t?.label || new Date().toLocaleDateString([], { weekday: 'long' })}`, { size: 50, wgt: 800 });
      if (where) line(`→ ${where}`, { size: 38, wgt: 700, c: '#fde68a' });
      const note = sourceNote(world.padayon, 'padayon');
      if (note) sub(note);
      (P?.tasks ?? []).slice(0, 4).forEach((t) => {
        const c = /HIGH|URGENT/.test(t.priority) ? WARN : INK;
        line(`• ${t.title}${t.business ? ` (${t.business})` : ''}`, { c, size: 36, wgt: 600 });
      });
      if (P && !P.tasks?.length) sub(tr('No open tasks'));
    } else if (kind === 'personal') {
      const note = sourceNote(world.lifeos, 'lifeos');
      if (note) { sub(note); return; }
      const pd = L?.payday;
      line(pd?.next ? `${tr('Next payday')}: ${pd.daysUntil === 0 ? tr('today') : pd.daysUntil === 1 ? tr('tomorrow') : pd.daysUntil != null ? `${pd.daysUntil} ${tr('days')}` : pd.next}` : tr('No payday set'), { size: 46, wgt: 800 });
      if (L?.overdue?.length) line(`${L.overdue.length} ${tr('overdue')}: ${L.overdue.slice(0, 3).map((b) => b.name).join(', ')}`, { c: BAD, size: 36 });
      if (L?.dueSoon?.length) line(`${tr('Due soon')}: ${L.dueSoon.slice(0, 3).map((b) => `${b.name} ${b.due.slice(5)}`).join(' · ')}`, { size: 34, wgt: 600 });
      for (const goal of (L?.goals ?? []).slice(0, 3)) {
        if (y > H - 50) break;
        g.fillStyle = INK; g.font = F(700, 34); g.fillText(fit(g, goal.name, 520), 32, y);
        g.fillStyle = '#1c2840'; g.fillRect(580, y - 16, 480, 30);
        g.fillStyle = GOOD; g.fillRect(580, y - 16, Math.max(4, Math.min(1, goal.percent / 100) * 480), 30);
        g.fillStyle = INK; g.font = F(800, 32); right(g, `${Math.round(goal.percent)}%`, W - 32, y);
        y += 62;
      }
    } else if (kind === 'market') {
      const note = sourceNote(world.padayon, 'padayon');
      if (note) { sub(note); return; }
      const list = businessesFor(room, P);
      if (!list.length) { sub(tr('No businesses picked for this room')); return; }
      g.fillStyle = DIM; g.font = F(700, 28);
      g.fillText(tr('THIS MONTH'), 32, y - 10); right(g, `${tr('sales')}   ${tr('profit')}`, W - 32, y - 10);
      y += 30;
      for (const b of list.slice(0, 5)) {
        if (y > H - 40) break;
        const paused = isPaused(room, b.name);
        const st = b.health?.status;
        dot(g, 46, y, paused ? DIM : st === 'FIX' ? BAD : st === 'NEW' ? WARN : GOOD, 12);
        g.fillStyle = paused ? DIM : INK; g.font = F(700, 36);
        g.fillText(fit(g, `${b.name}${paused ? ` · ${tr('paused')}` : ''}`, 640), 72, y);
        g.font = F(800, 36); g.fillStyle = paused ? DIM : INK;
        g.textAlign = 'right'; g.fillText(peso(b.revenue), W - 250, y);
        g.fillStyle = b.profit == null ? DIM : b.profit < 0 ? BAD : GOOD; g.fillText(b.profit == null ? '—' : peso(b.profit), W - 32, y); g.textAlign = 'left';
        y += 70;
      }
      g.fillStyle = DIM; g.font = F(600, 28);
      g.fillText(tr('Atlas reads these figures; record sales in Padayon.'), 32, H - 30);
    } else if (kind === 'server') {
      const note = sourceNote(world.railway, 'railway');
      if (note) { sub(note); sub(tr('Add a Railway token to see your apps')); return; }
      const apps = appsFor(room?.railway?.length ? room : { railway: ['*'] }, R);
      const n = (s) => apps.filter((a) => a.status === s).length;
      line(`${n('UP')} ${tr('up')} · ${n('DOWN')} ${tr('down')}${n('DEPLOYING') ? ` · ${n('DEPLOYING')} ${tr('deploying')}` : ''}`, { size: 48, wgt: 800, c: n('DOWN') ? BAD : GOOD });
      const order = { DOWN: 0, DEPLOYING: 1, UNKNOWN: 2, UP: 3, SLEEPING: 4, EMPTY: 5 };
      const shown = [...apps].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9)).slice(0, 8);
      shown.forEach((a, i) => {
        const col = i % 2, row = Math.floor(i / 2);
        const x = 32 + col * 580, yy = y + row * 60;
        if (yy > H - 30) return;
        dot(g, x + 12, yy, APP_COLOR[a.status] ?? DIM, 11);
        g.fillStyle = INK; g.font = F(600, 32); g.fillText(fit(g, a.name, 520), x + 36, yy);
      });
    } else {
      // growth, sales, separate, church, library, studio: their business, their apps, their notes
      const biz = businessesFor(room, P);
      if (room?.padayon?.length && sourceNote(world.padayon, 'padayon')) sub(sourceNote(world.padayon, 'padayon'));
      for (const b of biz.slice(0, 1)) {
        line(`${tr('This month')}: ${peso(b.revenue)} ${tr('sales')} · ${b.profit == null ? '' : `${peso(b.profit)} ${tr('profit')}`}`, { size: 44, wgt: 800 });
        if (b.goal) line(`${tr('Goal')}: ${peso(b.goal.target)} · ${Math.round(b.goal.progress)}%`, { size: 36, c: b.goal.progress >= 100 ? GOOD : WARN });
        else if (b.health?.top) sub(b.health.top);
      }
      if (room?.hours) line(`${tr('Hours')}: ${room.hours}`, { size: 36, wgt: 700, c: WARN });
      const apps = appsFor(room, R);
      if (room?.railway?.length && sourceNote(world.railway, 'railway')) sub(sourceNote(world.railway, 'railway'));
      if (apps.length) {
        let x = 32;
        g.font = F(700, 30);
        for (const a of apps.slice(0, 6)) {
          const label = a.name;
          const wdt = g.measureText(label).width + 54;
          if (x + wdt > W - 20) { x = 32; y += 56; }
          if (y > H - 30) break;
          dot(g, x + 14, y, APP_COLOR[a.status] ?? DIM, 11);
          g.fillStyle = INK; g.fillText(label, x + 34, y);
          x += wdt + 16;
        }
        y += 66;
      }
      for (const n of room?.notes ?? []) line(`• ${n}`, { size: 34, wgt: 600, c: '#c9d4e5' });
      if (!biz.length && !apps.length && !room?.notes?.length && !room?.hours) sub(tr('Add notes for this room in the room plan'));
    }
  }, [room, world]);
  return <BoardPanel tex={tex} w={w} h={w * 0.6} y={1.3} />;
}

// A desk for an agent of the owner's that is not one of Atlas's helpers: a name plate, screens on (or off when paused).
const DESK_STATE = {
  UP: { screen: '#2b4c7e', glow: '#3b6fd6', lamp: '#4ade80', on: 0.5 },
  DEPLOYING: { screen: '#4a3b12', glow: '#f59e0b', lamp: '#fbbf24', on: 0.45 },
  DOWN: { screen: '#4a1216', glow: '#ef4444', lamp: '#f87171', on: 0.7 },
  OFF: { screen: '#1a1f28', glow: '#000000', lamp: '#64748b', on: 0 },
};
function AgentDesk({ label, app, paused }) {
  const plate = useMemo(() => textTexture(label || '', { w: 512, h: 128, color: '#1b1f27', font: '800 80px Inter, system-ui, sans-serif' }), [label]);
  const status = useOffice((s) => (app ? findApp(app, s.world?.railway?.data)?.status ?? 'UNLINKED' : 'UNLINKED'));
  const st = paused ? DESK_STATE.OFF : DESK_STATE[status] ?? DESK_STATE.OFF;
  const lampRef = useRef();
  useFrame(({ clock }) => {
    if (lampRef.current && status === 'DOWN' && !paused) lampRef.current.emissiveIntensity = 1 + Math.sin(clock.elapsedTime * 6) * 0.8;
  });
  return (
    <group>
      <RoundedBox args={[1.7, 0.05, 0.85]} radius={0.02} position-y={0.75} castShadow receiveShadow><meshStandardMaterial color="#f4f1ec" roughness={0.35} /></RoundedBox>
      {[-0.78, 0.78].map((x) => <mesh key={x} position={[x, 0.37, 0]} castShadow><boxGeometry args={[0.05, 0.74, 0.72]} /><meshStandardMaterial color={METAL} roughness={0.5} /></mesh>)}
      {[-0.34, 0.34].map((x) => (
        <group key={x} position={[x, 0, -0.22]}>
          <RoundedBox args={[0.66, 0.4, 0.03]} radius={0.012} position-y={1.12} castShadow><meshStandardMaterial color={METAL} roughness={0.4} /></RoundedBox>
          <mesh position={[0, 1.13, 0.017]}><planeGeometry args={[0.62, 0.35]} /><meshStandardMaterial color={st.screen} emissive={st.glow} emissiveIntensity={st.on} /></mesh>
        </group>
      ))}
      <mesh position={[0.72, 0.84, 0.25]}>
        <sphereGeometry args={[0.06, 14, 10]} />
        <meshStandardMaterial ref={lampRef} color={st.lamp} emissive={st.lamp} emissiveIntensity={st.on ? 1.4 : 0.2} toneMapped={false} />
      </mesh>
      <group position={[0, 0.86, 0.3]} rotation-x={-0.5}>
        <mesh><boxGeometry args={[0.7, 0.18, 0.04]} /><meshStandardMaterial color="#e8d9b5" /></mesh>
        <mesh position-z={0.021}><planeGeometry args={[0.66, 0.16]} /><meshBasicMaterial map={plate} transparent toneMapped={false} /></mesh>
      </group>
      <group position={[0, 0, 0.75]}>
        <RoundedBox args={[0.56, 0.09, 0.52]} radius={0.04} position-y={0.48} castShadow><meshStandardMaterial color="#2f343d" roughness={0.8} /></RoundedBox>
        <RoundedBox args={[0.52, 0.62, 0.07]} radius={0.04} position={[0, 0.86, 0.27]} castShadow><meshStandardMaterial color="#2f343d" roughness={0.8} /></RoundedBox>
        <mesh position-y={0.25}><cylinderGeometry args={[0.035, 0.035, 0.42, 10]} /><meshStandardMaterial color="#9aa0a8" metalness={0.8} roughness={0.3} /></mesh>
      </group>
    </group>
  );
}

// The market hall's stalls: one per business the room shows, its name on the awning; greyed out when paused.
const STALL_COLORS = ['#e8684a', '#2f9e64', '#3b82c4', '#e0a03a'];
function MarketStall({ name, paused, color, x }) {
  const sign = useMemo(() => textTexture(name || '', { w: 512, h: 128, color: '#ffffff', font: '800 64px Inter, system-ui, sans-serif' }), [name]);
  const c = paused ? '#9aa0a8' : color;
  return (
    <group position-x={x}>
      <RoundedBox args={[2.0, 0.95, 0.6]} radius={0.04} position-y={0.48} castShadow receiveShadow><meshStandardMaterial color="#f4efe6" roughness={0.6} /></RoundedBox>
      <RoundedBox args={[2.1, 0.05, 0.7]} radius={0.02} position-y={0.98}><meshStandardMaterial color={OAK} roughness={0.45} /></RoundedBox>
      {[-0.95, 0.95].map((px) => <mesh key={px} position={[px, 1.45, 0.25]}><boxGeometry args={[0.05, 0.95, 0.05]} /><meshStandardMaterial color={METAL} /></mesh>)}
      {Array.from({ length: 5 }).map((_, i) => (
        <mesh key={i} position={[-0.8 + i * 0.4, 1.95, 0.05]} rotation-x={0.35} castShadow><boxGeometry args={[0.4, 0.04, 0.8]} /><meshStandardMaterial color={i % 2 ? '#ffffff' : c} roughness={0.8} /></mesh>
      ))}
      <mesh position={[0, 1.62, 0.29]}><planeGeometry args={[1.8, 0.4]} /><meshBasicMaterial color={c} toneMapped={false} /></mesh>
      <mesh position={[0, 1.62, 0.295]}><planeGeometry args={[1.76, 0.36]} /><meshBasicMaterial map={sign} transparent toneMapped={false} /></mesh>
      {paused && <mesh position={[0, 0.55, 0.305]} rotation-z={-0.15}><planeGeometry args={[1.3, 0.24]} /><meshBasicMaterial color="#1b1f27" /></mesh>}
      {paused && <PausedTag />}
    </group>
  );
}
function PausedTag() {
  const t = useMemo(() => textTexture(tr('PAUSED'), { w: 512, h: 96, color: '#fbbf24', font: '800 70px Inter, system-ui, sans-serif' }), []);
  return <mesh position={[0, 0.55, 0.31]} rotation-z={-0.15}><planeGeometry args={[1.26, 0.22]} /><meshBasicMaterial map={t} transparent toneMapped={false} /></mesh>;
}
function Stalls({ kind }) {
  const room = useOffice((s) => s.layout.plan?.[kind]);
  const padayon = useOffice((s) => s.world?.padayon?.data);
  const list = businessesFor(room, padayon).slice(0, 4);
  const items = list.length ? list.map((b) => ({ name: b.name, paused: isPaused(room, b.name) })) : [{ name: '' }, { name: '' }, { name: '' }];
  const gap = 2.25;
  return (
    <group>
      {items.map((it, i) => <MarketStall key={`${it.name}-${i}`} name={it.name} paused={it.paused} color={STALL_COLORS[i % STALL_COLORS.length]} x={(i - (items.length - 1) / 2) * gap} />)}
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
  opsWall: OpsWall, inboxBoard: InboxBoard, memoryBoard: MemoryBoard, triageBoard: TriageBoard,
  roomBoard: RoomBoard, agentDesk: AgentDesk, stalls: Stalls, roomComputer: RoomComputer,
  scheduleBoard: ScheduleBoard, lift: Lift, projector: ProjectorScreen,
  frontDesk: FrontDesk, floorLogo: FloorLogo, bed: Bed, medCross: MedCross,
  toilet: Toilet, sink: Sink, stall: Stall, phoneBooth: PhoneBooth, kitchenCounter: KitchenCounter, cafeTable: CafeTable,
};

// The schedule board: the jobs due today, earlier ones dimmed. A job the owner's computer runs is marked so: the
// office shows it, Atlas does not run it.
function ScheduleBoard({ w = 5 }) {
  const sch = useOffice((s) => s.schedule);
  const plan = useOffice((s) => s.layout.plan);
  const W = 1600, H = 900;
  const tex = useBoard(W, H, (g) => {
    header(g, W, H, tr('SCHEDULE'), '#7c3aed', new Date().toLocaleDateString([], { weekday: 'long' }));
    if (!sch) { waiting(g, W, H); return; }
    const now = Date.now();
    if (!sch.runs.length) {
      g.fillStyle = DIM; g.font = F(600, 44);
      g.fillText(sch.jobs.length ? tr('Nothing due in the next hours') : tr('No scheduled jobs yet'), 32, 200);
      return;
    }
    const past = sch.runs.filter((r) => r.at <= now).slice(-2);
    const next = sch.runs.filter((r) => r.at > now).slice(0, 8 - past.length);
    const today = new Date().toDateString();
    let y = 158;
    for (const r of [...past, ...next]) {
      const j = sch.jobs[r.job];
      if (!j) continue;
      const done = r.at <= now;
      const d = new Date(r.at);
      const time = (d.toDateString() === today ? '' : d.toLocaleDateString([], { weekday: 'short' }) + ' ') + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const soon = !done && r.at - now < 3600_000;
      g.font = F(800, 40); g.fillStyle = done ? DIM : soon ? WARN : INK; g.fillText(time, 32, y);
      g.font = F(700, 38); g.fillStyle = done ? DIM : INK; g.fillText(fit(g, j.name, 860), 300, y);
      g.font = F(600, 30); g.fillStyle = j.where === 'atlas' ? '#93c5fd' : DIM;
      right(g, fit(g, (j.room ? (plan?.[j.room]?.name ?? j.room) : 'Atlas') + ' · ' + (j.where === 'atlas' ? tr('Atlas runs it') : tr('your PC')), 400), W - 32, y);
      y += 88;
    }
  }, [sch, plan]);
  return <BoardPanel tex={tex} w={w} h={w * 0.5625} y={1.5} />;
}

// The lift up to the view deck: steel doors in the wall, a sign over them and a call button.
function Lift() {
  const sign = useMemo(() => textTexture('▲ VIEW DECK', { w: 1024, h: 200, font: '800 120px Inter, system-ui, sans-serif' }), []);
  return (
    <group rotation-y={Math.PI / 2}>
      <mesh position={[0, 1.25, -0.47]}><boxGeometry args={[1.7, 2.5, 0.06]} /><meshStandardMaterial color="#5c6470" metalness={0.6} roughness={0.35} /></mesh>
      {[-0.36, 0.36].map((x) => (
        <mesh key={x} position={[x, 1.12, -0.43]}><boxGeometry args={[0.7, 2.2, 0.03]} /><meshStandardMaterial color="#c9ced6" metalness={0.85} roughness={0.22} /></mesh>
      ))}
      <mesh position={[0, 1.12, -0.414]}><boxGeometry args={[0.012, 2.2, 0.01]} /><meshStandardMaterial color="#3a3f48" /></mesh>
      <mesh position={[0, 2.38, -0.43]}><planeGeometry args={[1.3, 0.25]} /><meshBasicMaterial color="#111827" /></mesh>
      <mesh position={[0, 2.38, -0.425]}><planeGeometry args={[1.25, 0.24]} /><meshBasicMaterial map={sign} transparent toneMapped={false} /></mesh>
      <mesh position={[0.98, 1.1, -0.44]}><boxGeometry args={[0.12, 0.22, 0.03]} /><meshStandardMaterial color="#2a2e35" /></mesh>
      <mesh position={[0.98, 1.1, -0.42]}><circleGeometry args={[0.035, 16]} /><meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.8} /></mesh>
    </group>
  );
}

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

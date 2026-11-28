// The city round the office (city.js lays it out): streets with lane lines, sidewalks, parks, blocks of buildings
// with windows that light up at night, parked cars and street lamps. Everything of one shape is one instanced mesh,
// so the whole city is a few dozen draw calls.
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useOffice } from './store.js';
import { CITY, TYPES, EXTENT, STREET, LOT } from './city.js';
import Shops from './Shops.jsx';
import Traffic from './Traffic.jsx';

const rnd = (seed) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };
const FACADES = [
  { wall: '#a7adb5', glass: '#2b3f57', roof: '#6b7178' },   // concrete
  { wall: '#c8b69d', glass: '#33455c', roof: '#7d6f5f' },   // sandstone
  { wall: '#5f7894', glass: '#1d3550', roof: '#4a5563' },   // blue glass
  { wall: '#d7d9dc', glass: '#3a4d63', roof: '#8a8f96' },   // white
];
const MODULE = 8;   // windows per texture side

/** A facade texture: MODULE × MODULE windows; the emissive twin lights a random third of them. */
function facade(v, seed) {
  const f = FACADES[v];
  const size = 256, cell = size / MODULE;
  const make = (lit) => {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    const r = rnd(seed);
    g.fillStyle = lit ? '#000' : f.wall; g.fillRect(0, 0, size, size);
    for (let y = 0; y < MODULE; y++) {
      for (let x = 0; x < MODULE; x++) {
        const on = r() < 0.35;
        if (lit) { if (on) { g.fillStyle = r() < 0.8 ? '#ffd98a' : '#cfe3ff'; g.fillRect(x * cell + 6, y * cell + 6, cell - 12, cell - 14); } }
        else {
          g.fillStyle = f.glass; g.fillRect(x * cell + 6, y * cell + 6, cell - 12, cell - 14);
          g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x * cell + 6, y * cell + 6, (cell - 12) / 2, cell - 14);
        }
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  return { map: make(false), emissiveMap: make(true), roof: f.roof };
}

function Buildings({ lamps }) {
  // one instanced mesh per (type, facade)
  const groups = useMemo(() => {
    const out = [];
    TYPES.forEach((T, type) => FACADES.forEach((_, v) => {
      const items = CITY.buildings.filter((b) => b.type === type && b.variant === v);
      if (!items.length) return;
      const tex = facade(v, 100 + type * 7 + v);
      // a window module is about 3 m wide and 3.5 m tall
      for (const t of [tex.map, tex.emissiveMap]) t.repeat.set(T.w / 3 / MODULE, T.h / 3.5 / MODULE);
      const side = new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.emissiveMap, emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.75, metalness: 0.1 });
      const roof = new THREE.MeshStandardMaterial({ color: tex.roof, roughness: 0.95 });
      out.push({ key: `${type}-${v}`, T, items, mats: [side, side, roof, roof, side, side], side });
    }));
    return out;
  }, []);
  for (const g of groups) g.side.emissiveIntensity = lamps * 0.9;
  return groups.map((g) => <BuildingGroup key={g.key} {...g} />);
}

function BuildingGroup({ T, items, mats }) {
  const ref = useRef();
  const geo = useMemo(() => new THREE.BoxGeometry(T.w, T.h, T.d), [T]);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    items.forEach((b, i) => {
      q.setFromEuler(new THREE.Euler(0, b.rot, 0));
      m.compose(new THREE.Vector3(b.x, T.h / 2 + 0.12, b.z), q, new THREE.Vector3(1, 1, 1));
      ref.current.setMatrixAt(i, m);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [items, T]);
  return <instancedMesh ref={ref} args={[geo, mats, items.length]} castShadow receiveShadow />;
}

/** Many copies of one geometry, each with its own matrix (and colour, when given). */
function Instances({ geometry, material, mats, colors }) {
  const ref = useRef();
  useLayoutEffect(() => {
    mats.forEach((m, i) => ref.current.setMatrixAt(i, m));
    if (colors) colors.forEach((c, i) => ref.current.setColorAt(i, c));
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [mats, colors]);
  return <instancedMesh ref={ref} args={[geometry, material, mats.length]} castShadow receiveShadow />;
}

const M = (x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));

export default function City() {
  const lamps = useOffice((s) => Math.round(s.sky.lamps * 10) / 10);
  const asphalt = useMemo(() => new THREE.Color('#4a4e55').lerp(new THREE.Color('#15171b'), lamps * 0.7), [lamps]);
  const walk = useMemo(() => new THREE.Color('#b9b6ae').lerp(new THREE.Color('#2a2d33'), lamps * 0.75), [lamps]);
  const grass = useMemo(() => new THREE.Color('#5f8f4e').lerp(new THREE.Color('#1a271f'), lamps * 0.8), [lamps]);

  const parts = useMemo(() => {
    const r = rnd(99);
    // sidewalk slabs: every block
    const slabs = CITY.blocks.map((b) => M((b.x0 + b.x1) / 2, 0.06, (b.z0 + b.z1) / 2, b.x1 - b.x0, 0.12, b.z1 - b.z0));
    const lawns = CITY.parks.map((p) => M((p.x0 + p.x1) / 2, 0.125, (p.z0 + p.z1) / 2, p.x1 - p.x0, 0.02, p.z1 - p.z0));
    // park trees
    const trunks = [], crowns = [];
    for (const p of CITY.parks) {
      for (let i = 0; i < 9; i++) {
        const x = p.x0 + 3 + r() * (p.x1 - p.x0 - 6), z = p.z0 + 3 + r() * (p.z1 - p.z0 - 6), s = 0.8 + r() * 0.7;
        trunks.push(M(x, 1.2 * s, z, s, s, s));
        crowns.push(M(x, 3.4 * s, z, s, s * 1.15, s));
      }
    }
    // lane lines down the middle of every street, dashed
    const dashes = [];
    for (const x of CITY.vStreets) for (let z = -EXTENT + 4; z < EXTENT - 4; z += 7) dashes.push(M(x, 0.0, z, 0.18, 1, 3));
    for (const z of CITY.hStreets) for (let x = -EXTENT + 4; x < EXTENT - 4; x += 7) dashes.push(M(x, 0.0, z, 3, 1, 0.18));
    // street lamps along the kerbs, and parked cars
    const poles = [], bulbs = [], cars = [], cabins = [], carColors = [];
    const palette = ['#d9534f', '#2f6fb5', '#f2f2f2', '#1f232a', '#e0a03a', '#7a8494', '#2f9e64'].map((c) => new THREE.Color(c));
    for (const b of CITY.blocks) {
      for (let x = b.x0 + 6; x < b.x1 - 4; x += 16) for (const z of [b.z0 + 0.8, b.z1 - 0.8]) { poles.push(M(x, 2.3, z)); bulbs.push(M(x, 4.6, z)); }
      for (const [side, along] of [['n', true], ['s', true], ['w', false], ['e', false]]) {
        if (r() < 0.45) continue;
        const n = 1 + Math.floor(r() * 3);
        for (let i = 0; i < n; i++) {
          const t = 0.15 + r() * 0.7;
          const x = along ? b.x0 + t * (b.x1 - b.x0) : side === 'w' ? b.x0 - 1.6 : b.x1 + 1.6;
          const z = along ? (side === 'n' ? b.z0 - 1.6 : b.z1 + 1.6) : b.z0 + t * (b.z1 - b.z0);
          const ry = along ? Math.PI / 2 : 0;
          cars.push(M(x, 0.5, z, 1, 1, 1, ry));
          cabins.push(M(x, 0.97, z, 1, 1, 1, ry));
          carColors.push(palette[Math.floor(r() * palette.length)]);
        }
      }
    }
    return { slabs, lawns, trunks, crowns, dashes, poles, bulbs, cars, cabins, carColors };
  }, []);

  const geo = useMemo(() => ({
    box: new THREE.BoxGeometry(1, 1, 1),
    dash: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    trunk: new THREE.CylinderGeometry(0.18, 0.25, 2.4, 6),
    crown: new THREE.IcosahedronGeometry(1.8, 1),
    pole: new THREE.CylinderGeometry(0.07, 0.09, 4.6, 6),
    bulb: new THREE.SphereGeometry(0.22, 10, 8),
    car: new THREE.BoxGeometry(1.8, 0.6, 4.0),
    cabin: new THREE.BoxGeometry(1.55, 0.5, 2.0),
  }), []);
  const mat = useMemo(() => ({
    slab: new THREE.MeshStandardMaterial({ roughness: 0.95 }),
    lawn: new THREE.MeshStandardMaterial({ roughness: 1 }),
    dash: new THREE.MeshBasicMaterial({ color: '#e8e2c8' }),
    trunk: new THREE.MeshStandardMaterial({ color: '#6b4a32', roughness: 1 }),
    crown: new THREE.MeshStandardMaterial({ color: '#4f8f55', roughness: 0.9, flatShading: true }),
    pole: new THREE.MeshStandardMaterial({ color: '#2b2f36', metalness: 0.5, roughness: 0.5 }),
    bulb: new THREE.MeshStandardMaterial({ color: '#fff2cf', emissive: '#ffd98a', emissiveIntensity: 0.2 }),
    car: new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.3 }),
    cabin: new THREE.MeshStandardMaterial({ color: '#1e2a38', roughness: 0.15, metalness: 0.4 }),
  }), []);
  mat.slab.color.copy(walk);
  mat.lawn.color.copy(grass);
  mat.bulb.emissiveIntensity = 0.2 + lamps * 3;

  return (
    <group>
      {/* the road surface under everything; the office's lot sits on top of it */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.05} receiveShadow>
        <planeGeometry args={[EXTENT * 2 + 40, EXTENT * 2 + 40]} /><meshStandardMaterial color={asphalt} roughness={0.95} />
      </mesh>
      {/* a kerb round the office's lot, so its street reads as a street */}
      <mesh position={[(LOT.x0 + LOT.x1) / 2, -0.09, (LOT.z0 + LOT.z1) / 2]} receiveShadow>
        <boxGeometry args={[LOT.x1 - LOT.x0 + 3, 0.1, LOT.z1 - LOT.z0 + 3]} /><meshStandardMaterial color={walk} roughness={0.95} />
      </mesh>
      <Instances geometry={geo.box} material={mat.slab} mats={parts.slabs} />
      <Instances geometry={geo.box} material={mat.lawn} mats={parts.lawns} />
      <Instances geometry={geo.trunk} material={mat.trunk} mats={parts.trunks} />
      <Instances geometry={geo.crown} material={mat.crown} mats={parts.crowns} />
      <Instances geometry={geo.dash} material={mat.dash} mats={parts.dashes} />
      <Instances geometry={geo.pole} material={mat.pole} mats={parts.poles} />
      <Instances geometry={geo.bulb} material={mat.bulb} mats={parts.bulbs} />
      <Instances geometry={geo.car} material={mat.car} mats={parts.cars} colors={parts.carColors} />
      <Instances geometry={geo.cabin} material={mat.cabin} mats={parts.cabins} />
      <Buildings lamps={lamps} />
      <Shops lamps={lamps} />
      <Traffic />
    </group>
  );
}

export { STREET };

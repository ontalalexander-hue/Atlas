// The sky and what is far away: drifting clouds, the sun or the moon where the clock puts it, stars at night, open
// ground out to the horizon and a town in the distance. All drawn here; nothing is downloaded.
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { useOffice } from './store.js';

const rnd = (seed) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };

function Clouds({ lamps }) {
  const group = useRef();
  const clouds = useMemo(() => {
    const r = rnd(7);
    return Array.from({ length: 14 }).map(() => {
      const a = Math.PI + r() * Math.PI, d = 110 + r() * 150; // behind the building, never between it and the usual view
      return {
        x: Math.cos(a) * d, z: Math.sin(a) * d, y: 34 + r() * 34, s: 1 + r() * 1.6, v: 0.6 + r() * 0.8,
        puffs: Array.from({ length: 5 + Math.floor(r() * 4) }).map(() => [(r() - 0.5) * 22, (r() - 0.5) * 3, (r() - 0.5) * 9, 4 + r() * 5]),
      };
    });
  }, []);
  const color = useMemo(() => new THREE.Color('#ffffff').lerp(new THREE.Color('#2a3350'), lamps * 0.9), [lamps]);
  useFrame((_, dt) => {
    if (!group.current) return;
    group.current.children.forEach((c, i) => {
      c.position.x += clouds[i].v * Math.min(dt, 0.1);
      if (c.position.x > 280) c.position.x = -280;
    });
  });
  return (
    <group ref={group}>
      {clouds.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]} scale={c.s}>
          {c.puffs.map(([x, y, z, rad], k) => (
            <mesh key={k} position={[x, y, z]} scale={[1, 0.55, 0.8]}>
              <sphereGeometry args={[rad, 14, 10]} />
              <meshBasicMaterial color={color} transparent opacity={0.9} fog={false} depthWrite={false} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Town({ lamps }) {
  const ref = useRef();
  const N = 90;
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8f9bb0', roughness: 0.9 }), []);
  mat.emissive.set('#ffd98a');
  mat.emissiveIntensity = lamps * 0.22;
  useLayoutEffect(() => {
    const r = rnd(21);
    const m = new THREE.Matrix4();
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + r() * 0.05, d = 150 + r() * 60;
      const h = 6 + r() * r() * 34, w = 6 + r() * 8;
      m.compose(new THREE.Vector3(Math.cos(a) * d, h / 2 - 0.6, Math.sin(a) * d), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * 3, 0)), new THREE.Vector3(w, h, w));
      ref.current.setMatrixAt(i, m);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  }, []);
  return <instancedMesh ref={ref} args={[undefined, mat, N]}><boxGeometry args={[1, 1, 1]} /></instancedMesh>;
}

export default function Sky() {
  const lamps = useOffice((s) => Math.round(s.sky.lamps * 10) / 10);
  const sunDir = useOffice((s) => s.sky.sunDir);
  const alt = useOffice((s) => s.sky.alt);
  const horizon = useOffice((s) => s.sky.horizon);
  const far = useMemo(() => new THREE.Color('#7fa36c').lerp(new THREE.Color(horizon), 0.35).lerp(new THREE.Color('#141c1a'), lamps * 0.8), [horizon, lamps]);
  const [sx, sy, sz] = sunDir;
  const up = alt > -4;
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.64} receiveShadow>
        <circleGeometry args={[420, 64]} /><meshStandardMaterial color={far} roughness={1} />
      </mesh>
      <Town lamps={lamps} />
      <Clouds lamps={lamps} />
      {up ? (
        <mesh position={[sx * 300, Math.max(12, sy * 300), sz * 300]}>
          <sphereGeometry args={[11, 24, 16]} /><meshBasicMaterial color={alt < 8 ? '#ffb469' : '#fff4c4'} fog={false} toneMapped={false} />
        </mesh>
      ) : (
        <mesh position={[-120, 170, -200]}>
          <sphereGeometry args={[9, 24, 16]} /><meshBasicMaterial color="#e9eeff" fog={false} toneMapped={false} />
        </mesh>
      )}
      {lamps > 0.5 && <Stars radius={320} depth={40} count={1800} factor={7} saturation={0} fade speed={0.6} />}
    </group>
  );
}

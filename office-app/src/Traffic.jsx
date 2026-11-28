// Traffic on the streets round the office: cars driving on the right, traffic lights at the crossings near the
// office, zebra crossings, and cars that stop on red, keep their distance and wait for someone walking in front of
// them (the boss, in boss mode). One instanced mesh per car part and per lamp colour, so it costs a few draw calls.
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useOffice, positions } from './store.js';
import { CITY, EXTENT } from './city.js';

const NEAR = 150;              // streets with traffic, and crossings with lights, within this of the office
const LANE = 1.8;              // a lane's middle, from the street's centre line
const HALF = 6;                // half a street
const STOP = HALF + 2.6;       // where a car's middle stops, from the crossing's centre
const CYCLE = 26;              // seconds: east-west green 0-10, yellow to 13; north-south green 14-23, yellow to 26
const CAR_LEN = 4.0;

/** The light for each direction at time t: 'g', 'y' or 'r'. */
export function lights(t) {
  const c = ((t % CYCLE) + CYCLE) % CYCLE;
  return {
    x: c < 10 ? 'g' : c < 13 ? 'y' : 'r',
    z: c < 14 ? 'r' : c < 23 ? 'g' : 'y',
  };
}

const rnd = (seed) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };

function makeLanes() {
  const hs = CITY.hStreets.filter((z) => Math.abs(z) < NEAR);
  const vs = CITY.vStreets.filter((x) => Math.abs(x) < NEAR);
  const lanes = [];
  // driving on the right: going +x keeps to +z of the centre line, going +z keeps to -x
  for (const z of hs) for (const dir of [1, -1]) lanes.push({ axis: 'x', dir, at: z + dir * LANE, cross: vs, busy: Math.abs(z) < 40 });
  for (const x of vs) for (const dir of [1, -1]) lanes.push({ axis: 'z', dir, at: x - dir * LANE, cross: hs, busy: Math.abs(x) < 70 });
  return { lanes, hs, vs };
}

const PALETTE = ['#d9534f', '#2f6fb5', '#f2f2f2', '#1f232a', '#e0a03a', '#7a8494', '#2f9e64', '#c0c4ca', '#8e44ad'];

export default function Traffic() {
  const { lanes, hs, vs } = useMemo(() => makeLanes(), []);
  const lamps = useOffice((s) => Math.round(s.sky.lamps * 10) / 10);
  const body = useRef(), cabin = useRef(), heads = useRef(), tails = useRef();
  const lampRefs = useRef({});

  // the cars: spread along each lane, a few more on the office's own streets
  const cars = useMemo(() => {
    const r = rnd(777);
    const out = [];
    lanes.forEach((lane, li) => {
      const n = lane.busy ? 7 : 3;
      const len = 2 * (EXTENT - 5);
      for (let i = 0; i < n; i++) {
        const cruise = 8 + r() * 4;
        out.push({ lane: li, s: -EXTENT + 5 + (i + r() * 0.6) * (len / n), v: cruise, cruise, color: new THREE.Color(PALETTE[Math.floor(r() * PALETTE.length)]) });
      }
    });
    return out;
  }, [lanes]);
  const byLane = useMemo(() => lanes.map((_, li) => cars.filter((c) => c.lane === li)), [lanes, cars]);

  // the crossings with lights, and their poles: one at each corner, facing the traffic that arrives on that side
  const poles = useMemo(() => {
    const out = [];
    for (const x of vs) for (const z of hs) {
      if (Math.abs(x) > NEAR || Math.abs(z) > NEAR) continue;
      const c = HALF + 0.9;
      out.push({ at: [x - c, z + c], axis: 'x', face: -Math.PI / 2 });   // for traffic going +x
      out.push({ at: [x + c, z - c], axis: 'x', face: Math.PI / 2 });    // going -x
      out.push({ at: [x - c, z - c], axis: 'z', face: Math.PI });        // going +z
      out.push({ at: [x + c, z + c], axis: 'z', face: 0 });              // going -z
    }
    return out;
  }, [hs, vs]);

  const geo = useMemo(() => ({
    body: new THREE.BoxGeometry(1.8, 0.6, CAR_LEN),
    cabin: new THREE.BoxGeometry(1.55, 0.5, 2.0),
    light: new THREE.BoxGeometry(0.35, 0.14, 0.05),
    pole: new THREE.CylinderGeometry(0.08, 0.1, 3.6, 8),
    box: new THREE.BoxGeometry(0.36, 1.05, 0.3),
    lamp: new THREE.SphereGeometry(0.11, 12, 8),
    stripe: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  }), []);
  const mat = useMemo(() => ({
    body: new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.3 }),
    cabin: new THREE.MeshStandardMaterial({ color: '#1e2a38', roughness: 0.15, metalness: 0.4 }),
    head: new THREE.MeshStandardMaterial({ color: '#fff7df', emissive: '#fff1c2', emissiveIntensity: 0.2 }),
    tail: new THREE.MeshStandardMaterial({ color: '#7a1010', emissive: '#ff2a2a', emissiveIntensity: 0.3 }),
    pole: new THREE.MeshStandardMaterial({ color: '#2b2f36', metalness: 0.5, roughness: 0.5 }),
    box: new THREE.MeshStandardMaterial({ color: '#1c1f24', roughness: 0.6 }),
    stripe: new THREE.MeshBasicMaterial({ color: '#e9e6dc' }),
    // one material per direction and colour, switched as the lights change
    ...Object.fromEntries(['x', 'z'].flatMap((a) => ['r', 'y', 'g'].map((c) => [`${a}${c}`, new THREE.MeshStandardMaterial({ color: '#2a2a2a', emissive: { r: '#ff2a2a', y: '#ffb020', g: '#29d36a' }[c], emissiveIntensity: 0 })]))),
  }), []);
  mat.head.emissiveIntensity = 0.2 + lamps * 3;
  mat.tail.emissiveIntensity = 0.3 + lamps * 1.5;

  // poles, housings and zebra stripes never move: set once
  const poleRef = useRef(), boxRef = useRef(), stripeRef = useRef();
  const stripes = useMemo(() => {
    const out = [];
    for (const x of vs) for (const z of hs) {
      if (Math.abs(x) > NEAR || Math.abs(z) > NEAR) continue;
      for (let k = -4; k <= 4; k++) {
        const o = k * 1.25;
        out.push([x + o, z - HALF - 1.4, 0.7, 2.2]); out.push([x + o, z + HALF + 1.4, 0.7, 2.2]);
        out.push([x - HALF - 1.4, z + o, 2.2, 0.7]); out.push([x + HALF + 1.4, z + o, 2.2, 0.7]);
      }
    }
    return out;
  }, [hs, vs]);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    poles.forEach((p, i) => {
      m.makeTranslation(p.at[0], 1.8, p.at[1]); poleRef.current.setMatrixAt(i, m);
      q.setFromEuler(e.set(0, p.face, 0));
      m.compose(new THREE.Vector3(p.at[0], 3.3, p.at[1]), q, new THREE.Vector3(1, 1, 1)); boxRef.current.setMatrixAt(i, m);
    });
    stripes.forEach(([x, z, sx, sz], i) => { m.compose(new THREE.Vector3(x, 0.02, z), q.identity(), new THREE.Vector3(sx, 1, sz)); stripeRef.current.setMatrixAt(i, m); });
    for (const r of [poleRef, boxRef, stripeRef]) { r.current.instanceMatrix.needsUpdate = true; r.current.computeBoundingSphere(); }
    // the lamps: three per pole, in front of the housing
    for (const a of ['x', 'z']) {
      const mine = poles.filter((p) => p.axis === a);
      ['r', 'y', 'g'].forEach((c, ci) => {
        const ref = lampRefs.current[`${a}${c}`];
        if (!ref) return;
        mine.forEach((p, i) => {
          const fx = Math.sin(p.face) * 0.17, fz = Math.cos(p.face) * 0.17;
          m.makeTranslation(p.at[0] + fx, 3.65 - ci * 0.33, p.at[1] + fz);
          ref.setMatrixAt(i, m);
        });
        ref.instanceMatrix.needsUpdate = true; ref.computeBoundingSphere();
      });
    }
  }, [poles, stripes]);

  // the cars' colours, once
  useLayoutEffect(() => {
    cars.forEach((c, i) => body.current.setColorAt(i, c.color));
    if (body.current.instanceColor) body.current.instanceColor.needsUpdate = true;
  }, [cars]);

  const phase = useRef('');
  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const v3 = useMemo(() => new THREE.Vector3(), []);
  const one = useMemo(() => new THREE.Vector3(1, 1, 1), []);
  const yAxis = useMemo(() => new THREE.Vector3(0, 1, 0), []);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const L = lights(state.clock.elapsedTime);
    const key = `${L.x}${L.z}`;
    if (key !== phase.current) {
      phase.current = key;
      for (const a of ['x', 'z']) for (const c of ['r', 'y', 'g']) { const on = L[a] === c; mat[`${a}${c}`].emissiveIntensity = on ? 3.2 : 0; mat[`${a}${c}`].color.set(on ? '#ffffff' : '#2a2a2a'); }
    }
    // someone walking in the road: the boss, in boss mode, on the ground
    const st = useOffice.getState();
    let walker = null;
    if (st.boss && positions.boss && !positions.boss.deck) {
      const W = st.layout.W, H = st.layout.H;
      walker = [positions.boss.x - W / 2 + 0.5, positions.boss.z - H / 2 + 0.5];
    }
    let i = 0;
    byLane.forEach((list, li) => {
      const lane = lanes[li];
      // front-most first
      list.sort((a, b) => (b.s - a.s) * lane.dir);
      list.forEach((car, k) => {
        let target = car.cruise;
        const ahead = k > 0 ? list[k - 1] : null;
        if (ahead) {
          const gap = (ahead.s - car.s) * lane.dir - CAR_LEN - 2;
          target = Math.min(target, Math.max(0, gap * 1.1));
        }
        // the next crossing ahead: stop on red, and on yellow when there is room to
        let best = Infinity;
        for (const c of lane.cross) {
          const d = (c - lane.dir * STOP - car.s) * lane.dir;
          if (d > -0.5 && d < best) best = d;
        }
        const light = L[lane.axis];
        if (best < 45 && (light === 'r' || (light === 'y' && best > car.v * 0.9))) target = Math.min(target, Math.max(0, (best - 0.3) * 0.9));
        // someone in the lane ahead
        if (walker) {
          const [wx, wz] = walker;
          const along = (lane.axis === 'x' ? wx : wz), across = (lane.axis === 'x' ? wz : wx);
          const d = (along - car.s) * lane.dir;
          if (Math.abs(across - lane.at) < 1.6 && d > 0 && d < 9) target = Math.min(target, Math.max(0, (d - 3.2) * 0.8));
        }
        const acc = target > car.v ? 3 : 9;
        car.v += Math.sign(target - car.v) * Math.min(Math.abs(target - car.v), acc * dt);
        car.s += car.v * dt * lane.dir;
        // off the edge of the city: round again from the other end
        if (car.s * lane.dir > EXTENT - 5) car.s = -lane.dir * (EXTENT - 5);
        const x = lane.axis === 'x' ? car.s : lane.at, z = lane.axis === 'x' ? lane.at : car.s;
        const rot = lane.axis === 'x' ? (lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (lane.dir > 0 ? 0 : Math.PI);
        q.setFromAxisAngle(yAxis, rot);
        m4.compose(v3.set(x, 0.5, z), q, one); body.current.setMatrixAt(i, m4);
        m4.compose(v3.set(x, 0.97, z), q, one); cabin.current.setMatrixAt(i, m4);
        const fx = Math.sin(rot), fz = Math.cos(rot);
        m4.compose(v3.set(x + fx * (CAR_LEN / 2 + 0.01), 0.55, z + fz * (CAR_LEN / 2 + 0.01)), q, one); heads.current.setMatrixAt(i, m4);
        m4.compose(v3.set(x - fx * (CAR_LEN / 2 + 0.01), 0.6, z - fz * (CAR_LEN / 2 + 0.01)), q, one); tails.current.setMatrixAt(i, m4);
        i++;
      });
    });
    for (const r of [body, cabin, heads, tails]) r.current.instanceMatrix.needsUpdate = true;
  });

  const nx = poles.filter((p) => p.axis === 'x').length, nz = poles.length - nx;
  return (
    <group>
      <instancedMesh ref={body} args={[geo.body, mat.body, cars.length]} castShadow frustumCulled={false} />
      <instancedMesh ref={cabin} args={[geo.cabin, mat.cabin, cars.length]} frustumCulled={false} />
      <instancedMesh ref={heads} args={[geo.light, mat.head, cars.length]} frustumCulled={false} />
      <instancedMesh ref={tails} args={[geo.light, mat.tail, cars.length]} frustumCulled={false} />
      <instancedMesh ref={poleRef} args={[geo.pole, mat.pole, poles.length]} castShadow />
      <instancedMesh ref={boxRef} args={[geo.box, mat.box, poles.length]} castShadow />
      <instancedMesh ref={stripeRef} args={[geo.stripe, mat.stripe, stripes.length]} receiveShadow />
      {['x', 'z'].flatMap((a) => ['r', 'y', 'g'].map((c) => (
        <instancedMesh key={`${a}${c}`} ref={(el) => { lampRefs.current[`${a}${c}`] = el; }} args={[geo.lamp, mat[`${a}${c}`], a === 'x' ? nx : nz]} />
      )))}
    </group>
  );
}

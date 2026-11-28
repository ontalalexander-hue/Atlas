// What makes the office readable: the camera that goes to whoever is working, and the people who walk in when a
// message arrives from a channel.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useOffice, positions } from './store.js';
import Person, { lookFor } from './Person.jsx';
import { overviewPose } from './Look.jsx';
import { todayTheme } from './layout.js';

// ---------- Auto view: the camera follows the work ----------
const HOLD_MS = 4000;      // stay on one person at least this long, so the camera does not jump between steps
const SPOT_MS = 25_000;    // how long after their last step someone is still worth watching
const HANDS_OFF_MS = 20_000; // after the owner moves the camera by hand, leave it alone this long

export function FollowCamera({ small }) {
  const view = useOffice((s) => s.view?.name || 'auto');
  const boss = useOffice((s) => s.boss);
  const cinema = useOffice((s) => s.cinema);
  const selected = useOffice((s) => s.selected);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);
  const st = useRef({ handsOffUntil: 0, look: new THREE.Vector3(), pos: new THREE.Vector3(), init: false, id: null, since: 0 });

  useEffect(() => {
    if (!controls) return undefined;
    const onStart = () => { st.current.handsOffUntil = Date.now() + HANDS_OFF_MS; st.current.init = false; };
    controls.addEventListener('start', onStart);
    return () => controls.removeEventListener('start', onStart);
  }, [controls]);
  // picking someone in the panel takes the camera to them at once
  useEffect(() => { st.current.handsOffUntil = 0; }, [selected, view]);

  useFrame((_, dtRaw) => {
    const S = st.current;
    if (boss || cinema || view !== 'auto' || !controls) { S.init = false; return; }
    const now = Date.now();
    if (now < S.handsOffUntil) return;
    if (!S.init) { S.look.copy(controls.target); S.pos.copy(camera.position); S.init = true; }
    const s = useOffice.getState();
    const L = s.layout;

    let want = null;
    if (s.selected && s.agents[s.selected]) want = s.selected;
    else if (s.spotlight && now - s.spotlight.at < SPOT_MS && s.agents[s.spotlight.id]) want = s.spotlight.id;
    if (want !== S.id && (now - S.since > HOLD_MS || want === s.selected || !S.id)) { S.id = want; S.since = now; }
    if (S.id && !s.agents[S.id]) S.id = null;

    const goalLook = new THREE.Vector3();
    const goalPos = new THREE.Vector3();
    const p = S.id ? positions[S.id] : null;
    if (p) {
      const [wx, wz] = L.toWorld([p.x, p.z]);
      goalLook.set(wx, 0.9, wz);
      if (small) goalPos.set(wx + 2.5, 14, wz + 13);
      else goalPos.set(wx + 5, 10.5, wz + 11.5);
    } else {
      const kind = todayTheme(s.plan)?.room;
      const r = kind ? L.rooms.find((x) => x.kind === kind) : null;
      if (r) {
        const [rx, rz] = L.toWorld([(r.x[0] + r.x[1]) / 2, (r.z[0] + r.z[1]) / 2]);
        const span = Math.max(r.x[1] - r.x[0], r.z[1] - r.z[0]);
        goalLook.set(rx, 0.5, rz);
        goalPos.set(rx + span * 0.35, small ? 12 + span * 0.9 : 9 + span * 0.7, rz + (small ? 12 : 9) + span * 0.75);
      } else {
        const o = overviewPose(L);
        goalLook.copy(o.target);
        goalPos.copy(o.pos);
      }
    }
    const k = 1 - Math.exp(-Math.min(dtRaw, 0.1) * 1.5);
    S.look.lerp(goalLook, k);
    S.pos.lerp(goalPos, k);
    camera.position.copy(S.pos);
    controls.target.copy(S.look);
    camera.lookAt(S.look);
  });
  return null;
}

// ---------- Visitors: one per conversation that is waiting on Atlas ----------
const SPEED = 2.2;

function Visitor({ id }) {
  const v = useOffice((s) => s.visitors[id]);
  const visitorArrived = useOffice((s) => s.visitorArrived);
  const toWorld = useOffice((s) => s.layout.toWorld);
  const H = useOffice((s) => s.layout.H);
  const roofClosed = useOffice((s) => s.roofClosed);
  const root = useRef();
  const pose = useRef({ mode: 'idle', moving: false });
  const step = useRef({ pathId: -1, i: 0 });
  const [, force] = useState(0);
  useEffect(() => {
    if (!v?.bubble) return undefined;
    const ms = v.bubbleUntil - Date.now();
    if (ms <= 0) return undefined;
    const t = setTimeout(() => force((n) => n + 1), ms + 20);
    return () => clearTimeout(t);
  }, [v?.bubble, v?.bubbleUntil]);

  useFrame((_, dtRaw) => {
    if (!v || !root.current) return;
    const pos = positions[`v:${id}`];
    if (!pos) return;
    const dt = Math.min(dtRaw, 0.5);
    const st = step.current;
    if (st.pathId !== v.pathId) { st.pathId = v.pathId; st.i = 0; }
    let moving = false;
    if (v.state === 'walking' && st.i < v.path.length) {
      let budget = SPEED * dt;
      while (budget > 0 && st.i < v.path.length) {
        const [tx, tz] = v.path[st.i];
        const dx = tx - pos.x, dz = tz - pos.z;
        const d = Math.hypot(dx, dz);
        if (d <= budget) { pos.x = tx; pos.z = tz; st.i++; budget -= d; }
        else {
          pos.x += (dx / d) * budget; pos.z += (dz / d) * budget; budget = 0;
          let diff = Math.atan2(dx, dz) - pos.rot;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          pos.rot += diff * Math.min(1, dt * 12);
          moving = true;
        }
      }
      if (st.i >= v.path.length) { if (!v.leaving) pos.rot = Math.PI; visitorArrived(id); }
    }
    pose.current.mode = 'idle';
    pose.current.moving = moving;
    const [wx, wz] = toWorld([pos.x, pos.z]);
    root.current.position.set(wx, 0, wz);
    root.current.rotation.y = pos.rot;
  });

  if (!v) return null;
  const pos = positions[`v:${id}`];
  const inside = pos && pos.z < H - 1;
  const showBubble = v.bubble && v.bubbleUntil > Date.now();
  return (
    <group ref={root}>
      <Person color={v.color} look={lookFor(`visitor-${v.seed}`)} pose={pose} />
      {!(roofClosed && inside) && (
        <Html position={[0, 2.05, 0]} center distanceFactor={15} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div className="tag-wrap">
            {showBubble && <div className={`bubble ${v.bubbleKind || ''}`}>{v.bubble}</div>}
            <div className="tag visitor"><span className="dot" style={{ background: v.color }} />{v.icon} {v.label}</div>
          </div>
        </Html>
      )}
    </group>
  );
}

export function Visitors() {
  const ids = useOffice((s) => Object.keys(s.visitors).join(','));
  return ids ? ids.split(',').map((id) => <Visitor key={id} id={id} />) : null;
}

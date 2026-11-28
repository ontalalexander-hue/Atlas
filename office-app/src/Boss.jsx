// Boshliq rejimi: siz ofis bo'ylab yurasiz (WASD), kamera orqangizdan ergashadi (3-shaxs),
// stolga yaqinlashsangiz monitordagi loglarni ochib ko'rasiz (E).
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useOffice, positions } from './store.js';
import Person from './Person.jsx';
import { overviewPose } from './Look.jsx';
import { TOP as ROOF_TOP } from './Roof.jsx';
import { cityWalkable } from './city.js';

const BOSS_CEILING = ROOF_TOP - 0.7;
import { tr, STATE_LABEL } from './i18n.js';

const WALK = 3.2;
const RUN = 5.6;
const R = 0.28; // to'qnashuv radiusi
const BOSS_LOOK = { skin: '#e8b98f', hair: '#1b1b1f', pants: '#1e2533', trim: '#fff', style: 'side', shoes: '#111' };
const greeted = {};

const keys = {};
const typing = (e) => /input|textarea|select/i.test(e.target?.tagName ?? '');

/** Inside the office building's own grid, or out in the city (grid units). */
const insideBuilding = (L, x, z) => x > -0.5 && x < L.W - 0.5 && z > -0.5 && z < L.H - 0.5;

/** The office's wall cells as one set (grid z * W + x), worked out once per floor plan. */
const wallCache = new WeakMap();
function wallCells(L) {
  if (!wallCache.has(L)) wallCache.set(L, new Set(L.walls.map(([x, z]) => z * L.W + x)));
  return wallCache.get(L);
}

function storeBox(L) {
  const [sx, sz] = L.toWorld(L.outside.store);
  return [[sx - 2.8, sx + 4.4, sz - 3.5, sz + 3.5]];   // the shop and its awning
}

function canStand(L, x, z) {
  const extra = storeBox(L);
  for (const [dx, dz] of [[-R, -R], [R, -R], [-R, R], [R, R]]) {
    const cx = x + dx, cz = z + dz;
    if (insideBuilding(L, cx, cz)) {
      if (!L.isFree(Math.round(cx), Math.round(cz))) return false;
    } else {
      const [wx, wz] = L.toWorld([cx, cz]);
      if (!cityWalkable(wx, wz, extra)) return false;
    }
  }
  return true;
}

// Monitorlar: stollar (agent loglari), monitoring devori (xizmatlar), majlis ekrani (umumiy lenta)
function screensOf(L, agents) {
  const list = [];
  for (const [deskId, d] of Object.entries(L.desks)) {
    const owner = Object.values(agents).find((a) => a.deskId === deskId);
    if (owner) list.push({ kind: 'desk', id: owner.id, label: owner.name, at: [d.desk[0], d.desk[1] + 0.9] });
  }
  for (const it of L.decor) {
    if (it.type === 'monitorWall') {
      const cx = it.cells.reduce((s, c) => s + c[0], 0) / it.cells.length;
      list.push({ kind: 'services', id: 'services', label: 'Monitoring', at: [cx, it.cells[0][1] + 1] });
    }
  }
  if (L.meeting.screen) list.push({ kind: 'feed', id: 'feed', label: tr('Meeting screen'), at: L.meeting.view ?? [L.meeting.screen.x, 14.6] });
  return list;
}

export function BossController() {
  const L = useOffice((s) => s.layout);
  const boss = useOffice((s) => s.boss);
  const bossName = useOffice((s) => s.bossName);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);
  const root = useRef();
  const pose = useRef({ mode: 'idle', moving: false });
  const lastNear = useRef(null);
  const tmp = useRef(new THREE.Vector3());
  const tmp2 = useRef(new THREE.Vector3());
  // how far behind you the camera stays (horizontally), as you last set it by dragging or zooming
  const prefDist = useRef(6);
  useEffect(() => {
    if (!controls) return undefined;
    const onEnd = () => { prefDist.current = Math.max(2.5, Math.hypot(camera.position.x - controls.target.x, camera.position.z - controls.target.z)); };
    controls.addEventListener('end', onEnd);
    return () => controls.removeEventListener('end', onEnd);
  }, [controls, camera]);

  // klaviatura
  useEffect(() => {
    const down = (e) => {
      if (typing(e)) return;
      const k = e.key.toLowerCase();
      keys[k] = true;
      const s = useOffice.getState();
      if (k === 'b' && !s.boss) { s.setBoss(true); return; }
      if (k === 'c' && !s.boss) { s.setCinema(!s.cinema); return; }
      if (!s.boss) return;
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (k === 'e' && s.nearScreen) s.setScreenOpen(!s.screenOpen);
      if (k === 'escape') { if (s.screenOpen) s.setScreenOpen(false); else s.setBoss(false); }
    };
    const up = (e) => { keys[e.key.toLowerCase()] = false; };
    const blur = () => { for (const k in keys) keys[k] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);

  // rejimga kirish/chiqish: kamera joylashuvi
  useEffect(() => {
    if (!controls) return;
    if (boss) {
      if (!positions.boss) positions.boss = { x: L.bossStart[0], z: L.bossStart[1], rot: L.bossRot ?? Math.PI / 2 };
      const p = positions.boss;
      const [wx, wz] = L.toWorld([p.x, p.z]);
      controls.target.set(wx, 1.2, wz);
      camera.position.set(wx - Math.sin(p.rot) * 6, Math.min(4.6, BOSS_CEILING), wz - Math.cos(p.rot) * 6);
      controls.minDistance = 2.5; controls.maxDistance = 22; controls.maxPolarAngle = 1.45;
    } else {
      const f = Math.max(1, L.W / 34);
      const o = overviewPose(L);
      controls.target.copy(o.target);
      camera.position.copy(o.pos);
      controls.minDistance = 8; controls.maxDistance = 110 * f; controls.maxPolarAngle = 1.5;
    }
    controls.update();
  }, [boss, controls, camera, L]);

  useFrame((_, dtRaw) => {
    if (!boss || !root.current || !controls) return;
    const dt = Math.min(dtRaw, 0.1);
    const p = positions.boss;
    const st = useOffice.getState();

    // kameraga nisbatan yo'nalish
    const f = tmp.current.copy(controls.target).sub(camera.position);
    f.y = 0; f.normalize();
    const fx = f.x, fz = f.z;
    const rx = -fz, rz = fx;
    const fwd = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0);
    const side = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
    let mx = fx * fwd + rx * side, mz = fz * fwd + rz * side;
    const len = Math.hypot(mx, mz);
    const run = !!keys.shift;
    let moving = false;
    if (len > 0 && !st.screenOpen) {
      mx /= len; mz /= len;
      const sp = (run ? RUN : WALK) * dt;
      const nx = p.x + mx * sp, nz = p.z + mz * sp;
      if (canStand(L, nx, p.z)) p.x = nx;
      if (canStand(L, p.x, nz)) p.z = nz;
      let diff = Math.atan2(mx, mz) - p.rot;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      p.rot += diff * Math.min(1, dt * 14);
      moving = true;
    }
    pose.current.moving = moving;
    pose.current.run = run;

    const [wx, wz] = L.toWorld([p.x, p.z]);
    root.current.position.set(wx, 0, wz);
    root.current.rotation.y = p.rot;

    // kamera ergashadi
    const k = Math.min(1, dt * 8);
    const dx = (wx - controls.target.x) * k, dz = (wz - controls.target.z) * k, dy = (1.2 - controls.target.y) * k;
    controls.target.x += dx; controls.target.y += dy; controls.target.z += dz;
    camera.position.x += dx; camera.position.y += dy; camera.position.z += dz;
    // the camera keeps the distance you chose, but never on the far side of a wall. When a wall is close behind
    // the camera's line, it swings round behind you (along the hallway) if that way is clearer, and only comes in
    // close when no way is; it eases back out once the way is clear.
    {
      const off = tmp2.current.copy(camera.position).sub(controls.target);
      const horiz = Math.hypot(off.x, off.z);
      if (horiz > 0.3) {
        const want = Math.max(horiz, prefDist.current);
        const freeAlong = (ux, uz) => {
          for (let d = 0.6; d < want; d += 0.2) {
            const gx = p.x + ux * d, gz = p.z + uz * d;
            if (insideBuilding(L, gx, gz) && wallCells(L).has(Math.round(gz) * L.W + Math.round(gx))) return Math.max(1.2, d - 0.45);
          }
          return want;
        };
        let ux = off.x / horiz, uz = off.z / horiz;
        let free = freeAlong(ux, uz);
        if (free < prefDist.current - 0.5) {
          // behind you is the way you are not facing
          const bx = -Math.sin(p.rot), bz = -Math.cos(p.rot);
          if (freeAlong(bx, bz) > free + 0.8) {
            const a0 = Math.atan2(ux, uz), a1 = Math.atan2(bx, bz);
            let da = a1 - a0;
            da = Math.atan2(Math.sin(da), Math.cos(da));
            const a = a0 + da * Math.min(1, dt * 3);
            ux = Math.sin(a); uz = Math.cos(a);
            free = freeAlong(ux, uz);
          }
        }
        const goal = Math.min(prefDist.current, free);
        const next = goal < horiz ? goal : horiz + (goal - horiz) * Math.min(1, dt * 2.5);
        camera.position.x = controls.target.x + ux * next;
        camera.position.z = controls.target.z + uz * next;
        // close in, the camera comes down to shoulder height rather than look straight down
        if (next < prefDist.current - 0.5) camera.position.y = Math.min(camera.position.y, controls.target.y + 0.8 + next * 0.45);
      }
    }

    // outside or in: the roof's glass band shows from the street, and inside the camera stays under the ceiling
    const outside = !insideBuilding(L, p.x, p.z);
    if (outside !== !!st.bossOutside) useOffice.setState({ bossOutside: outside });
    if (!outside && st.roofClosed && camera.position.y > BOSS_CEILING) camera.position.y = BOSS_CEILING;

    // yaqin monitor
    let best = null, bestD = 1.9;
    for (const s of screensOf(L, st.agents)) {
      const d = Math.hypot(s.at[0] - p.x, s.at[1] - p.z);
      if (d < bestD) { best = s; bestD = d; }
    }
    const key = best ? `${best.kind}:${best.id}` : null;
    if (key !== lastNear.current) { lastNear.current = key; st.setNearScreen(best); }

    // agentlar salomlashadi
    const now = Date.now();
    for (const a of Object.values(st.agents)) {
      const ap = positions[a.id];
      if (!ap) continue;
      const d = Math.hypot(ap.x - p.x, ap.z - p.z);
      if (d < 1.6) {
        if (['idle', 'talking'].includes(a.state)) ap.rot = Math.atan2(p.x - ap.x, p.z - ap.z);
        if (!greeted[a.id] || now - greeted[a.id] > 25000) {
          greeted[a.id] = now;
          ap.waveUntil = now + 1600;
          const who = st.bossName;
          const text = a.state === 'panic' ? tr('{who}, help! {text}', { who, text: a.alarm?.text ?? '' })
            : a.down ? `${who}, ${a.down.service} ${a.down.reason} 😢`
              : a.state === 'working' ? tr('Hi {who}! On it: {task}', { who, task: a.task || tr('work') })
                : tr('Hi {who}! 👋', { who });
          st.say(a.id, text, 3200, a.state === 'panic' || a.down ? 'error' : '');
        }
      }
    }
  });

  if (!boss) return null;
  return (
    <group ref={root}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
        <ringGeometry args={[0.42, 0.55, 48]} />
        <meshBasicMaterial color="#f0b43a" transparent opacity={0.9} toneMapped={false} />
      </mesh>
      <Person color="#1e2533" look={BOSS_LOOK} pose={pose} headset={false} boss />
      <Html position={[0, 2.05, 0]} center distanceFactor={6} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <div className="tag boss-tag">👔 {bossName} <span className="tag-state">· {tr('you')}</span></div>
      </Html>
    </group>
  );
}

// ---------- Ekran ustidagi qism (DOM) ----------
const LV = { error: 'err', warn: 'warn', info: '' };

export function BossHud() {
  const { boss, nearScreen, screenOpen, setScreenOpen, setBoss, agents, services, feed } = useOffice();
  if (!boss) return null;
  const agent = nearScreen?.kind === 'desk' ? agents[nearScreen.id] : null;

  return (
    <>
      <div className="boss-help">
        <b>{tr('Boss mode')}</b>
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> {tr('walk')}</span>
        <span><kbd>Shift</kbd> {tr('run')}</span>
        <span>🖱 {tr('camera')}</span>
        <span><kbd>E</kbd> {tr('monitor')}</span>
        <button onClick={() => setBoss(false)}>{tr('Exit')} <kbd>Esc</kbd></button>
      </div>

      {nearScreen && !screenOpen && (
        <button className="boss-prompt" onClick={() => setScreenOpen(true)}>
          <kbd>E</kbd> {tr('Open the {label} monitor', { label: nearScreen.label })}
        </button>
      )}

      {nearScreen && screenOpen && (
        <div className="term-wrap" onClick={() => setScreenOpen(false)}>
          <div className={`term ${agent?.state === 'panic' ? 'panic' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="term-bar" style={{ background: agent?.state === 'panic' ? '#ff2d3a' : agent?.color ?? '#2b2f36' }}>
              <span className="term-dots"><i /><i /><i /></span>
              <b>{nearScreen.kind === 'desk' ? `${agent?.name} — terminal` : nearScreen.label}</b>
              <button onClick={() => setScreenOpen(false)}>✕</button>
            </div>
            {agent && (
              <div className="term-status">
                <span>{tr('state:')} <b>{STATE_LABEL(agent.down ? 'down' : agent.state)}</b></span>
                <span>{tr('task:')} <b>{agent.task || '—'}</b></span>
                <span>{tr('errors:')} <b className={agent.errors ? 'err' : ''}>{agent.errors}</b></span>
                {agent.down && <span className="err">💥 {agent.down.service} {agent.down.reason}</span>}
              </div>
            )}
            <div className="term-body">
              <div className="tl cursor">▋</div>
              {nearScreen.kind === 'desk' && (agent?.log.length ? agent.log.map((l, i) => (
                <div key={i} className={`tl ${LV[l.level] ?? ''}`}><time>{l.time}</time>{l.source && <em>[{l.source}]</em>} {l.text}</div>
              )) : <div className="tl dim">{tr('$ no logs yet_')}</div>)}
              {nearScreen.kind === 'services' && (Object.values(services).length ? Object.values(services).map((sv) => (
                <div key={sv.id} className={`tl ${['down', 'unhealthy', 'restarting'].includes(sv.state) ? 'err' : ''}`}>
                  <em>{sv.kind}</em> {sv.name.padEnd(22, ' ')} {sv.state.padEnd(11, ' ')} → {agents[sv.agent]?.name ?? sv.agent} <span className="dim">{sv.detail}</span>
                </div>
              )) : <div className="tl dim">{tr('$ no services watched_')}</div>)}
              {nearScreen.kind === 'feed' && feed.map((l, i) => (
                <div key={i} className={`tl ${LV[l.level] ?? ''}`}><time>{l.time}</time><b style={{ color: l.color }}>{l.who}</b> {l.text}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

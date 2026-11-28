// Boshliq rejimi: siz ofis bo'ylab yurasiz (WASD), kamera orqangizdan ergashadi (3-shaxs),
// stolga yaqinlashsangiz monitordagi loglarni ochib ko'rasiz (E).
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useOffice, positions } from './store.js';
import Person from './Person.jsx';
import { overviewPose } from './Look.jsx';
import { TOP as ROOF_TOP, roofLift } from './Roof.jsx';
import { cityWalkable } from './city.js';
import { martFree } from './mart.js';
import { canStandDeck } from './deck.js';
import { DESK as FRONT_DESK } from './Reception.jsx';

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

function canStand(L, x, z, onDeck = false) {
  if (onDeck) { const [wx, wz] = L.toWorld([x, z]); return !!L.deck && canStandDeck(L.deck, wx, wz); }
  const m = L.mart?.world;
  for (const [dx, dz] of [[-R, -R], [R, -R], [-R, R], [R, R]]) {
    const cx = x + dx, cz = z + dz;
    if (insideBuilding(L, cx, cz)) {
      if (!L.isFree(Math.round(cx), Math.round(cz))) return false;
    } else {
      const [wx, wz] = L.toWorld([cx, cz]);
      if (!cityWalkable(wx, wz)) return false;
      if (m && !martFree(m, wx, wz)) return false;
    }
  }
  return true;
}

// Monitorlar: stollar (agent loglari), monitoring devori (xizmatlar), majlis ekrani (umumiy lenta)
function screensOf(L, agents, onDeck = false) {
  // up on the deck there is only the lift back down
  if (onDeck) return L.deck ? [{ kind: 'lift', id: 'down', label: tr('the lift'), at: L.deck.doorCell }] : [];
  const list = [];
  if (L.lift) list.push({ kind: 'lift', id: 'up', label: tr('the lift'), at: L.lift.front });
  for (const pj of L.projectors ?? []) list.push({ kind: 'projector', id: pj.id, label: tr('the projector'), at: pj.at });
  // the receptionists, across the front desk
  (L.reception?.seats ?? []).forEach((s, i) => { if (FRONT_DESK[i]) list.push({ kind: 'reception', id: FRONT_DESK[i].name, label: FRONT_DESK[i].name, at: [s[0], 26.25] }); });
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
  for (const c of L.computers ?? []) list.push({ kind: 'computer', id: c.kind, label: L.plan?.[c.kind]?.name || c.kind, at: c.front });
  return list;
}

/** Where the boss can sit: the floor's seats, the mart's, or the deck's (grid units). */
function seatsOf(L, onDeck) {
  if (onDeck) return (L.deck?.seatCells ?? []).map((s) => ({ id: `deck:${s.id}`, at: s.cell, rot: s.rot }));
  const mart = (L.mart?.spots ?? []).filter((s) => s.sit).map((s) => ({ id: `mart:${s.id}`, at: s.cell, rot: s.rot }));
  return [...(L.seats ?? []), ...mart];
}
/** Is someone (an agent) already in this seat? */
function seatTaken(seat, onDeck) {
  for (const [id, p] of Object.entries(positions)) {
    if (id === 'boss' || !p || !!p.deck !== onDeck) continue;
    if (Math.hypot(p.x - seat.at[0], p.z - seat.at[1]) < 0.55) return true;
  }
  return false;
}
// A camera jump asked for by the lift: the next frame puts the camera behind the boss at the new place.
const jump = { pending: false };

/** E, or a click on the prompt: stand up, take the lift, talk to the desk, use a computer, open a screen, or sit. */
export function bossAction() {
  const s = useOffice.getState();
  const L = s.layout;
  const p = positions.boss;
  if (!s.boss || !p) return;
  if (p.sit) { standUp(L, p); return; }
  const { screen: near, seat: nearSeat } = inReach(L, s.agents, p);
  if (near?.kind === 'lift') {
    if (near.id === 'up' && L.deck) { Object.assign(p, { x: L.deck.arriveCell[0], z: L.deck.arriveCell[1], rot: 0, deck: true }); roofLift.snap = true; }
    else Object.assign(p, { x: L.lift.front[0], z: L.lift.front[1], rot: Math.PI / 2, deck: false });
    useOffice.setState({ bossOnDeck: !!p.deck, bossOutside: !!p.deck, nearScreen: null });
    jump.pending = true;
    return;
  }
  if (near?.kind === 'projector') { s.setProjectorOpen(s.projectorOpen ? null : near.id); return; }
  if (near?.kind === 'reception') { s.setReception(s.reception ? null : near.id); return; }
  if (near?.kind === 'computer') {
    if (s.computer) { s.setComputer(null); return; }
    s.setComputer(near.id);
    const seat = (L.seats ?? []).find((x) => x.computer === near.id);
    if (seat && !seatTaken(seat, false)) sitDown(p, seat);
    return;
  }
  if (near) { s.setScreenOpen(!s.screenOpen); return; }
  if (nearSeat) sitDown(p, nearSeat);
}

/** The screen (lift, desk, computer, monitor) and the free seat within reach of where the boss stands. */
function inReach(L, agents, p) {
  const onDeck = !!p.deck;
  let screen = null, bestD = 1.9;
  for (const s of screensOf(L, agents, onDeck)) {
    const d = Math.hypot(s.at[0] - p.x, s.at[1] - p.z);
    if (d < bestD) { screen = s; bestD = d; }
  }
  let seat = null;
  if (!p.sit && !screen) {
    let sd = 1.1;
    for (const s of seatsOf(L, onDeck)) {
      const d = Math.hypot(s.at[0] - p.x, s.at[1] - p.z);
      if (d < sd && !seatTaken(s, onDeck)) { seat = s; sd = d; }
    }
  }
  return { screen, seat };
}
function sitDown(p, seat) {
  Object.assign(p, { sit: seat, x: seat.at[0], z: seat.at[1], rot: seat.rot });
  useOffice.setState({ bossSeat: seat.id.replace(/^deck:/, ''), nearSeat: null });
}
function standUp(L, p) {
  const seat = p.sit;
  p.sit = null;
  useOffice.setState({ bossSeat: null });
  // step out of the chair: in front of it if that is clear, else the nearest clear spot round it
  const fx = Math.sin(seat.rot), fz = Math.cos(seat.rot);
  const tries = [[fx * 0.7, fz * 0.7], [-fx * 0.7, -fz * 0.7]];
  for (let r = 0.6; r <= 1.8; r += 0.4) for (let a = 0; a < 8; a++) tries.push([Math.sin(a * Math.PI / 4) * r, Math.cos(a * Math.PI / 4) * r]);
  for (const [dx, dz] of tries) if (canStand(L, seat.at[0] + dx, seat.at[1] + dz, !!p.deck)) { p.x = seat.at[0] + dx; p.z = seat.at[1] + dz; return; }
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
      if (k === 'e') bossAction();
      if (k === 'escape') { if (s.screenOpen) s.setScreenOpen(false); else if (s.reception) s.setReception(null); else if (s.projectorOpen) s.setProjectorOpen(null); else s.setBoss(false); }
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
    const onDeck = !!p.deck;
    // walking off gets you out of the chair
    if (len > 0 && p.sit && !st.screenOpen) standUp(L, p);
    if (len > 0 && !st.screenOpen && !p.sit) {
      mx /= len; mz /= len;
      const sp = (run ? RUN : WALK) * dt;
      const nx = p.x + mx * sp, nz = p.z + mz * sp;
      if (canStand(L, nx, p.z, onDeck)) p.x = nx;
      if (canStand(L, p.x, nz, onDeck)) p.z = nz;
      let diff = Math.atan2(mx, mz) - p.rot;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      p.rot += diff * Math.min(1, dt * 14);
      moving = true;
    }
    pose.current.moving = moving;
    pose.current.run = run;
    // seated at a computer that is open: typing
    pose.current.mode = p.sit ? (st.computer && p.sit.computer ? 'working' : 'sit') : 'idle';

    const [wx, wz] = L.toWorld([p.x, p.z]);
    const floorY = onDeck ? ROOF_TOP + roofLift.y : 0;
    root.current.position.set(wx, floorY, wz);
    root.current.rotation.y = p.rot;

    // just off the lift: the camera comes along, behind and a little above on the deck, off to the side in the lobby
    if (jump.pending) {
      jump.pending = false;
      controls.target.set(wx, floorY + 1.2, wz);
      if (onDeck) camera.position.set(wx - Math.sin(p.rot) * 4, floorY + 4.6, wz - Math.cos(p.rot) * 4);
      else camera.position.set(wx + 3.5, 2.6, wz + 3.5);
    }

    // kamera ergashadi
    const k = Math.min(1, dt * 8);
    const dx = (wx - controls.target.x) * k, dz = (wz - controls.target.z) * k, dy = (floorY + 1.2 - controls.target.y) * k;
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
            if (!onDeck && insideBuilding(L, gx, gz) && wallCells(L).has(Math.round(gz) * L.W + Math.round(gx))) return Math.max(1.2, d - 0.45);
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
    // (up on the deck counts as outside: the roof is under your feet, not over your head)
    const outside = onDeck || !insideBuilding(L, p.x, p.z);
    if (outside !== !!st.bossOutside) useOffice.setState({ bossOutside: outside });
    if (onDeck !== !!st.bossOnDeck) useOffice.setState({ bossOnDeck: onDeck });
    if (onDeck && camera.position.y < floorY + 0.8) camera.position.y = floorY + 0.8;
    // inside the mart its roof goes and its walls drop, and the camera stays low
    const inMart = !!L.mart && L.mart.world.contains(wx, wz);
    if (inMart !== !!st.bossInMart) useOffice.setState({ bossInMart: inMart });
    if (inMart && camera.position.y > 3.6) camera.position.y = 3.6;
    if (!outside && st.roofClosed && camera.position.y > BOSS_CEILING) camera.position.y = BOSS_CEILING;

    // yaqin monitor
    const { screen: best, seat } = inReach(L, st.agents, p);
    const key = best ? `${best.kind}:${best.id}` : null;
    if (key !== lastNear.current) { lastNear.current = key; st.setNearScreen(best); }
    if ((seat?.id ?? null) !== (st.nearSeat?.id ?? null)) useOffice.setState({ nearSeat: seat });

    // agentlar salomlashadi
    const now = Date.now();
    for (const a of Object.values(st.agents)) {
      const ap = positions[a.id];
      if (!ap || !!ap.deck !== onDeck) continue;
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
  const { boss, nearScreen, screenOpen, setScreenOpen, setBoss, agents, services, feed, bossSeat, nearSeat, reception } = useOffice();
  if (!boss) return null;
  const agent = nearScreen?.kind === 'desk' ? agents[nearScreen.id] : null;

  return (
    <>
      <div className="boss-help">
        <b>{tr('Boss mode')}</b>
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> {tr('walk')}</span>
        <span><kbd>Shift</kbd> {tr('run')}</span>
        <span>🖱 {tr('camera')}</span>
        <span><kbd>E</kbd> {tr('use · sit · talk')}</span>
        <button onClick={() => setBoss(false)}>{tr('Exit')} <kbd>Esc</kbd></button>
      </div>

      {bossSeat && (
        <button className="boss-prompt" onClick={bossAction}><kbd>E</kbd> {tr('Stand up')}</button>
      )}
      {!bossSeat && nearScreen?.kind === 'lift' && (
        <button className="boss-prompt" onClick={bossAction}>
          <kbd>E</kbd> {nearScreen.id === 'up' ? tr('Take the lift up to the view deck') : tr('Take the lift back down')}
        </button>
      )}
      {!bossSeat && nearScreen?.kind === 'reception' && !reception && (
        <button className="boss-prompt" onClick={bossAction}><kbd>E</kbd> {tr('Talk to {name} at the front desk', { name: nearScreen.label })}</button>
      )}
      {!bossSeat && nearScreen?.kind === 'projector' && (
        <button className="boss-prompt" onClick={bossAction}><kbd>E</kbd> {nearScreen.id === 'meeting' ? tr('Use the projector · present, or call a meeting') : tr('Use the projector · show your screen or a video')}</button>
      )}
      {!bossSeat && !nearScreen && nearSeat && (
        <button className="boss-prompt" onClick={bossAction}><kbd>E</kbd> {tr('Sit down')}</button>
      )}
      {!bossSeat && nearScreen && !screenOpen && nearScreen.kind === 'computer' && (
        <button className="boss-prompt" onClick={bossAction}>
          <kbd>E</kbd> {tr('Use the {label} computer', { label: nearScreen.label })}
        </button>
      )}
      {!bossSeat && nearScreen && !screenOpen && !['computer', 'lift', 'reception', 'projector'].includes(nearScreen.kind) && (
        <button className="boss-prompt" onClick={() => setScreenOpen(true)}>
          <kbd>E</kbd> {tr('Open the {label} monitor', { label: nearScreen.label })}
        </button>
      )}

      {nearScreen && screenOpen && !['computer', 'lift', 'reception', 'projector'].includes(nearScreen.kind) && (
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

// The front desk's two AI receptionists. They sit behind the reception desk facing the door, greet each visitor
// (a message arriving from a channel: Director.jsx Visitors), pass it to Atlas, and see the visitor off when Atlas
// has answered. They are the office's picture of how a message comes in, not separate helpers: they do no work of
// their own.
import { useEffect, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useOffice } from './store.js';
import Person, { lookFor } from './Person.jsx';
import { tr } from './i18n.js';

const DESK = [
  { id: 'front-desk-1', name: 'Mia', color: '#e8684a' },
  { id: 'front-desk-2', name: 'Leo', color: '#2f9e64' },
];

function Receptionist({ who, seat, bubble, busy }) {
  const toWorld = useOffice((s) => s.layout.toWorld);
  const roofClosed = useOffice((s) => s.roofClosed);
  const boss = useOffice((s) => s.boss);
  const bossOutside = useOffice((s) => s.bossOutside);
  const pose = useRef({ mode: 'sit', moving: false });
  pose.current.mode = busy ? 'working' : 'sit';
  const [wx, wz] = toWorld(seat);
  const showTag = !(roofClosed && !(boss && !bossOutside));
  return (
    <group position={[wx, 0, wz]}>
      <Person color={who.color} look={lookFor(who.id)} pose={pose} />
      {showTag && (
        <Html position={[0, 2.05, 0]} center distanceFactor={15} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div className="tag-wrap">
            {bubble && <div className="bubble">{bubble}</div>}
            <div className="tag"><span className="dot" style={{ background: who.color }} />{who.name}<span className="tag-role">{tr('Front desk · AI')}</span></div>
          </div>
        </Html>
      )}
    </group>
  );
}

export default function Reception() {
  const seats = useOffice((s) => s.layout.reception?.seats);
  // the visitors as a string: id, state, whether leaving, channel — changes when one arrives, waits or goes
  const sig = useOffice((s) => Object.values(s.visitors).map((v) => `${v.id}:${v.state}:${v.leaving ? 1 : 0}:${v.label}:${v.spot?.[0] ?? 0}`).join('|'));
  const seen = useRef({});
  const [bubbles, setBubbles] = useState({});
  const timers = useRef({});

  useEffect(() => {
    if (!seats) return;
    const say = (i, text, ms = 4000) => {
      setBubbles((b) => ({ ...b, [i]: text }));
      clearTimeout(timers.current[i]);
      timers.current[i] = setTimeout(() => setBubbles((b) => ({ ...b, [i]: '' })), ms);
    };
    const now = {};
    for (const part of sig ? sig.split('|') : []) {
      const [id, state, leaving, label, sx] = part.split(':');
      now[id] = { state, leaving: leaving === '1', label, x: Number(sx) };
      const before = seen.current[id];
      // the receptionist nearer the visitor's spot answers
      const i = Math.abs(Number(sx) - seats[0][0]) <= Math.abs(Number(sx) - seats[1][0]) ? 0 : 1;
      if (state === 'waiting' && before?.state !== 'waiting') say(i, tr("Welcome! I'll pass your {channel} message to Atlas 📨", { channel: label }));
      else if (leaving === '1' && before && !before.leaving) say(i, tr('Thank you, come again! 👋'), 3000);
    }
    seen.current = now;
  }, [sig, seats]);
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  if (!seats) return null;
  const waiting = sig.split('|').filter((p) => p.includes(':waiting:0:'));
  return DESK.map((who, i) => (
    <Receptionist key={who.id} who={who} seat={seats[i]} bubble={bubbles[i]} busy={waiting.some((p) => {
      const sx = Number(p.split(':')[4]);
      return (Math.abs(sx - seats[0][0]) <= Math.abs(sx - seats[1][0]) ? 0 : 1) === i;
    })} />
  ));
}


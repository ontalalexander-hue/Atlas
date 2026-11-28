// The front desk's two AI receptionists. They sit behind the reception desk facing the door, greet each visitor
// (a message arriving from a channel: Director.jsx Visitors), pass it to Atlas, and see the visitor off when Atlas
// has answered. In boss mode you can walk up and talk to one (ReceptionPanel): what you say goes to Atlas, or through
// Atlas to a department's agent, and the answer comes back to the desk. They do no work of their own.
import { useEffect, useRef, useState } from 'react';
import { relayFromDesk } from './live.js';
import { Html } from '@react-three/drei';
import { useOffice } from './store.js';
import Person, { lookFor } from './Person.jsx';
import { tr } from './i18n.js';

export const DESK = [
  { id: 'front-desk-1', name: 'Mia', color: '#e8684a' },
  { id: 'front-desk-2', name: 'Leo', color: '#2f9e64' },
];

function Receptionist({ who, seat, bubble: visitorBubble, busy }) {
  let bubble = visitorBubble;
  const toWorld = useOffice((s) => s.layout.toWorld);
  const roofClosed = useOffice((s) => s.roofClosed);
  const boss = useOffice((s) => s.boss);
  const bossOutside = useOffice((s) => s.bossOutside);
  const pose = useRef({ mode: 'sit', moving: false });
  // talking with the boss, or busy with a visitor
  const talking = useOffice((s) => s.reception === who.name);
  const said = useOffice((s) => s.receptionSay[who.name]);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!said) return undefined;
    const t = setTimeout(() => tick((n) => n + 1), Math.max(0, said.until - Date.now()) + 20);
    return () => clearTimeout(t);
  }, [said]);
  const own = said && said.until > Date.now() ? said.text : '';
  pose.current.mode = talking ? 'talking' : busy ? 'working' : 'sit';
  bubble = own || bubble;
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

/** Talking to a receptionist: pick who it is for (Atlas, or a department), say it, read the answer. */
export function ReceptionPanel() {
  const name = useOffice((s) => s.reception);
  const team = useOffice((s) => s.team);
  const agents = useOffice((s) => s.agents);
  const [to, setTo] = useState('manager');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState([]);
  const box = useRef(null);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [lines]);
  useEffect(() => { if (name) setLines([{ who: 'desk', text: tr('Hi! What should I pass on, and to whom?') }]); }, [name]);
  if (!name) return null;
  const S = useOffice.getState;
  const depts = team.filter((t) => t.room);
  const targetName = to === 'manager' ? 'Atlas' : (agents[to]?.title || agents[to]?.name || to);
  const close = () => S().setReception(null);
  const send = async () => {
    const said = text.trim();
    if (!said || busy) return;
    setText('');
    setBusy(true);
    setLines((l) => [...l, { who: 'boss', text: said }, { who: 'desk', text: tr("Got it. I'm passing this to {to} now 📨", { to: targetName }) }, { who: 'atlas', text: '…' }]);
    S().deskSay(name, tr('📨 Passing it to {to}', { to: targetName }), 5000);
    const r = await relayFromDesk(name, to, said, (t) => setLines((l) => [...l.slice(0, -1), { who: 'atlas', text: t }]));
    setLines((l) => [...l.slice(0, -1), r.error && !r.reply ? { who: 'error', text: r.error } : { who: 'atlas', text: r.reply || tr('(no answer)') }]);
    S().deskSay(name, r.error && !r.reply ? tr('😕 No answer yet') : tr('✅ {to} answered', { to: targetName }), 4000);
    setBusy(false);
  };
  return (
    <div className="pc-wrap" onClick={close}>
      <div className="pc" onClick={(e) => e.stopPropagation()}>
        <div className="pc-head">
          <div>
            <b>🛎️ {name} · {tr('Front desk · AI')}</b>
            <span>{tr('Passes what you say to Atlas, or through Atlas to a department')}</span>
          </div>
          <div className="pc-head-actions">
            <select value={to} onChange={(e) => setTo(e.target.value)} disabled={busy} aria-label={tr('Pass it to')}>
              <option value="manager">Atlas ({tr('manager')})</option>
              {depts.map((d) => <option key={d.id} value={d.id}>{agents[d.id]?.title || d.name}</option>)}
            </select>
            <button className="pc-x" onClick={close} aria-label={tr('Close')}>✕</button>
          </div>
        </div>
        <div className="pc-msgs" ref={box}>
          {lines.map((l, i) => (
            <div key={i} className={`pc-msg ${l.who === 'boss' ? 'me' : 'ai'}`}>
              <b className="pc-who">{l.who === 'boss' ? (S().bossName || tr('You')) : l.who === 'desk' ? name : l.who === 'error' ? '⚠' : targetName}</b> {l.text}
            </div>
          ))}
        </div>
        <div className="pc-input">
          <input value={text} autoFocus onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); if (e.key === 'Escape') close(); e.stopPropagation(); }}
            placeholder={tr('Tell {name} what to pass on…', { name })} disabled={busy} />
          <button onClick={send} disabled={busy || !text.trim()}>{busy ? '…' : tr('Send')}</button>
        </div>
      </div>
    </div>
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


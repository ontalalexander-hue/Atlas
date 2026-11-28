// A room's computer: a desk with a big screen in each room of the owner's plan. Clicking it (or E beside it in boss
// mode) opens that room's chat: its own conversation with Atlas, which answers as that room's department; or, when
// the room is linked to a Discord channel, the same conversation as that channel, with what is said here posted
// there too.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import { useOffice } from './store.js';
import { loadRoomChat, sendRoomMessage, linkRoom, loadDiscordChannels } from './live.js';
import { tr } from './i18n.js';
import { OfficeChair } from './Office.jsx';

function screenTexture(title, sub, linked) {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 400;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 400);
  grad.addColorStop(0, '#0b2a3a'); grad.addColorStop(1, '#07131c');
  g.fillStyle = grad; g.fillRect(0, 0, 640, 400);
  g.fillStyle = '#0f9d8a'; g.fillRect(0, 0, 640, 64);
  g.fillStyle = '#fff'; g.font = '800 38px Inter, system-ui, sans-serif'; g.textBaseline = 'middle';
  g.fillText('💻 ' + title.slice(0, 22), 24, 34);
  g.fillStyle = '#cfe7ff'; g.font = '600 30px Inter, system-ui, sans-serif';
  g.fillText(sub.slice(0, 32), 24, 130);
  g.fillStyle = linked ? '#a5b4fc' : '#7d8aa3'; g.font = '600 26px Inter, system-ui, sans-serif';
  g.fillText(linked ? `🔗 Discord: ${linked.slice(0, 22)}` : tr('Not linked to Discord'), 24, 200);
  g.fillStyle = '#4ade80'; g.font = '700 30px Inter, system-ui, sans-serif';
  g.fillText(tr('Click to talk ›'), 24, 330);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** The computer itself, in the room (a Details.jsx decor item: { type: 'roomComputer', kind }). */
export function RoomComputer({ kind }) {
  const room = useOffice((s) => s.layout.plan?.[kind]);
  const lamps = useOffice((s) => s.sky.lamps);
  const linkedTitle = useOffice((s) => s.world?.plan?.rooms?.find((r) => r.kind === kind)?.discordTitle || (s.world?.plan?.rooms?.find((r) => r.kind === kind)?.discord ? 'linked' : ''));
  const tex = useMemo(() => screenTexture(room?.name || kind, room?.subtitle || tr("This room's assistant"), linkedTitle), [room?.name, room?.subtitle, linkedTitle, kind]);
  const open = (e) => { e.stopPropagation(); useOffice.getState().setComputer(kind); };
  const [hover, setHover] = useState(false);
  return (
    <group onClick={open} onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }} onPointerOut={() => { setHover(false); document.body.style.cursor = ''; }}>
      <RoundedBox args={[1.5, 0.05, 0.8]} radius={0.02} position-y={0.75} castShadow receiveShadow><meshStandardMaterial color="#f4f1ec" roughness={0.35} /></RoundedBox>
      {[-0.68, 0.68].map((x) => <mesh key={x} position={[x, 0.37, 0]} castShadow><boxGeometry args={[0.05, 0.74, 0.7]} /><meshStandardMaterial color="#2a2e35" /></mesh>)}
      <group position={[0, 0, -0.18]}>
        <RoundedBox args={[1.12, 0.72, 0.05]} radius={0.02} position-y={1.28} castShadow><meshStandardMaterial color={hover ? '#0f9d8a' : '#1b1f27'} roughness={0.4} /></RoundedBox>
        <mesh position={[0, 1.28, 0.028]}><planeGeometry args={[1.04, 0.65]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
        <mesh position={[0, 0.88, -0.02]}><boxGeometry args={[0.08, 0.2, 0.06]} /><meshStandardMaterial color="#9aa0a8" metalness={0.7} roughness={0.3} /></mesh>
      </group>
      <mesh position={[0, 0.79, 0.18]}><boxGeometry args={[0.5, 0.02, 0.16]} /><meshStandardMaterial color="#e4e6ea" /></mesh>
      {/* a chair: sit down to use it (boss mode), or for the agent working here */}
      <group position={[0, 0, 0.85]}><OfficeChair /></group>
    </group>
  );
}

/** The channel list in groups: "Server · Category" (the server left out when Atlas is in only one). */
function groupChannels(list) {
  const servers = new Set(list.map((c) => c.server).filter(Boolean));
  const groups = new Map();
  for (const c of list) {
    const head = [servers.size > 1 ? c.server : null, c.category].filter(Boolean).join(' · ') || (c.server ? '' : tr('Other chats'));
    if (!groups.has(head)) groups.set(head, []);
    groups.get(head).push(c);
  }
  return [...groups];
}

/** The chat window: history from the server, then this session's messages as they stream in. */
export function ComputerPanel() {
  const kind = useOffice((s) => s.computer);
  const room = useOffice((s) => (kind ? s.world?.plan?.rooms?.find((r) => r.kind === kind) : null));
  const close = () => useOffice.getState().setComputer(null);
  const [chat, setChat] = useState(null);       // { key, linked, messages }
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [channels, setChannels] = useState(null);
  const [linking, setLinking] = useState(false);
  const list = useRef();

  const reload = () => loadRoomChat(kind).then((c) => { setChat(c); setError(c?.error || ''); });
  useEffect(() => { if (!kind) return; setChat(null); setText(''); setError(''); setLinking(false); reload(); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { list.current?.scrollTo(0, 1e9); }, [chat]);
  useEffect(() => {
    if (!kind) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [kind]);
  if (!kind) return null;

  const send = async () => {
    const msg = text.trim();
    if (!msg || busy || !chat) return;
    setText(''); setBusy(true); setError('');
    const mine = { role: 'user', text: msg };
    const reply = { role: 'assistant', text: '' };
    setChat((c) => ({ ...c, messages: [...c.messages, mine, reply] }));
    const r = await sendRoomMessage(kind, chat, room, msg, (t) => { reply.text = t; setChat((c) => ({ ...c, messages: [...c.messages] })); });
    if (r.error) setError(r.error);
    setBusy(false);
  };

  const startLink = async () => { setLinking(true); setChannels(await loadDiscordChannels()); };
  const pick = async (id) => {
    const r = await linkRoom(kind, id || null);
    if (r.error) { setError(r.error); return; }
    setLinking(false);
    reload();
  };

  return (
    <div className="pc-wrap" onClick={close}>
      <div className="pc" onClick={(e) => e.stopPropagation()}>
        <div className="pc-head">
          <div>
            <b>💻 {room?.name || kind}</b>
            <span>{chat?.linked ? `🔗 ${tr('Discord')} · ${chat.linked.title || chat.linked.id}` : tr('Its own chat with Atlas')}</span>
          </div>
          <div className="pc-head-actions">
            <button className="link" onClick={startLink}>{chat?.linked ? tr('Change Discord link') : tr('Link to Discord')}</button>
            <button className="pc-x" onClick={close} aria-label={tr('Close')}>✕</button>
          </div>
        </div>
        {linking && (
          <div className="pc-link">
            {!channels ? tr('Loading channels…') : channels.error ? channels.error : (
              <>
                <div className="pc-link-hint">{channels.running ? tr('Pick a Discord channel: what you say here is posted there too, and its conversation shows here.') : tr('Discord is not connected to Atlas right now.')}</div>
                <div className="pc-link-list">
                  {groupChannels(channels.list).map(([head, list]) => (
                    <div key={head} className="pc-link-group">
                      {head && <div className="pc-link-head">{head}</div>}
                      {list.map((c) => <button key={c.id} onClick={() => pick(c.id)} className={chat?.linked?.id === c.id ? 'on' : ''}>{c.title}</button>)}
                    </div>
                  ))}
                  {!channels.list.length && <em>{tr('No channels: check that Atlas is in your Discord server and can see its channels.')}</em>}
                </div>
                <div className="pc-link-actions">
                  {chat?.linked && <button className="link" onClick={() => pick(null)}>{tr('Unlink')}</button>}
                  <button className="link" onClick={() => setLinking(false)}>{tr('Cancel')}</button>
                </div>
              </>
            )}
          </div>
        )}
        <div className="pc-msgs" ref={list}>
          {!chat ? <div className="pc-empty">{tr('Loading…')}</div> : !chat.messages.length ? <div className="pc-empty">{tr('Say hello. Atlas answers here as this room.')}</div> : chat.messages.map((m, i) => (
            <div key={i} className={`pc-msg ${m.role === 'user' ? 'me' : 'ai'}`}>{m.text || (busy && i === chat.messages.length - 1 ? '…' : '')}</div>
          ))}
        </div>
        {error && <div className="pc-err">{error}</div>}
        <div className="pc-input">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send(); e.stopPropagation(); }} placeholder={tr('Type to this room…')} disabled={busy || !chat} />
          <button onClick={send} disabled={busy || !text.trim() || !chat}>{busy ? '…' : tr('Send')}</button>
        </div>
      </div>
    </div>
  );
}

// The projectors: a screen on the conference room's end wall and one in the learning library. Walk up and press E
// (or click the screen) to put your screen, a video or a picture on it. In the conference room you can also call a
// meeting: the team comes in and sits round the table, you say what you are presenting, and they answer in turn.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import { useOffice } from './store.js';
import { projectorMedia, shareScreen, showFile, stopProjector, togglePause } from './projector.js';
import { presentToMeeting, playMeetingReplies } from './live.js';
import { tr } from './i18n.js';

const NAMES = { meeting: 'Conference room', library: 'Learning library' };

function idleTexture(id) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 576;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 1024, 576);
  grad.addColorStop(0, '#0f1d33'); grad.addColorStop(1, '#1d3b66');
  g.fillStyle = grad; g.fillRect(0, 0, 1024, 576);
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '800 64px Inter, system-ui, sans-serif'; g.fillText('📽  PROJECTOR', 512, 230);
  g.fillStyle = '#9ecbff'; g.font = '600 34px Inter, system-ui, sans-serif';
  g.fillText(id === 'meeting' ? 'Walk up and press E to present, or to call a meeting' : 'Walk up and press E: show your screen or play a video', 512, 320);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The screen on the wall, and the projector hanging in front of it. `w` is the screen's width (16:9). */
export function ProjectorScreen({ id, w = 3.4 }) {
  const info = useOffice((s) => s.projector[id]);
  const idle = useMemo(() => idleTexture(id), [id]);
  const tex = useMemo(() => {
    const m = projectorMedia(id);
    if (!m) return null;
    const t = m.video ? new THREE.VideoTexture(m.video) : new THREE.Texture(m.image);
    t.colorSpace = THREE.SRGBColorSpace;
    if (m.image) t.needsUpdate = true;
    return t;
  }, [id, info?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => tex?.dispose(), [tex]);
  const h = (w * 9) / 16;
  const open = (e) => { e.stopPropagation(); useOffice.getState().setProjectorOpen(id); };
  return (
    <group>
      <group position={[0, 1.15 + h / 2, 0.52]} onClick={open}>
        <RoundedBox args={[w + 0.16, h + 0.16, 0.04]} radius={0.02}><meshStandardMaterial color="#e9ebef" roughness={0.6} /></RoundedBox>
        <mesh position-z={0.025}><planeGeometry args={[w, h]} /><meshBasicMaterial map={tex ?? idle} toneMapped={false} /></mesh>
      </group>
      {/* the projector itself, on a pole from the ceiling, a few metres out */}
      <group position={[0, 3.4, 3.2]}>
        <mesh position-y={0.8}><cylinderGeometry args={[0.03, 0.03, 1.6, 8]} /><meshStandardMaterial color="#2a2e35" /></mesh>
        <RoundedBox args={[0.5, 0.16, 0.42]} radius={0.04}><meshStandardMaterial color="#dfe3e8" roughness={0.4} /></RoundedBox>
        <mesh position={[0, 0, -0.22]} rotation-x={Math.PI / 2}><cylinderGeometry args={[0.06, 0.06, 0.04, 16]} /><meshStandardMaterial color="#1b1f27" emissive={info ? '#cfe3ff' : '#000000'} emissiveIntensity={info ? 1.5 : 0} /></mesh>
      </group>
      {info && <pointLight position={[0, 1.15 + h / 2, 1.2]} intensity={2.5} distance={4} color="#cfe3ff" />}
    </group>
  );
}

/** The projector's controls (and, in the conference room, the meeting), in a box at the side of the screen. */
export function ProjectorPanel() {
  const id = useOffice((s) => s.projectorOpen);
  const info = useOffice((s) => (id ? s.projector[id] : null));
  const meeting = useOffice((s) => s.meeting);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState([]);
  const [live, setLive] = useState('');
  const file = useRef(null);
  const box = useRef(null);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [lines, live]);
  useEffect(() => { setError(''); }, [id]);
  if (!id) return null;
  const S = useOffice.getState;
  const close = () => S().setProjectorOpen(null);
  const run = async (fn) => { setError(''); try { await fn(); } catch (e) { setError(e?.name === 'NotAllowedError' ? tr('Sharing was cancelled.') : String(e?.message || e)); } };
  const present = async () => {
    const said = text.trim();
    if (!said || busy) return;
    setText(''); setBusy(true); setLive('');
    setLines((l) => [...l, { who: S().bossName || tr('You'), text: said, me: true }]);
    const r = await presentToMeeting(said, (t) => setLive(t));
    setLive('');
    if (r.error && !r.reply) setLines((l) => [...l, { who: '⚠', text: r.error }]);
    else setLines((l) => [...l, ...playMeetingReplies(r.reply)]);
    setBusy(false);
  };
  return (
    <div className="pc proj-panel" onClick={(e) => e.stopPropagation()}>
      <div className="pc-head">
        <div>
          <b>🎬 {tr(NAMES[id] || id)} · {tr('projector')}</b>
          <span>{info ? `${tr('Showing')}: ${info.title}` : tr('Nothing on the screen')}</span>
        </div>
        <div className="pc-head-actions"><button className="pc-x" onClick={close} aria-label={tr('Close')}>✕</button></div>
      </div>
      <div className="proj-actions">
        <button onClick={() => run(() => shareScreen(id))}>🖥️ {tr('Share my screen')}</button>
        <button onClick={() => file.current?.click()}>🎞️ {tr('Video or picture…')}</button>
        {info?.kind === 'video' && <button onClick={() => togglePause(id)}>⏯ {tr('Pause / play')}</button>}
        {info && <button onClick={() => stopProjector(id)}>⏹ {tr('Stop')}</button>}
        <input ref={file} type="file" accept="video/*,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; run(() => showFile(id, f)); }} />
      </div>
      <p className="proj-note">{tr('What you show stays in this browser: it is not uploaded. To watch an online video, open it in another tab and share that tab.')}</p>
      {error && <div className="pc-err">{error}</div>}
      {id === 'meeting' && (
        <div className="proj-meeting">
          {!meeting ? (
            <button className="proj-call" onClick={() => S().callMeeting()}>👥 {tr('Call a meeting: everyone to the conference room')}</button>
          ) : (
            <>
              <div className="proj-meeting-head"><b>👥 {tr('Meeting in progress')}</b><button className="link" onClick={() => { S().endMeeting(); setLines([]); }}>{tr('End meeting')}</button></div>
              <div className="pc-msgs" ref={box}>
                {!lines.length && !live && <div className="pc-empty">{tr('Say what you are presenting or want to discuss. The team answers one by one.')}</div>}
                {lines.map((l, i) => <div key={i} className={`pc-msg ${l.me ? 'me' : 'ai'}`}><b className="pc-who">{l.who}</b> {l.text}</div>)}
                {live && <div className="pc-msg ai">{live}</div>}
              </div>
              <div className="pc-input">
                <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') present(); if (e.key === 'Escape') close(); e.stopPropagation(); }}
                  placeholder={tr('Present a plan, ask a question…')} disabled={busy} />
                <button onClick={present} disabled={busy || !text.trim()}>{busy ? '…' : tr('Present')}</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

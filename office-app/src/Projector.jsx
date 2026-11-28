// The projectors: a screen on the conference room's end wall and one in the learning library. Walk up and press E
// (or click the screen) to put your screen, a video or a picture on it. In the conference room you can also call a
// meeting: the team comes in and sits round the table, you say what you are presenting, and they answer in turn.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import { useOffice } from './store.js';
import { projectorMedia, shareScreen, showFile, stopProjector, togglePause, openLink, restoreLink } from './projector.js';
import { presentToMeeting, playMeetingReplies, previewLink } from './live.js';
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

/** A link on the screen: a YouTube video's thumbnail and title, or a page's title and site. */
function linkTexture(link) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 576;
  const g = c.getContext('2d');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const draw = (img) => {
    g.fillStyle = '#0d1520'; g.fillRect(0, 0, 1024, 576);
    if (img) {
      const s = Math.max(1024 / img.width, 576 / img.height);
      g.drawImage(img, (1024 - img.width * s) / 2, (576 - img.height * s) / 2, img.width * s, img.height * s);
      const grad = g.createLinearGradient(0, 300, 0, 576);
      grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.85)');
      g.fillStyle = grad; g.fillRect(0, 300, 1024, 276);
    } else {
      g.fillStyle = '#9ecbff'; g.font = '800 120px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(link.kind === 'youtube' ? '▶' : '🌐', 512, 220);
    }
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = '#ffffff'; g.font = '800 44px Inter, system-ui, sans-serif';
    let title = String(link.title || '');
    while (title.length > 4 && g.measureText(title).width > 960) title = `${title.slice(0, -2)}…`.replace(/……$/, '…');
    g.fillText(title, 32, 500);
    g.fillStyle = '#9ecbff'; g.font = '600 28px Inter, system-ui, sans-serif';
    let host = ''; try { host = new URL(link.url).hostname.replace(/^www\./, ''); } catch { /* none */ }
    g.fillText(link.kind === 'youtube' ? '▶ YouTube · plays in the player box' : `🔗 ${host}`, 32, 548);
    t.needsUpdate = true;
  };
  draw(null);
  if (link.kind === 'youtube' && link.id) {
    const img = new Image();
    img.onload = () => draw(img);
    img.src = `/api/office/yt-thumb/${encodeURIComponent(link.id)}`;
  }
  return t;
}

/** The screen on the wall, and the projector hanging in front of it. `w` is the screen's width (16:9). */
export function ProjectorScreen({ id, w = 3.4 }) {
  const info = useOffice((s) => s.projector[id]);
  const idle = useMemo(() => idleTexture(id), [id]);
  // a link shown before the page was reloaded comes back on the screen
  useEffect(() => { restoreLink(id); }, [id]);
  const tex = useMemo(() => {
    const m = projectorMedia(id);
    if (!m) return null;
    if (m.kind === 'link') return linkTexture(m.link);
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
  const [link, setLink] = useState('');
  const [opening, setOpening] = useState(false);
  const player = useOffice((s) => s.player);
  const file = useRef(null);
  const box = useRef(null);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [lines, live]);
  useEffect(() => { setError(''); }, [id]);
  if (!id) return null;
  const S = useOffice.getState;
  const close = () => S().setProjectorOpen(null);
  const run = async (fn) => { setError(''); try { await fn(); } catch (e) { setError(e?.name === 'NotAllowedError' ? tr('Sharing was cancelled.') : String(e?.message || e)); } };
  const openTyped = async () => {
    const url = link.trim();
    if (!url || opening) return;
    setOpening(true); setError('');
    const p = await previewLink(url);
    setOpening(false);
    if (!p.ok) { setError(p.error || tr('Could not open that link.')); return; }
    try { openLink(id, p); setLink(''); } catch (e) { setError(String(e?.message || e)); }
  };
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
        {info?.kind === 'link' && player !== id && <button onClick={() => useOffice.getState().setPlayer(id)}>▶ {tr('Show player')}</button>}
      </div>
      <div className="proj-link">
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder={tr('Paste a link: YouTube or any https:// page')}
          onKeyDown={(e) => { if (e.key === 'Enter') openTyped(); if (e.key === 'Escape') close(); e.stopPropagation(); }} disabled={opening} />
        <button onClick={openTyped} disabled={opening || !link.trim()}>{opening ? '…' : tr('Open link')}</button>
      </div>
      <p className="proj-note">{tr('Your screen and files stay in this browser: nothing is uploaded. A link plays in the player box; the screen shows its title.')}</p>
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

const SANDBOX = {
  youtube: 'allow-scripts allow-same-origin allow-presentation allow-popups',
  page: 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox',
};

/**
 * The player box for a projector's link: a YouTube video (the privacy-friendly embed, from its start time) or a page
 * in a sandboxed frame. It stays open while you walk about; minimise it, make it bigger, or stop it.
 */
export function LinkPlayer() {
  const id = useOffice((s) => s.player);
  const info = useOffice((s) => (id ? s.projector[id] : null));
  const [big, setBig] = useState(false);
  if (!id || !info || info.kind !== 'link') return null;
  const m = projectorMedia(id);
  const l = m?.link;
  if (!l) return null;
  const src = l.kind === 'youtube'
    ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(l.id)}?${new URLSearchParams({ autoplay: m.autoplay ? '1' : '0', start: String(l.start || 0), rel: '0', playsinline: '1' })}`
    : l.url;
  const newTab = <a href={l.url} target="_blank" rel="noopener noreferrer">{tr('Open in new tab')} ↗</a>;
  return (
    <div className={`link-player ${big ? 'big' : ''}`}>
      <div className="link-player-bar">
        <b title={l.title}>🎬 {tr(NAMES[id] || id)} · {l.title}</b>
        <span>
          <button onClick={() => setBig(!big)}>{big ? tr('Smaller') : tr('Bigger')}</button>
          {newTab}
          <button onClick={() => useOffice.getState().setPlayer(null)} title={tr('Hide the player (the screen keeps the link)')}>–</button>
          <button onClick={() => stopProjector(id)} title={tr('Take it off the projector')}>✕</button>
        </span>
      </div>
      {l.kind === 'page' && l.frameable === false ? (
        <div className="link-player-blocked">{tr("This site doesn't let other pages show it inside them.")} {newTab}</div>
      ) : (
        <iframe key={src} src={src} title={l.title} sandbox={SANDBOX[l.kind] || SANDBOX.page} referrerPolicy="strict-origin-when-cross-origin"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
      )}
      {l.kind === 'page' && l.frameable !== false && <div className="link-player-foot">{tr('Blank?')} {newTab}</div>}
    </div>
  );
}

/** Atlas asked to put a link on a projector: it goes up only when the owner clicks Show. */
export function ProjectorAsk() {
  const ask = useOffice((s) => s.projectorAsk);
  const [error, setError] = useState('');
  useEffect(() => { setError(''); }, [ask]);
  if (!ask) return null;
  const S = useOffice.getState;
  const show = () => { try { openLink(ask.id, ask.link); S().setProjectorAsk(null); } catch (e) { setError(String(e?.message || e)); } };
  return (
    <div className="proj-ask">
      <div>🎬 <b>{ask.by}</b> {tr('wants to show')} <b>“{ask.link.title}”</b> {tr('on the {room} projector.', { room: tr(NAMES[ask.id] || ask.id) })}</div>
      <div className="proj-ask-url">{ask.link.url}</div>
      {error && <div className="pc-err">{error}</div>}
      <div className="proj-ask-actions">
        <button className="on" onClick={show}>{tr('Show')}</button>
        <button onClick={() => S().setProjectorAsk(null)}>{tr('Ignore')}</button>
      </div>
    </div>
  );
}

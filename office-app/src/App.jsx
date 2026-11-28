import { useEffect, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, SoftShadows } from '@react-three/drei';
import Office from './Office.jsx';
import Agent from './Agent.jsx';
import { useOffice } from './store.js';
import { SEV, SEV_LOWER, LEVELS, rank, visibleSev, atLeast, maxSev } from './severity.js';
import { tr, LOCALE, STATE_LABEL, SERVICE_LABEL } from './i18n.js';
import { startSim, stopSim } from './sim.js';
import { startLive, stopLive, handleEvent, resolveServer, sendOrder } from './live.js';
import { startSun } from './sun.js';
import { BossController, BossHud } from './Boss.jsx';
import { replayUrl, startReplay, stopReplay } from './replay.js';
import { SkyBackdrop, StudioLight, Effects, CinemaCamera } from './Look.jsx';
import Sky from './Sky.jsx';
import { FollowCamera, Visitors } from './Director.jsx';
import { TOP as ROOF_TOP } from './Roof.jsx';
import RoomPlan, { ScheduleCard } from './Plan.jsx';
import Reception, { ReceptionPanel } from './Reception.jsx';
import { ComputerPanel } from './Computer.jsx';
import { ProjectorPanel } from './Projector.jsx';

// A phone or a small tablet: a lighter picture, and the panel as a sheet that pulls up.
function useSmall() {
  const q = '(max-width: 760px)';
  const [small, setSmall] = useState(() => { try { return matchMedia(q).matches; } catch { return false; } });
  useEffect(() => {
    let m; try { m = matchMedia(q); } catch { return undefined; }
    const on = () => setSmall(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return small;
}

const fmtTokens = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n || 0));
const fmtReset = (ms) => {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { weekday: 'short', hour: 'numeric' });
};

function UsageMeter({ title, limit, used }) {
  const left = limit?.leftPct;
  const known = typeof left === 'number';
  const tone = !known ? '' : left > 40 ? 'ok' : left > 15 ? 'warn' : 'low';
  return (
    <div className="meter">
      <div className="meter-top">
        <span>{title}</span>
        <b className={tone}>{known ? tr('{n}% left', { n: Math.round(left) }) : used ? tr('{n} tokens', { n: fmtTokens(used.tokens) }) : '—'}</b>
      </div>
      {known && <div className="meter-bar"><i className={tone} style={{ width: `${Math.max(2, left)}%` }} /></div>}
      <div className="meter-sub">
        {known
          ? [limit.resetsAt ? tr('resets {t}', { t: fmtReset(limit.resetsAt) }) : '', used ? tr('{n} tokens used', { n: fmtTokens(used.tokens) }) : ''].filter(Boolean).join(' · ')
          : tr('Atlas has not been told its share of the plan yet')}
      </div>
    </div>
  );
}

function UsageCard() {
  const usage = useOffice((s) => s.usage);
  if (!usage) return null;
  const done = Object.values(usage.done || {}).reduce((a, b) => a + b, 0);
  return (
    <div className="usage">
      <h2>{tr('Claude usage')}</h2>
      <UsageMeter title={tr('5-hour window')} limit={usage.limits?.fiveHour} used={usage.used?.fiveHour} />
      <UsageMeter title={tr('This week')} limit={usage.limits?.sevenDay} used={usage.used?.sevenDay} />
      <p className="usage-day">{tr('Today: {d} tasks done · {t} tokens', { d: done, t: fmtTokens(usage.used?.today?.tokens || 0) })}</p>
    </div>
  );
}

// Type an order right in the office. It goes to Atlas, or to the helper picked (Atlas hands it over).
function OrderBar() {
  const agents = useOffice((s) => s.agents);
  const selected = useOffice((s) => s.selected);
  const order = useOffice((s) => s.order);
  const setOrder = useOffice((s) => s.setOrder);
  const conn = useOffice((s) => s.conn);
  const [to, setTo] = useState('manager');
  const [text, setText] = useState('');
  useEffect(() => { if (selected && agents[selected]) setTo(selected); }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps
  const busy = !!order?.busy;
  const submit = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setText('');
    sendOrder(to, t);
  };
  const who = order ? agents[order.to]?.name || 'Atlas' : '';
  return (
    <div className="order">
      {order && (
        <div className={`order-reply ${order.error ? 'bad' : ''}`}>
          <div className="order-head">
            <b>{order.to === 'manager' ? tr('You asked Atlas') : tr('You asked the {name}', { name: who })}</b>
            <span className="order-q">{order.text}</span>
            {!busy && <button type="button" className="order-x" onClick={() => setOrder(null)} aria-label={tr('Close')}>×</button>}
          </div>
          <div className="order-body">
            {order.reply || (busy ? tr('Working on it… watch the floor.') : '')}
            {order.error && <p className="order-err">{order.error}</p>}
          </div>
        </div>
      )}
      <form className="order-form" onSubmit={submit}>
        <select value={to} onChange={(e) => setTo(e.target.value)} aria-label={tr('Who gets the order')}>
          {Object.values(agents).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input
          value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} enterKeyHint="send"
          placeholder={conn === 'on' ? tr('Give an order…') : tr('Not connected to Atlas')}
        />
        <button type="submit" disabled={busy || !text.trim()}>{busy ? tr('Sent') : tr('Send')}</button>
      </form>
    </div>
  );
}

const CONN = {
  off: [tr('Not connected'), '#8f9bb3'],
  connecting: [tr('Connecting…'), '#e0a03a'],
  on: [tr('Connected to Atlas'), '#4cc38a'],
  replay: [tr('Replaying a recording'), '#7c9cff'],
  error: [tr('Not connected to Atlas. Retrying…'), '#ff5a5f'],
};
const KIND_ICON = { docker: '🐳', terminal: '⌨', file: '📄' };
const hm = (d) => (d ? new Date(d).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }) : '—');

// Live rejimni Claude'siz sinash uchun namunaviy hodisalar
const DEMO = [
  { hook: 'SessionStart' },
  { hook: 'UserPromptSubmit', prompt: tr('Add a login page and an API'), source: 'telegram', session_id: 'demo' },
  { hook: 'PreToolUse', tool: 'Agent', tool_use_id: 'demo1', input: { subagent_type: 'coder', description: tr('Write the login API') } },
  { hook: 'PreToolUse', tool: 'Read', agent_type: 'coder', input: { file_path: 'src/server/routes.ts' } },
  { hook: 'PreToolUse', tool: 'Agent', tool_use_id: 'demo2', input: { subagent_type: 'writer', description: tr('Login form') } },
  { hook: 'PreToolUse', tool: 'Edit', agent_type: 'coder', input: { file_path: 'src/server/auth.ts' } },
  { hook: 'PreToolUse', tool: 'Write', agent_type: 'writer', input: { file_path: 'src/pages/Login.tsx' } },
  { hook: 'PostToolUseFailure', tool: 'Bash', agent_type: 'coder', input: { command: 'npm test' }, error: 'Exit code 1\nError: Cannot find module \'express\'' },
  { hook: 'PostToolUseFailure', tool: 'Agent', tool_use_id: 'demo2', agent_type: 'manager', severity: 'moderate', error: tr('The writer ran into an error') },
  { hook: 'PostToolUse', tool: 'Agent', tool_use_id: 'demo1' },
  { hook: 'Stop', session_id: 'demo' },
];

async function runDemo() {
  for (const ev of DEMO) {
    handleEvent(ev);
    await new Promise((r) => setTimeout(r, ev.hook === 'Service' && ev.state === 'down' ? 7000 : 1800));
  }
}

function SunRow() {
  const { themeMode, setThemeMode, timeOffsetH, setTimeOffset, sunInfo, sky } = useOffice();
  const icon = sky.alt > 6 ? '☀' : sky.alt > -4 ? '🌅' : '🌙';
  return (
    <div className="sun">
      <div className="sun-top">
        <div className="seg seg3">
          {[['auto', tr('Auto')], ['day', tr('Day')], ['night', tr('Night')]].map(([k, l]) => (
            <button key={k} className={themeMode === k ? 'on' : ''} onClick={() => setThemeMode(k)}>{l}</button>
          ))}
        </div>
        <span className="sun-alt" title={tr('Sun height')}>{icon} {Math.round(sky.alt)}°</span>
      </div>
      {themeMode === 'auto' && (
        <>
          <div className="sun-info">
            {sunInfo ? (
              <>
                <span>📍 {sunInfo.city || tr('Location')} <em>({tr(sunInfo.source)})</em></span>
                <span>↑ {hm(sunInfo.sunrise)} · ↓ {hm(sunInfo.sunset)}</span>
              </>
            ) : <span>{tr('Finding your location…')}</span>}
          </div>
          <label className="time">
            <span>{timeOffsetH === 0 ? tr('Now') : tr('{n} h', { n: `${timeOffsetH > 0 ? '+' : ''}${timeOffsetH}` })} · {hm(sunInfo?.now)}</span>
            <input type="range" min={-12} max={12} step={0.5} value={timeOffsetH} onChange={(e) => setTimeOffset(Number(e.target.value))} />
            {timeOffsetH !== 0 && <button className="link" onClick={() => setTimeOffset(0)}>{tr('Back to now')}</button>}
          </label>
        </>
      )}
    </div>
  );
}

function RoofRow() {
  const roofMode = useOffice((s) => s.roofMode);
  const setRoofMode = useOffice((s) => s.setRoofMode);
  return (
    <div className="roof-row">
      <span>{tr('Roof')}</span>
      <div className="seg seg3">
        {[['auto', tr('Auto')], ['on', tr('On')], ['off', tr('Off')]].map(([k, l]) => (
          <button key={k} className={roofMode === k ? 'on' : ''} onClick={() => setRoofMode(k)} title={k === 'auto' ? tr('Lifts off while someone is working') : ''}>{l}</button>
        ))}
      </div>
    </div>
  );
}

// Where the camera stands for each view. `small` is a phone, held upright.
function poseFor(name, W, H, small) {
  const f = (W + 14) / (small ? 22 : 31);
  if (name === 'street') return { pos: [-W / 2 - 22, 3.2, H / 2 + 26], target: [-W / 2 + 8, 8, -6] };
  // across the street from the front door: the shops, with the traffic going past
  if (name === 'shops') return { pos: [-W / 2 - 32, 6, H / 2 + 5], target: [-W / 2 + 20, 3, H / 2 + 27] };
  if (name === 'deck') return { pos: [-W / 2 + 4, ROOF_TOP + 6.5, H / 2 + 15], target: [-W / 2 + 11, ROOF_TOP + 0.5, 4] };   // above the roof deck
  return { pos: small ? [5 * f, 26 * f, 26 * f] : [9 * f, 23 * f, 29 * f], target: [small ? -2 : 1, 0, 1.5] };
}

function Views({ small }) {
  const view = useOffice((s) => s.view);
  const W = useOffice((s) => s.layout.W);
  const H = useOffice((s) => s.layout.H);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);
  useEffect(() => {
    if (!controls || !view || view.name === 'auto') return;
    const p = poseFor(view.name, W, H, small);
    camera.position.set(...p.pos);
    controls.target.set(...p.target);
    controls.update();
  }, [view, controls, camera, W, H, small]);
  return null;
}

function ViewRow() {
  const setView = useOffice((s) => s.setView);
  const name = useOffice((s) => s.view?.name || 'auto');
  const TIP = { auto: tr('Follows whoever is working') };
  return (
    <div className="roof-row">
      <span>{tr('View')}</span>
      <div className="seg seg5">
        {[['auto', tr('Auto')], ['overview', tr('Floor')], ['street', tr('Street')], ['shops', tr('Shops')], ['deck', tr('Deck')]].map(([k, l]) => (
          <button key={k} className={name === k ? 'on' : ''} onClick={() => setView(k)} title={TIP[k] || ''}>{l}</button>
        ))}
      </div>
    </div>
  );
}

function BossRow() {
  const { boss, setBoss, bossName, setBossName, mode, setTeam, team } = useOffice();
  const [role, setRole] = useState('');
  const add = (e) => {
    e.preventDefault();
    const id = role.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
    if (id) setTeam([...team, { id }]);
    setRole('');
  };
  return (
    <div className="boss-row">
      <button className={`boss-btn ${boss ? 'on' : ''}`} onClick={() => setBoss(!boss)}>
        👔 {boss ? tr('Leave boss mode') : tr('Boss mode')} <kbd>B</kbd>
      </button>
      <div className="boss-name">
        <input value={bossName} onChange={(e) => setBossName(e.target.value)} placeholder={tr('Your name')} maxLength={18} title={tr('Boss name')} />
        {mode === 'sim' && (
          <form onSubmit={add} className="add-role">
            <input value={role} onChange={(e) => setRole(e.target.value)} placeholder={tr('+ teammate (flutter)')} maxLength={20} />
          </form>
        )}
      </div>
    </div>
  );
}

// Faol muammolar darajalar bo'yicha: agentlarning guruhlangan muammolari + nosoz xizmatlar
function useCounts() {
  const issues = useOffice((s) => s.issues);
  const services = useOffice((s) => s.services);
  const c = { minor: 0, moderate: 0, major: 0, critical: 0 };
  for (const is of Object.values(issues)) if (c[is.severity] !== undefined) c[is.severity]++;
  for (const sv of Object.values(services)) if (c[sv.severity] !== undefined) c[sv.severity]++;
  return c;
}

function Counts() {
  const c = useCounts();
  const items = ['critical', 'major', 'moderate', 'minor'].filter((k) => c[k]);
  if (!items.length) return <p className="sub sub-ok">{tr('No problems')}</p>;
  return (
    <p className="counts">
      {items.map((k) => (
        <span key={k} className={`count sev-${k}`}><i />{c[k]} {SEV_LOWER[k]}</span>
      ))}
    </p>
  );
}

const PANIC_OPTS = [['minor', tr('Minor')], ['moderate', tr('Moderate')], ['major', tr('Major')], ['critical', tr('Critical')]];
const SOUND_OPTS = [['off', tr('Off')], ['major', tr('Major')], ['critical', tr('Critical')]];
const COLOR_OPTS = [['status', tr('By status')], ['red', tr('Red only')]];
const FEED_OPTS = [['info', tr('All')], ['minor', tr('Minor+')], ['moderate', tr('Moderate+')], ['major', tr('Major+')]];

function Choice({ id, label, hint, value, options, onChange }) {
  return (
    <div className="choice" role="group" aria-labelledby={`${id}-l`}>
      <span id={`${id}-l`} className="choice-label">{label}{hint && <em>{hint}</em>}</span>
      <div className="seg seg-sm" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
        {options.map(([v, l]) => (
          <button key={v} type="button" className={value === v ? 'on' : ''} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>
        ))}
      </div>
    </div>
  );
}

function ErrorSettings() {
  const { settings, setSetting, resetSettings, serverSeverity } = useOffice();
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('agent-office-errors-open') === '1'; } catch { return false; } });
  const toggle = () => { setOpen(!open); try { localStorage.setItem('agent-office-errors-open', open ? '0' : '1'); } catch {} };
  const fromProject = Object.keys(serverSeverity || {}).length > 0;
  return (
    <div className={`errs ${open ? 'open' : ''}`}>
      <button type="button" className="errs-head" onClick={toggle} aria-expanded={open}>
        <b>{tr('Errors')}</b>
        <span className="legend" aria-label={tr('Color key')}>
          {['minor', 'moderate', 'major', 'critical'].map((k) => <i key={k} className={`sev-${k}`} title={SEV[k].label} />)}
        </span>
        <span className="errs-sum">{tr('panic at: {x}', { x: SEV[settings.panicAt].label.toLowerCase() })}</span>
        <span className="chev">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="errs-body">
          <Choice id="panicAt" label={tr('Panic threshold')} hint={tr('red light, siren, lounge')} value={settings.panicAt} options={PANIC_OPTS} onChange={(v) => setSetting('panicAt', v)} />
          <Choice id="colorMode" label={tr('Color mode')} value={settings.colorMode} options={COLOR_OPTS} onChange={(v) => setSetting('colorMode', v)} />
          <Choice id="sound" label={tr('Sound')} hint={tr('alarm from this level')} value={settings.sound} options={SOUND_OPTS} onChange={(v) => setSetting('sound', v)} />
          <Choice id="feedMin" label={tr('Event feed')} hint={tr('hide below')} value={settings.feedMin} options={FEED_OPTS} onChange={(v) => setSetting('feedMin', v)} />
          <ul className="legend-list">
            {LEVELS.map((k) => (
              <li key={k}><i className={`sev-${k}`} /><b>{SEV[k].label}</b><span>{LEGEND[k]}</span></li>
            ))}
          </ul>
          <div className="errs-foot">
            <span>{fromProject ? tr('Defaults: .agent-office.json') : tr('Saved in this browser')}</span>
            <button type="button" className="link" onClick={resetSettings}>{tr('Reset to defaults')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

const LEGEND = {
  info: tr('plain log, 2xx/3xx/404'),
  minor: tr('warning, retry, timeout, 4xx'),
  moderate: tr('ERROR line, failed tool, 5xx'),
  major: 'Traceback, …Error:, unhealthy, exit ≠ 0',
  critical: tr('FATAL, PANIC, OOM, DB auth, container crashed'),
};

function Services() {
  const services = useOffice((s) => s.services);
  const agents = useOffice((s) => s.agents);
  const settings = useOffice((s) => s.settings);
  const list = Object.values(services).filter((s) => s.state !== 'removed').sort((a, b) => (rank(b.severity) - rank(a.severity)) || a.name.localeCompare(b.name));
  if (!list.length) return null;
  return (
    <div className="services">
      <h2>{tr('Services')}</h2>
      <ul>
        {list.map((sv) => (
          <li key={sv.id} className={`sv sv-${sv.state} ${visibleSev(sv.severity, settings) ? `sev-${visibleSev(sv.severity, settings)}` : ''}`} title={sv.detail}>
            <span className="sv-dot" />
            <span className="sv-icon">{KIND_ICON[sv.kind] ?? '•'}</span>
            <span className="sv-name">{sv.name}</span>
            <span className="sv-agent" style={{ color: agents[sv.agent]?.color }}>{agents[sv.agent]?.name ?? sv.agent}</span>
            <span className="sv-state">{SERVICE_LABEL(sv.state)}{sv.restarts > 1 ? ` ×${sv.restarts}` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Panel() {
  const { mode, conn, agents, selected, feed, select, muted, toggleMute, clearErrors, replayInfo, sheet, setSheet, usage } = useOffice();
  const isReplay = !!replayInfo;
  const list = Object.values(agents);
  const sel = selected && agents[selected];
  const [connText, connColor] = CONN[conn];
  const working = list.filter((a) => a.state === 'working').length;
  const settings = useOffice((s) => s.settings);

  return (
    <aside className={`panel ${sheet ? 'open' : ''}`}>
      <button type="button" className="sheet-handle" onClick={() => setSheet(!sheet)} aria-expanded={sheet}>
        <i />{sheet ? tr('Hide details') : tr('Show the team and usage')}
      </button>
      <div className="brand">
        <div className="brand-row">
          <div>
            <h1>{tr('Atlas Office')}</h1>
            <a className="back-link" href="/">← {tr('Back to Atlas')}</a>
            <p className="sub">{tr('{n} working · {m} total', { n: working, m: list.length })}</p>
            <Counts />
          </div>
          <button className="icon-btn" onClick={toggleMute} title={muted ? tr('Unmute') : tr('Mute')}>{muted ? '🔕' : '🔔'}</button>
        </div>
        {isReplay && (
          <div className="replay-card">
            <b>▶ {replayInfo.title}</b>
            <span>{replayInfo.recordedAt} · {tr('real hook events')}</span>
            <div className="replay-bar"><i style={{ width: `${(100 * replayInfo.at) / Math.max(1, replayInfo.total)}%` }} /></div>
          </div>
        )}
        {mode === 'live' && !isReplay && (
          <div className="conn">
            <span className="dot" style={{ background: connColor }} />
            {connText}
            <button className="link" onClick={runDemo}>{tr('Test events')}</button>
          </div>
        )}
        <BossRow />
        <ErrorSettings />
        <SunRow />
        <RoofRow />
        <ViewRow />
        <RoomPlan />
        <ScheduleCard />
      </div>

      <div className="scroll">
        <UsageCard />
        <div className="agents">
          <div className="agents-head">{tr("Atlas and its team")}<span>{tr('the other desks in the office belong to your own agents')}</span></div>
          {list.map((a) => {
            const isBad = a.state === 'panic' || a.down;
            const vis = visibleSev(isBad ? maxSev(maxSev(a.sev ?? 'info', a.down?.severity ?? 'info'), a.alarm?.severity ?? 'major') : a.sev, settings);
            return (
              <button key={a.id} className={`agent-row ${selected === a.id ? 'sel' : ''} ${isBad ? 'bad' : ''} ${vis ? `sev-${vis}` : ''}`} onClick={() => select(a.id)}>
                <span className="dot" style={{ background: a.color }} />
                <span className="nm">
                  {a.name}
                  {usage?.done?.[a.id] > 0 && <span className="done-count" title={tr('Tasks done today')}>✓ {usage.done[a.id]}</span>}
                  {a.errors > 0 && (
                    <span className="err-count" onClick={(e) => { e.stopPropagation(); clearErrors(a.id); }} title={tr('Error count (click to clear)')}>{a.errors}</span>
                  )}
                </span>
                <span className={`st st-${a.down ? 'down' : a.state} ${vis ? `sev-${vis}` : ''}`}>{a.down ? STATE_LABEL('down') : a.state === 'panic' ? (SEV[vis ?? 'major'].label + '!') : vis ? SEV[vis].label.toLowerCase() : STATE_LABEL(a.state)}</span>
                <span className="task">
                  {a.down ? `💥 ${a.down.service} ${a.down.reason}` : a.state === 'panic' ? `🔥 ${a.alarm?.text}` : a.task || '—'}
                </span>
              </button>
            );
          })}
        </div>

        <Services />

        <div className="log">
          <h2>{sel ? tr('{name} — recent activity', { name: sel.name }) : tr('Events')}</h2>
          <ul>
            {(() => {
              const rows = (sel ? sel.log.map((l) => ({ ...l, who: sel.name, color: sel.color })) : feed)
                .filter((l) => atLeast(l.severity ?? 'info', settings.feedMin));
              if (!rows.length) return <li className="empty">{settings.feedMin === 'info' ? tr('Nothing yet') : tr('No {level} or higher events', { level: SEV[settings.feedMin].label.toLowerCase() })}</li>;
              return rows.map((l, i) => {
                const vis = visibleSev(l.severity, settings);
                return (
                  <li key={l.key ? `${l.key}` : i} className={vis ? `sev-${vis}` : ''}>
                    <time>{l.time}</time>
                    <b style={{ color: l.color }}>{l.who}</b>
                    <span>
                      {vis && <i className="sev-tag">{SEV[vis].label}</i>}
                      {l.source && <i className="src">{l.source}</i>}{l.text}
                      {l.count > 1 && <i className="rep">×{l.count}</i>}
                    </span>
                  </li>
                );
              });
            })()}
          </ul>
        </div>
      </div>
    </aside>
  );
}

// Sahna ustidagi qizil ogohlantirish
function AlertBanner() {
  const agents = useOffice((s) => s.agents);
  const select = useOffice((s) => s.select);
  const settings = useOffice((s) => s.settings);
  const issues = Object.values(agents)
    .filter((a) => a.state === 'panic' || a.down)
    .map((a) => ({ a, sev: maxSev(maxSev(a.sev ?? 'info', a.down?.severity ?? 'info'), a.alarm?.severity ?? 'major') }))
    .sort((x, y) => rank(y.sev) - rank(x.sev));
  if (!issues.length) return null;
  return (
    <div className="alerts">
      {issues.map(({ a, sev }) => (
        <button key={a.id} className={`alert ${a.down ? 'down' : 'panic'} sev-${visibleSev(sev, settings) ?? 'major'}`} onClick={() => select(a.id)}>
          <span className="alert-dot" />
          <b>{a.name}</b>
          <em className="alert-sev">{SEV[sev]?.label}</em>
          <span>{a.down ? tr('{service} {reason} — in the lounge', { service: a.down.service, reason: a.down.reason }) : a.alarm?.text}</span>
        </button>
      ))}
    </div>
  );
}

function Lights({ small }) {
  const sky = useOffice((s) => s.sky);
  const W = useOffice((s) => s.layout.W);
  const half = W / 2 + 16;
  const [dx, dy, dz] = sky.sunDir;
  return (
    <>
      {!small && <SoftShadows size={14} samples={12} focus={0.6} />}
      <fog attach="fog" args={[sky.horizon, 170 + W, 430]} />
      <ambientLight intensity={sky.ambient * 0.6} color={sky.ambientColor} />
      <hemisphereLight args={[sky.hemiTop, sky.hemiBottom, sky.hemiI]} />
      <directionalLight
        position={[dx * (half + 10), dy * (half + 10), dz * (half + 10)]}
        intensity={sky.sunI}
        color={sky.sunColor}
        castShadow
        shadow-mapSize={small ? [2048, 2048] : [4096, 4096]}
        shadow-bias={-0.0003}
        shadow-normalBias={0.02}
        shadow-camera-left={-half}
        shadow-camera-right={half}
        shadow-camera-top={half}
        shadow-camera-bottom={-half}
        shadow-camera-far={half * 4}
      />
      {/* oy nuri */}
      <directionalLight position={[-12, 24, -10]} intensity={sky.moonI} color="#9fb6ff" />
    </>
  );
}

export default function App() {
  const mode = useOffice((s) => s.mode);
  const ids = useOffice((s) => Object.keys(s.agents).join(','));
  const sky = useOffice((s) => s.sky);
  const small = useSmall();
  const W = useOffice((s) => s.layout.W);
  const cam = poseFor('overview', W, 22, small).pos;

  useEffect(() => {
    startSun();
    if (replayUrl()) return;
    // jamoa: loyiha sozlamasi yoki .claude/agents (server ishlayotgan bo'lsa)
    resolveServer().then((base) => fetch(`${base}/team`, { signal: AbortSignal.timeout(1500) }))
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j.team) && j.team.length) useOffice.getState().setTeam(j.team, { replace: true });
        if (j.project) useOffice.setState({ project: j.project });
        if (j.severity) useOffice.getState().setServerSeverity(j.severity); // .agent-office.json standartlari
      })
      .catch(() => {});
  }, []);
  const replay = replayUrl();
  useEffect(() => {
    if (!replay) return;
    startReplay(replay);
    return () => stopReplay();
  }, [replay]);
  useEffect(() => {
    if (replay) return;
    if (mode === 'sim') { stopLive(); startSim(); }
    else { stopSim(); startLive(); }
    return () => { stopSim(); stopLive(); };
  }, [mode, replay]);

  return (
    <div className={`app ${sky.lamps > 0.5 ? 'night' : 'day'}`}>
      <div className="stage" style={{ background: `linear-gradient(180deg, ${sky.top} 0%, ${sky.horizon} 70%)` }}>
        <Canvas
          shadows
          dpr={small ? [1, 1.5] : [1, 2]}
          gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
          camera={{ position: cam, fov: small ? 44 : 34, near: 0.5, far: 500 }}
          onPointerMissed={() => { const s = useOffice.getState(); if (s.selected) s.select(s.selected); }}
        >
          <SkyBackdrop />
          <StudioLight />
          <Sky />
          <Lights small={small} />
          <Office />
          {ids.split(',').map((id) => <Agent key={id} id={id} />)}
          <Visitors />
          <Reception />
          <OrbitControls makeDefault target={[1, 0, 1.5]} maxPolarAngle={1.5} minDistance={8} maxDistance={190} enableDamping dampingFactor={0.08} />
          <Views small={small} />
          <FollowCamera small={small} />
          <BossController />
          <CinemaCamera />
          {!small && <Effects />}
        </Canvas>
        <AlertBanner />
        <BossHud />
        <OrderBar />
        <ComputerPanel />
        <ReceptionPanel />
        <ProjectorPanel />
      </div>
      <Panel />
    </div>
  );
}

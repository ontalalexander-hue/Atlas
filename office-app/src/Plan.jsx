// The panel's "Rooms" card: which of the owner's sources are connected, and the room plan to edit.
import { useState } from 'react';
import { useOffice } from './store.js';
import { refreshWorld, savePlan } from './live.js';
import { tr } from './i18n.js';

const SOURCES = [['padayon', 'Padayon', 'businesses'], ['lifeos', 'Life OS', 'money'], ['railway', 'Railway', 'apps']];
const WORD = { ok: ['connected', 'ok'], stale: ['last copy (cannot reach it now)', 'warn'], error: ['cannot reach it', 'bad'], not_set_up: ['not connected', 'off'] };

export default function RoomPlan() {
  const world = useOffice((s) => s.world);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const start = () => { setText(JSON.stringify(world?.plan ?? { rooms: [] }, null, 2)); setMsg(null); setOpen(true); };
  const save = async () => {
    setBusy(true); setMsg(null);
    const r = await savePlan(text);
    setBusy(false);
    if (r.error) { setMsg({ bad: true, text: r.error }); return; }
    setMsg({ text: r.problems?.length ? `${tr('Saved, with notes')}: ${r.problems.join(' ')}` : tr('Saved. The office is rearranging.') });
    refreshWorld();
  };

  return (
    <div className="plan-card">
      <div className="plan-head">
        <span>{tr('Rooms')}</span>
        {!open && <button className="link" onClick={start}>{tr('Edit room plan')}</button>}
      </div>
      <div className="plan-sources">
        {SOURCES.map(([id, name, what]) => {
          const st = world?.[id]?.status ?? 'not_set_up';
          const [word, cls] = WORD[st] ?? WORD.not_set_up;
          return (
            <div key={id} className="plan-source" title={world?.[id]?.error || ''}>
              <span className={`plan-dot ${cls}`} />{name} <em>({tr(what)})</em><b>{tr(word)}</b>
            </div>
          );
        })}
      </div>
      {open && (
        <div className="plan-edit">
          <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} rows={12} />
          <div className="plan-actions">
            <button onClick={save} disabled={busy}>{busy ? tr('Saving…') : tr('Save')}</button>
            <button className="link" onClick={() => setOpen(false)}>{tr('Close')}</button>
          </div>
          {msg && <div className={`plan-msg ${msg.bad ? 'bad' : ''}`}>{msg.text}</div>}
        </div>
      )}
    </div>
  );
}

/** The panel's "Schedule" card: what is due in the next hours, and what was due earlier today. */
export function ScheduleCard() {
  const sch = useOffice((s) => s.schedule);
  const plan = useOffice((s) => s.layout.plan);
  if (!sch || !sch.jobs.length) return null;
  const now = Date.now();
  const today = new Date().toDateString();
  const past = sch.runs.filter((r) => r.at <= now).slice(-2);
  const next = sch.runs.filter((r) => r.at > now).slice(0, 6);
  const when = (t) => {
    const d = new Date(t);
    return (d.toDateString() === today ? '' : d.toLocaleDateString([], { weekday: 'short' }) + ' ') + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };
  return (
    <div className="plan-card">
      <div className="plan-head">
        <span>{tr('Schedule')}</span>
        <em>{sch.jobs.filter((j) => j.on).length} {tr('jobs')}</em>
      </div>
      <div className="sched-list">
        {[...past, ...next].map((r) => {
          const j = sch.jobs[r.job];
          if (!j) return null;
          const done = r.at <= now;
          return (
            <div key={`${r.job}-${r.at}`} className={`sched-row${done ? ' done' : ''}${!done && r.at - now < 3600_000 ? ' soon' : ''}`}>
              <time>{when(r.at)}</time>
              <div>{j.name}<small>{j.room ? (plan?.[j.room]?.name ?? j.room) : 'Atlas'} · {j.where === 'atlas' ? tr('Atlas runs it') : tr('your PC runs it')}</small></div>
            </div>
          );
        })}
        {!past.length && !next.length && <div className="sched-row done"><div>{tr('Nothing due in the next hours')}</div></div>}
      </div>
      <p className="sched-note">{tr('"Your PC" jobs are your Claude scheduled tasks, running on your own computer. The office shows them and acts them out in their rooms; Atlas does not run them again.')}</p>
    </div>
  );
}

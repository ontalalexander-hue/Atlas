// Live rejim: Claude Code hook'lari, Docker, terminal va log fayllardan kelgan hodisalarni
// agent harakatiga aylantiradi.
import { useOffice } from './store.js';
import { fromLegacy, isLevel, severityOf } from './severity.js';
import { tr } from './i18n.js';
import { personName } from './crew.js';

// Atlas serves the office feed itself, on the same address and behind the same login.
export const SERVER = '/api/office';
export const resolveServer = () => Promise.resolve(SERVER);
const S = () => useOffice.getState();
const SPAWN_TOOLS = new Set(['Task', 'Agent']);
const short = (s, n = 60) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s ?? '');
const base = (p) => (p ? p.split(/[\\/]/).pop() : '');
const firstLine = (s) => (s || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 2).join(' · ');

function describe(tool, input = {}) {
  if (input.file_path) return `${tool} ${base(input.file_path)}`;
  if (input.command) return `${tool} ${short(input.command, 48)}`;
  if (input.pattern) return `${tool} "${short(input.pattern, 30)}"`;
  if (input.url) return `${tool} ${short(input.url, 40)}`;
  if (input.query) return `${tool} "${short(input.query, 36)}"`;
  return tool || tr('action');
}

// Plugin agentlari "agent-office:backend" ko'rinishida keladi — ofisda "backend"
const norm = (n) => (n ? String(n).split(':').pop() : n);

let running = []; // ishga tushgan sub-agentlar (agent_type kelmasa zaxira)
// a background sub-agent always sends agent_type; the fallback is only for foreground ones
const actorOf = (e) => { const fg = running.filter((r) => !r.async); return norm(e.agent_type) || (fg.length ? fg[fg.length - 1].agent : 'manager'); };

// ---------- the board's numbers ----------
let usageTimer = null;
export function refreshUsage(delay = 0) {
  clearTimeout(usageTimer);
  usageTimer = setTimeout(() => {
    fetch(`${SERVER}/usage`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j) S().setUsage(j); })
      .catch(() => {});
  }, delay);
}

// ---------- an order typed in the office ----------
const csrfCookie = () => { const m = document.cookie.match(/(?:^|;\s*)atlas_csrf=([^;]+)/); return m ? m[1] : ''; };
async function csrfToken() {
  if (csrfCookie()) return csrfCookie();
  await fetch('/api/auth/csrf', { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
  return csrfCookie();
}

/** Send what was typed to Atlas (its own "Office" chat). `to` is a helper's id, or 'manager' for Atlas itself. */
export async function sendOrder(to, text) {
  const s = S();
  const helper = to && to !== 'manager' ? s.agents[to] : null;
  const message = helper ? `Hand this to the ${helper.name} (your "${to}" helper) and tell me what they found: ${text}` : text;
  const order = { busy: true, to: helper ? to : 'manager', text, reply: '', error: '' };
  s.setOrder(order);
  const put = (p) => { Object.assign(order, p); S().setOrder({ ...order }); };
  try {
    const csrf = await csrfToken();
    const res = await fetch('/api/chat/send', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      body: JSON.stringify({ channelKey: 'web:office', message, clientMsgId: `office-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }),
    });
    if (res.status === 401) { location.href = '/'; return; }
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      put({ busy: false, error: j.error || tr('Atlas did not take the order ({n}).', { n: res.status }) });
      return;
    }
    if (!(res.headers.get('content-type') || '').includes('text/event-stream')) {
      const j = await res.json().catch(() => ({}));
      put({ busy: false, reply: j.response || '' });
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = (block.match(/^event: (.*)$/m) || [])[1];
        const data = (block.match(/^data: (.*)$/m) || [])[1];
        if (!ev || !data) continue;
        let d; try { d = JSON.parse(data); } catch { continue; }
        if (ev === 'text' && d.content) put({ reply: order.reply + d.content });
        else if (ev === 'error') put({ error: d.message || tr('Something went wrong.') });
      }
    }
    put({ busy: false });
  } catch (err) {
    put({ busy: false, error: order.reply ? '' : tr('Could not reach Atlas. Check your connection.') });
  }
  refreshUsage(2500);
}

function startSub(agent, task) {
  const s = S();
  s.ensureAgent(agent);
  const a = S().agents[agent];
  if (a.state === 'working' || (a.state === 'walking' && a.after?.state === 'working')) return;
  S().patch(agent, { task });
  S().goToDesk(agent, { state: 'working' });
  S().log(agent, tr('Took a task: {task}', { task }));
}

function finishSub(agent) {
  const s = S();
  if (!s.agents[agent]) return;
  s.log(agent, tr('✓ Task done'));
  s.say(agent, tr('Done!'), 2500, 'ok');
  s.patch(agent, { task: '' });
  setTimeout(() => S().goToLounge(agent), 1200);
  refreshUsage(2500);
}

export function handleEvent(e) {
  const s = S();
  const hook = e.hook ?? e.hook_event_name;
  const tool = e.tool ?? e.tool_name;
  const input = e.input ?? e.tool_input ?? {};

  switch (hook) {
    case 'Team': {
      if (Array.isArray(e.team)) s.setTeam(e.team);
      break;
    }
    case 'Settings': {
      if (e.severity) s.setServerSeverity(e.severity);
      break;
    }
    case 'Snapshot': {
      if (e.severity) s.setServerSeverity(e.severity);
      if (e.project) useOffice.setState({ project: e.project });
      if (Array.isArray(e.team)) s.setTeam(e.team, { replace: true });
      for (const sv of e.services || []) s.setService(sv);
      for (const l of (e.logs || []).slice(-15)) S().ensureAgent(l.agent) && S().log(l.agent, l.text, l.level, l.source);
      break;
    }
    case 'Service': s.setService(e); break;
    case 'Log': {
      const id = norm(e.agent) || 'devops';
      s.ensureAgent(id);
      // yangi server `severity` yuboradi; eskisi faqat `level`
      const sev = isLevel(e.severity) ? e.severity : fromLegacy(e.level);
      if (sev === 'info') S().log(id, e.text, 'info', e.source, { key: e.key, count: e.count });
      else S().alert(id, sev, short(e.text, 110), e.source, { key: e.key, count: e.count });
      break;
    }
    case 'SessionStart': {
      running = [];
      s.goToDesk('manager', { state: 'idle' });
      s.say('manager', tr('Session started'));
      s.log('manager', tr('Session started'));
      break;
    }
    case 'SessionEnd': {
      s.setState('manager', 'idle');
      s.say('manager', tr('Session closed 👋'));
      s.log('manager', tr('Session closed'));
      break;
    }
    case 'UserPromptSubmit': {
      // a background sub-agent reporting back arrives as a prompt; it is not a new request
      if (/^\s*<(task-notification|agent-message)\b/.test(e.prompt || '')) break;
      const p = short(e.prompt, 80) || tr('New request');
      s.goToDesk('manager', { state: 'thinking' });
      s.patch('manager', { task: p });
      s.say('manager', p, 5000);
      s.log('manager', tr('Request: {p}', { p }));
      break;
    }
    case 'SubagentStart': {
      if (e.agent_type) startSub(norm(e.agent_type), S().agents[norm(e.agent_type)]?.task || tr('Task'));
      break;
    }
    case 'PreToolUse': {
      if (SPAWN_TOOLS.has(tool)) {
        const agent = norm(input.subagent_type) || 'general-purpose';
        running.push({ id: e.tool_use_id, agent });
        const task = short(input.description || input.prompt, 50) || tr('Task');
        s.say(norm(e.agent_type) || 'manager', `${personName(agent)}, ${task}`, 4000);
        s.log(norm(e.agent_type) || 'manager', tr('→ handed to {agent}: {task}', { agent: personName(agent), task }));
        startSub(agent, task);
        break;
      }
      const who = actorOf(e);
      s.ensureAgent(who);
      const what = describe(tool, input);
      const a = S().agents[who];
      if (a.state === 'idle' && !a.down) S().goToDesk(who, { state: 'working' });
      else S().setState(who, 'working');
      if (!S().isPanicking(who)) S().say(who, what, 2500);
      S().log(who, what);
      break;
    }
    case 'PostToolUse': {
      if (SPAWN_TOOLS.has(tool)) {
        const idx = running.findIndex((r) => r.id && r.id === e.tool_use_id);
        if (e.async) {
          // launched in the background: it keeps working and ends with SubagentStop
          if (idx >= 0) running[idx].async = true;
          break;
        }
        const r = idx >= 0 ? running.splice(idx, 1)[0] : running.pop();
        if (r) finishSub(r.agent);
        s.setState(norm(e.agent_type) || 'manager', 'thinking');
      } else if (e.stderr) {
        const who = actorOf(e);
        const sev = isLevel(e.stderr_severity) ? e.stderr_severity : fromLegacy(e.stderr_level ?? 'warn');
        if (sev === 'info') s.log(who, `stderr: ${short(e.stderr, 120)}`, 'info', 'stderr');
        else s.alert(who, sev, short(e.stderr, 90), 'stderr');
      }
      break;
    }
    case 'PostToolUseFailure': {
      if (e.is_interrupt) break;
      const who = actorOf(e);
      const sev = isLevel(e.severity) ? e.severity : (tool === 'Bash' ? 'major' : 'moderate');
      s.alert(who, sev, tr('{tool} failed: {err}', { tool, err: short(firstLine(e.error), 80) }), tool);
      if (SPAWN_TOOLS.has(tool)) {
        const idx = running.findIndex((r) => r.id && r.id === e.tool_use_id);
        const r = idx >= 0 ? running.splice(idx, 1)[0] : null;
        if (r) S().alert(r.agent, 'major', tr('Sub-agent ended with an error'), tool);
      }
      break;
    }
    case 'SubagentStop': {
      const who = norm(e.agent_type) || running[running.length - 1]?.agent;
      // a background sub-agent finishes here (a foreground one finishes at its PostToolUse)
      const idx = running.findIndex((r) => r.async && r.agent === who);
      if (idx >= 0) { running.splice(idx, 1); finishSub(who); }
      else if (who) s.log(who, tr('Sub-agent stopped'));
      break;
    }
    case 'Stop': {
      s.setState('manager', 'idle');
      s.patch('manager', { task: '' });
      s.say('manager', tr('Answer ready ✓'), 3000, 'ok');
      refreshUsage(2500);
      s.log('manager', tr('Answer ready'));
      break;
    }
    case 'StopFailure': {
      s.alert('manager', isLevel(e.severity) ? e.severity : 'major', tr('Answer failed: {err}', { err: short(firstLine(e.error), 70) || tr('API error') }), 'Claude');
      break;
    }
    default: break;
  }
}

let es = null;
let usagePoll = null;
let snackTimer = null;
export async function startLive() {
  stopLive();
  refreshUsage();
  usagePoll = setInterval(() => refreshUsage(), 60_000);
  // now and then, someone with nothing to do pops out to the store
  snackTimer = setInterval(() => {
    if (document.hidden || Math.random() > 0.6) return;
    const idle = Object.values(S().agents).filter((a) => a.id !== 'manager' && a.state === 'idle' && !a.away && !a.down);
    if (idle.length) S().storeRun(idle[Math.floor(Math.random() * idle.length)].id);
  }, 40_000);
  S().setConn('connecting');
  const base = await resolveServer();
  if (S().mode !== 'live') return;
  es = new EventSource(`${base}/events`);
  es.onopen = () => S().setConn('on');
  es.onerror = () => {
    S().setConn('error');
    // signed out: go back to Atlas, which shows the login screen
    fetch(`${base}/team`).then((r) => { if (r.status === 401) location.href = '/'; }).catch(() => {});
  };
  es.onmessage = (m) => { try { handleEvent(JSON.parse(m.data)); } catch (err) { console.warn(err); } };
}
export function stopLive() {
  if (es) { es.close(); es = null; }
  clearInterval(usagePoll); clearInterval(snackTimer);
  running = [];
  S().setConn('off');
}

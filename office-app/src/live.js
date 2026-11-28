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

// ---------- the other boards: channels, inbox, errors, memory ----------
let statusTimer = null;
export function refreshStatus(delay = 0) {
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    fetch(`${SERVER}/status`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j) S().setStatus(j); })
      .catch(() => {});
  }, delay);
}

// ---------- the owner's room plan and the world it shows ----------
let worldTimer = null;
export function refreshWorld(delay = 0) {
  clearTimeout(worldTimer);
  worldTimer = setTimeout(() => {
    fetch(`${SERVER}/world`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j) S().setWorld(j); })
      .catch(() => {});
  }, delay);
}

/** Save the plan typed in the panel. Answers { plan, problems } or { error }. */
export async function savePlan(text) {
  let plan;
  try { plan = JSON.parse(text); } catch (err) { return { error: tr('That is not valid JSON: {err}', { err: err.message }) }; }
  try {
    const csrf = await csrfToken();
    const res = await fetch(`${SERVER}/plan`, {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      body: JSON.stringify({ plan }),
    });
    const j = await res.json().catch(() => ({}));
    return res.ok ? j : { error: j.error || tr('Could not save ({n}).', { n: res.status }) };
  } catch {
    return { error: tr('Could not reach Atlas. Check your connection.') };
  }
}

// where a turn came from: someone writing in (a visitor walks in), or Atlas's own schedule
const PEOPLE = new Set(['web', 'telegram', 'whatsapp', 'discord', 'slack', 'email', 'api', 'acp']);
const OWN = { cron: '📅 ', heartbeat: '💓 ', boot: '🔆 ' };

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
  S().setSpotlight(agent);
  if (a.state === 'working' || (a.state === 'walking' && a.after?.state === 'working')) return;
  S().patch(agent, { task });
  // a short meeting at the conference table first, then to the desk
  if (S().isPanicking(agent) || a.down) S().goToDesk(agent, { state: 'working' });
  else S().handover(agent);
  S().log(agent, tr('Took a task: {task}', { task }));
}

function finishSub(agent) {
  const s = S();
  if (!s.agents[agent]) return;
  s.log(agent, tr('✓ Task done'));
  s.say(agent, tr('Done!'), 2500, 'ok');
  s.patch(agent, { task: '' });
  // back at the desk, sitting, until the next job
  setTimeout(() => { const b = S().agents[agent]; if (b && !b.task && b.state !== 'resting') S().goToDesk(agent, { state: 'idle' }); }, 1200);
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
      const p = (OWN[e.source] || '') + (short(e.prompt, 80) || tr('New request'));
      if (PEOPLE.has(e.source)) s.visitorArrive(e.session_id, e.source);
      s.goToDesk('manager', { state: 'thinking' });
      s.patch('manager', { task: p });
      s.setSpotlight('manager');
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
      s.setSpotlight(who);
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
        if (r) {
          S().patch(r.agent, { task: '' });
          S().setState(r.agent, 'idle');
          S().alert(r.agent, 'major', tr('Sub-agent ended with an error'), tool);
        }
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
      s.visitorLeave(e.session_id, true);
      refreshUsage(2500);
      refreshStatus(1500);
      s.log('manager', tr('Answer ready'));
      break;
    }
    case 'StopFailure': {
      s.patch('manager', { task: '' });
      s.setState('manager', 'idle');
      s.visitorLeave(e.session_id, false);
      s.setSpotlight('manager');
      s.alert('manager', isLevel(e.severity) ? e.severity : 'major', tr('Answer failed: {err}', { err: short(firstLine(e.error), 70) || tr('API error') }), 'Claude');
      refreshStatus(1500);
      break;
    }
    default: break;
  }
}

// ---------- the room computers ----------
async function getJson(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (res.status === 401) { location.href = '/'; return null; }
  const j = await res.json().catch(() => ({}));
  return res.ok ? j : { error: j.error || tr('Atlas answered {n}.', { n: res.status }) };
}
async function sendJson(method, url, body) {
  const csrf = await csrfToken();
  const res = await fetch(url, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  return res.ok ? j : { error: j.error || tr('Atlas answered {n}.', { n: res.status }) };
}
/** A room's chat: { key, linked, messages: [{ role, text }] } or { error }. */
export function loadRoomChat(kind) {
  return getJson(`${SERVER}/rooms/${encodeURIComponent(kind)}/chat`).then((j) => j || { error: 'signed out' });
}
export function loadDiscordChannels() {
  return getJson(`${SERVER}/discord-channels`).then((j) => j || { error: 'signed out' });
}
export async function linkRoom(kind, discord) {
  const r = await sendJson('PUT', `${SERVER}/rooms/${encodeURIComponent(kind)}/link`, { discord });
  if (!r.error) refreshWorld();
  return r;
}

/**
 * Send what was typed at a room's computer. The first message of a room's own chat tells Atlas which department it
 * is answering for; every message says where it was typed. A room linked to Discord gets the exchange posted there.
 */
export async function sendRoomMessage(kind, chat, room, text, onText) {
  const name = room?.name || kind;
  let message;
  if (chat.linked) message = `[From Alex at the office computer in ${name}] ${text}`;
  else if (!chat.messages.length) {
    const lines = [`[Office computer: ${name}. You are answering as this room's department assistant.`];
    if (room?.subtitle) lines.push(`About it: ${room.subtitle}.`);
    if (room?.notes?.length) lines.push(`Notes: ${room.notes.join('; ')}.`);
    if (kind === 'separate') lines.push('This department is kept separate from the others: do not bring in anything about the other departments or businesses.');
    message = `${lines.join(' ')}]\n\n${text}`;
  } else message = `[Office computer: ${name}] ${text}`;
  let reply = '';
  try {
    const csrf = await csrfToken();
    const res = await fetch('/api/chat/send', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      body: JSON.stringify({ channelKey: chat.key, message, clientMsgId: `office-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }),
    });
    if (res.status === 401) { location.href = '/'; return { error: 'signed out' }; }
    if (!res.ok) { const j = await res.json().catch(() => ({})); return { error: j.error || tr('Atlas did not take it ({n}).', { n: res.status }) }; }
    if (!(res.headers.get('content-type') || '').includes('text/event-stream')) {
      const j = await res.json().catch(() => ({}));
      reply = j.response || '';
      onText(reply);
    } else {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let err = '';
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
          if (ev === 'text' && d.content) { reply += d.content; onText(reply); }
          else if (ev === 'error') err = d.message || tr('Something went wrong.');
        }
      }
      if (err && !reply) return { error: err };
    }
  } catch {
    return { error: tr('Could not reach Atlas. Check your connection.') };
  }
  if (chat.linked && reply) {
    const r = await sendJson('POST', `${SERVER}/rooms/${encodeURIComponent(kind)}/mirror`, { text, reply });
    if (r.error) return { error: tr('Answered here, but not posted to Discord: {e}', { e: r.error }) };
  }
  return { ok: true };
}

// friends at the mart's snack tables talk to each other
const TABLE_LINES = ['This siopao is so good 😋', 'Atlas has us busy today!', 'Any jobs for you yet?', "Let's race at the arcade 🎮", "Coffee's on me ☕", 'Did you see the city at night?', 'Five more minutes, then back to work', 'Who finished the most tasks today?'];
function martChatter() {
  const L = S().layout;
  if (!L.mart || document.hidden) return;
  const bySpot = Object.fromEntries(L.mart.spots.map((s) => [s.id, s]));
  const here = Object.values(S().agents).filter((a) => a.martSpot && a.away && a.state === 'idle');
  const tables = {};
  for (const a of here) { const t = bySpot[a.martSpot]?.table; if (t != null) (tables[t] ??= []).push(a); }
  for (const group of Object.values(tables)) {
    if (group.length < 2) continue;
    const speaker = group[Math.floor(Math.random() * group.length)];
    S().say(speaker.id, tr(TABLE_LINES[Math.floor(Math.random() * TABLE_LINES.length)]), 4000);
  }
  // someone at the arcade: a cheer now and then
  const gamer = here.find((a) => a.martSpot === 'arcade');
  if (gamer && Math.random() < 0.4) S().say(gamer.id, tr(['🎮 New high score!', '🕹️ One more round', '😤 So close!'][Math.floor(Math.random() * 3)]), 3000);
}

let es = null;
let usagePoll = null;
let statusPoll = null;
let worldPoll = null;
let snackTimer = null;
export async function startLive() {
  stopLive();
  refreshUsage();
  usagePoll = setInterval(() => refreshUsage(), 60_000);
  refreshStatus();
  statusPoll = setInterval(() => { if (!document.hidden) refreshStatus(); }, 20_000);
  refreshWorld();
  worldPoll = setInterval(() => { if (!document.hidden) refreshWorld(); }, 60_000);
  // now and then, someone with nothing to do pops out to the store
  snackTimer = setInterval(() => {
    if (document.hidden) return;
    martChatter();
    if (Math.random() > 0.35) return;
    const atMart = Object.values(S().agents).filter((a) => a.martSpot).length;
    if (atMart >= 4) return;
    const idle = Object.values(S().agents).filter((a) => a.id !== 'manager' && a.state === 'idle' && !a.away && !a.down);
    if (idle.length) S().storeRun(idle[Math.floor(Math.random() * idle.length)].id);
  }, 12_000);
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
  clearInterval(usagePoll); clearInterval(statusPoll); clearInterval(worldPoll); clearInterval(snackTimer);
  running = [];
  S().setConn('off');
}

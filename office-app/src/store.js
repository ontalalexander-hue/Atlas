import { create } from 'zustand';
import { personName } from './crew.js';
import { tr, LOCALE } from './i18n.js';
import { buildLayout, kindOf, KIND_COLOR, prettyName } from './layout.js';
import { findPath } from './pathfinding.js';
import { computeSky } from './sun.js';
import { alarmSound } from './sound.js';
import { rank, maxSev, bump, normalize, serviceSeverity, mergeSettings, loadLocalSettings, saveLocalSettings, atLeast, LEVELS } from './severity.js';

// Har kadrda o'zgaradigan pozitsiyalar store'da emas, shu yerda turadi (to'r koordinatalarida).
export const positions = {};

export const DEFAULT_TEAM = [
  { id: 'coder', name: 'Coder', kind: 'backend' },
  { id: 'researcher', name: 'Researcher', kind: 'data' },
  { id: 'writer', name: 'Writer', kind: 'docs' },
  { id: 'quick', name: 'Quick', kind: 'generic' },
  { id: 'finance', name: 'Finance', kind: 'generic' },
];
const EXTRA = ['#14b8a6', '#f59e0b', '#8b5cf6', '#ef4444', '#22c55e', '#06b6d4'];
export const BAD = new Set(['down', 'unhealthy', 'restarting']);
const QUIET_MS = 120_000; // xato 2 daqiqa takrorlanmasa — daraja pasaya boshlaydi
const DECAY_STEP_MS = 20_000; // keyin har 20 soniyada bir pog'ona
const PANIC_MS = 7000;

export const normTeam = (team) => team.map((r, i) => {
  const kind = r.kind || kindOf(r.id);
  return { ...r, kind, name: r.name || prettyName(r.id), color: r.color || KIND_COLOR[kind] || EXTRA[i % EXTRA.length] };
});

function makeAgent(def, L, index, inLounge) {
  const deskId = def.id === 'manager' ? 'manager' : (L.desks[def.id] ? def.id : null);
  const spots = L.lounge.spots;
  const seat = L.desks[deskId]?.seat;
  const start = def.spawn ?? seat ?? spots[index % spots.length];
  positions[def.id] = { x: start[0], z: start[1], rot: Math.PI };
  return {
    id: def.id, name: personName(def.id), title: def.name, role: def.role ?? def.kind, color: def.color, kind: def.kind,
    deskId, index,
    state: inLounge ? 'idle' : 'working',
    seated: inLounge && !def.spawn && !!seat, bed: null,
    task: inLounge ? '' : tr('Starting work'),
    bubble: '', bubbleUntil: 0, bubbleKind: '',
    path: [], pathId: 0, after: null,
    log: [], alarm: null, down: null, errors: 0, resume: null, calmState: 'idle', sev: 'info',
  };
}

function agentsFor(team, L, inLounge) {
  const defs = [{ id: 'manager', name: 'Atlas', kind: 'manager', color: '#1f7ae0', role: tr('Main assistant') }, ...team];
  return Object.fromEntries(defs.map((d, i) => [d.id, makeAgent(d, L, i, inLounge)]));
}

const stamp = () => new Date().toLocaleTimeString(LOCALE, { hour12: false });
const calmTimers = {};
const sickTimers = {};
// visitors: one per conversation waiting on Atlas, keyed by a short id of our own
const visitorIds = new Map();
let visitorSeq = 0;
export const CHANNELS = {
  web: { label: 'Web chat', icon: '💬', color: '#1f7ae0' },
  telegram: { label: 'Telegram', icon: '✈️', color: '#2aabee' },
  whatsapp: { label: 'WhatsApp', icon: '📱', color: '#25d366' },
  discord: { label: 'Discord', icon: '🎮', color: '#5865f2' },
  slack: { label: 'Slack', icon: '#', color: '#e01e5a' },
  email: { label: 'Email', icon: '✉️', color: '#ea4335' },
  api: { label: 'API', icon: '🔌', color: '#7c4dff' },
  acp: { label: 'Editor', icon: '🔗', color: '#14b8a6' },
};
const initialTeam = normTeam(DEFAULT_TEAM);
const initialLayout = buildLayout(initialTeam);

export const useOffice = create((set, get) => ({
  mode: 'live',
  conn: 'off',
  selected: null,
  team: initialTeam,
  layout: initialLayout,
  agents: agentsFor(initialTeam, initialLayout, true),
  feed: [],
  services: {},
  project: '',
  muted: false,
  themeMode: 'auto',
  timeOffsetH: 0,
  sky: computeSky(30, 20),
  sunInfo: null,
  replayInfo: null,
  // xatolik darajalari
  serverSeverity: {},
  settings: mergeSettings({}, loadLocalSettings()),
  issues: {}, // key -> { key, agent, severity, text, source, count, lastAt, kind }
  setServerSeverity: (serverSeverity) => set({ serverSeverity, settings: mergeSettings(serverSeverity, loadLocalSettings()) }),
  setSetting: (k, v) => {
    const local = { ...loadLocalSettings(), [k]: v };
    saveLocalSettings(local);
    set({ settings: mergeSettings(get().serverSeverity, local) });
    for (const id of Object.keys(get().agents)) { get().recomputeSev(id); get().recomputeDown(id); }
  },
  resetSettings: () => { saveLocalSettings({}); set({ settings: mergeSettings(get().serverSeverity, {}) }); },
  // boshliq rejimi
  boss: false,
  bossName: (() => { try { return localStorage.getItem('agent-office-boss') || tr('Boss'); } catch { return tr('Boss'); } })(),
  cinema: (() => { try { return new URLSearchParams(location.search).get('cinema') === '1'; } catch { return false; } })(),
  cinemaShot: null, // { kind: 'overview' } | { kind: 'follow', id, dist?, height? } — pins one shot
  setCinema: (cinema) => set({ cinema, cinemaShot: null }),
  setCinemaShot: (cinemaShot) => set({ cinemaShot }),
  // the board: { limits: { fiveHour, sevenDay }, used: { today, fiveHour, sevenDay }, done: { [agentId]: n } }
  usage: null,
  setUsage: (usage) => set({ usage }),
  // an order typed in the office: { busy, to, text, reply, error }
  order: null,
  setOrder: (order) => set({ order }),
  // the roof: 'auto' lifts it while there is something to watch inside, 'on' keeps it, 'off' removes it
  roofMode: (() => { try { return localStorage.getItem('atlas-office-roof') || 'auto'; } catch { return 'auto'; } })(),
  setRoofMode: (roofMode) => { try { localStorage.setItem('atlas-office-roof', roofMode); } catch {} set({ roofMode }); },
  roofClosed: false, // is the roof down right now (name tags and room labels under it are hidden)
  setRoofClosed: (roofClosed) => { if (get().roofClosed !== roofClosed) set({ roofClosed }); },
  view: null, // { name: 'auto'|'overview'|'street'|'deck', n } — a camera position asked for from the panel; none is 'auto'
  // the last one to do something, for the camera in Auto view: { id, at }
  spotlight: null,
  setSpotlight: (id) => { if (id && get().agents[id]) set({ spotlight: { id, at: Date.now() } }); },
  // the other boards: GET /api/office/status
  status: null,
  setStatus: (status) => set({ status }),
  // GET /api/office/world: { plan, padayon, lifeos, railway }, each source { status, data?, error? }
  world: null,
  plan: null,
  setWorld: (world) => {
    const same = JSON.stringify(world?.plan ?? null) === JSON.stringify(get().plan);
    if (same) { set({ world }); return; }
    // a new plan moves rooms and desks: lay the floor out again and seat everyone afresh
    const plan = world?.plan ?? null;
    const L = buildLayout(get().team, plan);
    for (const k of Object.keys(positions)) if (k.startsWith('v:')) delete positions[k];
    set({ world, plan, layout: L, agents: agentsFor(get().team, L, get().mode === 'live'), visitors: {}, selected: null });
  },
  visitors: {},
  setView: (name) => set({ view: { name, n: Date.now() } }),
  sheet: false, // phone: is the panel pulled up
  setSheet: (sheet) => set({ sheet }),
  nearScreen: null, // { kind: 'desk'|'services'|'feed', id, label }
  screenOpen: false,

  setMode: (mode) => {
    const L = get().layout;
    set({ mode, agents: agentsFor(get().team, L, mode === 'live'), feed: [], services: {}, issues: {}, selected: null });
  },
  setConn: (conn) => set({ conn }),
  setThemeMode: (themeMode) => set({ themeMode, timeOffsetH: 0 }),
  setTimeOffset: (timeOffsetH) => set({ timeOffsetH }),
  toggleMute: () => set({ muted: !get().muted }),
  select: (id) => set({ selected: get().selected === id ? null : id }),
  setBoss: (boss) => set({ boss, bossOutside: false, screenOpen: false, nearScreen: null, selected: null }),
  bossOutside: false,   // boss mode, standing out in the city rather than in the office building
  setBossName: (bossName) => { try { localStorage.setItem('agent-office-boss', bossName); } catch {} set({ bossName }); },
  setNearScreen: (nearScreen) => set({ nearScreen, ...(nearScreen ? {} : { screenOpen: false }) }),
  setScreenOpen: (screenOpen) => set({ screenOpen }),

  // Jamoa o'zgardi (server, sozlama yoki yangi agent paydo bo'ldi): faqat qo'shamiz
  setTeam: (incoming, { spawnAtEntrance = true, replace = false } = {}) => {
    if (replace) {
      // birinchi yuklash: jamoa aynan loyihadagidek bo'ladi (standart rollar olib tashlanadi)
      const team = normTeam(incoming.filter((r) => r.id !== 'manager'));
      const same = team.map((r) => r.id).join() === get().team.map((r) => r.id).join();
      if (same) { set({ team: get().team.map((c) => ({ ...c, ...team.find((t) => t.id === c.id) })) }); return; }
      const L = buildLayout(team, get().plan);
      set({ team, layout: L, agents: agentsFor(team, L, get().mode === 'live'), services: {}, issues: {}, selected: null });
      return;
    }
    const cur = get().team;
    const add = normTeam(incoming.filter((r) => r.id !== 'manager' && !cur.some((c) => c.id === r.id)));
    const updated = cur.map((c) => { const n = incoming.find((r) => r.id === c.id); return n ? { ...c, ...normTeam([n])[0] } : c; });
    if (!add.length && JSON.stringify(updated) === JSON.stringify(cur)) return;
    const team = [...updated, ...add];
    const L = buildLayout(team, get().plan);
    const agents = { ...get().agents };
    let n = Object.keys(agents).length;
    for (const r of add) {
      agents[r.id] = makeAgent({ ...r, spawn: spawnAtEntrance ? L.outside.door : undefined }, L, n++, true);
    }
    // nomi/rangi yangilanganlar
    for (const r of updated) if (agents[r.id]) agents[r.id] = { ...agents[r.id], name: r.name, color: r.color, kind: r.kind, deskId: L.desks[r.id] ? r.id : agents[r.id].deskId };
    set({ team, layout: L, agents });
    // yangi xodimlar eshikdan kirib, o'z xonasiga boradi
    for (const r of add) {
      get().say(r.id, tr("Hi! I'm {name} 👋", { name: personName(r.id) }), 3500, 'ok');
      get().log(r.id, tr('Joined the team: {name}', { name: r.name }));
      setTimeout(() => get().goToDesk(r.id, { state: 'idle' }), 600);
    }
  },

  // Noma'lum agent paydo bo'lsa — jamoaga qo'shamiz (bino kengayadi)
  ensureAgent: (id) => {
    if (!id) return null;
    if (!get().agents[id]) get().setTeam([...get().team, { id }]);
    return get().agents[id];
  },

  patch: (id, p) => set((s) => (s.agents[id] ? { agents: { ...s.agents, [id]: { ...s.agents[id], ...p } } } : s)),
  isPanicking: (id) => { const a = get().agents[id]; return !!a?.alarm && a.alarm.until > Date.now(); },

  goTo: (id, cell, after = { state: 'idle' }, force = false) => {
    const a = get().agents[id];
    const pos = positions[id];
    if (!a || !pos) return;
    if (!force && a.down) return;
    if (!force && get().isPanicking(id)) { get().patch(id, { resume: { cell, after } }); return; }
    // Outside (on a snack run): back along the walk and in through the front door first.
    const L = get().layout;
    const out = pos.x < 0.5 || pos.z > L.H - 1.5;
    let path = findPath(L, out ? L.outside.door : [pos.x, pos.z], cell);
    if (out) {
      // back along the walk from the nearest point on it
      const walk = L.outside.walk;
      const far = (w) => Math.hypot(w[0] - pos.x, w[1] - pos.z);
      let near = 0;
      walk.forEach((w, i) => { if (far(w) < far(walk[near])) near = i; });
      path = [...walk.slice(0, near + 1).reverse(), L.outside.door, ...path];
    }
    get().patch(id, { path, pathId: a.pathId + 1, state: 'walking', after, away: false, seated: false, bed: null });
  },
  goToDesk: (id, after = { state: 'working' }) => {
    const a = get().agents[id];
    const d = a && get().layout.desks[a.deskId];
    if (d) get().goTo(id, d.seat, { face: 'desk', ...(after.state === 'idle' ? { sit: true } : {}), ...after });
  },
  goToLounge: (id, after = { state: 'idle' }) => {
    const a = get().agents[id];
    if (!a) return;
    const spots = get().layout.lounge.spots;
    get().goTo(id, spots[a.index % spots.length], after);
  },
  // A helper with nothing to do walks out to the store, stands there a while, and comes back.
  storeRun: (id) => {
    const a = get().agents[id];
    const pos = positions[id];
    const L = get().layout;
    if (!a || !pos || id === 'manager' || a.state !== 'idle' || a.away || a.down || get().isPanicking(id)) return;
    const path = [...findPath(L, [pos.x, pos.z], L.outside.door), ...L.outside.walk, L.outside.storeSpot];
    get().patch(id, { path, pathId: a.pathId + 1, state: 'walking', after: { state: 'idle' }, away: true });
    get().say(id, tr('Snack run 🥤'), 3000);
    setTimeout(() => {
      const b = get().agents[id];
      if (b?.away && b.state === 'idle') { get().say(id, tr('Back to the floor'), 2500); get().goToDesk(id, { state: 'idle' }); }
    }, 24_000);
  },
  arrived: (id) => {
    const a = get().agents[id];
    if (!a) return;
    const after = a.after || {};
    get().patch(id, { path: [], state: after.state ?? 'idle', after: null, seated: !!after.sit });
    // a walk with a next step (a handover in the conference room): it runs after a pause, unless they were sent elsewhere
    if (after.next) {
      setTimeout(() => {
        const b = get().agents[id];
        if (b && b.pathId === a.pathId && b.state !== 'walking' && !b.down && !get().isPanicking(id)) after.next();
      }, after.hold ?? 2500);
    }
  },

  // Atlas hands a job over: both meet at the conference table, then the helper goes to its desk.
  handover: (agent) => {
    const L = get().layout;
    const seats = L.meeting?.seats;
    if (!seats?.length) { get().goToDesk(agent, { state: 'working' }); return; }
    const half = seats.length / 2;
    const i = (get().agents[agent]?.index ?? 0) % half;
    const busyState = (who) => (get().agents[who]?.task ? (who === 'manager' ? 'thinking' : 'working') : 'idle');
    if (get().agents.manager && !get().isPanicking('manager')) {
      get().goTo('manager', seats[i], { state: 'talking', rot: 0, hold: 2600, next: () => get().goToDesk('manager', { state: busyState('manager') }) });
    }
    get().goTo(agent, seats[half + i], { state: 'talking', rot: Math.PI, hold: 2800, next: () => get().goToDesk(agent, { state: busyState(agent) }) });
  },

  // After an error: a spell on a bed in the medical wing (the trauma room for a critical one), then back to the desk.
  sickBay: (id, severity = 'major') => {
    const L = get().layout;
    const a = get().agents[id];
    const pos = positions[id];
    if (!a || !pos || !L.clinic || a.down) return;
    const beds = severity === 'critical' ? L.clinic.trauma : L.clinic.treatment;
    const taken = new Set(Object.values(get().agents).filter((x) => x.id !== id && x.bed).map((x) => x.bed.join()));
    const bed = beds.find((b) => !taken.has(b.cell.join())) ?? beds[0];
    const path = [...findPath(L, [pos.x, pos.z], bed.cell), bed.lie];
    get().patch(id, { path, pathId: a.pathId + 1, state: 'walking', after: { state: 'resting', rot: bed.rot }, bed: bed.cell, seated: false, away: false });
    get().say(id, severity === 'critical' ? tr('🚑 To the trauma room') : tr('🩹 Getting patched up'), 3500, `sev-${severity}`);
    clearTimeout(sickTimers[id]);
    sickTimers[id] = setTimeout(() => {
      const b = get().agents[id];
      if (b?.state !== 'resting') return;
      get().say(id, tr('✅ Feeling better'), 2500, 'ok');
      get().goToDesk(id, { state: 'idle' });
    }, severity === 'critical' ? 30_000 : 18_000);
  },

  // ---------- visitors ----------
  visitorArrive: (key, source) => {
    const L = get().layout;
    const ch = CHANNELS[source];
    if (!L.frontDesk || !ch || !key) return;
    let vid = visitorIds.get(key);
    const vs = get().visitors;
    if (vid && vs[vid] && !vs[vid].leaving) { get().patchVisitor(vid, { bubble: tr('Another one…'), bubbleUntil: Date.now() + 2500 }); return; }
    if (Object.keys(vs).length >= 7) return;
    vid = `v${++visitorSeq}`;
    visitorIds.set(key, vid);
    const used = new Set(Object.values(vs).filter((v) => !v.leaving).map((v) => v.spot.join()));
    const spot = L.frontDesk.spots.find((s) => !used.has(s.join())) ?? L.frontDesk.spots[0];
    const dx = L.door.x, H = L.H;
    positions[`v:${vid}`] = { x: dx + (visitorSeq % 2 ? -6 : 6), z: H + 2.6, rot: Math.PI };
    const path = [[dx, H + 1.6], [dx, H - 1], ...findPath(L, L.outside.door, spot)];
    set({ visitors: { ...vs, [vid]: { id: vid, key, source, ...ch, seed: visitorSeq, spot, path, pathId: 1, state: 'walking', leaving: false, bubble: '', bubbleUntil: 0 } } });
    setTimeout(() => get().visitorLeave(key, null), 10 * 60_000); // never left waiting for good
  },
  visitorLeave: (key, ok) => {
    const vid = visitorIds.get(key);
    const v = vid && get().visitors[vid];
    if (!v || v.leaving) return;
    visitorIds.delete(key);
    const L = get().layout;
    const pos = positions[`v:${vid}`];
    const dx = L.door.x, H = L.H;
    const path = [...(pos ? findPath(L, [pos.x, pos.z], L.outside.door) : []), [dx, H - 1], [dx, H + 1.6], [dx + (v.seed % 2 ? 6 : -6), H + 2.6]];
    get().patchVisitor(vid, {
      path, pathId: v.pathId + 1, state: 'walking', leaving: true,
      bubble: ok === false ? tr('😕 No answer') : ok ? tr('👍 Thanks!') : '', bubbleUntil: Date.now() + 3000,
    });
  },
  visitorArrived: (vid) => {
    const v = get().visitors[vid];
    if (!v) return;
    if (v.leaving) {
      const { [vid]: _gone, ...rest } = get().visitors;
      delete positions[`v:${vid}`];
      set({ visitors: rest });
    } else get().patchVisitor(vid, { state: 'waiting', bubble: tr('Waiting for Atlas…'), bubbleUntil: Date.now() + 3000 });
  },
  patchVisitor: (vid, p) => set((s) => (s.visitors[vid] ? { visitors: { ...s.visitors, [vid]: { ...s.visitors[vid], ...p } } } : s)),
  setState: (id, state) => {
    const a = get().agents[id];
    if (!a || a.down) return;
    if (get().isPanicking(id)) { get().patch(id, { calmState: state }); return; }
    if (a.state === 'walking') get().patch(id, { after: { ...a.after, state } });
    else get().patch(id, { state });
  },

  say: (id, text, ms = 3500, kind = '') => get().patch(id, { bubble: text, bubbleUntil: Date.now() + ms, bubbleKind: kind }),

  // level: eski nom ('info'|'warn'|'error') yoki daraja ('minor'…'critical'). key berilsa — bir xil qatorlar bitta yozuvga guruhlanadi.
  log: (id, text, level = 'info', source = '', { key = null, count = null } = {}) => {
    const time = stamp();
    const severity = LEVELS.includes(level) ? level : level === 'error' ? 'moderate' : level === 'warn' ? 'minor' : 'info';
    set((s) => {
      const a = s.agents[id];
      if (!a) return s;
      const entry = { time, text, level: severity, severity, source, key, count: count ?? 1 };
      const merge = (list, extra) => {
        if (key) {
          const i = list.findIndex((e) => e.key === key);
          if (i >= 0) {
            const old = list[i];
            const upd = { ...old, ...entry, ...extra, count: count ?? old.count + 1, severity: maxSev(old.severity, severity) };
            upd.level = upd.severity;
            return [upd, ...list.slice(0, i), ...list.slice(i + 1)];
          }
        }
        return [{ ...entry, ...extra }, ...list];
      };
      return {
        agents: { ...s.agents, [id]: { ...a, log: merge(a.log).slice(0, 60) } },
        feed: merge(s.feed, { who: a.name, color: a.color, agent: id }).slice(0, 120),
      };
    });
  },

  // ---------- Nosozliklar ----------
  // alert: har qanday darajadagi muammo. Panika (sakrash, sirena, qizil) faqat sozlamadagi chegaradan boshlab.
  alert: (id, severity, text, source = '', { key = null, count = null, kind = 'log' } = {}) => {
    if (!severity || severity === 'info') { get().log(id, text, 'info', source, { key, count }); return; }
    get().ensureAgent(id);
    const s = get();
    const a = s.agents[id];
    if (!a) return;
    const k = key || `${id}|${source}|${normalize(text)}`;
    const prev = s.issues[k];
    const issue = {
      key: k, agent: id, text, source, kind,
      severity: prev ? maxSev(prev.severity, severity) : severity,
      count: count ?? (prev ? prev.count + 1 : 1),
      lastAt: Date.now(), firstAt: prev?.firstAt ?? Date.now(),
    };
    set({ issues: { ...s.issues, [k]: issue } });
    s.log(id, text, issue.severity, source, { key: k, count: issue.count });
    if (!prev) s.patch(id, { errors: a.errors + 1 }); // takror emas, yangi muammo
    get().recomputeSev(id);

    const st = get().settings;
    const panicNow = atLeast(issue.severity, st.panicAt);
    // takroriy (guruhlangan) qator har safar sakratmaydi — faqat yangi xato yoki daraja ko'tarilganda
    const fresh = !prev || rank(issue.severity) > rank(prev.severity) || Date.now() - prev.lastAt > 30_000;
    if (panicNow && fresh) get().startPanic(id, text, issue.severity);
    else if (fresh && st.colorMode === 'status') get().say(id, `${issue.severity === 'minor' ? '⚠' : '❗'} ${text}`, 3500, `sev-${issue.severity}`);
    if (fresh && !get().muted && atLeast(issue.severity, st.sound)) alarmSound(issue.severity);
  },
  // eski API: panic(id, text) → kamida panika chegarasidagi daraja
  panic: (id, text, source = '') => get().alert(id, maxSev('major', get().settings.panicAt), text, source),

  startPanic: (id, text, severity) => {
    const s = get();
    const a = s.agents[id];
    if (!a) return;
    const was = s.isPanicking(id);
    const calmState = was ? a.calmState : (a.state === 'walking' ? (a.after?.state ?? 'idle') : a.state);
    const resume = was ? a.resume : (a.state === 'walking' && a.path.length ? { cell: a.path[a.path.length - 1], after: a.after } : null);
    const ms = severity === 'critical' ? PANIC_MS + 3000 : PANIC_MS;
    s.patch(id, {
      alarm: { until: Date.now() + ms, text, severity },
      calmState: a.down ? 'down' : calmState,
      resume,
      ...(a.down ? {} : { state: 'panic', path: [] }),
    });
    s.say(id, `${severity === 'critical' ? '🚨' : '🔥'} ${text}`, 5000, `sev-${severity}`);
    clearTimeout(calmTimers[id]);
    calmTimers[id] = setTimeout(() => get().calm(id), ms + 50);
  },

  // agentning joriy darajasi: faol muammolari va xizmatlarining eng yuqorisi
  recomputeSev: (id) => {
    const a = get().agents[id];
    if (!a) return;
    let sev = 'info';
    for (const is of Object.values(get().issues)) if (is.agent === id) sev = maxSev(sev, is.severity);
    for (const sv of Object.values(get().services)) if (sv.agent === id) sev = maxSev(sev, sv.severity ?? 'info');
    if (sev !== a.sev) get().patch(id, { sev });
  },

  // asta pasayish: 2 daqiqa jim bo'lsa har 20 soniyada bir pog'ona
  decayTick: () => {
    const now = Date.now();
    const issues = { ...get().issues };
    const touched = new Set();
    let changed = false;
    for (const [k, is] of Object.entries(issues)) {
      if (is.kind !== 'log') continue;
      const quiet = now - is.lastAt;
      if (quiet < QUIET_MS) continue;
      const steps = Math.floor((quiet - QUIET_MS) / DECAY_STEP_MS) + 1;
      const target = LEVELS[Math.max(0, rank(is.peak ?? is.severity) - steps)];
      if (target === 'info') { delete issues[k]; changed = true; touched.add(is.agent); }
      else if (target !== is.severity) { issues[k] = { ...is, peak: is.peak ?? is.severity, severity: target }; changed = true; touched.add(is.agent); }
    }
    if (changed) { set({ issues }); for (const id of touched) get().recomputeSev(id); }
  },
  clearIssues: (id) => {
    const issues = Object.fromEntries(Object.entries(get().issues).filter(([, is]) => is.agent !== id));
    set({ issues });
    get().patch(id, { errors: 0 });
    get().recomputeSev(id);
  },

  calm: (id) => {
    const a = get().agents[id];
    if (!a || !a.alarm || a.alarm.until > Date.now()) return;
    get().patch(id, { alarm: null });
    if (a.down) return;
    if (a.resume) {
      get().patch(id, { resume: null, state: 'idle' });
      get().goTo(id, a.resume.cell, a.resume.after);
    } else {
      get().patch(id, { state: a.calmState === 'panic' ? 'idle' : a.calmState });
    }
    const calmState = a.calmState === 'panic' ? 'idle' : a.calmState;
    if (!a.resume && calmState === 'idle') get().sickBay(id, a.alarm.severity);
  },
  clearErrors: (id) => get().clearIssues(id),

  setService: (ev) => {
    const id = ev.agent || 'devops';
    get().ensureAgent(id);
    const prev = get().services[ev.id];
    // eski serverlar severity yubormaydi — holatdan hisoblaymiz
    const severity = ev.severity ?? serviceSeverity(ev.state, { restarts: ev.restarts ?? 0, exitCode: ev.exitCode ?? (ev.state === 'down' ? 1 : null) });
    set({ services: { ...get().services, [ev.id]: { ...ev, agent: id, severity, at: Date.now() } } });
    const icon = ev.kind === 'docker' ? '🐳' : ev.kind === 'terminal' ? '⌨' : '📄';
    if (!prev || prev.state !== ev.state || prev.severity !== severity) {
      const text = `${icon} ${ev.name}: ${ev.state}${ev.detail ? ` (${ev.detail})` : ''}`;
      get().log(id, text, severity, ev.name);
      if (rank(severity) > 0 && !get().muted && atLeast(severity, get().settings.sound) && rank(severity) > rank(prev?.severity ?? 'info')) alarmSound(severity);
    }
    get().recomputeSev(id);
    get().recomputeDown(id, ev);
  },
  recomputeDown: (id, trigger) => {
    // dam olish xonasiga faqat panika chegarasidan yuqori darajadagi xizmat nosozligi yuboradi
    const panicAt = get().settings.panicAt;
    const bad = Object.values(get().services)
      .filter((sv) => sv.agent === id && BAD.has(sv.state) && atLeast(sv.severity ?? 'major', panicAt))
      .sort((x, y) => rank(y.severity) - rank(x.severity));
    const a = get().agents[id];
    if (!a) return;
    if (bad.length && !a.down) {
      const sv = bad[0];
      const why = sv.state === 'unhealthy' ? tr('is unhealthy') : sv.state === 'restarting' ? tr('keeps crashing') : tr('went down');
      get().patch(id, { down: { service: sv.name, reason: why, severity: sv.severity }, alarm: null, path: [], resume: null });
      get().say(id, `💥 ${sv.name} ${why}`, 6000, `sev-${sv.severity ?? 'major'}`);
      const seats = get().layout.lounge.couchSeats;
      get().goTo(id, seats[a.index % seats.length], { face: 'desk', state: 'down' }, true);
    } else if (!bad.length && a.down) {
      get().patch(id, { down: null });
      get().say(id, tr('✅ {name} is back', { name: trigger?.name ?? tr('service') }), 4000, 'ok');
      get().goToDesk(id, { state: get().mode === 'sim' ? 'working' : 'idle' });
    } else if (bad.length && a.down && a.down.service !== bad[0].name) {
      get().patch(id, { down: { ...a.down, service: bad[0].name, severity: bad[0].severity } });
    }
  },
}));

// asta pasayish taymeri
setInterval(() => useOffice.getState().decayTick(), 5000);

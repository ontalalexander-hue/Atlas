/**
 * The office's view of the owner's world outside Atlas: the room plan, and the live numbers some rooms show.
 *
 *   plan     which room is which, what each is called and what it shows. Kept in the owner's own settings
 *            (setting `office.plan`, else the ATLAS_OFFICE_PLAN environment variable), never in this code: the code
 *            only knows room *kinds* (ceo, growth, sales, separate, market, church, personal, library, studio, server).
 *   padayon  a business hub that speaks MCP (tools month_summary and list_tasks), read with a read-only key.
 *   lifeos   a personal money app's GET /api/atlas/summary: next payday, bills due, goals. Never balances.
 *   railway  every app on the owner's Railway account and its latest deploy (an account token, the same one the
 *            atlas_railway tool uses).
 *
 * Where the keys live: each is looked up in the vault first, then in the environment, under the same name
 * (PADAYON_READ_TOKEN, LIFE_OS_ATLAS_TOKEN, RAILWAY_API_TOKEN), with the addresses in PADAYON_URL and LIFE_OS_URL.
 * A source that is not set up is reported as such; nothing is ever made up. Each source is fetched at most every
 * five minutes, and an answer that fails keeps the last good one, marked stale.
 */
import { getKey as vaultGet } from "./key-vault.js";
import { redactSecrets } from "./redact.js";
import { parseCron } from "./office-schedule.js";

export const KINDS = Object.freeze(["ceo", "growth", "sales", "separate", "market", "church", "personal", "library", "studio", "server"]);
// The rooms that are departments: each listed in the owner's plan gets an agent of its own (lib/departments.js).
export const DEPT_KINDS = Object.freeze(["growth", "sales", "separate", "market", "church", "personal"]);
export const PLAN_SETTING = "office.plan";
const HELPERS_DEFAULT = Object.freeze({ finance: "market", coder: "server", researcher: "library", writer: "studio", quick: "sales" });
const TTL_MS = 5 * 60_000;
const TIMEOUT_MS = 12_000;
const RAILWAY_API = "https://backboard.railway.com/graphql/v2";

const str = (v, n) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};
const list = (v, max, n = 60) => (Array.isArray(v) ? v.map((x) => str(x, n)).filter(Boolean).slice(0, max) : []);

/** The plan used when the owner has not written one: generic names, nothing personal. */
export function defaultPlan() {
  return {
    rooms: [
      { kind: "ceo", name: "CEO office", subtitle: "Atlas, chief of staff" },
      { kind: "growth", name: "Growth HQ", subtitle: "The main income engine" },
      { kind: "sales", name: "Sales room", subtitle: "Pipeline and outreach" },
      { kind: "separate", name: "Client wing", subtitle: "Kept separate" },
      { kind: "market", name: "Market hall", subtitle: "Small businesses", padayon: ["*"] },
      { kind: "church", name: "Ministry wing" },
      { kind: "personal", name: "Personal suite", subtitle: "Only you", lifeos: true },
      { kind: "library", name: "Learning library" },
      { kind: "studio", name: "Media studio" },
      { kind: "server", name: "Server room", subtitle: "Uptime and errors", railway: ["*"] },
    ],
    days: {},
    helpers: { ...HELPERS_DEFAULT },
  };
}

/**
 * Read a plan someone wrote, keeping only what the office understands. Unknown kinds and fields are dropped;
 * every kind ends up with exactly one room (the default fills any gap).
 * @returns {{ plan: object, problems: string[] }}
 */
export function normalizePlan(input) {
  const problems = [];
  const base = defaultPlan();
  let raw = input;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch (err) { return { plan: base, problems: [`Not valid JSON: ${err.message}`] }; }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { plan: base, problems: raw == null ? [] : ["The plan must be an object with a rooms list."] };
  const byKind = new Map(base.rooms.map((r) => [r.kind, r]));
  for (const r of Array.isArray(raw.rooms) ? raw.rooms : []) {
    if (!r || !KINDS.includes(r.kind)) { problems.push(`Skipped a room of unknown kind ${JSON.stringify(r?.kind)}.`); continue; }
    const room = { kind: r.kind, name: str(r.name, 40) || byKind.get(r.kind).name };
    if (r.subtitle) room.subtitle = str(r.subtitle, 60);
    const notes = list(r.notes, 6, 90);
    if (notes.length) room.notes = notes;
    // other agents' desks: a name, and the app (a Railway project or service) whose state the desk shows
    const agents = (Array.isArray(r.agents) ? r.agents : []).slice(0, 6).map((a) => {
      const name = str(typeof a === "string" ? a : a?.name, 24);
      const app = typeof a === "object" && a?.app ? str(a.app, 60) : null;
      return name ? { name, ...(app ? { app } : {}) } : null;
    }).filter(Boolean);
    if (agents.length) room.agents = agents;
    if (r.paused === true) room.paused = true;
    if (r.hours) room.hours = str(r.hours, 40);
    const padayon = list(r.padayon, 12, 60);
    if (padayon.length) room.padayon = padayon;
    const paused = list(r.pausedBusinesses, 12, 60);
    if (paused.length) room.pausedBusinesses = paused;
    const railway = list(r.railway, 20, 60);
    if (railway.length) room.railway = railway;
    if (r.lifeos === true) room.lifeos = true;
    // a department: its own agent, unless the plan says `"dept": false`; `lead` is that agent's name
    if (DEPT_KINDS.includes(r.kind)) {
      room.dept = r.dept !== false;
      if (room.dept && r.lead) room.lead = str(r.lead, 30);
    }
    // a Discord channel this room's computer shares its conversation with (a channel id: digits only)
    if (r.discord != null && r.discord !== "") {
      if (/^\d{5,25}$/.test(String(r.discord))) room.discord = String(r.discord);
      else problems.push(`Room ${r.kind}: ${JSON.stringify(r.discord)} is not a Discord channel id.`);
    }
    byKind.set(r.kind, room);
  }
  const days = {};
  // each weekday's theme, and the room it belongs to (lit up that day)
  for (const d of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) {
    const v = raw.days?.[d];
    if (!v) continue;
    const label = str(typeof v === "string" ? v : v.label, 40);
    const roomKind = typeof v === "object" && KINDS.includes(v.room) ? v.room : null;
    if (typeof v === "object" && v.room && !roomKind) problems.push(`Day ${d}: room ${JSON.stringify(v.room)} is not one of ${KINDS.join(", ")}.`);
    if (label || roomKind) days[d] = { ...(label ? { label } : {}), ...(roomKind ? { room: roomKind } : {}) };
  }
  const helpers = { ...HELPERS_DEFAULT };
  if (raw.helpers && typeof raw.helpers === "object") {
    for (const [id, kind] of Object.entries(raw.helpers)) {
      if (KINDS.includes(kind) && /^[a-z0-9_-]{1,40}$/i.test(id)) helpers[id] = kind;
      else problems.push(`Skipped helper ${JSON.stringify(id)}: room kind ${JSON.stringify(kind)} is not one of ${KINDS.join(", ")}.`);
    }
  }
  // jobs the owner runs elsewhere (Claude scheduled tasks on their computer): shown on the schedule board, never run
  const schedule = [];
  for (const j of Array.isArray(raw.schedule) ? raw.schedule.slice(0, 40) : []) {
    const name = str(j?.name, 80);
    const cron = str(j?.cron, 80);
    if (!name || !parseCron(cron)) {
      problems.push(`Skipped scheduled job ${JSON.stringify(j?.name ?? null)}: it needs a name and a schedule like "CRON_TZ=Europe/London 15 16 * * *".`);
      continue;
    }
    const room = KINDS.includes(j.room) ? j.room : null;
    if (j.room && !room) problems.push(`Scheduled job ${JSON.stringify(name)}: room ${JSON.stringify(j.room)} is not one of ${KINDS.join(", ")}.`);
    schedule.push({ name, cron, ...(room ? { room } : {}), where: j.where === "atlas" ? "atlas" : "pc", ...(j.paused === true ? { paused: true } : {}) });
  }
  return { plan: { rooms: KINDS.map((k) => byKind.get(k)), days, helpers, schedule }, problems };
}

// ─────────────────────────────────────────────────────────────── sources

function secret(name, { env = process.env, getKey = vaultGet } = {}) {
  let v = null;
  try { v = getKey(name); } catch { /* vault not readable: try the environment */ }
  return (v || env[name] || "").trim() || null;
}
const baseUrl = (v) => {
  const s = String(v || "").trim().replace(/\/+$/, "");
  return /^https:\/\/[^\s/]+/i.test(s) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(s) ? s : null;
};

async function fetchJson(url, init, fetchImpl) {
  const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) {
    const why = body?.error?.message || body?.error || body?.errors?.[0]?.message || res.statusText;
    throw new Error(`HTTP ${res.status}${why ? `: ${str(why, 120)}` : ""}`);
  }
  return body;
}

/** One MCP tool call over plain JSON-RPC (the hub is stateless: no initialize needed). */
async function mcpCall(url, token, name, args, fetchImpl) {
  const body = await fetchJson(`${url}/mcp`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  }, fetchImpl);
  if (body?.error) throw new Error(str(body.error.message, 160));
  const r = body?.result;
  if (r?.isError) throw new Error(str(r.content?.[0]?.text, 160) || `${name} failed`);
  if (r?.structuredContent && !Array.isArray(r.structuredContent)) return r.structuredContent;
  try { return JSON.parse(r?.content?.[0]?.text ?? "null"); } catch { return null; }
}

/** The businesses as the boards show them: this month's figures and the health check, nothing more. */
export function shapePadayon(summary, tasks) {
  const businesses = (Array.isArray(summary) ? summary : []).map((b) => ({
    name: str(b.business, 40),
    revenue: Number(b.revenue) || 0,
    profit: typeof b.profit === "number" ? b.profit : null,
    margin: typeof b.margin_pct === "number" ? b.margin_pct : null,
    sales: Number(b.sales_count) || 0,
    lastMonthRevenue: Number(b.last_month?.revenue) || 0,
    utang: Number(b.utang?.owed) || 0,
    goal: b.goal ? { target: Number(b.goal.target) || 0, progress: Number(b.goal.progress_pct) || 0, status: str(b.goal.status, 20) } : null,
    health: b.health ? { status: str(b.health.status, 12), top: b.health.findings?.[0] ? str(b.health.findings[0].text, 90) : null } : null,
    out: Array.isArray(b.stock?.out) ? b.stock.out.length : 0,
  }));
  const rank = { HIGH: 0, URGENT: 0, NORMAL: 1, LOW: 2 };
  const open = (Array.isArray(tasks) ? tasks : [])
    .filter((t) => t && t.status !== "DONE")
    .sort((a, b) => (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1))
    .slice(0, 6)
    .map((t) => ({ title: str(t.title, 70), business: t.business ? str(t.business, 30) : null, priority: str(t.priority, 10), status: str(t.status, 10), due: t.due || null }));
  return { businesses, tasks: open };
}

export function shapeLifeOs(s) {
  const bill = (b) => ({ name: str(b?.name, 40), due: str(b?.due, 10), amount: Number(b?.amount) || 0 });
  return {
    today: str(s?.today, 10),
    payday: { next: s?.payday?.next ? str(s.payday.next, 10) : null, daysUntil: typeof s?.payday?.daysUntil === "number" ? s.payday.daysUntil : null },
    overdue: (Array.isArray(s?.overdueBills) ? s.overdueBills : []).slice(0, 8).map(bill),
    dueSoon: (Array.isArray(s?.billsDueNext14Days) ? s.billsDueNext14Days : []).slice(0, 8).map(bill),
    goals: (Array.isArray(s?.goals) ? s.goals : []).slice(0, 6).map((g) => ({ name: str(g?.name, 40), percent: Number(g?.percent) || 0, verdict: g?.deadlineVerdict ? str(g.deadlineVerdict, 40) : null })),
  };
}

export const RAILWAY_QUERY = "query AtlasOfficeApps { projects(first: 100) { edges { node { id name deletedAt environments { edges { node { name serviceInstances { edges { node { serviceName latestDeployment { status createdAt } } } } } } } } } } }";

const BAD = new Set(["FAILED", "CRASHED"]);
const BUSY = new Set(["BUILDING", "DEPLOYING", "INITIALIZING", "QUEUED", "WAITING"]);

/** Each app (project) with its services' latest deploy in the production (or first) environment. */
export function shapeRailway(data) {
  const projects = [];
  for (const e of data?.projects?.edges ?? []) {
    const p = e?.node;
    if (!p || p.deletedAt) continue;
    const envs = (p.environments?.edges ?? []).map((x) => x?.node).filter(Boolean);
    const env = envs.find((x) => /^production$/i.test(x.name)) ?? envs[0];
    const services = (env?.serviceInstances?.edges ?? []).map((x) => x?.node).filter(Boolean).map((s) => ({
      name: str(s.serviceName, 40), status: s.latestDeployment?.status || "NONE", at: s.latestDeployment?.createdAt || null,
    }));
    const status = !services.length ? "EMPTY"
      : services.some((s) => BAD.has(s.status)) ? "DOWN"
        : services.some((s) => BUSY.has(s.status)) ? "DEPLOYING"
          : services.every((s) => s.status === "SLEEPING") ? "SLEEPING"
            : services.some((s) => s.status === "SUCCESS") ? "UP" : "UNKNOWN";
    projects.push({ name: str(p.name, 40), status, services });
  }
  return { projects: projects.sort((a, b) => a.name.localeCompare(b.name)) };
}

/**
 * A cache of the three sources, refreshed lazily.
 * @param {{ env?: object, getKey?: Function, fetchImpl?: Function, now?: () => number }} [deps]
 */
export function createOfficeWorld({ env = process.env, getKey = vaultGet, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const state = {};
  const inFlight = {};

  const sources = {
    padayon: {
      setup() {
        const url = baseUrl(env.PADAYON_URL);
        const token = secret("PADAYON_READ_TOKEN", { env, getKey });
        return url && token ? { url, token } : null;
      },
      async load({ url, token }) {
        const [summary, tasks] = await Promise.all([
          mcpCall(url, token, "month_summary", {}, fetchImpl),
          mcpCall(url, token, "list_tasks", {}, fetchImpl),
        ]);
        return shapePadayon(Array.isArray(summary) ? summary : summary?.result ?? summary, Array.isArray(tasks) ? tasks : tasks?.result ?? tasks);
      },
    },
    lifeos: {
      setup() {
        const url = baseUrl(env.LIFE_OS_URL);
        const token = secret("LIFE_OS_ATLAS_TOKEN", { env, getKey });
        return url && token ? { url, token } : null;
      },
      async load({ url, token }) {
        return shapeLifeOs(await fetchJson(`${url}/api/atlas/summary`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } }, fetchImpl));
      },
    },
    railway: {
      setup() {
        const token = secret("RAILWAY_API_TOKEN", { env, getKey });
        return token ? { token } : null;
      },
      async load({ token }) {
        const body = await fetchJson(RAILWAY_API, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ query: RAILWAY_QUERY }),
        }, fetchImpl);
        if (body?.errors?.length) throw new Error(str(body.errors[0].message, 160));
        return shapeRailway(body?.data);
      },
    },
  };

  async function refresh(name) {
    const src = sources[name];
    const cfg = src.setup();
    if (!cfg) { state[name] = { status: "not_set_up", at: now() }; return; }
    try {
      const data = await src.load(cfg);
      state[name] = { status: "ok", at: now(), data };
    } catch (err) {
      // the key itself never leaves: scrub it, then anything else that looks like a secret
      let msg = String(err?.message || err);
      for (const v of Object.values(cfg)) if (v && v.length > 8) msg = msg.split(v).join("[key]");
      const prev = state[name]?.data;
      state[name] = { status: prev ? "stale" : "error", at: now(), error: str(redactSecrets(msg), 160), ...(prev ? { data: prev } : {}) };
    }
  }

  /** Everything the boards need, fetching a source only if its copy is older than five minutes. */
  async function snapshot({ force = false } = {}) {
    await Promise.all(Object.keys(sources).map((name) => {
      const s = state[name];
      if (!force && s && now() - s.at < TTL_MS) return null;
      if (!inFlight[name]) inFlight[name] = refresh(name).finally(() => { delete inFlight[name]; });
      return inFlight[name];
    }));
    const out = {};
    for (const name of Object.keys(sources)) out[name] = state[name] ?? { status: "not_set_up" };
    return out;
  }

  return { snapshot };
}

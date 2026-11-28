/**
 * The office view's feed (public/office): who is on the team, what Atlas and its helpers are doing right now, and the
 * numbers on its board.
 *
 * Mounted at /api/office behind requireAuth, like every other /api route. The page itself is a static file; what it
 * shows comes from here, so someone who is not signed in gets an empty office and a 401.
 *
 *   GET /api/office/team    { team, project }
 *   GET /api/office/events  server-sent events, one hook-shaped event per line (lib/office-events.js)
 *   GET /api/office/usage   the board: the Claude plan's limits when known, tokens used, and tasks finished today
 *   GET /api/office/status  the other boards: messages in from each channel, recent errors, channels, heartbeat,
 *                           scheduled jobs and memory (lib/office-status.js)
 *   GET /api/office/plan    the owner's room plan (setting office.plan, else ATLAS_OFFICE_PLAN, else a generic one)
 *   PUT /api/office/plan    save it: { plan } (an object or JSON text); answers with what was kept and any problems
 *   GET /api/office/world   the plan plus the live numbers its rooms show (lib/office-world.js)
 *   GET /api/office/rooms/:kind/chat     a room computer's conversation: its own (web:office-<kind>), or the Discord
 *                                        channel's it is linked to; the last 40 messages
 *   PUT /api/office/rooms/:kind/link     { discord: channelId | null }: link the room's computer to a channel, or unlink
 *   POST /api/office/rooms/:kind/mirror  { text, reply }: post an exchange typed at a linked computer to its channel
 *   GET /api/office/discord-channels     the Discord channels Atlas has a conversation in, and whether Discord is up
 */
import { Router } from "express";
import { onEvent, activeTurnList } from "../lib/live-bus.js";
import { getAgents } from "../lib/agent-registry.js";
import { createOfficeTranslator, officeTeam } from "../lib/office-events.js";
import { initPlanLimits, planWindows } from "../lib/plan-limits.js";
import { usageIndex } from "../lib/token-usage.js";
import { localDay } from "../lib/local-time.js";
import { SettingsStore } from "../db/settings.js";
import { ConversationStore } from "../db/conversations.js";
import { createOfficeStatus, channelBoard, heartbeatBoard, cronBoard, memoryBoard } from "../lib/office-status.js";
import { getHeartbeatStatus } from "../lib/heartbeat.js";
import { getCronStatus } from "../lib/cron.js";
import config from "../config/env.js";
import { createOfficeWorld, normalizePlan, PLAN_SETTING } from "../lib/office-world.js";
import { departmentTeam } from "../lib/departments.js";
import { scheduleBoard } from "../lib/office-schedule.js";
import { offsiteStatus } from "../lib/offsite-backup.js";
import { createPlanUsage } from "../lib/plan-usage.js";

// the plan's usage as claude.ai shows it (lib/plan-usage.js), read at most every two minutes
const planUsage = createPlanUsage();

/** The off-site backup as the memory board shows it: set up or not, when the last good copy was made, whether the last try failed. */
function offsiteBoard(s) {
  if (!s) return null;
  return { configured: !!s.configured, lastOkAt: s.lastOkAt ?? null, failed: s.ok === false, error: s.ok === false && s.error ? String(s.error).slice(0, 90) : null };
}

export const officeRouter = Router();

const PROJECT = "Atlas";
const PING_MS = 15_000;
const DONE_SETTING = "office.done";

// ── Tasks finished today: one for Atlas per answer, one for a helper per job it was handed ────────────────────────
let settingsStore = null;
const done = { day: "", counts: {} };

const today = () => { try { return String(localDay(Date.now())); } catch { return new Date().toISOString().slice(0, 10); } };
function rollDay() {
  const d = today();
  if (done.day !== d) { done.day = d; done.counts = {}; }
}
/** Count one finished task for `who` ("manager" is Atlas). */
export function countDone(who) {
  if (!who) return;
  rollDay();
  done.counts[who] = (done.counts[who] || 0) + 1;
  try { settingsStore?.set(DONE_SETTING, JSON.stringify(done)); } catch { /* memory still has it */ }
}
export function doneToday() {
  rollDay();
  return { ...done.counts };
}

const tallier = createOfficeTranslator();
const status = createOfficeStatus({ day: () => today() });
onEvent((evt) => {
  try { status.noteBusEvent(evt); } catch { /* the board misses one */ }
  try {
    for (const ev of tallier.translate(evt)) {
      if (ev.hook === "Stop") countDone("manager");
      else if (ev.hook === "PostToolUse" && ev.subagent) countDone(ev.subagent);
      else if (ev.hook === "StopFailure") status.noteError("manager", ev.error);
      else if (ev.hook === "PostToolUseFailure") status.noteError(ev.agent_type, ev.error);
    }
  } catch { /* a count missed is not worth a crash */ }
});

officeRouter.use((req, _res, next) => {
  if (!settingsStore) {
    try {
      settingsStore = new SettingsStore(req.app.get("db"));
      initPlanLimits(settingsStore);
      const raw = settingsStore.get(DONE_SETTING);
      const saved = typeof raw === "string" ? JSON.parse(raw) : raw;
      rollDay();
      // What an earlier run counted today, under what this run has counted since it started.
      if (saved && saved.day === done.day && saved.counts && typeof saved.counts === "object") {
        for (const [k, v] of Object.entries(saved.counts)) done.counts[k] = (done.counts[k] || 0) + (Number(v) || 0);
      }
    } catch { /* no store: the board counts from this start */ }
  }
  next();
});

officeRouter.get("/team", (_req, res) => {
  res.json({ team: wholeTeam(), project: PROJECT });
});

officeRouter.get("/usage", async (req, res) => {
  const limits = planWindows();
  let plan = null;
  try { plan = await planUsage.get(); } catch { plan = { status: "error", error: "Could not read the plan's usage." }; }
  let used = null;
  try {
    const index = usageIndex(req.app.get("db"));
    if (!index.lastRefreshAt && !index.running) index.refresh();
    const o = index.overview({ windows: null });
    const pick = (w) => (w ? { tokens: w.total || 0, calls: w.calls || 0 } : null);
    used = { today: pick(o.today), fiveHour: pick(o.windows?.fiveHour), sevenDay: pick(o.windows?.sevenDay) };
  } catch { /* the board shows the rest */ }
  res.json({ at: Date.now(), limits, used, done: doneToday(), plan });
});

officeRouter.get("/status", (req, res) => {
  const safe = (fn) => { try { return fn(); } catch { return null; } };
  const channels = safe(() => channelBoard(req.app.get("channelManager")?.getStatus?.(), settingsStore)) || [];
  res.json({
    at: Date.now(),
    working: activeTurnList().length,
    channels,
    heartbeat: safe(() => heartbeatBoard(getHeartbeatStatus())),
    cron: safe(() => cronBoard(getCronStatus())),
    memory: safe(() => ({ ...memoryBoard({ workspaceDir: config.WORKSPACE_DIR, dbPath: config.DB_PATH }), offsite: offsiteBoard(offsiteStatus(req.app.get("db"))) })),
    ...status.snapshot(),
  });
});

// ── The room plan and the world it shows ─────────────────────────────────────────────────────────────────────────
const PLAN_MAX_CHARS = 20_000;
const world = createOfficeWorld();

function currentPlan() {
  let raw = null;
  try { raw = settingsStore?.get(PLAN_SETTING) ?? null; } catch { /* fall through */ }
  const from = raw ? "settings" : process.env.ATLAS_OFFICE_PLAN ? "environment" : "default";
  return { ...normalizePlan(raw ?? process.env.ATLAS_OFFICE_PLAN ?? null), from };
}

/** The helpers, then the departments' agents. */
function wholeTeam() {
  let depts = [];
  try { depts = departmentTeam(currentPlan().plan); } catch { /* the helpers alone */ }
  return officeTeam([...getAgents(), ...depts]);
}

// The schedule board: the plan's jobs (run elsewhere, shown only) and Atlas's own, around now.
officeRouter.get("/schedule", (_req, res) => {
  const { plan } = currentPlan();
  let atlas = [];
  try { atlas = getCronStatus()?.jobs ?? []; } catch { /* the plan's jobs alone */ }
  res.json(scheduleBoard(plan.schedule, atlas, { zone: config.TIMEZONE || "UTC" }));
});

officeRouter.get("/plan", (_req, res) => {
  const { plan, problems, from } = currentPlan();
  res.json({ plan, problems, from });
});

officeRouter.put("/plan", (req, res) => {
  const input = req.body?.plan;
  if (input == null) return res.status(400).json({ error: "Send { plan }." });
  const text = typeof input === "string" ? input : JSON.stringify(input);
  if (text.length > PLAN_MAX_CHARS) return res.status(413).json({ error: "That plan is too long." });
  const { plan, problems } = normalizePlan(input);
  if (problems.some((p) => p.startsWith("Not valid JSON"))) return res.status(400).json({ error: problems[0] });
  if (!settingsStore) return res.status(503).json({ error: "Settings are not ready yet." });
  try { settingsStore.set(PLAN_SETTING, JSON.stringify(plan)); } catch (err) { return res.status(500).json({ error: `Could not save: ${err.message}` }); }
  res.json({ plan, problems, from: "settings" });
});

officeRouter.get("/world", async (req, res) => {
  const { plan } = currentPlan();
  let sources = {};
  try { sources = await world.snapshot({ force: req.query.fresh === "1" }); } catch (err) { console.warn(`[office] world: ${err?.message || err}`); }
  // a linked computer shows its channel's name
  const titles = discordTitles(req);
  const rooms = plan.rooms.map((r) => (r.discord ? { ...r, discordTitle: titles.get(r.discord) || null } : r));
  res.json({ at: Date.now(), plan: { ...plan, rooms }, ...sources });
});

// ── The room computers ────────────────────────────────────────────────────────────────────────────────────────
const KIND_RE = /^[a-z]{2,20}$/;
const chatKey = (room) => (room.discord ? `discord:${room.discord}` : `web:office-${room.kind}`);

/** Discord channel id → the title of Atlas's conversation in it ("#general"). */
function discordTitles(req) {
  const out = new Map();
  try {
    const convs = new ConversationStore(req.app.get("db"));
    for (const { key, value } of settingsStore?.getByPrefix("channel_conv.discord:") ?? []) {
      const id = key.slice("channel_conv.discord:".length);
      if (!/^\d{5,25}$/.test(id)) continue;   // threads ("<parent>:thread:<id>") are left out
      const conv = convs.get(value);
      out.set(id, conv?.title || `#${id}`);
    }
  } catch { /* no titles: ids are shown */ }
  return out;
}

function roomFor(req, res) {
  const kind = String(req.params.kind || "");
  if (!KIND_RE.test(kind)) { res.status(400).json({ error: "No such room." }); return null; }
  const room = currentPlan().plan.rooms.find((r) => r.kind === kind);
  if (!room) { res.status(404).json({ error: "No such room." }); return null; }
  return room;
}

officeRouter.get("/rooms/:kind/chat", (req, res) => {
  const room = roomFor(req, res);
  if (!room) return;
  const key = chatKey(room);
  let messages = [];
  try {
    const convId = settingsStore?.get(`channel_conv.${key}`);
    if (convId) {
      const convs = new ConversationStore(req.app.get("db"));
      messages = convs.getRecentMessages(convId, 40)
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, text: String(m.content || "").replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").replace(/<tool_response>[\s\S]*?<\/tool_response>/g, "").trim().slice(0, 6000), at: m.created_at || null }))
        .filter((m) => m.text);
    }
  } catch (err) { console.warn(`[office] room chat: ${err?.message || err}`); }
  const linked = room.discord ? { id: room.discord, title: discordTitles(req).get(room.discord) || null } : null;
  res.json({ key, linked, messages });
});

officeRouter.put("/rooms/:kind/link", (req, res) => {
  const room = roomFor(req, res);
  if (!room) return;
  const id = req.body?.discord == null || req.body.discord === "" ? null : String(req.body.discord);
  if (id && !/^\d{5,25}$/.test(id)) return res.status(400).json({ error: "That is not a Discord channel id." });
  if (!settingsStore) return res.status(503).json({ error: "Settings are not ready yet." });
  const { plan } = currentPlan();
  const rooms = plan.rooms.map((r) => {
    if (r.kind !== room.kind) return r;
    const { discord: _old, ...rest } = r;
    return id ? { ...rest, discord: id } : rest;
  });
  const next = normalizePlan({ ...plan, rooms }).plan;
  try { settingsStore.set(PLAN_SETTING, JSON.stringify(next)); } catch (err) { return res.status(500).json({ error: `Could not save: ${err.message}` }); }
  res.json({ ok: true, discord: id });
});

officeRouter.post("/rooms/:kind/mirror", async (req, res) => {
  const room = roomFor(req, res);
  if (!room) return;
  if (!room.discord) return res.status(400).json({ error: "This room is not linked to Discord." });
  const text = String(req.body?.text ?? "").trim().slice(0, 1800);
  const reply = String(req.body?.reply ?? "").trim().slice(0, 12_000);
  if (!text) return res.status(400).json({ error: "Nothing to post." });
  const cm = req.app.get("channelManager");
  try {
    // who typed it: the name the owner goes by in the office (plain text only, no Discord markup)
    const who = String(req.body?.who ?? "").replace(/[^\p{L}\p{N} ._-]/gu, "").trim().slice(0, 30) || "The owner";
    await cm.sendMessage("discord", room.discord, `💻 **${who}** · office computer (${room.name}): ${text}`);
    if (reply) await cm.sendMessage("discord", room.discord, reply);
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: String(err?.message || err).slice(0, 200) });
  }
});

officeRouter.get("/discord-channels", (req, res) => {
  let running = false;
  try { running = req.app.get("channelManager")?.getStatus?.()?.discord?.status === "running"; } catch { /* shown as not running */ }
  const list = [...discordTitles(req)].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title));
  res.json({ running, list });
});

officeRouter.get("/events", (req, res) => {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  const send = (ev) => { try { res.write(`data: ${JSON.stringify(ev)}\n\n`); } catch { /* the page went away */ } };

  send({ hook: "Snapshot", project: PROJECT, team: wholeTeam(), services: [], logs: [] });
  // A turn already under way when the page opens: Atlas is at its desk, not idle.
  if (activeTurnList().length) send({ hook: "UserPromptSubmit", prompt: "" });

  const translator = createOfficeTranslator();
  const off = onEvent((evt) => {
    let out = [];
    try { out = translator.translate(evt); } catch (err) { console.warn(`[office] ${err?.message || err}`); }
    for (const ev of out) send(ev);
  });
  const ping = setInterval(() => { try { res.write(": ping\n\n"); } catch { /* closed */ } }, PING_MS);
  ping.unref?.();
  req.on("close", () => { clearInterval(ping); off(); });
});

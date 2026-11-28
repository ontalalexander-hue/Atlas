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
 */
import { Router } from "express";
import { onEvent, activeTurnList } from "../lib/live-bus.js";
import { getAgents } from "../lib/agent-registry.js";
import { createOfficeTranslator, officeTeam } from "../lib/office-events.js";
import { initPlanLimits, planWindows } from "../lib/plan-limits.js";
import { usageIndex } from "../lib/token-usage.js";
import { localDay } from "../lib/local-time.js";
import { SettingsStore } from "../db/settings.js";

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
onEvent((evt) => {
  try {
    for (const ev of tallier.translate(evt)) {
      if (ev.hook === "Stop") countDone("manager");
      else if (ev.hook === "PostToolUse" && ev.subagent) countDone(ev.subagent);
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
  res.json({ team: officeTeam(getAgents()), project: PROJECT });
});

officeRouter.get("/usage", (req, res) => {
  const limits = planWindows();
  let used = null;
  try {
    const index = usageIndex(req.app.get("db"));
    if (!index.lastRefreshAt && !index.running) index.refresh();
    const o = index.overview({ windows: null });
    const pick = (w) => (w ? { tokens: w.total || 0, calls: w.calls || 0 } : null);
    used = { today: pick(o.today), fiveHour: pick(o.windows?.fiveHour), sevenDay: pick(o.windows?.sevenDay) };
  } catch { /* the board shows the rest */ }
  res.json({ at: Date.now(), limits, used, done: doneToday() });
});

officeRouter.get("/events", (req, res) => {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  const send = (ev) => { try { res.write(`data: ${JSON.stringify(ev)}\n\n`); } catch { /* the page went away */ } };

  send({ hook: "Snapshot", project: PROJECT, team: officeTeam(getAgents()), services: [], logs: [] });
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

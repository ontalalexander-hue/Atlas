/**
 * What the office's boards show besides the team: messages coming in from each channel, recent errors, and the
 * state of what Atlas runs on (channels, heartbeat, scheduled jobs, memory).
 *
 * The inbox and the error list are kept in memory from the live bus (lib/live-bus.js): a restart starts them empty,
 * which is fine for a wall board. Message text is clipped and passed through redactSecrets before it is kept.
 */
import fs from "node:fs";
import path from "node:path";
import { redactSecrets } from "./redact.js";

/** Where a turn came from (the providers' liveSource): a person writing in, or Atlas's own schedule. */
export const PEOPLE_SOURCES = new Set(["web", "telegram", "discord", "slack", "whatsapp", "email", "api", "acp"]);
const INBOX_MAX = 30;
const ERRORS_MAX = 20;

const clip = (v, n) => {
  const s = redactSecrets(String(v ?? "").replace(/\s+/g, " ").trim());
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};

/**
 * A small in-memory record of the office's inbox and error list, fed with live-bus events.
 * @param {{ now?: () => number, day?: (ms: number) => string }} [opts]
 */
export function createOfficeStatus({ now = Date.now, day = (ms) => new Date(ms).toISOString().slice(0, 10) } = {}) {
  const inbox = [];             // newest first: { turnId, source, at, text, state: answering|answered|failed, doneAt }
  const errors = [];            // newest first: { at, who, text }
  let today = { day: "", bySource: {} };

  function countToday(source, at) {
    const d = day(at);
    if (today.day !== d) today = { day: d, bySource: {} };
    today.bySource[source] = (today.bySource[source] || 0) + 1;
  }

  /** Take one live-bus event. */
  function noteBusEvent(evt) {
    if (!evt || typeof evt !== "object") return;
    const p = evt.payload || {};
    if (evt.type === "turn_start") {
      const source = String(p.source || "");
      if (!PEOPLE_SOURCES.has(source)) return;
      const at = evt.createdAt || now();
      inbox.unshift({ turnId: evt.turnId || null, source, at, text: clip(p.prompt, 70), state: "answering", doneAt: null });
      inbox.length = Math.min(inbox.length, INBOX_MAX);
      countToday(source, at);
    } else if (evt.type === "turn_end") {
      const item = evt.turnId ? inbox.find((m) => m.turnId === evt.turnId) : null;
      if (item) {
        item.state = p.error || ["error", "failed", "auth-expired", "max_turns", "budget"].includes(p.stopReason) ? "failed" : "answered";
        item.doneAt = evt.createdAt || now();
      }
    }
  }

  /** Take one office event (lib/office-events.js) that reports a failure. */
  function noteError(who, text, at = now()) {
    errors.unshift({ at, who: String(who || "manager"), text: clip(text, 90) || "Something failed" });
    errors.length = Math.min(errors.length, ERRORS_MAX);
  }

  function snapshot() {
    const d = day(now());
    return {
      inbox: inbox.slice(0, 12).map(({ turnId, ...m }) => m),
      inboxToday: today.day === d ? { ...today.bySource } : {},
      errors: errors.slice(0, 12),
    };
  }

  return { noteBusEvent, noteError, snapshot };
}

/** Channels as the ops board shows them: only the ones that are set up, with a one-word state. */
export function channelBoard(status = {}) {
  const out = [];
  for (const [id, s] of Object.entries(status || {})) {
    const st = String(s?.status || "");
    if (!st || st === "not_configured") continue;
    out.push({ id, status: st, error: s?.error ? clip(s.error, 80) : null, warning: s?.warning ? clip(s.warning, 80) : null });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** The heartbeat, without the text of its last answer: only whether it went well. */
export function heartbeatBoard(hb) {
  if (!hb) return null;
  const r = String(hb.lastResult || "");
  return {
    running: !!hb.running,
    lastRun: hb.lastRun || null,
    runCount: hb.runCount || 0,
    ok: r ? !/^Error:/.test(r) : null,
    waitingForOwner: !!hb.waitingForOwner,
  };
}

/** Scheduled jobs: counts, and the few that matter most (running or failing first). */
export function cronBoard(cron) {
  if (!cron) return null;
  const jobs = Array.isArray(cron.jobs) ? cron.jobs : [];
  const rankOf = (j) => (j.running ? 0 : j.consecutiveErrors ? 1 : j.enabled ? 2 : 3);
  return {
    total: jobs.length,
    on: jobs.filter((j) => j.enabled && !j.awaitingOwner).length,
    running: jobs.filter((j) => j.running).length,
    failing: jobs.filter((j) => (j.consecutiveErrors || 0) > 0).length,
    jobs: [...jobs].sort((a, b) => rankOf(a) - rankOf(b)).slice(0, 5).map((j) => ({
      name: clip(j.name || j.id, 32),
      state: j.state || (j.enabled ? "on" : "off"),
      lastRun: j.lastRun || null,
      lastStatus: j.lastStatus || null,
      failing: (j.consecutiveErrors || 0) > 0,
    })),
  };
}

const MEMORY_CACHE_MS = 60_000;
let memoryCache = { at: 0, key: "", value: null };

/**
 * Atlas's memory on disk: how many files and how big, when it last wrote a checkpoint, and the database's size.
 * Walks at most `maxFiles` entries and keeps the answer for a minute.
 */
export function memoryBoard({ workspaceDir, dbPath, now = Date.now(), maxFiles = 5000 } = {}) {
  const key = `${workspaceDir}|${dbPath}`;
  if (memoryCache.value && memoryCache.key === key && now - memoryCache.at < MEMORY_CACHE_MS) return memoryCache.value;
  const out = { files: 0, bytes: 0, lastWrite: null, lastCheckpoint: null, dbBytes: null, capped: false };
  const memDir = workspaceDir ? path.join(workspaceDir, "memory") : null;
  if (memDir) {
    const stack = [memDir];
    let seen = 0;
    while (stack.length && seen < maxFiles) {
      const dir = stack.pop();
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        if (++seen > maxFiles) { out.capped = true; break; }
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { stack.push(full); continue; }
        if (!e.isFile()) continue;
        try {
          const st = fs.statSync(full);
          out.files += 1;
          out.bytes += st.size;
          if (!out.lastWrite || st.mtimeMs > out.lastWrite) out.lastWrite = st.mtimeMs;
          if (full.includes(`${path.sep}checkpoints${path.sep}`) && (!out.lastCheckpoint || st.mtimeMs > out.lastCheckpoint)) out.lastCheckpoint = st.mtimeMs;
        } catch { /* gone while we looked */ }
      }
    }
  }
  if (workspaceDir) {
    try {
      const st = fs.statSync(path.join(workspaceDir, "CHECKPOINT.md"));
      if (!out.lastCheckpoint || st.mtimeMs > out.lastCheckpoint) out.lastCheckpoint = st.mtimeMs;
    } catch { /* none waiting */ }
  }
  if (dbPath) {
    let total = 0, any = false;
    for (const f of [dbPath, `${dbPath}-wal`]) {
      try { total += fs.statSync(f).size; any = true; } catch { /* not there */ }
    }
    out.dbBytes = any ? total : null;
  }
  memoryCache = { at: now, key, value: out };
  return out;
}

export function _resetMemoryCache() { memoryCache = { at: 0, key: "", value: null }; }

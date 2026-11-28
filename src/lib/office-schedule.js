/**
 * The office's schedule board: when the owner's scheduled jobs run, around now.
 *
 * Two kinds of job are shown:
 *   - the plan's `schedule` list: jobs the owner runs elsewhere (Claude scheduled tasks on their own computer, say).
 *     Atlas does not run these; the office only shows when they are due, so nothing is ever done twice.
 *   - Atlas's own scheduled jobs (lib/cron.js), which Atlas does run, in the owner's timezone.
 *
 * A schedule is a five-part cron line ("15 16 * * *": minute, hour, day of month, month, weekday), optionally led by
 * "CRON_TZ=Area/City" for the zone it is read in. Lists, ranges and steps are understood; names (MON, JAN) are not.
 */
import { zoneOffsetMs } from "./local-time.js";

const MIN = 60_000;
const H = 60 * MIN;
const LIMITS = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];

/** One cron part as the set of numbers it matches, or null when it can't be read. */
function part(spec, lo, hi) {
  const out = new Set();
  for (const piece of spec.split(",")) {
    const m = /^(\*|(\d{1,2})(?:-(\d{1,2}))?)(?:\/(\d{1,2}))?$/.exec(piece);
    if (!m) return null;
    const step = m[4] ? Number(m[4]) : 1;
    if (step < 1) return null;
    let a = lo, b = hi;
    if (m[2] != null) { a = Number(m[2]); b = m[3] != null ? Number(m[3]) : (m[4] ? hi : a); }
    if (a < lo || b > hi || a > b) return null;
    for (let v = a; v <= b; v += step) out.add(v);
  }
  return out;
}

/**
 * Read a schedule line.
 * @returns {{ tz: string|null, min: Set, hour: Set, dom: Set, mon: Set, dow: Set, domAny: boolean, dowAny: boolean }|null}
 */
export function parseCron(text) {
  let s = String(text ?? "").trim();
  let tz = null;
  const z = /^CRON_TZ=(\S+)\s+/.exec(s);
  if (z) { tz = z[1]; s = s.slice(z[0].length); }
  const parts = s.split(/\s+/);
  if (parts.length !== 5) return null;
  const sets = parts.map((p, i) => part(p, ...LIMITS[i]));
  if (sets.some((x) => !x)) return null;
  if (tz) {
    try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); } catch { return null; }
  }
  const dow = sets[4];
  if (dow.has(7)) dow.add(0);   // 7 is Sunday too
  return { tz, min: sets[0], hour: sets[1], dom: sets[2], mon: sets[3], dow, domAny: parts[2] === "*", dowAny: parts[4] === "*" };
}

/**
 * The moments a schedule fires between two times (ms, `from` exclusive, `to` inclusive), at most `max` of them.
 * `zone` is used when the line names none.
 */
export function runsBetween(cronText, from, to, zone = "UTC", max = 50) {
  const c = typeof cronText === "string" ? parseCron(cronText) : cronText;
  if (!c) return [];
  const tz = c.tz || zone;
  const out = [];
  let t = Math.floor(from / MIN) * MIN + MIN;
  let hourStart = -1, off = 0;
  for (; t <= to && out.length < max; t += MIN) {
    // the zone's offset, looked up once an hour (zones change offset on the hour)
    const h = Math.floor(t / H) * H;
    if (h !== hourStart) { hourStart = h; off = zoneOffsetMs(t, tz); }
    const d = new Date(t + off);
    if (!c.min.has(d.getUTCMinutes()) || !c.hour.has(d.getUTCHours()) || !c.mon.has(d.getUTCMonth() + 1)) continue;
    // cron's rule: when both day fields are restricted, either one matching is enough
    const domOk = c.dom.has(d.getUTCDate()), dowOk = c.dow.has(d.getUTCDay());
    const dayOk = c.domAny && c.dowAny ? true : c.domAny ? dowOk : c.dowAny ? domOk : domOk || dowOk;
    if (dayOk) out.push(t);
  }
  return out;
}

const clip = (s, n) => {
  const v = String(s ?? "").replace(/\s+/g, " ").trim();
  return v.length > n ? v.slice(0, n - 1) + "…" : v;
};

/**
 * The board: every run from `back` before now to `ahead` after it, oldest first.
 * @param {object[]} planJobs  the plan's schedule ({ name, cron, room?, where, paused? })
 * @param {object[]} atlasJobs Atlas's own jobs as getCronStatus() lists them
 * @returns {{ at: number, zone: string, runs: object[], jobs: object[] }}
 */
export function scheduleBoard(planJobs = [], atlasJobs = [], { now = Date.now(), zone = "UTC", back = 8 * H, ahead = 36 * H } = {}) {
  const jobs = [];
  for (const j of Array.isArray(planJobs) ? planJobs : []) {
    if (!j?.name || !j.cron) continue;
    jobs.push({ name: clip(j.name, 80), cron: j.cron, room: j.room || null, where: j.where === "atlas" ? "atlas" : "pc", on: j.paused !== true });
  }
  for (const j of Array.isArray(atlasJobs) ? atlasJobs : []) {
    if (!j?.schedule || j.once) continue;
    jobs.push({ name: clip(j.name || j.id || "Scheduled job", 80), cron: String(j.schedule), room: null, where: "atlas", on: !!j.enabled && !j.awaitingOwner });
  }
  const runs = [];
  for (const [i, j] of jobs.entries()) {
    if (!j.on) continue;
    for (const t of runsBetween(j.cron, now - back, now + ahead, zone, 30)) runs.push({ job: i, at: t, done: t <= now });
  }
  runs.sort((a, b) => a.at - b.at);
  return { at: now, zone, jobs: jobs.map(({ cron: _c, ...rest }) => rest), runs: runs.slice(0, 120) };
}

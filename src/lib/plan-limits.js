/**
 * The Claude plan's own limits (the 5-hour window and the week), as the Claude engine last reported them.
 *
 * The Agent SDK sends a `rate_limit_event` when a plan's limit information changes. The engine hands each one here
 * (ai/providers/claude-code.js); the office view's board reads them back (routes/office.js). Nothing is asked of
 * Anthropic for this: an AI that is not on a Claude plan (an API key, a gateway) never sends one, and the board then
 * shows only what was used.
 *
 * Kept in memory, and in the settings store once one is given, so a restart does not blank the board.
 */
const NAMES = { five_hour: "fiveHour", seven_day: "sevenDay" };
const SETTING = "office.planLimits";

/** name -> { usedPct: number|null, resetsAt: ms|null, status, at: ms } */
const seen = {};
let store = null;

const save = () => { try { store?.set(SETTING, JSON.stringify(seen)); } catch { /* the board still has memory */ } };

/** Where to keep the limits between restarts. What was saved fills in what this run has not heard yet. */
export function initPlanLimits(settingsStore) {
  if (store || !settingsStore) return;
  store = settingsStore;
  try {
    const raw = store.get(SETTING);
    const saved = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (saved && typeof saved === "object") {
      for (const [k, v] of Object.entries(saved)) {
        if (Object.values(NAMES).includes(k) && v && typeof v === "object" && !seen[k]) seen[k] = v;
      }
    }
  } catch { /* nothing saved, or not readable */ }
  if (Object.keys(seen).length) save();
}

/** One rate_limit_event's info. Unknown window types and empty events are ignored. */
export function notePlanLimit(info, now = Date.now()) {
  const name = NAMES[info?.rateLimitType];
  if (!name) return false;
  const u = Number(info.utilization);
  // A share of the limit: 0.42 or 42, depending on who is reporting. Either way, a percentage here.
  const usedPct = Number.isFinite(u) && u >= 0 ? Math.min(100, Math.round((u <= 1 ? u * 100 : u) * 10) / 10) : null;
  const r = Number(info.resetsAt);
  const resetsAt = Number.isFinite(r) && r > 0 ? (r < 1e12 ? r * 1000 : r) : null;
  if (usedPct === null && resetsAt === null && !info.status) return false;
  const prev = seen[name];
  seen[name] = {
    // An event with no share keeps the last one heard for the same window.
    usedPct: usedPct ?? (prev && prev.resetsAt === resetsAt ? prev.usedPct : info.status === "rejected" ? 100 : null),
    resetsAt,
    status: String(info.status || "allowed"),
    at: now,
  };
  save();
  return true;
}

/**
 * What the board shows: { fiveHour, sevenDay }, each { usedPct, leftPct, resetsAt, status, at } or null when never
 * heard. A window whose reset time has passed starts again from zero.
 */
export function planWindows(now = Date.now()) {
  const out = {};
  for (const name of Object.values(NAMES)) {
    const w = seen[name];
    if (!w) { out[name] = null; continue; }
    const expired = !!w.resetsAt && w.resetsAt <= now;
    const usedPct = expired ? 0 : w.usedPct;
    out[name] = {
      usedPct,
      leftPct: usedPct === null ? null : Math.max(0, Math.round((100 - usedPct) * 10) / 10),
      resetsAt: expired ? null : w.resetsAt,
      status: expired ? "allowed" : w.status,
      at: w.at,
    };
  }
  return out;
}

/** For tests. */
export function _resetPlanLimits() {
  for (const k of Object.keys(seen)) delete seen[k];
  store = null;
}

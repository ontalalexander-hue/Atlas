/**
 * The Claude plan's usage as claude.ai shows it (Settings → Usage): the current session (5-hour window), this week,
 * and any per-model weekly window (Fable, Opus, Sonnet), each as a share used and when it resets.
 *
 * Read the way Claude Code's own /usage reads it: GET https://api.anthropic.com/api/oauth/usage with the plan's
 * sign-in (the CLAUDE_CODE_OAUTH_TOKEN variable, else the access token in the plan's .credentials.json, which Claude
 * Code keeps fresh). Read-only, sent nowhere else, at most once every two minutes. The token never leaves this
 * module: not in a log, an error or an answer. An AI that is not on a Claude plan has no such sign-in and the board
 * says so.
 */
import fs from "node:fs";
import path from "node:path";
import { claudeSignIn } from "../ai/provider-status.js";

const URL_ = "https://api.anthropic.com/api/oauth/usage";
const TTL_MS = 120_000;
const TIMEOUT_MS = 8_000;
const LABELS = { five_hour: "Current session", seven_day: "This week", seven_day_opus: "Opus", seven_day_sonnet: "Sonnet", seven_day_overage_included: "Fable" };
const ORDER = ["five_hour", "seven_day"];

/** A window from the answer: { usedPct, resetsAt } or null. Utilization is a percentage (37 for 37%). */
function windowOf(w) {
  if (!w || typeof w !== "object") return null;
  const u = Number(w.percent ?? w.utilization);
  if (!Number.isFinite(u) || u < 0) return null;
  const raw = w.resets_at ?? w.resetsAt ?? null;
  let resetsAt = null;
  if (typeof raw === "number" && raw > 0) resetsAt = raw < 1e12 ? raw * 1000 : raw;
  else if (typeof raw === "string") { const t = Date.parse(raw); if (Number.isFinite(t)) resetsAt = t; }
  return { usedPct: Math.min(100, Math.round(u * 10) / 10), resetsAt };
}

/**
 * The answer as the board wants it: { session, week, models: [{ label, usedPct, resetsAt }], byApp: [{ label, pct }] }.
 * The answer's `limits` list is read first (kind "session", "weekly_all", and "weekly_scoped" for a model such as
 * Fable); the older five_hour / seven_day fields fill in what it lacks. `byApp` is this week's split between
 * Claude Code, chats, Cowork and the rest.
 * @param {object} data the endpoint's JSON
 */
export function shapePlanUsage(data) {
  if (!data || typeof data !== "object") return null;
  let session = null, week = null;
  const models = [];
  const seen = new Set();
  for (const l of Array.isArray(data.limits) ? data.limits : []) {
    const w = windowOf(l);
    if (!w) continue;
    if (l.kind === "session" && !session) session = w;
    else if (l.kind === "weekly_all" && !week) week = w;
    else if (l.kind === "weekly_scoped") {
      const label = String(l.scope?.model?.display_name ?? l.scope?.surface?.display_name ?? l.display_name ?? "").trim().slice(0, 30);
      if (label && !seen.has(label.toLowerCase())) { models.push({ label, ...w }); seen.add(label.toLowerCase()); }
    }
  }
  session ??= windowOf(data.five_hour);
  week ??= windowOf(data.seven_day);
  for (const [k, v] of Object.entries(data)) {
    if (ORDER.includes(k) || !/^seven_day_/.test(k) || k === "seven_day_oauth_apps") continue;
    const w = windowOf(v);
    if (w) { models.push({ label: LABELS[k] || k.replace(/^seven_day_/, "").replace(/_/g, " "), ...w }); seen.add(models.at(-1).label.toLowerCase()); }
  }
  const byApp = (Array.isArray(data.seven_day_breakdown?.rows) ? data.seven_day_breakdown.rows : [])
    .map((r) => ({ label: String(r?.display_name ?? r?.key ?? "").trim().slice(0, 20), pct: Number(r?.percent) }))
    .filter((r) => r.label && Number.isFinite(r.pct) && r.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 4);
  if (!session && !week && !models.length) return null;
  return { session, week, models: models.slice(0, 3), byApp };
}

/** The plan's access token: the sign-in variable, else the .credentials.json Claude Code keeps. Null when none. */
function readToken({ env, signIn, readFile }) {
  const fromEnv = String(env.CLAUDE_CODE_OAUTH_TOKEN || "").trim();
  if (fromEnv) return { token: fromEnv };
  const s = signIn();
  if (!s?.home) return null;
  try {
    const j = JSON.parse(readFile(path.join(s.home, ".credentials.json"), "utf8"));
    const o = j?.claudeAiOauth ?? j;
    const token = typeof o?.accessToken === "string" ? o.accessToken.trim() : "";
    if (!token) return null;
    const exp = Number(o.expiresAt);
    return { token, expired: Number.isFinite(exp) && exp > 0 && exp < Date.now() };
  } catch {
    return null;
  }
}

/**
 * @returns {{ get(opts?: { force?: boolean }): Promise<{ status: string, data?: object, at?: number, error?: string }> }}
 *   status: "ok" | "stale" (the last good answer; reading again failed) | "not_signed_in" | "error"
 */
export function createPlanUsage({ env = process.env, fetchImpl = globalThis.fetch, now = Date.now, signIn = () => claudeSignIn({ env }), readFile = fs.readFileSync } = {}) {
  let last = null;        // { data, at }
  let lastTry = 0;
  let lastResult = null;
  let pending = null;

  async function read() {
    const t = readToken({ env, signIn, readFile });
    if (!t) return { status: "not_signed_in" };
    let res;
    try {
      res = await fetchImpl(URL_, {
        headers: { Authorization: `Bearer ${t.token}`, "anthropic-beta": "oauth-2025-04-20", "Content-Type": "application/json", "User-Agent": "atlas-office" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      return fail(err?.name === "TimeoutError" ? "Claude did not answer in time." : "Could not reach Claude.");
    }
    if (res.status === 401 || res.status === 403) return fail(t.expired ? "The plan's sign-in has expired; it renews on Atlas's next Claude answer." : "Claude did not accept the plan's sign-in for usage.");
    if (!res.ok) return fail(`Claude answered ${res.status}.`);
    let body = null;
    try { body = await res.json(); } catch { return fail("Claude's answer was not readable."); }
    const data = shapePlanUsage(body);
    if (!data) return fail("Claude's answer had no usage in it.");
    last = { data, at: now() };
    return { status: "ok", data, at: last.at };
  }
  const fail = (error) => (last ? { status: "stale", data: last.data, at: last.at, error } : { status: "error", error });

  return {
    async get({ force = false } = {}) {
      if (!force && lastResult && now() - lastTry < TTL_MS) return lastResult;
      if (pending) return pending;
      lastTry = now();
      pending = read().then((r) => { lastResult = r; return r; }).finally(() => { pending = null; });
      return pending;
    },
  };
}

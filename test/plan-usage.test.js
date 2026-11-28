import { test } from "node:test";
import assert from "node:assert/strict";
import { shapePlanUsage, createPlanUsage } from "../src/lib/plan-usage.js";

// the endpoint's answer, as it comes (most of its fields left out)
const ANSWER = {
  five_hour: { utilization: 37, resets_at: "2026-11-29T01:00:00Z" },
  seven_day: { utilization: 58.4, resets_at: "2026-12-02T13:00:00Z" },
  seven_day_oauth_apps: null,
  seven_day_opus: null,
  limits: [
    { kind: "session", percent: 37, resets_at: "2026-11-29T01:00:00Z", scope: null },
    { kind: "weekly_all", percent: 58.4, resets_at: "2026-12-02T13:00:00Z", scope: null },
    { kind: "weekly_scoped", percent: 36, resets_at: "2026-12-02T13:00:00Z", scope: { model: { id: null, display_name: "Fable" }, surface: null } },
  ],
  seven_day_breakdown: { rows: [{ key: "claude_code", display_name: "Claude Code", percent: 32 }, { key: "chat", display_name: "Chats", percent: 0 }, { key: "cowork", display_name: "Cowork", percent: 68 }] },
};

test("plan usage: the session, the week and a per-model window, as shares used", () => {
  const u = shapePlanUsage(ANSWER);
  assert.equal(u.session.usedPct, 37);
  assert.equal(u.session.resetsAt, Date.parse("2026-11-29T01:00:00Z"));
  assert.equal(u.week.usedPct, 58.4);
  assert.deepEqual(u.models.map((m) => [m.label, m.usedPct]), [["Fable", 36]]);
  assert.deepEqual(u.byApp, [{ label: "Cowork", pct: 68 }, { label: "Claude Code", pct: 32 }]);
  // an answer with only the older fields still reads
  assert.equal(shapePlanUsage({ five_hour: { utilization: 12, resets_at: null } }).session.usedPct, 12);
  assert.equal(shapePlanUsage({}), null);
  assert.equal(shapePlanUsage({ five_hour: { utilization: "x" } }), null);
});

test("plan usage: read with the sign-in, cached, and the token never shows up", async () => {
  const calls = [];
  let t = 1_000_000;
  const fetchImpl = async (url, init) => { calls.push([url, init.headers.Authorization, init.headers["anthropic-beta"]]); return { ok: true, status: 200, json: async () => ANSWER }; };
  const pu = createPlanUsage({ env: { CLAUDE_CODE_OAUTH_TOKEN: "tok-secret-123" }, fetchImpl, now: () => t });
  const a = await pu.get();
  assert.equal(a.status, "ok");
  assert.equal(a.data.week.usedPct, 58.4);
  assert.deepEqual(calls[0], ["https://api.anthropic.com/api/oauth/usage", "Bearer tok-secret-123", "oauth-2025-04-20"]);
  await pu.get();
  assert.equal(calls.length, 1);              // within two minutes: the same answer
  t += 121_000;
  await pu.get();
  assert.equal(calls.length, 2);
  assert.ok(!JSON.stringify(a).includes("tok-secret"));
});

test("plan usage: no sign-in, a refusal, and a failure after a good answer", async () => {
  const none = createPlanUsage({ env: {}, signIn: () => ({ signedIn: false }), fetchImpl: async () => { throw new Error("not called"); } });
  assert.equal((await none.get()).status, "not_signed_in");

  const refused = createPlanUsage({ env: { CLAUDE_CODE_OAUTH_TOKEN: "tok-secret-123" }, fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) }) });
  const r = await refused.get();
  assert.equal(r.status, "error");
  assert.ok(!r.error.includes("tok-secret"));

  let t = 0, ok = true;
  const flaky = createPlanUsage({ env: { CLAUDE_CODE_OAUTH_TOKEN: "x" }, now: () => t, fetchImpl: async () => (ok ? { ok: true, status: 200, json: async () => ANSWER } : Promise.reject(new Error("down"))) });
  await flaky.get();
  ok = false; t += 200_000;
  const s = await flaky.get();
  assert.equal(s.status, "stale");
  assert.equal(s.data.session.usedPct, 37);
});

test("plan usage: the sign-in file's access token is used when there is no variable", async () => {
  let auth = null;
  const pu = createPlanUsage({
    env: {},
    signIn: () => ({ signedIn: true, home: "/h" }),
    readFile: () => JSON.stringify({ claudeAiOauth: { accessToken: "file-token", expiresAt: Date.now() + 3600_000 } }),
    fetchImpl: async (_u, init) => { auth = init.headers.Authorization; return { ok: true, status: 200, json: async () => ANSWER }; },
  });
  assert.equal((await pu.get()).status, "ok");
  assert.equal(auth, "Bearer file-token");
});

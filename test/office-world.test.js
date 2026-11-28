import { test } from "node:test";
import assert from "node:assert/strict";
import { KINDS, defaultPlan, normalizePlan, shapePadayon, shapeLifeOs, shapeRailway, createOfficeWorld } from "../src/lib/office-world.js";

test("office plan: the default has one room of every kind and nothing personal", () => {
  const p = defaultPlan();
  assert.deepEqual(p.rooms.map((r) => r.kind), [...KINDS]);
});

test("office plan: a written plan replaces rooms by kind and keeps the rest", () => {
  const { plan, problems } = normalizePlan({
    rooms: [
      { kind: "growth", name: "Agency HQ", subtitle: "Primary growth engine", agents: ["A1", "A2"], padayon: ["agency"], railway: ["agency-site"], notes: ["one", "two"] },
      { kind: "separate", name: "Client X wing", hours: "8pm–5am", railway: ["client-x"] },
      { kind: "spaceship", name: "nope" },
    ],
    days: { mon: "CEO day", xyz: "ignored" },
    helpers: { coder: "server", quick: "growth", bad: "moon" },
  });
  assert.equal(plan.rooms.length, KINDS.length);
  const growth = plan.rooms.find((r) => r.kind === "growth");
  assert.equal(growth.name, "Agency HQ");
  assert.deepEqual(growth.agents, ["A1", "A2"]);
  assert.equal(plan.rooms.find((r) => r.kind === "separate").hours, "8pm–5am");
  assert.equal(plan.rooms.find((r) => r.kind === "ceo").name, "CEO office", "a kind left out keeps the default");
  assert.deepEqual(plan.days, { mon: "CEO day" });
  assert.equal(plan.helpers.quick, "growth");
  assert.equal(plan.helpers.bad, undefined);
  assert.equal(problems.length, 2, problems.join(" | "));
});

test("office plan: text is parsed, and bad JSON says so", () => {
  assert.equal(normalizePlan('{"rooms":[{"kind":"church","name":"Church wing"}]}').plan.rooms.find((r) => r.kind === "church").name, "Church wing");
  assert.match(normalizePlan("{nope").problems[0], /Not valid JSON/);
  assert.equal(normalizePlan(null).problems.length, 0);
});

test("padayon: this month's figures and the open tasks, important first", () => {
  const s = shapePadayon(
    [{ business: "Shop", revenue: 1200, profit: -50, margin_pct: -4, sales_count: 3, last_month: { revenue: 900 }, utang: { owed: 40 }, health: { status: "FIX", findings: [{ text: "Losing money" }] }, stock: { out: ["a", "b"] }, goal: null }],
    [{ title: "Low", priority: "LOW", status: "TODO" }, { title: "Do this first", priority: "HIGH", status: "TODO" }, { title: "Done", priority: "HIGH", status: "DONE" }],
  );
  assert.deepEqual(s.businesses[0], { name: "Shop", revenue: 1200, profit: -50, margin: -4, sales: 3, lastMonthRevenue: 900, utang: 40, goal: null, health: { status: "FIX", top: "Losing money" }, out: 2 });
  assert.deepEqual(s.tasks.map((t) => t.title), ["Do this first", "Low"]);
});

test("life os: payday, bills and goals only", () => {
  const s = shapeLifeOs({ today: "2026-11-28", payday: { next: "2026-11-29", daysUntil: 1 }, overdueBills: [{ name: "Water", due: "2026-11-20", amount: 300, id: "x" }], billsDueNext14Days: [], goals: [{ name: "Car", percent: 12, deadlineVerdict: "on track" }], banks: [{ balance: 1 }] });
  assert.deepEqual(s.payday, { next: "2026-11-29", daysUntil: 1 });
  assert.deepEqual(s.overdue, [{ name: "Water", due: "2026-11-20", amount: 300 }]);
  assert.equal(JSON.stringify(s).includes("banks"), false);
});

test("railway: each app's state from its services' latest deploys", () => {
  const node = (name, statuses, env = "production") => ({ node: { name, deletedAt: null, environments: { edges: [{ node: { name: env, serviceInstances: { edges: statuses.map((st, i) => ({ node: { serviceName: `s${i}`, latestDeployment: st ? { status: st, createdAt: "2026-11-28T00:00:00Z" } : null } })) } } }] } } });
  const r = shapeRailway({ projects: { edges: [node("b-up", ["SUCCESS", "SUCCESS"]), node("a-down", ["SUCCESS", "CRASHED"]), node("c-busy", ["BUILDING"]), node("d-empty", []), { node: { name: "gone", deletedAt: "x" } }] } });
  assert.deepEqual(r.projects.map((p) => [p.name, p.status]), [["a-down", "DOWN"], ["b-up", "UP"], ["c-busy", "DEPLOYING"], ["d-empty", "EMPTY"]]);
});

test("world: a source with no key says so, and nothing is fetched", async () => {
  let calls = 0;
  const w = createOfficeWorld({ env: {}, getKey: () => null, fetchImpl: async () => { calls++; throw new Error("no"); } });
  const s = await w.snapshot();
  assert.equal(s.padayon.status, "not_set_up");
  assert.equal(s.lifeos.status, "not_set_up");
  assert.equal(s.railway.status, "not_set_up");
  assert.equal(calls, 0);
});

test("world: reads padayon over MCP, and a failure never shows the key", async () => {
  const KEY = "k".repeat(40);
  let fail = false;
  const fetchImpl = async (url, init) => {
    assert.equal(init.headers.authorization, `Bearer ${KEY}`);
    if (fail) return new Response(JSON.stringify({ error: { message: `token ${KEY} rejected` } }), { status: 401 });
    const name = JSON.parse(init.body).params.name;
    const result = name === "month_summary" ? [{ business: "Shop", revenue: 10, sales_count: 1 }] : [];
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: JSON.stringify(result) }] } }), { status: 200 });
  };
  let t = 0;
  const w = createOfficeWorld({ env: { PADAYON_URL: "https://hq.example.com/" }, getKey: (n) => (n === "PADAYON_READ_TOKEN" ? KEY : null), fetchImpl, now: () => t });
  const a = await w.snapshot();
  assert.equal(a.padayon.status, "ok");
  assert.equal(a.padayon.data.businesses[0].name, "Shop");
  fail = true;
  t += 10 * 60_000;
  const b = await w.snapshot();
  assert.equal(b.padayon.status, "stale", "keeps the last good copy");
  assert.equal(b.padayon.data.businesses[0].name, "Shop");
  assert.ok(!JSON.stringify(b).includes(KEY), "the key is scrubbed from the error");
});

test("world: a plain-http address is refused unless it is this machine", async () => {
  const w = createOfficeWorld({ env: { LIFE_OS_URL: "http://example.com", LIFE_OS_ATLAS_TOKEN: "x".repeat(40) }, getKey: () => null, fetchImpl: async () => { throw new Error("should not fetch"); } });
  assert.equal((await w.snapshot()).lifeos.status, "not_set_up");
});

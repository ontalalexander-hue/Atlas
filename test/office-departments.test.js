import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePlan } from "../src/lib/office-world.js";
import { departmentTeam } from "../src/lib/departments.js";
import { sdkAgents } from "../src/lib/agent-registry.js";
import { parseCron, runsBetween, scheduleBoard } from "../src/lib/office-schedule.js";

test("departments: one agent per department room the plan lists, named by its lead", () => {
  const { plan } = normalizePlan({ rooms: [
    { kind: "growth", name: "Main HQ", lead: "Hana", notes: ["clients"] },
    { kind: "church", name: "Ministry" },
    { kind: "sales", name: "Sales", dept: false },
    { kind: "library", name: "Library" },
  ] });
  const team = departmentTeam(plan);
  assert.deepEqual(team.map((d) => [d.id, d.name, d.room]), [["dept-growth", "Hana", "growth"], ["dept-church", "Ministry agent", "church"]]);
  assert.match(team[0].prompt, /Never invent a number/);
  assert.match(team[0].prompt, /owner must approve/);
  assert.match(team[0].description, /Main HQ/);
});

test("departments: the default plan has none, and the separate wing is told to stay separate", () => {
  assert.deepEqual(departmentTeam(normalizePlan(null).plan), []);
  const [d] = departmentTeam(normalizePlan({ rooms: [{ kind: "separate", name: "Wing" }] }).plan);
  assert.match(d.prompt, /kept separate/);
});

test("departments: they reach Claude as agents beside the helpers", () => {
  const depts = departmentTeam(normalizePlan({ rooms: [{ kind: "market", name: "Market" }] }).plan);
  const agents = sdkAgents([{ id: "coder", prompt: "code", tools: ["Read"] }, ...depts]);
  assert.ok(agents.coder);
  assert.ok(agents["dept-market"]);
  assert.equal(agents["dept-market"].tools, undefined);   // Atlas's own tools, nothing more
});

test("office plan: a schedule keeps good jobs and says why it skipped the rest", () => {
  const { plan, problems } = normalizePlan({ schedule: [
    { name: "Team reminder", cron: "CRON_TZ=Asia/Tokyo 15 16 * * *", room: "church" },
    { name: "Report", cron: "CRON_TZ=America/Chicago 15 19 * * 1-5", where: "atlas", paused: true },
    { name: "Broken", cron: "every day" },
    { name: "Bad zone", cron: "CRON_TZ=Mars/Base 0 9 * * *" },
    { name: "Odd room", cron: "0 9 * * *", room: "attic" },
  ] });
  assert.deepEqual(plan.schedule.map((j) => j.name), ["Team reminder", "Report", "Odd room"]);
  assert.equal(plan.schedule[0].where, "pc");
  assert.equal(plan.schedule[1].paused, true);
  assert.equal(problems.length, 3);
});

test("schedule: cron lines are read in their own timezone", () => {
  assert.equal(parseCron("61 * * * *"), null);
  assert.equal(parseCron("* * *"), null);
  // 16:15 in Tokyo (UTC+9) is 07:15 UTC
  const from = Date.UTC(2026, 10, 28, 0, 0);
  const runs = runsBetween("CRON_TZ=Asia/Tokyo 15 16 * * *", from, from + 24 * 3600_000);
  assert.deepEqual(runs.map((t) => new Date(t).toISOString()), ["2026-11-28T07:15:00.000Z"]);
  // weekdays only, in Chicago: Friday 27 November at 19:15 there (01:15 UTC on the 28th) runs, the weekend does
  // not, and Monday the 30th falls just past the window
  const wk = runsBetween("CRON_TZ=America/Chicago 15 19 * * 1-5", from, from + 3 * 24 * 3600_000);
  assert.deepEqual(wk.map((t) => new Date(t).toISOString()), ["2026-11-28T01:15:00.000Z"]);
  // a list of weekdays and a step
  assert.equal(runsBetween("*/30 9 * * 3,6", from, from + 24 * 3600_000, "UTC").length, 2);
});

test("schedule board: runs around now, Atlas's own jobs included, paused ones left out", () => {
  const now = Date.UTC(2026, 10, 28, 9, 0);
  const b = scheduleBoard(
    [{ name: "Morning", cron: "0 8 * * *", room: "church", where: "pc" }, { name: "Off", cron: "0 10 * * *", paused: true }],
    [{ name: "Brief", schedule: "30 9 * * *", enabled: true }, { name: "Once", schedule: "0 12 * * *", enabled: true, once: true }],
    { now, zone: "UTC" },
  );
  assert.deepEqual(b.jobs.map((j) => [j.name, j.where, j.on]), [["Morning", "pc", true], ["Off", "pc", false], ["Brief", "atlas", true]]);
  const seen = b.runs.map((r) => [b.jobs[r.job].name, new Date(r.at).toISOString().slice(11, 16), r.done]);
  assert.deepEqual(seen.slice(0, 2), [["Morning", "08:00", true], ["Brief", "09:30", false]]);
  assert.ok(!seen.some(([n]) => n === "Off"));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createOfficeStatus, channelBoard, heartbeatBoard, cronBoard, memoryBoard, _resetMemoryCache } from "../src/lib/office-status.js";

const turn = (type, turnId, payload = {}, createdAt = 1000) => ({ type, turnId, conversationId: "c1", payload, createdAt });

test("office status: a message from a channel shows in the inbox, then as answered", () => {
  const s = createOfficeStatus({ now: () => 5000, day: () => "2026-11-28" });
  s.noteBusEvent(turn("turn_start", "t1", { source: "telegram", prompt: "how   are\nsales today?" }));
  let snap = s.snapshot();
  assert.equal(snap.inbox.length, 1);
  assert.deepEqual({ source: snap.inbox[0].source, text: snap.inbox[0].text, state: snap.inbox[0].state }, { source: "telegram", text: "how are sales today?", state: "answering" });
  assert.equal(snap.inbox[0].turnId, undefined, "turn ids stay on the server");
  assert.deepEqual(snap.inboxToday, { telegram: 1 });
  s.noteBusEvent(turn("turn_end", "t1", { stopReason: "end_turn" }, 2000));
  snap = s.snapshot();
  assert.equal(snap.inbox[0].state, "answered");
  assert.equal(snap.inbox[0].doneAt, 2000);
});

test("office status: a failed turn is marked failed", () => {
  const s = createOfficeStatus({ day: () => "d" });
  s.noteBusEvent(turn("turn_start", "t2", { source: "web", prompt: "x" }));
  s.noteBusEvent(turn("turn_end", "t2", { stopReason: "error", error: "boom" }));
  assert.equal(s.snapshot().inbox[0].state, "failed");
});

test("office status: Atlas's own jobs are not visitors", () => {
  const s = createOfficeStatus({ day: () => "d" });
  for (const source of ["cron", "heartbeat", "boot", "agent", ""]) s.noteBusEvent(turn("turn_start", `t-${source}`, { source, prompt: "x" }));
  assert.equal(s.snapshot().inbox.length, 0);
});

test("office status: secrets in a message are redacted before they are kept", () => {
  const s = createOfficeStatus({ day: () => "d" });
  s.noteBusEvent(turn("turn_start", "t3", { source: "web", prompt: "use key sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA please" }));
  assert.ok(!s.snapshot().inbox[0].text.includes("AAAAAAAAAAAAAAAAAAAA"));
});

test("office status: the inbox and error list stay short", () => {
  const s = createOfficeStatus({ day: () => "d" });
  for (let i = 0; i < 50; i++) { s.noteBusEvent(turn("turn_start", `t${i}`, { source: "web", prompt: String(i) })); s.noteError("coder", `e${i}`); }
  const snap = s.snapshot();
  assert.equal(snap.inbox.length, 12);
  assert.equal(snap.inbox[0].text, "49");
  assert.equal(snap.errors.length, 12);
  assert.equal(snap.errors[0].who, "coder");
  assert.deepEqual(snap.inboxToday, { web: 50 });
});

test("office status: today's counts start again on a new day", () => {
  let d = "2026-11-28";
  const s = createOfficeStatus({ day: () => d });
  s.noteBusEvent(turn("turn_start", "a", { source: "web" }));
  d = "2026-11-29";
  assert.deepEqual(s.snapshot().inboxToday, {});
});

test("channel board: only channels that are set up", () => {
  const b = channelBoard({ telegram: { status: "running" }, slack: { status: "not_configured" }, discord: { status: "error", error: "bad token" } });
  assert.deepEqual(b.map((c) => [c.id, c.status]), [["discord", "error"], ["telegram", "running"]]);
  assert.equal(b[0].error, "bad token");
});

test("heartbeat board: whether it went well, not what it said", () => {
  assert.deepEqual(heartbeatBoard({ running: true, lastRun: 5, runCount: 2, lastResult: "Your calendar has 3 private meetings" }), { running: true, lastRun: 5, runCount: 2, ok: true, waitingForOwner: false });
  assert.equal(heartbeatBoard({ lastResult: "Error: timeout" }).ok, false);
  assert.equal(heartbeatBoard({}).ok, null);
  assert.equal(heartbeatBoard(null), null);
});

test("cron board: counts, and running or failing jobs first", () => {
  const b = cronBoard({ jobs: [
    { id: "a", name: "Daily digest", enabled: true, state: "on" },
    { id: "b", name: "Backup", enabled: true, state: "on", consecutiveErrors: 2 },
    { id: "c", name: "Sunday review", enabled: true, running: true, state: "running" },
    { id: "d", name: "Old", enabled: false, state: "off" },
  ] });
  assert.equal(b.total, 4); assert.equal(b.on, 3); assert.equal(b.running, 1); assert.equal(b.failing, 1);
  assert.deepEqual(b.jobs.map((j) => j.name), ["Sunday review", "Backup", "Daily digest", "Old"]);
});

test("memory board: files, size, last checkpoint and database size", () => {
  _resetMemoryCache();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "office-mem-"));
  fs.mkdirSync(path.join(dir, "memory", "checkpoints"), { recursive: true });
  fs.writeFileSync(path.join(dir, "memory", "a.md"), "hello");
  fs.writeFileSync(path.join(dir, "memory", "checkpoints", "c.md"), "abc");
  const db = path.join(dir, "x.db");
  fs.writeFileSync(db, "1234567890");
  const m = memoryBoard({ workspaceDir: dir, dbPath: db, now: 1 });
  assert.equal(m.files, 2);
  assert.equal(m.bytes, 8);
  assert.ok(m.lastCheckpoint > 0);
  assert.equal(m.dbBytes, 10);
  fs.rmSync(dir, { recursive: true, force: true });
});

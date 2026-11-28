import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { isSecretKey } from "../src/lib/vault.js";
import { assertSkillName, uninstallSkill, installSkill } from "../src/lib/skills-engine.js";
import { isUnsendable } from "../src/lib/safe-path.js";
import { guardedFetch } from "../src/lib/guarded-fetch.js";
import { rateLimitAuth, recordFailedAttempt, clearFailedAttempts, GLOBAL_MAX, _resetGlobalAuthLock } from "../src/middleware/auth.js";
import { channelIsOpen, channelBoard } from "../src/lib/office-status.js";

test("the Web Push private key is stored as a secret, the public one is not", () => {
  assert.equal(isSecretKey("push.vapid_private"), true);
  assert.equal(isSecretKey("push.vapid_public"), false);
});

test("a skill name cannot point outside the skills folders", () => {
  for (const bad of ["", "..", "../data", "a/b", "a\\b", ".hidden", "x/..", "..\\..", null, 5, "a".repeat(101)]) {
    assert.throws(() => assertSkillName(bad), /not a skill name/, JSON.stringify(bad));
    assert.throws(() => uninstallSkill(bad), /not a skill name/);
    assert.throws(() => installSkill(bad), /not a skill name/);
  }
  for (const ok of ["web-search", "my_skill.v2", "A1"]) assert.equal(assertSkillName(ok), ok);
});

test("send_file never sends Atlas's own secrets", () => {
  for (const p of [
    "/data/atlas/.env", "/data/atlas/workspace/.env.production", "/home/x/.ssh/id_rsa", "/data/atlas/server.key", "/data/certs/site.pem",
    "/data/atlas/backups/keys/db-backup.key", "/data/atlas/backups/keys/anything.txt", "/data/atlas/data/atlas.db", "/data/atlas/backups/atlas.db.gz",
    "/data/atlas/backups/atlas.db-2026-11-28.enc", "/data/atlas/.encryption-key", "/data/atlas/vault.json", "/data/atlas/.claude-code-home/.credentials.json",
  ]) assert.equal(isUnsendable(p), true, p);
  for (const p of ["/data/atlas/workspace/report.pdf", "/data/atlas/workspace/notes.md", "/data/atlas/workspace/environment.txt", "/data/atlas/workspace/keyboard.png"]) {
    assert.equal(isUnsendable(p), false, p);
  }
});

test("web_fetch: a private address written as an IP is refused", async () => {
  for (const url of ["http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://10.0.0.5/", "http://[::ffff:127.0.0.1]/"]) {
    await assert.rejects(guardedFetch(url), /private or local network/, url);
  }
  await assert.rejects(guardedFetch("file:///etc/passwd"), /only http and https/);
});

test("web_fetch: a name that resolves to a private address is refused by the real lookup", async () => {
  await assert.rejects(guardedFetch("http://localhost:9/"), /private or local network/);
});

test("web_fetch: redirects are followed and every hop is checked", async () => {
  const srv = http.createServer((req, res) => {
    if (req.url === "/ok") { res.end("hello"); return; }
    if (req.url === "/to-ok") { res.writeHead(302, { location: "/ok" }); res.end(); return; }
    if (req.url === "/to-metadata") { res.writeHead(302, { location: "http://169.254.169.254/latest/" }); res.end(); return; }
    if (req.url === "/to-evil") { res.writeHead(301, { location: "http://evil.test/" }); res.end(); return; }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  // a stand-in for DNS: "public.test" is allowed to reach this test server, "evil.test" resolves somewhere private
  const lookup = (host, opts, cb) => {
    if (typeof opts === "function") { cb = opts; opts = {}; }
    if (host === "public.test") return opts?.all ? cb(null, [{ address: "127.0.0.1", family: 4 }]) : cb(null, "127.0.0.1", 4);
    return cb(Object.assign(new Error(`that address is on a private or local network (${host}), which this tool doesn't fetch from`), { code: "EPRIVATE" }));
  };
  try {
    const ok = await guardedFetch(`http://public.test:${port}/to-ok`, { lookup });
    assert.equal(ok.status, 200);
    assert.equal(ok.text, "hello");
    await assert.rejects(guardedFetch(`http://public.test:${port}/to-metadata`, { lookup }), /private or local network/);
    await assert.rejects(guardedFetch(`http://public.test:${port}/to-evil`, { lookup }), /private or local network/);
  } finally {
    srv.close();
  }
});

test("login: guessing spread over many addresses is paused for everyone", () => {
  _resetGlobalAuthLock();
  const call = (ip) => {
    let status = 200;
    const res = { set() {}, status(s) { status = s; return { json() {} }; } };
    let passed = false;
    rateLimitAuth({ ip }, res, () => { passed = true; });
    return passed ? 200 : status;
  };
  assert.equal(call("198.51.100.1"), 200);
  for (let i = 0; i < GLOBAL_MAX - 1; i++) recordFailedAttempt(`203.0.113.${i % 250}`);
  assert.equal(call("198.51.100.2"), 200, "just under the limit, logins still go through");
  recordFailedAttempt("203.0.113.250");
  assert.equal(call("198.51.100.3"), 429, "over it, a fresh address is paused too");
  _resetGlobalAuthLock();
  for (let i = 0; i <= 250; i++) clearFailedAttempts(`203.0.113.${i}`);
  assert.equal(call("198.51.100.4"), 200);
});

test("office board: a channel with no allowlist is marked open to anyone", () => {
  const store = (vals) => ({ get: (k) => vals[k] ?? null });
  assert.equal(channelIsOpen("discord", store({})), true);
  assert.equal(channelIsOpen("discord", store({ "allowlist.discord": '["123"]' })), false);
  assert.equal(channelIsOpen("discord", store({ "allowlist.discord": [] })), true);
  assert.equal(channelIsOpen("telegram", store({ "channel.telegram": { allowedChats: ["-100"] } })), false);
  assert.equal(channelIsOpen("email", store({ "channel.email": { allowlistFromAddresses: [] } })), true);
  const b = channelBoard({ discord: { status: "running" }, web: { status: "running" } }, store({}));
  assert.equal(b.find((c) => c.id === "discord").open, true);
  assert.match(b.find((c) => c.id === "discord").warning, /open to anyone/);
  assert.equal(b.find((c) => c.id === "web").open, false);
});

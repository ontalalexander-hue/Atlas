import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { backupKey, encryptStreamToFile, decryptFile, readRecords, workspaceFiles, runOffsiteBackup, backupConfig, KEEP } from "../src/lib/offsite-backup.js";

const SECRET = "test-encryption-key-0123456789abcdef";
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "offsite-test-"));

test("backup files: encrypted, and only the right key opens them", async () => {
  const dir = tmp();
  const f = path.join(dir, "x.atlasbk");
  await encryptStreamToFile(Readable.from([Buffer.from("hello "), Buffer.from("world")]), f, backupKey(SECRET));
  const raw = fs.readFileSync(f);
  assert.ok(!raw.includes(Buffer.from("hello")), "nothing readable in the file");
  assert.equal(decryptFile(f, backupKey(SECRET)).toString(), "hello world");
  assert.throws(() => decryptFile(f, backupKey("another-key-entirely-0000000000")));
  raw[raw.length - 20] ^= 1;
  fs.writeFileSync(f, raw);
  assert.throws(() => decryptFile(f, backupKey(SECRET)), "a changed file is refused");
  assert.throws(() => backupKey(""), /ENCRYPTION_KEY is not set/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("workspace copy: memory and notes, not caches, links or Atlas's secrets", () => {
  const ws = tmp();
  fs.mkdirSync(path.join(ws, "memory"), { recursive: true });
  fs.writeFileSync(path.join(ws, "USER.md"), "me");
  fs.writeFileSync(path.join(ws, "memory", "2026-11-28.md"), "today");
  fs.mkdirSync(path.join(ws, "node_modules", "x"), { recursive: true });
  fs.writeFileSync(path.join(ws, "node_modules", "x", "a.js"), "x");
  fs.writeFileSync(path.join(ws, "vault.json"), "{}");
  const { files } = workspaceFiles(ws);
  assert.deepEqual(files.map((f) => f.rel).sort(), ["USER.md", "memory/2026-11-28.md"]);
  fs.rmSync(ws, { recursive: true, force: true });
});

function fakeGitHub({ isPrivate = true, empty = false, existing = 0 } = {}) {
  const calls = [];
  const uploads = {};
  let releases = Array.from({ length: existing }, (_, i) => ({ id: 1000 + i, tag_name: `atlas-backup-20260101-0000${String(i).padStart(2, "0")}` }));
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    calls.push(`${init.method} ${u.pathname}`);
    const json = (status, body) => new Response(body == null ? "" : JSON.stringify(body), { status });
    if (init.method === "GET" && u.pathname === "/repos/me/backups") return json(200, { private: isPrivate });
    if (init.method === "GET" && u.pathname.endsWith("/commits")) return empty ? json(409, { message: "Git Repository is empty." }) : json(200, [{}]);
    if (init.method === "PUT" && u.pathname.endsWith("/contents/README.md")) { empty = false; return json(201, {}); }
    if (init.method === "POST" && u.pathname === "/repos/me/backups/releases") {
      const r = { id: 1, tag_name: JSON.parse(init.body).tag_name };
      releases.push(r);
      return json(201, r);
    }
    if (init.method === "POST" && u.host === "uploads.github.com") { uploads[u.searchParams.get("name")] = Buffer.from(init.body); return json(201, {}); }
    if (init.method === "GET" && u.pathname === "/repos/me/backups/releases") return json(200, releases);
    if (init.method === "DELETE") { releases = releases.filter((r) => !u.pathname.endsWith(`/releases/${r.id}`)); return json(204, null); }
    return json(404, { message: "not here" });
  };
  return { fetchImpl, calls, uploads, releases: () => releases };
}

const fakeDb = (content) => ({ backup: async (dest) => { fs.writeFileSync(dest, content); } });
const deps = { env: { GITHUB_BACKUP_REPO: "me/backups", GITHUB_BACKUP_TOKEN: "ghp_" + "t".repeat(36) }, getKey: () => null };

test("off-site backup: workspace and database go up encrypted, and only the newest are kept", async () => {
  const ws = tmp();
  fs.writeFileSync(path.join(ws, "MEMORY.md"), "remember this");
  const gh = fakeGitHub({ existing: KEEP + 2 });
  const r = await runOffsiteBackup({ db: fakeDb("SQLite format 3\0 pretend"), workspaceDir: ws, deps, fetchImpl: gh.fetchImpl, now: new Date("2026-11-28T03:00:00Z"), secret: SECRET });
  assert.equal(r.tag, "atlas-backup-20261128-030000");
  const names = Object.keys(gh.uploads).sort();
  assert.deepEqual(names, ["database-20261128-030000.atlasbk", "workspace-20261128-030000.atlasbk"]);
  // what went up opens with the key, and holds what was there
  const dir = tmp();
  for (const n of names) fs.writeFileSync(path.join(dir, n), gh.uploads[n]);
  assert.equal(decryptFile(path.join(dir, names[0]), backupKey(SECRET)).toString(), "SQLite format 3\0 pretend");
  const recs = readRecords(decryptFile(path.join(dir, names[1]), backupKey(SECRET)));
  assert.deepEqual(recs.map((x) => [x.path, x.data.toString()]), [["MEMORY.md", "remember this"]]);
  assert.ok(!gh.uploads[names[1]].includes(Buffer.from("remember")), "nothing readable on GitHub");
  assert.equal(gh.releases().filter((x) => x.tag_name.startsWith("atlas-backup-")).length, KEEP);
  fs.rmSync(ws, { recursive: true, force: true }); fs.rmSync(dir, { recursive: true, force: true });
});

test("off-site backup: a public repository is refused, and nothing goes up", async () => {
  const gh = fakeGitHub({ isPrivate: false });
  await assert.rejects(runOffsiteBackup({ db: fakeDb("x"), workspaceDir: tmp(), deps, fetchImpl: gh.fetchImpl, secret: SECRET }), /not a private repository/);
  assert.deepEqual(Object.keys(gh.uploads), []);
});

test("off-site backup: an empty repository gets a first commit, then the release", async () => {
  const gh = fakeGitHub({ empty: true });
  await runOffsiteBackup({ db: fakeDb("x"), workspaceDir: tmp(), deps, fetchImpl: gh.fetchImpl, secret: SECRET });
  assert.ok(gh.calls.some((c) => c.endsWith("/contents/README.md")));
  assert.equal(Object.keys(gh.uploads).length, 2);
});

test("off-site backup: not set up, or no ENCRYPTION_KEY, means nothing is sent", async () => {
  assert.equal(backupConfig({ env: {}, getKey: () => null }), null);
  await assert.rejects(runOffsiteBackup({ db: fakeDb("x"), deps: { env: {}, getKey: () => null } }), /not set up/);
  const gh = fakeGitHub();
  await assert.rejects(runOffsiteBackup({ db: fakeDb("x"), workspaceDir: tmp(), deps, fetchImpl: gh.fetchImpl, secret: "" }), /ENCRYPTION_KEY is not set/);
  assert.equal(gh.calls.length, 0, "GitHub is not even asked");
  assert.throws(() => backupConfig({ env: { GITHUB_BACKUP_REPO: "not a repo", GITHUB_BACKUP_TOKEN: "x" }, getKey: () => null }), /owner\/name/);
});

test("off-site backup: the token never appears in an error", async () => {
  const token = "ghp_" + "s".repeat(36);
  const fetchImpl = async () => new Response(JSON.stringify({ message: `Bad credentials for ${token}` }), { status: 401 });
  await assert.rejects(
    runOffsiteBackup({ db: fakeDb("x"), workspaceDir: tmp(), deps: { env: { GITHUB_BACKUP_REPO: "me/backups", GITHUB_BACKUP_TOKEN: token }, getKey: () => null }, fetchImpl, secret: SECRET }),
    (err) => !err.message.includes(token) && /401/.test(err.message),
  );
});

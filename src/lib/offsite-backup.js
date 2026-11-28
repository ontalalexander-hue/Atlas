/**
 * Off-site backup: once a day, an encrypted copy of Atlas's workspace (memory, notes, custom skills) and of its
 * database goes to a private GitHub repository, as the two files of a release. The newest KEEP releases are kept.
 *
 * Why off-site: everything else Atlas keeps (and the backups it makes for itself) sits on one Railway volume. If
 * that volume is lost, so is everything on it.
 *
 * Set up with two values, each read from the vault first and then the environment:
 *   GITHUB_BACKUP_REPO    owner/name of a PRIVATE repository (a public one is refused)
 *   GITHUB_BACKUP_TOKEN   a fine-grained token for that one repository, with Contents: read and write
 *
 * Encryption: AES-256-GCM with a key derived from ENCRYPTION_KEY (HKDF-SHA256), so the key you already keep for
 * Atlas opens the backups and nothing on GitHub is readable without it. Without ENCRYPTION_KEY nothing is uploaded.
 * Files: "ATLASBK1" + 12-byte IV + ciphertext + 16-byte tag; the plaintext is gzip. The workspace file is a
 * sequence of records, each a JSON line { path, size } followed by that many bytes. Restore with
 * scripts/restore-offsite-backup.mjs.
 *
 * Never throws out of the scheduler; every run leaves its outcome in the setting backup.offsite (shown on the
 * office's memory board).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { once } from "node:events";
import { pipeline } from "node:stream/promises";
import config from "../config/env.js";
import { getKey as vaultGet } from "./key-vault.js";
import { SettingsStore } from "../db/settings.js";
import { isSensitivePath } from "./safe-path.js";

export const MAGIC = Buffer.from("ATLASBK1");
export const KEEP = 14;
const TAG_PREFIX = "atlas-backup-";
const STATUS_SETTING = "backup.offsite";
const API = "https://api.github.com";
const UPLOADS = "https://uploads.github.com";
const FILE_MAX = 25 * 1024 * 1024;      // a single workspace file bigger than this is left out (and counted)
const TOTAL_MAX = 400 * 1024 * 1024;    // the workspace copy stops adding files past this
const SKIP_DIRS = new Set(["node_modules", ".git", ".cache", "tool-output", "tmp", ".tmp", "__pycache__"]);

// ─────────────────────────────────────────────────────────── encryption

export function backupKey(secret = config.ENCRYPTION_KEY) {
  if (!secret) throw new Error("ENCRYPTION_KEY is not set, so the backup cannot be encrypted. Nothing was uploaded.");
  return Buffer.from(crypto.hkdfSync("sha256", Buffer.from(String(secret)), Buffer.from("atlas-offsite-backup"), Buffer.from("v1"), 32));
}

/** Gzip and encrypt a readable stream into a file. */
export async function encryptStreamToFile(source, outFile, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const out = fs.createWriteStream(outFile);
  out.write(Buffer.concat([MAGIC, iv]));
  // the tag only exists once the cipher has finished, so the file is written by hand and closed after it
  await pipeline(source, zlib.createGzip({ level: 6 }), cipher, async function (chunks) {
    for await (const chunk of chunks) if (!out.write(chunk)) await once(out, 'drain');
  });
  await new Promise((resolve, reject) => { out.on('error', reject); out.end(cipher.getAuthTag(), resolve); });
}

/** Decrypt and gunzip a backup file into a buffer (restore, tests). Throws if the key is wrong or the file was changed. */
export function decryptFile(file, key) {
  const buf = fs.readFileSync(file);
  if (buf.length < MAGIC.length + 12 + 16 || !buf.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("That is not an Atlas backup file.");
  const iv = buf.subarray(MAGIC.length, MAGIC.length + 12);
  const tag = buf.subarray(buf.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(buf.subarray(MAGIC.length + 12, buf.length - 16)), decipher.final()]);
  return zlib.gunzipSync(plain);
}

/** The workspace records in a decrypted workspace backup: [{ path, data }]. */
export function readRecords(buf) {
  const out = [];
  let i = 0;
  while (i < buf.length) {
    const nl = buf.indexOf(10, i);
    if (nl < 0) throw new Error("The workspace backup is cut short.");
    const head = JSON.parse(buf.subarray(i, nl).toString("utf8"));
    const start = nl + 1, end = start + head.size;
    if (end > buf.length) throw new Error("The workspace backup is cut short.");
    out.push({ path: head.path, data: buf.subarray(start, end) });
    i = end;
  }
  return out;
}

// ─────────────────────────────────────────────────────────── what is copied

/** The workspace files to copy, relative to the workspace, with what was left out. */
export function workspaceFiles(root) {
  const files = [];
  let total = 0, skippedBig = 0, skippedCap = 0;
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full); continue; }
      if (!e.isFile() || isSensitivePath(full)) continue;
      let size = 0;
      try { size = fs.statSync(full).size; } catch { continue; }
      if (size > FILE_MAX) { skippedBig++; continue; }
      if (total + size > TOTAL_MAX) { skippedCap++; continue; }
      total += size;
      files.push({ rel: path.relative(root, full).split(path.sep).join("/"), full, size });
    }
  };
  if (root && fs.existsSync(root)) walk(root);
  return { files, total, skippedBig, skippedCap };
}

function recordStream(files) {
  return Readable.from((async function* () {
    for (const f of files) {
      let data;
      try { data = fs.readFileSync(f.full); } catch { continue; }   // gone since the walk
      yield Buffer.from(JSON.stringify({ path: f.rel, size: data.length }) + "\n");
      yield data;
    }
  })());
}

// ─────────────────────────────────────────────────────────── GitHub

function setting(name, { env = process.env, getKey = vaultGet } = {}) {
  let v = null;
  try { v = getKey(name); } catch { /* vault unreadable: try the environment */ }
  return String(v || env[name] || "").trim() || null;
}

export function backupConfig(deps) {
  const repo = setting("GITHUB_BACKUP_REPO", deps);
  const token = setting("GITHUB_BACKUP_TOKEN", deps);
  if (!repo || !token) return null;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error("GITHUB_BACKUP_REPO must look like owner/name.");
  return { repo, token };
}

function gh(token, fetchImpl) {
  const scrub = (s) => String(s).split(token).join("[token]");
  return async (method, url, { body, raw, contentType } = {}) => {
    const res = await fetchImpl(url.startsWith("http") ? url : `${API}${url}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "atlas-offsite-backup",
        ...(raw ? { "content-type": contentType || "application/octet-stream", "content-length": String(raw.length) } : body ? { "content-type": "application/json" } : {}),
      },
      body: raw ?? (body ? JSON.stringify(body) : undefined),
      signal: AbortSignal.timeout(raw ? 10 * 60_000 : 30_000),
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    if (!res.ok) {
      const err = new Error(scrub(`GitHub said ${res.status}${json?.message ? `: ${json.message}` : ""}`));
      err.status = res.status;
      throw err;
    }
    return json;
  };
}

/**
 * One backup, now. Returns what was done; throws with a plain reason when it could not be done.
 * @param {{ db: object, workspaceDir?: string, deps?: object, fetchImpl?: Function, now?: Date, tmpDir?: string }} args
 */
export async function runOffsiteBackup({ db, workspaceDir = config.WORKSPACE_DIR, deps = {}, fetchImpl = globalThis.fetch, now = new Date(), tmpDir = os.tmpdir(), secret = config.ENCRYPTION_KEY } = {}) {
  const cfg = backupConfig(deps);
  if (!cfg) throw new Error("Off-site backup is not set up: GITHUB_BACKUP_REPO and GITHUB_BACKUP_TOKEN are needed.");
  const key = backupKey(secret);
  const call = gh(cfg.token, fetchImpl);

  // the repository must exist and be private, and have a first commit for a release to point at
  const repo = await call("GET", `/repos/${cfg.repo}`);
  if (!repo?.private) throw new Error(`${cfg.repo} is not a private repository, so nothing was uploaded. Make it private first.`);
  try {
    await call("GET", `/repos/${cfg.repo}/commits?per_page=1`);
  } catch (err) {
    if (err.status !== 409) throw err;   // 409: the repository is empty
    await call("PUT", `/repos/${cfg.repo}/contents/README.md`, { body: { message: "Atlas backups live in this repository's releases", content: Buffer.from("# Atlas backups\n\nEncrypted, one release per day. Restore with scripts/restore-offsite-backup.mjs in the Atlas repository.\n").toString("base64") } });
  }

  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");   // 20261128-030000
  const work = fs.mkdtempSync(path.join(tmpDir, "atlas-backup-"));
  try {
    // workspace
    const ws = workspaceFiles(workspaceDir);
    const wsFile = path.join(work, `workspace-${stamp}.atlasbk`);
    await encryptStreamToFile(recordStream(ws.files), wsFile, key);
    // database: SQLite's own online backup, so the copy is consistent while Atlas keeps running
    const dbCopy = path.join(work, "atlas.db");
    await db.backup(dbCopy);
    const dbFile = path.join(work, `database-${stamp}.atlasbk`);
    await encryptStreamToFile(fs.createReadStream(dbCopy), dbFile, key);
    fs.rmSync(dbCopy, { force: true });

    const tag = `${TAG_PREFIX}${stamp}`;
    const release = await call("POST", `/repos/${cfg.repo}/releases`, {
      body: {
        tag_name: tag, name: `Atlas backup ${now.toISOString().slice(0, 16).replace("T", " ")} UTC`,
        body: `Encrypted with ENCRYPTION_KEY. ${ws.files.length} workspace files${ws.skippedBig || ws.skippedCap ? ` (${ws.skippedBig + ws.skippedCap} left out for size)` : ""}, and the database.`,
        draft: false, prerelease: false,
      },
    });
    const sizes = {};
    for (const file of [wsFile, dbFile]) {
      const raw = fs.readFileSync(file);
      const name = path.basename(file);
      await call("POST", `${UPLOADS}/repos/${cfg.repo}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`, { raw });
      sizes[name.startsWith("workspace") ? "workspace" : "database"] = raw.length;
    }

    // keep the newest KEEP
    const releases = (await call("GET", `/repos/${cfg.repo}/releases?per_page=100`)) || [];
    const ours = releases.filter((r) => String(r.tag_name).startsWith(TAG_PREFIX)).sort((a, b) => String(b.tag_name).localeCompare(String(a.tag_name)));
    let removed = 0;
    for (const old of ours.slice(KEEP)) {
      try {
        await call("DELETE", `/repos/${cfg.repo}/releases/${old.id}`);
        await call("DELETE", `/repos/${cfg.repo}/git/refs/tags/${encodeURIComponent(old.tag_name)}`).catch(() => {});
        removed++;
      } catch { /* one left over is not worth failing the run */ }
    }
    return { tag, files: ws.files.length, skipped: ws.skippedBig + ws.skippedCap, sizes, removed };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// ─────────────────────────────────────────────────────────── schedule and status

let _timer = null;
let _running = false;

export function offsiteStatus(db) {
  try {
    const v = new SettingsStore(db).get(STATUS_SETTING);
    const s = typeof v === "string" ? JSON.parse(v) : v;
    let configured = false;
    try { configured = !!backupConfig(); } catch { configured = true; }
    return { configured, ...(s && typeof s === "object" ? s : {}) };
  } catch {
    return { configured: false };
  }
}

/** Run one backup and record how it went. Never throws. */
export async function backupNow(db, opts = {}) {
  if (_running) return { ok: false, error: "A backup is already running." };
  _running = true;
  const startedAt = Date.now();
  const settings = new SettingsStore(db);
  const prev = offsiteStatus(db);
  try {
    const r = await runOffsiteBackup({ db, ...opts });
    const status = { ok: true, lastRunAt: startedAt, lastOkAt: Date.now(), tag: r.tag, files: r.files, skipped: r.skipped, sizes: r.sizes, error: null };
    settings.set(STATUS_SETTING, JSON.stringify(status));
    console.log(`[backup] off-site backup ${r.tag}: ${r.files} workspace files, database ${Math.round((r.sizes.database || 0) / 1024)} KB${r.removed ? `, ${r.removed} old one(s) removed` : ""}`);
    return status;
  } catch (err) {
    const status = { ok: false, lastRunAt: startedAt, lastOkAt: prev.lastOkAt ?? null, tag: prev.tag ?? null, error: String(err?.message || err).slice(0, 300) };
    try { settings.set(STATUS_SETTING, JSON.stringify(status)); } catch { /* the log line still says it */ }
    console.warn(`[backup] off-site backup failed: ${status.error}`);
    return status;
  } finally {
    _running = false;
  }
}

/** Daily: a backup when the last good one is older than about a day. Checks every 30 minutes; first look 10 minutes after boot. */
export function startOffsiteBackup({ db }) {
  const tick = () => {
    let cfg = null;
    try { cfg = backupConfig(); } catch (err) { console.warn(`[backup] ${err.message}`); return; }
    if (!cfg) return;
    const s = offsiteStatus(db);
    const lastTry = s.lastRunAt || 0;
    const lastOk = s.lastOkAt || 0;
    const now = Date.now();
    // a good copy in the last 23 hours: nothing to do; a failed try: wait 2 hours before the next
    if (now - lastOk < 23 * 3_600_000) return;
    if (!s.ok && now - lastTry < 2 * 3_600_000) return;
    backupNow(db).catch(() => {});
  };
  _timer = setInterval(tick, 30 * 60_000);
  _timer.unref?.();
  setTimeout(tick, 10 * 60_000).unref?.();
  console.log("[backup] off-site backup scheduler started (daily, to the GitHub repository in GITHUB_BACKUP_REPO)");
}

export function stopOffsiteBackup() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

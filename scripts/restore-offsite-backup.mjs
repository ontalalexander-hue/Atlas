#!/usr/bin/env node
/**
 * Open an Atlas off-site backup (src/lib/offsite-backup.js).
 *
 *   ENCRYPTION_KEY=… node scripts/restore-offsite-backup.mjs <file.atlasbk> <output>
 *
 *   database-….atlasbk   → <output> is the database file to write (e.g. restored.db)
 *   workspace-….atlasbk  → <output> is a folder; the workspace files are written into it
 *
 * Download the two files from the release on GitHub first. ENCRYPTION_KEY is the same value Atlas runs with. Nothing
 * is written outside <output>, and an existing file or a non-empty folder is never overwritten.
 */
import fs from "node:fs";
import path from "node:path";
import { backupKey, decryptFile, readRecords } from "../src/lib/offsite-backup.js";

const [file, out] = process.argv.slice(2);
if (!file || !out) {
  console.error("Usage: ENCRYPTION_KEY=… node scripts/restore-offsite-backup.mjs <file.atlasbk> <output>");
  process.exit(2);
}
if (!process.env.ENCRYPTION_KEY) {
  console.error("Set ENCRYPTION_KEY to the key Atlas runs with.");
  process.exit(2);
}
let plain;
try {
  plain = decryptFile(file, backupKey(process.env.ENCRYPTION_KEY));
} catch (err) {
  console.error(`Could not open ${file}: ${/auth|unable to authenticate/i.test(err.message) ? "wrong ENCRYPTION_KEY, or the file was changed" : err.message}`);
  process.exit(1);
}
if (path.basename(file).startsWith("database-")) {
  if (fs.existsSync(out)) { console.error(`${out} already exists; pick a new name.`); process.exit(1); }
  fs.writeFileSync(out, plain);
  console.log(`Database written to ${out} (${Math.round(plain.length / 1024)} KB).`);
} else {
  if (fs.existsSync(out) && fs.readdirSync(out).length) { console.error(`${out} is not empty; pick an empty or new folder.`); process.exit(1); }
  const root = path.resolve(out);
  let n = 0;
  for (const r of readRecords(plain)) {
    const dest = path.resolve(root, r.path);
    if (!dest.startsWith(root + path.sep)) { console.warn(`skipped ${r.path}: outside the folder`); continue; }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, r.data);
    n++;
  }
  console.log(`${n} workspace files written to ${out}.`);
}

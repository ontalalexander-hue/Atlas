/**
 * Links on the office's projectors (public/office: the conference room's and the library's).
 *
 *   checkLink(url)    is it a link a projector may open: https only, no user name or password in it, a real host,
 *                     at most 2,048 characters. A YouTube link is recognised (watch, youtu.be, shorts, live, embed)
 *                     with its start time (t=182s, t=3m2s, start=182).
 *   previewLink(url)  what the projector shows about it: a YouTube video's title (YouTube's oEmbed), or a page's
 *                     title and whether the site lets itself be shown inside another page (X-Frame-Options,
 *                     Content-Security-Policy frame-ancestors). Pages are read with guardedFetch, so a link can never
 *                     point this server at itself or its private network.
 *   requestProjector  a link Atlas asks to show (the office_projector tool): checked, then handed to the office pages
 *                     open right now, which show it only after the owner clicks Show.
 */
import { EventEmitter } from "node:events";
import { guardedFetch } from "./guarded-fetch.js";

export const PROJECTORS = Object.freeze({ meeting: "Conference room", library: "Learning library" });
const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtube-nocookie.com", "youtube-nocookie.com"]);
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const CACHE_MS = 10 * 60_000;

/** "182", "182s", "3m2s", "1h2m3s" → seconds, or 0. */
function seconds(v) {
  const s = String(v ?? "").trim();
  if (/^\d+$/.test(s)) return Number(s);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(s);
  if (!m || !s) return 0;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

/**
 * @returns {{ ok: true, url: string, youtube: { id: string, start: number } | null } | { ok: false, error: string }}
 */
export function checkLink(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, error: "Paste a link first." };
  if (text.length > 2048) return { ok: false, error: "That link is too long." };
  let u;
  try { u = new URL(text); } catch { return { ok: false, error: "That isn't a web address." }; }
  if (u.protocol !== "https:") return { ok: false, error: "Only https:// links can go on a projector." };
  if (u.username || u.password) return { ok: false, error: "A link with a user name or password in it can't go on a projector." };
  if (!u.hostname || !u.hostname.includes(".")) return { ok: false, error: "That link has no proper web address." };
  const host = u.hostname.toLowerCase();
  let youtube = null;
  if (YT_HOSTS.has(host)) {
    let id = null;
    if (host === "youtu.be") id = u.pathname.split("/")[1];
    else if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = /^\/(?:shorts|live|embed|v)\/([^/?#]+)/.exec(u.pathname);
      if (m) id = m[1];
    }
    if (id && YT_ID.test(id)) youtube = { id, start: seconds(u.searchParams.get("t") ?? u.searchParams.get("start")) };
  }
  return { ok: true, url: u.href, youtube };
}

const cache = new Map();   // url -> { at, value }

/** The page's <title>, made plain. */
function titleOf(html) {
  const m = /<title[^>]*>([\s\S]{1,400}?)<\/title>/i.exec(String(html || ""));
  if (!m) return null;
  return m[1].replace(/\s+/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").trim().slice(0, 120) || null;
}

/** Does the site let itself be shown inside another site's page? true, false, or null when it can't be told. */
export function frameable(headers = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v.join(", ") : String(v ?? "")]));
  const xfo = (h["x-frame-options"] || "").toLowerCase();
  if (/deny|sameorigin/.test(xfo)) return false;
  const csp = (h["content-security-policy"] || "").toLowerCase();
  const fa = /frame-ancestors([^;]*)/.exec(csp);
  if (fa) {
    const v = fa[1].trim();
    if (!v || v === "'none'" || v === "'self'" || !/(^|\s)(\*|https:)(\s|$)/.test(v)) return false;
  }
  return true;
}

/**
 * @returns {Promise<{ ok: true, kind: "youtube"|"page", url: string, title: string, id?: string, start?: number, frameable?: boolean|null } | { ok: false, error: string }>}
 */
export async function previewLink(raw, { fetchImpl = guardedFetch, now = Date.now } = {}) {
  const c = checkLink(raw);
  if (!c.ok) return c;
  const hit = cache.get(c.url);
  if (hit && now() - hit.at < CACHE_MS) return hit.value;
  let value;
  if (c.youtube) {
    let title = null;
    try {
      const watch = `https://www.youtube.com/watch?v=${c.youtube.id}`;
      const r = await fetchImpl(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`, { timeoutMs: 6000, maxBytes: 64 * 1024 });
      if (r.status === 200) title = String(JSON.parse(r.text)?.title || "").trim().slice(0, 120) || null;
    } catch { /* the title stays unknown */ }
    value = { ok: true, kind: "youtube", url: c.url, id: c.youtube.id, start: c.youtube.start, title: title || "YouTube video" };
  } else {
    let title = null, frame = null, url = c.url;
    try {
      const r = await fetchImpl(c.url, { timeoutMs: 8000, maxBytes: 512 * 1024, headers: { "User-Agent": "Mozilla/5.0 (Atlas Office link preview)", Accept: "text/html" } });
      if (r.status < 400) {
        title = titleOf(r.text);
        frame = frameable(r.headers);
        if (r.url && checkLink(r.url).ok) url = checkLink(r.url).url;
      }
    } catch { /* unknown: the panel offers the new tab either way */ }
    value = { ok: true, kind: "page", url, title: title || new URL(url).hostname.replace(/^www\./, ""), frameable: frame };
  }
  cache.set(c.url, { at: now(), value });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return value;
}

// ── Atlas asking to put a link on a projector ────────────────────────────────────────────────────────────────────
export const projectorRequests = new EventEmitter();
projectorRequests.setMaxListeners(50);

/**
 * Ask the open office pages to show a link on a projector. They show a "Show / Ignore" choice; nothing goes on the
 * screen until the owner clicks Show. Returns a plain-English result.
 */
export async function requestProjector({ projector = "meeting", url, by = "Atlas" } = {}, { preview = previewLink } = {}) {
  const id = String(projector || "meeting").toLowerCase();
  if (!PROJECTORS[id]) return `office_projector: there is no projector "${projector}". Use "meeting" (the conference room) or "library".`;
  const p = await preview(url);
  if (!p.ok) return `office_projector: ${p.error} Nothing was put on the projector.`;
  const listeners = projectorRequests.listenerCount("request");
  projectorRequests.emit("request", { id, by: String(by).slice(0, 30), link: p, at: Date.now() });
  if (!listeners) return `Nobody has the office open right now, so nothing was shown. When the owner opens the office they can paste the link at the ${PROJECTORS[id]} projector: ${p.url}`;
  return `Asked to show "${p.title}" on the ${PROJECTORS[id]} projector. It appears once the owner clicks Show in the office.`;
}

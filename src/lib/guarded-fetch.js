/**
 * An HTTP request that cannot be pointed at this server or its private network (server-side request forgery).
 *
 * The old check looked only at the address as typed: a name that resolves to 127.0.0.1 or to the cloud metadata
 * address (169.254.169.254), a redirect to one, or an IP written another way all got through. Here every host is
 * checked when the connection is made, on what it actually resolves to (pdf-text.js guardedLookup), and every
 * redirect is followed by hand and checked the same way.
 *
 * What remains: the agent also has a shell, which this does not limit; this is for the web_fetch tool.
 */
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { guardedLookup, isPrivateAddress } from "./pdf-text.js";

export const FETCH_MAX_BYTES = 5 * 1024 * 1024;

/**
 * @param {string} url
 * @param {{ method?: string, headers?: object, body?: string, timeoutMs?: number, maxBytes?: number, maxRedirects?: number, lookup?: Function }} [opts]
 * @returns {Promise<{ status: number, headers: object, text: string, url: string, truncated: boolean }>}
 */
export async function guardedFetch(url, { method = "GET", headers = {}, body, timeoutMs = 30_000, maxBytes = FETCH_MAX_BYTES, maxRedirects = 5, lookup = guardedLookup } = {}) {
  let current = url;
  let verb = String(method || "GET").toUpperCase();
  let payload = body;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    let u;
    try { u = new URL(current); } catch { throw new Error("that isn't a web address"); }
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("only http and https addresses can be fetched");
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) && isPrivateAddress(host)) throw new Error(`that address is on a private or local network (${host}), which this tool doesn't fetch from`);
    const res = await request(u, { method: verb, headers, body: payload, timeoutMs, maxBytes, lookup });
    if (res.redirect) {
      current = new URL(res.redirect, u).toString();
      // 301/302/303 turn into a GET without a body, the way browsers do; 307/308 keep the request as it was
      if (![307, 308].includes(res.status)) { verb = "GET"; payload = undefined; }
      continue;
    }
    return { ...res, url: current };
  }
  throw new Error("the address redirected too many times");
}

function request(u, { method, headers, body, timeoutMs, maxBytes, lookup }) {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === "https:" ? https : http;
    const h = { "user-agent": "Atlas", ...lowerKeys(headers), "accept-encoding": "identity" };
    if (body != null && h["content-length"] == null) h["content-length"] = Buffer.byteLength(String(body));
    const req = mod.request(u, { method, headers: h, lookup, agent: false, timeout: timeoutMs }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) { res.resume(); resolve({ status, redirect: res.headers.location }); return; }
      const chunks = [];
      let size = 0, truncated = false;
      res.on("data", (c) => {
        if (truncated) return;
        size += c.length;
        if (size > maxBytes) { truncated = true; chunks.push(c.subarray(0, c.length - (size - maxBytes))); res.destroy(); finish(); return; }
        chunks.push(c);
      });
      let done = false;
      const finish = () => { if (done) return; done = true; resolve({ status, headers: res.headers, text: Buffer.concat(chunks).toString("utf8"), truncated }); };
      res.on("end", finish);
      res.on("close", finish);
      res.on("error", (err) => { if (!truncated) reject(err); });
    });
    req.on("timeout", () => req.destroy(new Error("the request took too long")));
    req.on("error", reject);
    if (body != null) req.write(String(body));
    req.end();
  });
}

function lowerKeys(o) {
  const out = {};
  for (const [k, v] of Object.entries(o && typeof o === "object" ? o : {})) if (v != null) out[String(k).toLowerCase()] = String(v);
  return out;
}

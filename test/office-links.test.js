import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLink, frameable, previewLink, requestProjector, projectorRequests } from "../src/lib/office-links.js";

test("projector links: https only, no passwords in them, YouTube recognised with its start time", () => {
  assert.equal(checkLink("http://example.com").ok, false);
  assert.equal(checkLink("javascript:alert(1)").ok, false);
  assert.equal(checkLink("https://user:pw@example.com").ok, false);
  assert.equal(checkLink("https://localhost/x").ok, false);
  assert.equal(checkLink("").ok, false);
  assert.equal(checkLink(`https://example.com/${"a".repeat(2100)}`).ok, false);
  assert.deepEqual(checkLink("https://www.youtube.com/watch?v=aWb8XGNbeW4&t=182s").youtube, { id: "aWb8XGNbeW4", start: 182 });
  assert.deepEqual(checkLink("https://youtu.be/aWb8XGNbeW4?t=3m2s").youtube, { id: "aWb8XGNbeW4", start: 182 });
  assert.deepEqual(checkLink("https://www.youtube.com/shorts/aWb8XGNbeW4").youtube, { id: "aWb8XGNbeW4", start: 0 });
  assert.equal(checkLink("https://www.youtube.com/watch?v=short").youtube, null);
  assert.equal(checkLink("https://example.com/page").youtube, null);
});

test("projector links: whether a site lets itself be shown inside another page", () => {
  assert.equal(frameable({}), true);
  assert.equal(frameable({ "X-Frame-Options": "SAMEORIGIN" }), false);
  assert.equal(frameable({ "content-security-policy": "default-src 'self'; frame-ancestors 'none'" }), false);
  assert.equal(frameable({ "content-security-policy": "frame-ancestors https:" }), true);
  assert.equal(frameable({ "content-security-policy": "frame-ancestors https://partner.example" }), false);
});

test("projector links: a YouTube title from oEmbed, a page's title, and a link that can't be read", async () => {
  const fetchImpl = async (url) => {
    if (url.startsWith("https://www.youtube.com/oembed")) return { status: 200, headers: {}, text: JSON.stringify({ title: "Complete Trading Guide" }), url };
    if (url === "https://example.org/a") return { status: 200, headers: { "x-frame-options": "DENY" }, text: "<html><title> Example &amp; Co </title></html>", url };
    throw new Error("blocked");
  };
  const yt = await previewLink("https://www.youtube.com/watch?v=aWb8XGNbeW4&t=182s", { fetchImpl });
  assert.deepEqual([yt.kind, yt.id, yt.start, yt.title], ["youtube", "aWb8XGNbeW4", 182, "Complete Trading Guide"]);
  const page = await previewLink("https://example.org/a", { fetchImpl });
  assert.deepEqual([page.kind, page.title, page.frameable], ["page", "Example & Co", false]);
  const dark = await previewLink("https://unreachable.example.net/", { fetchImpl });
  assert.deepEqual([dark.ok, dark.title, dark.frameable], [true, "unreachable.example.net", null]);
  assert.equal((await previewLink("ftp://x.example", { fetchImpl })).ok, false);
});

test("projector links: Atlas's request goes to the open office pages, and a bad one goes nowhere", async () => {
  const preview = async (url) => (url.startsWith("https://") ? { ok: true, kind: "page", url, title: "A page", frameable: true } : { ok: false, error: "Only https:// links can go on a projector." });
  const got = [];
  const on = (r) => got.push(r);
  assert.match(await requestProjector({ projector: "meeting", url: "https://example.org" }, { preview }), /Nobody has the office open/);
  projectorRequests.on("request", on);
  try {
    assert.match(await requestProjector({ projector: "library", url: "https://example.org" }, { preview }), /once the owner clicks Show/);
    assert.equal(got.length, 1);
    assert.equal(got[0].id, "library");
    assert.match(await requestProjector({ projector: "roof", url: "https://example.org" }, { preview }), /no projector/);
    assert.match(await requestProjector({ url: "http://example.org" }, { preview }), /Nothing was put/);
    assert.equal(got.length, 1);
  } finally {
    projectorRequests.off("request", on);
  }
});

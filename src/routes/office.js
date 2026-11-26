/**
 * The office view's feed (public/office): who is on the team, and what Atlas and its helpers are doing right now.
 *
 * Mounted at /api/office behind requireAuth, like every other /api route. The page itself is a static file; what it
 * shows comes from here, so someone who is not signed in gets an empty office and a 401.
 *
 *   GET /api/office/team    { team, project }
 *   GET /api/office/events  server-sent events, one hook-shaped event per line (lib/office-events.js)
 */
import { Router } from "express";
import { onEvent, activeTurnList } from "../lib/live-bus.js";
import { getAgents } from "../lib/agent-registry.js";
import { createOfficeTranslator, officeTeam } from "../lib/office-events.js";

export const officeRouter = Router();

const PROJECT = "Atlas";
const PING_MS = 15_000;

officeRouter.get("/team", (_req, res) => {
  res.json({ team: officeTeam(getAgents()), project: PROJECT });
});

officeRouter.get("/events", (req, res) => {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  const send = (ev) => { try { res.write(`data: ${JSON.stringify(ev)}\n\n`); } catch { /* the page went away */ } };

  send({ hook: "Snapshot", project: PROJECT, team: officeTeam(getAgents()), services: [], logs: [] });
  // A turn already under way when the page opens: Atlas is at its desk, not idle.
  if (activeTurnList().length) send({ hook: "UserPromptSubmit", prompt: "" });

  const translator = createOfficeTranslator();
  const off = onEvent((evt) => {
    let out = [];
    try { out = translator.translate(evt); } catch (err) { console.warn(`[office] ${err?.message || err}`); }
    for (const ev of out) send(ev);
  });
  const ping = setInterval(() => { try { res.write(": ping\n\n"); } catch { /* closed */ } }, PING_MS);
  ping.unref?.();
  req.on("close", () => { clearInterval(ping); off(); });
});

/**
 * The office view's events (public/office, adapted from Agent Office 3D).
 *
 * The page was written for Claude Code's hooks: it expects events shaped like { hook: "PreToolUse", tool, input,
 * agent_type, ... }. Atlas has no hook scripts; it has the live bus (lib/live-bus.js), which every turn of every
 * channel already writes to. This turns one bus event into the hook events the page understands.
 *
 * Who did it: "manager" is the main agent (Atlas itself); anyone else is one of the team it delegated to
 * (lib/agent-registry.js), named by the Agent tool call's subagent_type.
 */
import { redactSecrets } from "./redact.js";

const MANAGER = "manager";
const FAILED = new Set(["error", "auth-expired", "max_turns", "budget", "failed"]);
const SPAWN = "Agent";

const clip = (v, n) => {
  const s = redactSecrets(String(v ?? "").replace(/\s+/g, " ").trim());
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};

/** The one field of a tool's input the page shows, rebuilt from the step's summary. */
function inputFor(rawName, summary) {
  const s = clip(summary, 200);
  if (!s) return {};
  const n = String(rawName || "");
  if (n === "Bash") return { command: s };
  if (n === "Read" || n === "Write" || n === "Edit" || n === "NotebookEdit") return { file_path: s };
  if (n === "Grep" || n === "Glob") return { pattern: s };
  if (/fetch|browser/i.test(n)) return { url: s };
  return { query: s };
}

/** The team as the page wants it: one room each. */
export function officeTeam(agents = []) {
  const KIND = { coder: "backend", researcher: "data", writer: "docs" };
  return (Array.isArray(agents) ? agents : [])
    .filter((a) => a && a.id && !a.isOrchestrator)
    .map((a) => ({
      id: String(a.id),
      name: clip(a.name || a.id, 30),
      kind: KIND[a.id] || "generic",
      ...(/^#[0-9a-f]{6}$/i.test(a.color || "") ? { color: a.color } : {}),
    }));
}

/**
 * A translator with the little it has to remember: which Agent calls are open in each turn, so a turn that ends
 * early sends its helpers back to the lounge.
 *
 * @returns {{ translate(evt: object): object[] }}
 */
export function createOfficeTranslator() {
  /** turnId -> Map(toolUseId -> subagent) */
  const open = new Map();
  const key = (evt) => evt.turnId || evt.conversationId || "?";

  function translate(evt) {
    if (!evt || typeof evt !== "object") return [];
    const p = evt.payload || {};
    const session_id = String(evt.conversationId || "");

    if (evt.type === "turn_start") {
      return [{ hook: "UserPromptSubmit", prompt: clip(p.prompt, 200), session_id, source: p.source }];
    }

    if (evt.type === "turn_end") {
      const out = [];
      const mine = open.get(key(evt));
      if (mine) {
        for (const id of mine.keys()) out.push({ hook: "PostToolUse", tool: SPAWN, tool_use_id: id, agent_type: MANAGER, session_id });
        open.delete(key(evt));
      }
      if (p.error || FAILED.has(p.stopReason)) {
        out.push({ hook: "StopFailure", error: clip(p.error || p.stopReason, 300), severity: "major", session_id });
      } else {
        out.push({ hook: "Stop", session_id });
      }
      return out;
    }

    if (evt.type !== "step") return [];

    if (p.kind === "tool_start") {
      if (p.subagent) {
        if (!open.has(key(evt))) open.set(key(evt), new Map());
        open.get(key(evt)).set(p.id, p.subagent);
        return [{
          hook: "PreToolUse", tool: SPAWN, tool_use_id: p.id, agent_type: MANAGER, session_id,
          input: { subagent_type: p.subagent, description: clip(p.summary, 200) },
        }];
      }
      return [{ hook: "PreToolUse", tool: p.name, tool_use_id: p.id, agent_type: MANAGER, session_id, input: inputFor(p.rawName || p.name, p.summary) }];
    }

    if (p.kind === "tool_end") {
      const mine = open.get(key(evt));
      const spawned = mine?.has(p.id);
      if (spawned) mine.delete(p.id);
      const tool = spawned ? SPAWN : undefined;
      if (p.ok === false) {
        return [{ hook: "PostToolUseFailure", tool: tool || "Tool", tool_use_id: p.id, agent_type: MANAGER, session_id, error: clip(p.preview, 300), severity: "moderate" }];
      }
      return spawned ? [{ hook: "PostToolUse", tool, tool_use_id: p.id, agent_type: MANAGER, session_id }] : [];
    }

    if (p.kind === "sub_tool_start") {
      const agent_type = String(p.agent || "general-purpose");
      return [{ hook: "PreToolUse", tool: p.name, tool_use_id: p.id, agent_type, session_id, input: inputFor(p.rawName || p.name, p.summary) }];
    }

    if (p.kind === "sub_tool_end" && p.ok === false) {
      return [{ hook: "PostToolUseFailure", tool: "Tool", tool_use_id: p.id, agent_type: String(p.agent || "general-purpose"), session_id, error: clip(p.preview, 300), severity: "moderate" }];
    }

    return [];
  }

  return { translate };
}

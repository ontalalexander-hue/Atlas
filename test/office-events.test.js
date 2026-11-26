import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createOfficeTranslator, officeTeam } from "../src/lib/office-events.js";
import { sdkAgents } from "../src/lib/agent-registry.js";
import { stepsFromSdkMessage, subagentSteps } from "../src/lib/tool-steps.js";

const step = (payload, turnId = "t1") => ({ type: "step", conversationId: "c1", turnId, payload });

describe("the office view's events (lib/office-events.js)", () => {
  it("a turn: the request, Atlas's own tool, the answer", () => {
    const t = createOfficeTranslator();
    assert.deepEqual(t.translate({ type: "turn_start", conversationId: "c1", turnId: "t1", payload: { prompt: "  check   the logs ", source: "web" } }),
      [{ hook: "UserPromptSubmit", prompt: "check the logs", session_id: "c1", source: "web" }]);
    const [pre] = t.translate(step({ kind: "tool_start", id: "a", name: "Bash", rawName: "Bash", summary: "ls -la" }));
    assert.equal(pre.hook, "PreToolUse");
    assert.equal(pre.agent_type, "manager");
    assert.deepEqual(pre.input, { command: "ls -la" });
    assert.deepEqual(t.translate(step({ kind: "tool_end", id: "a", ok: true })), [], "a tool that worked says nothing more");
    assert.deepEqual(t.translate({ type: "turn_end", conversationId: "c1", turnId: "t1", payload: { stopReason: "end_turn" } }), [{ hook: "Stop", session_id: "c1" }]);
  });

  it("delegating: the helper is named, its own tools are its own, and it goes home when the Agent call ends", () => {
    const t = createOfficeTranslator();
    const [spawn] = t.translate(step({ kind: "tool_start", id: "s1", name: "Agent", rawName: "Agent", summary: "Find the report", subagent: "researcher" }));
    assert.equal(spawn.tool, "Agent");
    assert.deepEqual(spawn.input, { subagent_type: "researcher", description: "Find the report" });
    const [sub] = t.translate(step({ kind: "sub_tool_start", id: "x", name: "Read", rawName: "Read", summary: "/data/report.md", agent: "researcher" }));
    assert.equal(sub.agent_type, "researcher");
    assert.deepEqual(sub.input, { file_path: "/data/report.md" });
    const [bad] = t.translate(step({ kind: "sub_tool_end", id: "x", ok: false, preview: "ENOENT", agent: "researcher" }));
    assert.equal(bad.hook, "PostToolUseFailure");
    assert.equal(bad.agent_type, "researcher");
    assert.deepEqual(t.translate(step({ kind: "tool_end", id: "s1", ok: true })).map((e) => [e.hook, e.tool, e.tool_use_id]), [["PostToolUse", "Agent", "s1"]]);
  });

  it("a turn that ends with a helper still out sends it home, and a failed turn says so", () => {
    const t = createOfficeTranslator();
    t.translate(step({ kind: "tool_start", id: "s1", name: "Agent", rawName: "Agent", summary: "x", subagent: "writer" }));
    const out = t.translate({ type: "turn_end", conversationId: "c1", turnId: "t1", payload: { stopReason: "error", error: "boom" } });
    assert.deepEqual(out.map((e) => e.hook), ["PostToolUse", "StopFailure"]);
    assert.equal(out[1].error, "boom");
    assert.deepEqual(t.translate({ type: "turn_end", conversationId: "c1", turnId: "t1", payload: {} }).map((e) => e.hook), ["Stop"], "nothing left open");
  });

  it("steps the office has no use for, and anything malformed, give nothing", () => {
    const t = createOfficeTranslator();
    for (const p of [{ kind: "usage" }, { kind: "text", text: "hi" }, { kind: "thinking", text: "x" }, { kind: "route" }]) assert.deepEqual(t.translate(step(p)), []);
    assert.deepEqual(t.translate(null), []);
    assert.deepEqual(t.translate({ type: "message", payload: { role: "user" } }), []);
  });

  it("long text is cut and a secret never reaches the page", () => {
    const t = createOfficeTranslator();
    const [e] = t.translate({ type: "turn_start", conversationId: "c", turnId: "t", payload: { prompt: "x".repeat(900) } });
    assert.ok(e.prompt.length <= 200);
  });

  it("the team: one room each, only a real color", () => {
    assert.deepEqual(officeTeam([{ id: "coder", name: "Coder", color: "#4caf50" }, { id: "finance", name: "Finance", color: "red" }, { id: "boss", isOrchestrator: true }, null]),
      [{ id: "coder", name: "Coder", kind: "backend", color: "#4caf50" }, { id: "finance", name: "Finance", kind: "generic" }]);
  });
});

describe("the team Atlas can delegate to (lib/agent-registry.js)", () => {
  it("the defaults, Finance among them, as the SDK's agents option", () => {
    const a = sdkAgents();
    assert.deepEqual(Object.keys(a), ["coder", "researcher", "writer", "quick", "finance"]);
    for (const [id, d] of Object.entries(a)) {
      assert.ok(d.description && d.prompt, id);
      assert.ok(Array.isArray(d.tools) && d.tools.length, id);
    }
    assert.deepEqual(a.finance.tools, ["Read", "Glob", "Grep"], "Finance reads, it does not write or run commands");
    assert.match(a.finance.prompt, /Never invent/);
  });

  it("an unusable or offline definition is left out", () => {
    assert.deepEqual(Object.keys(sdkAgents([{ id: "Bad Id", prompt: "x" }, { id: "ok", prompt: "x" }, { id: "off", prompt: "x", status: "offline" }, { id: "noprompt" }])), ["ok"]);
  });
});

describe("a subagent's steps (lib/tool-steps.js)", () => {
  it("the Agent call says who it went to; the subagent's tools come as their own kind", () => {
    const [s] = stepsFromSdkMessage({ type: "assistant", message: { content: [{ type: "tool_use", id: "s1", name: "Agent", input: { subagent_type: "researcher", description: "Look it up" } }] } });
    assert.equal(s.kind, "tool_start");
    assert.equal(s.subagent, "researcher");
    const sub = subagentSteps({ type: "assistant", parent_tool_use_id: "s1", message: { content: [{ type: "text", text: "thinking aloud" }, { type: "tool_use", id: "x", name: "Read", input: { file_path: "/a" } }] } }, "researcher");
    assert.deepEqual(sub.map((x) => [x.kind, x.agent, x.name]), [["sub_tool_start", "researcher", "Read"]], "its text is not a step");
    const end = subagentSteps({ type: "user", parent_tool_use_id: "s1", message: { content: [{ type: "tool_result", tool_use_id: "x", is_error: true, content: "nope" }] } }, "researcher");
    assert.deepEqual(end.map((x) => [x.kind, x.ok, x.agent]), [["sub_tool_end", false, "researcher"]]);
  });
});

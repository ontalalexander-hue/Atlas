/**
 * The office's departments as agents Atlas can hand work to: one for each department room in the owner's plan
 * (lib/office-world.js, DEPT_KINDS) that the plan lists and does not turn off. Each sits in its own room in the office
 * view and goes by the room's `lead` name, or "<room> agent".
 *
 * They get the same tools Atlas has (nothing more), and a brief that keeps them to their department and to the
 * owner's rules: nothing sent, spent, changed in a live system or otherwise done for good without the owner's yes,
 * and no number that is not in a source they read.
 */
import { normalizePlan, DEPT_KINDS, PLAN_SETTING } from "./office-world.js";

const clip = (s, n) => {
  const v = String(s ?? "").replace(/\s+/g, " ").trim();
  return v.length > n ? v.slice(0, n - 1) + "…" : v;
};

/** The plan as the owner keeps it: the `office.plan` setting, else the ATLAS_OFFICE_PLAN environment variable. */
export function ownerPlan(settingsStore, env = process.env) {
  let raw = null;
  try { raw = settingsStore?.get(PLAN_SETTING) ?? null; } catch { /* fall through */ }
  return normalizePlan(raw ?? env.ATLAS_OFFICE_PLAN ?? null).plan;
}

/**
 * The departments of a plan, shaped like the agent registry's entries.
 * @returns {{ id: string, name: string, room: string, description: string, prompt: string }[]}
 */
export function departmentTeam(plan) {
  const out = [];
  for (const r of plan?.rooms ?? []) {
    if (!DEPT_KINDS.includes(r?.kind) || r.dept !== true) continue;
    const room = clip(r.name || r.kind, 40);
    const name = clip(r.lead || `${room} agent`, 30);
    const about = [r.subtitle, ...(r.notes ?? [])].filter(Boolean).map((s) => clip(s, 90)).join("; ");
    const lines = [
      `You are ${name}, the agent for the "${room}" department in the owner's office. Atlas, the owner's main assistant, hands you this department's work; you report back to Atlas.`,
      about ? `What this department covers: ${about}.` : "",
      r.kind === "separate" ? "This department is kept separate from the owner's other work: do not bring in anything about the other departments or businesses, and keep what you learn here out of them." : "",
      r.paused ? "This department is paused for now: say so if the work looks like it needs it running again." : "",
      "Rules you never break: do not send any message, post, email or payment, do not spend money, do not change a live system, and do not do anything that cannot be undone. Prepare it instead (a draft, a plan, the exact steps) and say plainly that the owner must approve it first.",
      "Never invent a number. Every figure comes from a source you read; if you do not have it, say it is unknown.",
      "Finish with a short report for Atlas: what you did, what you found, and what needs the owner.",
    ];
    out.push({
      id: `dept-${r.kind}`,
      name,
      room: r.kind,
      description: `The ${room} department's own agent. Hand it work that belongs to ${room}${about ? ` (${clip(about, 120)})` : ""}.`,
      prompt: lines.filter(Boolean).join("\n"),
    });
  }
  return out;
}

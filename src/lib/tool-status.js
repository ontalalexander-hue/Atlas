/**
 * Human-readable, leak-safe status labels for tool_use events. The Telegram, Discord and Slack channels show them
 * while a tool runs ("Running command…", "Sending report.pdf…") and when it ends ("Command done", "Sent report.pdf").
 *
 * Never returns command bodies, env values, key names or values, full URLs, or query strings: the bot UX stays safe
 * by construction even if the user disabled the webapp's secret-redaction toggle.
 *
 * Claude Code names a tool from an MCP server mcp__<server>__<tool>, so Atlas's own tools arrive as
 * mcp__atlas__atlas_send_file and so on: they get words of their own, and any other server's tool shows by its own
 * name without the prefix.
 */

/** The file name at the end of a path, either slash. */
const fileBase = (p) => String(p || "").split(/[\\/]/).pop() || "file";
/** A PDF's file name, from a path or a web address (never its query string or fragment, which can hold a token). */
const pdfBase = (i) => fileBase(String(i?.path || i?.source || "").split(/[?#]/)[0]);

/** mcp__atlas__atlas_send_file → atlas_send_file; a built-in tool's name stays as it is. */
const bareName = (name) => String(name || "tool").replace(/^mcp__[^_]+(?:_[^_]+)*?__/, "");

// Atlas's own tools: [while it runs, when it is done, when it failed]. A function gets the tool's input.
const ATLAS = {
  atlas_send_file: [(i) => `Sending ${fileBase(i.file_path)}…`, (i) => `Sent ${fileBase(i.file_path)}`, (i) => `Sending ${fileBase(i.file_path)} failed`],
  atlas_send_message: ["Sending a message…", "Message sent", "Sending the message failed"],
  atlas_send_email_thread: ["Sending an email…", "Email sent", "Sending the email failed"],
  atlas_configure_email_channel: ["Setting up email…", "Email set up", "Setting up email failed"],
  atlas_push_notification: ["Sending a notification…", "Notification sent", "Sending the notification failed"],
  atlas_web_search: ["Web searching…", "Web search done", "Web search failed"],
  atlas_web_fetch: ["Fetching URL…", "Fetch done", "Fetch failed"],
  atlas_browser: ["Using the browser…", "Browser done", "Browser failed"],
  atlas_remember: ["Saving a memory…", "Memory saved", "Saving the memory failed"],
  atlas_search_memories: ["Searching memories…", "Memory search done", "Memory search failed"],
  atlas_search_memories_deep: ["Searching memories…", "Memory search done", "Memory search failed"],
  atlas_daily_log: ["Writing the daily log…", "Daily log written", "Writing the daily log failed"],
  atlas_read_file: [(i) => `Reading ${fileBase(i.filename)}…`, (i) => `Read ${fileBase(i.filename)}`, (i) => `Reading ${fileBase(i.filename)} failed`],
  atlas_pdf_read: [(i) => `Reading ${pdfBase(i)}…`, (i) => `Read ${pdfBase(i)}`, (i) => `Reading ${pdfBase(i)} failed`],
  atlas_write_file: [(i) => `Writing ${fileBase(i.filename)}…`, (i) => `Wrote ${fileBase(i.filename)}`, (i) => `Writing ${fileBase(i.filename)} failed`],
  atlas_list_files: ["Listing files…", "Files listed", "Listing files failed"],
  // A task the AI schedules is saved paused, until the owner switches it on (lib/cron.js). The saved words only when
  // the tool's result has no error mark: ai/atlas-mcp.js marks every answer where no task was saved (a refusal, a
  // bad schedule, the 15-minute rule), and those say so plainly.
  atlas_schedule_task: ["Scheduling a task…", "Task saved, waiting for your OK", "Task not saved"],
  atlas_create_canvas: ["Making a canvas…", "Canvas made", "Making the canvas failed"],
  atlas_create_diagram: ["Drawing a diagram…", "Diagram drawn", "Drawing the diagram failed"],
  atlas_datetime: ["Checking the time…", "Time checked", "Checking the time failed"],
  atlas_calculator: ["Calculating…", "Calculated", "Calculation failed"],
  atlas_discord_admin: ["Working on Discord…", "Discord done", "Discord failed"],
  atlas_office_projector: ["Asking for the projector…", "Projector asked", "Projector failed"],
  atlas_railway: ["Working on Railway…", "Railway done", "Railway failed"],
  // The vault: never a key's name, let alone its value.
  atlas_get_key: ["Checking the vault…", "Vault checked", "Vault check failed"],
  atlas_list_keys: ["Checking the vault…", "Vault checked", "Vault check failed"],
  atlas_set_key: ["Saving a key…", "Key saved", "Saving the key failed"],
  atlas_delete_key: ["Removing a key…", "Key removed", "Removing the key failed"],
};

const atlasLabel = (name, input, which) => {
  const entry = ATLAS[bareName(name)];
  if (!entry) return null;
  const label = entry[which];
  return typeof label === "function" ? label(input || {}) : label;
};

/** A readable name for a tool nothing above knows: mcp__github__list_pull_requests → "list pull requests". */
const otherName = (name) => (String(name || "").startsWith("mcp__") ? bareName(name).replace(/_/g, " ") : name);

export function toolStatusLabel(name, input = {}) {
  const own = atlasLabel(name, input, 0);
  if (own) return own;
  switch (name) {
    case "Bash":      return "Running command…";
    case "Read":      return `Reading ${fileBase(input.file_path)}…`;
    case "Write":     return `Writing ${fileBase(input.file_path)}…`;
    case "Edit":      return `Editing ${fileBase(input.file_path)}…`;
    case "Glob":      return "Searching files…";
    case "Grep":      return "Searching code…";
    case "WebFetch":  return "Fetching URL…";
    case "WebSearch": return "Web searching…";
    case "TodoWrite": return "Updating todo list…";
    default:          return `Running ${otherName(name)}…`;
  }
}

/**
 * Variant for the post-completion "done" / "failed" line. Pass the
 * original input so file-based tools (Read/Write/Edit) keep their
 * filename context.
 */
export function toolDoneLabel(name, input = {}, isError = false) {
  const own = atlasLabel(name, input, isError ? 2 : 1);
  if (own) return own;
  const verb = isError ? "failed" : "done";
  switch (name) {
    case "Bash":      return `Command ${verb}`;
    case "Read":      return `Read ${fileBase(input.file_path)}`;
    case "Write":     return `Wrote ${fileBase(input.file_path)}`;
    case "Edit":      return `Edited ${fileBase(input.file_path)}`;
    case "Glob":      return `File search ${verb}`;
    case "Grep":      return `Code search ${verb}`;
    case "WebFetch":  return `Fetch ${verb}`;
    case "WebSearch": return `Web search ${verb}`;
    case "TodoWrite": return "Todos updated";
    default:          return `${otherName(name)} ${verb}`;
  }
}

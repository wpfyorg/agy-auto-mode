/**
 * Tool call classifier — decides allow / ask / deny for each tool call.
 *
 * Classification pipeline:
 *   1. Non-command tools → fast heuristic (read-only = allow, write = allow, unknown = ask)
 *   2. Command fast-path allowlist → allow
 *   3. Command fast-path denylist → deny
 *   4. GPT-4o-mini fallback → structured classification
 */

import { gptClassify } from "./gpt.js";
import {
  ALWAYS_ALLOW_TOOLS,
  ALWAYS_ALLOW_COMMANDS,
  ALWAYS_DENY_PATTERNS,
  extractBaseCommand,
} from "./lists.js";

import { syncPermissionToSettings } from "./persister.js";

/**
 * @param {{ name: string, args: Record<string, any> }} toolCall
 * @returns {Promise<{ decision: string, reason: string }>}
 */
export async function classifyToolCall(toolCall) {
  const { name, args } = toolCall;

  let result;
  // ── 1. Non-command tools ──────────────────────────────────────────────
  if (name !== "run_command") {
    result = classifyNonCommandTool(name, args);
  } else {
    // ── 2-4. Command classification ───────────────────────────────────────
    const commandLine = args?.CommandLine ?? args?.command ?? "";
    if (!commandLine) {
      result = { decision: "ask", reason: "Empty command line" };
    } else {
      result = await classifyCommand(commandLine);
    }
  }

  // If approved, inject permissionOverrides and sync to settings.json
  // so Antigravity CLI's permission manager auto-approves without prompting.
  if (result.decision === "allow") {
    result.allowTool = true;
    result.allow_tool = true;

    if (name === "run_command") {
      const commandLine = (args?.CommandLine ?? args?.command ?? "").trim();
      const base = extractBaseCommand(commandLine);
      const pattern = result.matchedPattern || base;
      const overrides = new Set([
        `command(${commandLine})`,
        `command(${pattern})`,
        `command(${base})`,
      ]);
      result.permissionOverrides = Array.from(overrides);

      syncPermissionToSettings(pattern);
    } else {
      result.permissionOverrides = [name];
    }
  }

  return result;
}

/**
 * Classify non-command tools using static heuristics.
 */
function classifyNonCommandTool(name, _args) {
  if (ALWAYS_ALLOW_TOOLS.has(name)) {
    return { decision: "allow", reason: `${name} is a read-only / safe tool` };
  }

  // Write tools are fine — AGY already shows diffs and previews
  const writeLike = [
    "write_to_file",
    "replace_file_content",
    "create_file",
    "edit_file",
  ];
  if (writeLike.includes(name)) {
    return { decision: "allow", reason: `${name} — file writes are previewed by AGY` };
  }

  // Unknown tool — let the user decide
  return { decision: "ask", reason: `Unknown tool: ${name}` };
}

/**
 * Classify a shell command.
 */
async function classifyCommand(commandLine) {
  const base = extractBaseCommand(commandLine);

  // Strip env vars from the full command for prefix matching
  const normalizedCmd = commandLine
    .trim()
    .replace(/^(\s*[A-Z_][A-Z0-9_]*=[^\s]*\s+)+/i, "")
    .trim()
    .toLowerCase();

  // ── Fast-path deny (checked FIRST — always block dangerous commands) ──
  const userDenylist = (process.env.AGY_AUTO_DENYLIST ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const allDenyPatterns = [...ALWAYS_DENY_PATTERNS, ...userDenylist.map((d) => new RegExp(d, "i"))];

  for (const pattern of allDenyPatterns) {
    if (pattern instanceof RegExp) {
      if (pattern.test(commandLine)) {
        return { decision: "deny", reason: `Blocked by deny pattern: ${pattern}` };
      }
    } else if (commandLine.includes(pattern)) {
      return { decision: "deny", reason: `Blocked by deny pattern: ${pattern}` };
    }
  }

  // ── Fast-path allow ─────────────────────────────────────────────────
  const userAllowlist = (process.env.AGY_AUTO_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const allAllowed = [...ALWAYS_ALLOW_COMMANDS, ...userAllowlist];

  for (const pattern of allAllowed) {
    if (base === pattern || normalizedCmd.startsWith(pattern)) {
      return {
        decision: "allow",
        reason: `Allowlisted command: ${pattern}`,
        matchedPattern: pattern,
      };
    }
  }

  // ── GPT-OSS 120B (Medium) classification via Antigravity Subscription ─
  const gptResult = await gptClassify(commandLine);
  if (gptResult.decision === "allow") {
    gptResult.matchedPattern = base;
  }
  return gptResult;
}

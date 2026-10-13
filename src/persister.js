/**
 * Settings persister — dynamically syncs approved commands to
 * ~/.gemini/antigravity-cli/settings.json so Antigravity CLI's built-in
 * interactive permission gate automatically skips confirmation prompts.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SETTINGS_PATH = join(
  homedir(),
  ".gemini",
  "antigravity-cli",
  "settings.json"
);

/**
 * Persist an approved command prefix to settings.json permissions.allow
 * @param {string} commandPrefix
 */
export function syncPermissionToSettings(commandPrefix) {
  if (!commandPrefix) return;

  try {
    if (!existsSync(SETTINGS_PATH)) return;

    const raw = readFileSync(SETTINGS_PATH, "utf-8");
    const settings = JSON.parse(raw);

    if (!settings.permissions) {
      settings.permissions = {};
    }
    if (!Array.isArray(settings.permissions.allow)) {
      settings.permissions.allow = [];
    }

    const rule = `command(${commandPrefix})`;

    if (!settings.permissions.allow.includes(rule)) {
      settings.permissions.allow.push(rule);
      writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
    }
  } catch {
    // Non-fatal — logging or silent ignore so the hook never breaks
  }
}

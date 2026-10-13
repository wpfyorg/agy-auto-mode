/**
 * Simple debug logger — writes to ~/.agy-auto-mode.log when AGY_AUTO_LOG=true.
 */

import { appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const LOG_FILE = join(homedir(), ".agy-auto-mode.log");
const ENABLED = (process.env.AGY_AUTO_LOG ?? "").toLowerCase() === "true";

/**
 * Append a timestamped line to the log file.
 * @param {string} message
 */
export function log(message) {
  if (!ENABLED) return;

  const ts = new Date().toISOString();
  try {
    appendFileSync(LOG_FILE, `[${ts}] ${message}\n`);
  } catch {
    // Silently ignore write errors — logging must never break the hook
  }
}

/**
 * agy-auto-mode — PreToolUse hook for Antigravity
 *
 * Reads the tool call payload from stdin, classifies it as safe/dangerous,
 * and returns a decision JSON on stdout.
 */

import { classifyToolCall } from "./src/classifier.js";
import { log } from "./src/logger.js";

async function main() {
  let raw = "";

  for await (const chunk of process.stdin) {
    raw += chunk;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    // If we can't parse the input, ask the user (safest default)
    process.stdout.write(JSON.stringify({ decision: "ask" }));
    return;
  }

  const toolCall = payload.toolCall;
  if (!toolCall) {
    process.stdout.write(JSON.stringify({ decision: "ask" }));
    return;
  }

  try {
    const result = await classifyToolCall(toolCall);
    log(`[${toolCall.name}] ${JSON.stringify(toolCall.args)} → ${result.decision} (${result.reason})`);
    process.stdout.write(JSON.stringify(result));
  } catch (err) {
    log(`ERROR: ${err.message}`);
    // On any error, fall back to asking the user
    process.stdout.write(
      JSON.stringify({
        decision: "ask",
        reason: `agy-auto-mode error: ${err.message}`,
      })
    );
  }
}

main();

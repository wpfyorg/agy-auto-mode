/**
 * GPT-OSS 120B (Medium) based command classifier.
 *
 * Uses the `gpt-oss-120b-medium` model included inside the Antigravity subscription,
 * invoked through Antigravity's CLI (`agy` / $ANTIGRAVITY_AGENTAPI_EXE).
 *
 * No external API key is required — access is included with Antigravity!
 * Optionally supports direct OpenAI API if AGY_AUTO_BACKEND="openai" and OPENAI_API_KEY is set.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const SYSTEM_PROMPT = `You are a strict security classifier for shell commands run by an AI coding assistant.
Analyze whether the shell command is SAFE to auto-execute without human confirmation.

Rules:
- SAFE (low risk): Routine dev commands (build, test, lint, formatting, git reads, package installs).
- SAFE (medium risk): Standard file/server changes in dev workflow, but worth user attention.
- UNSAFE: Irreversible destruction (rm -rf, formatting), credential exposure, network exfiltration, arbitrary remote script execution, or privilege escalation.

Respond ONLY with valid JSON:
{"safe": boolean, "risk": "low" | "medium" | "high", "reason": "brief explanation"}`;

/**
 * Parse JSON safely from model response text.
 */
export function parseModelJson(text) {
  if (!text || typeof text !== "string") return null;

  // Direct parse
  try {
    return JSON.parse(text.trim());
  } catch {}

  // Markdown code block ```json ... ```
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {}
  }

  // First { ... } block
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0].trim());
    } catch {}
  }

  return null;
}

/**
 * Classify a command using Antigravity's included GPT-OSS 120B (Medium) model.
 *
 * @param {string} commandLine
 * @returns {Promise<{ decision: string, reason: string }>}
 */
export async function gptClassify(commandLine) {
  const backend = (process.env.AGY_AUTO_BACKEND ?? "antigravity").toLowerCase();

  if (backend === "openai" && process.env.OPENAI_API_KEY) {
    return classifyWithOpenAiSdk(commandLine);
  }

  return classifyWithAntigravity(commandLine);
}

let gptOssQuotaUntil = 0;

/**
 * Run classification via Antigravity CLI's included GPT-OSS 120B (Medium).
 */
async function classifyWithAntigravity(commandLine, overrideModel = null) {
  const agyBin = process.env.ANTIGRAVITY_AGENTAPI_EXE || "agy";
  const configuredModel = process.env.AGY_AUTO_MODEL || "gpt-oss-120b-medium";
  const fallbackModel = process.env.AGY_AUTO_FALLBACK_MODEL || "gemini-3.8-flash-low";

  // If primary model previously hit quota, immediately use fallback model without delay
  let model = overrideModel || configuredModel;
  if (!overrideModel && model === "gpt-oss-120b-medium" && Date.now() < gptOssQuotaUntil) {
    model = fallbackModel;
  }

  const effort = process.env.AGY_AUTO_REASONING_EFFORT || "medium";
  const timeoutSec = parseInt(process.env.AGY_AUTO_TIMEOUT ?? "8", 10);

  const prompt = `${SYSTEM_PROMPT}\n\nCommand to analyze:\n\`\`\`\n${commandLine}\n\`\`\``;

  const args = [
    "--model", model,
  ];

  // Only pass --effort if model name does not already embed an effort tier (e.g. -low, -medium, -high)
  if (!/-low$|-medium$|-high$/i.test(model)) {
    args.push("--effort", effort);
  }

  args.push(
    "-p", prompt,
    "--disable-slash-commands",
    "--print-timeout", `${timeoutSec}s`,
  );

  try {
    const { stdout } = await execFileAsync(agyBin, args, {
      timeout: timeoutSec * 1000,
      env: process.env,
    });

    const parsed = parseModelJson(stdout);
    if (!parsed) {
      return {
        decision: "ask",
        reason: `Could not parse JSON from Antigravity (${model}): ${stdout.slice(0, 100)}`,
      };
    }

    const { safe, risk, reason, reasoning } = parsed;
    const finalReason = reason || reasoning || "Antigravity classification";

    if (safe === true && (risk === "low" || !risk)) {
      return { decision: "allow", reason: `[${model}] ${finalReason}` };
    }

    if (safe === true && risk === "medium") {
      return { decision: "ask", reason: `[${model}] Medium risk: ${finalReason}` };
    }

    return { decision: "deny", reason: `[${model}] Blocked: ${finalReason}` };
  } catch (err) {
    const errText = (err.stderr || err.message || "").toString();

    if (errText.includes("quota") || errText.includes("429") || errText.includes("RESOURCE_EXHAUSTED")) {
      if (model === "gpt-oss-120b-medium") {
        gptOssQuotaUntil = Date.now() + 10 * 60 * 1000;
      }
      if (model !== fallbackModel) {
        return classifyWithAntigravity(commandLine, fallbackModel);
      }

      return {
        decision: "ask",
        reason: `Antigravity subscription quota reached for ${model} — asking user`,
      };
    }

    if (err.killed || err.signal === "SIGTERM") {
      return {
        decision: "ask",
        reason: `Antigravity classification timed out (${timeoutSec}s) — asking user`,
      };
    }

    return {
      decision: "ask",
      reason: `Antigravity classification fallback: ${err.message}`,
    };
  }
}

/**
 * Optional fallback: direct OpenAI API call if user requested AGY_AUTO_BACKEND=openai.
 */
async function classifyWithOpenAiSdk(commandLine) {
  const { default: OpenAI } = await import("openai");
  const model = process.env.AGY_AUTO_MODEL || "gpt-oss-120b";
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const response = await client.chat.completions.create({
      model,
      reasoning_effort: process.env.AGY_AUTO_REASONING_EFFORT || "medium",
      max_completion_tokens: 2048,
      messages: [
        { role: "developer", content: SYSTEM_PROMPT },
        { role: "user", content: `Command to classify:\n\`\`\`\n${commandLine}\n\`\`\`` },
      ],
      response_format: { type: "json_object" },
    });

    const parsed = parseModelJson(response.choices?.[0]?.message?.content);
    if (!parsed) return { decision: "ask", reason: "Invalid JSON from OpenAI" };

    const { safe, risk, reason, reasoning } = parsed;
    const finalReason = reason || reasoning || "OpenAI classification";

    if (safe === true && risk === "low") {
      return { decision: "allow", reason: finalReason };
    }
    if (safe === true && risk === "medium") {
      return { decision: "ask", reason: finalReason };
    }
    return { decision: "deny", reason: finalReason };
  } catch (err) {
    return { decision: "ask", reason: `OpenAI API error: ${err.message}` };
  }
}

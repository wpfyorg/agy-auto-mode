# agy-auto-mode

An [Antigravity](https://antigravity.dev) plugin that uses **GPT-OSS 120B (Medium)** to automatically approve safe tool calls — so the agent doesn't pause for confirmation on harmless commands like `ls`, `cat`, or `npm test`.

Dangerous operations (`rm -rf /`, `curl | bash`, credential access, etc.) are still flagged for manual approval.

> [!TIP]
> GPT-OSS 120B is OpenAI's open-weight reasoning model (Apache 2.0), included in the Antigravity subscription. Zero extra cost.

## How It Works

```
┌──────────────────────────────────────────────────────────┐
│  Antigravity Agent proposes a tool call                  │
│  e.g. run_command("npm test")                            │
└──────────────┬───────────────────────────────────────────┘
               │  PreToolUse hook fires
               ▼
┌──────────────────────────────────────────────────────────┐
│  agy-auto-mode hook script                               │
│                                                          │
│  1. Extract tool name + args from stdin                   │
│  2. Check fast-path denylist (rm -rf /, dd, mkfs, …)      │
│  3. Check fast-path allowlist (ls, cat, echo, …)          │
│  4. If unclear → call GPT-OSS 120B (medium reasoning)     │
│  5. Return { decision: "allow" | "ask" | "deny" }         │
└──────────────────────────────────────────────────────────┘
```

The plugin registers as a **PreToolUse** lifecycle hook. Every time Antigravity is about to execute a tool, the hook script receives the tool call payload on stdin, classifies it, and tells the agent whether to proceed, ask the user, or block.

## Requirements

- **Node.js** ≥ 18
- An **OpenAI API key** (GPT-OSS 120B is included in the Antigravity subscription)
- **Antigravity** CLI, IDE, or 2.0

## Installation

### Option A — `agy plugin install` (recommended)

```bash
agy plugin install https://github.com/wpfyorg/agy-auto-mode
```

### Option B — Manual

Clone into your global or workspace plugins directory:

```bash
# Global (applies to all projects)
git clone https://github.com/wpfyorg/agy-auto-mode \
  ~/.gemini/config/plugins/agy-auto-mode

# Or workspace-local (applies to one project)
git clone https://github.com/wpfyorg/agy-auto-mode \
  .agents/plugins/agy-auto-mode
```

Then install dependencies:

```bash
cd <plugin-dir>/agy-auto-mode
npm install
```

## Configuration

Set your OpenAI API key as an environment variable:

```bash
export OPENAI_API_KEY="sk-..."
```

Optionally, create a `.env` file in the plugin directory:

```env
OPENAI_API_KEY=sk-...
```

### Advanced Configuration

You can customise behaviour via environment variables:

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | *(required)* | Your OpenAI API key |
| `AGY_AUTO_MODEL` | `gpt-oss-120b` | Model to use for classification |
| `AGY_AUTO_REASONING_EFFORT` | `medium` | Reasoning effort: `low`, `medium`, or `high` |
| `AGY_AUTO_TIMEOUT` | `10` | Timeout in seconds for the GPT call |
| `AGY_AUTO_LOG` | `false` | Set to `true` to write debug logs to `~/.agy-auto-mode.log` |
| `AGY_AUTO_ALLOWLIST` | *(built-in)* | Comma-separated extra commands to always allow |
| `AGY_AUTO_DENYLIST` | *(built-in)* | Comma-separated extra commands to always deny |

## How Classification Works

### Fast-Path (no API call)

The hook maintains built-in deny/allow lists for instant decisions. **Deny is always checked first** — so a command like `echo "..." && rm -rf /` is caught even though `echo` is allowlisted.

**Always denied** (destructive / dangerous):
`rm -rf /`, `rm -rf ~`, `mkfs`, `dd`, `:(){ :|:& };:`, `> /dev/sda`, `curl|bash`, `wget|bash`, credential/key exfiltration patterns, prompt injection attempts, …

**Always allowed** (read-only / harmless):
`ls`, `cat`, `head`, `tail`, `echo`, `pwd`, `whoami`, `date`, `wc`, `grep`, `find`, `which`, `file`, `tree`, `git status`, `git log`, `git diff`, `git branch`, `npm test`, `npm run lint`, `npx tsc --noEmit`, …

### GPT-OSS Classification (fallback)

Commands not caught by fast-path are sent to GPT-OSS 120B with **medium reasoning effort** and a strict system prompt. The model returns structured JSON:

```json
{
  "safe": true,
  "risk": "low",
  "reasoning": "npm test runs the project's test suite in a sandbox"
}
```

- `safe: true` + `risk: "low"` → **auto-approve**
- `safe: true` + `risk: "medium"` → **ask the user** (with reasoning shown)
- `safe: false` → **deny** with explanation

### Why GPT-OSS 120B?

| Property | Value |
|---|---|
| Architecture | 117B-parameter Mixture-of-Experts (MoE) |
| License | Apache 2.0 (open-weight) |
| Reasoning | Configurable effort (`low`/`medium`/`high`) |
| Cost | Included in Antigravity subscription |
| Latency | Medium effort balances speed + accuracy for safety classification |

### Non-Command Tools

For tools other than `run_command` (e.g., `view_file`, `replace_file_content`, `write_to_file`), the hook uses lightweight heuristics:

- **Read-only tools** (`view_file`, `search_web`, etc.) → always allowed
- **Write tools** → allowed (Antigravity already previews diffs)
- **Unknown tools** → ask the user

## Security Notes

> [!CAUTION]
> **Never rely solely on an LLM for security gating.** This plugin is a convenience layer, not a security boundary. The built-in deny-list catches known-dangerous patterns first. The GPT-OSS call is a best-effort fallback for ambiguous cases.

- Commands containing prompt-injection patterns are auto-denied by the denylist before reaching GPT-OSS.
- The plugin never executes commands itself — it only advises the agent.
- Deny patterns are checked **before** allow patterns to prevent bypass.
- All decisions are logged (when `AGY_AUTO_LOG=true`) for audit.

## Development

```bash
# Run tests
npm test

# Lint
npm run lint

# Try the hook locally (pipe a sample payload)
echo '{"toolCall":{"name":"run_command","args":{"CommandLine":"ls -la"}}}' | node hook.js
```

## License

MIT — see [LICENSE](./LICENSE).

# agy-auto-mode

An [Antigravity](https://antigravity.dev) plugin that uses GPT-4o-mini to automatically approve safe tool calls — so the agent doesn't pause for confirmation on harmless commands like `ls`, `cat`, or `npm test`.

Dangerous operations (`rm -rf /`, `curl | bash`, credential access, etc.) are still flagged for manual approval.

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
│  2. Check fast-path allowlist (ls, cat, echo, …)          │
│  3. Check fast-path denylist (rm -rf /, dd, mkfs, …)      │
│  4. If unclear → call GPT-4o-mini for classification       │
│  5. Return { decision: "allow" | "ask" | "deny" }         │
└──────────────────────────────────────────────────────────┘
```

The plugin registers as a **PreToolUse** lifecycle hook. Every time Antigravity is about to execute a tool, the hook script receives the tool call payload on stdin, classifies it, and tells the agent whether to proceed, ask the user, or block.

## Requirements

- **Node.js** ≥ 18
- An **OpenAI API key** (GPT-4o-mini is dirt cheap — ~$0.15 / 1M input tokens)
- **Antigravity** CLI, IDE, or 2.0

## Installation

### Option A — `agy plugin install` (recommended)

```bash
agy plugin install https://github.com/ArnabXD/agy-auto-mode
```

### Option B — Manual

Clone into your global or workspace plugins directory:

```bash
# Global (applies to all projects)
git clone https://github.com/ArnabXD/agy-auto-mode \
  ~/.gemini/config/plugins/agy-auto-mode

# Or workspace-local (applies to one project)
git clone https://github.com/ArnabXD/agy-auto-mode \
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
| `AGY_AUTO_MODEL` | `gpt-4o-mini` | Model to use for classification |
| `AGY_AUTO_TIMEOUT` | `8` | Timeout in seconds for the GPT call |
| `AGY_AUTO_LOG` | `false` | Set to `true` to write debug logs to `~/.agy-auto-mode.log` |
| `AGY_AUTO_ALLOWLIST` | *(built-in)* | Comma-separated extra commands to always allow |
| `AGY_AUTO_DENYLIST` | *(built-in)* | Comma-separated extra commands to always deny |

## How Classification Works

### Fast-Path (no API call)

The hook maintains built-in allow/deny lists for instant decisions:

**Always allowed** (read-only / harmless):
`ls`, `cat`, `head`, `tail`, `echo`, `pwd`, `whoami`, `date`, `wc`, `grep`, `find`, `which`, `file`, `tree`, `git status`, `git log`, `git diff`, `git branch`, `npm test`, `npm run lint`, `npx tsc --noEmit`, …

**Always denied** (destructive / dangerous):
`rm -rf /`, `rm -rf ~`, `mkfs`, `dd`, `:(){ :|:& };:`, `> /dev/sda`, `curl|bash`, `wget|bash`, credential/key exfiltration patterns, …

### GPT Classification (fallback)

Commands not caught by fast-path are sent to GPT-4o-mini with a strict system prompt. The model returns structured JSON:

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

### Non-Command Tools

For tools other than `run_command` (e.g., `view_file`, `replace_file_content`, `write_to_file`), the hook uses lightweight heuristics:

- **Read-only tools** (`view_file`, `search_web`, etc.) → always allowed
- **Write tools** → allowed (Antigravity already previews diffs)
- **Unknown tools** → ask the user

## Security Notes

> [!CAUTION]
> **Never rely solely on an LLM for security gating.** This plugin is a convenience layer, not a security boundary. The built-in deny-list catches known-dangerous patterns first. The GPT call is a best-effort fallback for ambiguous cases.

- Commands containing prompt-injection patterns are auto-denied by the denylist before reaching GPT.
- The plugin never executes commands itself — it only advises the agent.
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

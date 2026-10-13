# agy-auto-mode

An [Antigravity](https://antigravity.dev) plugin that automatically approves safe tool calls using **GPT-OSS 120B (Medium)** — so the agent doesn't pause for confirmation on harmless commands like `ls`, `cat`, or `npm test`.

Dangerous operations (`rm -rf /`, `curl | bash`, credential access, fork bombs, etc.) are always caught and flagged for manual approval or blocked.

> [!TIP]
> **No API key needed!**
> GPT-OSS 120B (Medium) is an open-weight reasoning model (Apache 2.0) **included inside your Antigravity subscription**. The plugin invokes Antigravity's native model engine directly.

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
│  4. If ambiguous → classify with GPT-OSS 120B (Medium)   │
│     (included inside Antigravity subscription)           │
│  5. Return { decision: "allow" | "ask" | "deny" }         │
└──────────────────────────────────────────────────────────┘
```

The plugin registers as a **PreToolUse** lifecycle hook. Every time Antigravity is about to execute a tool, the hook script receives the tool call payload on stdin, classifies it, and tells the agent whether to proceed, ask the user, or block.

## Requirements

- **Node.js** ≥ 18
- **Antigravity** CLI (`agy`), IDE, or 2.0 (with active subscription)

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

**Zero configuration required out of the box!** The plugin automatically uses `gpt-oss-120b-medium` via `agy` from your subscription.

### Optional Environment Variables

You can customise behavior via environment variables:

| Variable | Default | Description |
|---|---|---|
| `AGY_AUTO_MODEL` | `gpt-oss-120b-medium` | Model to use for command classification |
| `AGY_AUTO_REASONING_EFFORT` | `medium` | Reasoning effort: `low`, `medium`, or `high` |
| `AGY_AUTO_TIMEOUT` | `15` | Timeout in seconds for classification |
| `AGY_AUTO_BACKEND` | `antigravity` | Engine backend: `antigravity` (default) or `openai` |
| `OPENAI_API_KEY` | *(optional)* | Only needed if `AGY_AUTO_BACKEND=openai` |
| `AGY_AUTO_LOG` | `false` | Set to `true` to write debug logs to `~/.agy-auto-mode.log` |
| `AGY_AUTO_ALLOWLIST` | *(built-in)* | Comma-separated extra commands to always allow |
| `AGY_AUTO_DENYLIST` | *(built-in)* | Comma-separated extra commands to always deny |

## How Classification Works

### 1. Fast-Path Denylist (Checked First)

**Deny patterns are always evaluated first** — so a command like `echo "..." && rm -rf /` is blocked immediately even though `echo` is allowlisted.

- Destructive filesystem commands: `rm -rf /`, `rm -rf ~`, `rm -rf *`
- Disk overwrite: `dd of=/dev/sd*`, `mkfs`, `fdisk`, `parted`
- Fork bombs: `:(){ :|:& };:`
- Pipe from remote to shell: `curl ... | bash`, `wget ... | sh`
- Credential exfiltration: reading `.ssh`, `.aws`, `.env`, tokens
- Privilege escalation: `chmod -R 777`, `chown root`
- Prompt injection guards in command text

### 2. Fast-Path Allowlist (Instant)

Harmless, routine development commands are approved instantly without making an LLM call:

- Filesystem reads: `ls`, `cat`, `head`, `tail`, `wc`, `grep`, `rg`, `find`, `tree`, `which`
- Git operations: `git status`, `git log`, `git diff`, `git branch`, `git show`, `git blame`
- Development tool commands: `npm test`, `npm run lint`, `cargo test`, `cargo build`, `pytest`, `go test`
- System info: `pwd`, `whoami`, `date`, `uname`

### 3. GPT-OSS 120B (Medium) Classification (Ambiguous Commands)

Any command that doesn't match either fast-path list is sent to **GPT-OSS 120B (Medium)** through your Antigravity subscription:

```json
{
  "safe": true,
  "risk": "low",
  "reason": "docker build builds a local container image"
}
```

- `safe: true` + `risk: "low"` → **Auto-approved**
- `safe: true` + `risk: "medium"` → **Asks the user** (reason shown)
- `safe: false` → **Blocked** with explanation
- Quota / Timeout / Error → Gracefully falls back to **asking the user**

### 4. Non-Command Tools

- **Read-only tools** (`view_file`, `search_web`, `read_url_content`, etc.) → Always allowed
- **Code editing tools** (`write_to_file`, `replace_file_content`) → Allowed (Antigravity previews diffs)
- **Unknown tools** → Prompt user

## Security & Reliability

> [!CAUTION]
> **Safety In Depth:** This plugin is designed to reduce confirmation fatigue for safe workflows while maintaining strong defenses. The deterministic deny-list runs before any LLM evaluation, and prompt injection attempts in command strings are blocked before reaching the model.

## Development & Testing

```bash
# Run tests (runs 29 tests covering fast-paths, edge cases, JSON parser)
npm test

# Try the hook locally
echo '{"toolCall":{"name":"run_command","args":{"CommandLine":"ls -la"}}}' | node hook.js
```

## License

MIT — see [LICENSE](./LICENSE).

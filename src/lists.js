/**
 * Allow / deny lists and command-parsing helpers.
 */

// ─── Read-only tools that are always safe ──────────────────────────────────
export const ALWAYS_ALLOW_TOOLS = new Set([
  "view_file",
  "search_web",
  "read_url_content",
  "search_files",
  "list_directory",
  "read_resource",
  "list_resources",
  "ask_question",
  "send_message",
  "invoke_subagent",
  "manage_subagents",
  "manage_task",
  "schedule",
  "define_subagent",
]);

// ─── Commands that are always safe (lowercased base command or prefix) ──────
export const ALWAYS_ALLOW_COMMANDS = [
  // CLI & core runner
  "agy",
  // filesystem reads
  "ls",
  "ll",
  "la",
  // file & directory management (safe operations)
  "cp",
  "mkdir",
  "mv",
  "touch",
  // filesystem reads
  "cat",
  "head",
  "tail",
  "less",
  "more",
  "file",
  "stat",
  "wc",
  "du",
  "df",
  "tree",
  "find",
  "locate",
  "which",
  "whereis",
  "type",
  "realpath",
  "readlink",
  "basename",
  "dirname",
  // text processing (read-only)
  "grep",
  "rg",
  "ag",
  "awk",
  "sed -n",
  "sort",
  "uniq",
  "cut",
  "tr",
  "diff",
  "comm",
  "jq",
  "yq",
  "xargs echo",
  // system info
  "echo",
  "printf",
  "pwd",
  "whoami",
  "id",
  "uname",
  "date",
  "uptime",
  "env",
  "printenv",
  "hostname",
  "arch",
  "sw_vers",
  "sysctl",
  "lsb_release",
  "nproc",
  "free",
  // git operations
  "git status",
  "git log",
  "git diff",
  "git show",
  "git branch",
  "git tag",
  "git remote",
  "git stash",
  "git rev-parse",
  "git describe",
  "git shortlog",
  "git blame",
  "git ls-files",
  "git ls-tree",
  "git config",
  "git add",
  "git commit",
  "git push",
  "git pull",
  "git checkout",
  "git switch",
  "git merge",
  "git fetch",
  // node / npm / yarn / pnpm (safe operations)
  "node --version",
  "npm --version",
  "npm ls",
  "npm list",
  "npm test",
  "npm run test",
  "npm run lint",
  "npm run build",
  "npm run check",
  "npm run typecheck",
  "npm run format",
  "npm ci",
  "npm install",
  "npx tsc --noEmit",
  "npx tsc --version",
  "npx eslint",
  "npx prettier",
  "npx jest",
  "npx vitest",
  "npx playwright test",
  "yarn test",
  "yarn lint",
  "yarn build",
  "yarn install",
  "pnpm test",
  "pnpm lint",
  "pnpm build",
  "pnpm install",
  "bun test",
  "bun run test",
  "bun run lint",
  "bun run build",
  "bun install",
  // python
  "python --version",
  "python3 --version",
  "pip list",
  "pip show",
  "pip --version",
  "pip install",
  "pip3 install",
  "python -m pytest",
  "python3 -m pytest",
  "pytest",
  "mypy",
  "ruff check",
  "ruff format",
  "black --check",
  "flake8",
  "pylint",
  "uv sync",
  "uv pip install",
  "uv run pytest",
  // rust
  "cargo test",
  "cargo build",
  "cargo check",
  "cargo clippy",
  "cargo fmt",
  "rustc --version",
  "cargo --version",
  // go
  "go test",
  "go build",
  "go vet",
  "go version",
  "go mod tidy",
  // misc dev tools
  "make",
  "cmake",
  "docker ps",
  "docker images",
  "docker compose ps",
  "kubectl get",
  "kubectl describe",
  "terraform plan",
  "terraform validate",
];

// ─── Patterns that indicate dangerous commands ─────────────────────────────
export const ALWAYS_DENY_PATTERNS = [
  // destructive filesystem ops
  /rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?(-[a-zA-Z]*r[a-zA-Z]*\s+)?\//i,
  /rm\s+(-[a-zA-Z]*r[a-zA-Z]*\s+)?(-[a-zA-Z]*f[a-zA-Z]*\s+)?\//i,
  /rm\s+-rf\s+~/,
  /rm\s+-rf\s+\*/,
  /rm\s+-rf\s+\.\s/,
  /rm\s+-rf\s+\.\//,
  // disk destruction
  /\bdd\b.*\bof=\/dev\//i,
  /\bmkfs\b/i,
  /\bfdisk\b/i,
  /\bparted\b/i,
  />\s*\/dev\/sd/i,
  />\s*\/dev\/nvme/i,
  // fork bomb
  /:\(\)\s*\{\s*:\|:&\s*\}\s*;/,
  // pipe from internet to shell
  /curl\s.*\|\s*(ba)?sh/i,
  /wget\s.*\|\s*(ba)?sh/i,
  /curl\s.*\|\s*sudo/i,
  /wget\s.*\|\s*sudo/i,
  // credential / key exfiltration
  /cat\s.*\.(ssh|gnupg|aws|kube)/i,
  /cat\s.*credentials/i,
  /cat\s.*\.env\b.*\|\s*curl/i,
  /curl\s.*--data.*\$\(cat/i,
  /curl\s.*-d.*\$\(cat/i,
  // network exfil
  /nc\s+-l/i,
  /ncat\s/i,
  /\bsocat\b/i,
  // dangerous system operations
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\binit\s+0\b/i,
  /\bsystemctl\s+(stop|disable|mask)\b/i,
  // permission escalation patterns
  /chmod\s+777/i,
  /chmod\s+-R\s+777/i,
  /chown\s+-R\s+root/i,
  // eval / exec of untrusted input
  /\beval\s+\$\(/i,
  /\beval\s+"\$\{/i,
  // prompt injection guard (commands containing text trying to fool the GPT)
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\s+/i,
  /pretend\s+(you\s+are|to\s+be)/i,
];

/**
 * Extract the base command from a command line string.
 * e.g. "npm run test -- --watch" → "npm"
 *      "git status" → "git"
 *      "FOO=bar ls -la" → "ls"
 */
export function extractBaseCommand(commandLine) {
  const cleaned = commandLine
    .trim()
    // Strip leading time
    .replace(/^time\s+/i, "")
    // Strip leading env vars (KEY=val ...)
    .replace(/^(\s*[A-Z_][A-Z0-9_]*=[^\s]*\s+)+/i, "")
    // Strip leading sudo (including flags like -u <user>)
    .replace(/^sudo\s+(?:(?:-[HEPSnbiknp]|-[Cu]\s+\S+|--\S+(?:=\S+)?)\s+)*/i, "")
    .trim();

  // Get the first token
  const match = cleaned.match(/^[^\s|;&]+/);
  return match ? match[0].toLowerCase() : "";
}

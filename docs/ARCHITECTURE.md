# Architecture

## Runtime overview

The Stream Deck Node process owns all integration components. There is no separately installed daemon.

```text
Codex app-server (child process) ─ task metadata ─┐
                                                  ├─ status coordinator ─ stable turn queue ─ Stream Deck keys
$CODEX_HOME/sessions ─ rollout watcher ──────────┤
                                                  │
Codex hooks ─ reduced Unix-socket events ─────────┘
```

### Task catalog

`AppServerClient` starts the bundled `codex app-server`, completes the official JSON-RPC initialization handshake, and calls only:

- `thread/list`
- `hooks/list`
- `config/batchWrite` for explicit hook trust/disable actions

The separate process cannot observe the private in-memory status of tasks owned by Codex Desktop. It is therefore used for metadata, not live state, and never starts, resumes, or modifies a task.

### Rollout status

`RolloutWatcher` recursively watches JSONL files below `$CODEX_HOME/sessions`. It streams bounded chunks, commits offsets only through complete lines, detects truncation and file replacement, skips oversized records, and deduplicates replayed events.

Persisted task start/completion/error records feed a deterministic reducer. On first installation, historical completions are acknowledged so existing tasks do not all turn green. Subsequent completions remain unread across Stream Deck restarts.

### Enhanced status hooks

`HookManager` adds three command hooks to the user's `$CODEX_HOME/hooks.json` without replacing unrelated entries:

- `PermissionRequest` for approval waits
- `PreToolUse` for `request_user_input`
- `PostToolUse` for the matching question completion

The helper reduces hook input before forwarding it. `HookServer` accepts only a small versioned JSON envelope over a Unix-domain socket with a 4 KiB request limit. Definitions remain inert until the user explicitly trusts their current hashes through the property inspector.

### Assignment and rendering

Every visible device is ranked independently. Visible key coordinates are sorted row-major and paired with a persisted top-level task queue. The first catalog load seeds that queue by recency with a deterministic thread-ID tie breaker. Only a new turn promotes an existing task to the front; ordinary activity, status transitions, completions, and catalog metadata refreshes preserve the order. New catalog entries append to the queue, while archived or removed tasks drop out.

Each key receives a minimal 144×144 SVG data URI containing only its state color, rank, and one-line debug label. The plugin caches the last image per context to avoid redundant Stream Deck updates.

### Navigation

Task IDs are UUID-validated before they enter a URL. Processes are launched with argument arrays, never interpolated shell commands. `lsappinfo` detects the frontmost bundle without requesting Accessibility or Automation permissions.

## Persistence

Stream Deck global settings contain:

- the enhanced-status toggle and optional `CODEX_HOME`
- rollout byte offsets
- stable task order
- completion and acknowledgement IDs
- terminal error markers

No task transcript, prompt, command, question, or tool payload is persisted by the plugin.

## Replaceable boundaries

The status coordinator keeps task catalog, rollout, hooks, rendering, and navigation separate. Future assignment modes or a shared live app-server transport can replace their respective adapters without changing the action manifest.

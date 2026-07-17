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

Persisted task start/completion/error records and sanitized `request_user_input` lifecycle records feed a deterministic reducer. Only the tool name, call ID, turn ID, and timestamp are inspected; question content is discarded. On first installation, historical completions are acknowledged so existing tasks do not all turn green. Subsequent completions and open-question state survive Stream Deck restarts.

### Enhanced status hooks

`HookManager` adds three command hooks to the user's `$CODEX_HOME/hooks.json` without replacing unrelated entries:

- `PermissionRequest` for approval waits
- `PreToolUse` and `PostToolUse` declarations retained as compatibility signals for `request_user_input`

Planning-question status is authoritative from rollout files because current Codex builds do not dispatch tool hooks for this built-in interaction. The helper reduces any compatible hook input before forwarding it. `HookServer` accepts only a small versioned JSON envelope over a Unix-domain socket with a 4 KiB request limit and timestamps it on receipt. Definitions remain inert until the user explicitly trusts their current hashes through the property inspector.

### Assignment and rendering

Every visible device is ranked independently. Visible key coordinates are sorted row-major and paired with a persisted top-level task queue. The first catalog load seeds that queue by recency with a deterministic thread-ID tie breaker. Only a new turn promotes an existing task to the front; ordinary activity, status transitions, completions, and catalog metadata refreshes preserve the order. New catalog entries append to the queue, while archived or removed tasks drop out.

Each key receives a minimal 144×144 SVG data URI containing a centered state glyph from the fixed status palette on a transparent surface. Working tiles cycle one rounded segment through 30 eased frames over three seconds; it expands across 94% of the circumference, then contracts from its trailing edge while completing the loop. The timer runs only while a visible task is working. There are no labels or rank numbers. The plugin caches the last image per context to avoid redundant Stream Deck updates.

### Navigation

The status action depends only on the OS-neutral `TaskNavigator` interface and requests `background` or `foreground` task selection. A platform factory currently selects `MacOsTaskNavigator`; unsupported platforms fail explicitly until their adapter is added.

The macOS adapter UUID-validates task links and launches `/usr/bin/open` with argument arrays, never interpolated shell commands. A first tap requests background navigation with `open -g`; Codex may still activate itself while handling the deep link. A matching second tap within 500 ms deliberately activates the Codex bundle before opening the task again. The plugin does not restore another application's focus, and neither path requires Accessibility or Automation permissions.

## Persistence

Stream Deck global settings contain:

- the enhanced-status toggle and optional `CODEX_HOME`
- rollout byte offsets
- stable task order
- completion and acknowledgement IDs
- open-question state
- terminal error markers

No task transcript, prompt, command, question, or tool payload is persisted by the plugin.

## Replaceable boundaries

The status coordinator keeps task catalog, rollout, hooks, rendering, and navigation separate. Future assignment modes, a shared live app-server transport, or Windows/Linux task navigators can replace their respective adapters without changing the action manifest.

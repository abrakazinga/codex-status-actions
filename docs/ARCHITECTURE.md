# Architecture

## Runtime overview

The Stream Deck Node process owns all integration components. There is no separately installed daemon.

```text
                                            ┌─ task metadata ─ status coordinator ─ status keys
Codex app-server (one shared child process) ─┤
                                            └─ rate limits ─ usage provider ─ usage keys

$CODEX_HOME/sessions ─ rollout watcher ─ status coordinator
Codex hooks ─ reduced Unix-socket events ─ status coordinator
```

### Task catalog

`CodexRuntime` owns one shared `AppServerClient`, starts the bundled `codex app-server` with the configured `CODEX_HOME`, and completes the official JSON-RPC initialization handshake. Consumers call only:

- `thread/list`
- `hooks/list`
- `config/batchWrite` for explicit hook trust/disable actions
- `account/rateLimits/read` for the authenticated account's current usage windows

The separate process cannot observe the private in-memory status of tasks owned by Codex Desktop. It is therefore used for metadata, not live state, and never starts, resumes, or modifies a task.

### Usage limits

`AppServerClient` reads both the legacy rate-limit bucket and the multi-bucket map. `UsageProvider` then normalizes supported windows by duration rather than assuming primary means 5-hour or secondary means weekly. It polls only while Usage keys are visible, coalesces concurrent reads, and uses the shortest selected visible refresh interval. Sparse `account/rateLimits/updated` notifications trigger a debounced snapshot read instead of being merged directly.

Remaining and Used are derived from `usedPercent`. Pace compares actual usage with the elapsed fraction of the reported window. Reset countdowns and Pace are recalculated locally once per minute. No usage percentage is persisted.

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

Each key receives a minimal 144×144 SVG data URI on a transparent surface. A central theme module provides the shared status palette to both renderers and injects it into both property inspectors. Working tiles cycle one rounded segment through 30 eased frames over three seconds; it expands across 94% of the circumference, then contracts from its trailing edge while completing the loop. The plugin caches the last image per context to avoid redundant Stream Deck updates.

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

Usage display mode, metric, timeframe, reset visibility, and refresh interval are stored as per-action Stream Deck settings. Usage values are held only in memory.

No task transcript, prompt, command, question, or tool payload is persisted by the plugin.

## Replaceable boundaries

The shared runtime, status coordinator, usage provider, rendering, and navigation remain separate. Future assignment modes, usage metrics, or Windows/Linux task navigators can replace their respective adapters without changing unrelated actions.

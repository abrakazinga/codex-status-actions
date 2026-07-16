# Privacy

Codex: Status & Actions runs locally and does not provide its own network service, analytics, crash reporting, or telemetry.

## Data read

- Task IDs, timestamps, ephemeral state, and hierarchy from local Codex `thread/list`
- Event type, timestamp, thread ID, and turn ID from local rollout JSONL files
- Hook event name, thread ID, and turn ID from local Codex hook invocations

Other `thread/list` fields are discarded during validation and are not retained by the plugin.

## Data deliberately discarded

The hook process receives the standard Codex hook object, which may include sensitive fields. Before any inter-process transmission it extracts a fixed identifier allow-list and discards the rest. It does not forward or log:

- prompts or messages
- approval command text
- questions or answers
- tool input or output
- transcript paths
- file contents or patches

## Local storage

Stream Deck global settings store byte offsets and small state identifiers required for restart recovery. The plugin does not copy rollout files or maintain a transcript database.

The property inspector receives only the enhanced-status toggle and optional `CODEX_HOME` override. Persisted task identifiers and rollout paths are not sent to its webview.

The hook socket and helper live under `$CODEX_HOME/codex-status-actions`. The directory is mode `0700`; the socket and `hooks.json` are enforced as mode `0600` during installation.

## Diagnostics

“Copy Safe Diagnostics” includes plugin/platform versions, whether a custom Codex home is configured, connection states, task count, hook count, and whether enhanced status is enabled. It excludes filesystem paths, task IDs, rollout paths, transcripts, and event content.

Raw app-server stderr is drained but never copied into plugin logs; only a content-free diagnostic marker is emitted.

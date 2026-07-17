# Privacy

Codex: Status & Actions runs locally and does not provide its own network service, analytics, crash reporting, or telemetry.

## Data read

- Task IDs, timestamps, ephemeral state, and hierarchy from local Codex `thread/list`
- Event type, timestamp, thread ID, turn ID, tool name, and transient call ID from local rollout JSONL files
- Hook event name, thread ID, and turn ID from local Codex hook invocations
- Used percentage, window duration, and reset timestamp from local Codex `account/rateLimits/read`

Dictation reads none of the microphone audio or generated text. It activates Codex and emits only the shortcut configured by the user.

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

Stream Deck global settings store byte offsets, open-question state, and small state identifiers required for restart recovery. Call IDs are not persisted. The plugin does not copy rollout files or maintain a transcript database.

The Status property inspector receives only the enhanced-status toggle and optional `CODEX_HOME` override. The Usage inspector additionally receives its own presentation settings and source health. The Dictation inspector receives the configured shortcut, interaction mode, and safe capability health. Persisted task identifiers, rollout paths, and usage percentages are not sent to any webview.

Usage percentages and reset timestamps remain in memory and are not persisted. Usage key settings contain only presentation choices and refresh interval. Codex performs authentication for app-server requests; the plugin does not read or copy token contents from `auth.json`.

The dictation shortcut's key and modifier names are stored in Stream Deck global settings because Codex exposes one global toggle-dictation binding. Dictation mode is stored per key. The plugin never requests microphone access, records audio, reads the resulting transcript, or submits composer content.

The hook socket and helper live under `$CODEX_HOME/codex-status-actions`. The directory is mode `0700`; the socket and `hooks.json` are enforced as mode `0600` during installation.

## Diagnostics

“Copy Safe Diagnostics” includes plugin/platform versions, whether a custom Codex home is configured, connection states, task count, hook count, and whether enhanced status is enabled. It excludes filesystem paths, task IDs, rollout paths, transcripts, and event content.

Usage diagnostics include only source state, whether a successful refresh has occurred, available window names, and visible tile count. They exclude usage percentages, reset timestamps, account identifiers, and errors' underlying payloads.

Dictation diagnostics include only tile state, Codex availability, whether a shortcut is configured, permission state, and a sanitized error category. They exclude dictated text, keypress history, application content, and audio.

Raw app-server stderr is drained but never copied into plugin logs; only a content-free diagnostic marker is emitted.

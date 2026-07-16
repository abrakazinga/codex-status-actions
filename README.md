# Codex: Status & Actions

[![CI](https://github.com/abrakazinga/codex-status-actions/actions/workflows/ci.yml/badge.svg)](https://github.com/abrakazinga/codex-status-actions/actions/workflows/ci.yml)

An unofficial, open-source Stream Deck integration for monitoring local OpenAI Codex tasks on macOS.

The `Codex Status` action can be placed on one or many keys. Tiles start in recent-task order, then remain stable until a task begins a new turn and moves to the first position.

| Color      | Meaning                                                    |
| ---------- | ---------------------------------------------------------- |
| White/gray | Idle                                                       |
| Green      | Completed response not yet acknowledged through the plugin |
| Blue       | Codex is actively working                                  |
| Orange     | Codex needs an approval or answer                          |
| Red        | The task or integration reported an error                  |

Each tile shows its rank in the top-right and a one-line state/task debug label along the bottom.

## Requirements

- macOS 12 or newer
- Stream Deck 7.1 or newer
- Codex Desktop with its bundled Codex CLI; enhanced hook status is tested with `codex-cli 0.144.2`

## Install a release

1. Download `com.abrakazinga.codex-status-actions.streamDeckPlugin` from the latest GitHub release.
2. Open the file to install it in Stream Deck.
3. Add one or more **Codex Status** actions to a profile.
4. Select a tile in Stream Deck and click **Trust 3 Local Status Hooks** in the property inspector.
5. Restart Codex once. Hook changes are never trusted silently.

The plugin works without trusted hooks, but approval and question waits may remain blue instead of orange.

## How assignment works

`Most Recent` uses a stable, turn-driven queue:

- Visible status keys are ordered top-left to bottom-right on each device.
- Initial ranks use the current task recency.
- Starting a new turn moves only that task to rank 1; status updates and completions do not reorder tiles.
- The queue is persisted across Stream Deck and plugin restarts.
- Archived, ephemeral, and spawned subagent tasks are excluded.
- Each device ranks tasks independently.

## Key presses

- **Single tap:** switch to the represented task and acknowledge its green unread state after successful navigation.
- **First tap while Codex is in the background:** preselect and acknowledge the task without stealing focus.
- **Second tap within 500 ms:** activate Codex and select the task again.

Navigation uses the version-checked `codex://threads/<thread-id>` URL and macOS `open`. It does not use screen coordinates, Accessibility, AppleScript, or simulated keyboard input.

## Privacy and security

Status is assembled locally from:

- `thread/list` on a separate read-only Codex app-server process for task metadata
- live JSONL rollout files under `$CODEX_HOME/sessions` for turn state
- three optional Codex lifecycle hooks for approvals and questions

The hook helper receives Codex's hook input, extracts only the task ID, turn ID, and event name in memory, and forwards that reduced object over a permission-restricted Unix socket. It never forwards or logs prompts, questions, command text, tool input, transcripts, or file paths. When Stream Deck is unavailable, the helper exits successfully so it cannot block Codex.

See [Privacy](docs/PRIVACY.md), [Architecture](docs/ARCHITECTURE.md), and [Security](SECURITY.md) for details.

## Develop locally

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm validate
pnpm run link
```

After linking, restart the plugin during development with:

```sh
pnpm exec streamdeck restart com.abrakazinga.codex-status-actions
```

Package a distributable artifact with `pnpm run pack`.

## Current limitations

- macOS and one local Codex installation only
- The stable turn-driven queue is the only assignment mode in v0.1
- Green is a plugin-local unread marker, not Codex Desktop's private read state
- Approval orange clears on the next observable task activity because Codex does not expose a dedicated approval-resolved lifecycle hook
- The local task URL is an interoperability surface and may require adaptation after a Codex update
- A Codex restart is required after installing or changing hooks

## License and attribution

Original code and artwork are licensed under Apache-2.0. This repository does not contain or redistribute Codex Micro, Work Louder, or proprietary Codex Desktop code or assets.

Codex is a trademark of OpenAI. Stream Deck is a trademark of Elgato. This project is not affiliated with or endorsed by OpenAI, Work Louder, or Elgato.

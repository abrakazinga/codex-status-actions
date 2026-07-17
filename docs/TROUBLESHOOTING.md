# Troubleshooting

## Tiles show CODEX OFFLINE

- Confirm Codex Desktop is installed in `/Applications/ChatGPT.app`.
- Open the property inspector and inspect **Codex Binary** and **Task Catalog**.
- If you use a non-default `CODEX_HOME`, set its absolute path in the property inspector.
- Changing `CODEX_HOME` removes this plugin's unchanged hook declarations and helper from the previous location before initializing the new one.
- Restart the plugin from Stream Deck or run `pnpm exec streamdeck restart com.abrakazinga.codex-status-actions` in a development checkout.

## Usage shows UNAVAILABLE

- Open the Usage tile's **Debug** section and check **Usage Source** and **Windows**.
- If Codex successfully omits the 5-hour window, the tile shows `N/A`; this is not a fetch error.
- Click **Refresh Now**. A temporary failure keeps the last successful values and marks them `STALE`.
- Confirm Codex is signed in. Authentication is handled by Codex; this plugin never asks for or reads a token.
- Some accounts currently return only the weekly window. In Double mode the available row continues to work; a Single 5-hour tile shows `N/A`.
- If you use a custom Codex home, set the shared path under **Advanced**. This restarts the shared app-server and status services.

## Orange never appears

- Planning questions are detected automatically from rollout events and do not require hooks.
- For approval waits, ensure **Enhanced Status** is enabled and click **Trust Local Status Hooks**.
- Restart Codex after installing or modifying hooks.
- A `modified` hook state requires trusting the new hashes again.
- Managed Codex policy may prohibit user hooks; the property inspector reports this as a hook error.

The tile safely remains blue when the plugin cannot prove Codex is waiting for input.

## Hook problems affect a turn

The helper is designed to fail open and exit zero. Turn off **Enhanced Status** to disable the owned hook keys and remove the owned definitions/helper. The removal process preserves unrelated hooks. A timestamped backup of a pre-existing `hooks.json` is created before changes.

## A single tap does not foreground Codex

This is intentional when another app is active. Tap the same key a second time within 500 ms to activate Codex on that task.

If navigation reports an error, a Codex update may have changed its task URL. The plugin does not fall back to Accessibility automation.

## Stream Deck does not update in the background

Check macOS **System Settings → General → Login Items & Extensions** and confirm Stream Deck is allowed to run in the background. Also verify the Stream Deck application itself is running.

## Reset local plugin state

Remove and re-add the action to reset only a key. To reset global offsets and unread markers, uninstall and reinstall the plugin. Disabling Enhanced Status separately cleans up the plugin-owned Codex hooks.

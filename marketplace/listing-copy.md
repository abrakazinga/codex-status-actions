# Elgato Marketplace listing copy

## Product name

Codex Status & Actions

## Author

alxbra

## Category

Development

## Short description

Follow Codex task status, check usage, and start dictation from Stream Deck.

## Description

Codex Status & Actions is an unofficial local Stream Deck plugin that provides status, usage, and dictation controls for Codex Desktop on macOS.

The Codex Status action assigns recent local tasks to Stream Deck keys. Each key shows whether its task is idle, working, waiting for user input, completed with an unread response, or in an error state. Starting a new turn moves that task to the first position. Pressing a key selects its task, and double-pressing also brings Codex to the foreground.

The Codex Usage action displays remaining, used, or pace percentages for the usage windows available to the current account. It supports single- and double-window layouts, optional reset countdowns, configurable refresh intervals, and manual refresh. If Codex does not provide a 5-hour window, the tile displays `N/A`.

The Codex Dictation action invokes the Toggle dictation shortcut configured in Codex. It supports hold and toggle interaction. Codex handles the microphone and transcription, and the resulting text remains editable in the composer. The plugin does not submit dictated text automatically.

Disclosure:

This plugin is unofficial and is not affiliated with OpenAI or Elgato. It reads local Codex task data and uses Codex's local app-server interface. It does not read the Codex auth file, retain authentication tokens, record microphone audio, inspect dictated text, or send prompts and task contents to the plugin author.

Optional support note:

This plugin is free and open source.

## Requirements

- macOS 12 or newer
- Stream Deck 7.1 or newer
- Codex Desktop with its bundled Codex CLI
- A user-configured Toggle dictation shortcut for the Dictation action

## Support

Documentation: https://github.com/alxbra/codex-status-actions#readme

Privacy: https://github.com/alxbra/codex-status-actions/blob/main/docs/PRIVACY.md

Troubleshooting: https://github.com/alxbra/codex-status-actions/blob/main/docs/TROUBLESHOOTING.md

Issues: https://github.com/alxbra/codex-status-actions/issues

## Search terms

Codex, OpenAI Codex, Stream Deck, developer tools, task status, usage limits, dictation, productivity, macOS

## Initial release notes

First Marketplace release with Codex Status, Codex Usage, and Codex Dictation actions for macOS.

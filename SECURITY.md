# Security Policy

## Supported version

Security fixes are provided for the latest tagged release.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting feature for this repository. Do not open a public issue containing credentials, prompts, command text, local paths, or exploit details.

Include the plugin version, macOS version, Stream Deck version, Codex CLI version, and minimal reproduction steps. Redact task content and local identifiers.

## Security boundaries

- The plugin is local-only and binds its hook receiver to a permission-restricted Unix-domain socket.
- Task IDs are validated before navigation.
- Child processes receive argument arrays rather than shell-interpolated input.
- Hook declarations require explicit trust of their current hash.
- The hook helper always fails open so Stream Deck availability cannot block Codex.
- Existing Codex hooks are preserved; modified owned declarations are not overwritten during cleanup.

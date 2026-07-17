import { chmod, copyFile, mkdir, readFile, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { HookMetadata } from "../codex/app-server-client";
import {
  HOOK_DIRECTORY_NAME,
  HOOK_HELPER_NAME,
  HOOK_SOCKET_NAME,
  MAX_HOOK_PAYLOAD_BYTES
} from "../constants";
import type { HookTrustStatus } from "../types";

type JsonRecord = Record<string, unknown>;

interface HookAppServer {
  listHooks(cwd: string, ownedCommand: string): Promise<HookMetadata[]>;
  writeHookStates(states: Record<string, { enabled: boolean; trusted_hash?: string | null }>): Promise<void>;
}

const OWNED_EVENTS = [
  { event: "PermissionRequest", matcher: "*" },
  { event: "PreToolUse", matcher: "^request_user_input$" },
  { event: "PostToolUse", matcher: "^request_user_input$" }
] as const;

export class HookManager {
  constructor(
    private readonly codexHome: string,
    private readonly appServer: HookAppServer
  ) {}

  get helperPath(): string {
    return path.join(this.codexHome, HOOK_DIRECTORY_NAME, HOOK_HELPER_NAME);
  }

  get hooksPath(): string {
    return path.join(this.codexHome, "hooks.json");
  }

  async install(): Promise<boolean> {
    const directory = path.dirname(this.helperPath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    const helperChanged = await this.writeIfChanged(this.helperPath, helperScript(), 0o700);
    const config = await this.readHooksFile();
    const changed = this.mergeOwnedHooks(config);
    if (changed) await this.writeHooksFile(config);
    else await chmod(this.hooksPath, 0o600);
    return changed || helperChanged;
  }

  async uninstall(cwd: string): Promise<{ manualCleanupRequired: boolean; trustCleanupFailed: boolean }> {
    let trustCleanupFailed = false;
    try {
      const hooks = await this.listOwned(cwd);
      if (hooks.length > 0) {
        await this.appServer.writeHookStates(
          Object.fromEntries(hooks.map((hook) => [hook.key, { enabled: false, trusted_hash: null }]))
        );
      }
    } catch {
      trustCleanupFailed = true;
    }

    const config = await this.readHooksFile();
    const hooksRoot = isRecord(config.hooks) ? config.hooks : {};
    let changed = false;
    let manualCleanupRequired = false;
    for (const { event, matcher } of OWNED_EVENTS) {
      const groups = Array.isArray(hooksRoot[event]) ? hooksRoot[event] : [];
      const retained = groups.filter((group) => {
        if (!this.containsOwnedCommand(group)) return true;
        if (this.isExactOwnedGroup(group, matcher)) return false;
        manualCleanupRequired = true;
        return true;
      });
      if (retained.length !== groups.length) {
        hooksRoot[event] = retained;
        changed = true;
      }
    }
    if (changed) {
      config.hooks = hooksRoot;
      await this.writeHooksFile(config);
    }
    const directory = path.dirname(this.helperPath);
    await Promise.all([
      rm(this.helperPath, { force: true }),
      rm(path.join(directory, HOOK_SOCKET_NAME), { force: true })
    ]);
    await rmdir(directory).catch(() => undefined);
    return { manualCleanupRequired, trustCleanupFailed };
  }

  async trust(cwd: string): Promise<void> {
    const hooks = await this.listOwned(cwd);
    if (hooks.length !== OWNED_EVENTS.length) throw new Error("Installed status hooks were not discovered");
    await this.appServer.writeHookStates(
      Object.fromEntries(hooks.map((hook) => [hook.key, { enabled: true, trusted_hash: hook.currentHash }]))
    );
  }

  async listOwned(cwd: string): Promise<HookMetadata[]> {
    return this.appServer.listHooks(cwd, this.command);
  }

  async status(cwd: string): Promise<{ status: HookTrustStatus; count: number }> {
    try {
      const hooks = await this.listOwned(cwd);
      if (hooks.length < OWNED_EVENTS.length) return { status: "missing", count: hooks.length };
      if (hooks.length > OWNED_EVENTS.length) return { status: "modified", count: hooks.length };
      if (hooks.some((hook) => !hook.enabled)) return { status: "disabled", count: hooks.length };
      if (hooks.some((hook) => hook.trustStatus === "modified"))
        return { status: "modified", count: hooks.length };
      if (hooks.every((hook) => hook.trustStatus === "trusted"))
        return { status: "trusted", count: hooks.length };
      return { status: "untrusted", count: hooks.length };
    } catch {
      return { status: "error", count: 0 };
    }
  }

  private async readHooksFile(): Promise<JsonRecord> {
    try {
      const content = await readFile(this.hooksPath, "utf8");
      const parsed: unknown = JSON.parse(content);
      if (!isRecord(parsed)) throw new Error("Codex hooks.json must contain a JSON object");
      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { hooks: {} };
      throw error;
    }
  }

  private mergeOwnedHooks(config: JsonRecord): boolean {
    const hooks = isRecord(config.hooks) ? config.hooks : {};
    let changed = !isRecord(config.hooks);
    const command = this.command;

    for (const declaration of OWNED_EVENTS) {
      const configured = hooks[declaration.event];
      const existing: unknown[] = Array.isArray(configured) ? Array.from(configured as unknown[]) : [];
      if (existing.some((group) => this.containsOwnedCommand(group))) continue;
      existing.push({
        matcher: declaration.matcher,
        hooks: [{ type: "command", command, timeout: 1 }]
      });
      hooks[declaration.event] = existing;
      changed = true;
    }
    config.hooks = hooks;
    return changed;
  }

  private containsOwnedCommand(value: unknown): boolean {
    if (!isRecord(value) || !Array.isArray(value.hooks)) return false;
    return value.hooks.some((handler) => isRecord(handler) && handler.command === this.command);
  }

  private isExactOwnedGroup(value: unknown, matcher: string): boolean {
    if (
      !isRecord(value) ||
      value.matcher !== matcher ||
      !Array.isArray(value.hooks) ||
      value.hooks.length !== 1
    ) {
      return false;
    }
    const handlers = value.hooks as unknown[];
    const handler = handlers[0];
    if (!isRecord(handler)) return false;
    return (
      handler.type === "command" &&
      handler.command === this.command &&
      handler.timeout === 1 &&
      Object.keys(handler).every((key) => ["type", "command", "timeout"].includes(key))
    );
  }

  private get command(): string {
    return `/bin/sh ${shellQuote(this.helperPath)}`;
  }

  private async writeHooksFile(config: JsonRecord): Promise<void> {
    await mkdir(this.codexHome, { recursive: true, mode: 0o700 });
    try {
      await stat(this.hooksPath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      await copyFile(this.hooksPath, `${this.hooksPath}.codex-status-actions-${timestamp}.bak`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const temporaryPath = `${this.hooksPath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
      await rename(temporaryPath, this.hooksPath);
      await chmod(this.hooksPath, 0o600);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  private async writeIfChanged(filePath: string, content: string, mode: number): Promise<boolean> {
    try {
      if ((await readFile(filePath, "utf8")) === content) {
        await chmod(filePath, mode);
        return false;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, content, { mode });
      await rename(temporaryPath, filePath);
      await chmod(filePath, mode);
    } finally {
      await rm(temporaryPath, { force: true });
    }
    return true;
  }
}

function helperScript(): string {
  return `#!/bin/sh
# Apache-2.0 helper installed by Codex: Status & Actions.
# It reduces Codex hook input to identifiers and an event name before forwarding locally.
set +e
payload=$(/usr/bin/head -c ${String(MAX_HOOK_PAYLOAD_BYTES + 1)})
payload_bytes=$(printf '%s' "$payload" | /usr/bin/wc -c | /usr/bin/tr -d ' ')
[ "$payload_bytes" -le ${String(MAX_HOOK_PAYLOAD_BYTES)} ] || exit 0
session_id=$(printf '%s' "$payload" | /usr/bin/plutil -extract session_id raw -o - -- - 2>/dev/null)
turn_id=$(printf '%s' "$payload" | /usr/bin/plutil -extract turn_id raw -o - -- - 2>/dev/null)
hook_event=$(printf '%s' "$payload" | /usr/bin/plutil -extract hook_event_name raw -o - -- - 2>/dev/null)
tool_name=$(printf '%s' "$payload" | /usr/bin/plutil -extract tool_name raw -o - -- - 2>/dev/null)

printf '%s' "$session_id" | /usr/bin/grep -Eq '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' || exit 0
printf '%s' "$turn_id" | /usr/bin/grep -Eq '^[A-Za-z0-9_-]{1,128}$' || turn_id=''

case "$hook_event:$tool_name" in
  PermissionRequest:*) event='permission-requested' ;;
  PreToolUse:request_user_input) event='question-opened' ;;
  PostToolUse:request_user_input) event='question-closed' ;;
  *) exit 0 ;;
esac

base=$(CDPATH= cd -- "$(/usr/bin/dirname -- "$0")" && /bin/pwd)
socket="$base/status.sock"

if [ -n "$turn_id" ]; then
  body=$(printf '{"version":1,"event":"%s","threadId":"%s","turnId":"%s"}' "$event" "$session_id" "$turn_id")
else
  body=$(printf '{"version":1,"event":"%s","threadId":"%s"}' "$event" "$session_id")
fi

printf '%s' "$body" | /usr/bin/curl --silent --max-time 0.2 --unix-socket "$socket" --header 'Content-Type: application/json' --data-binary @- http://localhost/hook >/dev/null 2>&1 || true
exit 0
`;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

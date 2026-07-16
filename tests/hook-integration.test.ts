import { chmod, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { request } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { AppServerClient } from "../src/codex/app-server-client";
import { HookManager } from "../src/hooks/hook-manager";
import { HookServer } from "../src/hooks/hook-server";
import type { HookEnvelope } from "../src/types";
import { waitFor } from "./helpers";

const threadId = "019f6b6d-644d-7701-8858-9da6837aaaaa";
const servers = new Set<HookServer>();

afterEach(async () => {
  const tracked = [...servers];
  servers.clear();
  await Promise.all(tracked.map((server) => server.stop()));
});

describe("Codex hook integration", () => {
  it("preserves existing hooks and forwards only the reduced envelope", async () => {
    const codexHome = await mkdtemp(path.join(tmpdir(), "codex-hooks-"));
    await writeFile(
      path.join(codexHome, "hooks.json"),
      JSON.stringify({
        hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo existing" }] }] }
      })
    );
    const manager = new HookManager(codexHome, new AppServerClient("/bin/false"));
    await manager.install();
    await chmod(manager.hooksPath, 0o644);
    expect(await manager.install()).toBe(false);
    expect((await stat(manager.hooksPath)).mode & 0o777).toBe(0o600);
    const config = JSON.parse(await readFile(path.join(codexHome, "hooks.json"), "utf8")) as {
      hooks: { PreToolUse: unknown[]; PermissionRequest: unknown[]; PostToolUse: unknown[] };
    };
    expect(config.hooks.PreToolUse).toHaveLength(2);
    expect(config.hooks.PermissionRequest).toHaveLength(1);
    expect(config.hooks.PostToolUse).toHaveLength(1);

    let received: HookEnvelope | undefined;
    const server = trackServer(
      new HookServer(codexHome, (envelope) => {
        received = envelope;
      })
    );
    await server.start();
    await runHelper(manager.helperPath, {
      session_id: threadId,
      turn_id: "turn-1",
      hook_event_name: "PermissionRequest",
      tool_name: "Bash",
      tool_input: { command: "TOP SECRET COMMAND" },
      questions: ["TOP SECRET QUESTION"]
    });
    await waitFor(() => Boolean(received), "Timed out waiting for hook event");
    expect(received).toMatchObject({
      version: 1,
      event: "permission-requested",
      threadId,
      turnId: "turn-1"
    });
    expect(typeof received?.timestamp).toBe("number");
    expect(JSON.stringify(received)).not.toContain("TOP SECRET");
  });

  it("exits successfully when Stream Deck is unavailable", async () => {
    const codexHome = await mkdtemp(path.join(tmpdir(), "codex-hooks-offline-"));
    await mkdir(path.join(codexHome, "codex-status-actions"), { recursive: true });
    const manager = new HookManager(codexHome, new AppServerClient("/bin/false"));
    await manager.install();
    const code = await runHelper(manager.helperPath, {
      session_id: threadId,
      turn_id: "turn-1",
      hook_event_name: "PreToolUse",
      tool_name: "request_user_input"
    });
    expect(code).toBe(0);
  });

  it("does not remove an owned declaration after manual modification", async () => {
    const codexHome = await mkdtemp(path.join(tmpdir(), "codex-hooks-modified-"));
    const manager = new HookManager(codexHome, new AppServerClient("/bin/false"));
    await manager.install();
    const hooksPath = path.join(codexHome, "hooks.json");
    const config = JSON.parse(await readFile(hooksPath, "utf8")) as {
      hooks: { PermissionRequest: Array<{ matcher: string }> };
    };
    const permissionHook = config.hooks.PermissionRequest[0];
    if (!permissionHook) throw new Error("Permission hook was not installed");
    permissionHook.matcher = "Bash";
    await writeFile(hooksPath, JSON.stringify(config));

    const result = await manager.uninstall(process.cwd());
    const after = JSON.parse(await readFile(hooksPath, "utf8")) as {
      hooks: { PermissionRequest: unknown[] };
    };
    expect(result.manualCleanupRequired).toBe(true);
    expect(after.hooks.PermissionRequest).toHaveLength(1);
  });

  it("rejects hook envelopes with fields outside the allow-list", async () => {
    const codexHome = await mkdtemp(path.join(tmpdir(), "csa-hooks-"));
    let received = false;
    const server = trackServer(
      new HookServer(codexHome, () => {
        received = true;
      })
    );
    await Promise.all([server.start(), server.start()]);
    const status = await postEnvelope(server.socketPath, {
      version: 1,
      event: "question-opened",
      threadId,
      timestamp: Date.now(),
      prompt: "must not be accepted"
    });
    expect(status).toBe(400);
    expect(received).toBe(false);
  });
});

function trackServer(server: HookServer): HookServer {
  servers.add(server);
  return server;
}

async function runHelper(helperPath: string, payload: object): Promise<number | null> {
  await chmod(helperPath, 0o700);
  return new Promise((resolve, reject) => {
    const child = spawn("/bin/sh", [helperPath], { stdio: ["pipe", "ignore", "ignore"] });
    child.once("error", reject);
    child.once("exit", resolve);
    child.stdin.end(JSON.stringify(payload));
  });
}

function postEnvelope(socketPath: string, payload: object): Promise<number | undefined> {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const message = request(
      {
        socketPath,
        path: "/hook",
        method: "POST",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) }
      },
      (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode));
      }
    );
    message.once("error", reject);
    message.end(body);
  });
}

import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import { AppServerClient } from "../src/codex/app-server-client";

const clients: AppServerClient[] = [];

afterEach(async () => {
  await Promise.all(clients.map((client) => client.stop()));
  clients.length = 0;
});

describe("app-server client", () => {
  it("initializes, lists task metadata, and reads hook trust", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "fake-codex-"));
    const executable = path.join(root, "codex");
    await writeFile(executable, fakeCodexScript());
    await chmod(executable, 0o700);

    const client = new AppServerClient(executable);
    clients.push(client);
    const threads = await client.listThreads();
    expect(threads).toEqual([
      expect.objectContaining({
        id: "019f6b6d-644d-7701-8858-9da6837aaaaa",
        title: "Fake task",
        updatedAt: 2_000
      })
    ]);
    const hooks = await client.listHooks("/tmp", "/tmp/hook-forwarder.sh");
    expect(hooks).toEqual([
      expect.objectContaining({ trustStatus: "untrusted", currentHash: "sha256:test" })
    ]);
  });

  it("rejects pending requests immediately when stopped", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "fake-codex-stop-"));
    const executable = path.join(root, "codex");
    await writeFile(executable, unresponsiveCodexScript());
    await chmod(executable, 0o700);

    const client = new AppServerClient(executable);
    clients.push(client);
    await client.start();
    const pending = expect(client.listThreads()).rejects.toThrow("app-server stopped");
    await new Promise((resolve) => setImmediate(resolve));
    await client.stop();
    await pending;
  });

  it("ignores exit events from a superseded process", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "fake-codex-restart-"));
    const executable = path.join(root, "codex");
    await writeFile(executable, fakeCodexScript());
    await chmod(executable, 0o700);

    const client = new AppServerClient(executable);
    clients.push(client);
    await client.start();
    let disconnections = 0;
    client.on("disconnected", () => disconnections++);

    const stopping = client.stop();
    await client.start();
    await stopping;

    expect(disconnections).toBe(0);
    expect(await client.listThreads()).toHaveLength(1);
  });
});

function fakeCodexScript(): string {
  return `#!/bin/sh
while IFS= read -r line; do
  id=$(printf '%s' "$line" | /usr/bin/sed -E 's/.*"id":([0-9]+).*/\\1/')
  case "$line" in
    *'"method":"initialize"'*) printf '{"id":%s,"result":{"userAgent":"fake"}}\\n' "$id" ;;
    *'"method":"thread/list"'*) printf '{"id":%s,"result":{"data":[{"id":"019f6b6d-644d-7701-8858-9da6837aaaaa","parentThreadId":null,"preview":"Preview","ephemeral":false,"updatedAt":1,"recencyAt":2,"cwd":"/tmp/project","name":"Fake task"}],"nextCursor":null}}\\n' "$id" ;;
    *'"method":"hooks/list"'*) printf '{"id":%s,"result":{"data":[{"hooks":[{"key":"hook-key","command":"/bin/sh /tmp/hook-forwarder.sh","enabled":true,"currentHash":"sha256:test","trustStatus":"untrusted"}]}]}}\\n' "$id" ;;
    *'"method":"config/batchWrite"'*) printf '{"id":%s,"result":{}}\\n' "$id" ;;
  esac
done
`;
}

function unresponsiveCodexScript(): string {
  return `#!/bin/sh
while IFS= read -r line; do
  id=$(printf '%s' "$line" | /usr/bin/sed -E 's/.*"id":([0-9]+).*/\\1/')
  case "$line" in
    *'"method":"initialize"'*) printf '{"id":%s,"result":{"userAgent":"fake"}}\\n' "$id" ;;
  esac
done
`;
}

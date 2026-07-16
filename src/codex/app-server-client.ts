import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { createInterface } from "node:readline";

import { z } from "zod";

import { PLUGIN_VERSION } from "../constants";
import type { ThreadRecord } from "../types";
import { findCodexBinary, normalizeTitle, toErrorMessage } from "../util";

const threadSchema = z.object({
  id: z.string(),
  parentThreadId: z.string().nullable().optional(),
  preview: z.string().default(""),
  ephemeral: z.boolean().default(false),
  updatedAt: z.number(),
  recencyAt: z.number().nullable().optional(),
  cwd: z.string(),
  name: z.string().nullable().optional()
});

const threadListSchema = z.object({
  data: z.array(threadSchema),
  nextCursor: z.string().nullable()
});

const hookMetadataSchema = z.object({
  key: z.string(),
  command: z.string().nullable(),
  enabled: z.boolean(),
  currentHash: z.string(),
  trustStatus: z.enum(["managed", "untrusted", "trusted", "modified"])
});

const hooksListSchema = z.object({
  data: z.array(
    z.object({
      hooks: z.array(hookMetadataSchema)
    })
  )
});

export type HookMetadata = z.infer<typeof hookMetadataSchema>;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export class AppServerClient extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | undefined;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private starting: Promise<void> | undefined;
  private stopped = false;

  constructor(private readonly binaryOverride?: string) {
    super();
  }

  get connected(): boolean {
    return Boolean(this.child && !this.child.killed);
  }

  async start(): Promise<void> {
    if (this.connected) return;
    if (this.starting) return this.starting;
    this.stopped = false;
    this.starting = this.startProcess().finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    const child = this.child;
    this.child = undefined;
    if (!child || child.killed) return;

    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
        resolve();
      }, 1_000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  async listThreads(limit = 100): Promise<ThreadRecord[]> {
    await this.start();
    const records: ThreadRecord[] = [];
    let cursor: string | null = null;

    do {
      const raw = await this.request("thread/list", {
        cursor,
        limit: Math.min(limit - records.length, 100),
        sortKey: "updated_at",
        sortDirection: "desc",
        archived: false
      });
      const page = threadListSchema.parse(raw);
      for (const thread of page.data) {
        records.push({
          id: thread.id,
          title: normalizeTitle(thread.name ?? thread.preview, thread.cwd, thread.id),
          cwd: thread.cwd,
          updatedAt: (thread.recencyAt ?? thread.updatedAt) * 1_000,
          archived: false,
          ephemeral: thread.ephemeral,
          ...(thread.parentThreadId ? { parentThreadId: thread.parentThreadId } : {})
        });
      }
      cursor = page.nextCursor;
    } while (cursor && records.length < limit);

    return records;
  }

  async listHooks(cwd: string, ownedCommandPath: string): Promise<HookMetadata[]> {
    await this.start();
    const result = hooksListSchema.parse(await this.request("hooks/list", { cwds: [cwd] }));
    return result.data
      .flatMap((entry) => entry.hooks)
      .filter((hook) => hook.command?.includes(ownedCommandPath));
  }

  async writeHookStates(
    states: Record<string, { enabled: boolean; trusted_hash?: string | null }>
  ): Promise<void> {
    await this.start();
    await this.request("config/batchWrite", {
      edits: [
        {
          keyPath: "hooks.state",
          value: states,
          mergeStrategy: "upsert"
        }
      ],
      reloadUserConfig: true
    });
  }

  private async startProcess(): Promise<void> {
    const binary = await findCodexBinary(this.binaryOverride);
    if (!binary) throw new Error("Codex binary was not found");

    const child = spawn(binary, ["app-server"], {
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.child = child;

    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on("line", (line) => this.handleLine(line));
    child.stdin.on("error", (error) => {
      if (!this.stopped) this.handleExit(error);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      const message = chunk.trim();
      if (message) this.emit("diagnostic", message.slice(0, 500));
    });
    child.once("error", (error) => this.handleExit(error));
    child.once("exit", (code, signal) => {
      if (this.child === child) this.child = undefined;
      if (!this.stopped)
        this.handleExit(new Error(`Codex app-server exited (${String(code ?? signal ?? "unknown")})`));
    });

    await this.request("initialize", {
      clientInfo: {
        name: "codex_status_actions",
        title: "Codex Status & Actions",
        version: PLUGIN_VERSION
      },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
        optOutNotificationMethods: []
      }
    });
    this.notify("initialized", {});
    this.emit("connected");
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const child = this.child;
    if (!child || child.killed) return Promise.reject(new Error("Codex app-server is not connected"));
    const id = this.nextId++;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, 10_000);
      this.pending.set(id, { resolve, reject, timeout });
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`, (error) => {
        if (error) {
          clearTimeout(timeout);
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  private notify(method: string, params: unknown): void {
    const child = this.child;
    if (!child || child.killed) return;
    child.stdin.write(`${JSON.stringify({ method, params })}\n`, (error) => {
      if (error && !this.stopped) this.emit("diagnostic", toErrorMessage(error).slice(0, 500));
    });
  }

  private handleLine(line: string): void {
    let message: { id?: unknown; result?: unknown; error?: { message?: string } };
    try {
      message = JSON.parse(line) as typeof message;
    } catch {
      this.emit("diagnostic", "Codex app-server emitted malformed JSON");
      return;
    }
    if (typeof message.id !== "number") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message ?? "Codex app-server request failed"));
    else pending.resolve(message.result);
  }

  private handleExit(error: unknown): void {
    const message = new Error(toErrorMessage(error));
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(message);
    }
    this.pending.clear();
    this.emit("disconnected", message);
  }
}

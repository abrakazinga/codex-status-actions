import { createServer, type IncomingMessage, type Server } from "node:http";
import { chmod, mkdir, unlink } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { HOOK_DIRECTORY_NAME, HOOK_SOCKET_NAME, MAX_HOOK_PAYLOAD_BYTES } from "../constants";
import type { HookEnvelope } from "../types";

const envelopeSchema = z
  .object({
    version: z.literal(1),
    event: z.enum(["permission-requested", "question-opened", "question-closed"]),
    threadId: z.uuid(),
    turnId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,128}$/)
      .optional(),
    timestamp: z.number().int().positive()
  })
  .strict();

export class HookServer {
  private server: Server | undefined;
  private starting: Promise<void> | undefined;

  constructor(
    private readonly codexHome: string,
    private readonly onEnvelope: (envelope: HookEnvelope) => void
  ) {}

  get socketPath(): string {
    return path.join(this.codexHome, HOOK_DIRECTORY_NAME, HOOK_SOCKET_NAME);
  }

  async start(): Promise<void> {
    if (this.server) return;
    if (this.starting) return this.starting;
    this.starting = this.startServer().finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }

  private async startServer(): Promise<void> {
    await mkdir(path.dirname(this.socketPath), { recursive: true, mode: 0o700 });
    await unlink(this.socketPath).catch(() => undefined);

    const server = createServer((request, response) => void this.handleRequest(request, response));
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(this.socketPath, () => {
        server.off("error", reject);
        resolve();
      });
    });
    try {
      await chmod(this.socketPath, 0o600);
      this.server = server;
    } catch (error) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await unlink(this.socketPath).catch(() => undefined);
      throw error;
    }
  }

  async stop(): Promise<void> {
    await this.starting?.catch(() => undefined);
    const server = this.server;
    this.server = undefined;
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await unlink(this.socketPath).catch(() => undefined);
  }

  private async handleRequest(
    request: IncomingMessage,
    response: import("node:http").ServerResponse
  ): Promise<void> {
    if (request.method !== "POST" || request.url !== "/hook") {
      response.writeHead(404).end();
      return;
    }

    let size = 0;
    const chunks: Buffer[] = [];
    try {
      for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        size += buffer.length;
        if (size > MAX_HOOK_PAYLOAD_BYTES) {
          response.writeHead(413).end();
          request.destroy();
          return;
        }
        chunks.push(buffer);
      }
      const parsed = envelopeSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      const envelope: HookEnvelope = {
        version: parsed.version,
        event: parsed.event,
        threadId: parsed.threadId,
        timestamp: parsed.timestamp,
        ...(parsed.turnId ? { turnId: parsed.turnId } : {})
      };
      this.onEnvelope(envelope);
      response.writeHead(204).end();
    } catch {
      response.writeHead(400).end();
    }
  }
}

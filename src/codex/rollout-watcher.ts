import { open, stat } from "node:fs/promises";

import chokidar, { type FSWatcher } from "chokidar";

import type { StatusEvent } from "../status/reducer";
import type { RolloutFileCursor } from "../types";
import { isThreadId } from "../util";

const READ_CHUNK_BYTES = 64 * 1024;
const MAX_LINE_BYTES = 1024 * 1024;
const WRITE_STABILITY_MS = 250;

interface RolloutEvent {
  type?: string;
  timestamp?: string;
  payload?: {
    type?: string;
    turn_id?: string;
    name?: string;
    call_id?: string;
    internal_chat_message_metadata_passthrough?: {
      turn_id?: string;
    };
  };
}

interface FileState {
  offset: number;
  identity?: string;
  processing?: Promise<void>;
}

export interface ParsedRolloutEvent {
  event: StatusEvent;
  baseline: boolean;
}

export class RolloutWatcher {
  private watcher: FSWatcher | undefined;
  private readonly files = new Map<string, FileState>();
  private readonly seen = new Set<string>();
  private readonly pendingInputCalls = new Map<string, string>();
  private initialScan = true;
  private stopped = true;

  constructor(
    private readonly sessionsDirectory: string,
    private readonly storedOffsets: Record<string, RolloutFileCursor>,
    private readonly firstInstallation: boolean,
    private readonly onEvent: (event: ParsedRolloutEvent) => void,
    private readonly onOffsetsChanged: (offsets: Record<string, RolloutFileCursor>) => void,
    private readonly onError: (error: unknown) => void = () => undefined
  ) {}

  async start(): Promise<void> {
    this.stopped = false;
    this.watcher = chokidar.watch(this.sessionsDirectory, {
      ignoreInitial: false,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: WRITE_STABILITY_MS,
        pollInterval: 25
      },
      ignored: (filePath, metadata) => Boolean(metadata?.isFile() && !filePath.endsWith(".jsonl"))
    });
    this.watcher.on("add", (filePath) => this.queue(filePath));
    this.watcher.on("change", (filePath) => this.queue(filePath));
    this.watcher.on("error", (error) => this.onError(error));
    const watcher = this.watcher;
    await new Promise<void>((resolve, reject) => {
      const onStartupError = (error: unknown): void =>
        reject(error instanceof Error ? error : new Error("Rollout watcher startup failed"));
      watcher.once("error", onStartupError);
      watcher.once("ready", () => {
        watcher.off("error", onStartupError);
        const pending = [...this.files.values()]
          .map((state) => state.processing)
          .filter((value): value is Promise<void> => Boolean(value));
        void Promise.all(pending).then(() => {
          this.initialScan = false;
          resolve();
        }, reject);
      });
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    const watcher = this.watcher;
    this.watcher = undefined;
    await watcher?.close();
    const pending = [...this.files.values()]
      .map((state) => state.processing)
      .filter((value): value is Promise<void> => Boolean(value));
    await Promise.all(pending);
  }

  private queue(filePath: string): void {
    if (this.stopped) return;
    const existing = this.files.get(filePath) ?? {
      offset: this.storedOffsets[filePath]?.offset ?? 0,
      ...(this.storedOffsets[filePath]?.identity ? { identity: this.storedOffsets[filePath].identity } : {})
    };
    const isNew = !this.files.has(filePath);
    this.files.set(filePath, existing);
    const baseline = this.firstInstallation && this.initialScan && isNew && existing.offset === 0;
    existing.processing = (existing.processing ?? Promise.resolve())
      .then(() => this.readNewContent(filePath, existing, baseline))
      .catch((error: unknown) => {
        if (!this.stopped && (error as NodeJS.ErrnoException).code !== "ENOENT") this.onError(error);
      });
  }

  private async readNewContent(filePath: string, state: FileState, baseline: boolean): Promise<void> {
    const metadata = await stat(filePath);
    const identity = `${String(metadata.dev)}:${String(metadata.ino)}`;
    let cursorChanged = state.identity !== identity;
    if ((state.identity && state.identity !== identity) || metadata.size < state.offset) {
      state.offset = 0;
      cursorChanged = true;
    }
    state.identity = identity;
    if (metadata.size === state.offset) {
      if (cursorChanged && !this.stopped) this.onOffsetsChanged(this.currentOffsets());
      return;
    }

    const handle = await open(filePath, "r");
    try {
      const threadId = threadIdFromPath(filePath);
      let readOffset = state.offset;
      let pending = Buffer.alloc(0);
      let discardedBytes = 0;

      while (readOffset < metadata.size) {
        const length = Math.min(READ_CHUNK_BYTES, metadata.size - readOffset);
        const buffer = Buffer.allocUnsafe(length);
        const { bytesRead } = await handle.read(buffer, 0, length, readOffset);
        if (bytesRead === 0) break;
        readOffset += bytesRead;
        let data = buffer.subarray(0, bytesRead);

        if (discardedBytes > 0) {
          const newline = data.indexOf(0x0a);
          if (newline < 0) {
            discardedBytes += data.length;
            continue;
          }
          state.offset += discardedBytes + newline + 1;
          discardedBytes = 0;
          cursorChanged = true;
          data = data.subarray(newline + 1);
        }

        if (pending.length > 0) data = Buffer.concat([pending, data]);
        let start = 0;
        for (let newline = data.indexOf(0x0a); newline >= 0; newline = data.indexOf(0x0a, start)) {
          const line = data.subarray(start, newline);
          state.offset += line.length + 1;
          cursorChanged = true;
          if (threadId && line.length <= MAX_LINE_BYTES) {
            this.parseLine(threadId, line.toString("utf8"), baseline);
          }
          start = newline + 1;
        }
        pending = Buffer.from(data.subarray(start));
        if (pending.length > MAX_LINE_BYTES) {
          discardedBytes = pending.length;
          pending = Buffer.alloc(0);
        }
      }

      if (cursorChanged && !this.stopped) this.onOffsetsChanged(this.currentOffsets());
    } finally {
      await handle.close();
    }
  }

  private parseLine(threadId: string, line: string, baseline: boolean): void {
    if (!line.trim()) return;
    let record: RolloutEvent;
    try {
      record = JSON.parse(line) as RolloutEvent;
    } catch {
      return;
    }
    const timestamp = record.timestamp ? Date.parse(record.timestamp) : Date.now();
    if (!Number.isFinite(timestamp)) return;
    const payloadType = record.payload?.type;
    const payloadName = record.payload?.name;
    const callId = record.payload?.call_id;
    const turnId =
      record.payload?.turn_id ?? record.payload?.internal_chat_message_metadata_passthrough?.turn_id;
    const fingerprint = `${threadId}:${record.timestamp ?? ""}:${record.type ?? ""}:${payloadType ?? ""}:${payloadName ?? ""}:${callId ?? ""}:${turnId ?? ""}`;
    if (this.seen.has(fingerprint)) return;
    this.seen.add(fingerprint);
    if (this.seen.size > 2_000) this.seen.delete(this.seen.values().next().value ?? "");

    let event: StatusEvent | undefined;
    if (
      record.type === "response_item" &&
      payloadType === "function_call" &&
      payloadName === "request_user_input" &&
      callId
    ) {
      this.pendingInputCalls.set(callId, threadId);
      event = {
        type: "input-requested",
        threadId,
        callId,
        timestamp,
        ...(turnId ? { turnId } : {})
      };
    } else if (
      record.type === "response_item" &&
      payloadType === "function_call_output" &&
      callId &&
      this.pendingInputCalls.get(callId) === threadId
    ) {
      this.pendingInputCalls.delete(callId);
      event = { type: "input-resolved", threadId, callId, timestamp };
    } else if (
      record.type === "event_msg" &&
      (payloadType === "task_started" || payloadType === "turn_started")
    ) {
      event = { type: "turn-started", threadId, timestamp, ...(turnId ? { turnId } : {}) };
    } else if (
      record.type === "event_msg" &&
      (payloadType === "task_complete" || payloadType === "turn_complete")
    ) {
      this.clearPendingInput(threadId);
      event = { type: "turn-completed", threadId, timestamp, ...(turnId ? { turnId } : {}) };
    } else if (
      record.type === "event_msg" &&
      ["turn_aborted", "error", "stream_error"].includes(payloadType ?? "")
    ) {
      this.clearPendingInput(threadId);
      event = { type: "turn-error", threadId, timestamp, ...(turnId ? { turnId } : {}) };
    } else if (
      (record.type === "response_item" && !this.hasPendingInput(threadId)) ||
      (record.type === "event_msg" &&
        ["agent_message", "user_message", "patch_apply_end"].includes(payloadType ?? ""))
    ) {
      event = { type: "activity", threadId, timestamp };
    }
    if (event && !this.stopped) this.onEvent({ event, baseline });
  }

  private hasPendingInput(threadId: string): boolean {
    for (const pendingThreadId of this.pendingInputCalls.values()) {
      if (pendingThreadId === threadId) return true;
    }
    return false;
  }

  private clearPendingInput(threadId: string): void {
    for (const [callId, pendingThreadId] of this.pendingInputCalls) {
      if (pendingThreadId === threadId) this.pendingInputCalls.delete(callId);
    }
  }

  private currentOffsets(): Record<string, RolloutFileCursor> {
    return Object.fromEntries(
      [...this.files].map(([filePath, state]) => [
        filePath,
        { offset: state.offset, ...(state.identity ? { identity: state.identity } : {}) }
      ])
    );
  }
}

function threadIdFromPath(filePath: string): string | undefined {
  const match = /([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.jsonl$/i.exec(
    filePath
  );
  const candidate = match?.[1];
  return candidate && isThreadId(candidate) ? candidate : undefined;
}

import { appendFile, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { RolloutWatcher, type ParsedRolloutEvent } from "../src/codex/rollout-watcher";
import {
  initialRuntimeState,
  persistRuntimeState,
  reduceRuntimeState,
  visualState
} from "../src/status/reducer";
import type { RolloutFileCursor } from "../src/types";
import { waitFor } from "./helpers";

const threadId = "019f6b6d-644d-7701-8858-9da6837aaaaa";
const watchers = new Set<RolloutWatcher>();

afterEach(async () => {
  const tracked = [...watchers];
  watchers.clear();
  await Promise.all(tracked.map((watcher) => watcher.stop()));
});

describe("rollout watcher", () => {
  it("baselines old completions and emits appended turns as live", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "codex-rollout-"));
    const sessions = path.join(root, "sessions", "2026", "07", "16");
    await mkdir(sessions, { recursive: true });
    const file = path.join(sessions, `rollout-${threadId}.jsonl`);
    await writeFile(
      file,
      `${JSON.stringify({ type: "event_msg", timestamp: "2026-07-16T10:00:00Z", payload: { type: "task_complete", turn_id: "old" } })}\n`
    );

    const events: ParsedRolloutEvent[] = [];
    const watcher = new RolloutWatcher(
      sessions,
      {},
      true,
      (event) => events.push(event),
      () => undefined
    );
    watchers.add(watcher);
    await watcher.start();
    expect(events.some(({ event, baseline }) => event.type === "turn-completed" && baseline)).toBe(true);

    await appendFile(
      file,
      `${JSON.stringify({ type: "event_msg", timestamp: "2026-07-16T10:01:00Z", payload: { type: "task_started", turn_id: "new" } })}\n`
    );
    await waitFor(
      () => events.some(({ event, baseline }) => event.type === "turn-started" && !baseline),
      "Timed out waiting for rollout event"
    );
    await watcher.stop();
  });

  it("captures a completion appended immediately after activity", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "codex-rollout-terminal-"));
    const sessions = path.join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    const file = path.join(sessions, `rollout-${threadId}.jsonl`);
    await writeFile(file, `${rolloutLine("task_started", "rapid")}\n`);

    const events: ParsedRolloutEvent[] = [];
    const watcher = new RolloutWatcher(
      sessions,
      {},
      false,
      (event) => events.push(event),
      () => undefined
    );
    watchers.add(watcher);
    await watcher.start();

    await appendFile(
      file,
      `${JSON.stringify({ type: "response_item", timestamp: new Date().toISOString(), payload: { type: "message" } })}\n`
    );
    await new Promise((resolve) => setTimeout(resolve, 75));
    await appendFile(file, `${rolloutLine("task_complete", "rapid")}\n`);

    await waitFor(
      () => events.some(({ event }) => event.type === "turn-completed"),
      "Timed out waiting for terminal rollout event"
    );
  });

  it("detects planning questions without retaining their content", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "codex-rollout-question-"));
    const sessions = path.join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    const file = path.join(sessions, `rollout-${threadId}.jsonl`);
    await writeFile(file, `${rolloutLine("task_started", "question-turn")}\n`);

    const events: ParsedRolloutEvent[] = [];
    const watcher = new RolloutWatcher(
      sessions,
      {},
      false,
      (event) => events.push(event),
      () => undefined
    );
    watchers.add(watcher);
    await watcher.start();

    const callId = "call-question";
    await appendFile(
      file,
      `${JSON.stringify({
        type: "response_item",
        timestamp: new Date().toISOString(),
        payload: {
          type: "function_call",
          name: "request_user_input",
          call_id: callId,
          arguments: "sensitive question content",
          internal_chat_message_metadata_passthrough: { turn_id: "question-turn" }
        }
      })}\n`
    );
    await waitFor(
      () => events.some(({ event }) => event.type === "input-requested"),
      "Timed out waiting for planning question"
    );
    const requested = events.find(({ event }) => event.type === "input-requested")?.event;
    expect(requested).toMatchObject({
      type: "input-requested",
      threadId,
      turnId: "question-turn",
      callId
    });
    if (requested?.type !== "input-requested") throw new Error("Planning question event was not emitted");
    expect(typeof requested.timestamp).toBe("number");
    expect(JSON.stringify(events)).not.toContain("sensitive question content");
    let runtime = events.reduce(
      (state, { event }) => reduceRuntimeState(state, event),
      initialRuntimeState()
    );
    expect(visualState(runtime)).toBe("needs-user");

    await appendFile(
      file,
      `${JSON.stringify({
        type: "response_item",
        timestamp: new Date().toISOString(),
        payload: { type: "function_call_output", call_id: callId, output: "sensitive answer" }
      })}\n`
    );
    await waitFor(
      () => events.some(({ event }) => event.type === "input-resolved"),
      "Timed out waiting for planning answer"
    );
    expect(events.find(({ event }) => event.type === "input-resolved")?.event).toMatchObject({
      type: "input-resolved",
      threadId,
      callId
    });
    expect(JSON.stringify(events)).not.toContain("sensitive answer");
    runtime = events.reduce((state, { event }) => reduceRuntimeState(state, event), initialRuntimeState());
    expect(visualState(runtime)).toBe("working");
  });

  it("does not treat unrelated function calls as planning questions", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "codex-rollout-other-tool-"));
    const sessions = path.join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    const file = path.join(sessions, `rollout-${threadId}.jsonl`);
    await writeFile(
      file,
      `${JSON.stringify({
        type: "response_item",
        timestamp: new Date().toISOString(),
        payload: { type: "function_call", name: "some_other_tool", call_id: "call-other" }
      })}\n`
    );

    const events: ParsedRolloutEvent[] = [];
    const watcher = new RolloutWatcher(
      sessions,
      {},
      false,
      (event) => events.push(event),
      () => undefined
    );
    watchers.add(watcher);
    await watcher.start();
    expect(events.map(({ event }) => event.type)).toEqual(["activity"]);
  });

  it("clears a persisted planning question when its output arrives after restart", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "codex-rollout-question-restart-"));
    const sessions = path.join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    const file = path.join(sessions, `rollout-${threadId}.jsonl`);
    const callId = "call-before-restart";
    await writeFile(
      file,
      `${JSON.stringify({
        type: "response_item",
        timestamp: new Date().toISOString(),
        payload: { type: "function_call", name: "request_user_input", call_id: callId }
      })}\n`
    );

    let cursors: Record<string, RolloutFileCursor> = {};
    const beforeRestart: ParsedRolloutEvent[] = [];
    const first = new RolloutWatcher(
      sessions,
      cursors,
      false,
      (event) => beforeRestart.push(event),
      (next) => {
        cursors = next;
      }
    );
    watchers.add(first);
    await first.start();
    await first.stop();
    const waiting = beforeRestart.reduce(
      (state, { event }) => reduceRuntimeState(state, event),
      initialRuntimeState()
    );
    const restored = initialRuntimeState(persistRuntimeState(waiting));
    expect(visualState(restored)).toBe("needs-user");

    await appendFile(
      file,
      `${JSON.stringify({
        type: "response_item",
        timestamp: new Date().toISOString(),
        payload: { type: "function_call_output", call_id: callId }
      })}\n`
    );
    const afterRestart: ParsedRolloutEvent[] = [];
    const second = new RolloutWatcher(
      sessions,
      cursors,
      false,
      (event) => afterRestart.push(event),
      () => undefined
    );
    watchers.add(second);
    await second.start();

    expect(afterRestart.map(({ event }) => event.type)).toEqual(["activity"]);
    const resumed = afterRestart.reduce((state, { event }) => reduceRuntimeState(state, event), restored);
    expect(visualState(resumed)).toBe("working");
  });

  it("replays an incomplete line after restart without losing its prefix", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "codex-rollout-partial-"));
    const sessions = path.join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    const file = path.join(sessions, `rollout-${threadId}.jsonl`);
    const line = JSON.stringify({
      type: "event_msg",
      timestamp: "2026-07-16T10:02:00Z",
      payload: { type: "task_started", turn_id: "partial" }
    });
    const splitAt = Math.floor(line.length / 2);
    await writeFile(file, line.slice(0, splitAt));

    let offsets: Record<string, RolloutFileCursor> = {};
    const first = new RolloutWatcher(
      sessions,
      offsets,
      false,
      () => undefined,
      (next) => {
        offsets = next;
      }
    );
    watchers.add(first);
    await first.start();
    await first.stop();
    expect(offsets[file]?.offset ?? 0).toBe(0);

    await appendFile(file, `${line.slice(splitAt)}\n`);
    const events: ParsedRolloutEvent[] = [];
    const second = new RolloutWatcher(
      sessions,
      offsets,
      false,
      (event) => events.push(event),
      () => undefined
    );
    watchers.add(second);
    await second.start();
    expect(events).toHaveLength(1);
    expect(events[0]?.event.type).toBe("turn-started");
    await second.stop();
  });

  it("skips oversized records without losing later status events", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "codex-rollout-large-"));
    const sessions = path.join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    const file = path.join(sessions, `rollout-${threadId}.jsonl`);
    const event = JSON.stringify({
      type: "event_msg",
      timestamp: "2026-07-16T10:03:00Z",
      payload: { type: "task_complete", turn_id: "after-large-record" }
    });
    await writeFile(file, `${"x".repeat(1024 * 1024 + 1)}\n${event}\n`);

    const events: ParsedRolloutEvent[] = [];
    const watcher = new RolloutWatcher(
      sessions,
      {},
      false,
      (parsed) => events.push(parsed),
      () => undefined
    );
    watchers.add(watcher);
    await watcher.start();
    expect(events).toHaveLength(1);
    expect(events[0]?.event.type).toBe("turn-completed");
    await watcher.stop();
  });

  it("restarts from byte zero when a rollout file is replaced", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "codex-rollout-rotation-"));
    const sessions = path.join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    const file = path.join(sessions, `rollout-${threadId}.jsonl`);
    await writeFile(file, `${rolloutLine("task_started", "before-rotation")}\n`);

    const events: ParsedRolloutEvent[] = [];
    const watcher = new RolloutWatcher(
      sessions,
      {},
      false,
      (event) => events.push(event),
      () => undefined
    );
    watchers.add(watcher);
    await watcher.start();
    expect(events).toHaveLength(1);

    const replacement = `${file}.replacement`;
    await writeFile(replacement, `${rolloutLine("task_complete", "after-rotation")}\n`);
    await rename(replacement, file);
    await waitFor(
      () => events.some(({ event }) => event.type === "turn-completed"),
      "Timed out waiting for rollout event"
    );
    await watcher.stop();
  });

  it("detects a rollout replacement across watcher restarts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "codex-rollout-restart-rotation-"));
    const sessions = path.join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    const file = path.join(sessions, `rollout-${threadId}.jsonl`);
    await writeFile(file, `${rolloutLine("task_started", "before-restart")}\n`);

    let cursors: Record<string, RolloutFileCursor> = {};
    const first = new RolloutWatcher(
      sessions,
      cursors,
      false,
      () => undefined,
      (next) => {
        cursors = next;
      }
    );
    watchers.add(first);
    await first.start();
    await first.stop();

    const replacement = `${file}.replacement`;
    await writeFile(replacement, `${rolloutLine("task_complete", "after-restart")}\n`);
    await rename(replacement, file);

    const events: ParsedRolloutEvent[] = [];
    const second = new RolloutWatcher(
      sessions,
      cursors,
      false,
      (event) => events.push(event),
      () => undefined
    );
    watchers.add(second);
    await second.start();
    expect(events.some(({ event }) => event.type === "turn-completed")).toBe(true);
  });

  it("does not emit events after it stops", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "codex-rollout-stopped-"));
    const sessions = path.join(root, "sessions");
    await mkdir(sessions, { recursive: true });
    const events: ParsedRolloutEvent[] = [];
    const watcher = new RolloutWatcher(
      sessions,
      {},
      false,
      (event) => events.push(event),
      () => undefined
    );
    watchers.add(watcher);
    await watcher.start();
    await watcher.stop();

    await writeFile(
      path.join(sessions, `rollout-${threadId}.jsonl`),
      `${rolloutLine("task_started", "after-stop")}\n`
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(events).toEqual([]);
  });
});

function rolloutLine(type: string, turnId: string): string {
  return JSON.stringify({
    type: "event_msg",
    timestamp: new Date().toISOString(),
    payload: { type, turn_id: turnId }
  });
}

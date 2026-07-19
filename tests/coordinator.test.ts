import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

import { CodexRuntime } from "../src/codex/runtime";
import type { ParsedRolloutEvent } from "../src/codex/rollout-watcher";
import { GlobalSettingsStore } from "../src/settings";
import { CatalogPoller } from "../src/status/catalog-poller";
import { StatusCoordinator } from "../src/status/coordinator";
import type { ThreadRecord } from "../src/types";
import { deferred } from "./helpers";

afterEach(() => vi.useRealTimers());

describe("status coordinator settings", () => {
  it("validates stored settings and exposes only property-inspector fields", () => {
    const coordinator = createCoordinator({
      enhancedStatusEnabled: false,
      codexHome: " /tmp/codex-home ",
      initialized: true,
      threadStates: {},
      rolloutOffsets: { "/private/session.jsonl": 42 }
    });

    expect(coordinator.propertySnapshot().settings).toEqual({
      enhancedStatusEnabled: false,
      codexHome: "/tmp/codex-home"
    });

    coordinator.markNavigation(false);
    expect(coordinator.unavailable).toBe(false);
    expect(coordinator.propertySnapshot().health.navigation).toBe("error");
    expect(coordinator.propertySnapshot().health).not.toHaveProperty("message");
    const diagnostics = coordinator.diagnostics();
    expect(JSON.parse(diagnostics)).toMatchObject({ isCustomCodexHomeConfigured: true });
    expect(diagnostics).not.toContain("/tmp/codex-home");
  });

  it("falls back to safe defaults for malformed settings", () => {
    const coordinator = createCoordinator({ enhancedStatusEnabled: "yes", rolloutOffsets: "invalid" });
    expect(coordinator.propertySnapshot().settings).toEqual({
      enhancedStatusEnabled: true
    });
  });
});

describe("status coordinator catalog", () => {
  it("requests 50 tasks and emits only for observable catalog or health changes", async () => {
    vi.useFakeTimers();
    const runtime = new FakeRuntime([thread("one", 1)]);
    const persist = vi.fn(() => Promise.resolve());
    const coordinator = createCoordinator({}, runtime, persist);
    const changed = vi.fn();
    coordinator.subscribe(changed);
    const internal = coordinatorInternals(coordinator);
    internal.started = true;

    await expect(internal.refreshCatalog()).resolves.toBe(true);
    expect(runtime.listThreads).toHaveBeenLastCalledWith(50);
    expect(changed).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(400);
    expect(persist).toHaveBeenCalledTimes(1);

    runtime.records = [thread("one", 2)];
    await internal.refreshCatalog();
    await vi.advanceTimersByTimeAsync(400);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);

    runtime.records = [thread("one", 2), thread("two", 1)];
    await internal.refreshCatalog();
    expect(changed).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(400);
    expect(persist).toHaveBeenCalledTimes(2);

    runtime.listThreads.mockRejectedValue(new Error("offline"));
    await expect(internal.refreshCatalog()).resolves.toBe(false);
    expect(changed).toHaveBeenCalledTimes(3);
    await expect(internal.refreshCatalog()).resolves.toBe(false);
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it("refreshes unknown active tasks without emitting for invisible runtime-only changes", async () => {
    vi.useFakeTimers();
    const runtime = new FakeRuntime([
      thread("known", 1),
      { ...thread("subagent", 2), parentThreadId: "known" }
    ]);
    const coordinator = createCoordinator({}, runtime);
    const internal = coordinatorInternals(coordinator);
    internal.started = true;
    await internal.refreshCatalog();
    const changed = vi.fn();
    coordinator.subscribe(changed);
    const request = vi.spyOn(internal.catalogPoller, "request");

    internal.handleRolloutEvent(rollout("known", "activity", 1));
    expect(changed).toHaveBeenCalledTimes(1);
    internal.handleRolloutEvent(rollout("known", "activity", 2));
    expect(changed).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();

    internal.handleRolloutEvent(rollout("unknown", "activity", 3));
    expect(changed).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledOnce();

    internal.handleRolloutEvent({
      event: { type: "turn-started", threadId: "subagent", timestamp: 4 },
      baseline: false
    });
    expect([...coordinator.snapshot().keys()]).toEqual(["known"]);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("ignores catalog results completed after the coordinator stops", async () => {
    const response = deferred<ThreadRecord[]>();
    const runtime = new FakeRuntime([]);
    runtime.listThreads.mockReturnValueOnce(response.promise);
    const coordinator = createCoordinator({}, runtime);
    const internal = coordinatorInternals(coordinator);
    const changed = vi.fn();
    coordinator.subscribe(changed);
    internal.started = true;

    const refresh = internal.refreshCatalog();
    await coordinator.stop();
    response.resolve([thread("late", 1)]);

    await expect(refresh).resolves.toBe(true);
    expect(coordinator.snapshot().size).toBe(0);
    expect(changed).not.toHaveBeenCalled();
  });
});

function createCoordinator(
  settings: unknown,
  runtime: CodexRuntime | FakeRuntime = new CodexRuntime(() => "/tmp/codex-home"),
  persist: () => Promise<void> = () => Promise.resolve()
): StatusCoordinator {
  const store = new GlobalSettingsStore(settings, persist);
  return new StatusCoordinator(store, runtime as unknown as CodexRuntime, () => undefined);
}

interface CoordinatorInternals {
  started: boolean;
  refreshCatalog(): Promise<boolean>;
  handleRolloutEvent(event: ParsedRolloutEvent): void;
  catalogPoller: CatalogPoller;
}

function coordinatorInternals(coordinator: StatusCoordinator): CoordinatorInternals {
  return coordinator as unknown as CoordinatorInternals;
}

function thread(id: string, updatedAt: number): ThreadRecord {
  return { id, updatedAt, ephemeral: false };
}

function rollout(threadId: string, type: "activity", timestamp: number): ParsedRolloutEvent {
  return { event: { type, threadId, timestamp }, baseline: false };
}

class FakeRuntime extends EventEmitter {
  readonly listThreads = vi.fn((limit?: number) => {
    void limit;
    return Promise.resolve(this.records);
  });

  constructor(public records: ThreadRecord[]) {
    super();
  }
}

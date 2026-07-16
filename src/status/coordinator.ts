import path from "node:path";

import { z } from "zod";

import { AppServerClient } from "../codex/app-server-client";
import { RolloutWatcher, type ParsedRolloutEvent } from "../codex/rollout-watcher";
import { CATALOG_REFRESH_MS, DEFAULT_ENHANCED_STATUS_ENABLED, PLUGIN_VERSION } from "../constants";
import { HookManager } from "../hooks/hook-manager";
import { HookServer } from "../hooks/hook-server";
import { promoteThreadOnNewTurn, reconcileThreadOrder } from "../thread-order";
import type {
  GlobalSettings,
  HealthSnapshot,
  HookEnvelope,
  PropertyInspectorSnapshot,
  ThreadRecord,
  ThreadRuntimeState,
  ThreadStatusSnapshot
} from "../types";
import { findCodexBinary, resolveCodexHome, toErrorMessage } from "../util";
import {
  initialRuntimeState,
  persistRuntimeState,
  reduceRuntimeState,
  visualState,
  type StatusEvent
} from "./reducer";

type PersistSettings = (settings: GlobalSettings) => Promise<void>;

const persistedThreadStateSchema = z.object({
  lastCompletionId: z.string().optional(),
  lastAcknowledgedCompletionId: z.string().optional(),
  error: z.boolean().optional(),
  changedAt: z.number().nonnegative().optional()
});

const rolloutCursorSchema = z
  .union([
    z.number().int().nonnegative(),
    z.object({
      offset: z.number().int().nonnegative(),
      identity: z
        .string()
        .regex(/^\d+:\d+$/)
        .optional()
    })
  ])
  .transform((cursor) => (typeof cursor === "number" ? { offset: cursor } : cursor));

const settingsSchema = z.object({
  enhancedStatusEnabled: z.boolean().optional(),
  codexHome: z.string().optional(),
  initialized: z.boolean().optional(),
  threadOrder: z.array(z.string()).optional(),
  threadStates: z.record(z.string(), persistedThreadStateSchema).optional(),
  rolloutOffsets: z.record(z.string(), rolloutCursorSchema).optional()
});

function initialHealth(): HealthSnapshot {
  return {
    codexBinary: "checking",
    catalog: "connecting",
    rolloutWatcher: "starting",
    hooks: "missing",
    navigation: "unchecked",
    restartRequired: false
  };
}

export class StatusCoordinator {
  private settings: GlobalSettings;
  private health = initialHealth();
  private readonly threads = new Map<string, ThreadRecord>();
  private readonly runtime = new Map<string, ThreadRuntimeState>();
  private readonly listeners = new Set<() => void>();
  private appServer: AppServerClient | undefined;
  private rolloutWatcher: RolloutWatcher | undefined;
  private hookManager: HookManager | undefined;
  private hookServer: HookServer | undefined;
  private refreshTimer: NodeJS.Timeout | undefined;
  private persistTimer: NodeJS.Timeout | undefined;
  private hookCount = 0;
  private started = false;

  constructor(
    initialSettings: unknown,
    private readonly persistSettings: PersistSettings,
    private readonly log: (message: string) => void
  ) {
    this.settings = normalizeSettings(initialSettings);
  }

  get codexHome(): string {
    return resolveCodexHome(this.settings);
  }

  get unavailable(): boolean {
    return (
      this.health.codexBinary === "missing" ||
      this.health.catalog === "disconnected" ||
      this.health.rolloutWatcher === "error" ||
      this.navigationDisabled
    );
  }

  get navigationDisabled(): boolean {
    return this.health.navigation === "error";
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.startServices();
  }

  async stop(): Promise<void> {
    this.started = false;
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.refreshTimer = undefined;
    this.persistTimer = undefined;
    await Promise.allSettled([this.rolloutWatcher?.stop(), this.hookServer?.stop(), this.appServer?.stop()]);
    this.rolloutWatcher = undefined;
    this.hookServer = undefined;
    this.hookManager = undefined;
    this.appServer = undefined;
    await this.persistNow();
  }

  snapshot(): ReadonlyMap<string, ThreadStatusSnapshot> {
    const snapshots = new Map<string, ThreadStatusSnapshot>();
    for (const threadId of this.settings.threadOrder ?? []) {
      const thread = this.threads.get(threadId);
      if (!thread) continue;
      const runtime =
        this.runtime.get(threadId) ?? initialRuntimeState(this.settings.threadStates?.[threadId]);
      snapshots.set(threadId, { thread, state: visualState(runtime) });
    }
    return snapshots;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  acknowledge(threadId: string): void {
    this.applyEvent({ type: "acknowledged", threadId, timestamp: Date.now() });
  }

  markNavigation(available: boolean, message?: string): void {
    this.updateHealth({ navigation: available ? "available" : "error", ...(message ? { message } : {}) });
  }

  propertySnapshot(): PropertyInspectorSnapshot {
    return {
      type: "snapshot",
      settings: {
        enhancedStatusEnabled: this.settings.enhancedStatusEnabled,
        ...(this.settings.codexHome ? { codexHome: this.settings.codexHome } : {})
      },
      health: this.health,
      version: PLUGIN_VERSION
    };
  }

  diagnostics(): string {
    return JSON.stringify(
      {
        pluginVersion: PLUGIN_VERSION,
        platform: process.platform,
        architecture: process.arch,
        codexHome: this.codexHome,
        health: this.health,
        taskCount: this.threads.size,
        hookCount: this.hookCount,
        enhancedStatusEnabled: this.settings.enhancedStatusEnabled
      },
      null,
      2
    );
  }

  async trustHooks(): Promise<void> {
    if (!this.hookManager) throw new Error("Hook manager is not available");
    await this.hookManager.trust(process.cwd());
    this.updateHealth({ restartRequired: true });
    await this.refreshHookStatus();
  }

  async reinstallHooks(): Promise<void> {
    if (!this.hookManager) throw new Error("Hook manager is not available");
    const changed = await this.hookManager.install();
    if (changed) this.updateHealth({ restartRequired: true });
    await this.refreshHookStatus(true);
  }

  async setEnhancedStatus(enabled: boolean): Promise<void> {
    if (this.settings.enhancedStatusEnabled === enabled) return;
    this.settings = { ...this.settings, enhancedStatusEnabled: enabled };
    if (enabled) {
      await this.hookServer?.start();
      await this.reinstallHooks();
    } else {
      const cleanup = await this.uninstallHooks();
      this.hookCount = 0;
      this.updateHealth({
        hooks: "disabled",
        restartRequired: true,
        ...(cleanup?.manualCleanupRequired
          ? { message: "A modified status hook was disabled but left in hooks.json for manual review" }
          : cleanup?.trustCleanupFailed
            ? { message: "Hook definitions were removed, but their trust state could not be cleared" }
            : {})
      });
    }
    await this.persistNow();
    this.emitChange();
  }

  async setCodexHome(codexHome?: string): Promise<void> {
    const previousHome = this.codexHome;
    const normalized = codexHome?.trim();
    const nextSettings = { ...this.settings };
    if (normalized) nextSettings.codexHome = normalized;
    else delete nextSettings.codexHome;
    const nextHome = resolveCodexHome(nextSettings);
    if (nextHome === previousHome) {
      this.settings = nextSettings;
      await this.persistNow();
      return;
    }

    const wasStarted = this.started;
    if (wasStarted && this.settings.enhancedStatusEnabled) {
      try {
        const cleanup = await this.uninstallHooks();
        if (cleanup?.manualCleanupRequired || cleanup?.trustCleanupFailed) {
          this.log("Old CODEX_HOME hook cleanup requires manual review");
        }
      } catch (error) {
        this.log(`Old CODEX_HOME hook cleanup failed: ${toErrorMessage(error)}`);
      }
    }
    if (wasStarted) await this.stop();

    this.threads.clear();
    this.runtime.clear();
    this.settings = {
      ...nextSettings,
      initialized: false,
      threadOrder: [],
      rolloutOffsets: {},
      threadStates: {}
    };
    this.health = initialHealth();
    await this.persistNow();
    if (wasStarted) {
      this.started = true;
      await this.startServices();
    }
  }

  private async startServices(): Promise<void> {
    const binary = await findCodexBinary();
    if (!binary) {
      this.updateHealth({
        codexBinary: "missing",
        catalog: "disconnected",
        message: "Codex binary not found"
      });
    } else {
      this.updateHealth({ codexBinary: "available", catalog: "connecting", navigation: "available" });
    }

    this.appServer = new AppServerClient(binary);
    this.appServer.on("connected", () => this.updateHealth({ catalog: "connected" }));
    this.appServer.on("disconnected", (error: Error) => {
      this.updateHealth({ catalog: "disconnected", message: error.message });
    });
    this.appServer.on("diagnostic", (message: string) => this.log(`app-server: ${message}`));
    this.hookManager = new HookManager(this.codexHome, this.appServer);
    this.hookServer = new HookServer(this.codexHome, (envelope) => this.handleHook(envelope));

    try {
      await this.appServer.start();
      await this.refreshCatalog();
    } catch {
      this.updateHealth({ catalog: "disconnected", message: "Task catalog unavailable" });
    }

    this.rolloutWatcher = new RolloutWatcher(
      path.join(this.codexHome, "sessions"),
      this.settings.rolloutOffsets ?? {},
      !this.settings.initialized,
      (event) => this.handleRolloutEvent(event),
      (offsets) => {
        this.settings = { ...this.settings, rolloutOffsets: offsets };
        this.schedulePersist();
      },
      () => {
        this.updateHealth({
          rolloutWatcher: "error",
          message: "Rollout watcher could not read a session file"
        });
      }
    );
    try {
      await this.rolloutWatcher.start();
      this.updateHealth({ rolloutWatcher: "watching" });
    } catch {
      this.updateHealth({
        rolloutWatcher: "error",
        message: "Rollout watcher could not access the sessions directory"
      });
    }

    if (this.settings.enhancedStatusEnabled) {
      try {
        await this.hookServer.start();
        const changed = await this.hookManager.install();
        if (changed) this.updateHealth({ restartRequired: true });
        await this.refreshHookStatus(true);
      } catch (error) {
        this.updateHealth({ hooks: "error", message: toErrorMessage(error) });
      }
    } else {
      this.updateHealth({ hooks: "disabled" });
    }

    this.settings = { ...this.settings, initialized: true };
    await this.persistNow();
    this.refreshTimer = setInterval(() => void this.refreshCatalog(), CATALOG_REFRESH_MS);
  }

  private async refreshCatalog(): Promise<void> {
    if (!this.appServer) return;
    try {
      const records = await this.appServer.listThreads(200);
      const nextIds = new Set<string>();
      for (const record of records) {
        nextIds.add(record.id);
        const runtime =
          this.runtime.get(record.id) ?? initialRuntimeState(this.settings.threadStates?.[record.id]);
        this.runtime.set(record.id, runtime);
        this.threads.set(record.id, {
          ...record,
          updatedAt: Math.max(record.updatedAt, runtime.changedAt)
        });
      }
      for (const id of this.threads.keys()) {
        if (!nextIds.has(id)) this.threads.delete(id);
      }
      const previousOrder = this.settings.threadOrder ?? [];
      const threadOrder = reconcileThreadOrder(previousOrder, this.threads.values());
      this.settings = { ...this.settings, threadOrder };
      if (!sameOrder(previousOrder, threadOrder)) this.schedulePersist();
      this.updateHealth({ catalog: "connected" });
      this.emitChange();
    } catch {
      this.updateHealth({ catalog: "disconnected", message: "Task catalog refresh failed" });
    }
  }

  private handleRolloutEvent({ event, baseline }: ParsedRolloutEvent): void {
    this.applyEvent(event, !baseline);
    if (baseline && event.type === "turn-completed") {
      this.applyEvent({ type: "acknowledged", threadId: event.threadId, timestamp: event.timestamp });
    }
  }

  private handleHook(envelope: HookEnvelope): void {
    if (!this.settings.enhancedStatusEnabled) return;
    this.applyEvent({ type: "hook", envelope });
  }

  private applyEvent(event: StatusEvent, allowPromotion = true): void {
    const threadId = event.type === "hook" ? event.envelope.threadId : event.threadId;
    const previous =
      this.runtime.get(threadId) ?? initialRuntimeState(this.settings.threadStates?.[threadId]);
    const next = reduceRuntimeState(previous, event);
    if (allowPromotion && event.type === "turn-started") {
      this.settings = {
        ...this.settings,
        threadOrder: promoteThreadOnNewTurn(
          this.settings.threadOrder ?? [],
          threadId,
          event.timestamp,
          previous.changedAt
        )
      };
    }
    this.runtime.set(threadId, next);
    this.schedulePersist();
    this.emitChange();
  }

  private async refreshHookStatus(retryAfterRestart = false): Promise<void> {
    if (!this.hookManager) return;
    let result = await this.hookManager.status(process.cwd());
    if (retryAfterRestart && result.status === "missing" && this.appServer) {
      await this.appServer.stop();
      await this.appServer.start();
      result = await this.hookManager.status(process.cwd());
    }
    this.hookCount = result.count;
    this.updateHealth({ hooks: result.status });
  }

  private async uninstallHooks() {
    await this.hookServer?.stop();
    return this.hookManager?.uninstall(process.cwd());
  }

  private updateHealth(patch: Partial<HealthSnapshot>): void {
    this.health = { ...this.health, ...patch };
    this.emitChange();
  }

  private emitChange(): void {
    for (const listener of this.listeners) listener();
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      void this.persistNow().catch((error: unknown) => {
        this.log(`Settings persistence failed: ${toErrorMessage(error)}`);
      });
    }, 400);
  }

  private async persistNow(): Promise<void> {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = undefined;
    const threadStates = Object.fromEntries(
      [...this.runtime].map(([threadId, runtime]) => [threadId, persistRuntimeState(runtime)])
    );
    this.settings = { ...this.settings, threadStates };
    await this.persistSettings(this.settings);
  }
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function normalizeSettings(settings: unknown): GlobalSettings {
  const result = settingsSchema.safeParse(settings);
  const value = result.success ? result.data : {};
  const threadStates = Object.fromEntries(
    Object.entries(value.threadStates ?? {}).map(([threadId, state]) => [
      threadId,
      {
        ...(state.lastCompletionId ? { lastCompletionId: state.lastCompletionId } : {}),
        ...(state.lastAcknowledgedCompletionId
          ? { lastAcknowledgedCompletionId: state.lastAcknowledgedCompletionId }
          : {}),
        ...(state.error === undefined ? {} : { error: state.error }),
        ...(state.changedAt === undefined ? {} : { changedAt: state.changedAt })
      }
    ])
  );
  const rolloutOffsets = Object.fromEntries(
    Object.entries(value.rolloutOffsets ?? {}).map(([filePath, cursor]) => [
      filePath,
      { offset: cursor.offset, ...(cursor.identity ? { identity: cursor.identity } : {}) }
    ])
  );
  return {
    enhancedStatusEnabled: value.enhancedStatusEnabled ?? DEFAULT_ENHANCED_STATUS_ENABLED,
    initialized: value.initialized ?? false,
    threadOrder: [...new Set(value.threadOrder ?? [])],
    threadStates,
    rolloutOffsets,
    ...(value.codexHome?.trim() ? { codexHome: value.codexHome.trim() } : {})
  };
}

import path from "node:path";

import { CodexRuntime } from "../codex/runtime";
import { RolloutWatcher, type ParsedRolloutEvent } from "../codex/rollout-watcher";
import {
  CATALOG_FAILURE_BACKOFF_MS,
  CATALOG_REFRESH_MS,
  CATALOG_THREAD_LIMIT,
  PLUGIN_VERSION
} from "../constants";
import { HookManager } from "../hooks/hook-manager";
import { HookServer } from "../hooks/hook-server";
import { GlobalSettingsStore } from "../settings";
import { THEME } from "../theme";
import { isEligibleThread, promoteThreadOnNewTurn, reconcileThreadOrder } from "../thread-order";
import type {
  GlobalSettings,
  HealthSnapshot,
  HookEnvelope,
  PropertyInspectorSnapshot,
  ThreadRecord,
  ThreadRuntimeState,
  ThreadStatusSnapshot
} from "../types";
import { findCodexBinary, resolveCodexHome } from "../util";
import {
  initialRuntimeState,
  persistRuntimeState,
  reduceRuntimeState,
  visualState,
  type StatusEvent
} from "./reducer";
import { CatalogPoller } from "./catalog-poller";

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
  private health = initialHealth();
  private readonly threads = new Map<string, ThreadRecord>();
  private readonly runtime = new Map<string, ThreadRuntimeState>();
  private readonly listeners = new Set<() => void>();
  private rolloutWatcher: RolloutWatcher | undefined;
  private hookManager: HookManager | undefined;
  private hookServer: HookServer | undefined;
  private persistTimer: NodeJS.Timeout | undefined;
  private readonly catalogPoller: CatalogPoller;
  private catalogGeneration = 0;
  private hookCount = 0;
  private started = false;

  constructor(
    private readonly settingsStore: GlobalSettingsStore,
    private readonly appServer: CodexRuntime,
    private readonly log: (message: string) => void
  ) {
    this.catalogPoller = new CatalogPoller(
      () => this.refreshCatalog(),
      CATALOG_REFRESH_MS,
      CATALOG_FAILURE_BACKOFF_MS
    );
    this.appServer.on("connected", () => this.updateHealth({ catalog: "connected" }));
    this.appServer.on("disconnected", () => this.updateHealth({ catalog: "disconnected" }));
    this.appServer.on("diagnostic", (message: string) => this.log(`app-server: ${message}`));
  }

  private get settings(): GlobalSettings {
    return this.settingsStore.current;
  }

  private set settings(settings: GlobalSettings) {
    this.settingsStore.update(() => settings);
  }

  get codexHome(): string {
    return resolveCodexHome(this.settings);
  }

  get unavailable(): boolean {
    return (
      this.health.codexBinary === "missing" ||
      this.health.catalog === "disconnected" ||
      this.health.rolloutWatcher === "error"
    );
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.startServices();
  }

  async stop(): Promise<void> {
    this.started = false;
    this.catalogGeneration++;
    this.catalogPoller.stop();
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = undefined;
    await Promise.allSettled([this.rolloutWatcher?.stop(), this.hookServer?.stop()]);
    this.rolloutWatcher = undefined;
    this.hookServer = undefined;
    this.hookManager = undefined;
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

  setStatusTilesVisible(visible: boolean): void {
    this.catalogPoller.setActive(visible);
  }

  acknowledge(threadId: string): void {
    this.applyEvent({ type: "acknowledged", threadId });
  }

  markNavigation(available: boolean): void {
    this.updateHealth({ navigation: available ? "available" : "error" });
  }

  propertySnapshot(): PropertyInspectorSnapshot {
    return {
      type: "snapshot",
      settings: {
        enhancedStatusEnabled: this.settings.enhancedStatusEnabled,
        ...(this.settings.codexHome ? { codexHome: this.settings.codexHome } : {})
      },
      theme: THEME,
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
        isCustomCodexHomeConfigured: Boolean(this.settings.codexHome || process.env.CODEX_HOME),
        health: {
          codexBinary: this.health.codexBinary,
          catalog: this.health.catalog,
          rolloutWatcher: this.health.rolloutWatcher,
          hooks: this.health.hooks,
          navigation: this.health.navigation,
          restartRequired: this.health.restartRequired
        },
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
        restartRequired: true
      });
      if (cleanup?.manualCleanupRequired || cleanup?.trustCleanupFailed) {
        this.log("Status hook cleanup requires manual review");
      }
    }
    await this.persistNow();
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
      } catch {
        this.log("Old CODEX_HOME hook cleanup failed");
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
    await this.appServer.reconfigure();
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
        catalog: "disconnected"
      });
    } else {
      this.updateHealth({ codexBinary: "available", catalog: "connecting", navigation: "available" });
    }

    this.hookManager = new HookManager(this.codexHome, this.appServer);
    this.hookServer = new HookServer(this.codexHome, (envelope) => this.handleHook(envelope));

    try {
      await this.appServer.start();
    } catch {
      this.updateHealth({ catalog: "disconnected" });
    }
    this.catalogPoller.start();

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
        this.updateHealth({ rolloutWatcher: "error" });
      }
    );
    try {
      await this.rolloutWatcher.start();
      this.updateHealth({ rolloutWatcher: "watching" });
    } catch {
      this.updateHealth({ rolloutWatcher: "error" });
    }

    if (this.settings.enhancedStatusEnabled) {
      try {
        await this.hookServer.start();
        const changed = await this.hookManager.install();
        if (changed) this.updateHealth({ restartRequired: true });
        await this.refreshHookStatus(true);
      } catch {
        this.updateHealth({ hooks: "error" });
      }
    } else {
      this.updateHealth({ hooks: "disabled" });
    }

    this.settings = { ...this.settings, initialized: true };
    await this.persistNow();
  }

  private async refreshCatalog(): Promise<boolean> {
    const generation = this.catalogGeneration;
    try {
      const records = await this.appServer.listThreads(CATALOG_THREAD_LIMIT);
      if (!this.started || generation !== this.catalogGeneration) return true;
      const nextThreads = new Map<string, ThreadRecord>();
      for (const record of records) {
        const runtime =
          this.runtime.get(record.id) ?? initialRuntimeState(this.settings.threadStates?.[record.id]);
        this.runtime.set(record.id, runtime);
        nextThreads.set(record.id, {
          ...record,
          updatedAt: Math.max(record.updatedAt, runtime.changedAt)
        });
      }
      const previousOrder = this.settings.threadOrder ?? [];
      const threadOrder = reconcileThreadOrder(previousOrder, nextThreads.values());
      const catalogChanged = !sameCatalog(this.threads, nextThreads);
      const orderChanged = !sameOrder(previousOrder, threadOrder);
      this.threads.clear();
      for (const [threadId, thread] of nextThreads) this.threads.set(threadId, thread);
      if (orderChanged) {
        this.settings = { ...this.settings, threadOrder };
        this.schedulePersist();
      }
      const healthChanged = this.updateHealth({ catalog: "connected" }, false);
      if (catalogChanged || orderChanged || healthChanged) this.emitChange();
      return true;
    } catch {
      if (!this.started || generation !== this.catalogGeneration) return true;
      if (this.updateHealth({ catalog: "disconnected" }, false)) this.emitChange();
      return false;
    }
  }

  private handleRolloutEvent({ event, baseline }: ParsedRolloutEvent): void {
    this.applyEvent(event, !baseline);
    const threadId = event.type === "hook" ? event.envelope.threadId : event.threadId;
    if (!baseline && !this.threads.has(threadId)) this.catalogPoller.request();
    if (baseline && event.type === "turn-completed") {
      this.applyEvent({ type: "acknowledged", threadId });
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
    if (next === previous) return;
    const previousVisualState = visualState(previous);
    let orderChanged = false;
    const thread = this.threads.get(threadId);
    if (allowPromotion && event.type === "turn-started" && (!thread || isEligibleThread(thread))) {
      const previousOrder = this.settings.threadOrder ?? [];
      const threadOrder = promoteThreadOnNewTurn(
        previousOrder,
        threadId,
        event.timestamp,
        previous.changedAt
      );
      orderChanged = !sameOrder(previousOrder, threadOrder);
      this.settings = {
        ...this.settings,
        threadOrder
      };
    }
    this.runtime.set(threadId, next);
    this.schedulePersist();
    const observable = Boolean(
      thread && isEligibleThread(thread) && this.settings.threadOrder?.includes(threadId)
    );
    if (observable && (orderChanged || previousVisualState !== visualState(next))) {
      this.emitChange();
    }
  }

  private async refreshHookStatus(retryAfterRestart = false): Promise<void> {
    if (!this.hookManager) return;
    let result = await this.hookManager.status(process.cwd());
    if (retryAfterRestart && result.status === "missing") {
      await this.appServer.restart();
      result = await this.hookManager.status(process.cwd());
    }
    this.hookCount = result.count;
    this.updateHealth({ hooks: result.status });
  }

  private async uninstallHooks() {
    await this.hookServer?.stop();
    return this.hookManager?.uninstall(process.cwd());
  }

  private updateHealth(patch: Partial<HealthSnapshot>, emit = true): boolean {
    const changed = Object.entries(patch).some(
      ([key, value]) => this.health[key as keyof HealthSnapshot] !== value
    );
    if (!changed) return false;
    this.health = { ...this.health, ...patch };
    if (emit) this.emitChange();
    return true;
  }

  private emitChange(): void {
    for (const listener of this.listeners) listener();
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      void this.persistNow().catch(() => this.log("Settings persistence failed"));
    }, 400);
  }

  private async persistNow(): Promise<void> {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = undefined;
    const threadStates = Object.fromEntries(
      [...this.runtime].map(([threadId, runtime]) => [threadId, persistRuntimeState(runtime)])
    );
    this.settings = { ...this.settings, threadStates };
    await this.settingsStore.persist();
  }
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function sameCatalog(
  left: ReadonlyMap<string, ThreadRecord>,
  right: ReadonlyMap<string, ThreadRecord>
): boolean {
  if (left.size !== right.size) return false;
  for (const [threadId, next] of right) {
    const previous = left.get(threadId);
    if (
      !previous ||
      previous.ephemeral !== next.ephemeral ||
      previous.parentThreadId !== next.parentThreadId
    ) {
      return false;
    }
  }
  return true;
}

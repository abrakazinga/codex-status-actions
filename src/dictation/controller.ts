import type { JsonObject } from "@elgato/utils";

import type { DictationPlatform, DictationState, GlobalSettings, ShortcutBinding } from "../types";
import { toErrorMessage } from "../util";
import { DictationPlatformError } from "./platform-error";
import { normalizeShortcut } from "./shortcut";

type Availability = "unchecked" | "available" | "missing";
type Permission = "unchecked" | "granted" | "denied";

export interface DictationSnapshot extends JsonObject {
  state: DictationState;
  settingsReady: boolean;
  shortcut?: ShortcutBinding;
  availability: Availability;
  permission: Permission;
  lastError?: string;
}

interface SettingsStore {
  readonly current: GlobalSettings;
  update(update: (settings: GlobalSettings) => GlobalSettings): GlobalSettings;
  persist(): Promise<void>;
}

export class DictationController {
  private currentState: DictationState = "idle";
  private availability: Availability = "unchecked";
  private permission: Permission = "unchecked";
  private lastError: string | undefined;
  private ownerId: string | undefined;
  private activeShortcut: ShortcutBinding | undefined;
  private mayBeRecording = false;
  private settingsReady = false;
  private resolveSettingsReady: (() => void) | undefined;
  private readonly settingsReadyPromise = new Promise<void>((resolve) => {
    this.resolveSettingsReady = resolve;
  });
  private operationChain = Promise.resolve();
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly platform: DictationPlatform,
    private readonly settings: SettingsStore,
    private readonly log: (message: string) => void = () => undefined
  ) {}

  snapshot(): DictationSnapshot {
    const shortcut = normalizeShortcut(this.settings.current.dictationShortcut);
    return {
      state: this.currentState,
      settingsReady: this.settingsReady,
      availability: this.availability,
      permission: this.permission,
      ...(shortcut ? { shortcut } : {}),
      ...(this.lastError ? { lastError: this.lastError } : {})
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  markSettingsReady(): void {
    if (this.settingsReady) return;
    this.settingsReady = true;
    this.resolveSettingsReady?.();
    this.resolveSettingsReady = undefined;
    this.notify();
  }

  setShortcut(value?: ShortcutBinding): Promise<void> {
    return this.enqueue(() => this.setShortcutNow(value));
  }

  private async setShortcutNow(value?: ShortcutBinding): Promise<void> {
    if (!this.settingsReady) await this.settingsReadyPromise;
    if (this.currentState === "activating" || this.currentState === "recording" || this.mayBeRecording) {
      throw new Error("Stop dictation before changing its shortcut");
    }
    const shortcut = value ? normalizeShortcut(value) : undefined;
    if (value && !shortcut) throw new Error("Invalid dictation shortcut");
    this.settings.update((settings) => {
      const { dictationShortcut: previous, ...rest } = settings;
      void previous;
      return shortcut ? { ...rest, dictationShortcut: shortcut } : rest;
    });
    await this.settings.persist();
    if (this.currentState === "error") this.currentState = "idle";
    this.lastError = undefined;
    this.notify();
  }

  start(ownerId: string): Promise<void> {
    return this.enqueue(() => this.startNow(ownerId));
  }

  stop(ownerId?: string): Promise<void> {
    return this.enqueue(() => this.stopNow(ownerId));
  }

  toggle(ownerId: string): Promise<void> {
    return this.enqueue(() =>
      this.currentState === "recording" || this.mayBeRecording ? this.stopNow() : this.startNow(ownerId)
    );
  }

  releaseOwner(ownerId: string): Promise<void> {
    return this.stop(ownerId).catch((error: unknown) => {
      this.log(`Best-effort dictation stop failed: ${toErrorMessage(error)}`);
    });
  }

  dispose(): Promise<void> {
    return this.stop().catch((error: unknown) => {
      this.log(`Shutdown dictation stop failed: ${toErrorMessage(error)}`);
    });
  }

  openPrivacySettings(): Promise<void> {
    return this.platform.openPrivacySettings();
  }

  diagnostics(): string {
    const snapshot = this.snapshot();
    return [
      "Codex Dictation diagnostics",
      `State: ${snapshot.state}`,
      `Codex: ${snapshot.availability}`,
      `Shortcut: ${snapshot.shortcut ? "configured" : "missing"}`,
      `Permission: ${snapshot.permission}`,
      `Last error: ${snapshot.lastError ?? "none"}`
    ].join("\n");
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.operationChain.then(operation);
    this.operationChain = result.catch(() => undefined);
    return result;
  }

  private async startNow(ownerId: string): Promise<void> {
    if (!this.settingsReady) await this.settingsReadyPromise;
    if (this.currentState === "recording" || this.mayBeRecording) return;
    const shortcut = normalizeShortcut(this.settings.current.dictationShortcut);
    if (!shortcut) {
      this.fail(new Error("Configure the dictation shortcut first"));
      throw new Error("Configure the dictation shortcut first");
    }

    this.setState("activating");
    try {
      await this.platform.activateCodex();
      this.availability = "available";
      await this.platform.emitShortcut(shortcut);
      this.permission = "granted";
      this.ownerId = ownerId;
      this.activeShortcut = shortcut;
      this.mayBeRecording = true;
      this.lastError = undefined;
      this.setState("recording");
    } catch (error) {
      this.classify(error);
      this.fail(error, false);
      throw error;
    }
  }

  private async stopNow(ownerId?: string): Promise<void> {
    if (
      (!this.mayBeRecording && this.currentState !== "recording") ||
      (ownerId && ownerId !== this.ownerId)
    ) {
      return;
    }
    const shortcut = this.activeShortcut ?? normalizeShortcut(this.settings.current.dictationShortcut);
    if (!shortcut) {
      this.fail(new Error("Dictation shortcut is no longer configured"));
      throw new Error("Dictation shortcut is no longer configured");
    }
    try {
      await this.platform.emitShortcut(shortcut);
      this.permission = "granted";
      this.ownerId = undefined;
      this.activeShortcut = undefined;
      this.mayBeRecording = false;
      this.lastError = undefined;
      this.setState("idle");
    } catch (error) {
      this.classify(error);
      this.fail(error, true);
      throw error;
    }
  }

  private classify(error: unknown): void {
    if (!(error instanceof DictationPlatformError)) return;
    if (error.code === "codex-missing") this.availability = "missing";
    if (error.code === "activation-timeout") this.availability = "available";
    if (error.code === "permission-denied") this.permission = "denied";
  }

  private fail(error: unknown, preserveActive = false): void {
    if (!preserveActive) {
      this.ownerId = undefined;
      this.activeShortcut = undefined;
      this.mayBeRecording = false;
    }
    this.lastError = toErrorMessage(error);
    this.setState("error");
  }

  private setState(state: DictationState): void {
    this.currentState = state;
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

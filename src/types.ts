import type { JsonObject } from "@elgato/utils";

import type { ThemePalette } from "./theme";

export type ThreadVisualState = "idle" | "unread" | "working" | "needs-user" | "error";

export type TaskNavigationMode = "background" | "foreground";

export interface TaskNavigator {
  selectTask(threadId: string, mode: TaskNavigationMode): Promise<void>;
}

type DictationMode = "hold" | "toggle";
export type DictationState = "idle" | "activating" | "recording" | "error";
export type ShortcutModifier = "command" | "control" | "option" | "shift";

export interface ShortcutBinding extends JsonObject {
  key: string;
  modifiers: ShortcutModifier[];
}

export interface DictationActionSettings extends JsonObject {
  mode: DictationMode;
}

export interface DictationPlatform {
  activateCodex(): Promise<void>;
  emitShortcut(binding: ShortcutBinding): Promise<void>;
  openPrivacySettings(): Promise<void>;
}

export interface ThreadRecord {
  id: string;
  updatedAt: number;
  parentThreadId?: string;
  ephemeral: boolean;
}

export interface ThreadRuntimeState {
  working: boolean;
  needsUser: boolean;
  error: boolean;
  changedAt: number;
  lastCompletionId?: string;
  lastAcknowledgedCompletionId?: string;
}

export interface ThreadStatusSnapshot {
  thread: ThreadRecord;
  state: ThreadVisualState;
}

export interface HookEnvelope {
  version: 1;
  event: "permission-requested" | "question-opened" | "question-closed";
  threadId: string;
  turnId?: string;
  timestamp: number;
}

export type HookTrustStatus = "missing" | "untrusted" | "trusted" | "modified" | "disabled" | "error";

export interface HealthSnapshot extends JsonObject {
  codexBinary: "checking" | "available" | "missing";
  catalog: "connecting" | "connected" | "disconnected";
  rolloutWatcher: "starting" | "watching" | "error";
  hooks: HookTrustStatus;
  navigation: "unchecked" | "available" | "error";
  restartRequired: boolean;
}

export interface PersistedThreadState extends JsonObject {
  lastCompletionId?: string;
  lastAcknowledgedCompletionId?: string;
  needsUser?: boolean;
  error?: boolean;
  changedAt?: number;
}

export interface RolloutFileCursor extends JsonObject {
  offset: number;
  identity?: string;
}

export interface GlobalSettings extends JsonObject {
  enhancedStatusEnabled: boolean;
  codexHome?: string;
  dictationShortcut?: ShortcutBinding;
  initialized?: boolean;
  threadOrder?: string[];
  threadStates?: Record<string, PersistedThreadState>;
  rolloutOffsets?: Record<string, RolloutFileCursor>;
}

interface PropertyInspectorSettings extends JsonObject {
  enhancedStatusEnabled: boolean;
  codexHome?: string;
}

export interface PropertyInspectorSnapshot extends JsonObject {
  type: "snapshot";
  settings: PropertyInspectorSettings;
  health: HealthSnapshot;
  theme: ThemePalette;
  version: string;
}

export type PropertyInspectorCommand =
  | { type: "refresh" }
  | { type: "trust-hooks" }
  | { type: "reinstall-hooks" }
  | { type: "set-enhanced-status"; enabled: boolean }
  | { type: "set-codex-home"; path?: string }
  | { type: "copy-diagnostics" };

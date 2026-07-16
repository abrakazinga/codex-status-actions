import type { JsonObject } from "@elgato/utils";

export type ThreadVisualState = "idle" | "unread" | "working" | "needs-user" | "error";

type AssignmentMode = "recent";

export interface ThreadRecord {
  id: string;
  title: string;
  cwd?: string;
  updatedAt: number;
  parentThreadId?: string;
  archived: boolean;
  ephemeral?: boolean;
}

export interface ThreadRuntimeState {
  working: boolean;
  needsUser: boolean;
  error: boolean;
  turnId?: string;
  changedAt: number;
  lastCompletionId?: string;
  lastAcknowledgedCompletionId?: string;
}

export interface ThreadStatusSnapshot {
  thread: ThreadRecord;
  state: ThreadVisualState;
  turnId?: string;
  changedAt: number;
  unreadCompletionId?: string;
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
  message?: string;
}

export interface PersistedThreadState extends JsonObject {
  lastCompletionId?: string;
  lastAcknowledgedCompletionId?: string;
  error?: boolean;
  changedAt?: number;
}

export interface RolloutFileCursor extends JsonObject {
  offset: number;
  identity?: string;
}

export interface GlobalSettings extends JsonObject {
  assignmentMode: AssignmentMode;
  enhancedStatusEnabled: boolean;
  codexHome?: string;
  initialized?: boolean;
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
  version: string;
}

export type PropertyInspectorCommand =
  | { type: "refresh" }
  | { type: "trust-hooks" }
  | { type: "reinstall-hooks" }
  | { type: "set-enhanced-status"; enabled: boolean }
  | { type: "set-codex-home"; path?: string }
  | { type: "copy-diagnostics" };

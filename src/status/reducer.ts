import type {
  HookEnvelope,
  PersistedThreadState,
  ThreadRuntimeState,
  ThreadStatusSnapshot,
  ThreadVisualState
} from "../types";

export type StatusEvent =
  | { type: "turn-started"; threadId: string; turnId?: string; timestamp: number }
  | { type: "activity"; threadId: string; timestamp: number }
  | { type: "turn-completed"; threadId: string; turnId?: string; timestamp: number }
  | { type: "turn-error"; threadId: string; turnId?: string; timestamp: number }
  | { type: "acknowledged"; threadId: string; timestamp: number }
  | { type: "hook"; envelope: HookEnvelope };

export function initialRuntimeState(persisted?: PersistedThreadState): ThreadRuntimeState {
  return {
    working: false,
    needsUser: false,
    error: persisted?.error ?? false,
    changedAt: persisted?.changedAt ?? 0,
    ...(persisted?.lastCompletionId ? { lastCompletionId: persisted.lastCompletionId } : {}),
    ...(persisted?.lastAcknowledgedCompletionId
      ? { lastAcknowledgedCompletionId: persisted.lastAcknowledgedCompletionId }
      : {})
  };
}

export function reduceRuntimeState(previous: ThreadRuntimeState, event: StatusEvent): ThreadRuntimeState {
  const timestamp = event.type === "hook" ? event.envelope.timestamp : event.timestamp;
  if (timestamp < previous.changedAt) return previous;

  switch (event.type) {
    case "turn-started":
      return {
        ...previous,
        working: true,
        needsUser: false,
        error: false,
        changedAt: event.timestamp,
        ...(previous.lastCompletionId ? { lastAcknowledgedCompletionId: previous.lastCompletionId } : {}),
        ...(event.turnId ? { turnId: event.turnId } : {})
      };
    case "activity":
      return { ...previous, working: true, needsUser: false, changedAt: event.timestamp };
    case "turn-completed": {
      const completionId = event.turnId ?? `${event.threadId}:${String(event.timestamp)}`;
      return {
        ...previous,
        working: false,
        needsUser: false,
        error: false,
        changedAt: event.timestamp,
        lastCompletionId: completionId,
        ...(event.turnId ? { turnId: event.turnId } : {})
      };
    }
    case "turn-error":
      return {
        ...previous,
        working: false,
        needsUser: false,
        error: true,
        changedAt: event.timestamp,
        ...(event.turnId ? { turnId: event.turnId } : {})
      };
    case "acknowledged":
      return {
        ...previous,
        changedAt: Math.max(previous.changedAt, event.timestamp),
        ...(previous.lastCompletionId ? { lastAcknowledgedCompletionId: previous.lastCompletionId } : {})
      };
    case "hook": {
      const { envelope } = event;
      if (envelope.event === "question-closed") {
        return { ...previous, needsUser: false, changedAt: envelope.timestamp };
      }
      return {
        ...previous,
        working: true,
        needsUser: true,
        changedAt: envelope.timestamp,
        ...(envelope.turnId ? { turnId: envelope.turnId } : {})
      };
    }
  }
}

export function visualState(runtime: ThreadRuntimeState): ThreadVisualState {
  if (runtime.error) return "error";
  if (runtime.needsUser) return "needs-user";
  if (runtime.working) return "working";
  if (runtime.lastCompletionId && runtime.lastCompletionId !== runtime.lastAcknowledgedCompletionId) {
    return "unread";
  }
  return "idle";
}

export function persistRuntimeState(runtime: ThreadRuntimeState): PersistedThreadState {
  return {
    ...(runtime.lastCompletionId ? { lastCompletionId: runtime.lastCompletionId } : {}),
    ...(runtime.lastAcknowledgedCompletionId
      ? { lastAcknowledgedCompletionId: runtime.lastAcknowledgedCompletionId }
      : {}),
    error: runtime.error,
    changedAt: runtime.changedAt
  };
}

export function makeSnapshot(
  thread: ThreadStatusSnapshot["thread"],
  runtime: ThreadRuntimeState
): ThreadStatusSnapshot {
  const state = visualState(runtime);
  return {
    thread: { ...thread, updatedAt: Math.max(thread.updatedAt, runtime.changedAt) },
    state,
    changedAt: runtime.changedAt,
    ...(runtime.turnId ? { turnId: runtime.turnId } : {}),
    ...(state === "unread" && runtime.lastCompletionId
      ? { unreadCompletionId: runtime.lastCompletionId }
      : {})
  };
}

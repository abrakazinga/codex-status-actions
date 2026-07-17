import type { HookEnvelope, PersistedThreadState, ThreadRuntimeState, ThreadVisualState } from "../types";

export type StatusEvent =
  | { type: "turn-started"; threadId: string; turnId?: string; timestamp: number }
  | { type: "activity"; threadId: string; timestamp: number }
  | { type: "turn-completed"; threadId: string; turnId?: string; timestamp: number }
  | { type: "turn-error"; threadId: string; turnId?: string; timestamp: number }
  | { type: "input-requested"; threadId: string; turnId?: string; callId: string; timestamp: number }
  | { type: "input-resolved"; threadId: string; callId: string; timestamp: number }
  | { type: "acknowledged"; threadId: string }
  | { type: "hook"; envelope: HookEnvelope };

export function initialRuntimeState(persisted?: PersistedThreadState): ThreadRuntimeState {
  return {
    working: false,
    needsUser: persisted?.needsUser ?? false,
    error: persisted?.error ?? false,
    changedAt: persisted?.changedAt ?? 0,
    ...(persisted?.lastCompletionId ? { lastCompletionId: persisted.lastCompletionId } : {}),
    ...(persisted?.lastAcknowledgedCompletionId
      ? { lastAcknowledgedCompletionId: persisted.lastAcknowledgedCompletionId }
      : {})
  };
}

export function reduceRuntimeState(previous: ThreadRuntimeState, event: StatusEvent): ThreadRuntimeState {
  if (event.type === "acknowledged") {
    if (!previous.lastCompletionId || previous.lastCompletionId === previous.lastAcknowledgedCompletionId) {
      return previous;
    }
    return {
      ...previous,
      lastAcknowledgedCompletionId: previous.lastCompletionId
    };
  }

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
        ...(previous.lastCompletionId ? { lastAcknowledgedCompletionId: previous.lastCompletionId } : {})
      };
    case "activity":
      return { ...previous, working: true, needsUser: false, changedAt: event.timestamp };
    case "input-requested":
      return { ...previous, working: true, needsUser: true, changedAt: event.timestamp };
    case "input-resolved":
      return { ...previous, working: true, needsUser: false, changedAt: event.timestamp };
    case "turn-completed": {
      const completionId = event.turnId ?? `${event.threadId}:${String(event.timestamp)}`;
      return {
        ...previous,
        working: false,
        needsUser: false,
        error: false,
        changedAt: event.timestamp,
        lastCompletionId: completionId
      };
    }
    case "turn-error":
      return {
        ...previous,
        working: false,
        needsUser: false,
        error: true,
        changedAt: event.timestamp
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
        changedAt: envelope.timestamp
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
    needsUser: runtime.needsUser,
    error: runtime.error,
    changedAt: runtime.changedAt
  };
}

import { describe, expect, it } from "vitest";

import { initialRuntimeState, reduceRuntimeState, visualState } from "../src/status/reducer";

const threadId = "019f6b6d-644d-7701-8858-9da6837aaaaa";

describe("status reducer", () => {
  it("follows working, needs-user, unread, and acknowledgement transitions", () => {
    let state = initialRuntimeState();
    state = reduceRuntimeState(state, { type: "turn-started", threadId, turnId: "turn-1", timestamp: 1 });
    expect(visualState(state)).toBe("working");

    state = reduceRuntimeState(state, {
      type: "hook",
      envelope: { version: 1, event: "permission-requested", threadId, turnId: "turn-1", timestamp: 2 }
    });
    expect(visualState(state)).toBe("needs-user");

    state = reduceRuntimeState(state, { type: "activity", threadId, timestamp: 3 });
    expect(visualState(state)).toBe("working");

    state = reduceRuntimeState(state, { type: "turn-completed", threadId, turnId: "turn-1", timestamp: 4 });
    expect(visualState(state)).toBe("unread");

    state = reduceRuntimeState(state, { type: "acknowledged", threadId, timestamp: 5 });
    expect(visualState(state)).toBe("idle");
  });

  it("keeps errors red until a new turn begins", () => {
    let state = reduceRuntimeState(initialRuntimeState(), {
      type: "turn-error",
      threadId,
      turnId: "turn-1",
      timestamp: 2
    });
    expect(visualState(state)).toBe("error");
    state = reduceRuntimeState(state, { type: "activity", threadId, timestamp: 3 });
    expect(visualState(state)).toBe("error");
    state = reduceRuntimeState(state, { type: "acknowledged", threadId, timestamp: 3 });
    expect(visualState(state)).toBe("error");
    state = reduceRuntimeState(state, { type: "turn-started", threadId, turnId: "turn-2", timestamp: 4 });
    expect(visualState(state)).toBe("working");
  });

  it("acknowledges the prior completion when a new turn starts", () => {
    let state = reduceRuntimeState(initialRuntimeState(), {
      type: "turn-completed",
      threadId,
      turnId: "turn-1",
      timestamp: 1
    });
    state = reduceRuntimeState(state, { type: "turn-started", threadId, turnId: "turn-2", timestamp: 2 });
    expect(state.lastAcknowledgedCompletionId).toBe("turn-1");
    expect(visualState(state)).toBe("working");
  });

  it("recovers active work from activity and ignores stale events", () => {
    let state = reduceRuntimeState(initialRuntimeState(), {
      type: "activity",
      threadId,
      timestamp: 10
    });
    expect(visualState(state)).toBe("working");

    state = reduceRuntimeState(state, { type: "turn-error", threadId, timestamp: 20 });
    state = reduceRuntimeState(state, { type: "activity", threadId, timestamp: 15 });
    expect(visualState(state)).toBe("error");
    expect(state.changedAt).toBe(20);
  });
});

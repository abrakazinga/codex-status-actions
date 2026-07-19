import { describe, expect, it } from "vitest";

import { UNREAD_PULSE_WINDOW_MS } from "../src/constants";
import { shouldPulseUnread } from "../src/status/unread-pulse";
import type { ThreadStatusSnapshot, ThreadVisualState } from "../src/types";

describe("unread pulse", () => {
  it("runs for the first five minutes of unread state only", () => {
    const changedAt = 1_000;
    const unread = snapshot("unread", changedAt);
    expect(shouldPulseUnread(unread, changedAt)).toBe(true);
    expect(shouldPulseUnread(unread, changedAt + UNREAD_PULSE_WINDOW_MS - 1)).toBe(true);
    expect(shouldPulseUnread(unread, changedAt + UNREAD_PULSE_WINDOW_MS)).toBe(false);
  });

  it("does not pulse other states or future timestamps", () => {
    expect(shouldPulseUnread(snapshot("idle", 1_000), 1_000)).toBe(false);
    expect(shouldPulseUnread(snapshot("unread", 1_001), 1_000)).toBe(false);
  });
});

function snapshot(state: ThreadVisualState, changedAt: number): ThreadStatusSnapshot {
  return {
    thread: { id: "thread", updatedAt: changedAt, ephemeral: false },
    state,
    changedAt
  };
}

import { describe, expect, it } from "vitest";

import { assignInOrder } from "../src/assignment";
import type { ThreadStatusSnapshot } from "../src/types";

function snapshot(id: string, updatedAt: number, parentThreadId?: string): ThreadStatusSnapshot {
  return {
    thread: {
      id,
      title: id,
      updatedAt,
      ephemeral: false,
      ...(parentThreadId ? { parentThreadId } : {})
    },
    state: "idle"
  };
}

describe("ordered assignment", () => {
  it("assigns row-major ranks independently on each device", () => {
    const assignments = assignInOrder(
      [
        { contextId: "bottom", deviceId: "one", row: 1, column: 0 },
        { contextId: "top", deviceId: "one", row: 0, column: 2 },
        { contextId: "other", deviceId: "two", row: 2, column: 2 }
      ],
      [snapshot("new", 20), snapshot("old", 10)]
    );
    expect(assignments.get("top")).toMatchObject({ rank: 1, snapshot: { thread: { id: "new" } } });
    expect(assignments.get("bottom")).toMatchObject({ rank: 2, snapshot: { thread: { id: "old" } } });
    expect(assignments.get("other")).toMatchObject({ rank: 1, snapshot: { thread: { id: "new" } } });
  });
});

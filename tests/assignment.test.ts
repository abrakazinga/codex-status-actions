import { describe, expect, it } from "vitest";

import { assignMostRecent, sortRecentThreads } from "../src/assignment";
import type { ThreadStatusSnapshot } from "../src/types";

function snapshot(id: string, updatedAt: number, parentThreadId?: string): ThreadStatusSnapshot {
  return {
    thread: {
      id,
      title: id,
      updatedAt,
      archived: false,
      ...(parentThreadId ? { parentThreadId } : {})
    },
    state: "idle",
    changedAt: updatedAt
  };
}

describe("most recent assignment", () => {
  it("sorts by recency, filters subagents, and uses a stable id tie break", () => {
    const result = sortRecentThreads([
      snapshot("b", 10),
      snapshot("a", 10),
      snapshot("new", 20),
      snapshot("child", 30, "parent")
    ]);
    expect(result.map((item) => item.thread.id)).toEqual(["new", "a", "b"]);
  });

  it("assigns row-major ranks independently on each device", () => {
    const assignments = assignMostRecent(
      [
        { contextId: "bottom", deviceId: "one", row: 1, column: 0 },
        { contextId: "top", deviceId: "one", row: 0, column: 2 },
        { contextId: "other", deviceId: "two", row: 2, column: 2 }
      ],
      [snapshot("old", 10), snapshot("new", 20)]
    );
    expect(assignments.get("top")).toMatchObject({ rank: 1, snapshot: { thread: { id: "new" } } });
    expect(assignments.get("bottom")).toMatchObject({ rank: 2, snapshot: { thread: { id: "old" } } });
    expect(assignments.get("other")).toMatchObject({ rank: 1, snapshot: { thread: { id: "new" } } });
  });
});

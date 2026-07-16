import { describe, expect, it } from "vitest";

import { promoteThreadOnNewTurn, reconcileThreadOrder } from "../src/thread-order";
import type { ThreadRecord } from "../src/types";

describe("thread order", () => {
  it("starts by recency and appends new catalog entries without moving existing tasks", () => {
    expect(reconcileThreadOrder([], [thread("old", 1), thread("new", 2)])).toEqual(["new", "old"]);
    expect(
      reconcileThreadOrder(["new", "old"], [thread("old", 4), thread("new", 2), thread("added", 3)])
    ).toEqual(["new", "old", "added"]);
  });

  it("moves only the task with a new turn to the front", () => {
    expect(promoteThreadOnNewTurn(["one", "two", "three"], "three", 20, 10)).toEqual(["three", "one", "two"]);
    expect(promoteThreadOnNewTurn(["three", "one", "two"], "three", 20, 10)).toEqual(["three", "one", "two"]);
  });

  it("ignores stale or replayed turn starts", () => {
    expect(promoteThreadOnNewTurn(["one", "two", "three"], "three", 10, 10)).toEqual(["one", "two", "three"]);
  });
});

function thread(id: string, updatedAt: number): ThreadRecord {
  return { id, title: id, updatedAt, ephemeral: false };
}

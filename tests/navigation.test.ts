import { describe, expect, it } from "vitest";

import { taskDeepLink } from "../src/navigation";

describe("Codex deep links", () => {
  it("builds a task URL only for UUIDs", () => {
    const id = "019f6b6d-644d-7701-8858-9da6837aaaaa";
    expect(taskDeepLink(id)).toBe(`codex://threads/${id}`);
    expect(() => taskDeepLink("../../bad")).toThrow("Invalid Codex task identifier");
  });
});

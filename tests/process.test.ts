import { describe, expect, it } from "vitest";

import { runProcess } from "../src/platform/process";

describe("process runner", () => {
  it("terminates commands that exceed their deadline", async () => {
    await expect(
      runProcess(process.execPath, ["-e", "setInterval(() => undefined, 1000)"], 50)
    ).rejects.toMatchObject({ timedOut: true });
  });
});

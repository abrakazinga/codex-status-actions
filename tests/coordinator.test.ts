import { describe, expect, it } from "vitest";

import { StatusCoordinator } from "../src/status/coordinator";

describe("status coordinator settings", () => {
  it("validates stored settings and exposes only property-inspector fields", () => {
    const coordinator = new StatusCoordinator(
      {
        enhancedStatusEnabled: false,
        codexHome: " /tmp/codex-home ",
        initialized: true,
        threadStates: {},
        rolloutOffsets: { "/private/session.jsonl": 42 }
      },
      () => Promise.resolve(),
      () => undefined
    );

    expect(coordinator.propertySnapshot().settings).toEqual({
      enhancedStatusEnabled: false,
      codexHome: "/tmp/codex-home"
    });
  });

  it("falls back to safe defaults for malformed settings", () => {
    const coordinator = new StatusCoordinator(
      { enhancedStatusEnabled: "yes", rolloutOffsets: "invalid" },
      () => Promise.resolve(),
      () => undefined
    );
    expect(coordinator.propertySnapshot().settings).toEqual({ enhancedStatusEnabled: true });
  });
});

import { describe, expect, it } from "vitest";

import { CodexRuntime } from "../src/codex/runtime";
import { GlobalSettingsStore } from "../src/settings";
import { StatusCoordinator } from "../src/status/coordinator";

describe("status coordinator settings", () => {
  it("validates stored settings and exposes only property-inspector fields", () => {
    const coordinator = createCoordinator({
      enhancedStatusEnabled: false,
      codexHome: " /tmp/codex-home ",
      initialized: true,
      threadStates: {},
      rolloutOffsets: { "/private/session.jsonl": 42 }
    });

    expect(coordinator.propertySnapshot().settings).toEqual({
      enhancedStatusEnabled: false,
      codexHome: "/tmp/codex-home"
    });

    coordinator.markNavigation(false, "Sensitive /private/path and task ID");
    expect(coordinator.unavailable).toBe(false);
    expect(coordinator.propertySnapshot().health.navigation).toBe("error");
    const diagnostics = coordinator.diagnostics();
    expect(JSON.parse(diagnostics)).toMatchObject({ isCustomCodexHomeConfigured: true });
    expect(diagnostics).not.toContain("/tmp/codex-home");
    expect(diagnostics).not.toContain("Sensitive /private/path and task ID");
  });

  it("falls back to safe defaults for malformed settings", () => {
    const coordinator = createCoordinator({ enhancedStatusEnabled: "yes", rolloutOffsets: "invalid" });
    expect(coordinator.propertySnapshot().settings).toEqual({
      enhancedStatusEnabled: true
    });
  });
});

function createCoordinator(settings: unknown): StatusCoordinator {
  const store = new GlobalSettingsStore(settings, () => Promise.resolve());
  const runtime = new CodexRuntime(() => "/tmp/codex-home");
  return new StatusCoordinator(store, runtime, () => undefined);
}

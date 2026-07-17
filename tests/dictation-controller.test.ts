import { describe, expect, it, vi } from "vitest";

import { DictationController } from "../src/dictation/controller";
import { DictationPlatformError } from "../src/dictation/platform-error";
import { GlobalSettingsStore } from "../src/settings";
import type { DictationPlatform, ShortcutBinding } from "../src/types";
import { deferred } from "./helpers";

const binding: ShortcutBinding = { key: "D", modifiers: ["control", "option"] };

class FakePlatform implements DictationPlatform {
  readonly calls: string[] = [];
  activation = Promise.resolve();
  shortcutFailure: Error | undefined;

  async activateCodex(): Promise<void> {
    this.calls.push("activate");
    await this.activation;
  }

  emitShortcut(): Promise<void> {
    this.calls.push("shortcut");
    return this.shortcutFailure ? Promise.reject(this.shortcutFailure) : Promise.resolve();
  }

  openPrivacySettings(): Promise<void> {
    this.calls.push("privacy");
    return Promise.resolve();
  }
}

function setup(): {
  controller: DictationController;
  platform: FakePlatform;
  persist: ReturnType<typeof vi.fn>;
} {
  const platform = new FakePlatform();
  const persist = vi.fn(() => Promise.resolve());
  const settings = new GlobalSettingsStore({ dictationShortcut: binding }, persist);
  const controller = new DictationController(platform, settings);
  controller.markSettingsReady();
  return { controller, platform, persist };
}

describe("dictation controller", () => {
  it("waits for global settings hydration before using the saved shortcut", async () => {
    const platform = new FakePlatform();
    const settings = new GlobalSettingsStore({ dictationShortcut: binding }, () => Promise.resolve());
    const controller = new DictationController(platform, settings);

    const start = controller.start("first");
    await Promise.resolve();
    expect(controller.snapshot().settingsReady).toBe(false);
    expect(platform.calls).toEqual([]);

    controller.markSettingsReady();
    await start;
    expect(platform.calls).toEqual(["activate", "shortcut"]);
    expect(controller.snapshot()).toMatchObject({ settingsReady: true, state: "recording" });
  });

  it("starts and stops hold dictation in order", async () => {
    const { controller, platform } = setup();
    const states: string[] = [];
    controller.subscribe(() => states.push(controller.snapshot().state));

    await controller.start("first");
    await controller.stop("first");

    expect(platform.calls).toEqual(["activate", "shortcut", "shortcut"]);
    expect(states).toEqual(["activating", "recording", "idle"]);
  });

  it("serializes a short press so release follows a pending start", async () => {
    const { controller, platform } = setup();
    const activation = deferred<undefined>();
    platform.activation = activation.promise;

    const start = controller.start("first");
    const stop = controller.stop("first");
    await Promise.resolve();
    expect(platform.calls).toEqual(["activate"]);
    activation.resolve(undefined);
    await Promise.all([start, stop]);

    expect(platform.calls).toEqual(["activate", "shortcut", "shortcut"]);
    expect(controller.snapshot().state).toBe("idle");
  });

  it("shares toggle state across tile instances", async () => {
    const { controller, platform } = setup();
    await controller.toggle("first");
    await controller.toggle("second");
    expect(platform.calls).toEqual(["activate", "shortcut", "shortcut"]);
    expect(controller.snapshot().state).toBe("idle");
  });

  it("only lets the owning hold tile stop or disappear", async () => {
    const { controller, platform } = setup();
    await controller.start("first");
    await controller.stop("second");
    expect(controller.snapshot().state).toBe("recording");
    await controller.releaseOwner("first");
    expect(platform.calls).toEqual(["activate", "shortcut", "shortcut"]);
    expect(controller.snapshot().state).toBe("idle");
  });

  it("classifies permission errors without retaining command content", async () => {
    const { controller, platform } = setup();
    platform.shortcutFailure = new DictationPlatformError("permission-denied", "Permission denied");

    await expect(controller.start("first")).rejects.toThrow("Permission denied");
    expect(controller.snapshot()).toMatchObject({
      state: "error",
      availability: "available",
      permission: "denied",
      lastError: "Permission denied"
    });
  });

  it("retries stopping instead of inverting state after an uncertain stop failure", async () => {
    const { controller, platform } = setup();
    await controller.start("first");
    platform.shortcutFailure = new DictationPlatformError("command-failed", "Shortcut failed");
    await expect(controller.stop("first")).rejects.toThrow("Shortcut failed");
    expect(controller.snapshot().state).toBe("error");

    platform.shortcutFailure = undefined;
    await controller.toggle("second");
    expect(platform.calls).toEqual(["activate", "shortcut", "shortcut", "shortcut"]);
    expect(controller.snapshot().state).toBe("idle");
  });

  it("persists the global shortcut without overwriting other settings", async () => {
    const platform = new FakePlatform();
    const writes: unknown[] = [];
    const settings = new GlobalSettingsStore(
      { enhancedStatusEnabled: false, codexHome: "/custom" },
      (value) => {
        writes.push(value);
        return Promise.resolve();
      }
    );
    const controller = new DictationController(platform, settings);
    controller.markSettingsReady();

    await controller.setShortcut(binding);
    expect(writes).toEqual([
      expect.objectContaining({
        enhancedStatusEnabled: false,
        codexHome: "/custom",
        dictationShortcut: binding
      })
    ]);
    await controller.setShortcut();
    expect(settings.current.dictationShortcut).toBeUndefined();
  });

  it("does not change the binding while dictation may still be active", async () => {
    const { controller } = setup();
    await controller.start("first");
    await expect(controller.setShortcut({ key: "K", modifiers: ["command"] })).rejects.toThrow(
      "Stop dictation before changing its shortcut"
    );
    expect(controller.snapshot().shortcut).toEqual(binding);
  });

  it("attempts a best-effort stop during shutdown", async () => {
    const { controller, platform } = setup();
    await controller.start("first");
    await controller.dispose();
    expect(platform.calls).toEqual(["activate", "shortcut", "shortcut"]);
  });
});

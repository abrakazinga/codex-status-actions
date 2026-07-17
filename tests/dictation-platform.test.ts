import { describe, expect, it, vi } from "vitest";

import { MacOsDictationPlatform, shortcutArguments } from "../src/platform/macos/dictation-platform";
import { ProcessError, type ProcessRunner } from "../src/platform/process";

const success = { stdout: "", stderr: "" };

describe("macOS dictation platform", () => {
  it("activates Codex and waits until its bundle is frontmost", async () => {
    const commands: Array<{ executable: string; args: readonly string[] }> = [];
    const run: ProcessRunner = (executable, args) => {
      commands.push({ executable, args: [...args] });
      if (args[0] === "front") return Promise.resolve({ stdout: "ASN:0x0-0x1234:\n", stderr: "" });
      if (args[0] === "info") {
        return Promise.resolve({ stdout: '"CFBundleIdentifier"="com.openai.codex"\n', stderr: "" });
      }
      return Promise.resolve(success);
    };
    const platform = new MacOsDictationPlatform(run, () => Promise.resolve());

    await platform.activateCodex();

    expect(commands).toEqual([
      { executable: "/usr/bin/open", args: ["-b", "com.openai.codex"] },
      { executable: "/usr/bin/lsappinfo", args: ["front"] },
      {
        executable: "/usr/bin/lsappinfo",
        args: ["info", "-only", "bundleID", "ASN:0x0-0x1234:"]
      }
    ]);
  });

  it("times out without claiming Codex is ready", async () => {
    let now = 0;
    const run: ProcessRunner = (executable, args) => {
      if (executable === "/usr/bin/lsappinfo" && args[0] === "front") {
        return Promise.resolve({ stdout: "ASN:0x0-0x1234:\n", stderr: "" });
      }
      if (executable === "/usr/bin/lsappinfo") {
        return Promise.resolve({ stdout: '"CFBundleIdentifier"="com.apple.finder"\n', stderr: "" });
      }
      return Promise.resolve(success);
    };
    const platform = new MacOsDictationPlatform(
      run,
      () => {
        now += 100;
        return Promise.resolve();
      },
      () => now
    );

    await expect(platform.activateCodex()).rejects.toMatchObject({
      code: "activation-timeout"
    });
  });

  it("distinguishes a missing Codex installation", async () => {
    const run: ProcessRunner = () =>
      Promise.reject(
        new ProcessError(
          "/usr/bin/open",
          1,
          "LSCopyApplicationURLsForBundleIdentifier() failed for bundle identifier"
        )
      );
    const platform = new MacOsDictationPlatform(run);
    await expect(platform.activateCodex()).rejects.toMatchObject({
      code: "codex-missing"
    });
  });

  it("dispatches an allow-listed shortcut without shell interpolation", async () => {
    const run = vi.fn<ProcessRunner>().mockResolvedValue(success);
    const platform = new MacOsDictationPlatform(run);
    await platform.emitShortcut({ key: "D", modifiers: ["control", "option"] });

    expect(run).toHaveBeenCalledWith("/usr/bin/osascript", ["-e", expect.not.stringContaining(" d "), "d"]);
    const args = shortcutArguments({ key: "D", modifiers: ["control", "option"] });
    expect(args[1]).toContain("control down, option down");
    expect(args[1]).not.toContain("D");
    expect(() => shortcutArguments({ key: 'D" & do shell script "bad', modifiers: ["command"] })).toThrow(
      "Invalid dictation shortcut"
    );
  });

  it("uses fixed key codes for function keys", () => {
    expect(shortcutArguments({ key: "F20", modifiers: [] })).toEqual([
      "-e",
      'tell application "System Events" to key code 90'
    ]);
  });

  it("classifies System Events permission denial", async () => {
    const run: ProcessRunner = () =>
      Promise.reject(new ProcessError("/usr/bin/osascript", 1, "not allowed to send keystrokes (-1743)"));
    const platform = new MacOsDictationPlatform(run);
    await expect(platform.emitShortcut({ key: "D", modifiers: ["control"] })).rejects.toMatchObject({
      code: "permission-denied"
    });
  });

  it("classifies a stalled shortcut command separately", async () => {
    const run: ProcessRunner = () => Promise.reject(new ProcessError("/usr/bin/osascript", null, "", true));
    const platform = new MacOsDictationPlatform(run);
    await expect(platform.emitShortcut({ key: "D", modifiers: ["control"] })).rejects.toMatchObject({
      code: "command-timeout"
    });
  });
});

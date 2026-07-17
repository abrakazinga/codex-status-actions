import type { DictationPlatform, ShortcutBinding, ShortcutModifier } from "../../types";
import { requireShortcut } from "../../dictation/shortcut";
import { DictationPlatformError } from "../../dictation/platform-error";
import { ProcessError, runProcess, type ProcessRunner } from "../process";
import { sleep } from "../../util";

const CODEX_BUNDLE_ID = "com.openai.codex";
const ACTIVATION_TIMEOUT_MS = 2_000;
const ACTIVATION_POLL_MS = 100;
const PRIVACY_SETTINGS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";

const APPLE_SCRIPT_MODIFIERS: Record<ShortcutModifier, string> = {
  command: "command down",
  control: "control down",
  option: "option down",
  shift: "shift down"
};

const FUNCTION_KEY_CODES: Readonly<Record<string, number>> = {
  F1: 122,
  F2: 120,
  F3: 99,
  F4: 118,
  F5: 96,
  F6: 97,
  F7: 98,
  F8: 100,
  F9: 101,
  F10: 109,
  F11: 103,
  F12: 111,
  F13: 105,
  F14: 107,
  F15: 113,
  F16: 106,
  F17: 64,
  F18: 79,
  F19: 80,
  F20: 90
};

type Wait = (milliseconds: number) => Promise<void>;

export class MacOsDictationPlatform implements DictationPlatform {
  constructor(
    private readonly run: ProcessRunner = runProcess,
    private readonly wait: Wait = sleep,
    private readonly now: () => number = Date.now
  ) {}

  async activateCodex(): Promise<void> {
    try {
      await this.run("/usr/bin/open", ["-b", CODEX_BUNDLE_ID]);
    } catch (error) {
      if (isTimeout(error)) {
        throw new DictationPlatformError("activation-timeout", "Codex did not become ready in time");
      }
      if (isMissingApplication(error)) {
        throw new DictationPlatformError("codex-missing", "Codex is not installed");
      }
      throw new DictationPlatformError("command-failed", "Could not activate Codex");
    }

    const deadline = this.now() + ACTIVATION_TIMEOUT_MS;
    while (this.now() <= deadline) {
      if (await this.isCodexFrontmost()) return;
      await this.wait(ACTIVATION_POLL_MS);
    }
    throw new DictationPlatformError("activation-timeout", "Codex did not become ready in time");
  }

  async emitShortcut(value: ShortcutBinding): Promise<void> {
    const shortcut = requireShortcut(value);
    const args = shortcutArguments(shortcut);
    try {
      await this.run("/usr/bin/osascript", args);
    } catch (error) {
      if (isTimeout(error)) {
        throw new DictationPlatformError("command-timeout", "Sending the dictation shortcut timed out");
      }
      if (isPermissionDenied(error)) {
        throw new DictationPlatformError(
          "permission-denied",
          "Allow Stream Deck to control your Mac in Privacy & Security"
        );
      }
      throw new DictationPlatformError("command-failed", "Could not send the dictation shortcut");
    }
  }

  async openPrivacySettings(): Promise<void> {
    try {
      await this.run("/usr/bin/open", [PRIVACY_SETTINGS_URL]);
    } catch {
      throw new DictationPlatformError("command-failed", "Could not open Privacy & Security settings");
    }
  }

  private async isCodexFrontmost(): Promise<boolean> {
    try {
      const front = await this.run("/usr/bin/lsappinfo", ["front"]);
      const asn = front.stdout.trim();
      if (!/^ASN:0x[\da-f]+-0x[\da-f]+:$/i.test(asn)) return false;
      const info = await this.run("/usr/bin/lsappinfo", ["info", "-only", "bundleID", asn]);
      return info.stdout.includes(`"${CODEX_BUNDLE_ID}"`);
    } catch {
      return false;
    }
  }
}

export function shortcutArguments(shortcut: ShortcutBinding): readonly string[] {
  shortcut = requireShortcut(shortcut);
  const modifiers = shortcut.modifiers.map((modifier) => APPLE_SCRIPT_MODIFIERS[modifier]).join(", ");
  const using = modifiers ? ` using {${modifiers}}` : "";
  const keyCode = FUNCTION_KEY_CODES[shortcut.key];
  if (keyCode !== undefined) {
    return ["-e", `tell application "System Events" to key code ${String(keyCode)}${using}`];
  }
  return [
    "-e",
    `on run argv\ntell application "System Events" to keystroke (item 1 of argv)${using}\nend run`,
    shortcut.key.toLowerCase()
  ];
}

function isMissingApplication(error: unknown): boolean {
  return (
    error instanceof ProcessError &&
    /unable to find|application isn.?t running|does not exist|LSCopyApplicationURLsForBundleIdentifier|bundle identifier/i.test(
      error.stderr
    )
  );
}

function isTimeout(error: unknown): boolean {
  return error instanceof ProcessError && error.timedOut;
}

function isPermissionDenied(error: unknown): boolean {
  return (
    error instanceof ProcessError &&
    /not allowed|not authorized|accessibility|(-1743|-10004)/i.test(error.stderr)
  );
}

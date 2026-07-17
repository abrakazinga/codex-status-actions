import type { DictationPlatform } from "./types";
import { MacOsDictationPlatform } from "./platform/macos/dictation-platform";

export function createDictationPlatform(platform: NodeJS.Platform = process.platform): DictationPlatform {
  if (platform === "darwin") return new MacOsDictationPlatform();
  throw new Error(`Dictation is not supported on ${platform}`);
}

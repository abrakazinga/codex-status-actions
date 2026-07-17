export type DictationPlatformErrorCode =
  "codex-missing" | "activation-timeout" | "permission-denied" | "command-timeout" | "command-failed";

export class DictationPlatformError extends Error {
  constructor(
    readonly code: DictationPlatformErrorCode,
    message: string
  ) {
    super(message);
    this.name = "DictationPlatformError";
  }
}

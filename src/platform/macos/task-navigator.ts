import { taskDeepLink } from "../../task-link";
import type { TaskNavigationMode, TaskNavigator } from "../../types";
import { sleep } from "../../util";
import { runProcess } from "../process";

const CODEX_BUNDLE_ID = "com.openai.codex";
const ACTIVATION_WAIT_MS = 175;

type CommandRunner = (executable: string, args: readonly string[]) => Promise<void>;
type Wait = (milliseconds: number) => Promise<void>;

export class MacOsTaskNavigator implements TaskNavigator {
  constructor(
    private readonly runCommand: CommandRunner = executeCommand,
    private readonly wait: Wait = sleep
  ) {}

  async selectTask(threadId: string, mode: TaskNavigationMode): Promise<void> {
    if (mode === "foreground") {
      await this.runCommand("/usr/bin/open", ["-b", CODEX_BUNDLE_ID]);
      await this.wait(ACTIVATION_WAIT_MS);
    }
    await this.runCommand("/usr/bin/open", ["-g", taskDeepLink(threadId)]);
  }
}

function executeCommand(executable: string, args: readonly string[]): Promise<void> {
  return runProcess(executable, args).then(() => undefined);
}

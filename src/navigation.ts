import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import { ACTIVATION_WAIT_MS, CODEX_BUNDLE_ID } from "./constants";
import { isThreadId, sleep } from "./util";

const execFileAsync = promisify(execFile);

export function taskDeepLink(threadId: string): string {
  if (!isThreadId(threadId)) throw new Error("Invalid Codex task identifier");
  return `codex://threads/${threadId}`;
}

export async function isCodexForeground(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("/usr/bin/lsappinfo", ["front"]);
    const { stdout: details } = await execFileAsync("/usr/bin/lsappinfo", [
      "info",
      "-only",
      "bundleid",
      stdout.trim()
    ]);
    return details.includes(CODEX_BUNDLE_ID);
  } catch {
    return false;
  }
}

export async function openTaskInBackground(threadId: string): Promise<void> {
  await runOpen(["-g", taskDeepLink(threadId)]);
}

export async function activateCodexAndOpenTask(threadId: string): Promise<void> {
  await runOpen(["-b", CODEX_BUNDLE_ID]);
  await sleep(ACTIVATION_WAIT_MS);
  await runOpen(["-g", taskDeepLink(threadId)]);
}

function runOpen(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/open", args, { stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`open exited with status ${String(code ?? "unknown")}`));
    });
  });
}

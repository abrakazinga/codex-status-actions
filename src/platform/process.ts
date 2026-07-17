import { spawn } from "node:child_process";

const MAX_OUTPUT_BYTES = 8_192;
const DEFAULT_TIMEOUT_MS = 5_000;

export interface ProcessResult {
  stdout: string;
  stderr: string;
}

export type ProcessRunner = (
  executable: string,
  args: readonly string[],
  timeoutMs?: number
) => Promise<ProcessResult>;

export class ProcessError extends Error {
  constructor(
    readonly executable: string,
    readonly exitCode: number | null,
    readonly stderr: string,
    readonly timedOut = false
  ) {
    super(
      timedOut
        ? `${executable} timed out`
        : `${executable} exited with status ${String(exitCode ?? "unknown")}`
    );
    this.name = "ProcessError";
  }
}

export function runProcess(
  executable: string,
  args: readonly string[],
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;

    const finish = (complete: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      complete();
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => reject(new ProcessError(executable, null, "", true)));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdoutBytes >= MAX_OUTPUT_BYTES) return;
      const retained = chunk.subarray(0, MAX_OUTPUT_BYTES - stdoutBytes);
      stdout.push(retained);
      stdoutBytes += retained.length;
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderrBytes >= MAX_OUTPUT_BYTES) return;
      const retained = chunk.subarray(0, MAX_OUTPUT_BYTES - stderrBytes);
      stderr.push(retained);
      stderrBytes += retained.length;
    });
    child.once("error", (error) => finish(() => reject(error)));
    child.once("close", (code) => {
      const result = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8")
      };
      finish(() => {
        if (code === 0) resolve(result);
        else reject(new ProcessError(executable, code, result.stderr));
      });
    });
  });
}

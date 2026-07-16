import { access } from "node:fs/promises";
import path from "node:path";
import { constants as fsConstants } from "node:fs";

import { CODEX_APP_PATH } from "./constants";
import type { GlobalSettings } from "./types";

export function resolveCodexHome(settings: Pick<GlobalSettings, "codexHome">): string {
  const configured = settings.codexHome?.trim();
  if (configured) return path.resolve(configured.replace(/^~(?=\/|$)/, process.env.HOME ?? ""));
  if (process.env.CODEX_HOME) return path.resolve(process.env.CODEX_HOME);
  return path.join(process.env.HOME ?? "/tmp", ".codex");
}

export async function findCodexBinary(override?: string): Promise<string | undefined> {
  for (const candidate of [override, CODEX_APP_PATH]) {
    if (candidate && (await isExecutable(candidate))) return candidate;
  }

  const pathEntries = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    const candidate = path.join(entry, "codex");
    if (await isExecutable(candidate)) return candidate;
  }
  return undefined;
}

async function isExecutable(candidate: string): Promise<boolean> {
  try {
    await access(candidate, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function isThreadId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

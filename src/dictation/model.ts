import type { DictationActionSettings } from "../types";

const DEFAULT_DICTATION_SETTINGS: DictationActionSettings = { mode: "hold" };

export function normalizeDictationSettings(value: unknown): DictationActionSettings {
  if (!value || typeof value !== "object") return { ...DEFAULT_DICTATION_SETTINGS };
  return { mode: (value as { mode?: unknown }).mode === "toggle" ? "toggle" : "hold" };
}

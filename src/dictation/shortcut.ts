import type { ShortcutBinding, ShortcutModifier } from "../types";

const MODIFIER_ORDER: readonly ShortcutModifier[] = ["control", "option", "shift", "command"];
const SUPPORTED_KEY = /^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|20))$/;
const ALPHANUMERIC_KEY = /^[A-Z0-9]$/;

export function normalizeShortcut(value: unknown): ShortcutBinding | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as { key?: unknown; modifiers?: unknown };
  if (typeof candidate.key !== "string" || !Array.isArray(candidate.modifiers)) return undefined;

  const key = candidate.key.trim().toUpperCase();
  if (!SUPPORTED_KEY.test(key)) return undefined;
  const provided = new Set(candidate.modifiers);
  if ([...provided].some((modifier) => !MODIFIER_ORDER.includes(modifier as ShortcutModifier))) {
    return undefined;
  }
  const modifiers = MODIFIER_ORDER.filter((modifier) => provided.has(modifier));
  if (ALPHANUMERIC_KEY.test(key) && modifiers.length === 0) return undefined;
  return { key, modifiers };
}

export function requireShortcut(value: unknown): ShortcutBinding {
  const shortcut = normalizeShortcut(value);
  if (!shortcut) throw new Error("Invalid dictation shortcut");
  return shortcut;
}

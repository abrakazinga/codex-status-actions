import { describe, expect, it } from "vitest";

import { normalizeShortcut, requireShortcut } from "../src/dictation/shortcut";

describe("dictation shortcut", () => {
  it("normalizes keys, removes duplicate modifiers, and fixes modifier order", () => {
    expect(normalizeShortcut({ key: " d ", modifiers: ["command", "control", "command", "option"] })).toEqual(
      { key: "D", modifiers: ["control", "option", "command"] }
    );
  });

  it("accepts supported function keys without modifiers", () => {
    expect(normalizeShortcut({ key: "f20", modifiers: [] })).toEqual({ key: "F20", modifiers: [] });
  });

  it.each([
    { key: "D", modifiers: [] },
    { key: "F21", modifiers: ["control"] },
    { key: "Escape", modifiers: ["control"] },
    { key: 'D" & do shell script "bad', modifiers: ["command"] },
    { key: "D", modifiers: ["fn"] }
  ])("rejects unsupported or unsafe binding $key", (binding) => {
    expect(normalizeShortcut(binding)).toBeUndefined();
    expect(() => requireShortcut(binding)).toThrow("Invalid dictation shortcut");
  });
});

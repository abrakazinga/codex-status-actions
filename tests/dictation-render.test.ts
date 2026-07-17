import { describe, expect, it } from "vitest";

import { dictationVisualState, renderDictationTile } from "../src/dictation/render";

describe("dictation tile renderer", () => {
  it("shows loading instead of setup-required before global settings are hydrated", () => {
    expect(dictationVisualState({ settingsReady: false, state: "idle" })).toBe("loading");
    expect(dictationVisualState({ settingsReady: true, state: "idle" })).toBe("setup-required");
    expect(
      dictationVisualState({
        settingsReady: true,
        state: "idle",
        shortcut: { key: "D", modifiers: ["control"] }
      })
    ).toBe("idle");
  });

  it("renders an outlined idle microphone on a transparent background", () => {
    const svg = decodeSvg(renderDictationTile("idle"));
    expect(svg).not.toContain("<rect width");
    expect(svg).toContain('stroke="#F1F1ED"');
    expect(svg).toContain('<rect x="58" y="37" width="28" height="49" rx="14"/>');
  });

  it("renders the outlined microphone in blue with a ten-frame pulse while active", () => {
    const frames = Array.from({ length: 10 }, (_, frame) =>
      decodeSvg(renderDictationTile("recording", frame))
    );
    expect(new Set(frames)).toHaveLength(6);
    expect(frames[0]).toContain('fill="none" stroke="#8DCEF5"');
    expect(frames[0]).toContain('<rect x="58" y="37" width="28" height="49" rx="14"/>');
    expect(frames[0]).toContain('opacity="0.860"');
    expect(frames[5]).toContain('opacity="1.000"');
    expect(decodeSvg(renderDictationTile("recording", 10))).toBe(frames[0]);
    expect(renderDictationTile("activating", 5)).toBe(renderDictationTile("recording", 5));
  });

  it("reuses established status glyphs for setup, loading, and failure", () => {
    expect(decodeSvg(renderDictationTile("setup-required"))).toContain("#FF8A3D");
    expect(decodeSvg(renderDictationTile("loading"))).toContain("#8DCEF5");
    expect(decodeSvg(renderDictationTile("error"))).toContain("#FF6B73");
  });
});

function decodeSvg(image: string): string {
  const prefix = "data:image/svg+xml;base64,";
  expect(image.startsWith(prefix)).toBe(true);
  return Buffer.from(image.slice(prefix.length), "base64").toString("utf8");
}

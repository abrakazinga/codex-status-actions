import { describe, expect, it } from "vitest";

import { renderStatusTile } from "../src/render";

describe("tile renderer", () => {
  it.each([
    ["idle", "#F1F1ED"],
    ["unread", "#8FEA98"],
    ["working", "#8DCEF5"],
    ["needs-user", "#FFCBB6"],
    ["error", "#FF6B73"]
  ] as const)("renders %s with its fixed palette", (state, color) => {
    expect(decodeSvg(renderStatusTile(state, "Task", 1))).toContain(color);
  });

  it("escapes task titles before placing them in SVG", () => {
    const svg = decodeSvg(renderStatusTile("unread", '<open & "close">', 2));
    expect(svg).toContain("&lt;OPEN");
    expect(svg).toContain("&amp;");
    expect(svg).not.toContain(">UNREAD · <OPEN");
  });

  it("renders one truncated debug line and the rank", () => {
    const svg = decodeSvg(renderStatusTile("idle", "abcdefghijklmnopqrstuvwxyz0123456789", 1));
    expect(svg).toContain(">IDLE · ABCDEFGHIJKLMN…</text>");
    expect(svg).toContain(">1</text>");
    expect(svg.match(/<text/g)).toHaveLength(2);
  });

  it("returns an SVG data URI accepted by Stream Deck", () => {
    expect(renderStatusTile("working", "Task", 1)).toMatch(/^data:image\/svg\+xml;base64,/);
  });
});

function decodeSvg(image: string): string {
  const prefix = "data:image/svg+xml;base64,";
  expect(image.startsWith(prefix)).toBe(true);
  return Buffer.from(image.slice(prefix.length), "base64").toString("utf8");
}

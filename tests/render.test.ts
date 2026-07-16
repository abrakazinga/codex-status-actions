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
    expect(decodeSvg(renderStatusTile(state))).toContain(color);
  });

  it("leaves the tile background transparent", () => {
    expect(decodeSvg(renderStatusTile("idle"))).not.toContain("<rect");
  });

  it("renders only one centered filled circle without text", () => {
    const svg = decodeSvg(renderStatusTile("working"));
    expect(svg).toContain('<circle cx="72" cy="72" r="34" fill="#8DCEF5"/>');
    expect(svg).not.toContain("<text");
    expect(svg.match(/<circle/g)).toHaveLength(1);
  });

  it("returns an SVG data URI accepted by Stream Deck", () => {
    expect(renderStatusTile("working")).toMatch(/^data:image\/svg\+xml;base64,/);
  });
});

function decodeSvg(image: string): string {
  const prefix = "data:image/svg+xml;base64,";
  expect(image.startsWith(prefix)).toBe(true);
  return Buffer.from(image.slice(prefix.length), "base64").toString("utf8");
}

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
    expect(renderStatusTile(state, "Task", 1)).toContain(color);
  });

  it("escapes task titles before placing them in SVG", () => {
    const svg = renderStatusTile("unread", '<open & "close">', 2);
    expect(svg).toContain("&lt;OPEN");
    expect(svg).toContain("&amp;");
    expect(svg).not.toContain('<text x="13" y="105"[^>]*><OPEN');
  });

  it("uses both lines and an ellipsis for a long unbroken title", () => {
    const svg = renderStatusTile("idle", "abcdefghijklmnopqrstuvwxyz0123456789", 1);
    expect(svg).toContain(">ABCDEFGHIJKLMNOP</text>");
    expect(svg).toContain(">QRSTUVWXYZ01234…</text>");
  });
});

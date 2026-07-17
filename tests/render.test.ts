import { describe, expect, it } from "vitest";

import { renderStatusTile } from "../src/render";

describe("tile renderer", () => {
  it.each([
    ["idle", "#F1F1ED"],
    ["unread", "#8FEA98"],
    ["working", "#8DCEF5"],
    ["needs-user", "#FF8A3D"],
    ["error", "#FF6B73"]
  ] as const)("renders %s with its fixed palette", (state, color) => {
    expect(decodeSvg(renderStatusTile(state))).toContain(color);
  });

  it("leaves the tile background transparent", () => {
    expect(decodeSvg(renderStatusTile("idle"))).not.toContain("<rect");
  });

  it("renders idle as a hollow circle", () => {
    expect(decodeSvg(renderStatusTile("idle"))).toContain(
      '<circle cx="72" cy="72" r="31" fill="none" stroke="#F1F1ED" stroke-width="7"/>'
    );
  });

  it("renders unread as a filled circle", () => {
    expect(decodeSvg(renderStatusTile("unread"))).toContain(
      '<circle cx="72" cy="72" r="34" fill="#8FEA98"/>'
    );
  });

  it("renders a 30-frame expanding and contracting working ring", () => {
    const frames = Array.from({ length: 30 }, (_, frame) => decodeSvg(renderStatusTile("working", frame)));
    expect(new Set(frames)).toHaveLength(30);
    expect(frames[0]).not.toContain("<circle");
    expect(frames[0]).toContain(
      '<path d="M72 41 A31 31 0 0 1 83.412 43.177" fill="none" stroke="#8DCEF5" stroke-width="7" stroke-linecap="round"/>'
    );
    expect(frames[0]).not.toContain("stroke-dasharray");

    const start = arcMetrics(frames[0] ?? "");
    const expanding = arcMetrics(frames[8] ?? "");
    const widest = arcMetrics(frames[15] ?? "");
    const contracting = arcMetrics(frames[22] ?? "");
    const end = arcMetrics(frames[29] ?? "");
    expect(start).toEqual({ length: 6, start: 0 });
    expect(expanding.length).toBeGreaterThan(start.length);
    expect(expanding.start).toBeCloseTo(0);
    expect(widest).toEqual({ length: 94, start: 0 });
    expect(contracting.length).toBeLessThan(widest.length);
    expect(contracting.start).toBeGreaterThan(0);
    expect(end.length).toBeLessThan(contracting.length);
    expect(end.start + end.length).toBeGreaterThan(100);
    expect(decodeSvg(renderStatusTile("working", 30))).toBe(frames[0]);
  });

  it("renders needs-user as a filled triangle", () => {
    expect(decodeSvg(renderStatusTile("needs-user"))).toContain(
      '<path d="M72 38 L105.5 96 L38.5 96 Z" fill="#FF8A3D"/>'
    );
  });

  it("renders error as a filled circle with an x", () => {
    const svg = decodeSvg(renderStatusTile("error"));
    expect(svg).toContain('<circle cx="72" cy="72" r="34" fill="#FF6B73"/>');
    expect(svg).toContain('d="M58 58 L86 86 M86 58 L58 86" fill="none" stroke="#111315" stroke-width="7"');
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

function arcMetrics(svg: string): { length: number; start: number } {
  const match = /<path d="M([\d.-]+) ([\d.-]+) A31 31 0 ([01]) 1 ([\d.-]+) ([\d.-]+)"/.exec(svg);
  expect(match).not.toBeNull();
  const start = angleProgress(Number(match?.[1]), Number(match?.[2]));
  const end = angleProgress(Number(match?.[4]), Number(match?.[5]));
  const minorLength = (end - start + 100) % 100;
  const length = Number(match?.[3]) === 1 && minorLength < 50 ? minorLength + 100 : minorLength;
  return { length: rounded(length), start: rounded(start) };
}

function angleProgress(x: number, y: number): number {
  const degrees = (Math.atan2(y - 72, x - 72) * 180) / Math.PI + 90;
  return ((degrees / 360) * 100 + 100) % 100;
}

function rounded(value: number): number {
  return Number(value.toFixed(2));
}

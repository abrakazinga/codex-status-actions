import { describe, expect, it } from "vitest";

import { THEME } from "../src/theme";
import { DEFAULT_USAGE_SETTINGS, type UsageSnapshot } from "../src/usage/model";
import { renderUsageError, renderUsageTile } from "../src/usage/render";

const now = Date.UTC(2026, 0, 1, 2);
const ready: UsageSnapshot = {
  status: "ready",
  windows: {
    "five-hour": { usedPercent: 28, durationMinutes: 300, resetsAt: now + 3 * 60 * 60_000 },
    week: { usedPercent: 72, durationMinutes: 10_080, resetsAt: now + (5 * 24 + 22) * 60 * 60_000 }
  },
  lastSuccessfulRefresh: now
};

describe("usage rendering", () => {
  it("renders a transparent single-value tile with reset countdown", () => {
    const svg = decode(renderUsageTile({ ...DEFAULT_USAGE_SETTINGS, showResetTime: true }, ready, now));
    expect(svg).toContain('class="single-header">5H<');
    expect(svg).not.toContain("REMAINING");
    expect(svg).toContain(">72%<");
    expect(svg).toContain(">3h 0m<");
    expect(svg).toContain(".support { font-size: 16px;");
    expect(svg).toContain(".micro { font-size: 14px;");
    expect(svg).not.toContain("<rect");
  });

  it("renders a missing five-hour window as not applicable", () => {
    const week = ready.windows.week;
    if (!week) throw new Error("Weekly fixture is missing");
    const single = decode(renderUsageTile(DEFAULT_USAGE_SETTINGS, { ...ready, windows: { week } }, now));
    const svg = decode(
      renderUsageTile({ ...DEFAULT_USAGE_SETTINGS, mode: "double" }, { ...ready, windows: { week } }, now)
    );
    expect(single).toContain('class="single-header">5H<');
    expect(single).toContain(">N/A<");
    expect(single).not.toContain("REMAINING");
    expect(single).not.toContain("∞");
    expect(svg).toContain(">5H<");
    expect(svg).toContain(">WK<");
    expect(svg).not.toContain("∞");
    expect(svg).toContain(">28%<");
    expect(svg).toContain(">N/A<");
  });

  it("uses the five-hour hierarchy for a weekly single-value tile", () => {
    const svg = decode(renderUsageTile({ ...DEFAULT_USAGE_SETTINGS, window: "week" }, ready, now));
    expect(svg).toContain('class="single-header">WK<');
    expect(svg).toContain('class="single-value"');
    expect(svg).toContain(">28%<");
    expect(svg).not.toContain("WK · REMAINING");
  });

  it("keeps missing weekly data and source failures unavailable", () => {
    const fiveHour = ready.windows["five-hour"];
    if (!fiveHour) throw new Error("Five-hour fixture is missing");
    const partial = decode(
      renderUsageTile(
        { ...DEFAULT_USAGE_SETTINGS, mode: "double" },
        { ...ready, windows: { "five-hour": fiveHour } },
        now
      )
    );
    const failed = decode(
      renderUsageTile(DEFAULT_USAGE_SETTINGS, { status: "error", windows: {}, error: "offline" }, now)
    );
    expect(partial).toContain(">—<");
    expect(partial).toContain("UNAVAILABLE");
    expect(failed).toContain("UNAVAILABLE");
    expect(failed).not.toContain(">N/A<");
  });

  it("uses pace colors and never renders reset time", () => {
    const svg = decode(
      renderUsageTile({ ...DEFAULT_USAGE_SETTINGS, metric: "pace", showResetTime: true }, ready, now)
    );
    expect(svg).toContain(`fill="${THEME.green}"`);
    expect(svg).toContain(">12%<");
    expect(svg).toContain(">BEHIND<");
    expect(svg).not.toContain("3h 0m");
  });

  it("marks cached values stale and renders a full red error without a background", () => {
    const stale = decode(
      renderUsageTile(DEFAULT_USAGE_SETTINGS, { ...ready, status: "stale", error: "offline" }, now)
    );
    expect(stale).toContain(">STALE<");
    const error = decode(renderUsageError());
    expect(error).toContain(THEME.red);
    expect(error).toContain("UNAVAILABLE");
    expect(error).not.toContain("<rect");
  });
});

function decode(dataUri: string): string {
  return Buffer.from(dataUri.split(",")[1] ?? "", "base64").toString("utf8");
}

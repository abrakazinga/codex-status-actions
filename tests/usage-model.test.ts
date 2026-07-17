import { describe, expect, it } from "vitest";

import { THEME } from "../src/theme";
import {
  formatRemainingTime,
  normalizeRateLimits,
  normalizeUsageSettings,
  usageDisplayValue
} from "../src/usage/model";

describe("usage model", () => {
  it("normalizes settings to safe defaults", () => {
    expect(normalizeUsageSettings({ mode: "invalid", refreshSeconds: 12 })).toEqual({
      mode: "single",
      metric: "remaining",
      window: "five-hour",
      showResetTime: false,
      refreshSeconds: 300
    });
  });

  it("classifies windows by duration rather than primary position", () => {
    const windows = normalizeRateLimits([
      { usedPercent: 24.6, windowDurationMins: 10_080, resetsAt: 200 },
      { usedPercent: 61, windowDurationMins: 299, resetsAt: 100 }
    ]);
    expect(windows.week).toEqual({ usedPercent: 24.6, durationMinutes: 10_080, resetsAt: 200_000 });
    expect(windows["five-hour"]).toEqual({
      usedPercent: 61,
      durationMinutes: 299,
      resetsAt: 100_000
    });
  });

  it("ignores unknown durations and clamps percentages", () => {
    expect(
      normalizeRateLimits([
        { usedPercent: 140, windowDurationMins: 300, resetsAt: 100 },
        { usedPercent: 20, windowDurationMins: 1_440, resetsAt: 200 }
      ])
    ).toEqual({
      "five-hour": { usedPercent: 100, durationMinutes: 300, resetsAt: 100_000 }
    });
  });

  it("calculates remaining and used percentages", () => {
    const window = { usedPercent: 36.4, durationMinutes: 300, resetsAt: 10_000 };
    expect(usageDisplayValue("remaining", window).percent).toBe(64);
    expect(usageDisplayValue("used", window).percent).toBe(36);
  });

  it("renders pace as an unsigned, labeled difference", () => {
    const now = Date.UTC(2026, 0, 1, 2);
    const window = {
      usedPercent: 28,
      durationMinutes: 300,
      resetsAt: now + 3 * 60 * 60_000
    };
    expect(usageDisplayValue("pace", window, now)).toEqual({
      percent: 12,
      color: THEME.green,
      support: "Behind"
    });
    expect(usageDisplayValue("pace", { ...window, usedPercent: 52 }, now)).toEqual({
      percent: 12,
      color: THEME.orange,
      support: "Ahead"
    });
    expect(usageDisplayValue("pace", { ...window, usedPercent: 40 }, now)).toEqual({
      percent: 0,
      color: THEME.neutral
    });
  });

  it("formats reset countdowns compactly", () => {
    const now = Date.UTC(2026, 0, 1);
    expect(formatRemainingTime(now + (5 * 24 + 22) * 60 * 60_000, now)).toBe("5d 22h");
    expect(formatRemainingTime(now + (3 * 60 + 13) * 60_000, now)).toBe("3h 13m");
    expect(formatRemainingTime(now - 1, now)).toBe("0m");
  });
});

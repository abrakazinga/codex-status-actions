import type { JsonObject } from "@elgato/utils";

import { DEFAULT_USAGE_REFRESH_SECONDS } from "../constants";
import type { RateLimitsSnapshot } from "../codex/app-server-client";
import { THEME } from "../theme";

type UsageMode = "single" | "double";
export type UsageMetric = "remaining" | "used" | "pace";
export type UsageWindow = "five-hour" | "week";
export type RefreshSeconds = 60 | 300 | 900 | 1800;

export interface UsageActionSettings extends JsonObject {
  mode: UsageMode;
  metric: UsageMetric;
  window: UsageWindow;
  showResetTime: boolean;
  refreshSeconds: RefreshSeconds;
}

export interface UsageWindowSnapshot {
  usedPercent: number;
  durationMinutes: number;
  resetsAt: number;
}

export type UsageWindows = Partial<Record<UsageWindow, UsageWindowSnapshot>>;
type UsageFetchStatus = "loading" | "ready" | "stale" | "error";

export interface UsageSnapshot {
  status: UsageFetchStatus;
  windows: UsageWindows;
  lastSuccessfulRefresh?: number;
  error?: string;
}

export interface UsageDisplayValue {
  percent: number;
  color: string;
  support?: "Ahead" | "Behind";
}

export const DEFAULT_USAGE_SETTINGS: UsageActionSettings = {
  mode: "single",
  metric: "remaining",
  window: "five-hour",
  showResetTime: false,
  refreshSeconds: DEFAULT_USAGE_REFRESH_SECONDS
};

const MODES = new Set<UsageMode>(["single", "double"]);
const METRICS = new Set<UsageMetric>(["remaining", "used", "pace"]);
const WINDOWS = new Set<UsageWindow>(["five-hour", "week"]);
const REFRESH_INTERVALS = new Set<RefreshSeconds>([60, 300, 900, 1800]);
const WINDOW_TARGETS: ReadonlyArray<[UsageWindow, number]> = [
  ["five-hour", 300],
  ["week", 10_080]
];

export function normalizeUsageSettings(value: unknown): UsageActionSettings {
  if (!value || typeof value !== "object") return { ...DEFAULT_USAGE_SETTINGS };
  const settings = value as Partial<UsageActionSettings>;
  return {
    mode: settings.mode && MODES.has(settings.mode) ? settings.mode : DEFAULT_USAGE_SETTINGS.mode,
    metric: settings.metric && METRICS.has(settings.metric) ? settings.metric : DEFAULT_USAGE_SETTINGS.metric,
    window: settings.window && WINDOWS.has(settings.window) ? settings.window : DEFAULT_USAGE_SETTINGS.window,
    showResetTime:
      typeof settings.showResetTime === "boolean"
        ? settings.showResetTime
        : DEFAULT_USAGE_SETTINGS.showResetTime,
    refreshSeconds:
      typeof settings.refreshSeconds === "number" && REFRESH_INTERVALS.has(settings.refreshSeconds)
        ? settings.refreshSeconds
        : DEFAULT_USAGE_SETTINGS.refreshSeconds
  };
}

export function normalizeRateLimits(snapshot: RateLimitsSnapshot): UsageWindows {
  const result: UsageWindows = {};
  const matches = snapshot
    .flatMap((window) =>
      WINDOW_TARGETS.map(([id, target]) => ({
        id,
        window,
        distance: Math.abs(window.windowDurationMins - target)
      }))
    )
    .filter(({ distance }) => distance <= 5)
    .sort((left, right) => left.distance - right.distance);

  for (const { id, window } of matches) {
    if (result[id]) continue;
    result[id] = {
      usedPercent: clamp(window.usedPercent, 0, 100),
      durationMinutes: window.windowDurationMins,
      resetsAt: window.resetsAt * 1_000
    };
  }
  return result;
}

export function usageDisplayValue(
  metric: UsageMetric,
  window: UsageWindowSnapshot,
  now = Date.now()
): UsageDisplayValue {
  const used = clamp(window.usedPercent, 0, 100);
  if (metric === "remaining") {
    return { percent: Math.round(100 - used), color: THEME.neutral };
  }
  if (metric === "used") return { percent: Math.round(used), color: THEME.neutral };

  const duration = window.durationMinutes * 60_000;
  const start = window.resetsAt - duration;
  const expected = clamp((now - start) / duration, 0, 1) * 100;
  const difference = Math.round(used - expected);
  if (difference < 0) {
    return { percent: Math.abs(difference), color: THEME.green, support: "Behind" };
  }
  if (difference > 0) {
    return { percent: difference, color: THEME.orange, support: "Ahead" };
  }
  return { percent: 0, color: THEME.neutral };
}

export function formatRemainingTime(resetsAt: number, now = Date.now()): string {
  const totalMinutes = Math.max(0, Math.ceil((resetsAt - now) / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${String(days)}d ${String(hours)}h`;
  if (hours > 0) return `${String(hours)}h ${String(minutes)}m`;
  return `${String(minutes)}m`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

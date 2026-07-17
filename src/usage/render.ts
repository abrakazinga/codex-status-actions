import { THEME } from "../theme";
import {
  formatRemainingTime,
  usageDisplayValue,
  type UsageActionSettings,
  type UsageSnapshot,
  type UsageWindow,
  type UsageWindowSnapshot
} from "./model";

const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',sans-serif";

export function renderUsageTile(
  settings: UsageActionSettings,
  snapshot: UsageSnapshot,
  now = Date.now()
): string {
  if (settings.mode === "single") {
    const window = snapshot.windows[settings.window];
    if (!window) {
      if (settings.window === "five-hour" && snapshot.lastSuccessfulRefresh) {
        return toDataUri(svg(renderMissingFiveHour()));
      }
      return renderUsageError();
    }
    return toDataUri(svg(renderSingle(settings, snapshot, settings.window, window, now)));
  }
  if (!snapshot.windows["five-hour"] && !snapshot.windows.week) return renderUsageError();
  const content = renderDouble(settings, snapshot, now);
  return toDataUri(svg(content));
}

export function renderUsageError(): string {
  return toDataUri(
    svg(`<circle cx="72" cy="64" r="29" fill="${THEME.red}"/>
  <path d="M59 51 L85 77 M85 51 L59 77" fill="none" stroke="${THEME.glyph}" stroke-width="7" stroke-linecap="round"/>
  <text x="72" y="116" text-anchor="middle" class="micro" fill="${THEME.red}">UNAVAILABLE</text>`)
  );
}

function renderSingle(
  settings: UsageActionSettings,
  snapshot: UsageSnapshot,
  windowId: UsageWindow,
  window: UsageWindowSnapshot,
  now: number
): string {
  const value = usageDisplayValue(settings.metric, window, now);
  const support = supportingText(settings, snapshot, window.resetsAt, value.support, now);
  return renderSingleValue(windowLabel(windowId), `${String(value.percent)}%`, value.color, support);
}

function renderDouble(settings: UsageActionSettings, snapshot: UsageSnapshot, now: number): string {
  return `<text x="72" y="18" text-anchor="middle" class="header">${metricLabel(settings.metric)}</text>
  ${snapshot.status === "stale" ? `<text x="72" y="137" text-anchor="middle" class="micro" fill="${THEME.red}">STALE</text>` : ""}
  ${renderDoubleRow(settings, snapshot, "five-hour", 54, 72, now)}
  ${renderDoubleRow(settings, snapshot, "week", 105, 123, now)}`;
}

function renderDoubleRow(
  settings: UsageActionSettings,
  snapshot: UsageSnapshot,
  windowId: UsageWindow,
  valueY: number,
  supportY: number,
  now: number
): string {
  const window = snapshot.windows[windowId];
  if (!window) {
    if (windowId === "five-hour") {
      return `<text x="18" y="${String(valueY)}" class="row-label">${windowLabel(windowId)}</text>
  <text x="124" y="${String(valueY)}" text-anchor="end" class="row-value" fill="${THEME.neutral}">N/A</text>`;
    }
    return `<text x="18" y="${String(valueY)}" class="row-label">${windowLabel(windowId)}</text>
  <text x="124" y="${String(valueY)}" text-anchor="end" class="row-value" fill="${THEME.red}">—</text>
  <text x="124" y="${String(supportY)}" text-anchor="end" class="micro" fill="${THEME.red}">UNAVAILABLE</text>`;
  }
  const value = usageDisplayValue(settings.metric, window, now);
  const support = supportingText(settings, snapshot, window.resetsAt, value.support, now, false);
  return `<text x="18" y="${String(valueY)}" class="row-label">${windowLabel(windowId)}</text>
  <text x="124" y="${String(valueY)}" text-anchor="end" class="row-value" fill="${value.color}">${String(value.percent)}%</text>
  ${support ? `<text x="124" y="${String(supportY)}" text-anchor="end" class="micro" fill="${support.color}">${support.text}</text>` : ""}`;
}

function renderMissingFiveHour(): string {
  return renderSingleValue("5H", "N/A", THEME.neutral);
}

function renderSingleValue(
  label: string,
  value: string,
  color: string,
  support?: { text: string; color: string }
): string {
  return `<text x="72" y="48" text-anchor="middle" class="single-header">${label}</text>
  <text x="72" y="101" text-anchor="middle" class="single-value" fill="${color}">${value}</text>
  ${support ? `<text x="72" y="128" text-anchor="middle" class="support" fill="${support.color}">${support.text}</text>` : ""}`;
}

function supportingText(
  settings: UsageActionSettings,
  snapshot: UsageSnapshot,
  resetsAt: number,
  paceSupport: "Ahead" | "Behind" | undefined,
  now: number,
  showStale = true
): { text: string; color: string } | undefined {
  if (snapshot.status === "stale") {
    return showStale ? { text: "STALE", color: THEME.red } : undefined;
  }
  if (settings.metric === "pace") {
    if (!paceSupport) return undefined;
    return { text: paceSupport.toUpperCase(), color: paceSupport === "Ahead" ? THEME.orange : THEME.green };
  }
  if (!settings.showResetTime) return undefined;
  return { text: formatRemainingTime(resetsAt, now), color: THEME.neutral };
}

function svg(content: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144">
  <style>
    text { font-family: ${FONT}; font-weight: 700; }
    .header { fill: ${THEME.neutral}; font-size: 12px; letter-spacing: 1.1px; opacity: .72; }
    .single-header { fill: ${THEME.neutral}; font-size: 26px; letter-spacing: 1.4px; opacity: .72; }
    .single-value { font-size: 38px; letter-spacing: -1px; }
    .row-label { fill: ${THEME.neutral}; font-size: 13px; letter-spacing: .8px; opacity: .72; }
    .row-value { font-size: 33px; letter-spacing: -1px; }
    .support { font-size: 16px; letter-spacing: .5px; opacity: .94; }
    .micro { font-size: 14px; letter-spacing: .6px; opacity: .94; }
  </style>
  ${content}
</svg>`;
}

function windowLabel(window: UsageWindow): string {
  return window === "five-hour" ? "5H" : "WK";
}

function metricLabel(metric: UsageActionSettings["metric"]): string {
  return metric.toUpperCase();
}

function toDataUri(svgContent: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svgContent).toString("base64")}`;
}

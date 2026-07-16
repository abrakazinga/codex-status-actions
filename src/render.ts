import type { ThreadVisualState } from "./types";

const COLORS: Record<ThreadVisualState, string> = {
  idle: "#F1F1ED",
  unread: "#8FEA98",
  working: "#8DCEF5",
  "needs-user": "#FFCBB6",
  error: "#FF6B73"
};

const FOREGROUND = "#111315";

export function renderStatusTile(state: ThreadVisualState, title: string, rank: number): string {
  const [lineOne, lineTwo] = splitTitle(title);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144">
  <rect width="144" height="144" fill="${COLORS[state]}"/>
  <path d="M0 0h144v9H0z" fill="${FOREGROUND}" opacity=".09"/>
  ${iconFor(state)}
  <text x="13" y="105" font-family="Avenir Next Condensed, Helvetica Neue, sans-serif" font-size="14" font-weight="700" letter-spacing=".2" fill="${FOREGROUND}">${escapeXml(lineOne)}</text>
  ${lineTwo ? `<text x="13" y="123" font-family="Avenir Next Condensed, Helvetica Neue, sans-serif" font-size="14" font-weight="700" letter-spacing=".2" fill="${FOREGROUND}">${escapeXml(lineTwo)}</text>` : ""}
  <rect x="113" y="12" width="20" height="20" rx="10" fill="${FOREGROUND}"/>
  <text x="123" y="27" text-anchor="middle" font-family="Avenir Next Condensed, Helvetica Neue, sans-serif" font-size="13" font-weight="800" fill="${COLORS[state]}">${String(rank)}</text>
</svg>`;
}

export function renderEmptyTile(rank: number, message = "NO TASK"): string {
  return renderStatusTile("idle", message, rank);
}

export function renderIntegrationError(rank: number, message = "CODEX OFFLINE"): string {
  const svg = renderStatusTile("error", message, rank);
  return svg.replace(iconFor("error"), brokenLinkIcon());
}

function iconFor(state: ThreadVisualState): string {
  switch (state) {
    case "idle":
      return `<circle cx="36" cy="52" r="18" fill="none" stroke="${FOREGROUND}" stroke-width="7"/>`;
    case "unread":
      return `<path d="M16 34h44v32H31L17 77V34Z" fill="none" stroke="${FOREGROUND}" stroke-width="6" stroke-linejoin="round"/><circle cx="49" cy="45" r="6" fill="${FOREGROUND}"/>`;
    case "working":
      return `<circle cx="21" cy="52" r="7" fill="${FOREGROUND}"/><circle cx="41" cy="52" r="7" fill="${FOREGROUND}" opacity=".72"/><circle cx="61" cy="52" r="7" fill="${FOREGROUND}" opacity=".42"/>`;
    case "needs-user":
      return `<path d="M22 43c0-11 7-18 18-18 10 0 17 6 17 15 0 9-5 12-11 16-4 3-5 5-5 10" fill="none" stroke="${FOREGROUND}" stroke-width="7" stroke-linecap="round"/><circle cx="41" cy="78" r="4.5" fill="${FOREGROUND}"/>`;
    case "error":
      return `<path d="M39 22 67 73H11L39 22Z" fill="none" stroke="${FOREGROUND}" stroke-width="6" stroke-linejoin="round"/><path d="M39 39v17" stroke="${FOREGROUND}" stroke-width="6" stroke-linecap="round"/><circle cx="39" cy="64" r="3.5" fill="${FOREGROUND}"/>`;
  }
}

function brokenLinkIcon(): string {
  return `<path d="m20 61 14-14m10-10 14-14M28 28l-8 8c-7 7-7 17 0 24s17 7 24 0l5-5m1-18 5-5c7-7 17-7 24 0s7 17 0 24l-8 8" fill="none" stroke="${FOREGROUND}" stroke-width="6" stroke-linecap="round"/>`;
}

function splitTitle(input: string): [string, string?] {
  const clean = input.replace(/\s+/g, " ").trim().toUpperCase();
  if (clean.length <= 16) return [clean];

  const breakAt = clean.lastIndexOf(" ", 16);
  const lineOne = clean.slice(0, breakAt > 0 ? breakAt : 16);
  const remainder = clean.slice(breakAt > 0 ? breakAt + 1 : 16);
  return [lineOne, remainder.length > 16 ? `${remainder.slice(0, 15)}…` : remainder];
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;"
    };
    return entities[character] ?? character;
  });
}

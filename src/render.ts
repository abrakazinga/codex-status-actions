import type { ThreadVisualState } from "./types";

const COLORS: Record<ThreadVisualState, string> = {
  idle: "#F1F1ED",
  unread: "#8FEA98",
  working: "#8DCEF5",
  "needs-user": "#FFCBB6",
  error: "#FF6B73"
};

const FOREGROUND = "#111315";
const MAX_DEBUG_LENGTH = 22;

export function renderStatusTile(state: ThreadVisualState, title: string, rank: number): string {
  const debug = truncate(`${state} · ${title}`.replace(/\s+/g, " ").trim().toUpperCase());
  return toDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144">
  <rect width="144" height="144" fill="${COLORS[state]}"/>
  <text x="132" y="20" text-anchor="end" font-family="Helvetica Neue, sans-serif" font-size="14" font-weight="700" fill="${FOREGROUND}">${String(rank)}</text>
  <text x="8" y="134" font-family="Helvetica Neue, sans-serif" font-size="9" font-weight="600" fill="${FOREGROUND}">${escapeXml(debug)}</text>
</svg>`);
}

export function renderEmptyTile(rank: number, message = "NO TASK"): string {
  return renderStatusTile("idle", message, rank);
}

export function renderIntegrationError(rank: number, message = "CODEX OFFLINE"): string {
  return renderStatusTile("error", message, rank);
}

function toDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function truncate(value: string): string {
  return value.length > MAX_DEBUG_LENGTH ? `${value.slice(0, MAX_DEBUG_LENGTH - 1)}…` : value;
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

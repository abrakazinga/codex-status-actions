import type { ThreadVisualState } from "./types";

const STATUS_COLORS: Record<ThreadVisualState, string> = {
  idle: "#F1F1ED",
  unread: "#8FEA98",
  working: "#8DCEF5",
  "needs-user": "#FFCBB6",
  error: "#FF6B73"
};

export function renderStatusTile(state: ThreadVisualState): string {
  return toDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144">
  <circle cx="72" cy="72" r="34" fill="${STATUS_COLORS[state]}"/>
</svg>`);
}

export function renderEmptyTile(): string {
  return renderStatusTile("idle");
}

export function renderIntegrationError(): string {
  return renderStatusTile("error");
}

function toDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

import { WORKING_ANIMATION_FRAMES } from "./constants";
import { THEME } from "./theme";
import type { ThreadVisualState } from "./types";

const STATUS_COLORS: Record<ThreadVisualState, string> = {
  idle: THEME.neutral,
  unread: THEME.green,
  working: THEME.blue,
  "needs-user": THEME.orange,
  error: THEME.red
};

const CENTER = "72";
const RADIUS = "34";
const GLYPH_COLOR = THEME.glyph;
const WORKING_MIN_ARC = 6;
const WORKING_MAX_ARC = 94;

export function renderStatusTile(state: ThreadVisualState, workingFrame = 0): string {
  return toDataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144">
  ${renderGlyph(state, workingFrame)}
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

function renderGlyph(state: ThreadVisualState, workingFrame: number): string {
  const color = STATUS_COLORS[state];
  switch (state) {
    case "idle":
      return `<circle cx="${CENTER}" cy="${CENTER}" r="31" fill="none" stroke="${color}" stroke-width="7"/>`;
    case "unread":
      return `<circle cx="${CENTER}" cy="${CENTER}" r="${RADIUS}" fill="${color}"/>`;
    case "working": {
      return `<path d="${workingArcPath(workingFrame)}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"/>`;
    }
    case "needs-user":
      return `<path d="M72 38 L105.5 96 L38.5 96 Z" fill="${color}"/>`;
    case "error":
      return `<circle cx="${CENTER}" cy="${CENTER}" r="${RADIUS}" fill="${color}"/>
  <path d="M58 58 L86 86 M86 58 L58 86" fill="none" stroke="${GLYPH_COLOR}" stroke-width="7" stroke-linecap="round"/>`;
  }
}

function normalizeFrame(frame: number): number {
  return (
    ((Math.trunc(frame) % WORKING_ANIMATION_FRAMES) + WORKING_ANIMATION_FRAMES) % WORKING_ANIMATION_FRAMES
  );
}

function workingArc(frame: number): { length: number; start: number } {
  const phase = normalizeFrame(frame) / WORKING_ANIMATION_FRAMES;
  const isExpanding = phase < 0.5;
  const progress = easeInOutSine(isExpanding ? phase * 2 : (phase - 0.5) * 2);
  const range = WORKING_MAX_ARC - WORKING_MIN_ARC;
  return isExpanding
    ? { length: WORKING_MIN_ARC + range * progress, start: 0 }
    : { length: WORKING_MAX_ARC - range * progress, start: 100 * progress };
}

function workingArcPath(frame: number): string {
  const { length, start } = workingArc(frame);
  const from = pointOnWorkingCircle(start);
  const to = pointOnWorkingCircle(start + length);
  return `M${from.x} ${from.y} A31 31 0 ${length > 50 ? "1" : "0"} 1 ${to.x} ${to.y}`;
}

function pointOnWorkingCircle(progress: number): { x: string; y: string } {
  const angle = (progress / 100) * Math.PI * 2 - Math.PI / 2;
  return {
    x: formatNumber(Number(CENTER) + 31 * Math.cos(angle)),
    y: formatNumber(Number(CENTER) + 31 * Math.sin(angle))
  };
}

function easeInOutSine(value: number): number {
  return -(Math.cos(Math.PI * value) - 1) / 2;
}

function formatNumber(value: number): string {
  return String(Number(value.toFixed(3)));
}

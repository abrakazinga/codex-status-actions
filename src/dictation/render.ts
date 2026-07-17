import { DICTATION_PULSE_FRAMES } from "../constants";
import { renderStatusTile } from "../render";
import { THEME } from "../theme";
import type { DictationState } from "../types";
import type { DictationSnapshot } from "./controller";

export type DictationVisualState = DictationState | "loading" | "setup-required";

export function dictationVisualState(
  snapshot: Pick<DictationSnapshot, "settingsReady" | "shortcut" | "state">
): DictationVisualState {
  if (!snapshot.settingsReady) return "loading";
  return snapshot.shortcut ? snapshot.state : "setup-required";
}

export function renderDictationTile(state: DictationVisualState, frame = 0): string {
  if (state === "loading") return renderStatusTile("working", frame);
  if (state === "setup-required") return renderStatusTile("needs-user");
  if (state === "error") return renderStatusTile("error");

  const glyph = state === "idle" ? microphone(THEME.neutral) : activeMicrophone(frame);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144">\n  ${glyph}\n</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function microphone(color: string, attributes = ""): string {
  return `<g fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"${attributes}>
    <rect x="58" y="37" width="28" height="49" rx="14"/>
    <path d="M48 69 V73 A24 24 0 0 0 96 73 V69 M72 97 V106 M58 106 H86"/>
  </g>`;
}

function activeMicrophone(frame: number): string {
  const normalized =
    ((Math.trunc(frame) % DICTATION_PULSE_FRAMES) + DICTATION_PULSE_FRAMES) % DICTATION_PULSE_FRAMES;
  const phase = normalized / DICTATION_PULSE_FRAMES;
  const pulse = (1 - Math.cos(phase * Math.PI * 2)) / 2;
  const scale = (0.96 + pulse * 0.04).toFixed(3);
  const opacity = (0.86 + pulse * 0.14).toFixed(3);
  return microphone(
    THEME.blue,
    ` opacity="${opacity}" transform="translate(72 72) scale(${scale}) translate(-72 -72)"`
  );
}

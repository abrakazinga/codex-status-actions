import type { JsonObject } from "@elgato/utils";

export interface ThemePalette extends JsonObject {
  neutral: string;
  green: string;
  blue: string;
  orange: string;
  red: string;
  glyph: string;
}

export const THEME: ThemePalette = {
  neutral: "#F1F1ED",
  green: "#8FEA98",
  blue: "#8DCEF5",
  orange: "#FF8A3D",
  red: "#FF6B73",
  glyph: "#111315"
};

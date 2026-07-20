import { spawnSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const output = resolve(root, "output");
const source = pathToFileURL(resolve(root, "index.html")).href;
const browserCandidates = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
];
const browser = browserCandidates.find((candidate) => {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
});

if (!browser) throw new Error("Install Google Chrome or Brave Browser to render Marketplace assets.");

mkdirSync(output, { recursive: true });

const assets = [
  ["app-icon", "icon", 288, 288],
  ["thumbnail", "thumbnail", 1920, 960],
  ["readme-hero", "readmeHero", 1920, 960],
  ["gallery-01-status", "status", 1920, 960],
  ["gallery-02-usage", "usage", 1920, 960],
  ["gallery-03-dictation", "dictation", 1920, 960]
];

for (const [filename, slide, width, height] of assets) {
  const target = resolve(output, `${filename}.png`);
  const result = spawnSync(
    browser,
    [
      "--headless=new",
      "--hide-scrollbars",
      "--disable-gpu",
      "--force-device-scale-factor=1",
      `--window-size=${String(width)},${String(height)}`,
      `--screenshot=${target}`,
      `${source}?slide=${slide}`
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || `Rendering ${filename} failed with exit code ${String(result.status)}.`);
  }
  console.log(`Rendered ${filename}.png (${String(width)} × ${String(height)})`);
}

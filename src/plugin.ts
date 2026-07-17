import streamDeck from "@elgato/streamdeck";

import { StatusTileAction } from "./actions/status-tile-action";
import { UsageTileAction } from "./actions/usage-tile-action";
import { CodexRuntime } from "./codex/runtime";
import { createTaskNavigator } from "./navigation";
import { GlobalSettingsStore } from "./settings";
import { StatusCoordinator } from "./status/coordinator";
import { UsageProvider } from "./usage/provider";
import { resolveCodexHome } from "./util";

streamDeck.logger.setLevel("info");

const settingsStore = new GlobalSettingsStore({}, (settings) =>
  streamDeck.settings.setGlobalSettings(settings)
);
const runtime = new CodexRuntime(() => resolveCodexHome(settingsStore.current));
const coordinator = new StatusCoordinator(settingsStore, runtime, (message) =>
  streamDeck.logger.debug(message)
);
const usageProvider = new UsageProvider(runtime, (message) => streamDeck.logger.debug(message));
const statusAction = new StatusTileAction(createTaskNavigator());
const usageAction = new UsageTileAction(usageProvider, {
  get: () => settingsStore.current.codexHome,
  set: (path) => coordinator.setCodexHome(path)
});
statusAction.attach(coordinator);
streamDeck.actions.registerAction(statusAction);
streamDeck.actions.registerAction(usageAction);

await streamDeck.connect();
settingsStore.replace(await streamDeck.settings.getGlobalSettings());
await coordinator.start();
usageProvider.start();

async function shutdown(): Promise<void> {
  usageAction.dispose();
  usageProvider.stop();
  await coordinator.stop();
  await runtime.stop();
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());

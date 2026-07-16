import streamDeck from "@elgato/streamdeck";

import { StatusTileAction } from "./actions/status-tile-action";
import { StatusCoordinator } from "./status/coordinator";

streamDeck.logger.setLevel("info");

const action = new StatusTileAction();
streamDeck.actions.registerAction(action);

await streamDeck.connect();

const storedSettings = await streamDeck.settings.getGlobalSettings();
const coordinator = new StatusCoordinator(
  storedSettings,
  async (settings) => streamDeck.settings.setGlobalSettings(settings),
  (message) => streamDeck.logger.debug(message)
);
action.attach(coordinator);

await coordinator.start();

async function shutdown(): Promise<void> {
  await coordinator.stop();
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());

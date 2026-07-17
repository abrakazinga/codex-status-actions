import {
  action,
  default as streamDeck,
  type DidReceiveSettingsEvent,
  type KeyAction,
  type PropertyInspectorDidAppearEvent,
  type PropertyInspectorDidDisappearEvent,
  type SendToPluginEvent,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";

import { PLUGIN_VERSION, USAGE_ACTION_UUID } from "../constants";
import { renderStatusTile } from "../render";
import { THEME } from "../theme";
import { toErrorMessage } from "../util";
import { WorkingAnimation } from "../working-animation";
import { normalizeUsageSettings, type UsageActionSettings } from "../usage/model";
import { UsageProvider } from "../usage/provider";
import { renderUsageError, renderUsageTile } from "../usage/render";

interface CodexHomeController {
  get(): string | undefined;
  set(path?: string): Promise<void>;
}

@action({ UUID: USAGE_ACTION_UUID })
export class UsageTileAction extends SingletonAction<UsageActionSettings> {
  private readonly visibleActions = new Map<string, KeyAction<UsageActionSettings>>();
  private readonly settings = new Map<string, UsageActionSettings>();
  private readonly renderedImages = new Map<string, string>();
  private readonly workingAnimation = new WorkingAnimation(() => this.requestRender());
  private readonly unsubscribe: () => void;
  private inspectorContextId: string | undefined;
  private renderRequested = false;
  private renderInProgress = false;

  constructor(
    private readonly provider: UsageProvider,
    private readonly codexHome: CodexHomeController
  ) {
    super();
    this.unsubscribe = provider.subscribe(() => {
      this.requestRender();
      void this.sendInspectorSnapshot();
    });
  }

  override onWillAppear(event: WillAppearEvent<UsageActionSettings>): void {
    if (!event.action.isKey()) return;
    const settings = normalizeUsageSettings(event.payload.settings);
    this.visibleActions.set(event.action.id, event.action);
    this.settings.set(event.action.id, settings);
    this.register(event.action.id, settings);
    this.requestRender();
  }

  override onWillDisappear(event: WillDisappearEvent<UsageActionSettings>): void {
    this.visibleActions.delete(event.action.id);
    this.settings.delete(event.action.id);
    this.renderedImages.delete(event.action.id);
    this.provider.unregister(event.action.id);
    this.requestRender();
  }

  override onDidReceiveSettings(event: DidReceiveSettingsEvent<UsageActionSettings>): void {
    if (!this.visibleActions.has(event.action.id)) return;
    const settings = normalizeUsageSettings(event.payload.settings);
    this.settings.set(event.action.id, settings);
    this.register(event.action.id, settings);
    this.requestRender();
    void this.sendInspectorSnapshot();
  }

  override onPropertyInspectorDidAppear(event: PropertyInspectorDidAppearEvent<UsageActionSettings>): void {
    this.inspectorContextId = event.action.id;
    void this.sendInspectorSnapshot();
  }

  override onPropertyInspectorDidDisappear(
    event: PropertyInspectorDidDisappearEvent<UsageActionSettings>
  ): void {
    if (this.inspectorContextId === event.action.id) this.inspectorContextId = undefined;
  }

  override async onSendToPlugin(event: SendToPluginEvent<JsonValue, UsageActionSettings>): Promise<void> {
    const command = parseCommand(event.payload);
    if (!command) {
      await this.send({ type: "error", message: "Unknown property inspector command" });
      return;
    }

    try {
      switch (command.type) {
        case "snapshot":
          break;
        case "refresh": {
          const ok = await this.provider.refresh();
          await this.send({ type: "usage-refresh-result", ok });
          break;
        }
        case "set-codex-home":
          await this.codexHome.set(command.path);
          await this.provider.refresh();
          break;
        case "copy-diagnostics":
          await this.send({ type: "diagnostics", text: this.provider.diagnostics() });
          return;
      }
      await this.sendInspectorSnapshot();
    } catch (error) {
      await this.send({ type: "error", message: toErrorMessage(error) });
    }
  }

  dispose(): void {
    this.unsubscribe();
  }

  private register(contextId: string, settings: UsageActionSettings): void {
    this.provider.register(contextId, {
      refreshSeconds: settings.refreshSeconds,
      clockSensitive: settings.metric === "pace" || settings.showResetTime
    });
  }

  private async renderAll(): Promise<void> {
    const snapshot = this.provider.snapshot();
    const loading = snapshot.status === "loading";
    this.workingAnimation.setActive(loading && this.visibleActions.size > 0);
    const results = await Promise.allSettled(
      [...this.visibleActions].map(async ([contextId, key]) => {
        const settings = this.settings.get(contextId) ?? normalizeUsageSettings({});
        const image = loading
          ? renderStatusTile("working", this.workingAnimation.frame)
          : snapshot.status === "error"
            ? renderUsageError()
            : renderUsageTile(settings, snapshot);
        if (this.renderedImages.get(contextId) === image) return;
        await key.setImage(image);
        if (this.visibleActions.has(contextId)) this.renderedImages.set(contextId, image);
      })
    );
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    if (failures.length > 0) throw new Error(`Failed to render ${String(failures.length)} usage tile(s)`);
  }

  private requestRender(): void {
    this.renderRequested = true;
    if (this.renderInProgress) return;
    this.renderInProgress = true;
    void this.drainRenders();
  }

  private async drainRenders(): Promise<void> {
    try {
      while (this.renderRequested) {
        this.renderRequested = false;
        await this.renderAll();
      }
    } catch (error) {
      streamDeck.logger.error(`Usage tile rendering failed: ${toErrorMessage(error)}`);
    } finally {
      this.renderInProgress = false;
      if (this.renderRequested) this.requestRender();
    }
  }

  private async sendInspectorSnapshot(): Promise<void> {
    const contextId = this.inspectorContextId;
    if (!contextId || !this.visibleActions.has(contextId)) return;
    await this.send({
      type: "usage-snapshot",
      settings: this.settings.get(contextId) ?? normalizeUsageSettings({}),
      codexHome: this.codexHome.get() ?? "",
      health: this.provider.healthSnapshot(),
      theme: THEME,
      version: PLUGIN_VERSION
    });
  }

  private send(payload: JsonValue): Promise<void> {
    return streamDeck.ui.sendToPropertyInspector(payload);
  }
}

type UsageCommand =
  | { type: "snapshot" }
  | { type: "refresh" }
  | { type: "set-codex-home"; path?: string }
  | { type: "copy-diagnostics" };

function parseCommand(payload: unknown): UsageCommand | undefined {
  if (!payload || typeof payload !== "object" || !("type" in payload)) return undefined;
  if (payload.type === "snapshot" || payload.type === "refresh" || payload.type === "copy-diagnostics") {
    return { type: payload.type };
  }
  if (payload.type !== "set-codex-home") return undefined;
  const path = (payload as { path?: unknown }).path;
  if (typeof path !== "string") return undefined;
  return path ? { type: payload.type, path } : { type: payload.type };
}

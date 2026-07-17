import {
  action,
  default as streamDeck,
  type DidReceiveSettingsEvent,
  type KeyAction,
  type KeyDownEvent,
  type KeyUpEvent,
  type PropertyInspectorDidAppearEvent,
  type PropertyInspectorDidDisappearEvent,
  type SendToPluginEvent,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";

import {
  DICTATION_ACTION_UUID,
  DICTATION_PULSE_FRAMES,
  DICTATION_PULSE_MS,
  PLUGIN_VERSION
} from "../constants";
import { DictationController } from "../dictation/controller";
import { normalizeDictationSettings } from "../dictation/model";
import { dictationVisualState, renderDictationTile } from "../dictation/render";
import { normalizeShortcut } from "../dictation/shortcut";
import { LoopingAnimation } from "../looping-animation";
import { RenderLoop } from "../render-loop";
import { THEME } from "../theme";
import type { DictationActionSettings } from "../types";
import { toErrorMessage } from "../util";
import { WorkingAnimation } from "../working-animation";

@action({ UUID: DICTATION_ACTION_UUID })
export class DictationTileAction extends SingletonAction<DictationActionSettings> {
  private readonly visibleActions = new Map<string, KeyAction<DictationActionSettings>>();
  private readonly settings = new Map<string, DictationActionSettings>();
  private readonly renderedImages = new Map<string, string>();
  private readonly heldActions = new Set<string>();
  private readonly renderLoop = new RenderLoop(
    () => this.renderAll(),
    (error) => streamDeck.logger.error(`Dictation tile rendering failed: ${toErrorMessage(error)}`)
  );
  private readonly workingAnimation = new WorkingAnimation(() => this.renderLoop.request());
  private readonly pulseAnimation = new LoopingAnimation(
    () => this.renderLoop.request(),
    DICTATION_PULSE_FRAMES,
    DICTATION_PULSE_MS
  );
  private readonly unsubscribe: () => void;
  private inspectorContextId: string | undefined;

  constructor(private readonly controller: DictationController) {
    super();
    this.unsubscribe = controller.subscribe(() => {
      this.renderLoop.request();
      void this.sendInspectorSnapshot();
    });
  }

  override onWillAppear(event: WillAppearEvent<DictationActionSettings>): void {
    if (!event.action.isKey()) return;
    this.visibleActions.set(event.action.id, event.action);
    this.settings.set(event.action.id, normalizeDictationSettings(event.payload.settings));
    this.renderLoop.request();
  }

  override onWillDisappear(event: WillDisappearEvent<DictationActionSettings>): void {
    const contextId = event.action.id;
    this.visibleActions.delete(contextId);
    this.settings.delete(contextId);
    this.renderedImages.delete(contextId);
    this.heldActions.delete(contextId);
    void this.controller.releaseOwner(contextId);
    this.renderLoop.request();
  }

  override onDidReceiveSettings(event: DidReceiveSettingsEvent<DictationActionSettings>): void {
    if (!this.visibleActions.has(event.action.id)) return;
    this.settings.set(event.action.id, normalizeDictationSettings(event.payload.settings));
    void this.sendInspectorSnapshot();
  }

  override async onKeyDown(event: KeyDownEvent<DictationActionSettings>): Promise<void> {
    const contextId = event.action.id;
    if (this.settings.get(contextId)?.mode === "toggle") return;
    this.heldActions.add(contextId);
    try {
      await this.controller.start(contextId);
    } catch {
      await event.action.showAlert();
    }
  }

  override async onKeyUp(event: KeyUpEvent<DictationActionSettings>): Promise<void> {
    const contextId = event.action.id;
    try {
      if (this.settings.get(contextId)?.mode === "toggle") {
        await this.controller.toggle(contextId);
      } else if (this.heldActions.delete(contextId)) {
        await this.controller.stop(contextId);
      }
    } catch {
      await event.action.showAlert();
    }
  }

  override onPropertyInspectorDidAppear(
    event: PropertyInspectorDidAppearEvent<DictationActionSettings>
  ): void {
    this.inspectorContextId = event.action.id;
    void this.sendInspectorSnapshot();
  }

  override onPropertyInspectorDidDisappear(
    event: PropertyInspectorDidDisappearEvent<DictationActionSettings>
  ): void {
    if (this.inspectorContextId === event.action.id) this.inspectorContextId = undefined;
  }

  override async onSendToPlugin(event: SendToPluginEvent<JsonValue, DictationActionSettings>): Promise<void> {
    const command = parseCommand(event.payload);
    if (!command) {
      await this.send({ type: "error", message: "Unknown property inspector command" });
      return;
    }
    try {
      switch (command.type) {
        case "snapshot":
          break;
        case "set-shortcut":
          await this.controller.setShortcut(command.binding);
          break;
        case "open-privacy-settings":
          await this.controller.openPrivacySettings();
          break;
        case "copy-diagnostics":
          await this.send({ type: "diagnostics", text: this.controller.diagnostics() });
          return;
      }
      await this.sendInspectorSnapshot();
    } catch (error) {
      await this.send({ type: "error", message: toErrorMessage(error) });
      await this.sendInspectorSnapshot();
    }
  }

  dispose(): void {
    this.unsubscribe();
    this.workingAnimation.setActive(false);
    this.pulseAnimation.setActive(false);
  }

  private async renderAll(): Promise<void> {
    const snapshot = this.controller.snapshot();
    const visualState = dictationVisualState(snapshot);
    this.workingAnimation.setActive(visualState === "loading" && this.visibleActions.size > 0);
    const microphoneActive = visualState === "activating" || visualState === "recording";
    this.pulseAnimation.setActive(microphoneActive && this.visibleActions.size > 0);
    const frame = microphoneActive ? this.pulseAnimation.frame : this.workingAnimation.frame;
    const image = renderDictationTile(visualState, frame);
    const results = await Promise.allSettled(
      [...this.visibleActions].map(async ([contextId, key]) => {
        if (this.renderedImages.get(contextId) === image) return;
        await key.setImage(image);
        if (this.visibleActions.has(contextId)) this.renderedImages.set(contextId, image);
      })
    );
    const failed = results.filter((result) => result.status === "rejected").length;
    if (failed > 0) throw new Error(`Failed to render ${String(failed)} dictation tile(s)`);
  }

  private async sendInspectorSnapshot(): Promise<void> {
    const contextId = this.inspectorContextId;
    if (!contextId || !this.visibleActions.has(contextId)) return;
    await this.send({
      type: "dictation-snapshot",
      settings: this.settings.get(contextId) ?? normalizeDictationSettings({}),
      health: this.controller.snapshot(),
      theme: THEME,
      version: PLUGIN_VERSION
    });
  }

  private send(payload: JsonValue): Promise<void> {
    return streamDeck.ui.sendToPropertyInspector(payload);
  }
}

type DictationCommand =
  | { type: "snapshot" }
  | { type: "set-shortcut"; binding?: ReturnType<typeof normalizeShortcut> }
  | { type: "open-privacy-settings" }
  | { type: "copy-diagnostics" };

function parseCommand(payload: unknown): DictationCommand | undefined {
  if (!payload || typeof payload !== "object" || !("type" in payload)) return undefined;
  if (
    payload.type === "snapshot" ||
    payload.type === "open-privacy-settings" ||
    payload.type === "copy-diagnostics"
  ) {
    return { type: payload.type };
  }
  if (payload.type !== "set-shortcut") return undefined;
  const value = (payload as { binding?: unknown }).binding;
  if (value === null || value === undefined) return { type: payload.type };
  const binding = normalizeShortcut(value);
  return binding ? { type: payload.type, binding } : undefined;
}

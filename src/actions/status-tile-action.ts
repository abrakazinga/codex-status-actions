import {
  action,
  default as streamDeck,
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

import { assignInOrder, type TilePosition } from "../assignment";
import { DOUBLE_TAP_MS, STATUS_ACTION_UUID } from "../constants";
import { renderEmptyTile, renderIntegrationError, renderStatusTile } from "../render";
import { RenderLoop } from "../render-loop";
import type { StatusCoordinator } from "../status/coordinator";
import { isDoubleTap, type Tap } from "../tap";
import type { PropertyInspectorCommand, TaskNavigator, ThreadStatusSnapshot } from "../types";
import { toErrorMessage } from "../util";
import { WorkingAnimation } from "../working-animation";

type ActionSettings = Record<string, never>;

interface PressCapture {
  threadId?: string;
}

@action({ UUID: STATUS_ACTION_UUID })
export class StatusTileAction extends SingletonAction<ActionSettings> {
  private coordinator?: StatusCoordinator;
  private unsubscribe: (() => void) | undefined;
  private readonly visibleActions = new Map<string, KeyAction<ActionSettings>>();
  private readonly positions = new Map<string, TilePosition>();
  private readonly renderedThreads = new Map<string, ThreadStatusSnapshot>();
  private readonly renderedImages = new Map<string, string>();
  private readonly presses = new Map<string, PressCapture>();
  private readonly previousTaps = new Map<string, Tap>();
  private readonly renderLoop = new RenderLoop(
    () => this.renderAll(),
    (error) => streamDeck.logger.error(`Tile rendering failed: ${toErrorMessage(error)}`)
  );
  private readonly workingAnimation = new WorkingAnimation(() => this.renderLoop.request());
  private inspectorContextId: string | undefined;

  constructor(private readonly navigator: TaskNavigator) {
    super();
  }

  attach(coordinator: StatusCoordinator): void {
    this.unsubscribe?.();
    this.coordinator = coordinator;
    this.unsubscribe = coordinator.subscribe(() => {
      this.renderLoop.request();
      void this.sendInspectorSnapshot();
    });
    this.renderLoop.request();
  }

  override onWillAppear(event: WillAppearEvent<ActionSettings>): void {
    if (!event.action.isKey()) return;
    const coordinates = event.action.coordinates;
    if (!coordinates) return;
    this.visibleActions.set(event.action.id, event.action);
    this.positions.set(event.action.id, {
      contextId: event.action.id,
      deviceId: event.action.device.id,
      row: coordinates.row,
      column: coordinates.column
    });
    this.renderLoop.request();
  }

  override onWillDisappear(event: WillDisappearEvent<ActionSettings>): void {
    this.visibleActions.delete(event.action.id);
    this.positions.delete(event.action.id);
    this.renderedThreads.delete(event.action.id);
    this.renderedImages.delete(event.action.id);
    this.presses.delete(event.action.id);
    this.previousTaps.delete(event.action.id);
    this.renderLoop.request();
  }

  override onKeyDown(event: KeyDownEvent<ActionSettings>): void {
    const thread = this.renderedThreads.get(event.action.id);
    this.presses.set(event.action.id, {
      ...(thread ? { threadId: thread.thread.id } : {})
    });
  }

  override async onKeyUp(event: KeyUpEvent<ActionSettings>): Promise<void> {
    const contextId = event.action.id;
    const capture = this.presses.get(contextId);
    this.presses.delete(contextId);
    const threadId = capture?.threadId;
    if (!threadId) {
      this.previousTaps.delete(contextId);
      await event.action.showAlert();
      return;
    }

    const tap = { at: Date.now(), threadId };
    const previous = this.previousTaps.get(contextId);

    try {
      const isSecondTap = isDoubleTap(previous, tap, DOUBLE_TAP_MS);
      if (isSecondTap) {
        this.previousTaps.delete(contextId);
      } else {
        this.previousTaps.set(contextId, tap);
      }
      await this.navigator.selectTask(threadId, isSecondTap ? "foreground" : "background");
      this.coordinator?.acknowledge(threadId);
      this.coordinator?.markNavigation(true);
    } catch (error) {
      if (this.previousTaps.get(contextId) === tap) this.previousTaps.delete(contextId);
      this.coordinator?.markNavigation(false, toErrorMessage(error));
      await event.action.showAlert();
    }
  }

  override onPropertyInspectorDidAppear(event: PropertyInspectorDidAppearEvent<ActionSettings>): void {
    this.inspectorContextId = event.action.id;
    void this.sendInspectorSnapshot();
  }

  override onPropertyInspectorDidDisappear(event: PropertyInspectorDidDisappearEvent<ActionSettings>): void {
    if (this.inspectorContextId === event.action.id) this.inspectorContextId = undefined;
  }

  override async onSendToPlugin(event: SendToPluginEvent<JsonValue, ActionSettings>): Promise<void> {
    const coordinator = this.coordinator;
    if (!coordinator) return;
    const command = parseCommand(event.payload);
    if (!command) {
      await streamDeck.ui.sendToPropertyInspector({
        type: "error",
        message: "Unknown property inspector command"
      });
      return;
    }

    try {
      switch (command.type) {
        case "refresh":
          break;
        case "trust-hooks":
          await coordinator.trustHooks();
          break;
        case "reinstall-hooks":
          await coordinator.reinstallHooks();
          break;
        case "set-enhanced-status":
          await coordinator.setEnhancedStatus(command.enabled);
          break;
        case "set-codex-home":
          await coordinator.setCodexHome(command.path);
          break;
        case "copy-diagnostics":
          await streamDeck.ui.sendToPropertyInspector({
            type: "diagnostics",
            text: coordinator.diagnostics()
          });
          return;
      }
      await streamDeck.ui.sendToPropertyInspector(coordinator.propertySnapshot());
    } catch (error) {
      await streamDeck.ui.sendToPropertyInspector({ type: "error", message: toErrorMessage(error) });
    }
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.workingAnimation.setActive(false);
  }

  private async renderAll(): Promise<void> {
    const coordinator = this.coordinator;
    const assignments = assignInOrder(this.positions.values(), coordinator?.snapshot().values() ?? []);
    const hasWorkingTile =
      !coordinator?.unavailable &&
      [...assignments.values()].some(({ snapshot }) => snapshot?.state === "working");
    this.workingAnimation.setActive(hasWorkingTile);

    const results = await Promise.allSettled(
      [...this.visibleActions].map(async ([contextId, key]) => {
        const { snapshot } = assignments.get(contextId) ?? {};
        let renderedSnapshot: ThreadStatusSnapshot | undefined;
        let image: string;
        if (coordinator?.unavailable) {
          image = renderIntegrationError();
        } else if (snapshot) {
          renderedSnapshot = snapshot;
          image = renderStatusTile(snapshot.state, this.workingAnimation.frame);
        } else {
          image = renderEmptyTile();
        }
        if (this.renderedImages.get(contextId) === image) {
          this.setRenderedThread(contextId, renderedSnapshot);
          return;
        }
        await key.setImage(image);
        if (!this.visibleActions.has(contextId)) return;
        this.renderedImages.set(contextId, image);
        this.setRenderedThread(contextId, renderedSnapshot);
      })
    );
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    if (failures.length > 0) {
      throw new Error(`Failed to render ${String(failures.length)} tile${failures.length === 1 ? "" : "s"}`);
    }
  }

  private setRenderedThread(contextId: string, snapshot?: ThreadStatusSnapshot): void {
    if (snapshot) this.renderedThreads.set(contextId, snapshot);
    else this.renderedThreads.delete(contextId);
  }

  private async sendInspectorSnapshot(): Promise<void> {
    const contextId = this.inspectorContextId;
    const coordinator = this.coordinator;
    if (!contextId || !coordinator) return;
    if (!this.visibleActions.has(contextId)) return;
    try {
      await streamDeck.ui.sendToPropertyInspector(coordinator.propertySnapshot());
    } catch (error) {
      streamDeck.logger.debug(`Property inspector update skipped: ${toErrorMessage(error)}`);
    }
  }
}

function parseCommand(payload: unknown): PropertyInspectorCommand | undefined {
  if (!payload || typeof payload !== "object" || !("type" in payload) || typeof payload.type !== "string") {
    return undefined;
  }
  switch (payload.type) {
    case "refresh":
    case "trust-hooks":
    case "reinstall-hooks":
    case "copy-diagnostics":
      return { type: payload.type };
    case "set-enhanced-status": {
      const enabled = (payload as { enabled?: unknown }).enabled;
      return typeof enabled === "boolean" ? { type: payload.type, enabled } : undefined;
    }
    case "set-codex-home": {
      const value = (payload as { path?: unknown }).path;
      if (typeof value !== "string") return undefined;
      return value ? { type: payload.type, path: value } : { type: payload.type };
    }
    default:
      return undefined;
  }
}

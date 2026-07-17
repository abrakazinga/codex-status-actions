import { z } from "zod";

import { DEFAULT_ENHANCED_STATUS_ENABLED } from "./constants";
import type { GlobalSettings } from "./types";

type PersistSettings = (settings: GlobalSettings) => Promise<void>;

const persistedThreadStateSchema = z.object({
  lastCompletionId: z.string().optional(),
  lastAcknowledgedCompletionId: z.string().optional(),
  needsUser: z.boolean().optional(),
  error: z.boolean().optional(),
  changedAt: z.number().nonnegative().optional()
});

const rolloutCursorSchema = z
  .union([
    z.number().int().nonnegative(),
    z.object({
      offset: z.number().int().nonnegative(),
      identity: z
        .string()
        .regex(/^\d+:\d+$/)
        .optional()
    })
  ])
  .transform((cursor) => (typeof cursor === "number" ? { offset: cursor } : cursor));

const settingsSchema = z.object({
  enhancedStatusEnabled: z.boolean().optional(),
  codexHome: z.string().optional(),
  initialized: z.boolean().optional(),
  threadOrder: z.array(z.string()).optional(),
  threadStates: z.record(z.string(), persistedThreadStateSchema).optional(),
  rolloutOffsets: z.record(z.string(), rolloutCursorSchema).optional()
});

export class GlobalSettingsStore {
  private settings: GlobalSettings;
  private persistChain = Promise.resolve();

  constructor(
    initialSettings: unknown,
    private readonly persistSettings: PersistSettings
  ) {
    this.settings = normalizeGlobalSettings(initialSettings);
  }

  get current(): GlobalSettings {
    return this.settings;
  }

  update(update: (settings: GlobalSettings) => GlobalSettings): GlobalSettings {
    this.settings = update(this.settings);
    return this.settings;
  }

  replace(settings: unknown): GlobalSettings {
    this.settings = normalizeGlobalSettings(settings);
    return this.settings;
  }

  persist(): Promise<void> {
    const snapshot = this.settings;
    const operation = this.persistChain.then(() => this.persistSettings(snapshot));
    this.persistChain = operation.catch(() => undefined);
    return operation;
  }
}

function normalizeGlobalSettings(settings: unknown): GlobalSettings {
  const result = settingsSchema.safeParse(settings);
  const value = result.success ? result.data : {};
  const threadStates = Object.fromEntries(
    Object.entries(value.threadStates ?? {}).map(([threadId, state]) => [
      threadId,
      {
        ...(state.lastCompletionId ? { lastCompletionId: state.lastCompletionId } : {}),
        ...(state.lastAcknowledgedCompletionId
          ? { lastAcknowledgedCompletionId: state.lastAcknowledgedCompletionId }
          : {}),
        ...(state.needsUser === undefined ? {} : { needsUser: state.needsUser }),
        ...(state.error === undefined ? {} : { error: state.error }),
        ...(state.changedAt === undefined ? {} : { changedAt: state.changedAt })
      }
    ])
  );
  const rolloutOffsets = Object.fromEntries(
    Object.entries(value.rolloutOffsets ?? {}).map(([filePath, cursor]) => [
      filePath,
      { offset: cursor.offset, ...(cursor.identity ? { identity: cursor.identity } : {}) }
    ])
  );
  return {
    enhancedStatusEnabled: value.enhancedStatusEnabled ?? DEFAULT_ENHANCED_STATUS_ENABLED,
    initialized: value.initialized ?? false,
    threadOrder: [...new Set(value.threadOrder ?? [])],
    threadStates,
    rolloutOffsets,
    ...(value.codexHome?.trim() ? { codexHome: value.codexHome.trim() } : {})
  };
}

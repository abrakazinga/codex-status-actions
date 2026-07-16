const PLUGIN_UUID = "com.abrakazinga.codex-status-actions";
export const ACTION_UUID = `${PLUGIN_UUID}.status`;
export const PLUGIN_VERSION = "0.1.0";

export const DEFAULT_SETTINGS = {
  assignmentMode: "recent",
  enhancedStatusEnabled: true,
  initialized: false,
  threadStates: {},
  rolloutOffsets: {}
} as const;

export const CODEX_APP_PATH = "/Applications/ChatGPT.app/Contents/Resources/codex";
export const CODEX_BUNDLE_ID = "com.openai.codex";
export const CATALOG_REFRESH_MS = 15_000;
export const DOUBLE_TAP_MS = 500;
export const ACTIVATION_WAIT_MS = 175;
export const HOOK_DIRECTORY_NAME = "codex-status-actions";
export const HOOK_HELPER_NAME = "hook-forwarder.sh";
export const HOOK_SOCKET_NAME = "status.sock";
export const MAX_HOOK_PAYLOAD_BYTES = 4_096;

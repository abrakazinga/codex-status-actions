const PLUGIN_UUID = "com.abrakazinga.codex-status-actions";
export const STATUS_ACTION_UUID = `${PLUGIN_UUID}.status`;
export const USAGE_ACTION_UUID = `${PLUGIN_UUID}.usage`;
export const PLUGIN_VERSION = "0.2.0";

export const DEFAULT_ENHANCED_STATUS_ENABLED = true;

export const CODEX_APP_PATH = "/Applications/ChatGPT.app/Contents/Resources/codex";
export const CATALOG_REFRESH_MS = 15_000;
export const DEFAULT_USAGE_REFRESH_SECONDS = 300;
export const USAGE_CLOCK_TICK_MS = 60_000;
export const DOUBLE_TAP_MS = 500;
export const WORKING_ANIMATION_FRAMES = 30;
export const WORKING_ANIMATION_MS = 3_000;
export const HOOK_DIRECTORY_NAME = "codex-status-actions";
export const HOOK_HELPER_NAME = "hook-forwarder.sh";
export const HOOK_SOCKET_NAME = "status.sock";
export const MAX_HOOK_PAYLOAD_BYTES = 4_096;

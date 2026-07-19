const PLUGIN_UUID = "com.alxbra.codex-status-actions";
export const STATUS_ACTION_UUID = `${PLUGIN_UUID}.status`;
export const USAGE_ACTION_UUID = `${PLUGIN_UUID}.usage`;
export const DICTATION_ACTION_UUID = `${PLUGIN_UUID}.dictation`;
export const PLUGIN_VERSION = "0.3.0";

export const DEFAULT_ENHANCED_STATUS_ENABLED = true;

export const CODEX_APP_PATH = "/Applications/ChatGPT.app/Contents/Resources/codex";
export const CATALOG_REFRESH_MS = 1_000;
export const CATALOG_THREAD_LIMIT = 50;
export const CATALOG_FAILURE_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000] as const;
export const DEFAULT_USAGE_REFRESH_SECONDS = 300;
export const USAGE_CLOCK_TICK_MS = 60_000;
export const DOUBLE_TAP_MS = 500;
export const WORKING_ANIMATION_FRAMES = 30;
export const WORKING_ANIMATION_MS = 3_000;
export const DICTATION_PULSE_FRAMES = 10;
export const DICTATION_PULSE_MS = 1_000;
export const HOOK_DIRECTORY_NAME = "codex-status-actions";
export const HOOK_HELPER_NAME = "hook-forwarder.sh";
export const HOOK_SOCKET_NAME = "status.sock";
export const MAX_HOOK_PAYLOAD_BYTES = 4_096;

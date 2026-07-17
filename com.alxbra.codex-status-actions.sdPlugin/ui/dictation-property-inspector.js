let settings = { mode: "hold" };
let shortcut;
let isRecordingShortcut = false;

function connectElgatoStreamDeckSocket(port, uuid, registerEvent, info, rawActionInfo) {
  propertyInspectorHost.connect(port, uuid, registerEvent, info, rawActionInfo, {
    initialize: initializeSettings,
    onOpen: () => propertyInspectorHost.send({ type: "snapshot" }),
    onPayload: receive
  });
}
void connectElgatoStreamDeckSocket;

function initializeSettings(actionInfo) {
  settings = normalizeSettings(actionInfo.payload && actionInfo.payload.settings);
  renderSettings();
}

function normalizeSettings(value) {
  return { mode: value && value.mode === "toggle" ? "toggle" : "hold" };
}

function receive(payload) {
  if (payload.type === "dictation-snapshot") renderSnapshot(payload);
  if (payload.type === "error") propertyInspectorHost.showToast(payload.message, true);
  if (payload.type === "diagnostics") void propertyInspectorHost.copyDiagnostics(payload.text);
}

function renderSnapshot(snapshot) {
  propertyInspectorHost.applyTheme(snapshot.theme);
  settings = normalizeSettings(snapshot.settings);
  shortcut = snapshot.health.shortcut;
  renderSettings();
  renderShortcut();
  setHealth("codex", snapshot.health.availability);
  setHealth("shortcut", snapshot.health.settingsReady ? (shortcut ? "configured" : "missing") : "loading");
  setHealth("permission", snapshot.health.permission);
  setHealth("state", snapshot.health.state);
  const message = document.querySelector("#dictation-message");
  message.textContent = snapshot.health.lastError || "";
  message.classList.toggle("hidden", !snapshot.health.lastError);
  document.querySelector("#version").textContent = `v${snapshot.version}`;
}

function renderSettings() {
  document.querySelector("#dictation-mode").value = settings.mode;
}

function renderShortcut(recording = false) {
  isRecordingShortcut = recording;
  const recorder = document.querySelector("#shortcut-recorder");
  recorder.classList.toggle("recording", recording);
  recorder.querySelector("kbd").textContent = recording
    ? "Press shortcut…"
    : shortcut
      ? shortcutLabel(shortcut)
      : "Not set";
  document.querySelector("#clear-shortcut").disabled = !shortcut;
}

function shortcutLabel(binding) {
  const symbols = { command: "⌘", control: "⌃", option: "⌥", shift: "⇧" };
  return `${binding.modifiers.map((modifier) => symbols[modifier]).join("")}${binding.key}`;
}

function shortcutFromEvent(event) {
  const key = physicalKey(event.code) || event.key.toUpperCase();
  if (!/^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|20))$/.test(key)) return undefined;
  const modifiers = [];
  if (event.ctrlKey) modifiers.push("control");
  if (event.altKey) modifiers.push("option");
  if (event.shiftKey) modifiers.push("shift");
  if (event.metaKey) modifiers.push("command");
  if (/^[A-Z0-9]$/.test(key) && modifiers.length === 0) return undefined;
  return { key, modifiers };
}

function physicalKey(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F(?:[1-9]|1[0-9]|20)$/.test(code)) return code;
  return undefined;
}

function setHealth(id, value) {
  const output = document.querySelector(`#dictation-${id}`);
  output.textContent = value.toUpperCase();
  output.className = ["missing", "denied", "error"].includes(value)
    ? "bad"
    : ["unchecked", "activating", "loading"].includes(value)
      ? "warn"
      : "";
}

document.querySelector("#dictation-mode").addEventListener("change", (event) => {
  settings = { mode: event.target.value === "toggle" ? "toggle" : "hold" };
  propertyInspectorHost.persist(settings);
});
document.querySelector("#shortcut-recorder").addEventListener("click", () => {
  renderShortcut(true);
  document.querySelector("#shortcut-recorder").focus();
});
document.querySelector("#shortcut-recorder").addEventListener("blur", () => renderShortcut());
document.querySelector("#shortcut-recorder").addEventListener("keydown", (event) => {
  if (!isRecordingShortcut) return;
  event.preventDefault();
  if (event.key === "Escape") {
    renderShortcut();
    return;
  }
  const next = shortcutFromEvent(event);
  if (!next) {
    propertyInspectorHost.showToast("USE A-Z, 0-9, OR F1-F20", true);
    return;
  }
  shortcut = next;
  renderShortcut();
  propertyInspectorHost.send({ type: "set-shortcut", binding: next });
});
document.querySelector("#clear-shortcut").addEventListener("click", () => {
  shortcut = undefined;
  renderShortcut();
  propertyInspectorHost.send({ type: "set-shortcut", binding: null });
});
document
  .querySelector("#open-privacy")
  .addEventListener("click", () => propertyInspectorHost.send({ type: "open-privacy-settings" }));
document
  .querySelector("#copy-diagnostics")
  .addEventListener("click", () => propertyInspectorHost.send({ type: "copy-diagnostics" }));

function connectElgatoStreamDeckSocket(port, uuid, registerEvent, info, rawActionInfo) {
  propertyInspectorHost.connect(port, uuid, registerEvent, info, rawActionInfo, {
    onOpen: () => propertyInspectorHost.send({ type: "refresh" }),
    onPayload: receive
  });
}
void connectElgatoStreamDeckSocket;

function receive(payload) {
  if (payload.type === "snapshot") renderSnapshot(payload);
  if (payload.type === "error") propertyInspectorHost.showToast(payload.message, true);
  if (payload.type === "diagnostics") void propertyInspectorHost.copyDiagnostics(payload.text);
}

function renderSnapshot(snapshot) {
  propertyInspectorHost.applyTheme(snapshot.theme);
  document.querySelector("#enhanced-status").value = snapshot.settings.enhancedStatusEnabled
    ? "enabled"
    : "disabled";
  document.querySelector("#codex-home").value = snapshot.settings.codexHome || "";
  document.querySelector("#version").textContent = `v${snapshot.version}`;
  document.querySelector("#restart-notice").classList.toggle("hidden", !snapshot.health.restartRequired);
  setHealth("binary", snapshot.health.codexBinary);
  setHealth("catalog", snapshot.health.catalog);
  setHealth("rollout", snapshot.health.rolloutWatcher);
  setHealth("hooks", snapshot.health.hooks);
  setHealth("navigation", snapshot.health.navigation);
  const trusted = snapshot.health.hooks === "trusted";
  document.querySelector("#trust-hooks").disabled = trusted || !snapshot.settings.enhancedStatusEnabled;
  document.querySelector("#trust-hooks").textContent = trusted
    ? "Status hooks trusted"
    : "Trust local status hooks";
  document.querySelector("#reinstall-hooks").disabled = !snapshot.settings.enhancedStatusEnabled;
}

function setHealth(id, value) {
  const output = document.querySelector(`#health-${id}`);
  output.textContent = value.replaceAll("-", " ").toUpperCase();
  output.className = ["missing", "disconnected", "error"].includes(value)
    ? "bad"
    : ["checking", "connecting", "starting", "untrusted", "modified", "unchecked", "disabled"].includes(value)
      ? "warn"
      : "";
}

document.querySelector("#enhanced-status").addEventListener("change", (event) => {
  propertyInspectorHost.send({ type: "set-enhanced-status", enabled: event.target.value === "enabled" });
});
document
  .querySelector("#trust-hooks")
  .addEventListener("click", () => propertyInspectorHost.send({ type: "trust-hooks" }));
document
  .querySelector("#reinstall-hooks")
  .addEventListener("click", () => propertyInspectorHost.send({ type: "reinstall-hooks" }));
document
  .querySelector("#copy-diagnostics")
  .addEventListener("click", () => propertyInspectorHost.send({ type: "copy-diagnostics" }));
propertyInspectorHost.bindCodexHome();

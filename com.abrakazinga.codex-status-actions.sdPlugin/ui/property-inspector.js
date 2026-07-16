let socket;
let actionInfo;
let toastTimer;

function connectElgatoStreamDeckSocket(port, uuid, registerEvent, info, rawActionInfo) {
  actionInfo = JSON.parse(rawActionInfo);
  socket = new WebSocket(`ws://127.0.0.1:${port}`);
  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ event: registerEvent, uuid }));
    send({ type: "refresh" });
  });
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.event !== "sendToPropertyInspector") return;
    receive(message.payload);
  });
}

function send(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(
    JSON.stringify({
      action: actionInfo.action,
      event: "sendToPlugin",
      context: actionInfo.context,
      payload
    })
  );
}

function receive(payload) {
  if (payload.type === "snapshot") renderSnapshot(payload);
  if (payload.type === "error") showToast(payload.message, true);
  if (payload.type === "diagnostics") copyText(payload.text);
}

function renderSnapshot(snapshot) {
  document.querySelector("#enhanced-status").checked = snapshot.settings.enhancedStatusEnabled;
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
    ? "3 STATUS HOOKS TRUSTED"
    : "TRUST 3 LOCAL STATUS HOOKS";
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

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("SAFE DIAGNOSTICS COPIED");
  } catch {
    showToast("CLIPBOARD ACCESS FAILED", true);
  }
}

function showToast(message, error = false) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.style.background = error ? "var(--red)" : "var(--paper)";
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2200);
}

document.querySelector("#enhanced-status").addEventListener("change", (event) => {
  send({ type: "set-enhanced-status", enabled: event.target.checked });
});
document.querySelector("#trust-hooks").addEventListener("click", () => send({ type: "trust-hooks" }));
document.querySelector("#reinstall-hooks").addEventListener("click", () => send({ type: "reinstall-hooks" }));
document
  .querySelector("#copy-diagnostics")
  .addEventListener("click", () => send({ type: "copy-diagnostics" }));
document.querySelector("#apply-home").addEventListener("click", () => {
  send({ type: "set-codex-home", path: document.querySelector("#codex-home").value.trim() });
});
document
  .querySelector("#reset-home")
  .addEventListener("click", () => send({ type: "set-codex-home", path: "" }));

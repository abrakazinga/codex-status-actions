let socket;
let actionInfo;
let propertyInspectorContext;
let toastTimer;
let settings = defaults();

function connectElgatoStreamDeckSocket(port, uuid, registerEvent, info, rawActionInfo) {
  void info;
  actionInfo = JSON.parse(rawActionInfo);
  propertyInspectorContext = uuid;
  settings = normalizeSettings(actionInfo.payload && actionInfo.payload.settings);
  renderSettings();
  socket = new WebSocket(`ws://127.0.0.1:${port}`);
  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ event: registerEvent, uuid }));
    send({ type: "snapshot" });
  });
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.event !== "sendToPropertyInspector") return;
    receive(message.payload);
  });
}
void connectElgatoStreamDeckSocket;

function defaults() {
  return {
    mode: "single",
    metric: "remaining",
    window: "five-hour",
    showResetTime: false,
    refreshSeconds: 300
  };
}

function normalizeSettings(value) {
  const fallback = defaults();
  if (!value || typeof value !== "object") return fallback;
  return {
    mode: ["single", "double"].includes(value.mode) ? value.mode : fallback.mode,
    metric: ["remaining", "used", "pace"].includes(value.metric) ? value.metric : fallback.metric,
    window: ["five-hour", "week"].includes(value.window) ? value.window : fallback.window,
    showResetTime: typeof value.showResetTime === "boolean" ? value.showResetTime : fallback.showResetTime,
    refreshSeconds: [60, 300, 900, 1800].includes(Number(value.refreshSeconds))
      ? Number(value.refreshSeconds)
      : fallback.refreshSeconds
  };
}

function send(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(
    JSON.stringify({
      action: actionInfo.action,
      event: "sendToPlugin",
      context: propertyInspectorContext,
      payload
    })
  );
}

function persist() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(
    JSON.stringify({
      action: actionInfo.action,
      event: "setSettings",
      context: propertyInspectorContext,
      payload: settings
    })
  );
}

function receive(payload) {
  if (payload.type === "usage-snapshot") renderSnapshot(payload);
  if (payload.type === "usage-refresh-result") {
    showToast(payload.ok ? "USAGE REFRESHED" : "REFRESH FAILED", !payload.ok);
  }
  if (payload.type === "error") showToast(payload.message, true);
  if (payload.type === "diagnostics") copyText(payload.text);
}

function renderSnapshot(snapshot) {
  applyTheme(snapshot.theme);
  settings = normalizeSettings(snapshot.settings);
  renderSettings();
  document.querySelector("#codex-home").value = snapshot.codexHome || "";
  document.querySelector("#version").textContent = `v${snapshot.version}`;
  const health = snapshot.health;
  setHealth("status", health.status);
  document.querySelector("#usage-refreshed").textContent = health.lastSuccessfulRefresh
    ? new Date(health.lastSuccessfulRefresh).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "NEVER";
  document.querySelector("#usage-windows").textContent = health.availableWindows.length
    ? health.availableWindows.map((window) => (window === "five-hour" ? "5H" : "WK")).join(" · ")
    : "NONE";
  document.querySelector("#refresh-now").disabled = health.fetching;
  document.querySelector("#refresh-now").textContent = health.fetching ? "Refreshing…" : "Refresh now";
  const message = document.querySelector("#usage-message");
  message.textContent = health.message || "";
  message.classList.toggle("hidden", !health.message);
}

function renderSettings() {
  document.querySelector("#usage-mode").value = settings.mode;
  document.querySelector("#usage-metric").value = settings.metric;
  document.querySelector("#usage-window").value = settings.window;
  document.querySelector("#show-reset-time").checked = settings.showResetTime;
  document.querySelector("#refresh-seconds").value = String(settings.refreshSeconds);
  document.querySelector("#window-row").classList.toggle("hidden", settings.mode === "double");
  document.querySelector("#reset-row").classList.toggle("hidden", settings.metric === "pace");
  document.querySelector("#pace-description").classList.toggle("hidden", settings.metric !== "pace");
}

function setHealth(id, value) {
  const output = document.querySelector(`#usage-${id}`);
  output.textContent = value.toUpperCase();
  output.className = value === "error" ? "bad" : value === "loading" || value === "stale" ? "warn" : "";
}

function applyTheme(theme) {
  if (!theme) return;
  const root = document.documentElement.style;
  root.setProperty("--neutral", theme.neutral);
  root.setProperty("--green", theme.green);
  root.setProperty("--blue", theme.blue);
  root.setProperty("--orange", theme.orange);
  root.setProperty("--red", theme.red);
  root.setProperty("--on-accent", theme.glyph);
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
  toast.style.background = error ? "var(--red)" : "var(--toast-background)";
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2200);
}

function update(key, value) {
  settings = { ...settings, [key]: value };
  renderSettings();
  persist();
}

document
  .querySelector("#usage-mode")
  .addEventListener("change", (event) => update("mode", event.target.value));
document
  .querySelector("#usage-metric")
  .addEventListener("change", (event) => update("metric", event.target.value));
document
  .querySelector("#usage-window")
  .addEventListener("change", (event) => update("window", event.target.value));
document
  .querySelector("#show-reset-time")
  .addEventListener("change", (event) => update("showResetTime", event.target.checked));
document
  .querySelector("#refresh-seconds")
  .addEventListener("change", (event) => update("refreshSeconds", Number(event.target.value)));
document.querySelector("#refresh-now").addEventListener("click", () => send({ type: "refresh" }));
document
  .querySelector("#copy-diagnostics")
  .addEventListener("click", () => send({ type: "copy-diagnostics" }));
document.querySelector("#apply-home").addEventListener("click", () => {
  send({ type: "set-codex-home", path: document.querySelector("#codex-home").value.trim() });
});
document
  .querySelector("#reset-home")
  .addEventListener("click", () => send({ type: "set-codex-home", path: "" }));

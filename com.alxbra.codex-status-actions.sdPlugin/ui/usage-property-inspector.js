let settings = defaults();

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

function receive(payload) {
  if (payload.type === "usage-snapshot") renderSnapshot(payload);
  if (payload.type === "usage-refresh-result") {
    propertyInspectorHost.showToast(payload.ok ? "USAGE REFRESHED" : "REFRESH FAILED", !payload.ok);
  }
  if (payload.type === "error") propertyInspectorHost.showToast(payload.message, true);
  if (payload.type === "diagnostics") void propertyInspectorHost.copyDiagnostics(payload.text);
}

function renderSnapshot(snapshot) {
  propertyInspectorHost.applyTheme(snapshot.theme);
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

function update(key, value) {
  settings = { ...settings, [key]: value };
  renderSettings();
  propertyInspectorHost.persist(settings);
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
document
  .querySelector("#refresh-now")
  .addEventListener("click", () => propertyInspectorHost.send({ type: "refresh" }));
document
  .querySelector("#copy-diagnostics")
  .addEventListener("click", () => propertyInspectorHost.send({ type: "copy-diagnostics" }));
propertyInspectorHost.bindCodexHome();

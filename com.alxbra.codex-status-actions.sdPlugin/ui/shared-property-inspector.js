globalThis.propertyInspectorHost = (() => {
  let socket;
  let action;
  let context;
  let toastTimer;
  let pendingEvents = [];

  function connect(port, uuid, registerEvent, info, rawActionInfo, handlers) {
    void info;
    const actionInfo = JSON.parse(rawActionInfo);
    action = actionInfo.action;
    context = uuid;
    pendingEvents = [];
    handlers.initialize?.(actionInfo);
    socket = new WebSocket(`ws://127.0.0.1:${port}`);
    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ event: registerEvent, uuid }));
      for (const message of pendingEvents) socket.send(message);
      pendingEvents = [];
      handlers.onOpen();
    });
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.event === "sendToPropertyInspector") handlers.onPayload(message.payload);
    });
  }

  function send(payload) {
    sendEvent("sendToPlugin", payload);
  }

  function persist(settings) {
    sendEvent("setSettings", settings);
  }

  function sendEvent(event, payload) {
    if (!socket) return;
    const message = JSON.stringify({ action, event, context, payload });
    if (socket.readyState === WebSocket.CONNECTING) pendingEvents.push(message);
    else if (socket.readyState === WebSocket.OPEN) socket.send(message);
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

  function bindCodexHome() {
    document.querySelector("#apply-home").addEventListener("click", () => {
      send({ type: "set-codex-home", path: document.querySelector("#codex-home").value.trim() });
    });
    document
      .querySelector("#reset-home")
      .addEventListener("click", () => send({ type: "set-codex-home", path: "" }));
  }

  async function copyDiagnostics(text) {
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

  return { applyTheme, bindCodexHome, connect, copyDiagnostics, persist, send, showToast };
})();

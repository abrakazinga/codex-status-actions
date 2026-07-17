import { readFile } from "node:fs/promises";
import vm from "node:vm";

import { describe, expect, it } from "vitest";

describe("property inspector", () => {
  it("uses an accurate local-data disclaimer without a branded header", async () => {
    const html = await readFile(
      new URL("../com.alxbra.codex-status-actions.sdPlugin/ui/property-inspector.html", import.meta.url),
      "utf8"
    );
    const text = html.replace(/\s+/g, " ");

    expect(text).toContain("This unofficial integration reads local Codex task metadata and status files.");
    expect(text).toContain("Task content is not sent off-device or logged by the plugin.");
    expect(html).not.toContain('id="appearance-mode"');
    expect(html).toContain('<select id="enhanced-status"');
    expect(html).toMatch(/<select\b(?=[^>]*\bid="assignment-mode")(?=[^>]*\bdisabled\b)[^>]*>/);
    expect(html).toContain("<h2>General</h2>");
    expect(html).toContain("<h2>Status detection</h2>");
    expect(text).toContain("Optional, but recommended. Uses local hooks to show when Codex needs approval.");
    expect(html).toMatch(
      /<div\b(?=[^>]*\bid="restart-notice")(?=[^>]*\brole="status")(?=[^>]*\baria-live="polite")[^>]*>/
    );
    expect(html).not.toContain("Trust 3");
    expect(html).not.toContain("<h2>SETTINGS</h2>");
    expect(html).toContain("Advanced");
    expect(html.indexOf("Advanced")).toBeLessThan(html.indexOf("Debug"));
    expect(html.indexOf("Debug")).toBeLessThan(html.indexOf('id="health-binary"'));
    expect(html).not.toContain("CODEX STATUS");
    expect(html).not.toContain('class="masthead"');
    expect(html).toContain('<span id="version">v—</span>');
  });

  it("disables Stream Deck's standard title field", async () => {
    const manifest = JSON.parse(
      await readFile(
        new URL("../com.alxbra.codex-status-actions.sdPlugin/manifest.json", import.meta.url),
        "utf8"
      )
    ) as { UUID: string; Actions: Array<{ UUID: string; UserTitleEnabled?: boolean }> };

    expect(manifest.Actions).toHaveLength(3);
    expect(manifest.Actions.every((action) => action.UserTitleEnabled === false)).toBe(true);
    expect(manifest.UUID).toBe("com.alxbra.codex-status-actions");
    expect(manifest.Actions.map(({ UUID }) => UUID)).toEqual([
      "com.alxbra.codex-status-actions.status",
      "com.alxbra.codex-status-actions.usage",
      "com.alxbra.codex-status-actions.dictation"
    ]);
  });

  it("provides compact Usage controls and conditional Pace copy", async () => {
    const html = await readFile(
      new URL(
        "../com.alxbra.codex-status-actions.sdPlugin/ui/usage-property-inspector.html",
        import.meta.url
      ),
      "utf8"
    );
    const text = html.replace(/\s+/g, " ");
    expect(html).toContain('<select id="usage-mode"');
    expect(html).toContain('<select id="usage-metric"');
    expect(html).toContain('<select id="usage-window"');
    expect(html).toContain('id="show-reset-time" type="checkbox"');
    expect(html).toContain("<summary>Advanced</summary>");
    expect(html).toContain("<summary>Debug</summary>");
    expect(text).toContain("does not read or log prompts, messages, or authentication tokens");
    expect(html).toContain('<span id="version">v—</span>');
  });

  it("provides compact Dictation setup without claiming audio access", async () => {
    const html = await readFile(
      new URL(
        "../com.alxbra.codex-status-actions.sdPlugin/ui/dictation-property-inspector.html",
        import.meta.url
      ),
      "utf8"
    );
    const text = html.replace(/\s+/g, " ");
    expect(html).toContain('<select id="dictation-mode"');
    expect(html).toContain('id="shortcut-recorder"');
    expect(html).toContain("<h2>Shortcut setup</h2>");
    expect(html).toContain("<summary>Debug</summary>");
    expect(text).toContain("the plugin never records audio or reads dictated text");
    expect(text).toContain("Toggle dictation hotkey");
    expect(text).toContain("Hold-to-dictate hotkey is not used");
    expect(html).not.toContain("<h2>Mac permission</h2>");
    expect(html.indexOf('id="open-privacy"')).toBeGreaterThan(html.indexOf("<summary>Debug</summary>"));
    expect(html).toContain('<span id="version">v—</span>');
  });

  it("sends commands with the property-inspector context", async () => {
    const source = await inspectorSource("property-inspector.js");
    const sockets: FakeWebSocket[] = [];
    const sandbox = {
      WebSocket: class extends FakeWebSocket {
        constructor() {
          super();
          sockets.push(this);
        }
      },
      document: {
        documentElement: { dataset: {} },
        querySelector: () => ({ addEventListener: () => undefined })
      },
      navigator: {},
      setTimeout,
      clearTimeout
    };
    vm.runInNewContext(source, sandbox);

    const connect = (
      sandbox as typeof sandbox & {
        connectElgatoStreamDeckSocket: (
          port: number,
          context: string,
          registerEvent: string,
          info: string,
          actionInfo: string
        ) => void;
      }
    ).connectElgatoStreamDeckSocket;
    connect(
      1234,
      "property-inspector-id",
      "registerPropertyInspector",
      "{}",
      '{"action":"status","context":"wrong-context"}'
    );
    sockets[0]?.open();

    expect(sockets[0]?.messages).toContain(
      JSON.stringify({ event: "registerPropertyInspector", uuid: "property-inspector-id" })
    );
    expect(sockets[0]?.messages).toContain(
      JSON.stringify({
        action: "status",
        event: "sendToPlugin",
        context: "property-inspector-id",
        payload: { type: "refresh" }
      })
    );
  });

  it("persists Usage settings with the property-inspector context", async () => {
    const source = await inspectorSource("usage-property-inspector.js");
    const sockets: FakeWebSocket[] = [];
    const elements = new Map<string, FakeElement>();
    const element = (selector: string): FakeElement => {
      const existing = elements.get(selector);
      if (existing) return existing;
      const created = new FakeElement();
      elements.set(selector, created);
      return created;
    };
    const sandbox = {
      WebSocket: class extends FakeWebSocket {
        constructor() {
          super();
          sockets.push(this);
        }
      },
      document: {
        documentElement: { style: { setProperty: () => undefined } },
        querySelector: element
      },
      navigator: {},
      setTimeout,
      clearTimeout
    };
    vm.runInNewContext(source, sandbox);

    const connect = (
      sandbox as typeof sandbox & {
        connectElgatoStreamDeckSocket: (
          port: number,
          context: string,
          registerEvent: string,
          info: string,
          actionInfo: string
        ) => void;
      }
    ).connectElgatoStreamDeckSocket;
    connect(
      1234,
      "property-inspector-id",
      "registerPropertyInspector",
      "{}",
      '{"action":"usage","context":"wrong-context","payload":{"settings":{}}}'
    );
    element("#usage-window").dispatch("change", { target: { value: "week" } });
    expect(sockets[0]?.messages).toEqual([]);
    sockets[0]?.open();

    expect(sockets[0]?.messages).toContain(
      JSON.stringify({
        action: "usage",
        event: "setSettings",
        context: "property-inspector-id",
        payload: {
          mode: "single",
          metric: "remaining",
          window: "week",
          showResetTime: false,
          refreshSeconds: 300
        }
      })
    );
  });

  it("persists Dictation mode and sends the global shortcut through the plugin", async () => {
    const source = await inspectorSource("dictation-property-inspector.js");
    const sockets: FakeWebSocket[] = [];
    const elements = new Map<string, FakeElement>();
    const element = (selector: string): FakeElement => {
      const existing = elements.get(selector);
      if (existing) return existing;
      const created = new FakeElement();
      elements.set(selector, created);
      return created;
    };
    const sandbox = {
      WebSocket: class extends FakeWebSocket {
        constructor() {
          super();
          sockets.push(this);
        }
      },
      document: {
        documentElement: { style: { setProperty: () => undefined } },
        querySelector: element
      },
      navigator: {},
      setTimeout,
      clearTimeout
    };
    vm.runInNewContext(source, sandbox);
    const connect = (
      sandbox as typeof sandbox & {
        connectElgatoStreamDeckSocket: (
          port: number,
          context: string,
          registerEvent: string,
          info: string,
          actionInfo: string
        ) => void;
      }
    ).connectElgatoStreamDeckSocket;
    connect(
      1234,
      "property-inspector-id",
      "registerPropertyInspector",
      "{}",
      '{"action":"dictation","payload":{"settings":{}}}'
    );
    sockets[0]?.open();

    element("#dictation-mode").dispatch("change", { target: { value: "toggle" } });
    element("#shortcut-recorder").dispatch("click", {});
    element("#shortcut-recorder").dispatch("keydown", {
      key: "∂",
      code: "KeyD",
      ctrlKey: true,
      altKey: true,
      shiftKey: false,
      metaKey: false,
      preventDefault: () => undefined
    });

    expect(sockets[0]?.messages).toContain(
      JSON.stringify({
        action: "dictation",
        event: "setSettings",
        context: "property-inspector-id",
        payload: { mode: "toggle" }
      })
    );
    expect(sockets[0]?.messages).toContain(
      JSON.stringify({
        action: "dictation",
        event: "sendToPlugin",
        context: "property-inspector-id",
        payload: {
          type: "set-shortcut",
          binding: { key: "D", modifiers: ["control", "option"] }
        }
      })
    );
  });
});

async function inspectorSource(fileName: string): Promise<string> {
  const directory = "../com.alxbra.codex-status-actions.sdPlugin/ui/";
  return (
    await Promise.all(
      ["shared-property-inspector.js", fileName].map((file) =>
        readFile(new URL(`${directory}${file}`, import.meta.url), "utf8")
      )
    )
  ).join("\n");
}

class FakeElement {
  value = "";
  checked = false;
  disabled = false;
  textContent = "";
  readonly classList = { add: () => undefined, toggle: () => undefined };
  readonly style = { background: "" };
  private readonly listeners = new Map<string, (event: unknown) => void>();
  private readonly children = new Map<string, FakeElement>();

  addEventListener(event: string, listener: (event: unknown) => void): void {
    this.listeners.set(event, listener);
  }

  dispatch(event: string, payload: unknown): void {
    this.listeners.get(event)?.(payload);
  }

  focus(): void {}

  querySelector(selector: string): FakeElement {
    const existing = this.children.get(selector);
    if (existing) return existing;
    const child = new FakeElement();
    this.children.set(selector, child);
    return child;
  }
}

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  readyState = FakeWebSocket.CONNECTING;
  readonly messages: string[] = [];
  private readonly listeners = new Map<string, (event: { data: string }) => void>();

  addEventListener(event: string, listener: (event: { data: string }) => void): void {
    this.listeners.set(event, listener);
  }

  send(message: string): void {
    this.messages.push(message);
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.listeners.get("open")?.({ data: "" });
  }
}

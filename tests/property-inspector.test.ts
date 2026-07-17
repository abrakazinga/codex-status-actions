import { readFile } from "node:fs/promises";
import vm from "node:vm";

import { describe, expect, it } from "vitest";

describe("property inspector", () => {
  it("uses an accurate local-data disclaimer without a branded header", async () => {
    const html = await readFile(
      new URL("../com.abrakazinga.codex-status-actions.sdPlugin/ui/property-inspector.html", import.meta.url),
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
    expect(html).not.toContain("Trust 3");
    expect(html).not.toContain("<h2>SETTINGS</h2>");
    expect(html).toContain("Advanced");
    expect(html.indexOf("Advanced")).toBeLessThan(html.indexOf("Debug"));
    expect(html.indexOf("Debug")).toBeLessThan(html.indexOf('id="health-binary"'));
    expect(html).not.toContain("CODEX STATUS");
    expect(html).not.toContain('class="masthead"');
  });

  it("disables Stream Deck's standard title field", async () => {
    const manifest = JSON.parse(
      await readFile(
        new URL("../com.abrakazinga.codex-status-actions.sdPlugin/manifest.json", import.meta.url),
        "utf8"
      )
    ) as { Actions: Array<{ UserTitleEnabled?: boolean }> };

    expect(manifest.Actions).toHaveLength(2);
    expect(manifest.Actions.every((action) => action.UserTitleEnabled === false)).toBe(true);
  });

  it("provides compact Usage controls and conditional Pace copy", async () => {
    const html = await readFile(
      new URL(
        "../com.abrakazinga.codex-status-actions.sdPlugin/ui/usage-property-inspector.html",
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
  });

  it("sends commands with the property-inspector context", async () => {
    const source = await readFile(
      new URL("../com.abrakazinga.codex-status-actions.sdPlugin/ui/property-inspector.js", import.meta.url),
      "utf8"
    );
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
    const source = await readFile(
      new URL(
        "../com.abrakazinga.codex-status-actions.sdPlugin/ui/usage-property-inspector.js",
        import.meta.url
      ),
      "utf8"
    );
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
    sockets[0]?.open();
    element("#usage-window").dispatch("change", { target: { value: "week" } });

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
});

class FakeElement {
  value = "";
  checked = false;
  readonly classList = { add: () => undefined, toggle: () => undefined };
  readonly style = { background: "" };
  private readonly listeners = new Map<string, (event: unknown) => void>();

  addEventListener(event: string, listener: (event: unknown) => void): void {
    this.listeners.set(event, listener);
  }

  dispatch(event: string, payload: unknown): void {
    this.listeners.get(event)?.(payload);
  }
}

class FakeWebSocket {
  static readonly OPEN = 1;
  readonly readyState = FakeWebSocket.OPEN;
  readonly messages: string[] = [];
  private readonly listeners = new Map<string, (event: { data: string }) => void>();

  addEventListener(event: string, listener: (event: { data: string }) => void): void {
    this.listeners.set(event, listener);
  }

  send(message: string): void {
    this.messages.push(message);
  }

  open(): void {
    this.listeners.get("open")?.({ data: "" });
  }
}

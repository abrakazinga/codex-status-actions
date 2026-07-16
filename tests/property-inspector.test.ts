import { readFile } from "node:fs/promises";
import vm from "node:vm";

import { describe, expect, it } from "vitest";

describe("property inspector", () => {
  it("sends commands with the registered action context", async () => {
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
      document: { querySelector: () => ({ addEventListener: () => undefined }) },
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
      '{"action":"status","context":"correct-context"}'
    );
    sockets[0]?.open();

    expect(sockets[0]?.messages).toContain(
      JSON.stringify({ event: "registerPropertyInspector", uuid: "property-inspector-id" })
    );
    expect(sockets[0]?.messages).toContain(
      JSON.stringify({
        action: "status",
        event: "sendToPlugin",
        context: "correct-context",
        payload: { type: "refresh" }
      })
    );
  });
});

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

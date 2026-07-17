import { describe, expect, it } from "vitest";

import { GlobalSettingsStore } from "../src/settings";
import type { GlobalSettings } from "../src/types";
import { deferred } from "./helpers";

describe("global settings store", () => {
  it("persists concurrent snapshots in invocation order", async () => {
    const first = deferred<undefined>();
    const writes: GlobalSettings[] = [];
    const store = new GlobalSettingsStore({}, async (settings) => {
      writes.push(settings);
      if (writes.length === 1) await first.promise;
    });

    store.update((settings) => ({ ...settings, codexHome: "/first" }));
    const firstPersist = store.persist();
    store.update((settings) => ({ ...settings, codexHome: "/second" }));
    const secondPersist = store.persist();
    await Promise.resolve();

    expect(writes.map(({ codexHome }) => codexHome)).toEqual(["/first"]);
    first.resolve(undefined);
    await Promise.all([firstPersist, secondPersist]);
    expect(writes.map(({ codexHome }) => codexHome)).toEqual(["/first", "/second"]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { CatalogPoller } from "../src/status/catalog-poller";
import { deferred } from "./helpers";

const INTERVAL_MS = 1_000;
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000];

afterEach(() => vi.useRealTimers());

describe("catalog poller", () => {
  it("polls every second only while active and refreshes immediately on activation", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
    const poller = new CatalogPoller(refresh, INTERVAL_MS, BACKOFF_MS);

    poller.start();
    expect(refresh).not.toHaveBeenCalled();

    poller.setActive(true);
    await settle();
    expect(refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(2);

    poller.setActive(false);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);
    expect(refresh).toHaveBeenCalledTimes(2);

    poller.setActive(true);
    await settle();
    expect(refresh).toHaveBeenCalledTimes(3);
    poller.stop();
  });

  it("coalesces overlapping requests into one trailing refresh", async () => {
    vi.useFakeTimers();
    const first = deferred<boolean>();
    const refresh = vi
      .fn<() => Promise<boolean>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(true);
    const poller = new CatalogPoller(refresh, INTERVAL_MS, BACKOFF_MS);

    poller.setActive(true);
    poller.start();
    expect(refresh).toHaveBeenCalledTimes(1);

    poller.request();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);
    expect(refresh).toHaveBeenCalledTimes(1);

    first.resolve(true);
    await settle();
    expect(refresh).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it("runs an event-requested refresh without waiting for the next interval", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
    const poller = new CatalogPoller(refresh, INTERVAL_MS, BACKOFF_MS);

    poller.setActive(true);
    poller.start();
    await settle();
    poller.request();
    await settle();

    expect(refresh).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it("backs off after failures and resets after a successful refresh", async () => {
    vi.useFakeTimers();
    const refresh = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const poller = new CatalogPoller(refresh, INTERVAL_MS, BACKOFF_MS);

    poller.setActive(true);
    poller.start();
    await settle();
    expect(refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(4);
    poller.stop();
  });

  it("waits for a stopped generation before resuming without overlap", async () => {
    vi.useFakeTimers();
    const first = deferred<boolean>();
    const refresh = vi
      .fn<() => Promise<boolean>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue(true);
    const poller = new CatalogPoller(refresh, INTERVAL_MS, BACKOFF_MS);

    poller.setActive(true);
    poller.start();
    poller.stop();
    poller.start();
    await settle();
    expect(refresh).toHaveBeenCalledTimes(1);

    first.resolve(true);
    await settle();
    expect(refresh).toHaveBeenCalledTimes(2);
    poller.stop();
  });
});

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

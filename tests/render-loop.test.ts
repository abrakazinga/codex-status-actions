import { describe, expect, it, vi } from "vitest";

import { RenderLoop } from "../src/render-loop";
import { deferred } from "./helpers";

describe("render loop", () => {
  it("coalesces requests made during a render", async () => {
    const first = deferred<undefined>();
    const render = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(undefined);
    const loop = new RenderLoop(render, vi.fn());

    loop.request();
    loop.request();
    await Promise.resolve();
    expect(render).toHaveBeenCalledTimes(1);

    first.resolve(undefined);
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(2));
  });

  it("reports failures and accepts a later request", async () => {
    const onError = vi.fn();
    const render = vi.fn().mockRejectedValueOnce(new Error("failed")).mockResolvedValue(undefined);
    const loop = new RenderLoop(render, onError);

    loop.request();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    loop.request();
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(2));
  });
});

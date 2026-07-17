import { afterEach, describe, expect, it, vi } from "vitest";

import { WORKING_ANIMATION_FRAMES, WORKING_ANIMATION_MS } from "../src/constants";
import { WorkingAnimation } from "../src/working-animation";

afterEach(() => vi.useRealTimers());

describe("status tile animation", () => {
  it("ticks only while working and resets when stopped", () => {
    vi.useFakeTimers();
    expect(WORKING_ANIMATION_MS).toBe(3_000);
    expect(WORKING_ANIMATION_MS / WORKING_ANIMATION_FRAMES).toBe(100);
    const requestRender = vi.fn();
    const animation = new WorkingAnimation(requestRender);

    animation.setActive(true);
    vi.advanceTimersByTime(WORKING_ANIMATION_MS / WORKING_ANIMATION_FRAMES);
    expect(animation.frame).toBe(1);
    expect(requestRender).toHaveBeenCalledOnce();

    animation.setActive(false);
    expect(animation.frame).toBe(0);
    vi.advanceTimersByTime(WORKING_ANIMATION_MS);
    expect(requestRender).toHaveBeenCalledOnce();
  });
});

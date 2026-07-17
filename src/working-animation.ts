import { WORKING_ANIMATION_FRAMES, WORKING_ANIMATION_MS } from "./constants";

export class WorkingAnimation {
  private timer: NodeJS.Timeout | undefined;
  private currentFrame = 0;

  constructor(private readonly onFrame: () => void) {}

  get frame(): number {
    return this.currentFrame;
  }

  setActive(isActive: boolean): void {
    if (isActive && !this.timer) {
      this.timer = setInterval(() => {
        this.currentFrame = (this.currentFrame + 1) % WORKING_ANIMATION_FRAMES;
        this.onFrame();
      }, WORKING_ANIMATION_MS / WORKING_ANIMATION_FRAMES);
    } else if (!isActive && this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      this.currentFrame = 0;
    }
  }
}

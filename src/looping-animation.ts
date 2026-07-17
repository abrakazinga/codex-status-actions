export class LoopingAnimation {
  private timer: NodeJS.Timeout | undefined;
  private currentFrame = 0;

  constructor(
    private readonly onFrame: () => void,
    private readonly frameCount: number,
    private readonly durationMs: number
  ) {}

  get frame(): number {
    return this.currentFrame;
  }

  setActive(isActive: boolean): void {
    if (isActive && !this.timer) {
      this.timer = setInterval(() => {
        this.currentFrame = (this.currentFrame + 1) % this.frameCount;
        this.onFrame();
      }, this.durationMs / this.frameCount);
    } else if (!isActive && this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      this.currentFrame = 0;
    }
  }
}

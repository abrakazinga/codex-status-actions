export class RenderLoop {
  private requested = false;
  private running = false;

  constructor(
    private readonly render: () => Promise<void>,
    private readonly onError: (error: unknown) => void
  ) {}

  request(): void {
    this.requested = true;
    if (this.running) return;
    this.running = true;
    void this.drain();
  }

  private async drain(): Promise<void> {
    try {
      while (this.requested) {
        this.requested = false;
        await this.render();
      }
    } catch (error) {
      this.onError(error);
    } finally {
      this.running = false;
      if (this.requested) this.request();
    }
  }
}

export class CatalogPoller {
  private active = false;
  private started = false;
  private generation = 0;
  private timer: NodeJS.Timeout | undefined;
  private inFlight: { generation: number; promise: Promise<void> } | undefined;
  private queuedGeneration: number | undefined;
  private failureCount = 0;
  private retryAfter = 0;

  constructor(
    private readonly refresh: () => Promise<boolean>,
    private readonly intervalMs: number,
    private readonly failureBackoffMs: readonly number[]
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.generation++;
    this.schedule();
    if (this.active) void this.run(true);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.generation++;
    this.queuedGeneration = undefined;
    this.failureCount = 0;
    this.retryAfter = 0;
    this.clearTimer();
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.queuedGeneration = undefined;
    this.failureCount = 0;
    this.retryAfter = 0;
    this.schedule();
    if (this.started && active) void this.run(true);
  }

  request(): void {
    void this.run(false);
  }

  private schedule(): void {
    this.clearTimer();
    if (!this.started || !this.active) return;
    this.timer = setInterval(() => void this.run(false), this.intervalMs);
  }

  private clearTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private run(force: boolean): Promise<void> {
    const generation = this.generation;
    if (!this.started || !this.active) return Promise.resolve();
    if (this.inFlight && this.inFlight.generation !== generation) {
      const previous = this.inFlight.promise;
      this.queuedGeneration = generation;
      return previous.then(() => {
        if (!this.isQueued(generation)) return;
        this.queuedGeneration = undefined;
        return this.run(force);
      });
    }
    if (!force && Date.now() < this.retryAfter) return Promise.resolve();
    if (this.inFlight?.generation === generation) {
      this.queuedGeneration = generation;
      return this.inFlight.promise;
    }

    const promise = this.drain(generation);
    const inFlight = { generation, promise };
    this.inFlight = inFlight;
    void promise.finally(() => {
      if (this.inFlight === inFlight) this.inFlight = undefined;
    });
    return promise;
  }

  private async drain(generation: number): Promise<void> {
    do {
      this.queuedGeneration = undefined;
      let succeeded = false;
      try {
        succeeded = await this.refresh();
      } catch {
        succeeded = false;
      }
      if (!this.started || !this.active || generation !== this.generation) return;
      if (!succeeded) {
        const delay =
          this.failureBackoffMs[Math.min(this.failureCount, this.failureBackoffMs.length - 1)] ??
          this.intervalMs;
        this.failureCount++;
        this.retryAfter = Date.now() + delay;
        return;
      }
      this.failureCount = 0;
      this.retryAfter = 0;
    } while (this.isQueued(generation));
  }

  private isQueued(generation: number): boolean {
    return this.queuedGeneration === generation;
  }
}

export async function waitFor(predicate: () => boolean, message: string): Promise<void> {
  const timeout = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() > timeout) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

export function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

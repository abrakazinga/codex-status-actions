export async function waitFor(predicate: () => boolean, message: string): Promise<void> {
  const timeout = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() > timeout) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

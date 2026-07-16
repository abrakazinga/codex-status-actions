import type { ThreadRecord } from "./types";

export function reconcileThreadOrder(current: readonly string[], threads: Iterable<ThreadRecord>): string[] {
  const eligible = [...threads]
    .filter((thread) => !thread.ephemeral && !thread.parentThreadId)
    .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id));
  const available = new Set(eligible.map(({ id }) => id));
  const retained = [...new Set(current)].filter((id) => available.delete(id));
  return [...retained, ...eligible.flatMap(({ id }) => (available.has(id) ? [id] : []))];
}

export function promoteThreadOnNewTurn(
  current: readonly string[],
  threadId: string,
  startedAt: number,
  previousChangedAt: number
): string[] {
  if (startedAt <= previousChangedAt) return [...current];
  return current[0] === threadId ? [...current] : [threadId, ...current.filter((id) => id !== threadId)];
}

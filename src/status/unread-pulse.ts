import { UNREAD_PULSE_WINDOW_MS } from "../constants";
import type { ThreadStatusSnapshot } from "../types";

export function shouldPulseUnread(snapshot: ThreadStatusSnapshot, now: number): boolean {
  const age = now - snapshot.changedAt;
  return snapshot.state === "unread" && age >= 0 && age < UNREAD_PULSE_WINDOW_MS;
}

import { countdown } from "./daily";

// Session hours in UTC minutes from midnight. 13:30-20:00 UTC is 09:30-16:00 ET —
// the real thing, which is the joke.
// ponytail: one constant. If the window measurably suppresses daily submissions
// (it is the research instrument), widen it here — 00:00-24:00 makes it always open.
export const OPEN_MIN = 13 * 60 + 30;
export const CLOSE_MIN = 20 * 60;

// Every calendar day is a session day. Real exchanges close weekends; that would
// halve the dataset, so it is deliberately not modelled.
export type Phase = "pre-open" | "open" | "closed";

export interface Session {
  phase: Phase;
  label: string;
  /** what the clock is counting toward */
  next: string;
  msToNext: number;
  clock: string;
}

const utcMinutes = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes();
const msUntilMinute = (d: Date, minute: number, dayOffset = 0) => {
  const t = Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + dayOffset,
    Math.floor(minute / 60), minute % 60, 0, 0,
  );
  return t - d.getTime();
};

export function session(now = new Date()): Session {
  const m = utcMinutes(now);
  if (m < OPEN_MIN) {
    const ms = msUntilMinute(now, OPEN_MIN);
    return { phase: "pre-open", label: "Pre-open", next: "opening bell", msToNext: ms, clock: countdown(ms) };
  }
  if (m < CLOSE_MIN) {
    const ms = msUntilMinute(now, CLOSE_MIN);
    return { phase: "open", label: "Session open", next: "closing bell", msToNext: ms, clock: countdown(ms) };
  }
  const ms = msUntilMinute(now, OPEN_MIN, 1);
  return { phase: "closed", label: "Closed", next: "next open", msToNext: ms, clock: countdown(ms) };
}

export const isOpen = (now = new Date()) => session(now).phase === "open";

export const SESSION_HOURS = "13:30-20:00 UTC";

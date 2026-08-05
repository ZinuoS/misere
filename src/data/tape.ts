import { isUsable, type TapeRow } from "./tapelib";

const KEY = "md:tape";

/**
 * One network hit per session at most: the localStorage copy short-circuits when
 * it still covers a usable date. Any failure returns null and the marquee runs
 * fake-only — the live segment never blocks or breaks the banner.
 */
export async function fetchTape(): Promise<TapeRow | null> {
  try {
    const cached = JSON.parse(localStorage.getItem(KEY) || "null") as TapeRow | null;
    if (isUsable(cached)) return cached;
  } catch { /* fall through to the network */ }
  try {
    const r = await fetch("/api/tape", { signal: AbortSignal.timeout(6000) });
    if (!r.ok || r.status === 204) return null;
    const row = (await r.json()) as TapeRow | null;
    if (!isUsable(row)) return null;
    localStorage.setItem(KEY, JSON.stringify(row));
    return row;
  } catch {
    return null;
  }
}

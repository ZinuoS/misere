import { describe, it, expect } from "vitest";
import { CLOSE_MIN, isOpen, OPEN_MIN, session } from "../data/market";

const at = (iso: string) => session(new Date(iso));

describe("exchange session", () => {
  it("opens and closes on the UTC bell", () => {
    expect(at("2026-08-05T13:29:59Z").phase).toBe("pre-open");
    expect(at("2026-08-05T13:30:00Z").phase).toBe("open");
    expect(at("2026-08-05T19:59:59Z").phase).toBe("open");
    expect(at("2026-08-05T20:00:00Z").phase).toBe("closed");
  });

  it("counts down to the right bell", () => {
    expect(at("2026-08-05T13:00:00Z").clock).toBe("00:30:00"); // to the open
    expect(at("2026-08-05T19:00:00Z").clock).toBe("01:00:00"); // to the close
    expect(at("2026-08-05T20:30:00Z").clock).toBe("17:00:00"); // to tomorrow's open
  });

  it("rolls the closed countdown across midnight, never negative", () => {
    for (const h of [0, 6, 13, 14, 20, 23]) {
      const s = at(`2026-08-05T${String(h).padStart(2, "0")}:15:00Z`);
      expect(s.msToNext).toBeGreaterThan(0);
    }
  });

  it("isOpen agrees with the phase, and the window is the real one", () => {
    expect(isOpen(new Date("2026-08-05T15:00:00Z"))).toBe(true);
    expect(isOpen(new Date("2026-08-05T02:00:00Z"))).toBe(false);
    expect(OPEN_MIN).toBe(810);  // 13:30 UTC = 09:30 ET
    expect(CLOSE_MIN).toBe(1200); // 20:00 UTC = 16:00 ET
  });
});

describe("backend configuration diagnostics", () => {
  it("names the reason it is not live, and reports the host when it is", async () => {
    const { configProblem, isLive, backend, describeError } = await import("../data/supabase");
    if (!isLive) {
      expect(configProblem()).toMatch(/missing|no VITE_SUPABASE|placeholder|not a valid|not https/);
      expect(backend()).toBe("local fallback");
      expect(describeError(new Error("boom"))).toContain("not connected");
    } else {
      expect(configProblem()).toBe("");
      expect(backend()).toContain("supabase.co");
      expect(describeError({ code: "42501", message: "row-level security" })).toContain("42501");
    }
  });
});

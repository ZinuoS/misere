import { describe, it, expect } from "vitest";

// Reproduces the production failure: a key carrying non-ISO-8859-1 characters
// makes fetch throw "String contains non ISO-8859-1 code point" when it is set
// as a header. Mirrors the cleaning rules in data/supabase.ts.
const cleanKey = (v: string) =>
  v.trim().replace(/^['"]|['"]$/g, "").replace(/[^A-Za-z0-9._-]/g, "");
const cleanUrl = (v: string) =>
  v.trim().replace(/^['"]|['"]$/g, "").replace(/[^\x21-\x7E]/g, "");

const headerSafe = (v: string) => {
  try {
    new Headers({ apikey: v });
    return true;
  } catch {
    return false;
  }
};

const GOOD = "eyJhbGciOiJIUzI1NiJ9.eyJyZWYiOiJ3Zmx6enNqbiJ9.IrR9c8BOl8tc9FWz5dNK-w_Ov8kgo30";

describe("env value cleaning", () => {
  it("characters above U+00FF break Headers before cleaning, and survive it after", () => {
    const breaks = [
      GOOD + "\u200B",              // zero-width space
      "\uFEFF" + GOOD,              // BOM
      "\u201C" + GOOD + "\u201D",  // smart quotes
      GOOD + "\u2014",              // em dash
    ];
    for (const p of breaks) {
      expect(headerSafe(p)).toBe(false);      // the deployed failure
      expect(cleanKey(p)).toBe(GOOD);         // the fix
      expect(headerSafe(cleanKey(p))).toBe(true);
    }
  });

  it("a non-breaking space is header-legal but still a wrong key, so it is stripped too", () => {
    const nbsp = GOOD + "\u00A0";
    expect(headerSafe(nbsp)).toBe(true); // passes the header check, would 401 instead
    expect(nbsp).not.toBe(GOOD);
    expect(cleanKey(nbsp)).toBe(GOOD);
  });

  it("leaves a clean key untouched and strips shell quoting and newlines", () => {
    expect(cleanKey(GOOD)).toBe(GOOD);
    expect(cleanKey(`"${GOOD}"\n`)).toBe(GOOD);
    expect(cleanKey(`  ${GOOD}  `)).toBe(GOOD);
  });

  it("cleans the URL the same way and keeps it parseable", () => {
    const u = "https://wflzzsjnihtwpxrhixux.supabase.co";
    expect(cleanUrl(`${u}​\n`)).toBe(u);
    expect(() => new URL(cleanUrl(`"${u}"`))).not.toThrow();
  });
});

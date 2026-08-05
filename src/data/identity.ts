export interface Identity {
  handle: string;
  /** PBKDF2 of the password — the same value the server stores. Never the password. */
  secretHash: string;
}

const KEY = "md:id";

export const getIdentity = (): Identity | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Identity> & { secret?: string };
    // pre-password identities stored a random device secret; they cannot log in
    // on another device, so drop them and let the player claim with a password.
    return v.handle && v.secretHash ? { handle: v.handle, secretHash: v.secretHash } : null;
  } catch {
    return null;
  }
};

export const saveIdentity = (id: Identity) => localStorage.setItem(KEY, JSON.stringify(id));
export const clearIdentity = () => localStorage.removeItem(KEY);

// crypto.subtle exists only in a secure context (https, or localhost). Over plain
// http on a LAN address it is undefined, which used to surface as a misleading
// "registry unreachable". Detect it and say the real thing.
export const cryptoAvailable = () =>
  typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined";

export class InsecureContextError extends Error {
  constructor() {
    super("secure context required");
    this.name = "InsecureContextError";
  }
}

const hex = (b: ArrayBuffer) =>
  Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

/**
 * Password -> stored hash. PBKDF2-SHA256, 150k iterations, salted per handle so
 * two players with the same password get different hashes and one rainbow table
 * cannot cover the table. WebCrypto only, no dependency.
 * ponytail: no server-side rate limit on the login RPC — the cost here is the
 * only brute-force barrier. Add pg rate limiting if the game ever matters.
 */
export async function derive(handle: string, password: string): Promise<string> {
  if (!cryptoAvailable()) throw new InsecureContextError();
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode(`misere-desk:${handle.toLowerCase()}`),
      iterations: 150_000,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return hex(bits);
}

// iOS keyboards add autocapitalised letters, smart punctuation and trailing
// spaces. Strip anything the handle grammar does not allow before validating.
export const sanitizeHandle = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16);

export const HANDLE_RE = /^[a-zA-Z0-9_-]{3,16}$/;
export const MIN_PASSWORD = 6;

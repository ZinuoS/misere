export interface Identity {
  handle: string;
  secret: string; // 32-byte hex device secret; hash goes to the server
}

const KEY = "md:id";

export const getIdentity = (): Identity | null => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Identity) : null;
  } catch {
    return null;
  }
};

export const saveIdentity = (id: Identity) =>
  localStorage.setItem(KEY, JSON.stringify(id));

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

export const newSecret = (): string => {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
};

export async function sha256Hex(s: string): Promise<string> {
  if (!cryptoAvailable()) throw new InsecureContextError();
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, "0")).join("");
}

// iOS keyboards add autocapitalised letters, smart punctuation and trailing
// spaces. Strip anything the handle grammar does not allow before validating.
export const sanitizeHandle = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16);

export const HANDLE_RE = /^[a-zA-Z0-9_-]{3,16}$/;

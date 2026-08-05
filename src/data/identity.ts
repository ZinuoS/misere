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

export const newSecret = (): string => {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
};

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, "0")).join("");
}

export const HANDLE_RE = /^[a-zA-Z0-9_-]{3,16}$/;

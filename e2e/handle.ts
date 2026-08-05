// Handles are permanent in the real registry, so e2e cannot reuse a fixed name.
// "zz" prefix keeps throwaway rows identifiable for cleanup (see README).
export const uniqueHandle = (tag = "e2e") =>
  `zz${tag}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`.slice(0, 16);

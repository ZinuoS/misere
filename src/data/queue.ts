import type { GameReport } from "./supabase";

// Offline submission queue in IndexedDB (survives storage pressure better than
// localStorage and is the spec'd store). One object store, auto-increment keys.
const DB = "misere-desk";
const STORE = "queue";

const open = (): Promise<IDBDatabase> =>
  new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { autoIncrement: true });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

const tx = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await open();
  return new Promise<T>((res, rej) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  }).finally(() => db.close());
};

export const enqueue = (r: GameReport) => tx("readwrite", (s) => s.add(r));
export const queued = () => tx<GameReport[]>("readonly", (s) => s.getAll());
export const clearQueue = () => tx("readwrite", (s) => s.clear());
export const queueSize = async () => (await queued()).length;

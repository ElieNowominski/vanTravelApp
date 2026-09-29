import type { StateStorage } from "zustand/middleware";

/**
 * Stockage clé-valeur IndexedDB pour le brouillon zustand.
 * localStorage plafonne vers 5 Mo par origine : un circuit avec ses tracés GPS
 * ne tient pas, et l'écriture échoue en silence. IndexedDB n'a pas cette limite.
 * Repli sur localStorage quand IndexedDB manque (test, navigation privée stricte).
 */
const DB_NAME = "vantravel-kv";
const STORE = "kv";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponible"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      let result: T | undefined;
      if (req) {
        req.onsuccess = () => {
          result = req.result;
        };
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function localGet(name: string): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(name);
  } catch {
    return null;
  }
}

function localSet(name: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(name, value);
  } catch {
    /* quota dépassé : on aura au moins l'état en mémoire. */
  }
}

export const idbStorage: StateStorage = {
  getItem: async (name) => {
    try {
      const value = await withStore<string>("readonly", (store) => store.get(name));
      if (typeof value === "string") return value;
    } catch {
      /* repli ci-dessous */
    }
    return localGet(name);
  },
  setItem: async (name, value) => {
    try {
      await withStore("readwrite", (store) => {
        store.put(value, name);
      });
    } catch (error) {
      console.warn("IndexedDB indisponible, repli localStorage :", error);
      localSet(name, value);
    }
  },
  removeItem: async (name) => {
    try {
      await withStore("readwrite", (store) => {
        store.delete(name);
      });
    } catch {
      /* rien à supprimer */
    }
    try {
      if (typeof localStorage !== "undefined") localStorage.removeItem(name);
    } catch {
      /* ignoré */
    }
  },
};

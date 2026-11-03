import type { Poi } from "@/lib/poi";

/**
 * Cache des points d'intérêt dans IndexedDB (lot 5), à part du brouillon : `cells`, les cases de la grille
 * déjà demandées pour la carte (clé `i:j`), et `corridors`, le couloir mis en cache au figeage (clé : id du
 * voyage). Sans IndexedDB (tests, navigation privée stricte), tout se lit vide et rien ne s'écrit.
 */
const DB_NAME = "vantravel-poi";
const CELLS = "cells";
const CORRIDORS = "corridors";
/** Au-delà, les cases les plus anciennes partent (quelques Mo au plus). */
const MAX_CELLS = 400;

export type CachedCell = { at: number; pois: Poi[] };

export type CachedCorridor = {
  /** `CorridorPlan.signature` des tracés au moment de la mise en cache. */
  signature: string;
  at: number;
  /** Groupes de cases (`CorridorPlan.groups`) déjà interrogés : une coupure de réseau garde ce qui est fait. */
  groups: number[];
  pois: Poi[];
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponible"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      for (const name of [CELLS, CORRIDORS]) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB"));
  });
}

async function run<T>(storeName: string, mode: IDBTransactionMode, body: (store: IDBObjectStore) => T): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const result = body(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getCells(keys: string[]): Promise<Map<string, CachedCell>> {
  const out = new Map<string, CachedCell>();
  try {
    await run(CELLS, "readonly", (store) => {
      for (const key of keys) {
        const req = store.get(key);
        req.onsuccess = () => {
          if (req.result) out.set(key, req.result as CachedCell);
        };
      }
    });
  } catch {
    /* pas de cache : tout est à demander */
  }
  return out;
}

export async function putCells(cells: Map<string, Poi[]>, at: number): Promise<void> {
  try {
    await run(CELLS, "readwrite", (store) => {
      for (const [key, pois] of cells) store.put({ at, pois } satisfies CachedCell, key);
    });
    await pruneCells();
  } catch {
    /* cache indisponible : la carte affiche quand même la réponse */
  }
}

async function pruneCells(): Promise<void> {
  const ages: Array<[IDBValidKey, number]> = [];
  await run(CELLS, "readonly", (store) => {
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      ages.push([cursor.key, (cursor.value as CachedCell).at]);
      cursor.continue();
    };
  });
  if (ages.length <= MAX_CELLS) return;
  ages.sort((a, b) => a[1] - b[1]);
  await run(CELLS, "readwrite", (store) => {
    for (const [key] of ages.slice(0, ages.length - MAX_CELLS)) store.delete(key);
  });
}

export async function getCorridor(tripId: string): Promise<CachedCorridor | null> {
  try {
    let value: CachedCorridor | null = null;
    await run(CORRIDORS, "readonly", (store) => {
      const req = store.get(tripId);
      req.onsuccess = () => {
        value = (req.result as CachedCorridor | undefined) ?? null;
      };
    });
    return value;
  } catch {
    return null;
  }
}

export async function putCorridor(tripId: string, corridor: CachedCorridor): Promise<void> {
  try {
    await run(CORRIDORS, "readwrite", (store) => {
      store.put(corridor, tripId);
    });
  } catch {
    /* cache indisponible */
  }
}

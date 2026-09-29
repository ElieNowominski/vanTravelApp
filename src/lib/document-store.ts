/**
 * Contenu des documents (photos, PDF) dans IndexedDB, à part du brouillon JSON :
 * un blob par `TripDocument.id`. Le brouillon ne porte que les métadonnées.
 */
const DB_NAME = "vantravel-docs";
const STORE = "blobs";

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

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
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

export async function putDocumentBlob(id: string, blob: Blob): Promise<void> {
  await withStore("readwrite", (store) => {
    store.put(blob, id);
  });
}

export async function getDocumentBlob(id: string): Promise<Blob | null> {
  try {
    const value = await withStore<Blob>("readonly", (store) => store.get(id));
    return value instanceof Blob ? value : null;
  } catch {
    return null;
  }
}

export async function deleteDocumentBlob(id: string): Promise<void> {
  try {
    await withStore("readwrite", (store) => {
      store.delete(id);
    });
  } catch {
    /* rien à supprimer */
  }
}

export async function listDocumentIds(): Promise<string[]> {
  try {
    const keys = await withStore<IDBValidKey[]>("readonly", (store) => store.getAllKeys());
    return (keys ?? []).map(String);
  } catch {
    return [];
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Lecture impossible"));
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

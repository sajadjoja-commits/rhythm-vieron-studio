export const DB_NAME = "vireon-ai-db";
export const DB_VERSION = 1;
export const STORE_PROJECTS = "projects";
export const STORE_FILES = "files";

let dbPromise: Promise<IDBDatabase> | null = null;

export const resetIdbConnection = (): void => {
  dbPromise = null;
};

export const openDB = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      dbPromise = null;
      reject(err);
      return;
    }

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES);
      }
    };

    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => {
        dbPromise = null;
      };
      db.onversionchange = () => {
        dbPromise = null;
        try {
          db.close();
        } catch {
          // ignore close errors
        }
      };
      resolve(db);
    };

    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };

    req.onblocked = () => {
      dbPromise = null;
    };
  });

  return dbPromise;
};

const getTransaction = async (
  store: string,
  mode: IDBTransactionMode
): Promise<IDBObjectStore> => {
  let db = await openDB();
  try {
    return db.transaction(store, mode).objectStore(store);
  } catch {
    dbPromise = null;
    db = await openDB();
    return db.transaction(store, mode).objectStore(store);
  }
};

export const idbPut = async (store: string, key: any, val: any): Promise<void> => {
  const s = await getTransaction(store, "readwrite");
  return new Promise<void>((res, rej) => {
    const r = key === undefined ? s.put(val) : s.put(val, key);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
};

export const idbGet = async <T,>(store: string, key: any): Promise<T | undefined> => {
  const s = await getTransaction(store, "readonly");
  return new Promise<T | undefined>((res, rej) => {
    const r = s.get(key);
    r.onsuccess = () => res(r.result as T);
    r.onerror = () => rej(r.error);
  });
};

export const idbAll = async <T,>(store: string): Promise<T[]> => {
  const s = await getTransaction(store, "readonly");
  return new Promise<T[]>((res, rej) => {
    const r = s.getAll();
    r.onsuccess = () => res(r.result as T[]);
    r.onerror = () => rej(r.error);
  });
};

export const idbDel = async (store: string, key: any): Promise<void> => {
  const s = await getTransaction(store, "readwrite");
  return new Promise<void>((res, rej) => {
    const r = s.delete(key);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
};

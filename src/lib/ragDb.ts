import { RagFile } from '../types';

// Simple IndexedDB helper for robust RAG persistence
export const openRagIDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("osone_rag_db", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("files")) {
        db.createObjectStore("files", { keyPath: "id" });
      }
    };
  });
};

export const saveRagFileToDB = async (file: RagFile): Promise<void> => {
  const db = await openRagIDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("files", "readwrite");
    const store = transaction.objectStore("files");
    const request = store.put(file);
    request.onsuccess = () => resolve();
    request.onerror = () => {
      console.error("IndexedDB Save Error:", request.error);
      reject(request.error);
    };
  });
};

export const deleteRagFileFromDB = async (id: string): Promise<void> => {
  const db = await openRagIDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("files", "readwrite");
    const store = transaction.objectStore("files");
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => {
      console.error("IndexedDB Delete Error:", request.error);
      reject(request.error);
    };
  });
};

export const clearRagDB = async (): Promise<void> => {
  const db = await openRagIDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("files", "readwrite");
    const store = transaction.objectStore("files");
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => {
      console.error("IndexedDB Clear Error:", request.error);
      reject(request.error);
    };
  });
};

export const loadRagFilesFromDB = (): Promise<RagFile[]> => {
  return new Promise((resolve) => {
    openRagIDB().then(db => {
      const transaction = db.transaction("files", "readonly");
      const store = transaction.objectStore("files");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    }).catch(err => {
      console.error("IndexedDB Load Error:", err);
      resolve([]);
    });
  });
};
